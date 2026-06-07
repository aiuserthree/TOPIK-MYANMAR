-- V007: pgvector extension + semantic search schema
-- FAQ/공지 의미 검색, RAG 챗봇, 유사 문의·중복 접수 탐지용 embedding 저장소
--
-- CREATE EXTENSION 은 superuser 권한이 필요합니다.
-- `sudo -u postgres psql -f <path>` 는 OS user postgres 가 경로를 직접 열기 때문에
-- /root 등 제한 디렉터리·비공개 상위 경로에서는 Permission denied 가 납니다.
-- root(또는 현재 셸)가 파일을 읽고 postgres 로 SQL 을 넘기는 stdin 방식을 사용하세요.
--
-- IwinV DB VPS (저장소: /opt/myanmar-v2):
--   sudo apt install -y postgresql-15-pgvector
--   sudo -u postgres psql -d topik_myanmar < /opt/myanmar-v2/db/migrations/V007__pgvector_semantic_search.sql
-- 저장소 없을 때: scp 로 /tmp 에 복사 후 chmod 644, 동일하게 stdin 또는 -f /tmp/... 적용
--
-- 로컬 (repo root):
--   sudo -u postgres psql -d topik_myanmar < db/migrations/V007__pgvector_semantic_search.sql
-- 로컬 Docker (docker-compose.pgvector.yml):
--   docker compose -f docker-compose.pgvector.yml up -d
--   psql "$DATABASE_URL" -f db/migrations/V007__pgvector_semantic_search.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS semantic_chunks (
  id                BIGSERIAL PRIMARY KEY,
  source_type       VARCHAR(32) NOT NULL,
  source_id         INTEGER NOT NULL,
  locale            VARCHAR(5) NOT NULL DEFAULT 'ko',
  chunk_index       INTEGER NOT NULL DEFAULT 0,
  title             TEXT,
  content           TEXT NOT NULL,
  content_hash      VARCHAR(64) NOT NULL,
  embedding         vector(1536),
  embedding_model   VARCHAR(64),
  embedded_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_semantic_chunks_source UNIQUE (source_type, source_id, locale, chunk_index),
  CONSTRAINT chk_semantic_chunks_source_type CHECK (
    source_type IN ('notice', 'faq', 'board_post', 'application', 'terms', 'rag_corpus')
  )
);

CREATE INDEX IF NOT EXISTS idx_semantic_chunks_source
  ON semantic_chunks (source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_semantic_chunks_locale
  ON semantic_chunks (locale);

CREATE INDEX IF NOT EXISTS idx_semantic_chunks_pending
  ON semantic_chunks (source_type)
  WHERE embedding IS NULL;

CREATE INDEX IF NOT EXISTS idx_semantic_chunks_embedding_hnsw
  ON semantic_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

COMMENT ON TABLE semantic_chunks IS
  'Unified embedding chunks for semantic FAQ/notice search, RAG chatbot, duplicate application detection';
COMMENT ON COLUMN semantic_chunks.source_type IS
  'notice | faq | board_post | application | terms | rag_corpus';
COMMENT ON COLUMN semantic_chunks.embedding IS
  '1536-dim default (OpenAI text-embedding-3-small/large compatible)';
