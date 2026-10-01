"""64-bit byte counts for the 3 GiB upload cap.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("projects") as batch:
        batch.alter_column("size_bytes", existing_type=sa.Integer(), type_=sa.BigInteger())


def downgrade():
    count = op.get_bind().scalar(
        sa.text("SELECT COUNT(*) FROM projects WHERE size_bytes > 2147483647")
    )
    if count:
        raise ValueError("Cannot downgrade byte counts while projects over 2 GiB are stored.")
    with op.batch_alter_table("projects") as batch:
        batch.alter_column("size_bytes", existing_type=sa.BigInteger(), type_=sa.Integer())
