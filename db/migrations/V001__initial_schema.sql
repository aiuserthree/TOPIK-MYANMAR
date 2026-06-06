-- V001: Core schema (users, exam, applications, content, admin, files, board)

CREATE TABLE IF NOT EXISTS file_attachments (
  id              SERIAL PRIMARY KEY,
  owner_type      VARCHAR(50) NOT NULL,
  owner_id        INTEGER NOT NULL DEFAULT 0,
  storage_key     VARCHAR(500) NOT NULL,
  original_filename VARCHAR(255),
  mime_type       VARCHAR(100) NOT NULL,
  size_bytes      INTEGER NOT NULL,
  checksum_sha256 VARCHAR(64),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  email             VARCHAR(255) NOT NULL UNIQUE,
  password_hash     VARCHAR(255),
  signup_provider   VARCHAR(20) NOT NULL DEFAULT 'email',
  google_sub        VARCHAR(255) UNIQUE,
  name_ko           VARCHAR(100) NOT NULL,
  name_en           VARCHAR(200) NOT NULL,
  birth_date        VARCHAR(8) NOT NULL,
  gender            VARCHAR(1) NOT NULL,
  nationality       VARCHAR(100) NOT NULL,
  first_language    VARCHAR(100) NOT NULL,
  phone             VARCHAR(50) NOT NULL,
  job_code          INTEGER NOT NULL,
  motive_code       INTEGER NOT NULL,
  purpose_code      INTEGER NOT NULL,
  photo_file_id     INTEGER REFERENCES file_attachments(id) ON DELETE SET NULL,
  preferred_lang    VARCHAR(5) NOT NULL DEFAULT 'ko',
  marketing_opt_in  BOOLEAN NOT NULL DEFAULT FALSE,
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
  password_changed_at TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  rev               INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS country_region_codes (
  id            SERIAL PRIMARY KEY,
  country_code  VARCHAR(3) NOT NULL,
  region_code   VARCHAR(3) NOT NULL,
  name_ko       VARCHAR(100) NOT NULL,
  name_en       VARCHAR(100),
  UNIQUE (country_code, region_code)
);

CREATE TABLE IF NOT EXISTS exam_venues (
  id            SERIAL PRIMARY KEY,
  venue_code    VARCHAR(2) NOT NULL UNIQUE,
  name_ko       VARCHAR(200) NOT NULL,
  name_en       VARCHAR(200),
  address       TEXT,
  country_code  VARCHAR(3) NOT NULL DEFAULT '025',
  region_code   VARCHAR(3) NOT NULL,
  capacity      INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  memo          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (country_code, region_code)
    REFERENCES country_region_codes(country_code, region_code)
);

CREATE TABLE IF NOT EXISTS exam_rounds (
  id                      SERIAL PRIMARY KEY,
  round_no                INTEGER NOT NULL UNIQUE,
  title                   VARCHAR(200) NOT NULL,
  exam_date               DATE NOT NULL,
  result_date             DATE,
  registration_start_at   TIMESTAMPTZ NOT NULL,
  registration_end_at     TIMESTAMPTZ NOT NULL,
  fee_level_i             INTEGER NOT NULL,
  fee_level_ii            INTEGER NOT NULL,
  capacity                INTEGER NOT NULL,
  registration_status     VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  exam_number_visible_at  TIMESTAMPTZ,
  exam_numbers_assigned_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_round_venues (
  exam_round_id   INTEGER NOT NULL REFERENCES exam_rounds(id) ON DELETE CASCADE,
  exam_venue_id   INTEGER NOT NULL REFERENCES exam_venues(id) ON DELETE RESTRICT,
  PRIMARY KEY (exam_round_id, exam_venue_id)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id                    SERIAL PRIMARY KEY,
  email                 VARCHAR(255) NOT NULL UNIQUE,
  password_hash         VARCHAR(255) NOT NULL,
  name                  VARCHAR(100) NOT NULL,
  role                  VARCHAR(20) NOT NULL DEFAULT 'admin',
  status                VARCHAR(20) NOT NULL DEFAULT 'active',
  password_changed_at   TIMESTAMPTZ,
  must_change_password  BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_submissions (
  id                        SERIAL PRIMARY KEY,
  user_id                   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_round_id             INTEGER NOT NULL REFERENCES exam_rounds(id) ON DELETE RESTRICT,
  exam_venue_id             INTEGER NOT NULL REFERENCES exam_venues(id) ON DELETE RESTRICT,
  photo_checklist_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  accommodation_requested   BOOLEAN NOT NULL DEFAULT FALSE,
  status                    VARCHAR(30) NOT NULL DEFAULT 'submitted',
  submitted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at              TIMESTAMPTZ,
  cancel_reason             TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exam_round_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id                    SERIAL PRIMARY KEY,
  submission_id         INTEGER NOT NULL REFERENCES application_submissions(id) ON DELETE CASCADE,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_round_id         INTEGER NOT NULL REFERENCES exam_rounds(id) ON DELETE RESTRICT,
  exam_venue_id         INTEGER NOT NULL REFERENCES exam_venues(id) ON DELETE RESTRICT,
  exam_level            VARCHAR(2) NOT NULL,
  application_no        VARCHAR(30),
  photo_file_id         INTEGER REFERENCES file_attachments(id) ON DELETE SET NULL,
  photo_review_status   VARCHAR(20) NOT NULL DEFAULT 'pending',
  photo_reject_code     VARCHAR(30),
  photo_reject_note     TEXT,
  status                VARCHAR(30) NOT NULL DEFAULT 'submitted',
  payment_status        VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  payment_receipt_no    VARCHAR(50),
  payment_memo          TEXT,
  paid_at               TIMESTAMPTZ,
  payment_cancel_reason TEXT,
  exam_number           VARCHAR(13),
  exam_number_visible   BOOLEAN NOT NULL DEFAULT FALSE,
  reject_reason         TEXT,
  cancel_reason         TEXT,
  cancelled_at          TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  rev                   INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_round_status ON applications(exam_round_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_user_round ON applications(user_id, exam_round_id);

CREATE TABLE IF NOT EXISTS application_memos (
  id              SERIAL PRIMARY KEY,
  application_id  INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  admin_user_id   INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notices (
  id                SERIAL PRIMARY KEY,
  category          VARCHAR(30) NOT NULL,
  title             VARCHAR(300) NOT NULL,
  body_html         TEXT NOT NULL DEFAULT '',
  is_pinned         BOOLEAN NOT NULL DEFAULT FALSE,
  is_published      BOOLEAN NOT NULL DEFAULT FALSE,
  view_count        INTEGER NOT NULL DEFAULT 0,
  author_admin_id   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faq_items (
  id            SERIAL PRIMARY KEY,
  category      VARCHAR(30) NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  question_ko   TEXT NOT NULL,
  question_my   TEXT,
  question_en   TEXT,
  answer_ko     TEXT NOT NULL,
  answer_my     TEXT,
  answer_en     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS terms (
  id            SERIAL PRIMARY KEY,
  term_type     VARCHAR(20) NOT NULL,
  version       VARCHAR(20) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  body_ko       TEXT NOT NULL DEFAULT '',
  body_my       TEXT,
  body_en       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'draft',
  effective_at  DATE,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (term_type, version)
);

CREATE TABLE IF NOT EXISTS board_posts (
  id                    SERIAL PRIMARY KEY,
  board_type            VARCHAR(24) NOT NULL,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category              VARCHAR(16),
  post_type             VARCHAR(16),
  title                 VARCHAR(100) NOT NULL,
  body                  TEXT NOT NULL DEFAULT '',
  is_secret             BOOLEAN NOT NULL DEFAULT FALSE,
  secret_password_hash  VARCHAR(255),
  workflow_status       VARCHAR(16) NOT NULL DEFAULT 'received',
  admin_reply           TEXT,
  admin_replied_at      TIMESTAMPTZ,
  admin_replier_id      INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS board_comments (
  id                  SERIAL PRIMARY KEY,
  board_post_id       INTEGER NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  parent_comment_id   INTEGER REFERENCES board_comments(id) ON DELETE CASCADE,
  author_user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_admin_id     INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  body                TEXT NOT NULL,
  is_secret           BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id              SERIAL PRIMARY KEY,
  admin_user_id   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  action_type     VARCHAR(50) NOT NULL,
  target_type     VARCHAR(50) NOT NULL,
  target_id       VARCHAR(50) NOT NULL,
  before_data     JSONB,
  after_data      JSONB,
  memo            TEXT,
  ip_address      VARCHAR(45),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_target ON admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS email_outbox (
  id            SERIAL PRIMARY KEY,
  template_key  VARCHAR(50) NOT NULL,
  to_email      VARCHAR(255) NOT NULL,
  user_id       INTEGER,
  locale        VARCHAR(5) NOT NULL DEFAULT 'ko',
  variables     JSONB NOT NULL DEFAULT '{}',
  status        VARCHAR(20) NOT NULL DEFAULT 'queued',
  retry_count   INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error    TEXT,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id          SERIAL PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verify_email ON email_verification_codes(email);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          SERIAL PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_email ON password_reset_tokens(email);
