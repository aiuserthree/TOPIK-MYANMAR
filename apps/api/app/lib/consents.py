from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Term, TermConsent


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
