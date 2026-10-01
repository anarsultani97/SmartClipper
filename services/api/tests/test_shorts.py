import io
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from smartclipper_api.database import Job, Project, Short
from smartclipper_api.pipeline import process_job
from sqlalchemy.exc import IntegrityError
from test_auth import signup


@pytest.fixture
def ready(client, app):
    project_id = client.post("/api/v1/projects?filename=talk.mp4", content=b"video").json()["id"]
    with app.state.sessions() as db:
        p = db.get(Project, project_id)
        p.status, p.duration_seconds, p.has_audio = "ready", 100, 1
        db.commit()
    return project_id


@pytest.fixture
def clip(client, app, ready):
    with app.state.sessions() as db:
        job = Job(id=str(uuid4()), project_id=ready, status="ready", kind="generate", options={})
        db.add(job)
        db.flush()
        short = Short(
            id=str(uuid4()),
            project_id=ready,
            job_id=job.id,
            title="Clear idea",
            thumbnail_text="Clear idea",
            start_ms=10000,
            end_ms=30000,
            summary=["Opening.", "The idea.", "Closing."],
            transcript=[{"start": 0, "end": 10, "text": "The complete idea."}],
            thumbnails=[{"index": 0, "time_seconds": 12}],
            subtitles=1,
            music="none",
            thumbnail=0,
            thumbnail_style="bold",
            subtitle_language="original",
            quality_note="Sampled.",
        )
        db.add(short)
        db.commit()
        folder = app.state.settings.data_dir / ready / "shorts" / short.id
        folder.mkdir(parents=True)
        Image.new("RGB", (120, 200), "blue").save(folder / "thumbnail-0.jpg")
        return short.id, job.id


def test_generation_validation_durable_job_and_duplicate_guard(client, app, ready):
    url = f"/api/v1/projects/{ready}/generate"
    for bad in [
        {"language": "it"},
        {"duration_seconds": 181},
        {"count": 6},
        {"platform": "unknown"},
    ]:
        assert client.post(url, json=bad).status_code == 422
    result = client.post(url, json={"language": "es", "english_subtitles": True}).json()
    assert result["status"] == "queued"
    assert result["options"]["language"] == "es"
    assert client.post(url, json={}).status_code == 409
    with app.state.sessions() as db:
        db.add(Job(id=str(uuid4()), project_id=ready, kind="export", options={}))
        with pytest.raises(IntegrityError):
            db.commit()


def test_transcript_upload_persisted_with_actual_language(client, app, ready):
    url = f"/api/v1/projects/{ready}/transcript"
    srt = "1\n00:00:01,000 --> 00:00:05,000\nUna idea completa."
    assert client.put(url, json={"language": "es", "srt": srt}).status_code == 200
    with app.state.sessions() as db:
        assert db.get(Project, ready).transcript_language == "es"
    assert client.put(url, json={"language": "es", "srt": "untimed"}).status_code == 422


def test_all_short_and_job_routes_require_owner(client, app, clip):
    short_id, job_id = clip
    with TestClient(app) as other:
        signup(other)
        for route in (
            f"/shorts/{short_id}/media/clip",
            f"/shorts/{short_id}/media/thumbnail-0",
            f"/shorts/{short_id}/captions/original",
        ):
            assert other.get("/api/v1" + route).status_code == 404
        assert (
            other.patch(
                f"/api/v1/shorts/{short_id}", json={"revision": 1, "title": "Bad"}
            ).status_code
            == 404
        )
        assert other.post(f"/api/v1/shorts/{short_id}/export").status_code == 404
        assert (
            other.put(f"/api/v1/shorts/{short_id}/thumbnail?revision=1", content=b"x").status_code
            == 404
        )
        assert other.post(f"/api/v1/jobs/{job_id}/retry").status_code == 404


