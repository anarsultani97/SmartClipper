import json

import httpx
import pytest
from fastapi.testclient import TestClient
from smartclipper_api.app import create_app
from smartclipper_api.config import Settings
from smartclipper_api.database import Base, Project
from smartclipper_api.highlights import candidates, semantic_rank


def test_google_state_pkce_and_callback_rejection(tmp_path, monkeypatch):
    settings = Settings(
        data_dir=tmp_path / "media",
        database_url=f"sqlite:///{tmp_path}/oauth.sqlite",
        google_client_id="test-client",
        google_client_secret="test-secret",
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.sessions.kw["bind"])
    google = app.state.oauth.create_client("google")

    async def metadata():
        return {
            "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_endpoint": "https://oauth2.googleapis.com/token",
            "code_challenge_methods_supported": ["S256"],
        }

    monkeypatch.setattr(google, "load_server_metadata", metadata)
    with TestClient(app) as client:
        started = client.get("/api/v1/auth/google/start", follow_redirects=False)
        assert started.status_code == 302
        url = started.headers["location"]
        assert "state=" in url and "nonce=" in url and "code_challenge=" in url
        assert "code_challenge_method=S256" in url
        assert "httponly" in started.headers["set-cookie"].lower()
        bad = client.get(
            "/api/v1/auth/google/callback?code=bad&state=wrong", follow_redirects=False
        )
        assert bad.status_code == 303
        assert "auth_error=expired" in bad.headers["location"]


def test_verified_google_callback_claims_guest_and_preserves_host_and_project(
    tmp_path, monkeypatch
):
    app = create_app(
        Settings(
            data_dir=tmp_path / "media",
            database_url=f"sqlite:///{tmp_path}/google.sqlite",
            google_client_id="test-client",
            google_client_secret="test-secret",
        )
    )
    Base.metadata.create_all(app.state.sessions.kw["bind"])
    google = app.state.oauth.create_client("google")

    async def metadata():
        return {
            "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
            "token_endpoint": "https://oauth2.googleapis.com/token",
            "code_challenge_methods_supported": ["S256"],
        }

    async def verified_exchange(request):
        # Exchange/ID-token validation is mocked here; the separate invalid-state test
        # exercises Authlib itself. This test covers ownership transfer after verification.
        return {
            "userinfo": {
                "sub": "google-subject",
                "email": "verified@example.com",
                "email_verified": True,
                "name": "Google account",
            }
        }

    monkeypatch.setattr(google, "load_server_metadata", metadata)
    with TestClient(app, base_url="http://localhost:5173") as client:
        visitor = client.post("/api/v1/auth/guest").json()
        client.headers["X-CSRF-Token"] = visitor["csrf"]
        project = client.post("/api/v1/projects?filename=x.mp4", content=b"video").json()
        target = f"/projects/{project['id']}/shorts"
        started = client.get(
            "/api/v1/auth/google/start", params={"return_to": target}, follow_redirects=False
        )
        assert "localhost%3A5173" in started.headers["location"]
        monkeypatch.setattr(google, "authorize_access_token", verified_exchange)
        response = client.get("/api/v1/auth/google/callback?code=verified", follow_redirects=False)
        assert response.status_code == 303
        assert response.headers["location"] == "http://localhost:5173" + target
        account = client.get("/api/v1/auth/me").json()
        assert not account["is_guest"]
        with app.state.sessions() as db:
            assert db.get(Project, project["id"]).owner_id == account["id"]


@pytest.mark.parametrize(
    "ids,status",
    [
        ([0], "completed"),
        ([999], "completed"),
        ([0, 0], "completed"),
        ([], "completed"),
        ([0], "incomplete"),
    ],
)
def test_hosted_rank_validates_ids_and_completion(monkeypatch, ids, status):
    settings = Settings(
        hosted_ranking_enabled=True,
        openai_api_key="unit-test-key",
        ranking_model="configured-test-model",
    )
    items = candidates(
        [{"start": 0, "end": 20, "text": "A complete helpful standalone thought."}], 30, 30
    )

    def response(url, **kwargs):
        assert url == "https://api.openai.com/v1/responses"
        assert kwargs["json"]["store"] is False
        assert kwargs["json"]["max_output_tokens"] == 1000
        assert kwargs["json"]["text"]["format"]["strict"]
        return httpx.Response(
            200,
            request=httpx.Request("POST", url),
            json={
                "status": status,
                "output": [
                    {"content": [{"type": "output_text", "text": json.dumps({"ranked_ids": ids})}]}
                ],
            },
        )

    monkeypatch.setattr("smartclipper_api.highlights.httpx.post", response)
    if ids == [0] and status == "completed":
        result, note = semantic_rank(items, settings, "youtube")
        assert result[0]["start"] == 0 and "AI-ranked" in note
    else:
        with pytest.raises(ValueError):
            semantic_rank(items, settings, "youtube")


def test_local_ranking_does_not_send_transcript_to_hosted_provider(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Local mode must never call hosted inference.")

    monkeypatch.setattr("smartclipper_api.highlights.httpx.post", forbidden)
    assert semantic_rank([], Settings(), "tiktok")[0] == []
