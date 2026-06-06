-- V003: BO integration — application memos + audit log JSON fields

CREATE TABLE IF NOT EXISTS application_memos (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  admin_user_id   INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS before_data JSONB;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS after_data JSONB;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
