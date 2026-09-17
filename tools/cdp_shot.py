"""ヘッドレス Edge を CDP で操作してページを PNG に撮る。

使い方:
  python tools/cdp_shot.py <url> <out.png> [--eval file.js] [--ready "expr"]
                           [--width 1400] [--height 900] [--full] [--log log.json]

--eval   読み込み後に評価する JS ファイル（Promise なら待つ）
--ready  真になるまで待つ JS 式（例: "window.__ready===true"）
--full   ページ全体を撮る（既定はビューポートのみ）
ログ（console・例外・読み込み失敗）は --log に UTF-8 JSON で書く。
"""
import argparse
import base64
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request

import websocket

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

ERR_HOOK = """
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(String(e.message) + ' @' + (e.filename||'') + ':' + (e.lineno||'')));
window.addEventListener('unhandledrejection', e => window.__errs.push('reject: ' + String(e.reason && (e.reason.stack || e.reason.message) || e.reason)));
"""


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=120, suppress_origin=True)
        self.next_id = 0
        self.events = []

    def call(self, method, **params):
        self.next_id += 1
        mid = self.next_id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})
            if "method" in msg:
                self.events.append(msg)

    def evaluate(self, expr, await_promise=True):
        r = self.call("Runtime.evaluate", expression=expr, awaitPromise=await_promise,
                      returnByValue=True)
        if "exceptionDetails" in r:
            d = r["exceptionDetails"]
            text = d.get("exception", {}).get("description") or d.get("text")
            raise RuntimeError(f"evaluate failed: {text}")
        return r.get("result", {}).get("value")


def wait_http(port, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2) as r:
                return json.loads(r.read())
        except Exception:
            time.sleep(0.25)
    raise RuntimeError("Edge の CDP ポートに接続できない")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("out")
    ap.add_argument("--eval", dest="eval_file")
    ap.add_argument("--ready")
    ap.add_argument("--width", type=int, default=1400)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--mobile", action="store_true")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--timeout", type=float, default=90)
    ap.add_argument("--settle", type=float, default=0.3)
    ap.add_argument("--log")
    ap.add_argument("--dump", help="撮影後に評価して log に入れる JS 式")
    ap.add_argument("--port", type=int, default=9333)
    ap.add_argument("--profile", help="プロファイルを使い回す（保存の永続を試すとき）")
    args = ap.parse_args()

    profile = args.profile or tempfile.mkdtemp(prefix="edgecdp_")
    os.makedirs(profile, exist_ok=True)
    proc = subprocess.Popen([
        EDGE, "--headless=new", f"--remote-debugging-port={args.port}",
        f"--user-data-dir={profile}", "--remote-allow-origins=*",
        "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
        f"--window-size={args.width},{args.height}", "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log = {"url": args.url, "errors": [], "console": [], "failed": []}
    try:
        wait_http(args.port)
        with urllib.request.urlopen(f"http://127.0.0.1:{args.port}/json", timeout=5) as r:
            targets = json.loads(r.read())
        page = next(t for t in targets if t.get("type") == "page")
        cdp = CDP(page["webSocketDebuggerUrl"])
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Network.enable")
        cdp.call("Page.addScriptToEvaluateOnNewDocument", source=ERR_HOOK)
        cdp.call("Emulation.setDeviceMetricsOverride", width=args.width, height=args.height,
                 deviceScaleFactor=args.scale, mobile=args.mobile)
        cdp.call("Page.navigate", url=args.url)

        t0 = time.time()
        while time.time() - t0 < args.timeout:
            if cdp.evaluate("document.readyState", await_promise=False) == "complete":
                break
            time.sleep(0.2)

        if args.eval_file:
            with open(args.eval_file, encoding="utf-8") as f:
                cdp.evaluate(f.read())
        if args.ready:
            t0 = time.time()
            while True:
                if cdp.evaluate(f"!!({args.ready})", await_promise=False):
                    break
                if time.time() - t0 > args.timeout:
                    raise RuntimeError(f"ready 待ちがタイムアウト: {args.ready}")
                time.sleep(0.25)
        time.sleep(args.settle)

        clip = None
        if args.full:
            w, h = cdp.evaluate("[document.documentElement.scrollWidth, document.documentElement.scrollHeight]",
                                await_promise=False)
            clip = {"x": 0, "y": 0, "width": w, "height": h, "scale": 1}
        params = {"format": "png", "captureBeyondViewport": bool(args.full)}
        if clip:
            params["clip"] = clip
        shot = cdp.call("Page.captureScreenshot", **params)
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "wb") as f:
            f.write(base64.b64decode(shot["data"]))

        log["errors"] = cdp.evaluate("window.__errs || []", await_promise=False) or []
        if args.dump:
            log["dump"] = cdp.evaluate(args.dump, await_promise=False)
        for ev in cdp.events:
            m = ev["method"]
            p = ev.get("params", {})
            if m == "Runtime.consoleAPICalled":
                log["console"].append(p.get("type") + ": " + " ".join(
                    str(a.get("value", a.get("description", ""))) for a in p.get("args", [])))
            elif m == "Runtime.exceptionThrown":
                d = p.get("exceptionDetails", {})
                log["errors"].append(d.get("exception", {}).get("description") or d.get("text"))
            elif m == "Network.loadingFailed":
                log["failed"].append(p.get("errorText"))
            elif m == "Network.responseReceived":
                st = p.get("response", {}).get("status", 0)
                if st >= 400:
                    log["failed"].append(f"{st} {p['response'].get('url')}")
        try:
            cdp.call("Browser.close")
        except Exception:
            pass
    finally:
        if args.log:
            with open(args.log, "w", encoding="utf-8") as f:
                json.dump(log, f, ensure_ascii=False, indent=1)
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        if not args.profile:
            shutil.rmtree(profile, ignore_errors=True)
    print("ok", args.out, "errors:", len(log["errors"]), "failed:", len(log["failed"]))


if __name__ == "__main__":
    main()
