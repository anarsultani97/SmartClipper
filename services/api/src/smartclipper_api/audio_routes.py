"""Owned, immutable audio uploads; the editor explicitly applies their IDs."""

import json
import math
import subprocess
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select, update

from .auth import require_user
from .database import AudioAsset, Short, User
from .pipeline import short_folder
from .rendering import MUSIC, music_bed
from .schemas import AudioAssetView
from .worker import run_media

CurrentUser = Annotated[User, Depends(require_user)]


def asset_path(settings, short, asset_id):
    return short_folder(settings, short) / "audio" / asset_id / "audio.wav"


def validate_audio_assets(db, short, edits, music):
    if music == "custom" and not edits.music_asset_id:
        raise HTTPException(422, "Upload and choose a music file first.")
    for kind, identifier in (("music", edits.music_asset_id), ("voice", edits.voice_asset_id)):
        if not identifier:
            continue
        asset = db.get(AudioAsset, identifier)
        if (
            not asset
            or asset.short_id != short.id
            or asset.kind != kind
            or asset.duration_seconds <= 0
        ):
            raise HTTPException(422, "This audio belongs to another short or is unavailable.")
        if kind == "music" and music == "custom" and edits.music_offset >= asset.duration_seconds:
            raise HTTPException(422, "Music offset must be inside your uploaded track.")


def install_audio_routes(app, settings, sessions, get_short):
    @app.get("/api/v1/shorts/{short_id}/audio", response_model=list[AudioAssetView])
    def list_audio(short_id: str, user: CurrentUser):
        with sessions() as db:
            get_short(db, short_id, user)
            return db.scalars(
                select(AudioAsset).where(
                    AudioAsset.short_id == short_id, AudioAsset.duration_seconds > 0
                )
            ).all()

    @app.post("/api/v1/shorts/{short_id}/audio", status_code=201, response_model=AudioAssetView)
    async def upload_audio(
        short_id: str,
        request: Request,
        user: CurrentUser,
        kind: Literal["music", "voice"],
        filename: str = "My audio",
    ):
        name = filename.replace("\\", "/").split("/")[-1][:255] or "My audio"
        length = request.headers.get("content-length")
        if length:
            try:
                if not 0 < int(length) <= settings.max_audio_bytes:
                    raise HTTPException(413, "Choose an audio file up to 20 MB.")
            except ValueError as exc:
                raise HTTPException(400, "Invalid content length.") from exc
        with sessions() as db:
            short = get_short(db, short_id, user)
            db.execute(update(Short).where(Short.id == short.id).values(revision=Short.revision))
            count = db.scalar(
                select(func.count(AudioAsset.id)).where(AudioAsset.short_id == short_id)
            )
            if count >= 16:
                raise HTTPException(429, "This short has reached its 16 audio-take limit.")
            asset = AudioAsset(
                id=str(uuid4()), short_id=short_id, kind=kind, filename=name, duration_seconds=0
            )
            db.add(asset)
            db.commit()
        folder = asset_path(settings, short, asset.id).parent
        raw, normalized = folder / "upload.audio", folder / "audio.wav"
        try:
            folder.mkdir(parents=True)
            size = 0
            with raw.open("wb") as target:
                async for chunk in request.stream():
                    size += len(chunk)
                    if size > settings.max_audio_bytes:
                        raise HTTPException(413, "Choose an audio file up to 20 MB.")
                    target.write(chunk)
            if not size:
                raise HTTPException(400, "Audio is empty.")

            def normalize():
                probe = run_media(
                    [
                        settings.ffprobe_path,
                        "-v",
                        "error",
                        "-protocol_whitelist",
                        "file,pipe",
                        "-format_whitelist",
                        "wav,mp3,aac,mov,matroska,webm,ogg,flac",
                        "-show_format",
                        "-show_streams",
                        "-of",
                        "json",
                        str(raw.resolve()),
                    ],
                    timeout=20,
                )
                info = json.loads(probe.stdout)
                duration = float(info.get("format", {}).get("duration", 0))
                if not math.isfinite(duration) or duration < 0 or duration > 600:
                    raise ValueError("Audio must be between 0.1 seconds and 10 minutes.")
                if not any(s.get("codec_type") == "audio" for s in info.get("streams", [])):
                    raise ValueError("This file has no playable audio.")
                run_media(
                    [
                        settings.ffmpeg_path,
                        "-v",
                        "error",
                        "-nostdin",
                        "-y",
                        "-protocol_whitelist",
                        "file,pipe",
                        "-format_whitelist",
                        "wav,mp3,aac,mov,matroska,webm,ogg,flac",
                        "-i",
                        str(raw.resolve()),
                        "-map",
                        "0:a:0",
                        "-vn",
                        "-t",
                        "601",
                        "-ac",
                        "1",
                        "-ar",
                        "22050",
                        "-af",
                        f"loudnorm=I={-16 if kind == 'voice' else -18}:TP=-2:LRA=11",
                        "-c:a",
                        "pcm_s16le",
                        str(normalized.resolve()),
                    ],
                    timeout=120,
                )
                decoded = run_media(
                    [
                        settings.ffprobe_path,
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration",
                        "-of",
                        "json",
                        str(normalized.resolve()),
                    ],
                    timeout=20,
                )
                # Browser MediaRecorder WebM often has no duration header. Validate
                # the decoded, bounded audio instead of rejecting a valid recording.
                actual = float(json.loads(decoded.stdout)["format"]["duration"])
                if not math.isfinite(actual) or not 0.1 <= actual <= 600:
                    raise ValueError("Audio must be between 0.1 seconds and 10 minutes.")
                return actual

            duration = await run_in_threadpool(normalize)
            with sessions() as db:
                # Recheck ownership/status after the upload; guest claims use project ownership.
                get_short(db, short_id, user)
                stored = db.get(AudioAsset, asset.id)
                stored.duration_seconds = duration
                db.commit()
                return stored
        except BaseException as exc:
            with sessions() as db:
                db.execute(delete(AudioAsset).where(AudioAsset.id == asset.id))
                db.commit()
            normalized.unlink(missing_ok=True)
            if isinstance(exc, (ValueError, subprocess.SubprocessError)):
                raise HTTPException(
                    422,
                    "Audio could not be decoded. Use MP3, WAV, M4A "
                    "or a voice recording up to 10 minutes.",
                ) from exc
            raise
        finally:
            raw.unlink(missing_ok=True)

    @app.get("/api/v1/shorts/{short_id}/audio/{asset_id}")
    def audio_media(short_id: str, asset_id: str, user: CurrentUser):
        with sessions() as db:
            short = get_short(db, short_id, user)
            asset = db.get(AudioAsset, asset_id)
            if not asset or asset.short_id != short.id or asset.duration_seconds <= 0:
                raise HTTPException(404, "Audio not found.")
            path = asset_path(settings, short, asset.id)
            if not path.is_file():
                raise HTTPException(404, "Audio is unavailable.")
            return FileResponse(path, media_type="audio/wav")

    @app.get("/api/v1/music/{track_id}/preview")
    def music_preview(track_id: str, user: CurrentUser):
        if track_id not in MUSIC:
            raise HTTPException(404, "Track not found.")
        folder = settings.data_dir / "music-library"
        folder.mkdir(exist_ok=True)
        path = folder / f"{track_id}.wav"
        from filelock import FileLock

        with FileLock(str(path) + ".lock"):
            if not path.is_file():
                temporary = folder / f"{track_id}.tmp.wav"
                music_bed(temporary, track_id, 60)
                temporary.replace(path)
        return FileResponse(path, media_type="audio/wav")
