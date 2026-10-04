# -*- coding: utf-8 -*-
"""休憩の合図が本当に鳴るかを、本物のマウス操作（CDP の Input.dispatchMouseEvent）で「記録」を押して測る通しの検査。
JS から startRest() を呼ぶ検査（v3_timer_eval.js）は「予約したか」しか見られず、ヘッドレスでは指で触れていない扱いで
音声が動かないため、鳴った音の大きさや長さは分からない（2026-10-04 本人の指摘「音がうまく鳴っていない」。
測ってみると、合図は予約どおりに鳴っていたが、はっきり鳴っているのは3音を合わせて0.1秒ほどしかなかった）。

  python tools/v6_sound_e2e.py        （先に python tools/build.py local）

音声の出口につながる線に測定用の AnalyserNode をつなぎ、8ミリ秒ごとに大きさを記録する。検査中の音は出さない（--mute-audio）。
確かめること:
  1 「記録」を押すと音声が動き出し、休憩の長さぶん先に合図が予約される
  2 休憩の終わりに合図が鳴る（終わりの前後0.3秒以内に鳴り始め、最大0.35以上、はっきり鳴っている長さが0.4秒以上）
  3 合図の前に、音の出口を起こしておく小さな音が流れている
  4 休憩の途中で音声が止められても（iPhoneで電話などに割り込まれた想定）、終わりから1秒以内に鳴る
  5 画面から離れて戻ったあとに「記録」を押すと、音声を作り直して合図が鳴る
  6 休憩の途中で画面から離れて戻ったとき、画面に触れただけでは予約した合図をそのままにし、+30秒を押すと音声を作り直して予約し直す
  7 「マナーモード・画面ロック中も鳴らす」では、無音＋合図の音声が最後まで再生される
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
PORT = 9483
REST = 3.5         # 検査で使う休憩の長さ（秒）。合図の前に流す小さな音（1.2秒）より長くする

TAP = r"""
(() => {
  const taps = new WeakMap();
  const orig = AudioNode.prototype.connect;
  window.__ctxMade = 0; window.__rec = [];
  AudioNode.prototype.connect = function(dest, ...rest){
    try{
      if(dest && dest === this.context.destination){
        let a = taps.get(this.context);
        if(!a){ a = this.context.createAnalyser(); a.fftSize = 1024; taps.set(this.context, a); window.__ctxMade++; }
        window.__tap = a;
        orig.call(this, a);
      }
    }catch(e){}
    return orig.call(this, dest, ...rest);
  };
  const buf = new Float32Array(1024);
  setInterval(() => {
    const a = window.__tap; if(!a) return;
    a.getFloatTimeDomainData(buf);
    let p = 0; for(let i = 0; i < buf.length; i++){ const v = Math.abs(buf[i]); if(v > p) p = v; }
    window.__rec.push([Date.now(), Math.round(p * 10000) / 10000]);
  }, 8);
})();
"""
SETUP = r"""
(() => {
  state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1};
  catalogMemo = null; planMemo = null; resetProg();
  const s = session(TODAY); s.plan = [catalogItem("curl")]; s.planAt = Date.now();
  planMemo = null; resetProg();
  if(typeof closeSettings === "function") closeSettings();
  stopRest();
  tab = "today"; openEx = "curl"; render();
  for(const k in lastAddAt) delete lastAddAt[k];
  window.scrollTo(0, 0);
  window.__rec.length = 0;
  return true;
})()
"""
BTN = """(() => { const b = document.querySelector('[data-act="addset"][data-ex="curl"]'); b.scrollIntoView({block: "center"});
  const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()"""
AWAY = """(() => { const seen = s => { Object.defineProperty(document, "visibilityState", {configurable: true, get: () => s});
    document.dispatchEvent(new Event("visibilitychange")); };
  seen("hidden"); seen("visible"); delete document.visibilityState; return acStale; })()"""
SHORTEN = "restEnd = Date.now() + %d; armChime(); restEnd" % int(REST * 1000)

passed = failed = 0


def ok(cond, msg):
    global passed, failed
    if cond:
        passed += 1
        print("PASS - " + msg)
    else:
        failed += 1
        print("FAIL - " + msg)


def press(cdp, x, y, hold=0.06, after=0.15):
    cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)
    cdp.call("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1)
    time.sleep(hold)
    cdp.call("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1)
    time.sleep(after)


def measure(rec, end_ms):
    """rec: [[ミリ秒, 大きさ]...]。合図の鳴り始め（休憩の終わりから何秒か）・最大・はっきり鳴っていた長さ・合図の前の大きさ"""
    if len(rec) < 2:
        return {"on": None, "peak": 0, "loud": 0, "lead": 0}
    step = (rec[-1][0] - rec[0][0]) / (len(rec) - 1) / 1000.0
    chime = [t for t, p in rec if p > 0.02]
    return {"on": round((chime[0] - end_ms) / 1000.0, 2) if chime else None,
            "peak": max(p for t, p in rec),
            "loud": round(sum(1 for t, p in rec if p > 0.15) * step, 2),
            "lead": max([p for t, p in rec if end_ms - 1000 <= t <= end_ms - 200] or [0])}


def main():
    if not os.path.exists(DIST):
        print("ビルド結果が無い（先に python tools/build.py local）: " + DIST)
        print("0 passed, 1 failed")
        sys.exit(1)
    profile = tempfile.mkdtemp(prefix="sound_e2e_")
    proc = subprocess.Popen([EDGE, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}",
                             "--remote-allow-origins=*", "--no-first-run", "--no-default-browser-check", "--mute-audio",
                             "--window-size=390,844", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_http(PORT)
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=5) as r:
            page = next(t for t in json.loads(r.read()) if t.get("type") == "page")
        cdp = CDP(page["webSocketDebuggerUrl"])
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=1, mobile=False)
        cdp.call("Page.addScriptToEvaluateOnNewDocument", source=TAP)
        cdp.call("Page.navigate", url=URL)
        t0 = time.time()
        while time.time() - t0 < 30 and cdp.evaluate("document.readyState", await_promise=False) != "complete":
            time.sleep(0.2)
        time.sleep(0.5)
        ev = lambda js: cdp.evaluate(js, await_promise=False)   # noqa: E731
        ev('PREF.set("sound", true); PREF.set("sure", false); true')

        # 1〜3 ふつうに押して、合図を測る
        ev(SETUP)
        x, y = ev(BTN)
        press(cdp, x, y)
        st = ev('({sets: (entryFor(TODAY, "curl", false) || {sets: []}).sets.length, ac: AC ? AC.state : null, '
                'delay: chimeAt === null ? null : chimeAt - AC.currentTime, left: restLeftSec()})')
        ok(st["sets"] == 1 and st["ac"] == "running", "「記録」を押すと音声が動き出す: " + str(st["ac"]))
        ok(st["delay"] is not None and abs(st["delay"] - st["left"]) <= 1.0,
           "休憩の長さぶん先に合図が予約される（残り %s 秒・合図まで %.1f 秒）" % (st["left"], st["delay"] or -1))
        end = ev(SHORTEN)
        time.sleep(REST + 1.6)
        m = measure(ev("window.__rec"), end)
        ok(m["on"] is not None and abs(m["on"]) <= 0.3, "休憩の終わりに合図が鳴り始める（終わりから %s 秒）" % m["on"])
        ok(m["peak"] >= 0.35 and m["loud"] >= 0.4, "合図がはっきり聞こえる大きさと長さで鳴る（最大 %.2f・はっきり鳴っている長さ %.2f 秒）" % (m["peak"], m["loud"]))
        ok(0.001 <= m["lead"] <= 0.01, "合図の前に、音の出口を起こしておく小さな音が流れている（大きさ %.4f）" % m["lead"])

        # 4 途中で音声が止められた
        ev(SETUP)
        x, y = ev(BTN)
        press(cdp, x, y)
        end = ev(SHORTEN)
        ev("AC.suspend(); true")
        time.sleep(0.6)
        halted = ev("AC.state")
        time.sleep(REST + 1.6)
        m = measure(ev("window.__rec"), end)
        ok(halted == "suspended" and m["on"] is not None and 0 <= m["on"] <= 1.0 and m["peak"] >= 0.35,
           "休憩の途中で音声が止められても、終わりから1秒以内に鳴る（止めた直後 %s・終わりから %s 秒）" % (halted, m["on"]))

        # 5 画面から離れて戻ったあとに押す
        ev(SETUP)
        made = ev("window.__ctxMade")
        stale = ev(AWAY)
        x, y = ev(BTN)
        press(cdp, x, y)
        end = ev(SHORTEN)
        time.sleep(REST + 1.6)
        m = measure(ev("window.__rec"), end)
        ok(stale is True and ev("window.__ctxMade") == made + 1 and ev("AC.state") == "running",
           "画面から離れて戻ったあとに押すと、音声を作り直す")
        ok(m["on"] is not None and abs(m["on"]) <= 0.3 and m["peak"] >= 0.35, "作り直した音声で合図が鳴る（終わりから %s 秒）" % m["on"])

        # 6 休憩の途中で離れて戻る。画面に触れただけ（ボタンでないところ）では作り直さず、+30秒を押すと作り直して予約し直す
        ev(SETUP)
        x, y = ev(BTN)
        press(cdp, x, y)
        made = ev("window.__ctxMade")
        ev(AWAY)
        press(cdp, 195, 6)
        STATE = ('({made: window.__ctxMade, sets: (entryFor(TODAY, "curl", false) || {sets: []}).sets.length, stale: acStale, '
                 'delay: chimeAt === null ? null : chimeAt - AC.currentTime, left: (restEnd - Date.now()) / 1000})')
        s1 = ev(STATE)
        ok(s1["made"] == made and s1["sets"] == 1 and s1["delay"] is not None and abs(s1["delay"] - s1["left"]) <= 0.4,
           "画面から離れて戻り、画面に触れただけでは、予約した合図はそのまま")
        x2, y2 = ev('(() => { const r = document.getElementById("timerPlus").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()')
        press(cdp, x2, y2)
        s2 = ev(STATE)
        ok(s2["made"] == made + 1 and s2["stale"] is False and s2["delay"] is not None and abs(s2["delay"] - s2["left"]) <= 0.4
           and abs(s2["left"] - s1["left"] - 30) <= 1.0, "そのあと +30秒 を押すと、音声を作り直して合図を予約し直す（残り %.0f 秒）" % s2["left"])
        end = ev(SHORTEN)
        time.sleep(REST + 1.6)
        m = measure(ev("window.__rec"), end)
        ok(m["on"] is not None and abs(m["on"]) <= 0.3 and m["peak"] >= 0.35, "予約し直した合図が、休憩の終わりに鳴る（終わりから %s 秒）" % m["on"])

        # 7 確実に鳴らす方式（音声ファイルを流す）
        ev('PREF.set("sure", true); true')
        ev(SETUP)
        x, y = ev(BTN)
        press(cdp, x, y)
        ev(SHORTEN)
        time.sleep(1.0)
        a = ev('({audio: !!restAudio, paused: restAudio ? restAudio.paused : null, t: restAudio ? restAudio.currentTime : null, nodes: chimeNodes.length})')
        ok(a["audio"] and a["paused"] is False and (a["t"] or 0) > 0.3 and a["nodes"] == 0,
           "「マナーモード・画面ロック中も鳴らす」では、無音＋合図の音声が流れ始める")
        time.sleep(REST + 0.6)
        a = ev('({ended: restAudio ? restAudio.ended : null})')
        ok(a["ended"] is True, "その音声が最後（合図）まで再生される")
        ev('PREF.set("sure", false); stopRest(); true')

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
