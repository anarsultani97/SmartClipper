"""All short, job, caption and thumbnail assets inherit their project's owner."""

import io
import secrets
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from .auth import require_account, require_user
from .caption_styles import caption_groups
from .database import Job, Short, User
from .pipeline import short_folder
from .rendering import MUSIC
from .schemas import (
    AudioEdits,
    CaptionEdit,
    GenerateOptions,
    JobView,
    ShortEdit,
    ShortView,
    TranscriptUpload,
    VideoEdits,
)
from .transcription import caption_text, parse_srt

CurrentUser = Annotated[User, Depends(require_user)]
AccountUser = Annotated[User, Depends(require_account)]


def short_view(short):
    names = (
        "id",
        "project_id",
        "job_id",
        "title",
        "summary",
        "start_ms",
        "end_ms",
        "thumbnails",
        "thumbnail",
        "thumbnail_style",
        "thumbnail_text",
        "subtitles",
        "subtitle_language",
        "caption_style",
        "caption_position",
        "music",
        "revision",
        "export_revision",
        "quality_note",
        "video_edits",
        "audio_edits",
    )
    return {
        **{name: getattr(short, name) for name in names},
        "english_available": short.english_transcript is not None,
        "transcript": short.transcript,
    }


def job_view(job):
    return jsonable_encoder(
        {
            **{
                name: getattr(job, name)
                for name in ("id", "project_id", "kind", "status", "stage", "error", "progress")
            },
            "options": {key: value for key, value in job.options.items() if key != "captions"},
        }
    )


