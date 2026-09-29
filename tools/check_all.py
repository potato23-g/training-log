"""tools/ の検査を一括で回す。

  python tools/check_all.py

まず `python tools/build.py local` でビルドし、そのあと
  1) bun で動く検査（動き・同期）
  2) ブラウザの中で動く検査（cdp_shot.py 経由）
  3) tools/v4_update_e2e.py（更新ボタンの通し検査）
を順に回して、検査ごとに1行で PASS/FAIL と件数を出す。最後に合計を出す。
各検査の「合格」の判定方法は、このファイル中のコメント（judge_* 関数）に書いてある。

ブラウザの検査は毎回別のプロファイル（絶対パス・一時ディレクトリ）と
ポート（9531〜9539を使い回す）を使い、終わったら消す。
"""
import atexit
import filecmp
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")
DIST = os.path.join(ROOT, "dist", "local", "training-log.html")
DOCS = os.path.join(ROOT, "docs")
DIST_URL = "file:///" + DIST.replace("\\", "/").replace(" ", "%20")
PY = sys.executable

PORTS = list(range(9531, 9540))
_port_i = [0]

# 起動した Edge/子プロセスが失敗・タイムアウト・Ctrl+C でも必ず終わるようにする。
# 一時ディレクトリ名すべてにこの実行固有の印を付け、最後に印つきの msedge.exe を掃除する
# （ほかの実行中の Edge には触れない）。
RUN_TAG = "chk%d" % os.getpid()


def _mkdtemp():
    return tempfile.mkdtemp(prefix=RUN_TAG + "_")


def _tree_kill(pid):
    """Windows: 子プロセス（Edge本体やレンダラー等）ごと確実に終了させる。"""
    try:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"],
                        capture_output=True, timeout=15)
    except Exception:
        pass


def run_watched(args, timeout, cwd=None):
    """subprocess.run 相当。タイムアウト時は子プロセスをツリーごと強制終了してから返す
    （タイムアウトで Popen を kill するだけだと、その子が起動した Edge が残ってしまうため）。"""
    p = subprocess.Popen(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, encoding="utf-8", errors="replace")
    try:
        out, err = p.communicate(timeout=timeout)
        return subprocess.CompletedProcess(args, p.returncode, out, err)
    except subprocess.TimeoutExpired:
        _tree_kill(p.pid)
        try:
            out, err = p.communicate(timeout=10)
        except Exception:
            out, err = "", ""
        return subprocess.CompletedProcess(args, -1, out or "", (err or "") + "\n(タイムアウトで強制終了)")
    except BaseException:
        # Ctrl+C 等。このプロセスとその子を道連れにしてから伝播させる
        _tree_kill(p.pid)
        raise


def _sweep_orphans():
    """最後の安全網: この実行が起動した msedge.exe が残っていれば掃除する。
    自分（check_all.py）のプロファイル（RUN_TAG入り）に加えて、v4_update_e2e.py が
    使う一時プロファイル（upd_e2e_ 始まり）も対象にする（あちらの中身は触れないため、
    後始末が漏れた場合はこちらで拾う）。ほかの検査・ほかの Edge には触れない。
    通常は各呼び出しの finally で片付くので、ここで見つかるのは異常終了時のみ。"""
    try:
        ps = ("Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | "
              "Where-Object { $_.CommandLine -like '*%s*' -or $_.CommandLine -like '*upd_e2e_*' } | "
              "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }") % RUN_TAG
        subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, timeout=30)
    except Exception:
        pass
    # 各検査の後の削除は、Edge の子プロセスがまだファイルを掴んでいると消し残る。
    # Edge を止めたあとで、この実行の一時フォルダ（RUN_TAG 入り）をまとめて消し直す
    tmp = tempfile.gettempdir()
    for _ in range(5):
        try:
            left = [os.path.join(tmp, d) for d in os.listdir(tmp) if d.startswith(RUN_TAG + "_")]
        except Exception:
            break
        if not left:
            break
        for d in left:
            shutil.rmtree(d, ignore_errors=True)
        time.sleep(1.0)


