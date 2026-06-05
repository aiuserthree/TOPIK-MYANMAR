#!/usr/bin/env python3
"""Copy C안 BO + html/shared into html/C안/BO/dist/ for Vercel static deploy."""
import os
import shutil
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SHARED_SRC = ROOT / "html" / "shared"

SKIP_NAMES = {".vercel", "vercel.json", "docs", "dist"}


def _resolve_bo_src() -> pathlib.Path:
    """C안/BO — dynamic lookup for Linux deploy (Unicode path encoding)."""
    direct = ROOT / "html" / "C안" / "BO"
    if direct.is_dir():
        return direct
    html_dir = ROOT / "html"
    if not html_dir.is_dir():
        raise RuntimeError(f"html/ not found: {html_dir}")
    for d in sorted(html_dir.iterdir()):
        if d.is_dir() and d.name.startswith("C"):
            bo = d / "BO"
            if bo.is_dir():
                return bo
    raise RuntimeError(
        f"BO source not found under html/. Found: {[p.name for p in html_dir.iterdir()]}"
    )


BO_SRC = _resolve_bo_src()
# ASCII-only output path for Vercel (Root Directory ./ — avoids html/C안/BO on Linux)
DST = ROOT / "public-bo"

# Self-hosted / custom API: TOPIK_API_BASE=https://api.example.com python3 build-bo.py
_DEFAULT_API_BASE = "https://topikmyanmar-production.up.railway.app"
API_BASE = os.environ.get("TOPIK_API_BASE", _DEFAULT_API_BASE).rstrip("/")
API_META = f'<meta name="topik-api-base" content="{API_BASE}">'


def ignore(_dir: str, names: list[str]) -> set[str]:
    return {n for n in names if n in SKIP_NAMES}


if DST.exists():
    shutil.rmtree(DST)

shutil.copytree(BO_SRC, DST, ignore=ignore)

if SHARED_SRC.is_dir():
    dst_shared = DST / "shared"
    if dst_shared.exists():
        shutil.rmtree(dst_shared)
    shutil.copytree(SHARED_SRC, dst_shared)
    print(f"Copied {SHARED_SRC} → {dst_shared}")

for html in DST.glob("*.html"):
    text = html.read_text(encoding="utf-8")
    patched = text.replace("../../shared/", "shared/")
    if '<meta name="topik-api-base"' not in patched:
        viewport_idx = patched.find('name="viewport"')
        if viewport_idx != -1:
            close = patched.find("/>", viewport_idx)
            if close != -1:
                insert_at = close + 2
                patched = patched[:insert_at] + "\n  " + API_META + patched[insert_at:]
    if patched != text:
        html.write_text(patched, encoding="utf-8")

print(f"Copied {BO_SRC} → {DST}")
