from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SMARTCLIPPER_", env_file=".env", extra="ignore")

    data_dir: Path = Path("data")
    database_url: str = "sqlite:///data/smartclipper.db"
    max_upload_bytes: int = 200 * 1024 * 1024
    max_duration_seconds: int = 1800
    ffprobe_path: str = "ffprobe"
    ffmpeg_path: str = "ffmpeg"
    allowed_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