def _free_port(port):
    """指定ポートを LISTEN しているプロセスがあれば終了する（v4_update_e2e.py は
    8871/9479 を固定で使うため、あちらの後始末が漏れてもここで確実に空ける）。"""
    try:
        ps = ("Get-NetTCPConnection -LocalPort %d -State Listen -ErrorAction SilentlyContinue | "
              "Select-Object -ExpandProperty OwningProcess -Unique | "
              "ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }") % port
        subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, timeout=15)
    except Exception:
        pass


atexit.register(_sweep_orphans)


def next_port():
    p = PORTS[_port_i[0] % len(PORTS)]
    _port_i[0] += 1
    return p


results = []


def _snapshot_docs():
    """docs/ をそのまま一時ディレクトリへ控える。docs/ は GitHub Pages の公開用でコミットする
    ものなので、検査が書き換えたら、検査の前の中身（未コミットのビルドも含む）へ戻す必要がある"""
    snap = os.path.join(tempfile.mkdtemp(prefix=RUN_TAG + "_docs_"), "docs")
    shutil.copytree(DOCS, snap)
    return snap


def _restore_docs(snap):
    """控えた docs/ の状態へ戻す。変わったファイルだけ書き戻し、増えたファイルは消す"""
    for base, _dirs, files in os.walk(DOCS):
        rel = os.path.relpath(base, DOCS)
        for f in files:
            if not os.path.exists(os.path.join(snap, rel, f)):
                os.remove(os.path.join(base, f))
    for base, _dirs, files in os.walk(snap):
        rel = os.path.relpath(base, snap)
        os.makedirs(os.path.join(DOCS, rel), exist_ok=True)
        for f in files:
            src, dst = os.path.join(base, f), os.path.join(DOCS, rel, f)
            if not os.path.exists(dst) or not filecmp.cmp(src, dst, shallow=False):
                shutil.copy2(src, dst)
    shutil.rmtree(os.path.dirname(snap), ignore_errors=True)


def report(name, ok, detail):
    results.append((name, ok))
    print(("PASS - " if ok else "FAIL - ") + name + "  " + detail)


# ---------------------------------------------------------------- bun 検査

def run_bun(name, filename, judge, timeout=120):
    """cd tools && bun <filename> を実行し、judge(stdout, returncode) -> (ok, detail) で判定する。"""
    path = os.path.join(TOOLS, filename)
    if not os.path.exists(path):
        report(name, False, "ファイルが無い: " + filename)
        return
    try:
        p = run_watched(["bun", filename], timeout, cwd=TOOLS)
    except Exception as e:
        report(name, False, "実行できない: " + str(e))
        return
    try:
        ok, detail = judge(p.stdout, p.returncode)
    except Exception as e:
        ok, detail = False, "判定でエラー: " + str(e) + "\n" + p.stdout[-500:]
    if p.returncode not in (0, 1):
        ok = False
        detail += "（終了コード %d, stderr: %s）" % (p.returncode, p.stderr[-300:] if p.stderr else "")
    report(name, ok, detail)


def judge_diag(out, rc):
    """可動域超過なし・道具貫通0・床抜け0（sideplank_leg の14mmだけ既知として許容）。"""
    KNOWN_FLOOR = {"sideplank": 14, "sideplank_leg": 14}
    bad = []
    for m in re.finditer(r"== (\S+)\s+周期.*?\n(.*?)(?=\n== |\Z)", out, re.S):
        mid, body = m.group(1), m.group(2)
        rom_ok = "可動域超過: なし" in body
        fm = re.search(r"床抜け:\s*(\d+)mm", body)
        pm = re.search(r"道具貫通:\s*(\d+)mm", body)
        floor = int(fm.group(1)) if fm else 0
        prop = int(pm.group(1)) if pm else 0
        if not rom_ok or prop > 0 or floor > KNOWN_FLOOR.get(mid, 0):
            bad.append(mid)
    return (len(bad) == 0, "%d 件" % len(bad) + (": " + ", ".join(bad) if bad else ""))


