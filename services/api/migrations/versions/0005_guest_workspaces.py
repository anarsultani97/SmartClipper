"""Private guest workspaces before account registration."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("is_guest", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT COUNT(*) FROM users WHERE is_guest = true")):
        raise ValueError("Guest workspaces must be migrated before downgrading.")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("is_guest")
