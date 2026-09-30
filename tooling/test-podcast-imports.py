"""Explicit opt-in network smoke test. Downloads stay in ignored .cache/."""

import json
from pathlib import Path

import httpx
from smartclipper_api.config import Settings
from smartclipper_api.database import make_database
from smartclipper_api.worker import process_one, run_media

SOURCES = {
    "floss-761": "https://cdn.twit.tv/video/floss/floss0761/floss0761_h264m_1920x1080.mp4",
    "floss-760": "https://cdn.twit.tv/video/floss/floss0760/floss0760_h264m_1920x1080.mp4",
}
settings = Settings()
folder = Path(".cache/fixtures")
folder.mkdir(parents=True, exist_ok=True)
engine, sessions = make_database(settings.database_url)
results = []
try:
    for name, url in SOURCES.items():
        target = folder / f"{name}.mp4"
        if not target.exists():
            run_media(
                [
                    settings.ffmpeg_path,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-nostdin",
                    "-y",
                    "-ss",
                    "30",
                    "-i",
                    url,
                    "-t",
                    "12",
                    "-vf",
                    "scale=640:-2",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-threads",
                    "2",
                    "-c:a",
                    "aac",
                    "-movflags",
                    "+faststart",
                    str(target),
                ],
                timeout=90,
            )
        with target.open("rb") as video:
            response = httpx.post(
                "http://127.0.0.1:8000/api/v1/projects",
                params={"filename": target.name},
                content=video.read(),
                timeout=30,
            )
        response.raise_for_status()
        project_id = response.json()["id"]
        while process_one(settings, sessions):
            pass
        detail = httpx.get(f"http://127.0.0.1:8000/api/v1/projects/{project_id}").json()
        assert detail["status"] == "ready", detail
        preview = httpx.get(
            f"http://127.0.0.1:8000/api/v1/projects/{project_id}/media/preview",
            headers={"Range": "bytes=0-127"},
        )
        assert preview.status_code == 206
        audio = httpx.get(f"http://127.0.0.1:8000/api/v1/projects/{project_id}/media/audio")
        assert audio.status_code == 200 and len(audio.content) > 0
        results.append(
            {
                "source": url,
                "project_id": project_id,
                "duration": detail["duration_seconds"],
                "status": detail["status"],
                "range_status": preview.status_code,
                "audio_bytes": len(audio.content),
            }
        )
    Path(".cache/podcast-smoke.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))
finally:
    engine.dispose()