def judge_db_clash(out, rc):
    """「ぶつかりなし/ダンベルなし」以外は、既知の小さな接触（脚をこする設計どおり）以外なら不合格。"""
    # 「止める」版（*_hold）は元の動きと同じ姿勢なので、同じ接触が出る
    KNOWN = {"rdl", "row2", "sidebend", "rdl_hold", "row2_hold", "sidebend_hold"}
    bad = []
    for line in out.splitlines():
        m = re.match(r"== (\S+) : (.+)", line.strip())
        if not m:
            continue
        mid, val = m.groups()
        if val in ("ぶつかりなし", "ダンベルなし"):
            continue
        if mid not in KNOWN:
            bad.append(mid)
    return (len(bad) == 0, "想定外の接触 %d 件" % len(bad) + (": " + ", ".join(bad) if bad else ""))


def judge_trailing_count(label):
    """末尾の「<label>: N 件」を見る。0件で合格。"""
    def f(out, rc):
        m = re.search(re.escape(label) + r":\s*(\d+)\s*件", out)
        if not m:
            return (False, "件数が読めない")
        n = int(m.group(1))
        return (n == 0, "%d 件" % n)
    return f


def judge_joint_audit(out, rc):
    """指摘が出てよいのは既知の12種目のみ。それ以外で指摘が出たら不合格。
    「止める」版（*_hold）は元の動きと同じ姿勢なので、元の動きと同じ関節・同じ角度で指摘が出る。"""
    KNOWN = {"row", "triext", "pushup", "split", "splitfloor", "pushupknee", "triext_one",
             "row_hold", "triext_hold", "split_hold", "splitfloor_hold", "pushupknee_hold"}
    flagged = set()
    cur = None
    for line in out.splitlines():
        if line.startswith("== "):
            rest = line[3:]
            cur = None if ": 問題なし" in rest else rest.strip()
        elif cur and line.strip():
            flagged.add(cur)
    bad = sorted(flagged - KNOWN)
    return (len(bad) == 0, "%d 件中、想定外 %d 件" % (len(flagged), len(bad)) + (": " + ", ".join(bad) if bad else ""))


def judge_variant_check(out, rc):
    return judge_trailing_count("名前どおりになっていない組み方")(out, rc)


def judge_sync_test(out, rc):
    m = re.search(r"(\d+) passed, (\d+) failed", out)
    detail = m.group(0) if m else ("終了コード %d" % rc)
    return (rc == 0, detail)


# ------------------------------------------------------------ ブラウザ検査

def _cdp_call(eval_path, profile, log_path, out_png, timeout=60):
    port = next_port()
    args = [PY, os.path.join(TOOLS, "cdp_shot.py"), DIST_URL, out_png,
            "--eval", eval_path, "--ready", "window.__ready", "--dump", "window.__result",
            "--log", log_path, "--port", str(port), "--profile", profile,
            "--timeout", str(timeout)]
    return run_watched(args, timeout + 30)


def _read_dump(log_path):
    try:
        with open(log_path, encoding="utf-8") as f:
            return json.load(f).get("dump")
    except Exception:
        return None


