"""Actual native processing, using generated fixtures rather than copyrighted media."""

import shutil

import pytest
from fastapi.testclient import TestClient
from smartclipper_api.app import create_app
from smartclipper_api.config import Settings
from smartclipper_api.database import Base
from smartclipper_api.worker import process_one, run_media


@pytest.mark.parametrize("with_audio", [True, False])
def test_real_mp4_import_preview_and_audio(tmp_path, with_audio):
    settings = Settings(data_dir=tmp_path / "media", database_url=f"sqlite:///{tmp_path}/db.sqlite")
    if not shutil.which(settings.ffmpeg_path) or not shutil.which(settings.ffprobe_path):
        pytest.skip("FFmpeg and ffprobe are required for native media integration.")
    source = tmp_path / "sample.mp4"
    args = [
        settings.ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=320x180:r=10",
    ]
    if with_audio:
        args += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100"]
    args += ["-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p"]
    if with_audio:
        args += ["-c:a", "aac"]
    args += ["-movflags", "+faststart", str(source)]
    run_media(args, 30)
    app = create_app(settings)
    Base.metadata.create_all(app.state.sessions.kw["bind"])
    with TestClient(app) as client:
        response = client.post("/api/v1/projects?filename=sample.mp4", content=source.read_bytes())
        assert response.status_code == 202
        project_id = response.json()["id"]
        assert process_one(settings, app.state.sessions)
        project = client.get(f"/api/v1/projects/{project_id}").json()
        assert project["status"] == "ready", project
        assert project["has_audio"] is with_audio
        assert abs(project["duration_seconds"] - 2) < 0.1
        base = f"/api/v1/projects/{project_id}/media"
        assert client.get(base + "/thumbnail").status_code == 200
        assert client.get(base + "/preview", headers={"Range": "bytes=0-99"}).status_code == 206
        assert client.get(base + "/audio").status_code == (200 if with_audio else 404)


def test_corrupt_mp4_fails_without_ready_assets(client, app):
    response = client.post("/api/v1/projects?filename=broken.mp4", content=b"not a video")
    project_id = response.json()["id"]
    if not shutil.which(app.state.settings.ffprobe_path):
        pytest.skip("ffprobe required to verify decode failure.")
    assert process_one(app.state.settings, app.state.sessions)
    project = client.get(f"/api/v1/projects/{project_id}").json()
    assert project["status"] == "failed"
    assert client.get(f"/api/v1/projects/{project_id}/media/preview").status_code == 409
