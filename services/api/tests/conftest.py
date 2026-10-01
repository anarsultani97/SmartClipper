import pytest
from fastapi.testclient import TestClient
from smartclipper_api.app import create_app
from smartclipper_api.config import Settings
from smartclipper_api.database import Base


@pytest.fixture
def app(tmp_path):
    settings = Settings(
        data_dir=tmp_path / "media",
        database_url=f"sqlite:///{tmp_path}/test.db",
        max_upload_bytes=1024,
    )
    app = create_app(settings)
    Base.metadata.create_all(app.state.sessions.kw["bind"])
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        signup = client.post(
            "/api/v1/auth/signup",
            json={
                "email": "creator@example.com",
                "password": "test-password-123",
                "name": "Creator",
            },
        )
        client.headers["X-CSRF-Token"] = signup.json()["csrf"]
        yield client
