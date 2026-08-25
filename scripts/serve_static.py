#!/usr/bin/env python3
"""로컬 정적 서버 — nginx `try_files $uri $uri.html $uri/ =404` 를 흉내 낸다.

`python3 -m http.server` 로 FO/BO 를 띄우면 확장자 없는 경로에서 404 가 난다.
BO 로그인은 성공 후 `admin` 으로 이동하고(`admin.html` 아님), FO 링크도 대부분
확장자를 붙이지 않기 때문에, 운영(nginx)에서는 되는 화면이 로컬에서만 깨진다.

사용:
    python3 scripts/serve_static.py public-bo 8081
    python3 scripts/serve_static.py public 8080
"""

from __future__ import annotations

import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class TryFilesHandler(SimpleHTTPRequestHandler):
    """확장자 없는 요청을 `<path>.html` 로 한 번 더 찾아본다."""

    def translate_path(self, path: str) -> str:
        local = super().translate_path(path)
        if os.path.isdir(local) or os.path.exists(local):
            return local
        if not os.path.splitext(local)[1]:
            with_html = local + ".html"
            if os.path.isfile(with_html):
                return with_html
        return local

    def log_message(self, fmt: str, *args) -> None:  # 접근 로그는 조용히
        pass


def main() -> int:
    root = sys.argv[1] if len(sys.argv) > 1 else "public-bo"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8081
    if not os.path.isdir(root):
        print(f"ERROR: 디렉터리를 찾을 수 없습니다 — {root}", file=sys.stderr)
        return 1
    handler = partial(TryFilesHandler, directory=os.path.abspath(root))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"serving {os.path.abspath(root)} → http://127.0.0.1:{port}  (try_files $uri $uri.html)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
