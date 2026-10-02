# -*- coding: utf-8 -*-
"""画面に戻ったときの同期と、古いメニューのまま記録したときの通し検査。
偽GitHub（mock_github.py）を立て、ヘッドレス Edge で v6_sync_return_eval.js を動かす。

  python tools/v6_sync_return_e2e.py        （先に python tools/build.py local）

最後に「N passed, M failed」を出す（check_all.py が読む）。本物の GitHub・本物の鍵には触れない。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
DIST = os.path.join(ROOT, "dist", "local", "training-log.html")
URL = "file:///" + DIST.replace("\\", "/").replace(" ", "%20")
MOCK_PORT, CDP_PORT = 8851, 9482


def main():
    if not os.path.exists(DIST):
        print("ビルド結果が無い（先に python tools/build.py local）: " + DIST)
        print("0 passed, 1 failed")
        sys.exit(1)
    work = tempfile.mkdtemp(prefix="sync_return_")
    mock = subprocess.Popen([sys.executable, os.path.join(TOOLS, "mock_github.py"), str(MOCK_PORT), "e2e-token"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    passed, failed, fails = 0, 1, ["結果が取れない"]
    try:
        for _ in range(100):
            try:
                with urllib.request.urlopen("http://127.0.0.1:%d/_mock/list" % MOCK_PORT, timeout=1) as r:
                    if r.status == 200:
                        break
            except Exception:
                time.sleep(0.1)
        log = os.path.join(work, "log.json")
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        p = subprocess.run([sys.executable, os.path.join(TOOLS, "cdp_shot.py"), URL, os.path.join(work, "shot.png"),
                            "--eval", os.path.join(TOOLS, "v6_sync_return_eval.js"), "--ready", "window.__ready",
                            "--dump", "window.__result", "--log", log, "--width", "390", "--height", "844",
                            "--timeout", "90", "--port", str(CDP_PORT), "--profile", os.path.join(work, "profile")],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", env=env, timeout=180)
        try:
            with open(log, encoding="utf-8") as f:
                dump = json.load(f).get("dump") or {}
            passed, fails = dump.get("pass", 0), dump.get("fail", ["結果が取れない"])
            failed = len(fails)
        except Exception as e:   # noqa: BLE001
            fails = ["cdp_shot の結果を読めない: %s / %s" % (e, (p.stdout or p.stderr or "").strip()[-300:])]
    finally:
        try:
            mock.kill()
        except Exception:
            pass
        shutil.rmtree(work, ignore_errors=True)
    for f in fails:
        print("FAIL - " + str(f))
    print("\n%d passed, %d failed" % (passed, failed))
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
