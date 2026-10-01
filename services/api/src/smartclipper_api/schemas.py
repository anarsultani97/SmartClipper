import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class ProjectView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    filename: str
    size_bytes: int
    status: str
    error: str | None
    duration_seconds: float | None
    width: int | None
    height: int | None
    has_audio: bool
    start_ms: int
    end_ms: int
    revision: int
    detected_language: str | None = None
    transcript_language: str | None = None


LANGUAGES = {"en", "es", "zh", "hi", "ar", "pt", "bn", "ru", "ja", "fr", "tr"}


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(default="Creator", min_length=1, max_length=80)


class GenerateOptions(BaseModel):
    language: str = "auto"
    platform: Literal["youtube", "tiktok", "instagram", "facebook"] = "youtube"
    duration_seconds: int = Field(default=45, ge=15, le=180)
    count: int = Field(default=5, ge=1, le=5)
    english_subtitles: bool = False

    @model_validator(mode="after")
    def supported_language(self):
        if self.language != "auto" and self.language not in LANGUAGES:
            raise ValueError("Choose a supported language or auto-detect.")
        return self


class TranscriptUpload(BaseModel):
    language: str
    srt: str = Field(min_length=1, max_length=200000)

    @model_validator(mode="after")
    def supported_language(self):
        if self.language not in LANGUAGES:
            raise ValueError("Choose the language of your transcript.")
        return self


class ShortEdit(BaseModel):
    revision: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=100)
    subtitles: bool = True
    subtitle_language: Literal["original", "en"] = "original"
    music: Literal["none", "bright", "calm", "pulse"] = "none"
    thumbnail: int = Field(default=0, ge=0, le=3)
    thumbnail_style: Literal["bold", "clean", "minimal"] = "bold"
    thumbnail_text: str = Field(default="", max_length=100)


class Caption(BaseModel):
    start: float
    end: float
    text: str


class ThumbnailView(BaseModel):
    index: int
    time_seconds: float
    sharpness: float | None = None
    brightness: float | None = None


class ShortView(BaseModel):
    id: str
    project_id: str
    job_id: str
    title: str
    summary: list[str]
    start_ms: int
    end_ms: int
    thumbnails: list[ThumbnailView]
    thumbnail: int
    thumbnail_style: str
    thumbnail_text: str
    subtitles: bool
    subtitle_language: str
    music: str
    revision: int
    export_revision: int | None
    quality_note: str
    english_available: bool
    transcript: list[Caption]


class JobView(BaseModel):
    id: str
    project_id: str
    kind: str
    status: str
    stage: str
    error: str | None
    options: dict


class ClipSelection(BaseModel):
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    revision: int = Field(ge=1)

    @model_validator(mode="after")
    def valid_range(self):
        if self.end_ms <= self.start_ms:
            raise ValueError("End must be after start.")
        return self


def validate_metadata(metadata: dict, max_duration: int) -> dict:
    videos = [s for s in metadata.get("streams", []) if s.get("codec_type") == "video"]
    if not videos:
        raise ValueError("This file has no playable video stream.")
    if not {"mov", "mp4"}.intersection(
        metadata.get("format", {}).get("format_name", "").split(",")
    ):
        raise ValueError("Choose a valid MP4 video.")
    duration = float(metadata.get("format", {}).get("duration", 0))
    width, height = int(videos[0].get("width", 0)), int(videos[0].get("height", 0))
    if not math.isfinite(duration) or not 0 < duration <= max_duration:
        raise ValueError(f"Video duration must be between 0 and {max_duration // 60} minutes.")
    if not 0 < width <= 7680 or not 0 < height <= 7680:
        raise ValueError("Video resolution is unsupported.")
    if width * height > 40_000_000 or not 0.1 <= width / height <= 10:
        raise ValueError("Video dimensions are unsupported.")
    return {
        "duration_seconds": duration,
        "width": width,
        "height": height,
        "has_audio": int(any(s.get("codec_type") == "audio" for s in metadata["streams"])),
    }
