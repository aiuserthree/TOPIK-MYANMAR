#!/usr/bin/env python3
"""Copy C안 FO + html/shared into public/ for IwinV nginx static deploy."""
import os
import re
import shutil
import pathlib
from datetime import datetime, timezone

SHARED_SRC = pathlib.Path("html/shared")
FO_SHARED_SRC = None  # resolved below
DST = pathlib.Path("public")

SKIP_NAMES = {".vercel", "docs"}


def _resolve_fo_src() -> pathlib.Path:
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


def _merge_shared(dst_shared: pathlib.Path) -> None:
    """Merge html/shared + FO/shared without dropping FO-only files (i18n, roster-codes)."""
    dst_shared.mkdir(parents=True, exist_ok=True)
    # SHARED first, then FO — FO wins on same filename (e.g. api-client.js overrides).
    for src in (SHARED_SRC, FO_SHARED_SRC):
        if not src or not src.is_dir():
            continue
        for item in src.iterdir():
            dest = dst_shared / item.name
            if item.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)
    print(f"Merged shared → {dst_shared}")


FO_SRC = _resolve_fo_src()
FO_SHARED_SRC = FO_SRC / "shared"

if DST.exists():
    shutil.rmtree(DST)


def ignore(_dir: str, names: list[str]) -> set[str]:
    return {n for n in names if n in SKIP_NAMES}


shutil.copytree(FO_SRC, DST, ignore=ignore)
_merge_shared(DST / "shared")

# IwinV: same-origin /api via nginx — default empty base (no meta) or TOPIK_API_BASE=/api
# Local FastAPI: TOPIK_API_BASE=http://127.0.0.1:8000 python3 build.py
_DEFAULT_API_BASE = ""
API_BASE = os.environ.get("TOPIK_API_BASE", _DEFAULT_API_BASE).rstrip("/")
API_META = f'<meta name="topik-api-base" content="{API_BASE}">' if API_BASE else ""
VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
API_META_RE = re.compile(r'\s*<meta name="topik-api-base"[^>]*>\n?', re.IGNORECASE)
ASSET_VERSION = os.environ.get("ASSET_VERSION") or datetime.now(timezone.utc).strftime("%Y%m%d%H")
# nginx serves JS/CSS with Cache-Control immutable 7d — bump ?v= on each build.
ASSET_URL_RE = re.compile(
    r'((?:src|href)=")((?:shared/api-client\.js|assets/common\.js|assets/fo-board\.js|assets/styles\.css))(?:\?v=[^"]*)?(")',
    re.IGNORECASE,
)


def patch_asset_cache_bust(text: str) -> str:
    return ASSET_URL_RE.sub(
        lambda m: f"{m.group(1)}{m.group(2)}?v={ASSET_VERSION}{m.group(3)}",
        text,
    )


def patch_html_api_meta(text: str) -> str:
    """Remove stale topik-api-base meta; inject TOPIK_API_BASE when set."""
    patched = API_META_RE.sub("", text)
    if API_META and VIEWPORT_META in patched:
        patched = patched.replace(VIEWPORT_META, VIEWPORT_META + "\n" + API_META, 1)
    return patched

for html in DST.glob("*.html"):
    text = html.read_text(encoding="utf-8")
    patched = patch_asset_cache_bust(
        patch_html_api_meta(text.replace("../../shared/", "shared/"))
    )
    if patched != text:
        html.write_text(patched, encoding="utf-8")

print(f"Copied {FO_SRC} → {DST}")
