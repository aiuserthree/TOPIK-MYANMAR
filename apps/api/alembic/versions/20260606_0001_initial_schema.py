"""initial schema — V001 core tables + application_drafts (V005)

Revision ID: 20260606_0001
Revises:
Create Date: 2026-06-06

Reconstructs the documented PostgreSQL schema (V001–V004 semantics) for the
FastAPI stack. Legacy SQL files V001–V004 are not in the repo; this revision
is the Alembic-native source of truth going forward.
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
