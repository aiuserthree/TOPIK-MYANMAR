-- 서비스 이용약관 제10조(면책): 제3자(결제·이메일 등) → 제3자(이메일 등)
-- BO 약관관리·FO API 노출 본문 일괄 반영 (게시/초안/폐지 상태 무관)

UPDATE terms
SET body_ko = REPLACE(body_ko, '제3자(결제·이메일 등)', '제3자(이메일 등)')
WHERE term_type = 'service'
  AND body_ko LIKE '%제3자(결제·이메일 등)%';
