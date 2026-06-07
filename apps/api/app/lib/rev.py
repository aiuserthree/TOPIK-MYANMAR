"""Optimistic concurrency (rev / If-Match) helpers."""

from __future__ import annotations

from fastapi import Header, Request

from app.lib.errors import api_error


def parse_if_match(if_match: str | None) -> int | None:
    if not if_match:
        return None
    raw = if_match.strip().strip('"')
    if raw.startswith("rev:"):
        raw = raw[4:]
    try:
        return int(raw)
    except ValueError:
        return None


def expected_rev_from_request(
    request: Request,
    body_rev: int | None = None,
    if_match: str | None = None,
) -> int | None:
    header_rev = parse_if_match(if_match)
    if header_rev is not None:
        return header_rev
    if body_rev is not None:
        return body_rev
    return parse_if_match(request.headers.get("If-Match"))


def check_rev(entity, expected: int | None, *, label: str = "리소스") -> None:
    """Raise 409 when expected rev does not match current entity.rev."""
    if expected is None:
        return
    current = getattr(entity, "rev", None)
    if current is None:
        return
    if int(expected) != int(current):
        raise api_error(
            "CONFLICT",
            f"{label}가 다른 관리자에 의해 수정되었습니다. 새로고침 후 다시 시도해 주세요.",
            409,
        )


def bump_rev(entity) -> None:
    if hasattr(entity, "rev"):
        entity.rev = int(entity.rev or 0) + 1
