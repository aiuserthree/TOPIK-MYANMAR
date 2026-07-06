-- 폐지(revoked) 상태로 남아 round_no(108·109 등)를 점유하는 회차를 완전 삭제
-- 신규 폐지 API는 hard delete이나, 배포 이전 soft-revoke 잔존 행 정리용

DO $$
DECLARE
  rid INTEGER;
BEGIN
  FOR rid IN SELECT id FROM exam_rounds WHERE registration_status = 'revoked' ORDER BY id
  LOOP
    UPDATE applications SET photo_file_id = NULL WHERE exam_round_id = rid;
    DELETE FROM application_memos
      WHERE application_id IN (SELECT id FROM applications WHERE exam_round_id = rid);
    DELETE FROM applications WHERE exam_round_id = rid;
    DELETE FROM application_submissions WHERE exam_round_id = rid;
    DELETE FROM exam_round_venues WHERE exam_round_id = rid;
    DELETE FROM exam_rounds WHERE id = rid;
  END LOOP;
END $$;
