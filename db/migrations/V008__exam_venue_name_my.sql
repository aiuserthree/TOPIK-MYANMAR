-- V008: 시험장 미얀마어 명칭 (FO MY 언어 표시 · BO 자동번역 입력)

ALTER TABLE exam_venues
  ADD COLUMN IF NOT EXISTS name_my VARCHAR(200);
