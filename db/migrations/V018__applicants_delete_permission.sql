-- 접수자 삭제(휴지통) 권한 — 기존 일반관리자(admin) 역할 매트릭스에 delete 액션 추가
UPDATE admin_permission_matrix
SET matrix = jsonb_set(
    matrix,
    '{admin,applicants}',
    CASE
        WHEN COALESCE(matrix->'admin'->'applicants', '[]'::jsonb) @> '["delete"]'::jsonb
        THEN matrix->'admin'->'applicants'
        ELSE COALESCE(matrix->'admin'->'applicants', '[]'::jsonb) || '"delete"'::jsonb
    END,
    true
)
WHERE id = 1;
