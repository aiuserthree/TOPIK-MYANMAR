-- V023: 예외 접수 처리(제110회~) — 마감 전후 관리자 예외 처리 3종의 흔적을 접수 행에 남긴다.
--   1) level_change : 토픽 Ⅰ·Ⅱ 혼동 접수자의 급수 정정(대상 급수 정원이 비었을 때만)
--   2) reinstate    : 접수자가 잘못 누른 '취소'를 '접수'로 되돌림
--   3) designated   : 한국 교민 자녀 등 마감 이후 지정 접수
--
-- 연명부·통계에서 일반 접수와 구분해 '특별 관리' 대상을 뽑을 수 있어야 하므로
-- 처리 유형·사유·시각·처리자를 접수 행에 함께 보관한다(감사 로그와 이중 기록).

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS exception_type     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS exception_reason   TEXT,
  ADD COLUMN IF NOT EXISTS exception_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exception_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN applications.exception_type IS
  '예외 처리 유형 — level_change(급수 정정) | reinstate(취소→접수 복원) | designated(마감 후 지정 접수). NULL=일반 접수';
COMMENT ON COLUMN applications.exception_reason IS '예외 처리 사유(관리자 입력, 필수)';
COMMENT ON COLUMN applications.exception_at IS '마지막 예외 처리 시각';
COMMENT ON COLUMN applications.exception_admin_id IS '마지막 예외 처리를 수행한 관리자';

-- 취소 직전 상태 — '취소'를 '접수'로 되돌릴 때 원래 단계로 정확히 복원하기 위해 보관한다.
-- (기존 행은 NULL → 복원 시 사진·정보 심사/수납 상태로 단계를 역산한다)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS cancelled_from_status VARCHAR(30);
ALTER TABLE application_submissions
  ADD COLUMN IF NOT EXISTS cancelled_from_status VARCHAR(30);

COMMENT ON COLUMN applications.cancelled_from_status IS
  '취소 직전 status — 관리자 복원(reinstate) 시 원래 단계로 되돌리는 근거. NULL이면 심사·수납 상태로 역산';
COMMENT ON COLUMN application_submissions.cancelled_from_status IS
  '취소 직전 status — 관리자 복원(reinstate) 시 원래 단계로 되돌리는 근거';

-- 지정 접수 표식 — exception_type 은 '마지막 예외 처리'라 이후 급수 정정·복원으로 덮어써진다.
-- 특별 관리 명단(한국 교민 자녀 등)은 그 뒤 무슨 처리를 하든 계속 뽑을 수 있어야 하므로
-- 지정 접수 여부는 지워지지 않는 별도 플래그로 보관한다.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS is_designated BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN applications.is_designated IS
  '마감 이후 지정 접수로 등록된 건(특별 관리 대상). 이후 예외 처리에도 유지된다';

-- 이미 지정 접수로 들어온 건 백필(재실행 안전).
-- exception_type 이 이후 처리로 덮어써진 건도 있으므로 감사 로그까지 함께 본다.
UPDATE applications SET is_designated = TRUE
WHERE exception_type = 'designated' AND is_designated = FALSE;

UPDATE applications a SET is_designated = TRUE
WHERE a.is_designated = FALSE
  AND EXISTS (
    SELECT 1 FROM admin_audit_logs l
    WHERE l.target_type = 'applications'
      AND l.target_id = a.id::text
      AND l.action_type = 'application_designate'
  );

-- 회차별 예외 처리 건 조회(특별 관리 명단)
CREATE INDEX IF NOT EXISTS idx_applications_exception
  ON applications (exam_round_id, exception_type)
  WHERE exception_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_designated
  ON applications (exam_round_id)
  WHERE is_designated;
