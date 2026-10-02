from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SMARTCLIPPER_", env_file=".env", extra="ignore")

    data_dir: Path = Path("data")
    database_url: str = "sqlite:///data/smartclipper.db"
    max_upload_bytes: int = 3 * 1024 * 1024 * 1024
    max_duration_seconds: int = 3600
    max_audio_bytes: int = 20 * 1024 * 1024
    max_link_imports: int = 2
    ffprobe_path: str = "ffprobe"
    ffmpeg_path: str = "ffmpeg"
    allowed_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
    allowed_hosts: list[str] = ["127.0.0.1", "localhost", "testserver"]
    public_url: str = "http://127.0.0.1:5173"
    session_secret: str = ""
    secure_cookies: bool = False
    google_client_id: str = ""
    google_client_secret: str = ""
    facebook_client_id: str = ""
    facebook_client_secret: str = ""
    facebook_api_version: str = ""
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    max_generation_jobs: int = 2
    openai_api_key: str = ""
    ranking_model: str = ""
    hosted_ranking_enabled: bool = False
    analytics_admin_user_ids: list[str] = []
