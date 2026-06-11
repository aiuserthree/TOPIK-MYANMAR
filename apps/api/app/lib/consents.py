from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Term, TermConsent

DEFAULT_REQUIRED_TERM_TYPES = ("service", "privacy")


def _normalize_term_type(raw: str | None) -> str:
    t = (raw or "").strip().lower()
    if "privacy" in t:
        return "privacy"
    if "marketing" in t:
        return "marketing"
    if "service" in t or "terms" in t or t in ("tos", "use"):
        return "service"
    return t


def required_terms_consent_error(
    terms_agreed: list[dict] | None,
    *,
    required: tuple[str, ...] = DEFAULT_REQUIRED_TERM_TYPES,
) -> str | None:
    """필수 약관(service, privacy) 동의 여부. 미충족 시 사용자용 오류 문구."""
    agreed: set[str] = set()
    for item in terms_agreed or []:
        if not isinstance(item, dict):
            continue
        if not item.get("agreed", True):
            continue
        ttype = _normalize_term_type(item.get("term_type") or item.get("type"))
        if ttype:
            agreed.add(ttype)
    missing = [t for t in required if t not in agreed]
    if not missing:
        return None
    labels = {"service": "서비스 이용약관", "privacy": "개인정보 처리"}
    names = "·".join(labels.get(t, t) for t in missing)
    return f"필수 약관({names})에 동의해 주세요."


async def persist_term_consents(
    db: AsyncSession,
    *,
    user_id: int,
    terms_agreed: list[dict],
    marketing_opt_in: bool,
    ip: str | None,
) -> None:
    """가입·프로필 완료 시 동의 약관 종류/버전 영속화(terms_consents)."""
    pub = await db.execute(select(Term).where(Term.status == "published"))
    versions: dict[str, tuple[int, str]] = {}
    for t in pub.scalars().all():
        versions.setdefault(t.term_type, (t.id, t.version))

    seen_types: set[str] = set()
    for item in terms_agreed or []:
        if not isinstance(item, dict):
            continue
        ttype = item.get("term_type") or item.get("type")
        if not ttype:
            continue
        seen_types.add(ttype)
        term_id, ver = versions.get(ttype, (None, ""))
        db.add(
            TermConsent(
                user_id=user_id,
                term_id=item.get("term_id") or term_id,
                term_type=ttype,
                version=str(item.get("version") or ver or ""),
                agreed=bool(item.get("agreed", True)),
                ip_address=ip,
            )
        )
    if "marketing" not in seen_types:
        term_id, ver = versions.get("marketing", (None, ""))
        db.add(
            TermConsent(
                user_id=user_id,
                term_id=term_id,
                term_type="marketing",
                version=ver,
                agreed=bool(marketing_opt_in),
                ip_address=ip,
            )
        )
