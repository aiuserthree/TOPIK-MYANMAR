#!/usr/bin/env python3
"""Copy C안 FO + html/shared into public/ for static deploy (IwinV / Vercel)."""
import os
import shutil
import pathlib

SHARED_SRC = pathlib.Path("html/shared")
FO_SHARED_SRC = None  # resolved below
DST = pathlib.Path("public")

SKIP_NAMES = {".vercel", "vercel.json", "docs"}


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
    for src in (FO_SHARED_SRC, SHARED_SRC):
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
# Legacy Vercel: TOPIK_API_BASE=https://topikmyanmar-production.up.railway.app python3 build.py
# Local FastAPI: TOPIK_API_BASE=http://localhost:8000 python3 build.py
_DEFAULT_API_BASE = ""
API_BASE = os.environ.get("TOPIK_API_BASE", _DEFAULT_API_BASE).rstrip("/")
API_META = f'<meta name="topik-api-base" content="{API_BASE}">' if API_BASE else ""
VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'

for html in DST.glob("*.html"):
    text = html.read_text(encoding="utf-8")
    patched = text.replace("../../shared/", "shared/")
    if API_META and '<meta name="topik-api-base"' not in patched and VIEWPORT_META in patched:
        patched = patched.replace(VIEWPORT_META, VIEWPORT_META + "\n" + API_META, 1)
    if patched != text:
        html.write_text(patched, encoding="utf-8")

print(f"Copied {FO_SRC} → {DST}")