def test_short_edit_revision_caption_toggle_and_export_snapshot(client, app, clip):
    short_id, _ = clip
    edit = {"revision": 1, "title": "New title", "subtitles": False, "music": "calm"}
    saved = client.patch(f"/api/v1/shorts/{short_id}", json=edit)
    assert saved.status_code == 200
    assert saved.json()["revision"] == 2
    assert not saved.json()["subtitles"]
    assert client.patch(f"/api/v1/shorts/{short_id}", json=edit).status_code == 409
    assert (
        client.patch(
            f"/api/v1/shorts/{short_id}", json={**edit, "revision": 2, "subtitle_language": "en"}
        ).status_code
        == 422
    )
    job = client.post(f"/api/v1/shorts/{short_id}/export").json()
    assert "captions" not in job["options"]
    with app.state.sessions() as db:
        assert db.get(Job, job["id"]).options["revision"] == 2
        assert db.get(Job, job["id"]).options["music"] == "calm"
    assert (
        client.get(f"/api/v1/shorts/{short_id}/media/export?job_id={job['id']}").status_code == 404
    )


def test_thumbnail_sanitized_and_revision_protected(client, app, clip):
    short_id, _ = clip
    image = io.BytesIO()
    Image.new("RGB", (200, 300), "green").save(image, "PNG")
    url = f"/api/v1/shorts/{short_id}/thumbnail?revision=1"
    assert client.put(url, content=b"<svg/>").status_code == 422
    result = client.put(url, content=image.getvalue())
    assert result.status_code == 200
    assert result.json()["thumbnail"] == 3
    assert result.json()["revision"] == 2
    assert client.put(url, content=image.getvalue()).status_code == 409
    response = client.get(f"/api/v1/shorts/{short_id}/media/thumbnail-3")
    assert response.status_code == 200
    with Image.open(io.BytesIO(response.content)) as output:
        assert output.format == "JPEG" and output.size == (720, 1280)


def test_partial_failed_generations_are_not_published(client, app, clip, ready):
    _, job_id = clip
    with app.state.sessions() as db:
        db.get(Job, job_id).status = "failed"
        db.commit()
    assert client.get(f"/api/v1/projects/{ready}/shorts").json() == []
    retried = client.post(f"/api/v1/jobs/{job_id}/retry")
    assert retried.status_code == 202
    assert retried.json()["id"] != job_id


def test_pipeline_failure_is_visible_and_retryable(client, app, ready, monkeypatch):
    def broken(*args):
        raise ValueError("No clear speech detected.")

    monkeypatch.setattr("smartclipper_api.pipeline.transcribe", broken)
    job = client.post(f"/api/v1/projects/{ready}/generate", json={}).json()
    assert process_job(app.state.settings, app.state.sessions)
    with app.state.sessions() as db:
        assert db.get(Job, job["id"]).status == "failed"
        assert "No clear speech" in db.get(Job, job["id"]).error
    assert client.post(f"/api/v1/jobs/{job['id']}/retry").status_code == 202


def test_non_english_generation_has_original_and_translated_caption_tracks(
    client, app, ready, monkeypatch
):
    with app.state.sessions() as db:
        project = db.get(Project, ready)
        project.transcript = [
            {"start": 1, "end": 20, "text": "Esta es una historia completa para compartir."}
        ]
        project.detected_language = project.transcript_language = "es"
        db.commit()
    calls = []

    def translate(source, settings, language, translate=False):
        calls.append((language, translate))
        return ([{"start": 1, "end": 20, "text": "This is a complete story to share."}], "es")

    def render(source, folder, *args, **kwargs):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "clip.mp4").write_bytes(b"fixture")

    monkeypatch.setattr("smartclipper_api.pipeline.transcribe", translate)
    monkeypatch.setattr(
        "smartclipper_api.pipeline.scan_quality", lambda *a: [{"time": 5, "good": True}]
    )
    monkeypatch.setattr("smartclipper_api.pipeline.render_short", render)
    monkeypatch.setattr(
        "smartclipper_api.pipeline.make_thumbnails",
        lambda *a: [{"index": i, "time_seconds": 2 + i * 5} for i in range(3)],
    )
    client.post(
        f"/api/v1/projects/{ready}/generate", json={"language": "es", "english_subtitles": True}
    )
    assert process_job(app.state.settings, app.state.sessions)
    short = client.get(f"/api/v1/projects/{ready}/shorts").json()[0]
    assert short["english_available"] and short["subtitle_language"] == "en"
    assert calls == [("es", True)]
    assert (
        "This is a complete story" in client.get(f"/api/v1/shorts/{short['id']}/captions/en").text
    )
    assert (
        "Esta es una historia" in client.get(f"/api/v1/shorts/{short['id']}/captions/original").text
    )