def install_short_routes(app, settings, sessions, get_project):
    def commit_job(db):
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                409, "A job was just queued in another tab. Wait for it to finish."
            ) from exc

    def get_short(db, short_id, user):
        short = db.get(Short, short_id)
        if not short:
            raise HTTPException(404, "Short not found.")
        get_project(db, short.project_id, user)
        return short

    def busy(db, project_id):
        return db.scalar(
            select(Job).where(
                Job.project_id == project_id, Job.status.in_(["queued", "processing"])
            )
        )

    @app.put("/api/v1/projects/{project_id}/transcript")
    def transcript(project_id: str, payload: TranscriptUpload, user: CurrentUser):
        with sessions() as db:
            project = get_project(db, project_id, user)
            if project.status != "ready" or busy(db, project_id):
                raise HTTPException(409, "Wait until video processing is complete.")
            try:
                segments = parse_srt(payload.srt, project.duration_seconds)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
            project.transcript = segments
            project.transcription_profile = {"source": "uploaded"}
            project.detected_language = project.transcript_language = payload.language
            db.commit()
            return {"segments": len(segments), "language": payload.language}

    @app.post("/api/v1/projects/{project_id}/generate", status_code=202, response_model=JobView)
    def generate(project_id: str, options: GenerateOptions, user: CurrentUser):
        with sessions() as db:
            project = get_project(db, project_id, user)
            if project.status != "ready":
                raise HTTPException(409, "Wait for video preparation to finish.")
            if busy(db, project_id):
                raise HTTPException(409, "A job is already running for this video.")
            from .database import Project

            active = db.scalars(
                select(Job)
                .join(Project)
                .where(Project.owner_id == user.id, Job.status.in_(["queued", "processing"]))
            ).all()
            if len(active) >= settings.max_generation_jobs:
                raise HTTPException(429, "Your processing queue is full. Wait for a job to finish.")
            job = Job(
                id=str(uuid4()),
                project_id=project_id,
                kind="generate",
                options={
                    **options.model_dump(),
                    "source_start_ms": project.start_ms,
                    "source_end_ms": project.end_ms,
                    "source_edits": project.video_edits,
                    "source_revision": project.revision,
                },
            )
            db.add(job)
            commit_job(db)
            return job_view(job)

    @app.get("/api/v1/projects/{project_id}/jobs", response_model=list[JobView])
    def jobs(project_id: str, user: CurrentUser):
        with sessions() as db:
            get_project(db, project_id, user)
            return [
                job_view(j)
                for j in db.scalars(
                    select(Job).where(Job.project_id == project_id).order_by(Job.created_at.desc())
                ).all()
            ]

    @app.post("/api/v1/jobs/{job_id}/retry", status_code=202, response_model=JobView)
    def retry_job(job_id: str, user: CurrentUser):
        with sessions() as db:
            job = db.get(Job, job_id)
            if not job:
                raise HTTPException(404, "Job not found.")
            get_project(db, job.project_id, user)
            if job.status != "failed" or busy(db, job.project_id):
                raise HTTPException(409, "Only an idle failed job can be retried.")
            # A new immutable ID prevents partial clips/export files from masquerading as a retry.
            new = Job(
                id=str(uuid4()), project_id=job.project_id, kind=job.kind, options=job.options
            )
            db.add(new)
            commit_job(db)
            return job_view(new)

    @app.get("/api/v1/projects/{project_id}/shorts", response_model=list[ShortView])
    def shorts(project_id: str, user: CurrentUser):
        with sessions() as db:
            get_project(db, project_id, user)
            # Rows are committed only after each clip and its covers are complete.
            # Keep the newest generation with finished clips; don't mix old and new sets.
            latest = db.scalar(
                select(Short.job_id)
                .join(Job, Short.job_id == Job.id)
                .where(Short.project_id == project_id)
                .order_by(Job.created_at.desc())
                .limit(1)
            )
            return [
                short_view(s)
                for s in db.scalars(
                    select(Short)
                    .join(Job, Short.job_id == Job.id)
                    .where(Short.project_id == project_id, Short.job_id == latest)
                    .order_by(Job.created_at.desc(), Short.start_ms)
                ).all()
            ]

    @app.patch("/api/v1/shorts/{short_id}", response_model=ShortView)
    def edit_short(short_id: str, edit: ShortEdit, user: CurrentUser):
        with sessions() as db:
            short = get_short(db, short_id, user)
            from .audio_routes import validate_audio_assets

            audio = edit.audio_edits or AudioEdits.model_validate(short.audio_edits)
            validate_audio_assets(db, short, audio, edit.music)
            if edit.subtitle_language == "en" and not short.english_transcript:
                project = get_project(db, short.project_id, user)
                if project.detected_language != "en":
                    raise HTTPException(422, "Generate English captions before choosing English.")
            if edit.thumbnail == 3:
                if not (short_folder(settings, short) / "thumbnail-3.jpg").is_file():
                    raise HTTPException(422, "Upload a custom thumbnail first.")
            elif edit.thumbnail >= max(1, len(short.thumbnails)):
                raise HTTPException(422, "This thumbnail did not pass the quality check.")
            edits = edit.video_edits or VideoEdits.model_validate(short.video_edits)
            duration_ms = short.end_ms - short.start_ms
            trim_end = edits.trim_end_ms if edits.trim_end_ms is not None else duration_ms
            if not edits.trim_start_ms < trim_end <= duration_ms:
                raise HTTPException(422, "Trim must stay within the suggested short.")
            if (trim_end - edits.trim_start_ms) / 1000 / edits.speed < 0.5:
                raise HTTPException(422, "Keep at least half a second in your short.")
            if (
                audio.voice_asset_id
                and audio.voice_start >= (trim_end - edits.trim_start_ms) / 1000 / edits.speed
            ):
                raise HTTPException(422, "Start your voiceover before this short ends.")
            values = edit.model_dump(exclude={"revision", "video_edits", "audio_edits"})
            if edit.audio_edits is not None:
                values["audio_edits"] = edit.audio_edits.model_dump()
            if edit.video_edits is not None:
                values["video_edits"] = edit.video_edits.model_dump()
            changed = db.execute(
                update(Short)
                .where(Short.id == short_id, Short.revision == edit.revision)
                .values(
                    **values,
                    revision=edit.revision + 1,
                    export_revision=None,
                )
            )
            if changed.rowcount != 1:
                raise HTTPException(409, "This short changed in another tab. Reload before saving.")
            db.commit()
            db.expire_all()
            return short_view(get_short(db, short_id, user))

    @app.post("/api/v1/shorts/{short_id}/export", status_code=202, response_model=JobView)
    def queue_export(short_id: str, user: AccountUser):
        with sessions() as db:
            short = get_short(db, short_id, user)
            if busy(db, short.project_id):
                raise HTTPException(409, "Wait for the current render to finish.")
            captions = (
                short.english_transcript or short.transcript
                if short.subtitle_language == "en"
                else short.transcript
            )
            options = {
                "short_id": short.id,
                "revision": short.revision,
                "start_ms": short.start_ms,
                "end_ms": short.end_ms,
                "subtitles": bool(short.subtitles),
                "music": short.music,
                "captions": captions,
                "caption_style": short.caption_style,
                "caption_position": short.caption_position,
                "video_edits": VideoEdits.model_validate(short.video_edits).model_dump(),
                "audio_edits": AudioEdits.model_validate(short.audio_edits).model_dump(),
            }
            job = Job(id=str(uuid4()), project_id=short.project_id, kind="export", options=options)
            db.add(job)
            commit_job(db)
            return job_view(job)

    @app.get("/api/v1/shorts/{short_id}/media/{kind}")
    def short_media(short_id: str, kind: str, user: CurrentUser, job_id: str | None = None):
        if kind == "export" and user.is_guest:
            raise HTTPException(401, "Sign in to download your shorts.")
        with sessions() as db:
            short = get_short(db, short_id, user)
            folder = short_folder(settings, short)
            if kind == "clip":
                path, mime = folder / "clip.mp4", "video/mp4"
            elif kind in {"thumbnail-0", "thumbnail-1", "thumbnail-2", "thumbnail-3"}:
                path, mime = folder / f"{kind}.jpg", "image/jpeg"
            elif kind == "export" and job_id:
                job = db.get(Job, job_id)
                if (
                    not job
                    or job.project_id != short.project_id
                    or job.kind != "export"
                    or job.options.get("short_id") != short.id
                    or job.status != "ready"
                ):
                    raise HTTPException(404, "Export not found.")
                path, mime = folder / "exports" / job.id / "clip.mp4", "video/mp4"
            else:
                raise HTTPException(404, "Media not found.")
            if not path.is_file():
                raise HTTPException(404, "This media asset is unavailable.")
            return FileResponse(
                path,
                media_type=mime,
                filename="clivvy-short.mp4" if kind == "export" else None,
            )

    @app.get("/api/v1/shorts/{short_id}/captions/{language}")
    def captions(short_id: str, language: str, user: CurrentUser):
        with sessions() as db:
            short = get_short(db, short_id, user)
            if language not in {"en", "original"}:
                raise HTTPException(404, "Caption track not found.")
            segments = short.english_transcript if language == "en" else short.transcript
            if not segments and language == "en":
                project = get_project(db, short.project_id, user)
                segments = short.transcript if project.detected_language == "en" else None
            if not segments:
                raise HTTPException(404, "Generate this caption track first.")
            return Response(caption_text(segments), media_type="text/vtt")

    @app.get("/api/v1/shorts/{short_id}/caption-data/{language}")
    def caption_data(short_id: str, language: str, user: CurrentUser):
        with sessions() as db:
            short = get_short(db, short_id, user)
            if language not in {"original", "en"}:
                raise HTTPException(404, "Caption track not found.")
            segments = short.transcript if language == "original" else short.english_transcript
            if not segments and language == "en":
                project = get_project(db, short.project_id, user)
                segments = short.transcript if project.detected_language == "en" else None
            if not segments:
                raise HTTPException(404, "Generate this caption track first.")
            return {"segments": segments, "groups": caption_groups(segments)}

    @app.put("/api/v1/shorts/{short_id}/captions", response_model=ShortView)
    def edit_captions(short_id: str, edit: CaptionEdit, user: CurrentUser):
        with sessions() as db:
            short = get_short(db, short_id, user)
            original = short.transcript if edit.language == "original" else short.english_transcript
            field = "transcript" if edit.language == "original" else "english_transcript"
            if original is None and edit.language == "en":
                project = get_project(db, short.project_id, user)
                if project.detected_language == "en":
                    original, field = short.transcript, "transcript"
            if original is None:
                raise HTTPException(422, "Generate this caption track first.")
            duration = (short.end_ms - short.start_ms) / 1000
            if any(c.end > duration + 0.05 for c in edit.segments):
                raise HTTPException(422, "Captions must fit within this short.")
            segments = []
            for cue in edit.segments:
                existing = next(
                    (
                        s
                        for s in original
                        if s["start"] == cue.start and s["end"] == cue.end and s["text"] == cue.text
                    ),
                    None,
                )
                # Preserve trustworthy existing alignment, never trust client word timestamps.
                segments.append(
                    existing
                    if existing
                    else {
                        "start": cue.start,
                        "end": cue.end,
                        "text": cue.text.strip(),
                        "words": [],
                        "review": False,
                    }
                )
            changed = db.execute(
                update(Short)
                .where(Short.id == short.id, Short.revision == edit.revision)
                .values(**{field: segments}, revision=edit.revision + 1, export_revision=None)
            )
            if changed.rowcount != 1:
                raise HTTPException(409, "This short changed in another tab. Reload before saving.")
            db.commit()
            db.expire_all()
            return short_view(get_short(db, short_id, user))

    @app.put("/api/v1/shorts/{short_id}/thumbnail", response_model=ShortView)
    async def upload_thumbnail(short_id: str, request: Request, user: CurrentUser, revision: int):
        with sessions() as db:
            short = get_short(db, short_id, user)
            folder = short_folder(settings, short)
        data = bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data) > 5 * 1024 * 1024:
                raise HTTPException(413, "Choose an image under 5 MB.")
        try:
            with Image.open(io.BytesIO(data)) as image:
                if (
                    image.format not in {"JPEG", "PNG", "WEBP"}
                    or image.width * image.height > 20000000
                ):
                    raise ValueError("Choose a JPEG, PNG or WebP under 20 megapixels.")
                output = ImageOps.fit(ImageOps.exif_transpose(image).convert("RGB"), (720, 1280))
                # Decode/re-encode: no user filename, SVG, metadata or executable bytes survive.
                buffer = io.BytesIO()
                output.save(buffer, "JPEG", quality=90)
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
            raise HTTPException(422, "Choose a valid JPEG, PNG or WebP image.") from exc
        # Revision check and replace happen under a database write lock; stale tabs cannot replace
        # another user's current thumbnail. Atomic file replacement prevents partial image reads.
        with sessions() as db:
            short = get_short(db, short_id, user)
            changed = db.execute(
                update(Short)
                .where(Short.id == short.id, Short.revision == revision)
                .values(thumbnail=3, revision=revision + 1, export_revision=None)
            )
            if changed.rowcount != 1:
                raise HTTPException(409, "This short changed. Reload before uploading.")
            temporary = folder / f"upload-{secrets.token_hex(8)}.jpg"
            temporary.write_bytes(buffer.getvalue())
            temporary.replace(folder / "thumbnail-3.jpg")
            db.commit()
            db.expire_all()
            return short_view(get_short(db, short_id, user))

    @app.get("/api/v1/music")
    def music(user: CurrentUser):
        return [
            {
                "id": key,
                **value,
                "license": "Original synthesized Clivvy arrangement; "
                "included for use in your exports. Not a chart or trending-song claim.",
            }
            for key, value in MUSIC.items()
        ]

    from .audio_routes import install_audio_routes

    install_audio_routes(app, settings, sessions, get_short)
