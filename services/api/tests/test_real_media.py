"""Actual native processing, using generated fixtures rather than copyrighted media."""

import json
import shutil

import pytest
from fastapi.testclient import TestClient
from smartclipper_api.app import create_app
from smartclipper_api.config import Settings
from smartclipper_api.database import Base
from smartclipper_api.pipeline import process_job
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
        user = client.post(
            "/api/v1/auth/signup",
            json={"email": "creator@example.com", "password": "test-password-123"},
        ).json()
        client.headers["X-CSRF-Token"] = user["csrf"]
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


def test_real_generation_quality_thumbnails_and_caption_music_export(tmp_path):
    settings = Settings(data_dir=tmp_path / "media", database_url=f"sqlite:///{tmp_path}/db.sqlite")
    if not shutil.which(settings.ffmpeg_path) or not shutil.which(settings.ffprobe_path):
        pytest.skip("Native FFmpeg integration requires media binaries.")
    source = tmp_path / "pattern.mp4"
    run_media(
        [
            settings.ffmpeg_path,
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=320x240:r=10",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=44100",
            "-t",
            "20",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            str(source),
        ],
        60,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.sessions.kw["bind"])
    with TestClient(app) as client:
        user = client.post(
            "/api/v1/auth/signup",
            json={"email": "native@example.com", "password": "native-password-123"},
        ).json()
        client.headers["X-CSRF-Token"] = user["csrf"]
        project = client.post(
            "/api/v1/projects?filename=pattern.mp4", content=source.read_bytes()
        ).json()
        assert process_one(settings, app.state.sessions)
        srt = "\n\n".join(
            f"{i + 1}\n00:00:{i * 4:02},000 --> 00:00:{i * 4 + 3:02},500\n"
            f"Thought {i} explains a different helpful idea clearly."
            for i in range(5)
        )
        assert (
            client.put(
                f"/api/v1/projects/{project['id']}/transcript", json={"language": "en", "srt": srt}
            ).status_code
            == 200
        )
        job = client.post(
            f"/api/v1/projects/{project['id']}/generate", json={"duration_seconds": 15, "count": 1}
        ).json()
        assert process_job(settings, app.state.sessions)
        state = client.get(f"/api/v1/projects/{project['id']}/jobs").json()[0]
        assert state["status"] == "ready", state
        short = client.get(f"/api/v1/projects/{project['id']}/shorts").json()[0]
        assert short["job_id"] == job["id"]
        assert len(short["thumbnails"]) == 3
        assert len(short["summary"]) == 3
        assert client.get(f"/api/v1/shorts/{short['id']}/captions/original").text.startswith(
            "WEBVTT"
        )
        folder = settings.data_dir / project["id"] / "shorts" / short["id"]
        metadata = json.loads(
            run_media(
                [
                    settings.ffprobe_path,
                    "-v",
                    "error",
                    "-show_format",
                    "-show_streams",
                    "-of",
                    "json",
                    str(folder / "clip.mp4"),
                ]
            ).stdout
        )
        video = next(s for s in metadata["streams"] if s["codec_type"] == "video")
        assert (video["width"], video["height"]) == (720, 1280)
        assert (
            abs(
                float(metadata["format"]["duration"]) - (short["end_ms"] - short["start_ms"]) / 1000
            )
            < 0.2
        )
        edit = {
            "revision": short["revision"],
            "title": short["title"],
            "music": "bright",
            "subtitles": True,
            "thumbnail_text": "Clear idea",
        }
        assert client.patch(f"/api/v1/shorts/{short['id']}", json=edit).status_code == 200
        exported = client.post(f"/api/v1/shorts/{short['id']}/export").json()
        assert process_job(settings, app.state.sessions)
        response = client.get(f"/api/v1/shorts/{short['id']}/media/export?job_id={exported['id']}")
        assert response.status_code == 200
        assert (
            client.get(
                f"/api/v1/shorts/{short['id']}/media/export?job_id={exported['id']}",
                headers={"Range": "bytes=0-99"},
            ).status_code
            == 206
        )
