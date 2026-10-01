"""Persist reversible source and short editing settings."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("projects", "shorts"):
        op.add_column(
            table, sa.Column("video_edits", sa.JSON(), server_default="{}", nullable=False)
        )


def downgrade():
    for table in ("shorts", "projects"):
        op.drop_column(table, "video_edits")
