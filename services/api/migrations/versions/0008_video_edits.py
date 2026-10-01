"""Persist reversible source and short editing settings."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

# Before editing existed, untouched imports used a 60-second selection that generation
# ignored. Revision 1 identifies those defaults; preserve explicit saved selections.
LEGACY_SELECTION_SQL = """
UPDATE projects SET end_ms = CAST(duration_seconds * 1000 AS BIGINT)
WHERE status = 'ready' AND revision = 1 AND start_ms = 0
AND end_ms = 60000 AND duration_seconds > 60
"""


def upgrade():
    for table in ("projects", "shorts"):
        op.add_column(
            table, sa.Column("video_edits", sa.JSON(), server_default="{}", nullable=False)
        )
    op.execute(LEGACY_SELECTION_SQL)


def downgrade():
    for table in ("shorts", "projects"):
        op.drop_column(table, "video_edits")
