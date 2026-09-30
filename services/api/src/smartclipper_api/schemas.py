import math

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
