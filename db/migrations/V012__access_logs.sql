-- 관리자·회원 접근 로그 (BO 감사 화면용, append-only)

CREATE TABLE IF NOT EXISTS admin_access_logs (
  id              SERIAL PRIMARY KEY,
  admin_user_id   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  admin_email     VARCHAR(255),
  action_type     VARCHAR(30) NOT NULL,
  success         BOOLEAN NOT NULL DEFAULT true,
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  memo            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_access_user_created
  ON admin_access_logs(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_access_created
  ON admin_access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_access_action
  ON admin_access_logs(action_type, created_at DESC);

CREATE TABLE IF NOT EXISTS member_access_logs (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email           VARCHAR(255),
  action_type     VARCHAR(30) NOT NULL,
  path            VARCHAR(255),
  success         BOOLEAN NOT NULL DEFAULT true,
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  memo            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_access_user_created
  ON member_access_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_access_created
  ON member_access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_access_email
  ON member_access_logs(email, created_at DESC);
