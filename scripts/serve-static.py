#!/usr/bin/env python3
"""Local static server with extensionless HTML (nginx-compatible).

  python3 scripts/serve-static.py html/C안/FO --port 8080
  python3 scripts/serve-static.py "html/C안/BO(admin)/project" --port 8081 --index admin-login.html

Behavior:
  /mypage       → serves mypage.html (200)
  /mypage.html  → 301 redirect to /mypage
  /index.html   → 301 redirect to /
  /             → index file (--index)
"""
from __future__ import annotations

import argparse
import mimetypes
import os
import posixpath
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class ExtensionlessHandler(SimpleHTTPRequestHandler):
    index_name = "index.html"
    redirect_html = True

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        rewritten = self._rewrite_path()
        if rewritten is None:
            return
        self.path = rewritten
        return SimpleHTTPRequestHandler.do_GET(self)

    def do_HEAD(self) -> None:
        rewritten = self._rewrite_path()
        if rewritten is None:
            return
        self.path = rewritten
        return SimpleHTTPRequestHandler.do_HEAD(self)

    def _rewrite_path(self) -> str | None:
        parsed = urllib.parse.urlsplit(self.path)
        raw_path = urllib.parse.unquote(parsed.path)
        qs = f"?{parsed.query}" if parsed.query else ""

        path = posixpath.normpath(raw_path)
        if path == ".":
            path = "/"
        if not path.startswith("/"):
            path = "/" + path

        if self.redirect_html and path.endswith(".html"):
            if path == f"/{self.index_name}":
                target = "/" + qs
            else:
                target = path[: -len(".html")] + qs
            self.send_response(301)
            self.send_header("Location", target)
            self.end_headers()
            return None

        fs_path = self.translate_path(path)

        if path == "/" or os.path.isdir(fs_path):
            index_fs = os.path.join(fs_path if os.path.isdir(fs_path) else self.translate_path("/"), self.index_name)
            if os.path.isfile(index_fs):
                base = path.rstrip("/") or ""
                return f"{base}/{self.index_name}{qs}" if base else f"/{self.index_name}{qs}"

        if not os.path.isdir(fs_path):
            _, ext = os.path.splitext(path)
            if not ext:
                html_candidate = fs_path + ".html"
                if os.path.isfile(html_candidate):
                    return path + ".html" + qs

        return path + qs


def main() -> None:
    ap = argparse.ArgumentParser(description="Extensionless local static server")
    ap.add_argument("root", help="Document root directory")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--bind", default="127.0.0.1")
    ap.add_argument("--index", default="index.html", help="Directory index filename")
    ap.add_argument("--no-redirect-html", action="store_true", help="Keep serving *.html without 301")
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    if not os.path.isdir(root):
        raise SystemExit(f"Not a directory: {root}")

    os.chdir(root)
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")

    handler = ExtensionlessHandler
    handler.index_name = args.index
    handler.redirect_html = not args.no_redirect_html

    httpd = ThreadingHTTPServer((args.bind, args.port), handler)
    print(f"Serving {root}")
    print(f"  http://{args.bind}:{args.port}/")
    print(f"  extensionless: /page → page.html; /page.html → 301 /page")
    print(f"  index file: {args.index}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
