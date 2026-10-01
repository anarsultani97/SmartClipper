import time

from fastapi.testclient import TestClient
from smartclipper_api.auth import COOKIE, digest
from smartclipper_api.database import LoginSession, Project
from sqlalchemy import select


def signup(client, email="other@example.com"):
    response = client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": "correct-password-123", "name": "Other"},
    )
    assert response.status_code == 201, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    return response.json()


def test_auth_required_and_cookie_protection(app):
    with TestClient(app) as guest:
        assert guest.get("/api/v1/projects").status_code == 401
        user = signup(guest)
        assert "HttpOnly" in next(iter(guest.cookies.jar))._rest
        with app.state.sessions() as db:
            stored = db.get(LoginSession, digest(guest.cookies[COOKIE]))
            assert stored.token_hash != guest.cookies[COOKIE]
        guest.headers.pop("X-CSRF-Token")
        assert guest.post("/api/v1/projects?filename=x.mp4", content=b"x").status_code == 403
        guest.headers["X-CSRF-Token"] = user["csrf"]
        assert guest.post("/api/v1/auth/logout").status_code == 200
        assert guest.get("/api/v1/projects").status_code == 401


def test_login_rotation_expiry_and_bad_password(app):
    with TestClient(app) as client:
        signup(client)
        old = client.cookies[COOKIE]
        bad = {"email": "other@example.com", "password": "incorrect-password"}
        assert client.post("/api/v1/auth/login", json=bad).status_code == 401
        response = client.post(
            "/api/v1/auth/login", json={**bad, "password": "correct-password-123"}
        )
        assert response.status_code == 200
        assert client.cookies[COOKIE] != old
        with app.state.sessions() as db:
            db.get(LoginSession, digest(client.cookies[COOKIE])).expires_at = time.time() - 1
            db.commit()
        assert client.get("/api/v1/auth/me").status_code == 401


def test_owners_cannot_read_or_edit_each_others_projects(client, app):
    project = client.post("/api/v1/projects?filename=x.mp4", content=b"x").json()
    with TestClient(app) as other:
        signup(other)
        assert other.get("/api/v1/projects").json() == []
        for endpoint in ("", "/media/preview", "/shorts", "/jobs"):
            assert other.get(f"/api/v1/projects/{project['id']}{endpoint}").status_code == 404
        assert other.delete(f"/api/v1/projects/{project['id']}").status_code == 404
        assert other.post(f"/api/v1/projects/{project['id']}/generate", json={}).status_code == 404
        assert (
            other.patch(
                f"/api/v1/projects/{project['id']}/selection",
                json={"start_ms": 0, "end_ms": 1000, "revision": 1},
            ).status_code
            == 404
        )


def test_legacy_ownerless_projects_are_not_claimed_by_first_signup(client, app):
    with app.state.sessions() as db:
        db.add(Project(id="legacy", filename="private.mp4", size_bytes=4, status="ready"))
        db.commit()
    assert client.get("/api/v1/projects").json() == []
    assert client.get("/api/v1/projects/legacy").status_code == 404


def test_oauth_disabled_and_invalid_state(app):
    with TestClient(app) as client:
        assert client.get("/api/v1/auth/providers").json() == {"google": False, "facebook": False}
        assert client.get("/api/v1/auth/google/start").status_code == 503
        assert client.get("/api/v1/auth/google/callback?code=evil&state=evil").status_code == 503


def test_signup_password_email_and_origin_validation(app):
    with TestClient(app) as client:
        assert (
            client.post(
                "/api/v1/auth/signup", json={"email": "bad", "password": "short"}
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/v1/auth/signup",
                json={"email": "valid@example.com", "password": "long-password"},
                headers={"Origin": "https://evil.example"},
            ).status_code
            == 403
        )
        first = signup(client)
        assert (
            client.post(
                "/api/v1/auth/signup", json={"email": first["email"], "password": "long-password"}
            ).status_code
            == 409
        )


def test_analytics_permissions_and_ownership(client, app):
    client.post("/api/v1/projects?filename=x.mp4", content=b"x")
    own = client.get("/api/v1/analytics").json()
    assert own["totals"]["videos"] == 1
    assert own["totals"]["registered_users"] is None
    assert client.get("/api/v1/analytics?scope=team").status_code == 403
    assert "x.mp4" not in str(own)
    with TestClient(app) as other:
        signup(other)
        assert other.get("/api/v1/analytics").json()["totals"]["videos"] == 0
    app.state.settings.analytics_admin_user_ids = [own["user_id"]]
    team = client.get("/api/v1/analytics?scope=team").json()
    assert team["totals"]["videos"] == 1
    assert team["totals"]["registered_users"] == 2
    with app.state.sessions() as db:
        assert len(db.scalars(select(LoginSession)).all()) == 2