def run_browser(name, filename, judge, needs_common=False, timeout=60, required=True):
    """1回 cdp_shot.py を呼び、__result を judge(dump) -> (ok, detail) に渡す。"""
    path = os.path.join(TOOLS, filename)
    if not os.path.exists(path):
        if required:
            report(name, False, "ファイルが無い: " + filename)
        else:
            print("SKIP - " + name + "  まだ無い（別作業で作成中）")
        return
    work = _mkdtemp()
    try:
        eval_path = path
        if needs_common:
            eval_path = os.path.join(work, "combined.js")
            common = open(os.path.join(TOOLS, "v3_ui_common.js"), encoding="utf-8").read()
            body = open(path, encoding="utf-8").read()
            open(eval_path, "w", encoding="utf-8").write(common + "\n" + body)
        log_path = os.path.join(work, "log.json")
        out_png = os.path.join(work, "shot.png")
        profile = os.path.join(work, "profile")
        try:
            p = _cdp_call(eval_path, profile, log_path, out_png, timeout)
        except Exception as e:
            report(name, False, "cdp_shot を実行できない: " + str(e))
            return
        if p.returncode != 0:
            tail = (p.stderr or p.stdout or "").strip().splitlines()
            report(name, False, "cdp_shot が失敗（画面が壊れた可能性）: " + (tail[-1] if tail else "詳細なし"))
            return
        dump = _read_dump(log_path)
        try:
            ok, detail = judge(dump)
        except Exception as e:
            ok, detail = False, "判定でエラー: " + str(e)
        report(name, ok, detail)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def run_browser_2phase(name, filename, phases=("write", "read"), timeout=60):
    """window.__phase を切り替えながら、同じプロファイルで複数回呼ぶ（例: 保存の永続確認）。"""
    path = os.path.join(TOOLS, filename)
    if not os.path.exists(path):
        report(name, False, "ファイルが無い: " + filename)
        return
    work = _mkdtemp()
    profile = os.path.join(work, "profile")
    try:
        body = open(path, encoding="utf-8").read()
        for i, phase in enumerate(phases):
            eval_path = os.path.join(work, "phase%d.js" % i)
            open(eval_path, "w", encoding="utf-8").write('window.__phase = %s;\n' % json.dumps(phase) + body)
            log_path = os.path.join(work, "log%d.json" % i)
            out_png = os.path.join(work, "shot%d.png" % i)
            try:
                p = _cdp_call(eval_path, profile, log_path, out_png, timeout)
            except Exception as e:
                report(name, False, "%s 段階を実行できない: %s" % (phase, e))
                return
            if p.returncode != 0:
                tail = (p.stderr or p.stdout or "").strip().splitlines()
                report(name, False, "%s 段階で失敗: %s" % (phase, tail[-1] if tail else "詳細なし"))
                return
        report(name, True, "/".join(phases) + " の全段階が完了")
    finally:
        shutil.rmtree(work, ignore_errors=True)


def judge_fail_array(dump):
    """{fail:[], pass:N} 形式。fail が空で合格。"""
    if dump is None:
        return (False, "__result が取れない")
    fail = dump.get("fail", [])
    ok = len(fail) == 0
    detail = "%s 件成功" % dump.get("pass", "?")
    if fail:
        detail += "、失敗 %d 件: %s" % (len(fail), "; ".join(fail[:3]))
    return (ok, detail)


def judge_empty_arrays(*keys):
    """指定した __result のキーが、全て空配列であれば合格。"""
    def f(dump):
        if dump is None:
            return (False, "__result が取れない")
        bad = {k: dump.get(k) for k in keys if dump.get(k)}
        n = sum(len(v) for v in bad.values())
        return (n == 0, "%d 件" % n + (": " + ", ".join(bad.keys()) if bad else ""))
    return f


def judge_all_true(*keys):
    def f(dump):
        if dump is None:
            return (False, "__result が取れない")
        bad = [k for k in keys if not dump.get(k)]
        return (len(bad) == 0, "%d 件不成立" % len(bad) + (": " + ", ".join(bad) if bad else ""))
    return f


def judge_swap_add(dump):
    if dump is None:
        return (False, "__result が取れない")
    aft = dump.get("afterSwap") or {}
    auto = dump.get("auto") or {}
    rep = dump.get("repeated") or {}
    checks = {
        "afterSwap.swappedIn": aft.get("swappedIn"),
        "afterSwap.oldGone": aft.get("oldGone"),
        "afterSwap.samePattern": aft.get("samePattern"),
        "noSwapAfterRecord": dump.get("noSwapAfterRecord"),
        "auto.dupPattern(false)": not auto.get("dupPattern"),
        "repeated.dupPattern(false)": not rep.get("dupPattern"),
        "pickerHasShrug": dump.get("pickerHasShrug"),
    }
    bad = [k for k, v in checks.items() if not v]
    return (len(bad) == 0, "%d 件不成立" % len(bad) + (": " + ", ".join(bad) if bad else ""))


