"""BO permission matrix — menu/action RBAC for admin & readonly roles."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.lib.deps import AuthUser, require_admin, require_any_admin
from app.lib.errors import api_error
from app.models.admin import AdminPermissionMatrix

# Menu ids align with BO DataStore.permSections (panels/permissions.jsx).
PERM_MENUS: dict[str, list[str]] = {
    "dashboard": ["view"],
    "applicants": ["view", "photo", "pay", "approve", "reject", "exam", "export"],
    "sessions": ["view", "create", "edit", "delete"],
    "venues": ["view", "create", "edit", "delete"],
    "notices": ["view", "create", "edit", "delete"],
    "faq": ["view", "create", "edit", "delete"],
    "refunds": ["view", "answer", "delete"],
    "inquiries": ["view", "answer", "delete"],
    "members": ["view", "edit", "suspend", "reset"],
    "terms": ["view", "create", "publish"],
    "admins": ["view", "create", "edit", "reset", "deactivate"],
    "permissions": ["view", "edit"],
    "audit": ["viewAll", "viewOwn", "export"],
}

DEFAULT_MATRIX: dict[str, dict[str, list[str]]] = {
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
        "audit": ["viewOwn"],
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
        "audit": ["viewOwn"],
    },
}


def perm_schema() -> dict[str, Any]:
    """Schema payload for BO UI (sections mirror data.js PERM_SECTIONS)."""
    sections = [
        {"id": "dash", "title": "대시보드", "menus": [{"id": "dashboard", "label": "대시보드", "actions": PERM_MENUS["dashboard"]}]},
        {
            "id": "apply",
            "title": "접수 관리",
            "menus": [{"id": "applicants", "label": "접수자 목록", "actions": PERM_MENUS["applicants"]}],
        },
        {
            "id": "exam",
            "title": "시험 관리",
            "menus": [
                {"id": "sessions", "label": "회차 관리", "actions": PERM_MENUS["sessions"]},
                {"id": "venues", "label": "시험장 관리", "actions": PERM_MENUS["venues"]},
            ],
        },
        {
            "id": "content",
            "title": "콘텐츠 관리",
            "menus": [
                {"id": "notices", "label": "공지사항", "actions": PERM_MENUS["notices"]},
                {"id": "faq", "label": "FAQ", "actions": PERM_MENUS["faq"]},
                {"id": "refunds", "label": "환불·정보정정", "actions": PERM_MENUS["refunds"]},
                {"id": "inquiries", "label": "문의 게시판", "actions": PERM_MENUS["inquiries"]},
            ],
        },
        {
            "id": "member",
            "title": "회원·약관",
            "menus": [
                {"id": "members", "label": "회원 관리", "actions": PERM_MENUS["members"]},
                {"id": "terms", "label": "약관 관리", "actions": PERM_MENUS["terms"]},
            ],
        },
        {
            "id": "system",
            "title": "시스템",
            "menus": [
                {"id": "admins", "label": "관리자 계정", "actions": PERM_MENUS["admins"]},
                {"id": "permissions", "label": "관리자 권한", "actions": PERM_MENUS["permissions"]},
                {"id": "audit", "label": "처리 이력", "actions": PERM_MENUS["audit"]},
            ],
        },
    ]
    return {"sections": sections, "actions": {
        "view": "조회", "create": "등록", "edit": "수정", "delete": "삭제",
        "photo": "사진심사", "pay": "수납", "approve": "승인", "reject": "반려",
        "exam": "수험번호부여", "answer": "답변", "publish": "게시·폐지",
        "suspend": "정지·탈퇴", "reset": "비번초기화", "deactivate": "비활성",
        "export": "내보내기", "viewAll": "전체이력", "viewOwn": "본인이력",
    }}


def _normalize_matrix(raw: dict[str, Any] | None) -> dict[str, dict[str, list[str]]]:
    out: dict[str, dict[str, list[str]]] = {}
    for role in ("admin", "readonly"):
        base = DEFAULT_MATRIX[role]
        role_raw = (raw or {}).get(role) if isinstance(raw, dict) else None
        if not isinstance(role_raw, dict):
            out[role] = {k: v[:] for k, v in base.items()}
            continue
        merged: dict[str, list[str]] = {}
        for menu_id, allowed in PERM_MENUS.items():
            picked = role_raw.get(menu_id, base.get(menu_id, []))
            if not isinstance(picked, list):
                picked = base.get(menu_id, [])
            valid = [a for a in picked if a in allowed]
            merged[menu_id] = valid
        out[role] = merged
    return out


def validate_matrix_payload(raw: dict[str, Any]) -> dict[str, dict[str, list[str]]]:
    if not isinstance(raw, dict):
        raise api_error("VALIDATION_ERROR", "matrix 객체가 필요합니다.", 400)
    unknown_roles = set(raw.keys()) - {"admin", "readonly"}
    if unknown_roles:
        raise api_error("VALIDATION_ERROR", f"지원하지 않는 역할: {', '.join(sorted(unknown_roles))}", 400)
    return _normalize_matrix(raw)


def _default_matrix_copy() -> dict[str, dict[str, list[str]]]:
    return {k: {mk: mv[:] for mk, mv in v.items()} for k, v in DEFAULT_MATRIX.items()}


async def load_matrix(db: AsyncSession) -> dict[str, dict[str, list[str]]]:
    try:
        row = (
            await db.execute(select(AdminPermissionMatrix).where(AdminPermissionMatrix.id == 1))
        ).scalar_one_or_none()
    except ProgrammingError:
        await db.rollback()
        return _default_matrix_copy()
    if not row or not row.matrix:
        return _default_matrix_copy()
    return _normalize_matrix(row.matrix)


async def get_matrix_row(db: AsyncSession) -> AdminPermissionMatrix | None:
    try:
        return (
            await db.execute(select(AdminPermissionMatrix).where(AdminPermissionMatrix.id == 1))
        ).scalar_one_or_none()
    except ProgrammingError:
        await db.rollback()
        return None


def role_has(
    matrix: dict[str, dict[str, list[str]]],
    role: str | None,
    menu: str,
    action: str,
) -> bool:
    if role == "super":
        return True
    if role not in ("admin", "readonly"):
        return False
    key = "admin" if role == "admin" else "readonly"
    allowed = matrix.get(key, {}).get(menu, [])
    return action in allowed


async def assert_perm(
    db: AsyncSession,
    admin: AuthUser,
    menu: str,
    action: str,
) -> None:
    if admin.role == "super":
        return
    if menu not in PERM_MENUS:
        raise api_error("VALIDATION_ERROR", f"알 수 없는 메뉴: {menu}", 400)
    if action not in PERM_MENUS[menu]:
        raise api_error("VALIDATION_ERROR", f"알 수 없는 액션: {action}", 400)
    matrix = await load_matrix(db)
    if not role_has(matrix, admin.role, menu, action):
        raise api_error(
            "FORBIDDEN",
            "권한이 없습니다. 관리자 권한 매트릭스를 확인해 주세요.",
            403,
        )


def matrix_perm(menu: str, action: str):
    """FastAPI dependency: require_admin + matrix action check (super bypass)."""

    async def _dep(
        admin: Annotated[AuthUser, Depends(require_admin)],
        db: Annotated[AsyncSession, Depends(get_db_session)],
    ) -> AuthUser:
        await assert_perm(db, admin, menu, action)
        return admin

    return _dep


async def assert_view(
    db: AsyncSession,
    admin: AuthUser,
    menu: str,
) -> None:
    """GET endpoints: view permission (readonly uses require_any_admin separately)."""
    if admin.role == "super":
        return
    matrix = await load_matrix(db)
    if admin.role == "readonly":
        if role_has(matrix, "readonly", menu, "view"):
            return
        raise api_error("FORBIDDEN", "조회 권한이 없습니다.", 403)
    if role_has(matrix, "admin", menu, "view"):
        return
    raise api_error("FORBIDDEN", "조회 권한이 없습니다.", 403)


def board_menu_for_type(board_type: str) -> str:
    return "refunds" if board_type == "refund_correction" else "inquiries"


async def save_matrix(
    db: AsyncSession,
    *,
    matrix: dict[str, dict[str, list[str]]],
    admin_user_id: int,
) -> AdminPermissionMatrix:
    normalized = validate_matrix_payload(matrix)
    try:
        row = (
            await db.execute(select(AdminPermissionMatrix).where(AdminPermissionMatrix.id == 1))
        ).scalar_one_or_none()
    except ProgrammingError:
        await db.rollback()
        raise api_error(
            "MIGRATION_REQUIRED",
            "권한 매트릭스 테이블이 없습니다. DB 마이그레이션(V011)을 실행해 주세요.",
            503,
        )
    if row:
        row.matrix = normalized
        row.updated_by_admin_id = admin_user_id
    else:
        row = AdminPermissionMatrix(id=1, matrix=normalized, updated_by_admin_id=admin_user_id)
        db.add(row)
    await db.flush()
    return row
