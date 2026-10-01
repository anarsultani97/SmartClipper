"""A separate durable SQLite polling worker for the local review slice."""

import argparse
import json
import subprocess
import time

from sqlalchemy import select, update

from .config import Settings
from .database import Project, make_database
from .schemas import validate_metadata
from .storage import remove_project_files


class ImportCancelled(Exception):
    pass


def run_media(args: list[str], timeout: int = 300, cwd=None, cancelled=None):
    import os

    if cancelled:
        if cancelled():
            raise ImportCancelled()
        with subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=cwd,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        ) as process:
            began = time.monotonic()
            try:
                while True:
                    if cancelled():
                        raise ImportCancelled()
                    remaining = timeout - (time.monotonic() - began)
                    if remaining <= 0:
                        raise subprocess.TimeoutExpired(args, timeout)
                    try:
                        stdout, stderr = process.communicate(timeout=min(1, remaining))
                        if process.returncode:
                            raise subprocess.CalledProcessError(
                                process.returncode, args, stdout, stderr
                            )
                        return subprocess.CompletedProcess(args, process.returncode, stdout, stderr)
                    except subprocess.TimeoutExpired:
                        if time.monotonic() - began >= timeout:
                            raise
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate()
    return subprocess.run(
        args,
        check=True,
        capture_output=True,
        timeout=timeout,
        cwd=cwd,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def prepare(folder, settings: Settings, cancelled=None) -> dict:
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
        cancelled=cancelled,
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
        cancelled=cancelled,
    )
    run_media(
        base + ["-frames:v", "1", "-vf", "scale=480:-2", str(folder / "thumbnail.jpg")],
        cancelled=cancelled,
    )
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
            cancelled=cancelled,
        )
        # Whisper and render share the normalized preview clock, including initial
        # audio offsets. MP3 is a user download, not the transcription clock.
        run_media(
            [
                settings.ffmpeg_path,
                "-v",
                "error",
                "-nostdin",
                "-y",
                "-i",
                str(folder / "preview.mp4"),
                "-map",
                "0:a:0",
                "-vn",
                "-ac",
                "1",
                "-af",
                "aresample=async=1:first_pts=0",
                "-ar",
                "16000",
                str(folder / "speech.wav"),
            ],
            cancelled=cancelled,
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

    def cancelled():
        with sessions() as db:
            stored = db.get(Project, project_id)
            return not stored or stored.status == "deleted"

    try:
        metadata = (
            prepare(settings.data_dir / project_id, settings, cancelled)
            if processor is prepare
            else processor(settings.data_dir / project_id, settings)
        )
        with sessions() as session:
            changed = session.execute(
                update(Project)
                .where(Project.id == project_id, Project.status == "processing")
                .values(
                    **metadata,
                    status="ready",
                    end_ms=min(60000, int(metadata["duration_seconds"] * 1000)),
                )
            )
            session.commit()
        if changed.rowcount == 0 and cancelled():
            remove_project_files(settings, project_id)
    except (
        ImportCancelled,
        ValueError,
        OSError,
        subprocess.SubprocessError,
        json.JSONDecodeError,
    ) as exc:
        if cancelled():
            remove_project_files(settings, project_id)
            return True
        if isinstance(exc, FileNotFoundError):
            error = "FFmpeg/ffprobe is missing. Install it, configure paths, then retry."
        elif isinstance(exc, subprocess.TimeoutExpired):
            error = "Video preparation timed out. Try a shorter video."
        elif isinstance(exc, subprocess.CalledProcessError):
            error = "The video could not be decoded. Choose a valid MP4 or retry preparation."
        else:
            error = str(exc)[:500]
        with sessions() as session:
            session.execute(
                update(Project)
                .where(Project.id == project_id, Project.status == "processing")
                .values(status="failed", error=error)
            )
            session.commit()
        if cancelled():
            remove_project_files(settings, project_id)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    settings = Settings()
    from filelock import FileLock, Timeout

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    worker_lock = FileLock(settings.data_dir / "worker.lock")
    try:
        worker_lock.acquire(timeout=0)
    except Timeout:
        raise SystemExit("A worker is already running for this data directory.") from None
    engine, sessions = make_database(settings.database_url)
    # Single local worker only: interrupted jobs become explicitly retryable after restart.
    with sessions() as session:
        session.execute(
            update(Project)
            .where(Project.status == "processing")
            .values(status="failed", error="Preparation was interrupted. Retry to resume.")
        )
        from .database import Job

        session.execute(
            update(Job)
            .where(Job.status == "processing")
            .values(
                status="failed",
                error="Processing was interrupted. Retry to resume.",
                stage="Needs attention",
            )
        )
        session.commit()
        deleted_ids = session.scalars(select(Project.id).where(Project.status == "deleted")).all()
    for project_id in deleted_ids:
        remove_project_files(settings, project_id)
    try:
        while True:
            from .pipeline import process_job

            worked = process_one(settings, sessions) or process_job(settings, sessions)
            if args.once:
                break
            if not worked:
                time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        engine.dispose()
        worker_lock.release()


if __name__ == "__main__":
    main()
