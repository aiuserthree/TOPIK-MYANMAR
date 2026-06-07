-- V006: FO 응답 계약 정합화 + 보안/운영 + 수험번호/약관 동의이력
-- (계약서 2·4·5·6·7·9절) — idempotent where possible.

-- ---------------------------------------------------------------------------
-- 1. 미얀마 지역코드 시드 (수험번호 ② 지역코드 3자리: 양곤001/만달레이002/미치나003)
--    country_region_codes(country_code, region_code) UNIQUE 이므로 ON CONFLICT 무시.
-- ---------------------------------------------------------------------------
INSERT INTO country_region_codes (country_code, region_code, name_ko, name_en) VALUES
  ('025', '001', '양곤',   'Yangon'),
  ('025', '002', '만달레이', 'Mandalay'),
  ('025', '003', '미치나',  'Myitkyina')
ON CONFLICT (country_code, region_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. 시험장 코드(④ 2자리)는 "같은 지역 내 01부터" 규칙 → 전역 UNIQUE를 지역별 UNIQUE로 변경.
--    (동일 venue_code '01'이 양곤·만달레이에 각각 존재 가능해야 함)
-- ---------------------------------------------------------------------------
ALTER TABLE exam_venues DROP CONSTRAINT IF EXISTS exam_venues_venue_code_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exam_venues_region_venue_unique'
  ) THEN
    ALTER TABLE exam_venues
      ADD CONSTRAINT exam_venues_region_venue_unique
      UNIQUE (country_code, region_code, venue_code);
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3. 로그인 5회 실패 계정 잠금 (FO users / BO admin_users)
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 4. 비밀글 5회 실패 잠금 (board_posts.is_secret / secret_password_hash 는 V001 존재)
-- ---------------------------------------------------------------------------
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS secret_fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE board_posts ADD COLUMN IF NOT EXISTS secret_locked_until TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 5. 약관 동의 이력 (가입 시 동의한 약관 종류/버전 영속화)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS terms_consents (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  term_id       INTEGER REFERENCES terms(id) ON DELETE SET NULL,
  term_type     VARCHAR(20) NOT NULL,
  version       VARCHAR(20) NOT NULL DEFAULT '',
  agreed        BOOLEAN NOT NULL DEFAULT TRUE,
  ip_address    VARCHAR(45),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_terms_consents_user ON terms_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_terms_consents_type ON terms_consents(term_type, created_at DESC);
