"""Indexes for on-demand activity queries.

Revision ID: 0003
Revises: 0002
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_jobs_created_at", "jobs", ["created_at"])
    op.create_index("ix_projects_created_at", "projects", ["created_at"])


def downgrade():
    op.drop_index("ix_jobs_created_at", "jobs")
    op.drop_index("ix_projects_created_at", "projects")
