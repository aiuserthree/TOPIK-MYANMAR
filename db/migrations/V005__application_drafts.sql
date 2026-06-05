-- Application registration drafts (FO register.html temp save).
-- Policy: 정책_합의_워크시트 §2.13 NO.466 — 임시(TBD) 30일 보관 후 자동 삭제.

CREATE TABLE IF NOT EXISTS application_drafts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  CONSTRAINT application_drafts_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_application_drafts_expires_at
  ON application_drafts (expires_at);
