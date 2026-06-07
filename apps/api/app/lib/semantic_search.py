"""Semantic search / RAG scaffolding — embedding sync and query APIs are added in a later phase."""

from __future__ import annotations

from typing import Final

SEMANTIC_SOURCE_NOTICE: Final = "notice"
SEMANTIC_SOURCE_FAQ: Final = "faq"
SEMANTIC_SOURCE_BOARD_POST: Final = "board_post"
SEMANTIC_SOURCE_APPLICATION: Final = "application"
SEMANTIC_SOURCE_TERMS: Final = "terms"
SEMANTIC_SOURCE_RAG_CORPUS: Final = "rag_corpus"

SEMANTIC_SOURCE_TYPES: Final[tuple[str, ...]] = (
    SEMANTIC_SOURCE_NOTICE,
    SEMANTIC_SOURCE_FAQ,
    SEMANTIC_SOURCE_BOARD_POST,
    SEMANTIC_SOURCE_APPLICATION,
    SEMANTIC_SOURCE_TERMS,
    SEMANTIC_SOURCE_RAG_CORPUS,
)

EMBEDDING_DIMENSIONS: Final = 1536
DEFAULT_EMBEDDING_MODEL: Final = "text-embedding-3-small"
