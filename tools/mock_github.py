#!/usr/bin/env python3
"""sync-github.js のテスト用モック。GitHub REST の Contents API のごく一部だけを実装する。

  python tools/mock_github.py [port] [token]
    port   待受ポート。既定 8799
    token  Authorization: Bearer <token> で要求する値。既定 test-token

実装するエンドポイント:
  GET  /repos/{owner}/{repo}                  private フラグを返す
  GET  /repos/{owner}/{repo}/contents/{path}   sha1(保存バイト) を sha として返す
  PUT  /repos/{owner}/{repo}/contents/{path}   sha semantics: 既存ファイルへの sha 無し→422、
                                                sha 不一致→409、新規作成は sha 無しでよい
  OPTIONS *                                    CORS プリフライトに 204 で答える

テスト制御用（認証不要）:
  POST /_mock/conflict  次の1回の PUT だけを 409 にする
  POST /_mock/public    private フラグを反転する
  GET  /_mock/file      保存されている生バイトを返す（無ければ404）
"""
import base64
import hashlib
import http.server
import json
import re
import sys
import threading

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8799
TOKEN = sys.argv[2] if len(sys.argv) > 2 else "test-token"

STATE = {
    "private": True,
    "files": {},          # path -> bytes
    "force_conflict": False,
}
LOCK = threading.Lock()

CONTENTS_RE = re.compile(r"^/repos/([^/]+)/([^/]+)/contents/(.+)$")
REPO_RE = re.compile(r"^/repos/([^/]+)/([^/]+)$")


def b64_github(data):
    """GitHub は base64 を60文字ごとに改行して返す。"""
    s = base64.b64encode(data).decode("ascii")
    lines = [s[i:i + 60] for i in range(0, len(s), 60)]
    return "\n".join(lines) + "\n"


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive で Content-Length を必ず送る

    def log_message(self, fmt, *args):
        pass

    def _send_json(self, status, obj):
        body = json.dumps(obj).encode("utf-8")
        self._send_raw(status, body, "application/json; charset=utf-8")

    def _send_raw(self, status, body, content_type="application/octet-stream"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _authed(self):
        return self.headers.get("Authorization", "") == "Bearer " + TOKEN

    def _read_body(self):
        n = int(self.headers.get("Content-Length", "0") or "0")
        return self.rfile.read(n) if n else b""

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Accept, Content-Type, X-GitHub-Api-Version")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]

        if path == "/_mock/file":
            with LOCK:
                data = STATE["files"].get("trainlog.json")
            if data is None:
                self._send_raw(404, b"")
            else:
                self._send_raw(200, data, "application/octet-stream")
            return

        m = CONTENTS_RE.match(path)
        if m:
            if not self._authed():
                self._send_json(401, {"message": "Bad credentials"})
                return
            filepath = m.group(3)
            with LOCK:
                data = STATE["files"].get(filepath)
            if data is None:
                self._send_json(404, {"message": "Not Found"})
                return
            accept = self.headers.get("Accept", "")
            sha = hashlib.sha1(data).hexdigest()
            if "raw" in accept:
                self._send_raw(200, data, "text/plain; charset=utf-8")
                return
            self._send_json(200, {
                "sha": sha,
                "content": b64_github(data),
                "encoding": "base64",
                "size": len(data),
            })
            return

        m = REPO_RE.match(path)
        if m:
            if not self._authed():
                self._send_json(401, {"message": "Bad credentials"})
                return
            owner, repo = m.groups()
            with LOCK:
                private = STATE["private"]
            self._send_json(200, {"full_name": owner + "/" + repo, "private": private})
            return

        self._send_json(404, {"message": "Not Found"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        self._read_body()

        if path == "/_mock/conflict":
            with LOCK:
                STATE["force_conflict"] = True
            self._send_json(200, {"ok": True})
            return
        if path == "/_mock/public":
            with LOCK:
                STATE["private"] = not STATE["private"]
                p = STATE["private"]
            self._send_json(200, {"private": p})
            return
        self._send_json(404, {"message": "Not Found"})

    def do_PUT(self):
        path = self.path.split("?", 1)[0]
        raw = self._read_body()

        m = CONTENTS_RE.match(path)
        if not m:
            self._send_json(404, {"message": "Not Found"})
            return
        if not self._authed():
            self._send_json(401, {"message": "Bad credentials"})
            return
        filepath = m.group(3)

        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            self._send_json(400, {"message": "Bad Request"})
            return

        with LOCK:
            if STATE["force_conflict"]:
                STATE["force_conflict"] = False
                self._send_json(409, {"message": "Conflict"})
                return

            existing = STATE["files"].get(filepath)
            sha_in = body.get("sha")

            if existing is not None:
                if not sha_in:
                    self._send_json(422, {"message": "sha wasn't supplied"})
                    return
                existing_sha = hashlib.sha1(existing).hexdigest()
                if sha_in != existing_sha:
                    self._send_json(409, {"message": "Conflict"})
                    return

            try:
                new_bytes = base64.b64decode(body.get("content", ""))
            except Exception:
                self._send_json(400, {"message": "content が base64 として読めません"})
                return

            STATE["files"][filepath] = new_bytes
            new_sha = hashlib.sha1(new_bytes).hexdigest()
            status = 200 if existing is not None else 201

        self._send_json(status, {"content": {"sha": new_sha, "path": filepath}, "commit": {"sha": new_sha}})


def main():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("mock_github listening on http://127.0.0.1:%d (token=%s)" % (PORT, TOKEN))
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
