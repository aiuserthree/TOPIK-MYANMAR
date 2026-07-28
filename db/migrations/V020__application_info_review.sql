-- V020: 정보(성명 등) 심사 상태 — 사진 심사와 독립된 반려/승인 트랙
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS info_review_status VARCHAR(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS info_reject_code VARCHAR(30),
  ADD COLUMN IF NOT EXISTS info_reject_note TEXT;

COMMENT ON COLUMN applications.info_review_status IS '정보 심사: pending|approved|rejected (기본 approved — 오류 시에만 반려)';
COMMENT ON COLUMN applications.info_reject_code IS '정보 반려 코드/요약';
COMMENT ON COLUMN applications.info_reject_note IS '정보 반려 상세 사유';