def judge_timer(dump):
    """v3_timer_eval.js: 休憩タイマーと合図の予約。各場面の ok・止めたら合図が消えること・合図の WAV の形を見る。"""
    if dump is None:
        return (False, "__result が取れない")
    g = lambda k: dump.get(k) or {}
    checks = {
        "webaudio": g("webaudio").get("ok"),
        "plus30": g("plus30").get("ok"),
        "caughtUp": g("caughtUp").get("ok"),
        "stopped": g("stopped").get("nodes") == 0 and not g("stopped").get("visible"),
        "overlap": g("overlap").get("running") and g("overlap").get("visible"),
        "wav": g("wav").get("riff") == "RIFF" and g("wav").get("bytes") == g("wav").get("expect") and (g("wav").get("peakAfter") or 0) > 0,
    }
    bad = [k for k, v in checks.items() if not v]
    return (len(bad) == 0, "%d 件不成立" % len(bad) + (": " + ", ".join(bad) if bad else ""))


def judge_smoke(dump):
    """assert 用の値を持たない（目視用の）検査: cdp_shot が最後まで走って __ready になれば合格。"""
    return (True, "実行完了（表示のみ、要目視）")


def judge_views(dump):
    """v4_views_eval.js: {failCount, failed, fatal} の形。途中で止まらず failCount が0で合格。"""
    if dump is None:
        return (False, "__result が取れない")
    if dump.get("fatal"):
        return (False, "途中で止まった: " + str(dump.get("fatal"))[:200])
    n = dump.get("failCount")
    if not isinstance(n, int):
        return (False, "failCount が読めない")
    failed = dump.get("failed") or []
    return (n == 0, "失敗 %d 件" % n + (": " + ", ".join(failed[:3]) if failed else ""))


# --------------------------------------------------------------- 実行本体

