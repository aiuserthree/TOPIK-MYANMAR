-- V016: 회차 응시료 납부(오프라인) 기간 — BO 회차관리 설정값, FO index 일정 반영

ALTER TABLE exam_rounds
  ADD COLUMN IF NOT EXISTS payment_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_end_at TIMESTAMPTZ;

-- 기존 회차: 접수 마감일(MMT) 기준 +3일 00:00 ~ +5일 23:59:59
UPDATE exam_rounds
SET
  payment_start_at = (
    ((registration_end_at AT TIME ZONE 'Asia/Yangon')::date + 3)::timestamp AT TIME ZONE 'Asia/Yangon'
  ),
  payment_end_at = (
    (((registration_end_at AT TIME ZONE 'Asia/Yangon')::date + 5)::timestamp + TIME '23:59:59') AT TIME ZONE 'Asia/Yangon'
  )
WHERE payment_start_at IS NULL
  AND registration_end_at IS NOT NULL;
