"""Opt-in private podcast/ASR smoke. No media, credentials or weights enter Git."""

import json
import secrets
import time
from pathlib import Path

import httpx
from smartclipper_api.config import Settings
from smartclipper_api.database import make_database
from smartclipper_api.pipeline import process_job
from smartclipper_api.worker import process_one, run_media

SOURCES = {
    "floss-761": "https://cdn.twit.tv/video/floss/floss0761/floss0761_h264m_1920x1080.mp4",
    "floss-760": "https://cdn.twit.tv/video/floss/floss0760/floss0760_h264m_1920x1080.mp4",
}
settings = Settings()
folder = Path(".cache/fixtures")
folder.mkdir(parents=True, exist_ok=True)
account_path = Path(".cache/review-account.json")
account = (
    json.loads(account_path.read_text())
    if account_path.exists()
    else {
        "email": f"review-{secrets.token_hex(4)}@example.com",
        "password": secrets.token_urlsafe(24),
        "name": "Review workspace",
    }
)
engine, sessions = make_database(settings.database_url)
results = []
with httpx.Client(base_url="http://127.0.0.1:8000/api/v1", timeout=60) as client:
    auth = client.post("/auth/login" if account_path.exists() else "/auth/signup", json=account)
    auth.raise_for_status()
    account["user_id"] = auth.json()["id"]
    account_path.write_text(json.dumps(account), encoding="utf-8")
    client.headers["X-CSRF-Token"] = auth.json()["csrf"]
    try:
        for name, url in SOURCES.items():
            target = folder / f"{name}-180s.mp4"
            if not target.exists():
                print(f"Downloading a private 180-second excerpt: {name}", flush=True)
                run_media(
                    [
                        settings.ffmpeg_path,
                        "-v",
                        "error",
                        "-nostdin",
                        "-y",
                        "-ss",
                        "240",
                        "-i",
                        url,
                        "-t",
                        "180",
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
                    timeout=240,
                )
            response = client.post(
                "/projects", params={"filename": target.name}, content=target.read_bytes()
            )
            response.raise_for_status()
            project_id = response.json()["id"]
            print(f"Preparing and transcribing {name}", flush=True)
            started = time.perf_counter()
            while process_one(settings, sessions):
                pass
            detail = client.get(f"/projects/{project_id}").json()
            assert detail["status"] == "ready", detail
            preview = client.get(
                f"/projects/{project_id}/media/preview", headers={"Range": "bytes=0-127"}
            )
            assert preview.status_code == 206
            job = client.post(
                f"/projects/{project_id}/generate",
                json={"language": "en", "duration_seconds": 30, "count": 5},
            )
            job.raise_for_status()
            while process_job(settings, sessions):
                pass
            jobs = client.get(f"/projects/{project_id}/jobs").json()
            assert jobs[0]["status"] == "ready", jobs[0]
            shorts = client.get(f"/projects/{project_id}/shorts").json()
            assert 1 <= len(shorts) <= 5
            assert all(len(s["summary"]) == 3 for s in shorts)
            exported = client.post(f"/shorts/{shorts[0]['id']}/export")
            exported.raise_for_status()
            while process_job(settings, sessions):
                pass
            download = client.get(
                f"/shorts/{shorts[0]['id']}/media/export", params={"job_id": exported.json()["id"]}
            )
            assert download.status_code == 200
            result = {
                "source": url,
                "project_id": project_id,
                "duration_seconds": detail["duration_seconds"],
                "status": "ready",
                "shorts": len(shorts),
                "thumbnails": [len(s["thumbnails"]) for s in shorts],
                "elapsed_seconds": round(time.perf_counter() - started, 2),
                "export_bytes": len(download.content),
            }
            results.append(result)
            print(json.dumps(result), flush=True)
        samples = []
        for _ in range(10):
            began = time.perf_counter()
            metrics = client.get("/analytics")
            metrics.raise_for_status()
            samples.append((time.perf_counter() - began) * 1000)
        Path(".cache/podcast-generation-smoke.json").write_text(
            json.dumps(
                {
                    "podcasts": results,
                    "dashboard_median_ms": round(sorted(samples)[len(samples) // 2], 2),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(
            "Dashboard median over ten local requests: "
            f"{sorted(samples)[len(samples) // 2]:.2f} ms",
            flush=True,
        )
    finally:
        engine.dispose()
