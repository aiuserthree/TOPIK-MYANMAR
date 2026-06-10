-- 공식 답변 이력: board_comments.is_official_reply
ALTER TABLE board_comments
  ADD COLUMN IF NOT EXISTS is_official_reply BOOLEAN NOT NULL DEFAULT false;

-- 기존 admin_reply → 공식 답변 이력으로 이관 (중복 방지)
INSERT INTO board_comments (board_post_id, author_admin_id, body, is_official_reply, is_secret, created_at)
SELECT p.id, p.admin_replier_id, p.admin_reply, true, p.is_secret, COALESCE(p.admin_replied_at, p.created_at)
FROM board_posts p
WHERE p.admin_reply IS NOT NULL
  AND TRIM(p.admin_reply) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM board_comments c
    WHERE c.board_post_id = p.id
      AND c.is_official_reply = true
      AND c.body = p.admin_reply
  );
