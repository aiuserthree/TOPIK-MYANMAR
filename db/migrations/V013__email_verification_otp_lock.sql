-- OTP 인증코드 연속 실패 횟수 (회원가입·비밀번호 재설정)
ALTER TABLE email_verification_codes
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
