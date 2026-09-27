"""更新ボタンと新しい版の取り込み（B1・B17）の通しの検査。

GitHub Pages と同じ Cache-Control: max-age=600 を付けて docs/ を配る小さなサーバーを立て、
ヘッドレス Edge で古い版を開いて Service Worker に保存させたあと、配る中身を新しい版に差し替え、
「更新」ボタンを1回押しただけで新しい版に切り替わるかを確かめる。

  python tools/v4_update_e2e.py            （先に python tools/build.py site を自動で走らせる）
"""
import http.server
import io
import json
import os
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

import websocket

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
HTTP_PORT = 8871
CDP_PORT = 9479


def log(*a):
    print(*a, flush=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    """GitHub Pages と同じく、どのファイルにも max-age=600 を付ける"""
    def end_headers(self):
        self.send_header("Cache-Control", "max-age=600")
        super().end_headers()

    def log_message(self, *a):
        pass


def serve(dirpath):
    handler = lambda *a, **k: Handler(*a, directory=dirpath, **k)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", HTTP_PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


class CDP:
    def __init__(self, port):
        self.port = port
        self.ws = None
        self.n = 0

    def attach(self):
        for _ in range(100):
            try:
                with urllib.request.urlopen("http://127.0.0.1:%d/json" % self.port, timeout=2) as r:
                    pages = [t for t in json.loads(r.read()) if t.get("type") == "page"]
                if pages:
                    self.ws = websocket.create_connection(pages[0]["webSocketDebuggerUrl"], timeout=30, suppress_origin=True)
                    return
            except Exception:
                pass
            time.sleep(0.2)
        raise RuntimeError("Edge に接続できない")

    def call(self, method, **params):
        self.n += 1
        mid = self.n
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(method + ": " + str(msg["error"]))
                return msg.get("result", {})

    def js(self, expr, wait=True):
        """ページが開き直している最中は失敗するので、そのときは None を返す"""
        try:
            r = self.call("Runtime.evaluate", expression=expr, awaitPromise=wait, returnByValue=True)
            if "exceptionDetails" in r:
                return None
            return r.get("result", {}).get("value")
        except Exception:
            return None


def wait_for(cdp, expr, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v = cdp.js(expr, wait=False)
        if v:
            return v
        time.sleep(0.25)
    return None


def main():
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build.py"), "site"], check=True, stdout=subprocess.DEVNULL)
    work = tempfile.mkdtemp(prefix="upd_e2e_")
    v1, v2, live = (os.path.join(work, x) for x in ("v1", "v2", "live"))
    shutil.copytree(os.path.join(ROOT, "docs"), v1)
    shutil.copytree(v1, v2)
    # 新しい版: 版の日時と Service Worker の保存の名前だけ変える（中身が変われば SW も新しいものとして入る）
    idx = io.open(os.path.join(v2, "index.html"), encoding="utf-8").read()
    old_ver = idx.split('BUILD_VERSION = "', 1)[1].split('"', 1)[0]
    new_ver = old_ver + "-新"
    io.open(os.path.join(v2, "index.html"), "w", encoding="utf-8", newline="\n").write(idx.replace('BUILD_VERSION = "' + old_ver + '"', 'BUILD_VERSION = "' + new_ver + '"'))
    sw = io.open(os.path.join(v2, "service-worker.js"), encoding="utf-8").read()
    io.open(os.path.join(v2, "service-worker.js"), "w", encoding="utf-8", newline="\n").write(sw.replace("const CACHE_NAME = 'trainlog-", "const CACHE_NAME = 'trainlog-new-"))
    shutil.copytree(v1, live)
    httpd = serve(live)
    profile = os.path.join(work, "profile")
    proc = subprocess.Popen([EDGE, "--headless=new", "--remote-debugging-port=%d" % CDP_PORT, "--user-data-dir=" + profile,
                             "--remote-allow-origins=*", "--no-first-run", "--no-default-browser-check",
                             "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    results = []
    try:
        cdp = CDP(CDP_PORT)
        cdp.attach()
        cdp.call("Page.enable")
        url = "http://127.0.0.1:%d/index.html" % HTTP_PORT
        cdp.call("Page.navigate", url=url)
        wait_for(cdp, "document.readyState==='complete' && typeof BUILD_VERSION!=='undefined'")
        # Service Worker が入って、このページを受け持つまで待つ（受け持つには1回開き直す）
        cdp.js("navigator.serviceWorker.ready.then(()=>true)")
        cdp.call("Page.reload")
        time.sleep(1.0)
        ctrl = wait_for(cdp, "!!navigator.serviceWorker.controller && typeof BUILD_VERSION!=='undefined'")
        v = cdp.js("BUILD_VERSION", wait=False)
        results.append(("古い版が Service Worker の保存から開く", bool(ctrl) and v == old_ver, v))
        # ブラウザの控え（HTTPキャッシュ）にも古い版が入っている状態にする
        cdp.js("fetch('./', {cache:'default'}).then(r=>r.text()).then(()=>true)")
        cdp.js("fetch('./index.html', {cache:'default'}).then(r=>r.text()).then(()=>true)")
        # C18: 同じアドレスで動く別のアプリの保存（trainlog- で始まらない名前）を仕込んでおく。
        # 新しい版に切り替わったあとも、これが残っているかを確かめる
        cdp.js("caches.open('other-app-cache').then(c=>c.put(new Request('/other'), new Response('x'))).then(()=>true)")

        # 配る中身を新しい版に差し替える（GitHub Pages に新しい版が出た）
        for name in os.listdir(v2):
            src = os.path.join(v2, name)
            dst = os.path.join(live, name)
            if os.path.isdir(src):
                shutil.rmtree(dst, ignore_errors=True)
                shutil.copytree(src, dst)
            else:
                shutil.copyfile(src, dst)

        # 「更新」を1回押す
        cdp.js("document.getElementById('updBtn').click(), true", wait=False)
        time.sleep(0.8)
        first_status = cdp.js("document.getElementById('status').textContent", wait=False) or ""
        results.append(("1回目で「最新です」と言わない", "すでに最新" not in first_status, first_status))
        got = wait_for(cdp, "typeof BUILD_VERSION!=='undefined' && BUILD_VERSION===%s" % json.dumps(new_ver), timeout=40)
        results.append(("1回押しただけで新しい版に切り替わる", bool(got), cdp.js("BUILD_VERSION", wait=False)))
        # 新しい版の保存がそろっていて、古い保存は消えている
        names = cdp.js("caches.keys()") or []
        own_names = [n for n in names if n.startswith("trainlog-")]
        results.append(("自分の保存は新しい版だけ", len(own_names) == 1 and "new" in own_names[0], names))
        # C18: 同じアドレスの他アプリの保存（trainlog- で始まらない）は消えていない
        results.append(("同じアドレスの他アプリの保存は消えない", "other-app-cache" in names, names))
        # オフラインでも新しい版が開く
        cdp.call("Network.enable")
        cdp.call("Network.emulateNetworkConditions", offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
        cdp.call("Page.reload")
        off = wait_for(cdp, "typeof BUILD_VERSION!=='undefined' && BUILD_VERSION===%s" % json.dumps(new_ver), timeout=20)
        results.append(("オフラインでも新しい版が開く", bool(off), cdp.js("BUILD_VERSION", wait=False)))

        # C6: 入力中は自動の再読み込みを後回しにする（追加の検査。壊れても他の結果は失わないように囲う）
        try:
            cdp.call("Network.emulateNetworkConditions", offline=False, latency=0, downloadThroughput=-1, uploadThroughput=-1)
            cdp.call("Page.reload")
            wait_for(cdp, "document.readyState==='complete' && typeof BUILD_VERSION!=='undefined'")
            cdp.js("navigator.serviceWorker.ready.then(()=>true)")

            v3 = os.path.join(work, "v3")
            shutil.copytree(v2, v3)
            idx3 = io.open(os.path.join(v3, "index.html"), encoding="utf-8").read()
            ver3 = new_ver + "-3"
            io.open(os.path.join(v3, "index.html"), "w", encoding="utf-8", newline="\n").write(
                idx3.replace('BUILD_VERSION = "' + new_ver + '"', 'BUILD_VERSION = "' + ver3 + '"'))
            sw3 = io.open(os.path.join(v3, "service-worker.js"), encoding="utf-8").read()
            io.open(os.path.join(v3, "service-worker.js"), "w", encoding="utf-8", newline="\n").write(
                sw3.replace("const CACHE_NAME = 'trainlog-new-", "const CACHE_NAME = 'trainlog-v3-"))
            for name in os.listdir(v3):
                src = os.path.join(v3, name)
                dst = os.path.join(live, name)
                if os.path.isdir(src):
                    shutil.rmtree(dst, ignore_errors=True)
                    shutil.copytree(src, dst)
                else:
                    shutil.copyfile(src, dst)

            # アプリのUIには依存せず、その場で作った入力欄にフォーカスしてから、裏で新しい版を見つけさせる
            focused = cdp.js("(function(){var t=document.createElement('input'); t.id='__e2e_probe';"
                              "document.body.appendChild(t); t.focus(); return document.activeElement===t;})()", wait=False)
            cdp.js("navigator.serviceWorker.getRegistration().then(function(r){return r.update();}).then(function(){return true;})", wait=False)
            # 「まだ古い版」だけでは、単に新しいSWの有効化がまだ終わっていないだけでも成立してしまう。
            # controllerchangeが実際に起き、後回しの予約(__swReloadScheduled)が立ったことを先に確かめる
            scheduled = wait_for(cdp, "!!window.__swReloadScheduled", timeout=15)
            still_old = cdp.js("BUILD_VERSION", wait=False)
            results.append(("入力中は自動の再読み込みを後回しにする",
                             bool(focused) and bool(scheduled) and still_old == new_ver,
                             {"focused": focused, "scheduled": scheduled, "still_old": still_old}))

            cdp.js("(function(){var el=document.activeElement; if(el&&el.blur) el.blur(); return true;})()", wait=False)
            got3 = wait_for(cdp, "typeof BUILD_VERSION!=='undefined' && BUILD_VERSION===%s" % json.dumps(ver3), timeout=20)
            results.append(("フォーカスが外れたら切り替わる", bool(got3), cdp.js("BUILD_VERSION", wait=False)))
        except Exception as e:
            results.append(("入力中は自動の再読み込みを後回しにする（追加検査が例外で止まった）", False, repr(e)))
    finally:
        # 起動した msedge.exe は別の本体に引き継いで先に終わることがあり、親子をたどって止めても
        # 実際に動いている Edge が残る（プロファイルを掴んだままになり、フォルダも消えない）。
        # この検査の一時フォルダ名を含む Edge を、コマンドラインで探してすべて止める
        try:
            proc.kill()
        except Exception:
            pass
        try:
            ps = ("Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
                  "Where-Object { $_.CommandLine -like '*%s*' } | "
                  "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }") % os.path.basename(work)
            subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, timeout=30)
        except Exception:
            pass
        httpd.shutdown()
        for _ in range(5):
            time.sleep(1.0)
            shutil.rmtree(work, ignore_errors=True)
            if not os.path.exists(work):
                break

    bad = 0
    for name, passed, detail in results:
        log(("PASS" if passed else "FAIL") + " - " + name + ("" if passed else "  (" + str(detail) + ")"))
        bad += 0 if passed else 1
    log("%d passed, %d failed" % (len(results) - bad, bad))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
