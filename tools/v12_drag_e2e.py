# -*- coding: utf-8 -*-
"""今日のカードの並べ替えを、本物のマウス操作で試す（カードを開いている／いない）。 python v12_drag_e2e.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request, shutil, io
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp_shot import CDP, EDGE, wait_http, kill_edge_using  # noqa
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DIST = os.path.join(ROOT, "dist", "local", "training-log.html")
URL = "file:///" + DIST.replace("\\", "/").replace(" ", "%20")
PORT = 9492
SETUP = r"""
((open) => {
  state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1};
  catalogMemo = null; planMemo = null; resetProg();
  const s = session(TODAY); s.plan = [catalogItem("curl"), catalogItem("ohp"), catalogItem("row")]; s.planAt = Date.now();
  planMemo = null; resetProg();
  if(typeof stopRest === "function") stopRest();
  tab = "today"; openEx = open; render();
  window.scrollTo(0, 0);
  return true;
})(%s)
"""
ORDER = 'JSON.stringify(Array.from(document.querySelectorAll(".exrow[data-row]")).map(r => r.dataset.row))'
GRIP = """((id) => { const g = document.querySelector('.exrow[data-row="' + id + '"] .grip'); g.scrollIntoView({block: "center"});
  const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })('%s')"""
ROWBOX = """((id) => { const r = document.querySelector('.exrow[data-row="' + id + '"]').getBoundingClientRect(); return [r.top, r.bottom]; })('%s')"""
passed = failed = 0
def ok(c, m):
    global passed, failed
    passed += bool(c); failed += (not c); print(("PASS - " if c else "FAIL - ") + m)
def drag(cdp, x, y, y2, steps=20):
    cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)
    cdp.call("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1)
    time.sleep(0.05)
    for i in range(1, steps + 1):
        cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y + (y2 - y) * i / steps, button="left", buttons=1)
        time.sleep(0.02)
    cdp.call("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y2, button="left", clickCount=1)
    time.sleep(0.6)
prof = tempfile.mkdtemp()
proc = subprocess.Popen([EDGE, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={prof}", "--remote-allow-origins=*",
    "--no-first-run", "--no-default-browser-check", "--window-size=390,844", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    wait_http(PORT)
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=5) as r:
        page = next(t for t in json.loads(r.read()) if t.get("type") == "page")
    cdp = CDP(page["webSocketDebuggerUrl"]); cdp.call("Page.enable"); cdp.call("Runtime.enable")
    cdp.call("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=1, mobile=False)
    cdp.call("Page.navigate", url=URL)
    t0 = time.time()
    while time.time() - t0 < 30 and cdp.evaluate("document.readyState", await_promise=False) != "complete": time.sleep(0.2)
    time.sleep(0.5)
    ev = lambda js: cdp.evaluate(js, await_promise=False)
    cases = [("閉じたまま curl を row の下へ", "null", "curl", "row", ["ohp", "row", "curl"]),
             ("ohp を開いたまま curl を row の下へ", '"ohp"', "curl", "row", ["ohp", "row", "curl"]),
             ("ohp を開いたまま ohp を row の下へ", '"ohp"', "ohp", "row", ["curl", "row", "ohp"]),
             ("ohp を開いたまま row を一番上へ", '"ohp"', "row", "curl", ["row", "curl", "ohp"])]
    for label, open_, who, to, want in cases:
        ev(SETUP % open_)
        x, y = ev(GRIP % who)
        top, bot = ev(ROWBOX % to)
        # 指を行き先のカードの向こう側の端近くまで動かす
        y2 = bot - 10 if want[-1] == who else top + 10
        drag(cdp, x, y, y2)
        got = json.loads(ev(ORDER))
        ok(got == want, f"{label}: {got}（期待 {want}）")
finally:
    proc.terminate(); time.sleep(1); kill_edge_using(prof); shutil.rmtree(prof, ignore_errors=True)
print(f"{passed} passed, {failed} failed")
