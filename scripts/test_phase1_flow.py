#!/usr/bin/env python3
"""Phase 1 smoke test: health → auth → exam rounds → find-email → admin roster path."""
from __future__ import annotations

import os
import sys

import httpx

BASE = os.environ.get("API_BASE", "http://127.0.0.1:8000").rstrip("/")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin-dev@topik-mm.local")
ADMIN_PW = os.environ.get("TEST_ADMIN_PASSWORD", "DevOnly!2026")


def ok(name: str) -> None:
    print(f"  OK  {name}")


def fail(name: str, detail: str) -> None:
    print(f"  FAIL {name}: {detail}")
    sys.exit(1)


def main() -> None:
    print(f"API base: {BASE}")
    with httpx.Client(base_url=BASE, timeout=30.0) as client:
        r = client.get("/health")
        if r.status_code != 200:
            fail("health", r.text)
        ok("GET /health")

        r = client.post("/api/v1/auth/find-email", json={
            "name_ko": "없는사용자",
            "birth_date": "1990-01-01",
            "phone": "00000000000",
        })
        if r.status_code != 200 or "matches" not in r.json():
            fail("find-email", r.text)
        ok("POST /api/v1/auth/find-email")

        r = client.post("/api/v1/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
        if r.status_code != 200:
            fail("admin login", r.text)
        token = r.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        ok("POST /api/v1/auth/login (admin)")

        r = client.get("/api/v1/exam-rounds", headers=headers)
        if r.status_code != 200:
            fail("exam-rounds", r.text)
        items = r.json().get("items", [])
        round107 = next((x for x in items if x.get("round_no") == 107), None)
        if round107:
            ok(f"GET /exam-rounds — 제107회 id={round107['id']}")
            if not round107.get("payment_start_at"):
                fail("payment_start_at", "missing on round 107")
            ok("payment_start_at / payment_end_at on exam round")
            rid = round107["id"]
            r = client.get(f"/api/v1/admin/exam-rounds/{rid}/roster.xlsx", headers=headers)
            if r.status_code != 200 or "zip" not in (r.headers.get("content-type") or ""):
                fail("roster export", f"status={r.status_code} ct={r.headers.get('content-type')}")
            ok("GET /admin/exam-rounds/{id}/roster.xlsx")
        else:
            print("  SKIP 제107회 — seed_dev.py 실행 필요")

        r = client.get("/api/v1/admin/notices", headers=headers)
        if r.status_code != 200:
            fail("admin notices", r.text)
        ok("GET /admin/notices")

    print("\nPhase 1 smoke test passed.")


if __name__ == "__main__":
    main()
