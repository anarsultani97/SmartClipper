"""Coordinate guest claims with uploads that finish after sign-in."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("claimed_by", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_guest_claim_account", "users", ["claimed_by"], ["id"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT COUNT(*) FROM users WHERE claimed_by IS NOT NULL")):
        raise ValueError("Active guest claim mappings must be migrated before downgrading.")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("fk_guest_claim_account", type_="foreignkey")
        batch.drop_column("claimed_by")
