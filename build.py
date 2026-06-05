#!/usr/bin/env python3
"""Copy C안 FO + html/shared into public/ for Vercel static deploy."""
import os
import shutil
import pathlib

SHARED_SRC = pathlib.Path("html/shared")
DST = pathlib.Path("public")

# Paths not served to end users (Vercel project metadata, IA notes, internal specs)
SKIP_NAMES = {".vercel", "vercel.json", "docs"}


def _resolve_fo_src() -> pathlib.Path:
    """C안/FO — use dynamic lookup for Linux deploy (Unicode path encoding)."""
    direct = pathlib.Path("html") / "C안" / "FO"
    if direct.is_dir():
        return direct
    html_dir = pathlib.Path("html")
    if not html_dir.is_dir():
        raise RuntimeError(f"html/ not found: {html_dir.resolve()}")
    for d in sorted(html_dir.iterdir()):
        if d.is_dir() and d.name.startswith("C"):
            fo = d / "FO"
            if fo.is_dir():
                return fo
    raise RuntimeError(
        f"FO source not found under html/. Found: {[p.name for p in html_dir.iterdir()]}"
    )


FO_SRC = _resolve_fo_src()

if DST.exists():
    shutil.rmtree(DST)

def ignore(_dir: str, names: list[str]) -> set[str]:
    return {n for n in names if n in SKIP_NAMES}

shutil.copytree(FO_SRC, DST, ignore=ignore)

if SHARED_SRC.is_dir():
    dst_shared = DST / "shared"
    if dst_shared.exists():
        shutil.rmtree(dst_shared)
    shutil.copytree(SHARED_SRC, dst_shared)
    print(f"Copied {SHARED_SRC} → {dst_shared}")

# FO source uses ../../shared/ for repo-tree preview; public/ is flat.
# Self-hosted / custom API: TOPIK_API_BASE=https://api.example.com python3 build.py
# Default keeps legacy Railway URL for existing Vercel deploys.
_DEFAULT_API_BASE = "https://topikmyanmar-production.up.railway.app"
API_BASE = os.environ.get("TOPIK_API_BASE", _DEFAULT_API_BASE).rstrip("/")
API_META = f'<meta name="topik-api-base" content="{API_BASE}">'
VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'

for html in DST.glob("*.html"):
    text = html.read_text(encoding="utf-8")
    patched = text.replace("../../shared/", "shared/")
    if '<meta name="topik-api-base"' not in patched and VIEWPORT_META in patched:
        patched = patched.replace(
            VIEWPORT_META,
            VIEWPORT_META + "\n" + API_META,
            1,
        )
    if patched != text:
        html.write_text(patched, encoding="utf-8")

print(f"Copied {FO_SRC} → {DST}")
