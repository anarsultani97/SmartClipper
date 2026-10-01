"""Owned projects, sessions, transcripts and durable short jobs.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    # New table definitions are frozen here, independent of application models.
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("password_hash", sa.String(255)),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_table(
        "identities",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.UniqueConstraint("provider", "subject"),
    )
    op.create_index("ix_identities_user_id", "identities", ["user_id"])
    op.create_table(
        "login_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("csrf", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.Float, nullable=False),
    )
    op.create_index("ix_login_sessions_user_id", "login_sessions", ["user_id"])
    with op.batch_alter_table("projects") as batch:
        batch.add_column(sa.Column("owner_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_project_owner", "users", ["owner_id"], ["id"])
        batch.add_column(sa.Column("transcript", sa.JSON))
        batch.add_column(sa.Column("detected_language", sa.String(12)))
        batch.add_column(sa.Column("transcript_language", sa.String(12)))
        batch.create_index("ix_projects_owner_id", ["owner_id"])
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("stage", sa.String(40), nullable=False),
        sa.Column("error", sa.String(500)),
        sa.Column("options", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_jobs_project_id", "jobs", ["project_id"])
    op.create_index("ix_jobs_status", "jobs", ["status"])
    op.create_index(
        "uq_active_job_project",
        "jobs",
        ["project_id"],
        unique=True,
        sqlite_where=sa.text("status IN ('queued', 'processing')"),
        postgresql_where=sa.text("status IN ('queued', 'processing')"),
    )
    op.create_table(
        "shorts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("job_id", sa.String(36), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("summary", sa.JSON, nullable=False),
        sa.Column("start_ms", sa.Integer, nullable=False),
        sa.Column("end_ms", sa.Integer, nullable=False),
        sa.Column("transcript", sa.JSON, nullable=False),
        sa.Column("english_transcript", sa.JSON),
        sa.Column("thumbnails", sa.JSON, nullable=False),
        sa.Column("thumbnail", sa.Integer, nullable=False),
        sa.Column("thumbnail_style", sa.String(20), nullable=False),
        sa.Column("thumbnail_text", sa.String(100), nullable=False),
        sa.Column("subtitles", sa.Integer, nullable=False),
        sa.Column("subtitle_language", sa.String(12), nullable=False),
        sa.Column("music", sa.String(20), nullable=False),
        sa.Column("revision", sa.Integer, nullable=False),
        sa.Column("export_revision", sa.Integer),
        sa.Column("quality_note", sa.String(500), nullable=False),
    )
    op.create_index("ix_shorts_project_id", "shorts", ["project_id"])
    op.create_index("ix_shorts_job_id", "shorts", ["job_id"])


def downgrade():
    op.drop_table("shorts")
    op.drop_table("jobs")
    with op.batch_alter_table("projects") as batch:
        batch.drop_constraint("fk_project_owner", type_="foreignkey")
        batch.drop_index("ix_projects_owner_id")
        for name in ("owner_id", "transcript", "detected_language", "transcript_language"):
            batch.drop_column(name)
    op.drop_table("login_sessions")
    op.drop_table("identities")
    op.drop_table("users")
