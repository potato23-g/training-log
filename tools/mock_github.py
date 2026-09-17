#!/usr/bin/env python3
"""sync-github.js のテスト用モック。GitHub REST の Contents API のごく一部だけを実装する。

  python tools/mock_github.py [port] [token]
    port   待受ポート。既定 8799
    token  Authorization: Bearer <token> で要求する値。既定 test-token

実装するエンドポイント:
  GET  /repos/{owner}/{repo}                  private フラグを返す
  GET  /repos/{owner}/{repo}/contents/{path}   保存済みファイルなら中身(sha1をshaとして)、
                                                保存済みファイルを含むディレクトリなら一覧(配列)、
                                                どちらでも無ければ404
  PUT  /repos/{owner}/{repo}/contents/{path}   sha semantics: 既存ファイルへの sha 無し→422、
                                                sha 不一致→409、新規作成は sha 無しでよい
  OPTIONS *                                    CORS プリフライトに 204 で答える

テスト制御用（認証不要。リクエストログには載らない）:
  POST /_mock/conflict     次の1回の PUT だけを 409 にする
  POST /_mock/public       private フラグを反転する
  GET  /_mock/file?path=   保存されている生バイトを返す（省略時 trainlog.json。無ければ404）
  GET  /_mock/list         保存されている全パスの配列 {"paths":[...]}
  GET  /_mock/log          直近のリクエスト履歴 [{method,path,status,reqBytes,resBytes}, ...]
  POST /_mock/log/reset    リクエスト履歴を空にする
"""
import base64
import hashlib
import http.server
import json
import re
import sys
import threading
from urllib.parse import urlsplit, parse_qs

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8799
TOKEN = sys.argv[2] if len(sys.argv) > 2 else "test-token"

STATE = {
    "private": True,
    "files": {},          # path -> bytes
    "force_conflict": False,
}
REQUEST_LOG = []
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

    def _log(self, status, res_bytes, req_bytes=0):
        p = self.path.split("?", 1)[0]
        if p.startswith("/_mock/"):
            return
        with LOCK:
            REQUEST_LOG.append({
                "method": self.command,
                "path": p,
                "status": status,
                "reqBytes": req_bytes,
                "resBytes": res_bytes,
            })

    def _send_json(self, status, obj, req_bytes=0):
        body = json.dumps(obj).encode("utf-8")
        self._send_raw(status, body, "application/json; charset=utf-8", req_bytes)

    def _send_raw(self, status, body, content_type="application/octet-stream", req_bytes=0):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if body:
            self.wfile.write(body)
        self._log(status, len(body), req_bytes)

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
            qs = parse_qs(urlsplit(self.path).query)
            filepath = (qs.get("path") or ["trainlog.json"])[0]
            with LOCK:
                data = STATE["files"].get(filepath)
            if data is None:
                self._send_raw(404, b"")
            else:
                self._send_raw(200, data, "application/octet-stream")
            return

        if path == "/_mock/list":
            with LOCK:
                paths = sorted(STATE["files"].keys())
            self._send_json(200, {"paths": paths})
            return

        if path == "/_mock/log":
            with LOCK:
                data = list(REQUEST_LOG)
            self._send_json(200, data)
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
                    # 単一ファイルとしては無い。ディレクトリとして中身があるか調べる（直下のみ、非再帰）
                    prefix = filepath.rstrip("/") + "/"
                    children = sorted(p for p in STATE["files"] if p.startswith(prefix) and "/" not in p[len(prefix):])
                    entries = None
                    if children:
                        entries = []
                        for child in children:
                            cdata = STATE["files"][child]
                            entries.append({
                                "name": child[len(prefix):],
                                "path": child,
                                "sha": hashlib.sha1(cdata).hexdigest(),
                                "size": len(cdata),
                                "type": "file",
                            })
            if data is None:
                if entries is not None:
                    self._send_json(200, entries)
                else:
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
        if path == "/_mock/log/reset":
            with LOCK:
                REQUEST_LOG.clear()
            self._send_json(200, {"ok": True})
            return
        self._send_json(404, {"message": "Not Found"})

    def do_PUT(self):
        path = self.path.split("?", 1)[0]
        raw = self._read_body()

        m = CONTENTS_RE.match(path)
        if not m:
            self._send_json(404, {"message": "Not Found"}, req_bytes=len(raw))
            return
        if not self._authed():
            self._send_json(401, {"message": "Bad credentials"}, req_bytes=len(raw))
            return
        filepath = m.group(3)

        try:
            body = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            self._send_json(400, {"message": "Bad Request"}, req_bytes=len(raw))
            return

        # ロックの中では状態の読み書きだけ行い、レスポンス送信はロックを離してから行う。
        # _send_json は自前で LOCK を取る（リクエストログのため）ので、保持したまま呼ぶとデッドロックする。
        status = None
        obj = None
        with LOCK:
            if STATE["force_conflict"]:
                STATE["force_conflict"] = False
                status, obj = 409, {"message": "Conflict"}
            else:
                existing = STATE["files"].get(filepath)
                sha_in = body.get("sha")

                if existing is not None and not sha_in:
                    status, obj = 422, {"message": "sha wasn't supplied"}
                elif existing is not None and sha_in != hashlib.sha1(existing).hexdigest():
                    status, obj = 409, {"message": "Conflict"}
                else:
                    try:
                        new_bytes = base64.b64decode(body.get("content", ""))
                    except Exception:
                        status, obj = 400, {"message": "content が base64 として読めません"}
                    else:
                        STATE["files"][filepath] = new_bytes
                        new_sha = hashlib.sha1(new_bytes).hexdigest()
                        status = 200 if existing is not None else 201
                        obj = {"content": {"sha": new_sha, "path": filepath}, "commit": {"sha": new_sha}}

        self._send_json(status, obj, req_bytes=len(raw))


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
