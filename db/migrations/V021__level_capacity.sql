-- V021: TOPIK Ⅰ/Ⅱ 급수별 정원 — 회차·시험장 정원을 급수별로 별도 제한
--       기존 capacity(통합 정원)는 '사람 수' 전체 상한으로 그대로 유지하고,
--       그 아래 급수별 상한을 추가한다. 0 = 미정(무제한) → 기존 회차 동작 불변.

ALTER TABLE exam_rounds
  ADD COLUMN IF NOT EXISTS capacity_level_i  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacity_level_ii INTEGER NOT NULL DEFAULT 0;

ALTER TABLE exam_venues
  ADD COLUMN IF NOT EXISTS capacity_level_i  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacity_level_ii INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN exam_rounds.capacity IS
  '회차 전체 정원(사람 수 — Ⅰ+Ⅱ 동시 접수자도 1명). 0=무제한';
COMMENT ON COLUMN exam_rounds.capacity_level_i IS
  '회차 TOPIK Ⅰ 정원(급수별 원서 수). 0=무제한';
COMMENT ON COLUMN exam_rounds.capacity_level_ii IS
  '회차 TOPIK Ⅱ 정원(급수별 원서 수). 0=무제한';

COMMENT ON COLUMN exam_venues.capacity IS
  '시험장 전체 정원(사람 수 — Ⅰ+Ⅱ 동시 접수자도 1명). 0=무제한';
COMMENT ON COLUMN exam_venues.capacity_level_i IS
  '시험장 TOPIK Ⅰ 정원(급수별 원서 수). 0=무제한';
COMMENT ON COLUMN exam_venues.capacity_level_ii IS
  '시험장 TOPIK Ⅱ 정원(급수별 원서 수). 0=무제한';

-- 급수별 정원 집계(회차·시험장·급수 GROUP BY) 인덱스
CREATE INDEX IF NOT EXISTS idx_applications_round_level
  ON applications (exam_round_id, exam_level)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_applications_round_venue_level
  ON applications (exam_round_id, exam_venue_id, exam_level)
  WHERE is_deleted = FALSE;
