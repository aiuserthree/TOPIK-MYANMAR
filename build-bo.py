#!/usr/bin/env python3
"""Copy BO(admin) project + shared into public-bo/ for IwinV nginx admin subdomain."""
import os
import shutil
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SHARED_SRC = ROOT / "html" / "shared"

SKIP_NAMES = {
    ".vercel",
    "vercel.json",
    "docs",
    "dist",
    "uploads",
    "screenshots",
    ".thumbnail",
}


def _resolve_bo_src() -> pathlib.Path:
    """Prefer BO(admin)/project — static handoff UI (React-in-browser)."""
    candidates = [
        ROOT / "html" / "C안" / "BO(admin)" / "project",
        ROOT / "html" / "C안" / "BO" / "project",
        ROOT / "public-bo-src",
    ]
    for path in candidates:
        if path.is_dir() and (path / "admin-login.html").exists():
            return path
    html_dir = ROOT / "html"
    if html_dir.is_dir():
        for d in sorted(html_dir.iterdir()):
            if not d.is_dir() or not d.name.startswith("C"):
                continue
            for sub in ("BO(admin)/project", "BO/project", "BO"):
                candidate = d.joinpath(*sub.split("/"))
                if candidate.is_dir() and (candidate / "admin-login.html").exists():
                    return candidate
    raise RuntimeError(
        "BO source not found. Expected html/C안/BO(admin)/project/ with admin-login.html"
    )


BO_SRC = _resolve_bo_src()
DST = ROOT / "public-bo"

_DEFAULT_API_BASE = ""
API_BASE = os.environ.get("TOPIK_API_BASE", _DEFAULT_API_BASE).rstrip("/")
API_META = f'<meta name="topik-api-base" content="{API_BASE}">' if API_BASE else ""
VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1">'


def ignore(dir_path: str, names: list[str]) -> set[str]:
    return {n for n in names if n in SKIP_NAMES}


if DST.exists():
    shutil.rmtree(DST)

shutil.copytree(BO_SRC, DST, ignore=ignore)

if SHARED_SRC.is_dir():
    dst_shared = DST / "shared"
    dst_shared.mkdir(parents=True, exist_ok=True)
    for item in SHARED_SRC.iterdir():
        dest = dst_shared / item.name
        if item.is_dir():
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)
    bo_shared = BO_SRC / "shared"
    if bo_shared.is_dir():
        for item in bo_shared.iterdir():
            dest = dst_shared / item.name
            if item.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)
    print(f"Merged shared → {dst_shared}")

for html in DST.glob("*.html"):
    text = html.read_text(encoding="utf-8")
    patched = text.replace("../../shared/", "shared/")
    if API_META and '<meta name="topik-api-base"' not in patched and VIEWPORT_META in patched:
        patched = patched.replace(VIEWPORT_META, VIEWPORT_META + "\n" + API_META, 1)
    if patched != text:
        html.write_text(patched, encoding="utf-8")

print(f"Copied {BO_SRC} → {DST}")
