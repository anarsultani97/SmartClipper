import subprocess

import pytest
from smartclipper_api.database import Project
from smartclipper_api.schemas import validate_metadata
from smartclipper_api.worker import ImportCancelled, process_one, run_media


def metadata(duration="90", audio=True):
    streams = [{"codec_type": "video", "width": 1920, "height": 1080}]
    if audio:
        streams.append({"codec_type": "audio"})
    return {"streams": streams, "format": {"duration": duration, "format_name": "mov,mp4"}}


@pytest.mark.parametrize("duration", ["0", "-1", "nan", "inf", "2000"])
def test_invalid_duration(duration):
    with pytest.raises(ValueError):
        validate_metadata(metadata(duration), 1800)


def test_audio_optional_and_mp4_validation():
    assert validate_metadata(metadata(audio=False), 1800)["has_audio"] == 0
    value = metadata()
    value["format"]["format_name"] = "mp3"
    with pytest.raises(ValueError):
        validate_metadata(value, 1800)


def test_no_video_rejected():
    with pytest.raises(ValueError):
        validate_metadata({"streams": [], "format": {"duration": "1"}}, 1800)


def enqueue(app):
    with app.state.sessions() as session:
        session.add(Project(id="test", filename="test.mp4", size_bytes=10, status="queued"))
        session.commit()


def test_worker_completes_once(app):
    enqueue(app)
    calls = []

    def processor(folder, settings):
        calls.append(folder)
        return validate_metadata(metadata(), 1800)

    assert process_one(app.state.settings, app.state.sessions, processor)
    assert not process_one(app.state.settings, app.state.sessions, processor)
    assert len(calls) == 1
    with app.state.sessions() as session:
        project = session.get(Project, "test")
        assert project.status == "ready"
        assert project.end_ms == 90000
        assert project.has_audio == 1


@pytest.mark.parametrize(
    "error,expected",
    [
        (FileNotFoundError("missing"), "FFmpeg/ffprobe is missing"),
        (subprocess.TimeoutExpired("ffmpeg", 1), "timed out"),
        (subprocess.CalledProcessError(1, "ffmpeg"), "could not be decoded"),
        (ValueError("no usable video"), "no usable video"),
    ],
)
def test_worker_records_failures(app, error, expected):
    enqueue(app)

    def processor(folder, settings):
        raise error

    assert process_one(app.state.settings, app.state.sessions, processor)
    with app.state.sessions() as session:
        project = session.get(Project, "test")
        assert project.status == "failed"
        assert expected in project.error


@pytest.mark.parametrize("fails", [True, False])
def test_removed_preparing_video_cannot_resurrect_after_success_or_failure(app, client, fails):
    project_id = client.post("/api/v1/projects?filename=cancel.mp4", content=b"data").json()["id"]

    def processor(folder, settings):
        assert client.delete(f"/api/v1/projects/{project_id}").status_code == 202
        if fails:
            raise ValueError("decode failed after cancel")
        return validate_metadata(metadata(), 1800)

    assert process_one(app.state.settings, app.state.sessions, processor)
    with app.state.sessions() as db:
        assert db.get(Project, project_id).status == "deleted"
    assert not (app.state.settings.data_dir / project_id).exists()
    assert client.get("/api/v1/projects").json() == []


def test_native_process_is_killed_after_cancellation():
    import sys
    import time

    calls = 0

    def cancelled():
        nonlocal calls
        calls += 1
        return calls >= 3

    started = time.monotonic()
    with pytest.raises(ImportCancelled):
        run_media(
            [sys.executable, "-c", "import time; time.sleep(10)"], timeout=15, cancelled=cancelled
        )
    assert time.monotonic() - started < 5
