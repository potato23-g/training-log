# -*- coding: utf-8 -*-
"""一回のタップ／クリックで何回効くかを数える（viewbase.js の upSinceClick）。「次の種目」からの記録で画面が動かないか。
   python v12_tap_e2e.py [touch|mouse]"""
import json, os, subprocess, sys, tempfile, time, urllib.request, shutil, io
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp_shot import CDP, EDGE, wait_http, kill_edge_using  # noqa
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
MODE = sys.argv[1] if len(sys.argv) > 1 else "touch"
URL = "file:///" + os.path.join(ROOT, "dist", "local", "training-log.html").replace("\\", "/").replace(" ", "%20")
PORT = 9493
SETUP = r"""
((open) => {
  state.sessions = {}; state.gear = {items: [{kg: 2, n: 2}, {kg: 5, n: 2}, {kg: 10, n: 2}], updatedAt: 1};
  catalogMemo = null; planMemo = null; resetProg();
  const s = session(TODAY); s.plan = [catalogItem("curl"), catalogItem("ohp"), catalogItem("row")]; s.planAt = Date.now();
  planMemo = null; resetProg(); if(typeof stopRest === "function") stopRest();
  tab = "today"; openEx = open; render(); window.scrollTo(0, 0); return true;
})(%s)
"""
POS = """((sel) => { const g = document.querySelector(sel); if(!g) return null; g.scrollIntoView({block: "center"});
  const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })(%s)"""
passed = failed = 0
def ok(c, m):
    global passed, failed
    passed += bool(c); failed += (not c); print(("PASS - " if c else "FAIL - ") + m)
prof = tempfile.mkdtemp()
proc = subprocess.Popen([EDGE, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={prof}", "--remote-allow-origins=*",
    "--no-first-run", "--no-default-browser-check", "--window-size=390,844", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    wait_http(PORT)
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=5) as r:
        page = next(t for t in json.loads(r.read()) if t.get("type") == "page")
    cdp = CDP(page["webSocketDebuggerUrl"]); cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=(MODE == "touch"))
    if MODE == "touch": cdp.call("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=5)
    cdp.call("Page.navigate", url=URL)
    t0 = time.time()
    while time.time() - t0 < 30 and cdp.evaluate("document.readyState", await_promise=False) != "complete": time.sleep(0.2)
    time.sleep(0.5)
    ev = lambda js: cdp.evaluate(js, await_promise=False)
    ev("window.__acts = []; const _o = onAct; onAct = function(el, e){ window.__acts.push(el.dataset.act); return _o(el, e); }; true")
    def tap(sel):
        p = ev(POS % json.dumps(sel))
        if not p: return False
        x, y = p; time.sleep(0.2)
        if MODE == "touch":
            cdp.call("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{"x": x, "y": y}])
            time.sleep(0.08)
            cdp.call("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])
        else:
            cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)
            cdp.call("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1)
            time.sleep(0.08)
            cdp.call("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1)
        time.sleep(0.8); return True
    sets = lambda id: ev(f"(entryFor(TODAY,'{id}',false)||{{sets:[]}}).sets.length")
    val = lambda i: ev(f"(document.getElementById('{i}')||{{}}).value")

    DUP = """((sel) => { const b = document.querySelector(sel); b.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, detail: 1})); return true; })(%s)"""
    def tapdup(sel, gap):
        p = ev(POS % json.dumps(sel)); x, y = p; time.sleep(0.2)
        def one():
            if MODE == "touch":
                cdp.call("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{"x": x, "y": y}]); time.sleep(0.05)
                cdp.call("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])
            else:
                cdp.call("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1); time.sleep(0.05)
                cdp.call("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1)
        one()
        if gap is None: ev(DUP % json.dumps(sel))       # 指を離していない2回目の click
        else: time.sleep(gap); one()                      # 本当に2回押す
        time.sleep(0.8)
    ev(SETUP % "null")
    b = val("r_curl"); tapdup('.hero [data-act=step][data-t=r][data-d="1"]', None)
    ok(val("r_curl") == str(int(b) + 1), f"＋に click が2回届いても1段: {b} -> {val('r_curl')}")
    b = val("r_curl"); tapdup('.hero [data-act=step][data-t=r][data-d="1"]', 0.15)
    ok(val("r_curl") == str(int(b) + 2), f"＋を速く2回押すと2段: {b} -> {val('r_curl')}")
    ev(SETUP % '"curl"')
    b = sets("curl"); tapdup('.exrow[data-row=curl] [data-act=addset]', None)
    ok(sets("curl") == b + 1, f"記録に click が2回届いても1セット: {b} -> {sets('curl')}")
    ev(SETUP % "null")
    b = sets("curl"); tapdup('.hero [data-act=herorec]', None)
    ok(sets("curl") == b + 1, f"この内容で記録に click が2回届いても1セット: {b} -> {sets('curl')}")
    ev(SETUP % "null"); ev("window.scrollTo(0, 0)")
    y0 = ev("document.querySelector('.hero [data-act=herorec]').getBoundingClientRect().top")
    tapdup('.hero [data-act=herorec]', 0.6)
    y1 = ev("(document.querySelector('.hero [data-act=herorec]')||{getBoundingClientRect:()=>({top:-1})}).getBoundingClientRect().top")
    ok(sets("curl") == 2 and ev("openEx") is None and abs(y1 - y0) < 2,
       f"次の種目から2回記録: セット {sets('curl')}・開いた種目 {ev('openEx')}・ボタンの位置 {y0:.0f} -> {y1:.0f}")
    ev(SETUP % '"curl"')
    ev("document.querySelector('.exrow[data-row=curl] [data-act=addset]').click()"); time.sleep(0.5)
    ok(sets("curl") == 1, "el.click()（指を使わない押し方）は通る")
finally:
    proc.terminate(); time.sleep(1); kill_edge_using(prof); shutil.rmtree(prof, ignore_errors=True)
print(f"{passed} passed, {failed} failed")
