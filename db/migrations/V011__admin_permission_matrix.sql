-- BO 권한 매트릭스 (역할 admin/readonly → 메뉴별 액션 목록)
CREATE TABLE IF NOT EXISTS admin_permission_matrix (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    matrix JSONB NOT NULL,
    updated_by_admin_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1차 기본값: 일반관리자=운영 액션, 조회관리자=view/viewOwn only (super는 코드에서 전권)
INSERT INTO admin_permission_matrix (id, matrix)
VALUES (
    1,
    '{
      "admin": {
        "dashboard": ["view"],
        "applicants": ["view", "photo", "pay", "approve", "reject"],
        "sessions": ["view"],
        "venues": ["view"],
        "notices": ["view", "create", "edit", "delete"],
        "faq": ["view", "create", "edit", "delete"],
        "refunds": ["view", "answer", "delete"],
        "inquiries": ["view", "answer", "delete"],
        "members": ["view"],
        "terms": ["view"],
        "admins": [],
        "permissions": [],
        "audit": ["viewOwn"]
      },
      "readonly": {
        "dashboard": ["view"],
        "applicants": ["view"],
        "sessions": ["view"],
        "venues": ["view"],
        "notices": ["view"],
        "faq": ["view"],
        "refunds": ["view"],
        "inquiries": ["view"],
        "members": ["view"],
        "terms": ["view"],
        "admins": [],
        "permissions": [],
        "audit": ["viewOwn"]
      }
    }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
