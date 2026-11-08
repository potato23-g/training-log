# -*- coding: utf-8 -*-
"""スマホ幅・本物のタッチで、種目を外す・後に回す・終えるときに画面が飛ばないか、つまみの上から指を動かしてもスクロールできるか、
   長押しなら並べ替えられるか、目標と違う回数で記録したら以降の目標がその回数になるか（2026-11-08 本人の指摘）。
   python v13_scroll_e2e.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, io
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp_shot import CDP, EDGE, wait_http, kill_edge_using
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
URL = "file:///" + os.path.join(ROOT, "dist", "local", "training-log.html").replace("\\", "/").replace(" ", "%20")
PORT = 9547
SETUP = r"""
((open) => {
  state.sessions = {}; state.gear = {items: [{kg: 2, n: 2}, {kg: 5, n: 2}, {kg: 10, n: 2}], updatedAt: 1};
  catalogMemo = null; planMemo = null; resetProg();
  const s = session(TODAY); s.plan = ["curl","ohp","row","goblet","fly","hipthrust"].map(x => catalogItem(x)); s.planAt = Date.now();
  planMemo = null; resetProg(); if(typeof stopRest === "function") stopRest(); todayMsg = "";
  tab = "today"; openEx = open; render(); window.scrollTo(0, 0); return true;
})(%s)
"""
HDR = """((id) => { const h = document.querySelector('.exrow[data-row="'+id+'"]'); return h ? Math.round(h.getBoundingClientRect().top) : null; })(%s)"""
prof = tempfile.mkdtemp()
proc = subprocess.Popen([EDGE, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={prof}", "--remote-allow-origins=*",
    "--no-first-run", "--no-default-browser-check", "--window-size=390,844", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    wait_http(PORT)
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=5) as r:
        page = next(t for t in json.loads(r.read()) if t.get("type") == "page")
    cdp = CDP(page["webSocketDebuggerUrl"]); cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=3, mobile=True)
    cdp.call("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=5)
    cdp.call("Page.navigate", url=URL)
    t0 = time.time()
    while time.time() - t0 < 30 and cdp.evaluate("document.readyState", await_promise=False) != "complete": time.sleep(0.2)
    time.sleep(0.8)
    ev = lambda js: cdp.evaluate(js, await_promise=False)
    def tap(sel, center=False):
        p = ev("""((sel)=>{const b=document.querySelector(sel); if(!b) return null; const r=b.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2];})(%s)""" % json.dumps(sel))
        if not p: return False
        x, y = p
        cdp.call("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{"x": x, "y": y}]); time.sleep(0.07)
        cdp.call("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[]); time.sleep(0.9); return True
    def place(id, y):
        ev("""((id,y)=>{const h=document.querySelector('.exrow[data-row="'+id+'"]'); window.scrollBy(0, h.getBoundingClientRect().top - y); return true;})(%s,%d)""" % (json.dumps(id), y))
        time.sleep(0.3)
    def snap(lbl): print(lbl, "scrollY", ev("Math.round(scrollY)"), {i: ev(HDR % json.dumps(i)) for i in ["row","goblet","fly","hipthrust"]})
    passed = failed = 0
    def ok(c, m):
        global passed, failed
        passed += bool(c); failed += (not c); print(("PASS - " if c else "FAIL - ") + m)
    order = lambda: ev("[...document.querySelectorAll('.exrow[data-row]')].map(r=>r.dataset.row).join(',')")
    top = lambda i: ev(HDR % json.dumps(i))
    sb = lambda: ev("Math.round(stickyBottom())")
    for act in ("skip", "later"):
        ev(SETUP % '"goblet"'); time.sleep(1.0); place("goblet", 120)
        ev("document.querySelector('.exrow[data-row=goblet] [data-act=%s]').scrollIntoView({block:'center'}); true" % act); time.sleep(0.3)
        tap('.exrow[data-row=goblet] [data-act=%s]' % act)
        t, b = top("fly"), sb()
        ok(t is not None and b <= t <= b + 20, "「%s」のあと、次のカードが上の帯のすぐ下に来る（%s・帯の下 %s）" % ({"skip": "今日は外す", "later": "後に回す"}[act], t, b))
    ev(SETUP % '"goblet"'); time.sleep(1.0); place("goblet", -130)
    for k in range(3): tap('.exrow[data-row=goblet] [data-act=addset]')
    t, b = top("goblet"), sb()
    ok(b <= t <= b + 20 and top("fly") < 844, "見出しが隠れた状態で最後のセットを記録すると、閉じたカードが帯のすぐ下に来て次のカードも見える（%s）" % t)
    def drag(sel, hold, dy):
        ev("document.querySelector(%s).scrollIntoView({block:'center'}); true" % json.dumps(sel)); time.sleep(0.5)
        x, y = ev("""((sel)=>{const r=document.querySelector(sel).getBoundingClientRect(); return [r.left+15, r.top+r.height/2];})(%s)""" % json.dumps(sel))
        y0 = ev("scrollY")
        cdp.call("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{"x": x, "y": y}]); time.sleep(hold)
        for k in range(1, 13):
            time.sleep(0.03); cdp.call("Input.dispatchTouchEvent", type="touchMove", touchPoints=[{"x": x, "y": y - k * dy}])
        cdp.call("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[]); time.sleep(1.0)
        return ev("scrollY") - y0
    ev(SETUP % "null"); time.sleep(1.0); o0 = order()
    d = drag(".exrow[data-row=fly] .grip", 0.02, 18)
    ok(d > 100 and order() == o0, "つまみの上から指をすぐ動かすと、ページがスクロールする（%d px・並びはそのまま）" % d)
    ev(SETUP % "null"); time.sleep(1.0)
    d = drag(".exrow[data-row=goblet] .grip", 0.45, 12)
    ok(abs(d) < 2 and order().startswith("curl,ohp,goblet,row"), "つまみを長押ししてから動かすと、スクロールせずに並べ替わる（%s）" % order())
    ev(SETUP % '"goblet"'); time.sleep(1.0)
    t0 = ev("suggestNext(itemOf('goblet'), null).target")
    ev("document.querySelector('.exrow[data-row=goblet] [data-act=addset]').scrollIntoView({block:'center'}); document.getElementById('r_goblet').value = %d; true" % (t0 + 3))
    tap('.exrow[data-row=goblet] [data-act=addset]')
    s2 = ev("suggestNext(itemOf('goblet'), entryFor(TODAY,'goblet',false)).target"); v2 = ev("document.getElementById('r_goblet').value")
    ok(s2 == t0 + 3 and v2 == str(t0 + 3), "目標（%d）と違う回数（%d）で記録すると、次のセットの目標と回数欄がその回数になる（%s・%s）" % (t0, t0 + 3, s2, v2))
finally:
    try: cdp.call("Browser.close")
    except Exception: pass
    try: proc.wait(timeout=5)
    except Exception: proc.kill()
    kill_edge_using(prof)
print("\n%d passed, %d failed" % (passed, failed))
sys.exit(0 if failed == 0 else 1)
