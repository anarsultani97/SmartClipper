import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class LinkImport(BaseModel):
    url: str = Field(min_length=10, max_length=2048)


class AudioEdits(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    music_asset_id: str | None = Field(default=None, pattern=r"^[a-f0-9-]{36}$")
    voice_asset_id: str | None = Field(default=None, pattern=r"^[a-f0-9-]{36}$")
    music_volume: float = Field(default=0.16, ge=0, le=1)
    voice_volume: float = Field(default=1, ge=0, le=1)
    music_offset: float = Field(default=0, ge=0, le=600)
    voice_start: float = Field(default=0, ge=0, le=360)


class AudioAssetView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    short_id: str
    kind: str
    filename: str
    duration_seconds: float


class VideoEdits(BaseModel):
    """Small, reversible metadata; never accept arbitrary FFmpeg expressions."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    framing: Literal["vertical", "horizontal"] = "vertical"
    fit: Literal["fit", "fill"] = "fit"
    trim_start_ms: int = Field(default=0, ge=0)
    trim_end_ms: int | None = Field(default=None, gt=0)
    brightness: float = Field(default=0, ge=-0.3, le=0.3)
    contrast: float = Field(default=1, ge=0.5, le=1.5)
    saturation: float = Field(default=1, ge=0, le=2)
    speed: float = Field(default=1, ge=0.5, le=2)
    volume: float = Field(default=1, ge=0, le=1)
    fade_in: float = Field(default=0, ge=0, le=2)
    fade_out: float = Field(default=0, ge=0, le=2)
    rotation: Literal[0, 90, 180, 270] = 0
    flip: bool = False

    @model_validator(mode="after")
    def ordered_trim(self):
        if self.trim_end_ms is not None and self.trim_end_ms <= self.trim_start_ms:
            raise ValueError("Trim end must be after trim start.")
        return self


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
    progress: int = 0
    stage: str = "Waiting for worker"
    shorts_count: int = 0
    video_edits: VideoEdits = Field(default_factory=VideoEdits)


LANGUAGES = {"en", "es", "zh", "hi", "ar", "pt", "bn", "ru", "ja", "fr", "tr"}


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    name: str = Field(default="Creator", min_length=1, max_length=80)


class SignupCredentials(Credentials):
    password: str = Field(min_length=8, max_length=128)


class GenerateOptions(BaseModel):
    language: str = "auto"
    platform: Literal["youtube", "tiktok", "instagram", "facebook"] = "youtube"
    duration_seconds: int = Field(default=45, ge=15, le=180)
    count: int = Field(default=5, ge=1, le=5)
    english_subtitles: bool = False
    transcription_mode: Literal["fast", "balanced", "accurate"] = "balanced"
    vocabulary: str = Field(default="", max_length=160)
    thumbnail_focus: Literal["auto", "people", "gameplay", "scene"] = "auto"

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
    caption_style: Literal["pop", "clean", "karaoke"] = "pop"
    caption_position: Literal["lower", "middle"] = "lower"
    music: Literal["none", "bright", "calm", "pulse", "lofi", "cinematic", "playful", "custom"] = (
        "none"
    )
    thumbnail: int = Field(default=0, ge=0, le=3)
    thumbnail_style: Literal["bold", "clean", "minimal"] = "bold"
    thumbnail_text: str = Field(default="", max_length=100)
    video_edits: VideoEdits | None = None
    audio_edits: AudioEdits | None = None


class CaptionWord(BaseModel):
    start: float
    end: float
    text: str


class Caption(BaseModel):
    start: float
    end: float
    text: str
    words: list[CaptionWord] = Field(default_factory=list)
    review: bool = False


class CaptionEdit(BaseModel):
    revision: int = Field(ge=1)
    language: Literal["original", "en"] = "original"
    segments: list[Caption] = Field(min_length=1, max_length=300)

    @model_validator(mode="after")
    def valid_captions(self):
        previous = 0.0
        for cue in self.segments:
            if not (math.isfinite(cue.start) and math.isfinite(cue.end)):
                raise ValueError("Caption times must be finite.")
            if not previous <= cue.start < cue.end or not 1 <= len(cue.text.strip()) <= 500:
                raise ValueError("Use ordered, non-overlapping captions with 1–500 characters.")
            previous = cue.end
        return self


class ThumbnailView(BaseModel):
    index: int
    time_seconds: float
    sharpness: float | None = None
    brightness: float | None = None
    faces: int = 0
    reason: str = "Clear scene"
    framing: str = "full scene"


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
    caption_style: str = "pop"
    caption_position: str = "lower"
    music: str
    revision: int
    export_revision: int | None
    quality_note: str
    english_available: bool
    transcript: list[Caption]
    video_edits: VideoEdits = Field(default_factory=VideoEdits)
    audio_edits: AudioEdits = Field(default_factory=AudioEdits)


class JobView(BaseModel):
    id: str
    project_id: str
    kind: str
    status: str
    stage: str
    error: str | None
    options: dict
    progress: int = 0
    ready_count: int = 0
    planned_count: int | None = None


class ClipSelection(BaseModel):
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    revision: int = Field(ge=1)
    video_edits: VideoEdits | None = None

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
