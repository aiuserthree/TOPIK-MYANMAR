-- V022: 수험번호 노출 정책 반전 — 공개일 미설정 = 비공개
--
-- 기존: exam_number_visible_at 이 NULL 이면 부여 즉시 FO 노출.
--       관리자가 공개일을 정하지 않은 상태에서 부여했다는 이유만으로 노출되어,
--       제108회에서 승인 완료자 1,730건이 조기 노출되었다.
-- 변경: 공개일이 설정되고 그 시각이 지난 뒤에만 노출한다.
--
-- 이미 부여된 건의 노출 플래그를 새 기준으로 재계산한다.
-- (FO 는 회차 공개일 기준으로 즉시 계산하므로 이 UPDATE 는 BO 표시·정합용)

UPDATE applications a
SET exam_number_visible = FALSE
FROM exam_rounds r
WHERE r.id = a.exam_round_id
  AND a.exam_number IS NOT NULL
  AND a.exam_number_visible IS TRUE
  AND r.exam_number_visible_at IS NULL;

UPDATE applications a
SET exam_number_visible = (r.exam_number_visible_at <= NOW())
FROM exam_rounds r
WHERE r.id = a.exam_round_id
  AND a.exam_number IS NOT NULL
  AND r.exam_number_visible_at IS NOT NULL
  AND a.exam_number_visible IS DISTINCT FROM (r.exam_number_visible_at <= NOW());

COMMENT ON COLUMN exam_rounds.exam_number_visible_at IS
  '수험번호·수험표 FO 공개 시각. NULL = 비공개(설정 전까지 응시자에게 노출되지 않음)';
COMMENT ON COLUMN applications.exam_number_visible IS
  '부여 시점 기준 노출 플래그(BO 표시용). FO 노출은 회차 exam_number_visible_at 로 판정';
