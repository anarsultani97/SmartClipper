"""Persist processing progress, transcription provenance and caption styles."""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "projects", sa.Column("progress", sa.Integer(), server_default="0", nullable=False)
    )
    op.add_column(
        "projects",
        sa.Column("stage", sa.String(80), server_default="Waiting for worker", nullable=False),
    )
    op.add_column("projects", sa.Column("transcription_profile", sa.JSON(), nullable=True))
    op.add_column("jobs", sa.Column("progress", sa.Integer(), server_default="0", nullable=False))
    op.add_column(
        "shorts", sa.Column("caption_style", sa.String(20), server_default="pop", nullable=False)
    )
    op.add_column(
        "shorts",
        sa.Column("caption_position", sa.String(20), server_default="lower", nullable=False),
    )
    # Existing completed media should not display 0% after migration.
    op.execute("UPDATE projects SET progress = 100, stage = 'Ready' WHERE status = 'ready'")
    op.execute("UPDATE jobs SET progress = 100 WHERE status = 'ready'")


def downgrade():
    op.drop_column("shorts", "caption_position")
    op.drop_column("shorts", "caption_style")
    op.drop_column("jobs", "progress")
    op.drop_column("projects", "transcription_profile")
    op.drop_column("projects", "stage")
    op.drop_column("projects", "progress")
