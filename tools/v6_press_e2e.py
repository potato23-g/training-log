# -*- coding: utf-8 -*-
"""「記録」などのボタンを、本物のマウス操作（CDP の Input.dispatchMouseEvent）で押す通しの検査。
JS から el.click() を呼ぶ検査では、押してから離すまでのあいだに画面が描き直されて click が届かなくなる
不具合（2026-10-02 本人の指摘「2回続けて記録を押しても2回目が入らないことがある」）を見つけられないため。

  python tools/v6_press_e2e.py        （先に python tools/build.py local）

確かめること:
  1 ふつうに1回押すと1セット入る
  2 回数の入力欄にフォーカスがあるあいだに同期の描き直しが待ちに入っていても、「記録」が入る
  3 押してから離すまでのあいだに別の描き直しが走っても、「記録」が入る
  4 0.5秒あけて2回押すと2セット入る（以前は0.8秒以内の2回目を捨てていた）
  5 指の弾みの二重押し（同じ数字で0.4秒以内）は1セットだけ
  6 数字を変えた直後の2回目は、すぐ押しても入る
  6b ボタンが画面の下のほうにあるとき、記録のあとに出る休憩の帯がボタンを隠さない
  7 設定のシートで入力している最中に同期の描き直しが来ても、入力が消えない
最後に「N passed, M failed」を出す（check_all.py が読む）。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp_shot import CDP, EDGE, wait_http, kill_edge_using   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist", "local", "training-log.html")
URL = "file:///" + DIST.replace("\\", "/").replace(" ", "%20")
PORT = 9481

SETUP = r"""
(() => {
  state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1};
  catalogMemo = null; planMemo = null; resetProg();
  const s = session(TODAY); s.plan = [catalogItem("curl")]; s.planAt = Date.now();
  planMemo = null; resetProg();
  if(typeof closeSettings === "function") closeSettings();
  if(typeof stopRest === "function") stopRest();
  tab = "today"; openEx = "curl"; render();
  for(const k in lastAddAt) delete lastAddAt[k];
  window.scrollTo(0, 0);
  return true;
})()
"""
SETS = '(entryFor(TODAY, "curl", false) || {sets: []}).sets.length'
BTN = """(() => { const b = document.querySelector('[data-act="addset"][data-ex="curl"]'); b.scrollIntoView({block: "center"});
  const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()"""

passed = failed = 0


def ok(cond, msg):
    global passed, failed
    if cond:
        passed += 1
        print("PASS - " + msg)
    else:
        failed += 1
        print("FAIL - " + msg)


def press(cdp, x, y, hold=0.06, between=None, after=0.15):
    cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)
    cdp.call("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1)
    if between:
        between()
    time.sleep(hold)
    cdp.call("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1)
    time.sleep(after)


def main():
    if not os.path.exists(DIST):
        print("ビルド結果が無い（先に python tools/build.py local）: " + DIST)
        print("0 passed, 1 failed")
        sys.exit(1)
    profile = tempfile.mkdtemp(prefix="press_e2e_")
    proc = subprocess.Popen([EDGE, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}",
                             "--remote-allow-origins=*", "--no-first-run", "--no-default-browser-check",
                             "--window-size=390,844", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_http(PORT)
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=5) as r:
            page = next(t for t in json.loads(r.read()) if t.get("type") == "page")
        cdp = CDP(page["webSocketDebuggerUrl"])
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=1, mobile=False)
        cdp.call("Page.navigate", url=URL)
        t0 = time.time()
        while time.time() - t0 < 30 and cdp.evaluate("document.readyState", await_promise=False) != "complete":
            time.sleep(0.2)
        time.sleep(0.5)
        ev = lambda js: cdp.evaluate(js, await_promise=False)   # noqa: E731

        # 1 ふつうに1回
        ev(SETUP)
        x, y = ev(BTN)
        press(cdp, x, y)
        ok(ev(SETS) == 1, "1回押すと1セット入る")

        # 2 入力欄にフォーカス → 同期の描き直しが待ちに入る → そのまま「記録」
        ev(SETUP)
        ev('document.getElementById("r_curl").focus(); syncSafeRender(); true')
        ok(ev("syncRenderPending") is True, "入力欄にフォーカスがあるあいだ、同期の描き直しは待ちに入る")
        x, y = ev(BTN)
        press(cdp, x, y)
        ok(ev(SETS) == 1, "同期の描き直しが待ちに入っていても「記録」が入る")
        ok(ev("syncRenderPending") is False and ev("renderWaiting") is False, "待たせていた描き直しは、押し終わったあとに済んでいる")

        # 3 押しているあいだに別の描き直しが走る
        ev(SETUP)
        x, y = ev(BTN)
        press(cdp, x, y, between=lambda: ev("render(); true"))
        ok(ev(SETS) == 1, "押しているあいだに描き直しが来ても「記録」が入る")

        # 4 0.5秒あけて、同じ場所を続けて押す（ボタンの位置を取り直さない。指は同じ場所を押すので）
        POS = """(() => { const r = document.querySelector('[data-act="addset"][data-ex="curl"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()"""
        ev(SETUP)
        x, y = ev(BTN)
        press(cdp, x, y)
        x1, y1 = ev(POS)
        ok(abs(y1 - y) <= 2, "1セット目を記録したあとも「記録」ボタンが同じ位置にある（ずれ %.1f px）" % (y1 - y))
        time.sleep(0.3)
        press(cdp, x, y)
        ok(ev(SETS) == 2, "0.5秒あけて同じ場所を2回押すと2セット入る: " + str(ev(SETS)))
        time.sleep(0.3)
        press(cdp, x, y)
        ok(ev(SETS) == 3, "続けて3回押すと3セット入る: " + str(ev(SETS)))

        # 4b ページの一番上（これ以上は上に送れない位置）でも、同じ場所を続けて押せる
        #    （ボタンより上の行の長さがセットごとに変わると、ここでボタンがずれる）
        ev(SETUP)
        x, y = ev(POS)
        press(cdp, x, y)
        x1, y1 = ev(POS)
        ok(ev("window.scrollY") == 0 and abs(y1 - y) <= 2, "ページの一番上でも、記録のあと「記録」ボタンが動かない（ずれ %.1f px）" % (y1 - y))
        time.sleep(0.3)
        press(cdp, x, y)
        ok(ev(SETS) == 2, "ページの一番上でも、同じ場所を2回押すと2セット入る: " + str(ev(SETS)))

        # 5 指の弾みの二重押し（同じ数字で0.4秒以内）
        ev(SETUP)
        x, y = ev(BTN)
        press(cdp, x, y, hold=0.02, after=0.03)
        press(cdp, x, y, hold=0.02, after=0.2)
        ok(ev(SETS) == 1, "同じ数字のすばやい二重押しは1セットだけ: " + str(ev(SETS)))

        # 6 数字を変えた直後の2回目
        ev(SETUP)
        x, y = ev(BTN)
        press(cdp, x, y, hold=0.02, after=0.0)
        t1 = time.time()
        while ev(SETS) < 1 and time.time() - t1 < 1.0:      # 1回目の処理（描き直し）が済むのを待ってから数字を変える
            time.sleep(0.01)
        ev('(() => { const i = document.getElementById("r_curl"); i.value = String(parseFloat(i.value) - 1); return true; })()')
        press(cdp, x, y, hold=0.02, after=0.2)
        gap = ev('(() => { const s = entryFor(TODAY, "curl", false).sets; return s.length > 1 ? s[1].at - s[0].at : -1; })()')
        ok(ev(SETS) == 2 and 0 <= gap < 400, "数字を変えた2回目は、0.4秒以内でも入る: %s セット・間隔 %s ms" % (ev(SETS), gap))

        # 6b 「記録」ボタンが画面の下のほうにあるとき、記録のあとに出る休憩の帯がボタンを隠さない
        #    （縦の短いスマホでは、種目を開いた位置のままでボタンが画面の下のほうに来る）
        ev(SETUP)
        short = int(ev("""document.querySelector('[data-act="addset"][data-ex="curl"]').getBoundingClientRect().bottom""")) + 24
        cdp.call("Emulation.setDeviceMetricsOverride", width=390, height=short, deviceScaleFactor=1, mobile=False)
        ev(SETUP)
        x, y = ev(POS)
        ok(short - 90 < y < short, "検査の前提: ボタンが画面の下のほうにある（y=%.0f / 高さ %d）" % (y, short))
        press(cdp, x, y)
        ok(ev(SETS) == 1, "画面の下のほうにあるボタンでも1セット入る")
        clear = ev("""(() => { const b = document.querySelector('[data-act="addset"][data-ex="curl"]').getBoundingClientRect(),
              t = document.getElementById("timer"); return [t.classList.contains("on"), b.bottom <= t.getBoundingClientRect().top]; })()""")
        ok(clear[0] and clear[1], "記録のあとに出る休憩の帯が「記録」ボタンを隠さない")
        x, y = ev(POS)
        hit = ev("""(() => { const e = document.elementFromPoint(%f, %f); return !!(e && e.closest('[data-act="addset"]')); })()""" % (x, y))
        ok(hit, "帯の上に出たボタンを、そのまま押せる")
        time.sleep(0.3)
        press(cdp, x, y)
        ok(ev(SETS) == 2, "帯が出たあとも、続けて押すと2セット入る: " + str(ev(SETS)))
        cdp.call("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=1, mobile=False)

        # 7 設定のシートで入力中に同期の描き直しが来ても、入力が消えない
        ev(SETUP)
        has_sheet = ev('typeof openSettings === "function" && (openSettings(), !!document.getElementById("syncRepo"))')
        if has_sheet:
            ev('(() => { const i = document.getElementById("syncRepo"); i.focus(); i.value = "someone/half-typed"; syncSafeRender(); return true; })()')
            ok(ev('document.getElementById("syncRepo").value') == "someone/half-typed",
               "設定のシートで入力している最中の同期の描き直しで、入力が消えない")
            ev('document.activeElement && document.activeElement.blur(); true')
            time.sleep(0.6)
            ok(ev("syncRenderPending") is False, "入力欄から離れると、待たせていた描き直しが済む")
            ev('closeSettings(); true')
        else:
            ok(False, "設定のシートにリポジトリの入力欄が無い（検査の前提が崩れた）")

        try:
            cdp.call("Browser.close")
        except Exception:
            pass
    except Exception as e:   # noqa: BLE001
        ok(False, "途中で止まった: " + str(e))
    finally:
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        kill_edge_using(profile)
        time.sleep(0.5)
        shutil.rmtree(profile, ignore_errors=True)
    print("\n%d passed, %d failed" % (passed, failed))
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
