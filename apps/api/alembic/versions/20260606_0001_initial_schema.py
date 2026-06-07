"""initial schema — ORM snapshot for a new empty database

Revision ID: 20260606_0001
Revises:
Create Date: 2026-06-06

Creates tables from SQLAlchemy metadata for local/bootstrap use. Production
schema history is still the SQL chain in db/migrations/V001 through V006; do
not mix this revision into an already-migrated production database.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

import app.models  # noqa: F401 — register metadata
from app.database import Base

revision: str = "20260606_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
