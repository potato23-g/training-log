# -*- coding: utf-8 -*-
"""種目セット（src/app/kits.js）を本物のタップで作る・使う・消す。 python v12_kit_e2e.py [画面を撮るフォルダ]"""
import json, os, subprocess, sys, tempfile, time, urllib.request, shutil, io, base64
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cdp_shot import CDP, EDGE, wait_http, kill_edge_using  # noqa
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
OUT = sys.argv[1] if len(sys.argv) > 1 else None
if OUT: os.makedirs(OUT, exist_ok=True)
URL = "file:///" + os.path.join(ROOT, "dist", "local", "training-log.html").replace("\\", "/").replace(" ", "%20")
PORT = 9494
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
    cdp.call("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
    cdp.call("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=5)
    def load():
        cdp.call("Page.navigate", url=URL); t0 = time.time()
        while time.time() - t0 < 30 and cdp.evaluate("document.readyState", await_promise=False) != "complete": time.sleep(0.2)
        time.sleep(0.8)
    load()
    ev = lambda js: cdp.evaluate(js, await_promise=False)
    def shot(name):
        if not OUT: return
        d = cdp.call("Page.captureScreenshot", format="png")
        open(os.path.join(OUT, name), "wb").write(base64.b64decode(d["data"]))
    def tap(sel, center=True):
        p = ev("""((sel) => { const g = document.querySelector(sel); if(!g) return null; g.scrollIntoView({block: "center"});
          const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })(%s)""" % json.dumps(sel))
        if not p: print("  見つからない:", sel); return False
        time.sleep(0.25); x, y = p
        cdp.call("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{"x": x, "y": y}]); time.sleep(0.06)
        cdp.call("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[]); time.sleep(0.6); return True
    ev("""state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1}; delete state.tune; persistProgram();
      catalogMemo = null; planMemo = null; resetProg(); tab = "today"; openEx = null; render(); true""")
    tap('[data-act="kitnew"]')
    ok(ev("sheet.classList.contains('on')"), "「種目を選んで作る」でシートが開く")
    for ex in ["pushup", "row", "fly"]:
        tap(f'[data-kx="{ex}"]')
    ok(ev("Array.from(document.querySelectorAll('[data-kx].on')).length") == 3, "3種目が選ばれている")
    # 一回のタップで click が2回届いても、入れてすぐ外れない（2026-11-04 本人の指摘「一回のクリックで二回判定される」）
    p = ev("""(() => { const b = document.querySelector('[data-kx="curl"]'); b.scrollIntoView({block: "center"}); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()""")
    time.sleep(0.25)
    cdp.call("Input.dispatchTouchEvent", type="touchStart", touchPoints=[{"x": p[0], "y": p[1]}]); time.sleep(0.06)
    cdp.call("Input.dispatchTouchEvent", type="touchEnd", touchPoints=[])
    ev("""document.querySelector('[data-kx="curl"]').dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, detail: 1})); true""")
    time.sleep(0.5)
    ok(ev("""document.querySelector('[data-kx="curl"]').classList.contains("on")"""), "click が2回届いても選んだまま")
    tap('[data-kx="curl"]')
    ok(not ev("""document.querySelector('[data-kx="curl"]').classList.contains("on")"""), "もう一度押すと外れる")
    # 名前を打つ
    tap("#kitname"); ev("document.getElementById('kitname').select()")
    cdp.call("Input.insertText", text="上半身A")
    ev("document.getElementById('sheetInner').scrollTop = 0"); time.sleep(0.3); shot("kit_sheet.png")
    tap('[data-kitsave]')
    kits = json.loads(ev("JSON.stringify(kitList())"))
    ok(len(kits) == 1 and kits[0]["name"] == "上半身A" and [i["ex"] for i in kits[0]["items"]] == ["pushup", "row", "fly"],
       f"保存された: {[(k['name'], [i['ex'] for i in k['items']]) for k in kits]}")
    # 今日のメニューから作る
    tap('[data-act="kitfromtoday"]')
    today = json.loads(ev("JSON.stringify(todayItems().filter(i => !i.skip).map(i => i.ex))"))
    ok(ev("Array.from(document.querySelectorAll('[data-kx].on')).length") == min(15, len(today)), f"今のメニュー {len(today)} 種目が選ばれた状態で開く")
    tap('[data-kitsave]')
    ok(len(json.loads(ev("JSON.stringify(kitList())"))) == 2, "2つ目のセットを保存")
    # 1種目記録してからセットを使う（記録した種目は残る）
    first = today[0]
    ev(f"openEx = '{first}'; render(); true"); tap(f'.exrow[data-row="{first}"] [data-act=addset]')
    ev("window.scrollTo(0, 0)")
    tap(f'[data-act="kitapply"][data-k="{kits[0]["id"]}"]')
    plan = json.loads(ev("JSON.stringify(todayItems().filter(i => !i.skip).map(i => i.ex))"))
    want = ([first] if first not in ["pushup", "row", "fly"] else []) + ["pushup", "row", "fly"]
    ok(plan == want, f"セットを今日のメニューに: {plan}（期待 {want}）")
    ok(ev("(entryFor(TODAY, %s, false) || {sets: []}).sets.length" % json.dumps(first)) == 1, "記録したセットは消えない")
    ev("window.scrollTo(0, 0)"); time.sleep(0.3); shot("kit_applied_top.png")
    tap('[data-act="kitapply"]'); ev("document.querySelector('.kits').scrollIntoView({block: 'center'})"); time.sleep(0.3); shot("kit_card.png")
    # 開き直しても残る・設定の形を通しても残る
    load()
    ok(len(json.loads(ev("JSON.stringify(kitList())"))) == 2, "開き直してもセットが残る")
    rt = json.loads(ev("JSON.stringify(sanitizeState({sessions: {}, tune: JSON.parse(JSON.stringify(state.tune))}).tune.kits.list)"))
    ok(rt == json.loads(ev("JSON.stringify(kitList())")), "読み込みの検査（sanitizeState）を通しても同じ")
    bad = json.loads(ev("""JSON.stringify(sanitizeState({sessions: {}, tune: {kits: {list: [{id: 'a1', name: ' x ', items: [{ex: 'fly'}, {ex: 'fly'}, {ex: '<b>'}]}, {id: 'BAD!', name: 'y', items: []}, 5], updatedAt: 3}}}).tune.kits)"""))
    ok(bad == {"list": [{"id": "a1", "name": "x", "items": [{"ex": "fly", "label": ""}]}], "updatedAt": 3}, f"おかしな形は捨てる: {bad}")
    # 消す
    tap(f'[data-act="kitedit"][data-k="{kits[0]["id"]}"]')
    tap('[data-kitdel]'); ok(len(json.loads(ev("JSON.stringify(kitList())"))) == 2, "1回目の「消す」ではまだ消えない")
    tap('[data-kitdel]'); ok([k["id"] for k in json.loads(ev("JSON.stringify(kitList())"))] == [kits[1]["id"]] if len(kits) > 1 else True, "2回目で消える")
    left = json.loads(ev("JSON.stringify(kitList())"))
    ok(len(left) == 1 and left[0]["id"] != kits[0]["id"], f"残ったセット: {[k['name'] for k in left]}")
finally:
    proc.terminate(); time.sleep(1); kill_edge_using(prof); shutil.rmtree(prof, ignore_errors=True)
print(f"{passed} passed, {failed} failed")
