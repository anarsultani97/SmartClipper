"""A separate durable SQLite polling worker for the local review slice."""

import argparse
import json
import subprocess
import time

from sqlalchemy import select, update

from .config import Settings
from .database import Project, make_database
from .schemas import validate_metadata


def run_media(args: list[str], timeout: int = 300):
    import os

    return subprocess.run(
        args,
        check=True,
        capture_output=True,
        timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def prepare(folder, settings: Settings) -> dict:
    source = folder / "source.mp4"
    result = run_media(
        [
            settings.ffprobe_path,
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(source),
        ],
        timeout=30,
    )
    metadata = validate_metadata(json.loads(result.stdout), settings.max_duration_seconds)
    base = [
        settings.ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        str(source),
    ]
    run_media(
        base
        + [
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "27",
            "-pix_fmt",
            "yuv420p",
            "-threads",
            "2",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(folder / "preview.mp4"),
        ],
        600,
    )
    run_media(base + ["-frames:v", "1", "-vf", "scale=480:-2", str(folder / "thumbnail.jpg")])
    if metadata["has_audio"]:
        run_media(
            base
            + [
                "-map",
                "0:a:0",
                "-vn",
                "-c:a",
                "libmp3lame",
                "-q:a",
                "2",
                str(folder / "audio.mp3"),
            ],
            300,
        )
    return metadata


def process_one(settings: Settings, sessions, processor=prepare) -> bool:
    with sessions() as session:
        project = session.scalar(
            select(Project).where(Project.status == "queued").order_by(Project.created_at)
        )
        if not project:
            return False
        project_id = project.id
        claim = session.execute(
            update(Project)
            .where(Project.id == project_id, Project.status == "queued")
            .values(status="processing", error=None)
        )
        session.commit()
        if claim.rowcount != 1:
            return True
    try:
        metadata = processor(settings.data_dir / project_id, settings)
        with sessions() as session:
            project = session.get(Project, project_id)
            for key, value in metadata.items():
                setattr(project, key, value)
            project.status = "ready"
            project.end_ms = min(60000, int(metadata["duration_seconds"] * 1000))
            session.commit()
    except (ValueError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        if isinstance(exc, FileNotFoundError):
            error = "FFmpeg/ffprobe is missing. Install it, configure paths, then retry."
        elif isinstance(exc, subprocess.TimeoutExpired):
            error = "Video preparation timed out. Try a shorter video."
        elif isinstance(exc, subprocess.CalledProcessError):
            error = "The video could not be decoded. Choose a valid MP4 or retry preparation."
        else:
            error = str(exc)[:500]
        with sessions() as session:
            project = session.get(Project, project_id)
            project.status, project.error = "failed", error
            session.commit()
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    settings = Settings()
    engine, sessions = make_database(settings.database_url)
    # Single local worker only: interrupted jobs become explicitly retryable after restart.
    with sessions() as session:
        session.execute(
            update(Project)
            .where(Project.status == "processing")
            .values(status="failed", error="Preparation was interrupted. Retry to resume.")
        )
        session.commit()
    try:
        while True:
            worked = process_one(settings, sessions)
            if args.once:
                break
            if not worked:
                time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
