from concurrent.futures import ThreadPoolExecutor
from threading import Event
from uuid import uuid4

from fastapi.testclient import TestClient
from smartclipper_api.auth import COOKIE, digest, safe_return_path
from smartclipper_api.database import Job, LoginSession, Project, Short, User
from sqlalchemy import select


def guest(client):
    response = client.post("/api/v1/auth/guest")
    assert response.status_code == 201, response.text
    user = response.json()
    assert user["is_guest"] and user["email"] == ""
    client.headers["X-CSRF-Token"] = user["csrf"]
    return user


def test_guest_private_workspace_persists_and_requires_csrf(app):
    with TestClient(app) as first, TestClient(app) as second:
        one, two = guest(first), guest(second)
        assert one["id"] != two["id"]
        assert first.post("/api/v1/auth/guest").json()["id"] == one["id"]
        project = first.post("/api/v1/projects?filename=talk.mp4", content=b"video").json()
        assert first.get("/api/v1/projects").json()[0]["id"] == project["id"]
        assert second.get(f"/api/v1/projects/{project['id']}").status_code == 404
        first.headers.pop("X-CSRF-Token")
        assert first.delete(f"/api/v1/projects/{project['id']}").status_code == 403


def test_guest_can_generate_but_must_register_to_export(app):
    with TestClient(app) as client:
        visitor = guest(client)
        old_token = client.cookies[COOKIE]
        project_id = client.post("/api/v1/projects?filename=talk.mp4", content=b"video").json()[
            "id"
        ]
        short_id, job_id = str(uuid4()), str(uuid4())
        with app.state.sessions() as db:
            project = db.get(Project, project_id)
            project.status, project.duration_seconds, project.has_audio = "ready", 100, 1
            db.commit()
        assert client.post(f"/api/v1/projects/{project_id}/generate", json={}).status_code == 202
        with app.state.sessions() as db:
            queued = db.scalar(select(Job).where(Job.project_id == project_id))
            queued.status = "failed"
            db.add(
                Job(id=job_id, project_id=project_id, status="ready", kind="generate", options={})
            )
            db.flush()
            db.add(
                Short(
                    id=short_id,
                    project_id=project_id,
                    job_id=job_id,
                    title="A clear story",
                    summary=["Opening", "Idea", "Ending"],
                    start_ms=0,
                    end_ms=20000,
                    transcript=[],
                    quality_note="Sampled",
                )
            )
            db.commit()
        assert client.get(f"/api/v1/projects/{project_id}/shorts").status_code == 200
        assert client.post(f"/api/v1/shorts/{short_id}/export").status_code == 401
        assert (
            client.get(f"/api/v1/shorts/{short_id}/media/export?job_id={job_id}").status_code == 401
        )
        assert client.get(f"/api/v1/projects/{project_id}/media/audio").status_code == 401
        signed = client.post(
            "/api/v1/auth/signup",
            json={"email": "new@example.com", "password": "eight888", "name": "New"},
        )
        assert signed.status_code == 201, signed.text
        assert not signed.json()["is_guest"]
        client.headers["X-CSRF-Token"] = signed.json()["csrf"]
        assert client.get(f"/api/v1/projects/{project_id}").status_code == 200
        assert client.post(f"/api/v1/shorts/{short_id}/export").status_code == 202
        with app.state.sessions() as db:
            assert db.get(Project, project_id).owner_id == signed.json()["id"] != visitor["id"]
            assert db.get(LoginSession, digest(old_token)) is None


def test_guest_login_claim_requires_correct_password_and_csrf(app, client):
    with TestClient(app) as visitor:
        user = guest(visitor)
        project_id = visitor.post("/api/v1/projects?filename=talk.mp4", content=b"video").json()[
            "id"
        ]
        body = {"email": "creator@example.com", "password": "wrong"}
        assert visitor.post("/api/v1/auth/login", json=body).status_code == 401
        body["password"] = "test-password-123"
        visitor.headers.pop("X-CSRF-Token")
        assert visitor.post("/api/v1/auth/login", json=body).status_code == 403
        visitor.headers["X-CSRF-Token"] = user["csrf"]
        signed = visitor.post("/api/v1/auth/login", json=body)
        assert signed.status_code == 200
        assert not signed.json()["is_guest"]
        assert client.get(f"/api/v1/projects/{project_id}").status_code == 200


def test_guest_claim_without_csrf_does_not_create_account(app):
    with TestClient(app) as client:
        guest(client)
        client.headers.pop("X-CSRF-Token")
        result = client.post(
            "/api/v1/auth/signup", json={"email": "blocked@example.com", "password": "eight888"}
        )
        assert result.status_code == 403
        with app.state.sessions() as db:
            assert db.scalar(select(User).where(User.email == "blocked@example.com")) is None


def test_oauth_return_paths_are_internal_only():
    for invalid in [
        "//evil.example",
        "https://evil.example",
        "/\\evil",
        "/projects/a/shorts?next=https://evil.example",
        "/projects/../shorts",
    ]:
        assert safe_return_path(invalid) == "/"
    assert (
        safe_return_path("/projects/a-b/shorts?thumbnail=c-d")
        == "/projects/a-b/shorts?thumbnail=c-d"
    )


def test_upload_finishing_during_signup_is_owned_by_the_new_account(app):
    started, finish = Event(), Event()

    def chunks():
        started.set()
        if not finish.wait(10):
            raise RuntimeError("Timed out waiting for concurrent sign-in")
        yield b"uploaded-video"

    with TestClient(app) as upload_client, TestClient(app) as auth_client:
        visitor = guest(upload_client)
        auth_client.cookies.update(upload_client.cookies)
        auth_client.headers["X-CSRF-Token"] = visitor["csrf"]
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(
                upload_client.post, "/api/v1/projects?filename=long-upload.mp4", content=chunks()
            )
            try:
                assert started.wait(5)
                signed = auth_client.post(
                    "/api/v1/auth/signup",
                    json={"email": "concurrent@example.com", "password": "eight888"},
                )
                assert signed.status_code == 201, signed.text
            finally:
                finish.set()
            uploaded = pending.result(timeout=5)
        assert uploaded.status_code == 202, uploaded.text
        visible = auth_client.get("/api/v1/projects").json()
        assert [item["id"] for item in visible] == [uploaded.json()["id"]]
        with app.state.sessions() as db:
            assert db.get(User, visitor["id"]).claimed_by == signed.json()["id"]
            assert db.get(Project, uploaded.json()["id"]).owner_id == signed.json()["id"]
