#!/usr/bin/env python3
"""Copy BO(admin) project + shared into public-bo/ for IwinV nginx admin subdomain."""
import os
import re
import shutil
import subprocess
import pathlib
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent
SHARED_SRC = ROOT / "html" / "shared"

SKIP_NAMES = {
    ".vercel",
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
API_META_RE = re.compile(r'\s*<meta name="topik-api-base"[^>]*>\n?', re.IGNORECASE)


def patch_html_api_meta(text: str) -> str:
    """Remove stale topik-api-base meta; inject TOPIK_API_BASE when set."""
    patched = API_META_RE.sub("", text)
    if API_META and VIEWPORT_META in patched:
        patched = patched.replace(VIEWPORT_META, VIEWPORT_META + "\n" + API_META, 1)
    return patched


# nginx는 admin 서브도메인의 js/css 도 Cache-Control immutable 7d 로 서빙한다.
# ?v= 가 없으면 배포해도 관리자 브라우저가 최대 7일간 구버전 스크립트를 계속 쓴다.
# 분 단위까지 쓴다. 시(%H) 단위면 같은 UTC 시간대에 두 번 배포할 때 ?v= 가 그대로라
# nginx immutable 7d 캐시가 이전 스크립트를 계속 내려준다 (2026-08-19 실제로 겪음).
ASSET_VERSION = os.environ.get("ASSET_VERSION") or datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
ASSET_URL_RE = re.compile(
    r'((?:src|href)=")((?:shared|assets|panels)/[A-Za-z0-9._-]+\.(?:js|jsx|css))(?:\?v=[^"]*)?(")',
    re.IGNORECASE,
)


def patch_asset_cache_bust(text: str) -> str:
    return ASSET_URL_RE.sub(
        lambda m: f"{m.group(1)}{m.group(2)}?v={ASSET_VERSION}{m.group(3)}",
        text,
    )


# admin.html 은 JSX 19개(약 364KB)를 type="text/babel" 로 걸어, 브라우저가 매번
# @babel/standalone(660KB gzip)을 받아 직접 컴파일했다. 현장 노트북에서는 이 준비에만
# 수 초가 걸린다. 빌드 때 한 번 컴파일해 두면 babel 자체가 필요 없어진다.
BABEL_JSX_SCRIPT_RE = re.compile(r'<script type="text/babel" src="([^"]+)\.jsx"></script>')
BABEL_LIB_SCRIPT_RE = re.compile(r'[ \t]*<script src="vendor/babel-standalone-[^"]+"></script>\n?')
PRECOMPILE_SCRIPT = ROOT / "scripts" / "precompile-jsx.js"


def precompile_jsx(dst: pathlib.Path) -> bool:
    """DST 안의 .jsx 를 .js 로 컴파일한다. 성공하면 .jsx 와 babel 라이브러리를 지운다.

    node 가 없거나 컴파일이 실패하면 False 를 돌려주고 아무것도 건드리지 않는다.
    그러면 지금까지처럼 브라우저에서 babel 로 컴파일하는 경로가 그대로 남아
    빌드가 깨지지 않는다(느릴 뿐이다).
    """
    jsx_files = sorted(dst.glob("**/*.jsx"))
    if not jsx_files:
        return False
    babel = next(iter(sorted(dst.glob("vendor/babel-standalone-*.js"))), None)
    if babel is None:
        print("WARN: vendor/babel-standalone 을 찾지 못해 JSX 사전 컴파일을 건너뜁니다.")
        return False
    if not PRECOMPILE_SCRIPT.exists():
        print(f"WARN: {PRECOMPILE_SCRIPT} 가 없어 JSX 사전 컴파일을 건너뜁니다.")
        return False
    try:
        proc = subprocess.run(
            ["node", str(PRECOMPILE_SCRIPT), str(babel), *map(str, jsx_files)],
            capture_output=True, text=True, timeout=300,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        print(f"WARN: JSX 사전 컴파일을 건너뜁니다({exc}). 브라우저 babel 로 동작합니다.")
        return False
    if proc.returncode != 0:
        print(f"WARN: JSX 사전 컴파일 실패 — 브라우저 babel 로 동작합니다.\n{proc.stderr.strip()}")
        return False
    for f in jsx_files:
        f.unlink()
    babel.unlink()
    print(f"Precompiled {len(jsx_files)} jsx → js (browser babel 제거)")
    return True


def patch_precompiled_scripts(text: str) -> str:
    """type="text/babel" 의 .jsx 참조를 컴파일된 .js 로 바꾸고 babel 로더를 뺀다."""
    patched = BABEL_JSX_SCRIPT_RE.sub(r'<script src="\1.js"></script>', text)
    return BABEL_LIB_SCRIPT_RE.sub("", patched)


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

PRECOMPILED = precompile_jsx(DST)

for html in DST.glob("*.html"):
    text = html.read_text(encoding="utf-8")
    patched = patch_html_api_meta(text.replace("../../shared/", "shared/"))
    if PRECOMPILED:
        # 캐시버스트보다 먼저 — .jsx 를 .js 로 바꾼 뒤라야 ?v= 가 붙는다.
        patched = patch_precompiled_scripts(patched)
    patched = patch_asset_cache_bust(patched)
    if patched != text:
        html.write_text(patched, encoding="utf-8")

print(f"Copied {BO_SRC} → {DST}")
