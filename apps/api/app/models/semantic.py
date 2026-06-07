from __future__ import annotations

from datetime import datetime
from typing import Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, CheckConstraint, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.lib.semantic_search import EMBEDDING_DIMENSIONS, SEMANTIC_SOURCE_TYPES


class SemanticChunk(Base):
    """Embedding chunk for semantic search / RAG — db/migrations/V007 semantic_chunks."""

    __tablename__ = "semantic_chunks"
    __table_args__ = (
        UniqueConstraint("source_type", "source_id", "locale", "chunk_index", name="uq_semantic_chunks_source"),
        CheckConstraint(
            f"source_type IN ({', '.join(repr(t) for t in SEMANTIC_SOURCE_TYPES)})",
            name="chk_semantic_chunks_source_type",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    locale: Mapped[str] = mapped_column(String(5), nullable=False, server_default="ko")
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    title: Mapped[Optional[str]] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    embedding_model: Mapped[Optional[str]] = mapped_column(String(64))
    embedded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
