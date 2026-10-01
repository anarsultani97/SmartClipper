"""A separate durable SQLite polling worker for the local review slice."""

import argparse
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time

from sqlalchemy import select, update

from .config import Settings
from .database import Project, make_database
from .schemas import validate_metadata
from .storage import remove_project_files


class ImportCancelled(Exception):
    pass


def run_media(args: list[str], timeout: int = 300, cwd=None, cancelled=None, progress=None):
    import os

    if progress:
        if cancelled and cancelled():
            raise ImportCancelled()
        # Windows communicate(timeout) does not expose partial stdout. Drain both
        # streams with bounded native reader threads and deliver progress on this thread.
        with subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=cwd,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        ) as process:
            output, errors = [], []
            latest = [0.0]

            def read(stream, sink, parse=False):
                for line in iter(stream.readline, b""):
                    sink.append(line)
                    if parse:
                        match = re.fullmatch(rb"out_time_us=(\d+)\s*", line)
                        if match:
                            latest[0] = int(match[1]) / 1_000_000

            readers = [
                threading.Thread(target=read, args=(process.stdout, output, True), daemon=True),
                threading.Thread(target=read, args=(process.stderr, errors), daemon=True),
            ]
            for reader in readers:
                reader.start()
            began, reported = time.monotonic(), -1.0
            try:
                while True:
                    if cancelled and cancelled():
                        raise ImportCancelled()
                    remaining = timeout - (time.monotonic() - began)
                    if remaining <= 0:
                        raise subprocess.TimeoutExpired(args, timeout)
                    try:
                        process.wait(timeout=min(0.5, remaining))
                        break
                    except subprocess.TimeoutExpired:
                        if latest[0] != reported:
                            reported = latest[0]
                            progress(reported)
                for reader in readers:
                    reader.join()
                stdout, stderr = b"".join(output), b"".join(errors)
                if process.returncode:
                    raise subprocess.CalledProcessError(process.returncode, args, stdout, stderr)
                progress(latest[0])
                return subprocess.CompletedProcess(args, process.returncode, stdout, stderr)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
                for reader in readers:
                    reader.join(timeout=2)
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


def prepare(folder, settings: Settings, cancelled=None, progress=None) -> dict:
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
    if progress:
        progress("Preparing video preview", 3)
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
    preview_args = base + [
        "-progress",
        "pipe:1",
        "-nostats",
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
    ]
    if metadata["has_audio"]:
        # Demux the original once for the preview and downloadable MP3.
        preview_args += [
            "-map",
            "0:a:0",
            "-vn",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            str(folder / "audio.mp3"),
        ]
    run_media(
        preview_args,
        600,
        cancelled=cancelled,
        progress=(
            lambda seconds: progress(
                "Preparing video & audio",
                min(82, 3 + round(79 * seconds / metadata["duration_seconds"])),
            )
        )
        if progress
        else None,
    )
    run_media(
        base + ["-frames:v", "1", "-vf", "scale=480:-2", str(folder / "thumbnail.jpg")],
        cancelled=cancelled,
    )
    if metadata["has_audio"]:
        if progress:
            progress("Preparing speech analysis", 88)
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
    if progress:
        progress("Audio and preview prepared", 98)
    return metadata


def download_link(folder, project, settings, cancelled, progress):
    folder.mkdir(parents=True, exist_ok=True)
    messages = queue.Queue()
    progress("Connecting to video platform", 1)
    with subprocess.Popen(
        [sys.executable, "-m", "smartclipper_api.link_import"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        creationflags=(subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
        if os.name == "nt"
        else 0,
        start_new_session=os.name != "nt",
    ) as process:
        process.stdin.write(
            json.dumps(
                {
                    "url": project.source_url,
                    "folder": str(folder.resolve()),
                    "limit": settings.max_upload_bytes,
                    "duration": settings.max_duration_seconds,
                    "ffmpeg": settings.ffmpeg_path,
                }
            ).encode()
        )
        process.stdin.close()

        def read():
            for line in process.stdout:
                try:
                    messages.put(json.loads(line))
                except (ValueError, UnicodeDecodeError):
                    pass

        reader = threading.Thread(target=read, daemon=True)
        reader.start()
        began, result, error, reported = time.monotonic(), None, None, 1
        try:
            while True:
                if cancelled():
                    raise ImportCancelled()
                if time.monotonic() - began > 900:
                    raise ValueError(
                        "Link import timed out. Try a shorter video or upload the MP4."
                    )
                if process.poll() is not None:
                    reader.join(timeout=2)
                while not messages.empty():
                    data = messages.get_nowait()
                    if "error" in data:
                        error = data["error"]
                    elif "filename" in data:
                        result = data
                    elif "progress" in data:
                        reported = max(reported, 2 + round(data["progress"] * 0.38))
                        progress("Downloading video from link", reported)
                if process.poll() is not None:
                    break
                try:
                    process.wait(timeout=0.5)
                except subprocess.TimeoutExpired:
                    pass
            if process.returncode or not result:
                raise ValueError(
                    error or "Link import failed. Try another public video or upload MP4."
                )
            return result
        finally:
            if process.poll() is None:
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        capture_output=True,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
                else:
                    import signal

                    os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            reader.join(timeout=2)


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

    def progress(message, percent):
        with sessions() as db:
            db.execute(
                update(Project)
                .where(Project.id == project_id, Project.status == "processing")
                .values(stage=message, progress=percent)
            )
            db.commit()

    try:
        if project.source_url:
            result = download_link(
                settings.data_dir / project_id, project, settings, cancelled, progress
            )
            with sessions() as db:
                db.execute(
                    update(Project)
                    .where(Project.id == project_id, Project.status == "processing")
                    .values(filename=result["filename"], size_bytes=result["size_bytes"])
                )
                db.commit()
        preparation_progress = (
            (lambda message, percent: progress(message, 40 + round(percent * 0.59)))
            if project.source_url
            else progress
        )
        metadata = (
            prepare(settings.data_dir / project_id, settings, cancelled, preparation_progress)
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
                    progress=100,
                    stage="Ready",
                    end_ms=int(metadata["duration_seconds"] * 1000),
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
