from smartclipper_api.database import Project
from sqlalchemy import select


def upload(client, name="podcast.mp4", content=b"video-test"):
    return client.post("/api/v1/projects", params={"filename": name}, content=content)


def test_upload_persists_and_is_queued(client, app):
    response = upload(client)
    assert response.status_code == 202
    project = response.json()
    assert project["status"] == "queued"
    assert project["size_bytes"] == 10
    assert client.get("/api/v1/projects").json()[0]["id"] == project["id"]
    assert (
        app.state.settings.data_dir / project["id"] / "source.mp4"
    ).read_bytes() == b"video-test"


def test_bad_extension(client, app):
    assert upload(client, "audio.mp3").status_code == 415
    assert not list(app.state.settings.data_dir.iterdir())


def test_stream_limit_without_content_length(client, app):
    response = client.post(
        "/api/v1/projects?filename=stream.mp4", content=iter([b"x" * 600, b"x" * 600])
    )
    assert response.status_code == 413
    assert not list(app.state.settings.data_dir.iterdir())


def test_empty_upload(client, app):
    assert upload(client, content=b"").status_code in (400, 413)
    assert not list(app.state.settings.data_dir.iterdir())


def test_oversized_upload(client, app):
    assert upload(client, content=b"x" * 1025).status_code == 413
    assert not list(app.state.settings.data_dir.iterdir())


def test_untrusted_origin(client):
    response = client.post(
        "/api/v1/projects?filename=x.mp4",
        content=b"x",
        headers={"Origin": "https://unrelated.example"},
    )
    assert response.status_code == 403


def test_unknown_project_and_path_kind(client):
    assert client.get("/api/v1/projects/missing").status_code == 404
    assert client.get("/api/v1/projects/missing/media/secret").status_code == 404


def test_filename_traversal_is_not_storage_path(client):
    response = upload(client, "../../video.mp4")
    assert response.json()["filename"] == "video.mp4"


def test_selection_validates_duration_and_revision(client, app):
    project_id = upload(client).json()["id"]
    with app.state.sessions() as session:
        project = session.get(Project, project_id)
        project.status, project.duration_seconds, project.end_ms = "ready", 100.0, 60000
        session.commit()
    url = f"/api/v1/projects/{project_id}/selection"
    valid = {"start_ms": 12000, "end_ms": 48000, "revision": 1}
    result = client.patch(url, json=valid)
    assert result.status_code == 200
    assert result.json()["revision"] == 2
    assert client.patch(url, json=valid).status_code == 409
    assert client.patch(url, json={**valid, "revision": 2, "end_ms": 110000}).status_code == 422
    assert client.patch(url, json={**valid, "end_ms": 5000}).status_code == 422


def test_media_is_unavailable_before_ready(client):
    project_id = upload(client).json()["id"]
    assert client.get(f"/api/v1/projects/{project_id}/media/preview").status_code == 409


def test_retry_only_failed_projects(client, app):
    project_id = upload(client).json()["id"]
    endpoint = f"/api/v1/projects/{project_id}/retry"
    assert client.post(endpoint).status_code == 409
    with app.state.sessions() as session:
        project = session.get(Project, project_id)
        project.status, project.error = "failed", "broken"
        session.commit()
    assert client.post(endpoint).json()["status"] == "queued"


def test_failed_import_metadata_is_persisted(client, app):
    upload(client)
    with app.state.sessions() as session:
        assert session.scalar(select(Project)).filename == "podcast.mp4"


def test_default_three_gib_limit_and_large_byte_count_roundtrip(client, app):
    from smartclipper_api.config import Settings
    from sqlalchemy import BigInteger

    assert Settings(_env_file=None).max_upload_bytes == 3 * 1024**3
    assert isinstance(Project.__table__.c.size_bytes.type, BigInteger)
    project_id = upload(client).json()["id"]
    with app.state.sessions() as db:
        db.get(Project, project_id).size_bytes = 2_700_000_000
        db.commit()
    assert client.get(f"/api/v1/projects/{project_id}").json()["size_bytes"] == 2_700_000_000


def test_turkish_generation_is_accepted(client, app):
    project_id = upload(client).json()["id"]
    with app.state.sessions() as db:
        project = db.get(Project, project_id)
        project.status, project.duration_seconds = "ready", 100
        db.commit()
    result = client.post(f"/api/v1/projects/{project_id}/generate", json={"language": "tr"})
    assert result.status_code == 202
    assert result.json()["options"]["language"] == "tr"


def test_delete_queued_video_removes_files_and_hides_project(client, app):
    project_id = upload(client).json()["id"]
    folder = app.state.settings.data_dir / project_id
    assert folder.exists()
    assert client.delete(f"/api/v1/projects/{project_id}").status_code == 202
    assert not folder.exists()
    assert client.get("/api/v1/projects").json() == []
    assert client.get(f"/api/v1/projects/{project_id}").status_code == 404
    assert client.delete(f"/api/v1/projects/{project_id}").status_code == 404


def test_ready_video_cannot_be_removed_through_queue_action(client, app):
    project_id = upload(client).json()["id"]
    with app.state.sessions() as db:
        db.get(Project, project_id).status = "ready"
        db.commit()
    assert client.delete(f"/api/v1/projects/{project_id}").status_code == 409
    assert (app.state.settings.data_dir / project_id / "source.mp4").exists()