def main():
    print("== ビルド ==")
    try:
        subprocess.run([PY, os.path.join(TOOLS, "build.py"), "local"], cwd=TOOLS, check=True,
                        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    except subprocess.CalledProcessError as e:
        print("build.py local に失敗:", e.stderr or e.stdout)
        sys.exit(2)
    if not os.path.exists(DIST):
        print("ビルド結果が無い:", DIST)
        sys.exit(2)

    print("\n== bun 検査（動き・同期） ==")
    run_bun("diag.js", "diag.js", judge_diag)
    run_bun("db_clash.js", "db_clash.js", judge_db_clash)
    run_bun("grip_check.js", "grip_check.js", judge_trailing_count("手の向きが合わない箇所"))
    run_bun("joint_audit.js", "joint_audit.js", judge_joint_audit)
    run_bun("form_check.js", "form_check.js", judge_trailing_count("合わない項目"))
    run_bun("phase_check.js", "phase_check.js", judge_trailing_count("合っていない場面"))
    run_bun("anim_check.js", "anim_check.js", judge_trailing_count("ラベルと動きが食い違う場面"))
    run_bun("variant_check.js", "variant_check.js", judge_variant_check)
    run_bun("sync_test.js", "sync_test.js", judge_sync_test, timeout=180)
    run_bun("export_test.js", "export_test.js", judge_sync_test)          # CSV・テキストの書き出し

    print("\n== ブラウザ内検査 ==")
    run_browser("v4_progress_eval.js", "v4_progress_eval.js", judge_fail_array, timeout=90)
    run_browser("v3_extra_item_eval.js", "v3_extra_item_eval.js", judge_empty_arrays("mismatch"))
    run_browser("v3_fig_eval.js", "v3_fig_eval.js", judge_empty_arrays("mismatch"), needs_common=True)
    run_browser("v3_logic_eval.js", "v3_logic_eval.js",
                judge_empty_arrays("dupPatterns", "recoverOnPlan", "recoverViolations", "dayCapViolations",
                                    "sessionCapViolations", "weekCapViolations", "unowned", "optionErrors", "sweep"),
                timeout=90)
    run_browser("v3_newex_eval.js", "v3_newex_eval.js",
                judge_empty_arrays("missing", "noFigure", "noDetail", "noHold", "noHouse", "noMotion",
                                    "noPattern", "notInCatalog", "badLevel", "exWithoutLevel"),
                needs_common=True)
    run_browser("v3_partial_eval.js", "v3_partial_eval.js",
                judge_empty_arrays("repeatedNextDay", "dupPatterns", "recoverOnPlan", "emptyDays"), timeout=90)
    run_browser("v3_stable_eval.js", "v3_stable_eval.js",
                judge_all_true("settledSteady", "hitAboveMiss", "hitNeverBelowMiss", "sameTwice", "allThreeSets"),
                timeout=90)
    run_browser("v3_swap_add_eval.js", "v3_swap_add_eval.js", judge_swap_add, needs_common=True)
    run_browser("v3_ui_fix_eval.js", "v3_ui_fix_eval.js", judge_smoke, needs_common=True)
    run_browser("v3_variant_eval.js", "v3_variant_eval.js", judge_smoke, needs_common=True)
    run_browser("v3_volume_eval.js", "v3_volume_eval.js", judge_smoke, timeout=90)
    # 部位の回復（中1日で同じ部位を主役にしない）と1回の上限。部位ごとの週のセットは __result.weekly に出る
    run_browser("v5_balance_eval.js", "v5_balance_eval.js",
                judge_empty_arrays("recoverViolations", "capViolations"), timeout=240)
    run_browser("v3_dayroll_eval.js", "v3_dayroll_eval.js", judge_smoke)
    run_browser("v3_update_eval.js", "v3_update_eval.js", judge_smoke, needs_common=True)
    run_browser_2phase("v3_persist_eval.js", "v3_persist_eval.js")

    run_browser("v3_timer_eval.js", "v3_timer_eval.js", judge_timer, needs_common=True)
    run_browser("v4_views_eval.js", "v4_views_eval.js", judge_views, timeout=90)
    # data.js / variants.js の中身どうしの食い違い（bun で動く。最後の「合わない項目: N 件」で判定）
    run_bun("content_check.js", "content_check.js", judge_trailing_count("合わない項目"))

    print("\n== 通しの検査（別プロセス） ==")
    # v4_update_e2e.py は内部で `build.py site` を呼び、docs/ を書き換える。前後で控えて書き戻す
    docs_snap = _snapshot_docs()
    try:
        p = run_watched([PY, os.path.join(TOOLS, "v4_update_e2e.py")], 240, cwd=TOOLS)
        m = re.search(r"(\d+) passed, (\d+) failed", p.stdout)
        if m:
            # 結果の文言が読めれば、それを終了コードより優先する（片付け処理が長引いて
            # タイムアウト強制終了になっても、テスト自体は先に完了していることがあるため）
            ok, detail = (m.group(2) == "0"), m.group(0)
        else:
            ok, detail = False, "終了コード %d\n%s" % (p.returncode, (p.stdout[-800:] + p.stderr[-800:]))
        report("v4_update_e2e.py", ok, detail)
    except Exception as e:
        report("v4_update_e2e.py", False, "実行できない: " + str(e))
    finally:
        # v4_update_e2e.py は 8871(HTTP)/9479(CDP) を固定で使う。あちら自身の後始末が
        # 漏れて Edge やサーバーが残っていることがあるので、念のためここで空ける
        _free_port(8871)
        _free_port(9479)
        try:
            _restore_docs(docs_snap)
        except Exception as e:
            print("docs/ を検査の前の状態に戻せませんでした（控え: %s）: %s" % (docs_snap, e))

    print("\n== 合計 ==")
    n_pass = sum(1 for _, ok in results if ok)
    n_total = len(results)
    print("%d / %d 合格" % (n_pass, n_total))
    if n_pass < n_total:
        print("不合格:", ", ".join(name for name, ok in results if not ok))
    sys.exit(0 if n_pass == n_total else 1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n中断された。起動した Edge を片付けています…")
        sys.exit(130)
    # 起動した Edge の最終掃除は atexit の _sweep_orphans() が正常終了・例外・Ctrl+C いずれでも行う
