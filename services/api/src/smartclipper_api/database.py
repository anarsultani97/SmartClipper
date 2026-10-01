from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    create_engine,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    filename: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    stage: Mapped[str] = mapped_column(
        String(80), default="Waiting for worker", server_default="Waiting for worker"
    )
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_audio: Mapped[int] = mapped_column(Integer, default=0)
    start_ms: Mapped[int] = mapped_column(Integer, default=0)
    end_ms: Mapped[int] = mapped_column(Integer, default=0)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    transcript: Mapped[list | None] = mapped_column(JSON, nullable=True)
    detected_language: Mapped[str | None] = mapped_column(String(12), nullable=True)
    transcript_language: Mapped[str | None] = mapped_column(String(12), nullable=True)
    transcription_profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    video_edits: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    claimed_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", name="fk_guest_claim_account"), nullable=True
    )


class Identity(Base):
    __tablename__ = "identities"
    __table_args__ = (UniqueConstraint("provider", "subject"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(255))


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    csrf: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[float] = mapped_column(Float)


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        Index(
            "uq_active_job_project",
            "project_id",
            unique=True,
            sqlite_where=text("status IN ('queued', 'processing')"),
            postgresql_where=text("status IN ('queued', 'processing')"),
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="generate")
    status: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    stage: Mapped[str] = mapped_column(String(40), default="Waiting for worker")
    progress: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    options: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )


class Short(Base):
    __tablename__ = "shorts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    title: Mapped[str] = mapped_column(String(100))
    summary: Mapped[list] = mapped_column(JSON)
    start_ms: Mapped[int] = mapped_column(Integer)
    end_ms: Mapped[int] = mapped_column(Integer)
    transcript: Mapped[list] = mapped_column(JSON)
    english_transcript: Mapped[list | None] = mapped_column(JSON, nullable=True)
    thumbnails: Mapped[list] = mapped_column(JSON, default=list)
    thumbnail: Mapped[int] = mapped_column(Integer, default=0)
    thumbnail_style: Mapped[str] = mapped_column(String(20), default="bold")
    thumbnail_text: Mapped[str] = mapped_column(String(100), default="")
    subtitles: Mapped[int] = mapped_column(Integer, default=1)
    subtitle_language: Mapped[str] = mapped_column(String(12), default="original")
    caption_style: Mapped[str] = mapped_column(String(20), default="pop", server_default="pop")
    caption_position: Mapped[str] = mapped_column(
        String(20), default="lower", server_default="lower"
    )
    music: Mapped[str] = mapped_column(String(20), default="none")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    export_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_note: Mapped[str] = mapped_column(String(500), default="")
    video_edits: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")
    audio_edits: Mapped[dict] = mapped_column(JSON, default=dict, server_default="{}")


class AudioAsset(Base):
    __tablename__ = "audio_assets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    short_id: Mapped[str] = mapped_column(ForeignKey("shorts.id"), index=True)
    kind: Mapped[str] = mapped_column(String(12))
    filename: Mapped[str] = mapped_column(String(255))
    duration_seconds: Mapped[float] = mapped_column(Float)


def make_database(url: str):
    engine = create_engine(
        url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {}
    )
    return engine, sessionmaker(engine, expire_on_commit=False)
