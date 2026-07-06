-- 접수자 soft-delete (휴지통 30일 보관)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_applications_deleted_at
  ON applications (deleted_at) WHERE is_deleted = TRUE;
