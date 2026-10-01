"""Public link imports and immutable per-short audio assets."""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("source_url", sa.String(2048), nullable=True))
    op.add_column(
        "shorts", sa.Column("audio_edits", sa.JSON(), nullable=False, server_default="{}")
    )
    op.create_table(
        "audio_assets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("short_id", sa.String(36), sa.ForeignKey("shorts.id"), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=False),
    )
    op.create_index("ix_audio_assets_short_id", "audio_assets", ["short_id"])


def downgrade():
    op.drop_table("audio_assets")
    op.drop_column("shorts", "audio_edits")
    op.drop_column("projects", "source_url")
