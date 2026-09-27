#!/usr/bin/env bun
/* sync-github.js のテスト。 `bun tools/sync_test.js` で実行する。
   src/ids.js + src/sync-github.js を node:vm の別コンテキストに読み込み、
   端末ごとに独立した state / localStorage / fetch を持たせて2台をシミュレートする。
   結合テストは python 製のモック（tools/mock_github.py）を子プロセスで立てて相手にする。
   リモートは trainlog/YYYY-MM.json + trainlog/settings.json の複数ファイル構成。 */

import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = path.resolve(import.meta.dir, "..");
const IDS_SRC = fs.readFileSync(path.join(ROOT, "src", "ids.js"), "utf8");
const SANITIZE_SRC = fs.readFileSync(path.join(ROOT, "src", "app", "sanitize.js"), "utf8");
const SYNC_SRC = fs.readFileSync(path.join(ROOT, "src", "sync-github.js"), "utf8");
const STORE_SRC = fs.readFileSync(path.join(ROOT, "src", "store-local.js"), "utf8");
const CORE_SRC = fs.readFileSync(path.join(ROOT, "src", "app", "core.js"), "utf8");

/* ---------- 結果の記録 ---------- */
let passed = 0, failed = 0;
function ok(cond, msg){
  if(cond){ passed++; console.log("PASS - " + msg); }
  else{ failed++; console.log("FAIL - " + msg); }
}

/* ---------- 端末（vmコンテキスト）を1台作る ---------- */
function makeEmitter(){
  const listeners = {};
  return {
    addEventListener(type, fn){ (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn){
      if(listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn);
    },
    /* テスト用: そのイベントを受け取った体にする */
    emit(type, ev){ (listeners[type] || []).slice().forEach(fn => fn(ev)); }
  };
}
function makeLocalStorage(){
  const map = new Map();
  return {
    getItem(k){ return map.has(k) ? map.get(k) : null; },
    setItem(k, v){ map.set(k, String(v)); },
    removeItem(k){ map.delete(k); }
  };
}
function makeDevice(apiBase){
  const viewEl = Object.assign({ tagName: "DIV", id: "view", contains(){ return false; } }, makeEmitter());
  const doc = Object.assign({
    activeElement: null,
    hidden: false,
    getElementById(id){ return id === "view" ? viewEl : null; }
  }, makeEmitter());
  const win = makeEmitter();
  const localStorage = makeLocalStorage();
  localStorage.setItem("trainlog.sync.api", apiBase);

  const renderCalls = { n: 0 };
  const statusLog = [];

  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder,
    btoa: (s) => btoa(s),
    atob: (s) => atob(s),
    crypto,
    fetch(){ return fetch.apply(null, arguments); },
    localStorage,
    document: doc,
    window: win,
    confirm(){ return true; },
    state: { sessions: {}, program: [], gear: undefined },
    render(){ renderCalls.n++; },
    setStatus(t){ statusLog.push(t); }
  };
  sandbox.saveLocal = function(){
    try{ localStorage.setItem("trainlog.v1", JSON.stringify(sandbox.state)); }catch(e){}
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(IDS_SRC, ctx, { filename: "ids.js" });
  vm.runInContext(SANITIZE_SRC, ctx, { filename: "sanitize.js" });
  vm.runInContext(SYNC_SRC, ctx, { filename: "sync-github.js" });
  ctx.SYNC_TUNE.debounce = 50;

  return { ctx, viewEl, doc, renderCalls, statusLog, localStorage };
}

/* ---------- 同じ端末の「タブ」を1つ作る ----------
   makeDevice と違い、保存層（src/store-local.js）の本物を読み込む。
   localStorage を渡せば、同じ端末の別のタブ（保存領域を共有する）になる */
function makeTab(apiBase, sharedLS){
  const viewEl = Object.assign({ tagName: "DIV", id: "view", contains(){ return false; } }, makeEmitter());
  const doc = Object.assign({
    activeElement: null,
    hidden: false,
    getElementById(id){ return id === "view" ? viewEl : null; }
  }, makeEmitter());
  const win = makeEmitter();
  const localStorage = sharedLS || makeLocalStorage();
  localStorage.setItem("trainlog.sync.api", apiBase);
  const renderCalls = { n: 0 };
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder,
    btoa: (s) => btoa(s),
    atob: (s) => atob(s),
    crypto,
    fetch(){ return fetch.apply(null, arguments); },
    localStorage,
    document: doc,
    window: win,
    confirm(){ return true; },
    alert(){},
    render(){ renderCalls.n++; },
    /* 画面側にあるもの（保存層が使う分だけ） */
    DEFAULT_PROGRAM: ["goblet"],
    TODAY: "2026-05-20",
    ACTIONS: {},
    readGear(g){ return g && typeof g === "object" ? g : undefined; },
    fmtDate(k){ return k; }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(IDS_SRC, ctx, { filename: "ids.js" });
  vm.runInContext(SANITIZE_SRC, ctx, { filename: "sanitize.js" });
  vm.runInContext(STORE_SRC, ctx, { filename: "store-local.js" });
  vm.runInContext(SYNC_SRC, ctx, { filename: "sync-github.js" });
  ctx.SYNC_TUNE.debounce = 50;
  return { ctx, win, localStorage, renderCalls, st: () => vm.runInContext("state", ctx) };
}
const setIds = (s, day) => s.sessions[day].entries[0].sets.map(x => x.id).sort().join(",");

/* ---------- モックサーバーのライフサイクル ---------- */
const mockProcs = [];
function startMock(port, token){
  const proc = spawn("python", [path.join(ROOT, "tools", "mock_github.py"), String(port), token], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let out = "", err = "";
  proc.stdout.on("data", d => { out += d.toString(); });
  proc.stderr.on("data", d => { err += d.toString(); });
  mockProcs.push(proc);
  return { proc, base: "http://127.0.0.1:" + port, getErr: () => err, getOut: () => out };
}
async function waitReady(base){
  for(let i = 0; i < 100; i++){
    try{
      const res = await fetch(base + "/_mock/list");
      if(res.status === 200) return;
    }catch(e){}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("mock server did not become ready: " + base);
}
function stopAllMocks(){
  mockProcs.forEach(p => { try{ p.kill(); }catch(e){} });
}

/* ---------- モック制御の小道具 ---------- */
async function mockList(base){
  const res = await fetch(base + "/_mock/list");
  const j = await res.json();
  return j.paths;
}
async function mockFile(base, filePath){
  const res = await fetch(base + "/_mock/file?path=" + encodeURIComponent(filePath));
  if(res.status === 404) return null;
  return JSON.parse(await res.text());
}
async function mockLog(base){
  const res = await fetch(base + "/_mock/log");
  return res.json();
}
async function mockLogReset(base){
  await fetch(base + "/_mock/log/reset", { method: "POST" });
}
async function putLegacyFile(base, repo, token, payloadObj){
  const contentB64 = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64");
  const res = await fetch(base + "/repos/" + repo + "/contents/trainlog.json", {
    method: "PUT",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "seed legacy", content: contentB64 })
  });
  if(!res.ok) throw new Error("failed to seed legacy file: " + res.status);
}

/* ============================================================
   1. 単体テスト: mergeState / stableKey（リモート形式には依存しない）
   ============================================================ */
function runUnitTests(){
  console.log("\n-- unit: mergeState / stableKey --");
  const d = makeDevice("http://127.0.0.1:1"); // API は叩かないのでダミー
  const M = d.ctx;

  ok(M.stableKey({ b: 2, a: 1 }) === M.stableKey({ a: 1, b: 2 }), "stableKey: オブジェクトのキー順は結果に影響しない");

  {
    const a = { sessions: { "2026-01-01": { date: "2026-01-01", entries: [{ ex: "squat", sets: [{ id: "s1", at: 1, w: 10, r: 10, rpe: 8 }] }] } } };
    const b = { sessions: { "2026-01-01": { date: "2026-01-01", entries: [{ ex: "squat", sets: [{ id: "s2", at: 2, w: 10, r: 8, rpe: 9 }] }] } } };
    const sets = M.mergeState(a, b).sessions["2026-01-01"].entries[0].sets;
    ok(sets.length === 2 && sets.map(s => s.id).sort().join(",") === "s1,s2", "merge: 両側のセットを id で和集合する");
    ok(sets[0].at <= sets[1].at, "merge: セットは at 昇順で並ぶ");
  }

  {
    const withDel = { sessions: { "2026-01-02": { date: "2026-01-02", entries: [{ ex: "bench", sets: [{ id: "x1", at: 1, w: 20, r: 8, rpe: 8 }] }], del: ["x1"] } } };
    const withoutDel = { sessions: { "2026-01-02": { date: "2026-01-02", entries: [{ ex: "bench", sets: [{ id: "x1", at: 1, w: 20, r: 8, rpe: 8 }] }] } } };
    ok(M.mergeState(withDel, withoutDel).sessions["2026-01-02"].entries[0].sets.length === 0, "merge: 削除したセットは相手側から復活しない(local側が削除)");
    ok(M.mergeState(withoutDel, withDel).sessions["2026-01-02"].entries[0].sets.length === 0, "merge: 削除したセットは相手側から復活しない(remote側が削除)");
  }

  {
    const a = { sessions: { "2026-01-03": { date: "2026-01-03", entries: [], note: "A", noteAt: 100 } } };
    const b = { sessions: { "2026-01-03": { date: "2026-01-03", entries: [], note: "B", noteAt: 200 } } };
    const m = M.mergeState(a, b).sessions["2026-01-03"];
    ok(m.note === "B" && m.noteAt === 200, "merge: note は noteAt が大きい方");
    const bTie = { sessions: { "2026-01-03": { date: "2026-01-03", entries: [], note: "B", noteAt: 100 } } };
    ok(M.mergeState(a, bTie).sessions["2026-01-03"].note === "A", "merge: noteAt 同点なら local(a)");
  }

  {
    const a = { sessions: { "2026-01-04": { date: "2026-01-04", entries: [], plan: [{ ex: "a" }], planAt: 500 } } };
    const b = { sessions: { "2026-01-04": { date: "2026-01-04", entries: [], plan: [{ ex: "b" }], planAt: 200 } } };
    const m = M.mergeState(a, b).sessions["2026-01-04"];
    ok(m.plan[0].ex === "b" && m.planAt === 200, "merge: plan は planAt が小さい方（先着）");
    const onlyA = { sessions: { "2026-01-04b": { date: "2026-01-04b", entries: [], plan: [{ ex: "solo" }], planAt: 9 } } };
    const none = { sessions: { "2026-01-04b": { date: "2026-01-04b", entries: [] } } };
    ok(M.mergeState(onlyA, none).sessions["2026-01-04b"].plan[0].ex === "solo", "merge: plan は片側にしか無ければそれを採用");
  }

  {
    const a = { sessions: {}, gear: { items: [{ kg: 5, n: 2 }], updatedAt: 10 } };
    const b = { sessions: {}, gear: { items: [{ kg: 10, n: 2 }], updatedAt: 20 } };
    const m = M.mergeState(a, b);
    ok(m.gear.updatedAt === 20 && m.gear.items[0].kg === 10, "merge: gear は updatedAt が大きい方");
  }

  {
    const legacy = () => ({ w: 10, r: 10, rpe: 8 });
    const a = { sessions: { "2026-01-05": { date: "2026-01-05", entries: [{ ex: "row", sets: [legacy()] }] } } };
    const b = { sessions: { "2026-01-05": { date: "2026-01-05", entries: [{ ex: "row", sets: [legacy()] }] } } };
    ok(M.mergeState(a, b).sessions["2026-01-05"].entries[0].sets.length === 1, "merge: 同一内容の旧形式セットは両端末で同じidになり重複しない");
  }

  {
    const a = { sessions: { "2026-01-06": { date: "2026-01-06", entries: [] } } };
    const b = { sessions: { "2026-01-06": { date: "2026-01-06", entries: [{ ex: "curl", sets: [] }] } } };
    ok(M.mergeState(a, b).sessions["2026-01-06"].entries.length === 0, "merge: remote側だけにある空エントリは落ちる");
    const a2 = { sessions: { "2026-01-06b": { date: "2026-01-06b", entries: [{ ex: "curl", sets: [] }] } } };
    const b2 = { sessions: { "2026-01-06b": { date: "2026-01-06b", entries: [] } } };
    ok(M.mergeState(a2, b2).sessions["2026-01-06b"].entries.length === 1, "merge: local側にある空エントリは残る");
  }

  {
    const html = M.syncCard();
    ok(html.indexOf('id="syncRepo"') !== -1 && html.indexOf('data-sync="connect"') !== -1, "syncCard: 未設定時はリポジトリ欄・鍵欄・接続ボタンを含む");
    ok(html.indexOf("trainlog フォルダ") !== -1, "syncCard: 保存先の説明がフォルダ表記になっている");
    let threw = false;
    try{ M.syncWire({ querySelector(){ return null; } }); }catch(e){ threw = true; }
    ok(!threw, "syncWire: カードが root に無くても例外を投げない");
  }
}

/* ============================================================
   2. 結合テスト: A/B 2端末 + モック（月ファイル + settings.json）
   ============================================================ */
async function runMainIntegration(port){
  console.log("\n-- integration: two devices against the mock (per-month layout) --");
  const token = "tok-main";
  const mock = startMock(port, token);
  await waitReady(mock.base);

  try{
    const A = makeDevice(mock.base);
    const B = makeDevice(mock.base);
    /* わざと「実行時の実際の日付」から見て180日を超える日にする。この下ですぐ del を試すが、
       B が消す際に updatedAt も更新するので（C14: 日付が古くても最近さわった日の del は
       間引かない）、削除は巻き戻らずにAへ届くはず。ここが古い日のままでも壊れないことが、
       C14の間引きが「日付だけ」で見ていないことの確認を兼ねる */
    const day = "2026-02-01", month = "2026-02";

    A.ctx.state.sessions[day] = {
      date: day, entries: [{ ex: "squat", sets: [{ id: "a1", at: 1, w: 10, r: 10, rpe: 8 }] }], updatedAt: Date.now()
    };
    const connectedA = await A.ctx.syncConnect("acme/repo", token);
    ok(connectedA === true, "A: 接続に成功する");
    ok(A.ctx.syncCard().indexOf("接続中: acme/repo") !== -1, "A: 接続後のカードは「接続中」表示になる");

    let paths = await mockList(mock.base);
    ok(paths.indexOf("trainlog/" + month + ".json") !== -1, "A接続後: 月ファイルが作られる");
    ok(paths.indexOf("trainlog/settings.json") === -1, "A接続後: gear未設定なのでsettings.jsonは作られない");
    let monthFile = await mockFile(mock.base, "trainlog/" + month + ".json");
    ok(!!monthFile && monthFile.app === "trainlog" && monthFile.format === 2 && monthFile.month === month, "A接続後: 月ファイルの形式(app/format/month)が正しい");
    ok(!!monthFile.sessions[day], "A接続後: 中身はAの記録を含む");

    const connectedB = await B.ctx.syncConnect("acme/repo", token);
    ok(connectedB === true, "B: 接続に成功する");
    ok(!!B.ctx.state.sessions[day], "B: 接続後にAの記録を受け取る");
    ok(B.ctx.state.sessions[day].entries[0].sets[0].id === "a1", "B: 受け取ったセットのidが一致する");

    // B: 1セット削除、1セット追加、メモ編集 → 同期
    const sB = B.ctx.state.sessions[day];
    const removed = sB.entries[0].sets.shift();
    sB.del = (sB.del || []).concat(removed.id);
    sB.entries[0].sets.push({ id: "b-new-1", at: Date.now(), w: 12, r: 9, rpe: 9 });
    sB.note = "Bからのメモ";
    sB.noteAt = Date.now();
    sB.updatedAt = Date.now();
    await B.ctx.syncNow();

    await A.ctx.syncNow();
    const sA = A.ctx.state.sessions[day];
    const idsA = sA.entries[0].sets.map(s => s.id);
    ok(idsA.indexOf("a1") === -1, "A: Bが削除したセットが消えている");
    ok(idsA.indexOf("b-new-1") !== -1, "A: Bが追加したセットが届いている");
    ok(sA.note === "Bからのメモ", "A: Bが編集したメモが届いている");

    // 同じ月に、両端末が同期せずに別々のセットを追加 → 両方同期 → 最終同期で両方に揃う
    A.ctx.state.sessions["2026-02-05"] = { date: "2026-02-05", entries: [{ ex: "bench", sets: [{ id: "concurrentA", at: 1, w: 15, r: 8, rpe: 8 }] }], updatedAt: Date.now() };
    B.ctx.state.sessions["2026-02-05"] = { date: "2026-02-05", entries: [{ ex: "bench", sets: [{ id: "concurrentB", at: 1, w: 16, r: 7, rpe: 8 }] }], updatedAt: Date.now() };
    await A.ctx.syncNow();
    await B.ctx.syncNow();
    await A.ctx.syncNow(); // 最終同期
    const idsDay2A = A.ctx.state.sessions["2026-02-05"].entries[0].sets.map(s => s.id).sort();
    const idsDay2B = B.ctx.state.sessions["2026-02-05"].entries[0].sets.map(s => s.id).sort();
    ok(idsDay2A.join(",") === "concurrentA,concurrentB", "同時追加(同一月): 最終同期後、Aは両方のセットを持つ");
    ok(idsDay2B.join(",") === "concurrentA,concurrentB", "同時追加(同一月): Bは両方のセットを持つ");

    // gear の変更が settings.json 経由で B → A に届く
    B.ctx.state.gear = { items: [{ kg: 8, n: 2 }], updatedAt: Date.now() };
    await B.ctx.syncNow();
    paths = await mockList(mock.base);
    ok(paths.indexOf("trainlog/settings.json") !== -1, "gear: 変更されるとsettings.jsonが作られる");
    const settingsFile = await mockFile(mock.base, "trainlog/settings.json");
    ok(!!settingsFile && settingsFile.format === 2 && settingsFile.gear && settingsFile.gear.items[0].kg === 8, "gear: settings.jsonの中身が正しい");
    await A.ctx.syncNow();
    ok(!!A.ctx.state.gear && A.ctx.state.gear.items[0].kg === 8, "gear: settings.json経由でBの変更がAに届く");

    // 409を1回だけ強制 → 自動リトライで成功する
    await fetch(mock.base + "/_mock/conflict", { method: "POST" });
    A.ctx.state.sessions["2026-02-06"] = { date: "2026-02-06", entries: [{ ex: "curl", sets: [{ id: "retry1", at: 1, w: 6, r: 12, rpe: 7 }] }], updatedAt: Date.now() };
    await A.ctx.syncNow();
    ok(A.ctx.syncCard().indexOf("GitHubと同期しました") !== -1, "409を1回強制: 自動リトライの末に成功する");
    monthFile = await mockFile(mock.base, "trainlog/" + month + ".json");
    ok(!!monthFile.sessions["2026-02-06"], "409を1回強制: リトライ後の内容がリモートに反映されている");

    // 誤った鍵 → 401
    const C = makeDevice(mock.base);
    const connectedC = await C.ctx.syncConnect("acme/repo", "wrong-token");
    ok(connectedC === false, "誤った鍵: connect() は false を返す");
    ok(C.ctx.syncCard().indexOf("鍵が無効か、期限が切れています") !== -1, "誤った鍵: 401のメッセージを表示する");
    ok(C.ctx.localStorage.getItem("trainlog.sync.v1") === null, "誤った鍵: 設定は保存されない");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   3(a). 記録1件ぶんの同期は「一覧GET + 当月PUT」だけ
   ============================================================ */
async function testMinimalTraffic(port){
  console.log("\n-- (a): a single record only touches the listing + the current month --");
  const token = "tok-min";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const D = makeDevice(mock.base);
    const today = "2026-09-15", curMonth = "2026-09";
    D.ctx.state.sessions[today] = { date: today, entries: [{ ex: "squat", sets: [{ id: "m1", at: 1, w: 10, r: 10, rpe: 8 }] }], updatedAt: Date.now() };
    D.ctx.state.sessions["2026-07-01"] = { date: "2026-07-01", entries: [{ ex: "row", sets: [{ id: "m2", at: 1, w: 8, r: 10, rpe: 7 }] }], updatedAt: Date.now() };
    D.ctx.state.sessions["2026-08-01"] = { date: "2026-08-01", entries: [{ ex: "bench", sets: [{ id: "m3", at: 1, w: 15, r: 8, rpe: 8 }] }], updatedAt: Date.now() };
    await D.ctx.syncConnect("acme/min", token); // ベースライン同期（3か月ぶんPUT。gear未設定なのでsettingsは無し）

    await mockLogReset(mock.base);
    const s = D.ctx.state.sessions[today];
    s.entries[0].sets.push({ id: "m4", at: Date.now(), w: 10, r: 9, rpe: 9 });
    s.updatedAt = Date.now();
    await D.ctx.syncNow();

    const log = await mockLog(mock.base);
    const totalBytes = log.reduce((a, e) => a + e.reqBytes + e.resBytes, 0);
    console.log("  requests=" + log.length + " bytes=" + totalBytes + " :: " + log.map(e => e.method + " " + e.path + " (" + e.status + ")").join(", "));

    /* 送る前に当月のファイルを読み直して合流させる（端末の記録が消えていてもリモートを空にしないため）ので3件 */
    ok(log.length === 3, "最小トラフィック: リクエストは3件（一覧・当月の読み直し・当月の書き込み）");
    ok(log.some(e => e.method === "GET" && e.path.endsWith("/contents/trainlog")), "最小トラフィック: 一覧のGETを含む");
    ok(log.some(e => e.method === "GET" && e.path.endsWith("/contents/trainlog/" + curMonth + ".json")), "最小トラフィック: 当月ファイルを読み直す");
    ok(log.some(e => e.method === "PUT" && e.path.endsWith("/contents/trainlog/" + curMonth + ".json")), "最小トラフィック: 当月ファイルへのPUTを含む");
    ok(!log.some(e => e.path.indexOf("settings.json") !== -1), "最小トラフィック: settings.json には触れない");
    ok(!log.some(e => e.path.indexOf("/contents/trainlog/2026-07") !== -1 || e.path.indexOf("/contents/trainlog/2026-08") !== -1), "最小トラフィック: 他の月ファイルには触れない");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   3(b). 過去月の変更は、その月だけを取りに行く
   ============================================================ */
async function testPastMonthOnly(port){
  console.log("\n-- (b): a change to a past month only pulls that month --");
  const token = "tok-past";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const A = makeDevice(mock.base), B = makeDevice(mock.base);
    const cur = "2026-09-10", past = "2026-06-05", pastMonth = "2026-06", curMonth = "2026-09";
    A.ctx.state.sessions[cur] = { date: cur, entries: [{ ex: "squat", sets: [{ id: "cA1", at: 1, w: 10, r: 10, rpe: 8 }] }], updatedAt: Date.now() };
    A.ctx.state.sessions[past] = { date: past, entries: [{ ex: "row", sets: [{ id: "pA1", at: 1, w: 8, r: 10, rpe: 7 }] }], updatedAt: Date.now() };
    await A.ctx.syncConnect("acme/past", token);
    await B.ctx.syncConnect("acme/past", token); // Bはベースラインを受け取る

    const sb = B.ctx.state.sessions[past];
    sb.entries[0].sets.push({ id: "pB1", at: Date.now(), w: 9, r: 9, rpe: 9 });
    sb.updatedAt = Date.now();
    await B.ctx.syncNow();

    await mockLogReset(mock.base);
    await A.ctx.syncNow();
    const log = await mockLog(mock.base);
    console.log("  requests=" + log.length + " :: " + log.map(e => e.method + " " + e.path).join(", "));

    ok(log.some(e => e.method === "GET" && e.path.endsWith("/contents/trainlog/" + pastMonth + ".json")), "過去月のみ: 過去月ファイルを取得している");
    ok(!log.some(e => e.path.indexOf(curMonth + ".json") !== -1), "過去月のみ: 当月ファイルには触れない");
    ok(!log.some(e => e.path.indexOf("settings.json") !== -1), "過去月のみ: settingsには触れない");
    ok(A.ctx.state.sessions[past].entries[0].sets.some(s => s.id === "pB1"), "過去月のみ: Bの変更をAが受け取る");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   3(c). 移行: 旧単一ファイル → 月ファイル + settings.json
   ============================================================ */
async function testMigration(port){
  console.log("\n-- (c): migration from the legacy single file --");
  const token = "tok-mig";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const legacyPayload = {
      app: "trainlog", format: 1, savedAt: new Date().toISOString(),
      sessions: { "2026-05-01": { date: "2026-05-01", entries: [{ ex: "squat", sets: [{ id: "leg1", at: 1, w: 20, r: 5, rpe: 9 }] }], updatedAt: Date.now() } },
      gear: { items: [{ kg: 7, n: 2 }], updatedAt: Date.now() }
    };
    await putLegacyFile(mock.base, "acme/mig", token, legacyPayload);

    const A = makeDevice(mock.base);
    const connected = await A.ctx.syncConnect("acme/mig", token); // 空の状態で接続
    ok(connected === true, "移行: 接続に成功する");
    ok(!!A.ctx.state.sessions["2026-05-01"], "移行: 旧ファイルの記録を取り込む");
    ok(!!A.ctx.state.gear && A.ctx.state.gear.items[0].kg === 7, "移行: 旧ファイルのgearも取り込む");

    const paths = await mockList(mock.base);
    ok(paths.indexOf("trainlog/2026-05.json") !== -1, "移行: 月ファイルが作られる");
    ok(paths.indexOf("trainlog/settings.json") !== -1, "移行: settings.jsonが作られる");
    ok(paths.indexOf("trainlog.json") !== -1, "移行: 旧ファイルはそのまま残る");
    const oldStill = await mockFile(mock.base, "trainlog.json");
    ok(!!oldStill && !!oldStill.sessions["2026-05-01"], "移行: 旧ファイルの中身は変わっていない");

    // 2台目が後から接続しても、旧ファイルは読み直さない（ディレクトリに既にファイルがあるため）
    const B = makeDevice(mock.base);
    await B.ctx.syncConnect("acme/mig", token);
    await mockLogReset(mock.base);
    B.ctx.state.sessions["2026-05-02"] = { date: "2026-05-02", entries: [{ ex: "bench", sets: [{ id: "b1", at: 1, w: 20, r: 8, rpe: 8 }] }], updatedAt: Date.now() };
    await B.ctx.syncNow();
    const log = await mockLog(mock.base);
    ok(!log.some(e => e.path.endsWith("/contents/trainlog.json")), "移行: 2台目は旧ファイルを読み直さない");
    ok(B.ctx.state.sessions["2026-05-01"].entries[0].sets.some(s => s.id === "leg1"), "移行: 2台目もディレクトリ経由で旧記録を受け取っている");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   3(f). 同期の読み込み中に記録しても、そのセットが消えない
   ============================================================ */
async function testRecordDuringPull(port){
  console.log("\n-- (f): a set recorded while a month file is being read survives --");
  const token = "tok-race";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const A = makeDevice(mock.base), B = makeDevice(mock.base);
    const day = "2026-09-12", day2 = "2026-09-13";
    A.ctx.state.sessions[day] = { date: day, entries: [{ ex: "row", sets: [{ id: "a1", at: 1, w: 5, r: 10, rpe: 7 }] }], updatedAt: Date.now() };
    await A.ctx.syncConnect("acme/race", token);
    await B.ctx.syncConnect("acme/race", token);
    B.ctx.state.sessions[day].entries[0].sets.push({ id: "b1", at: 2, w: 5, r: 10, rpe: 8 });
    B.ctx.state.sessions[day].updatedAt = Date.now();
    await B.ctx.syncNow();

    const realFetch = A.ctx.fetch;
    A.ctx.fetch = async function(url, opts){
      const isMonthGet = String(url).endsWith("/contents/trainlog/2026-09.json")
        && (!opts || !opts.method || String(opts.method).toUpperCase() === "GET");
      const res = await realFetch(url, opts);
      if(isMonthGet){
        A.ctx.fetch = realFetch; // 1回きり
        // 読み込みの応答を待っているあいだに、Aで同じ月の別の日（新しい日付）にセットを記録する
        A.ctx.state.sessions[day2] = { date: day2, entries: [{ ex: "curl", sets: [{ id: "a2", at: 3, w: 5, r: 10, rpe: 9 }] }], updatedAt: Date.now() };
        // 既存の日のセットも1つ足す
        A.ctx.state.sessions[day].entries[0].sets.push({ id: "a3", at: 4, w: 5, r: 10, rpe: 9 });
      }
      return res;
    };
    await A.ctx.syncNow();
    const ids = A.ctx.state.sessions[day].entries[0].sets.map(s => s.id).sort().join(",");
    ok(ids === "a1,a3,b1", "読み込み中の記録: 既存の日のセットが残る (" + ids + ")");
    ok(!!A.ctx.state.sessions[day2] && A.ctx.state.sessions[day2].entries[0].sets[0].id === "a2", "読み込み中の記録: 新しい日のセットが残る");
    await A.ctx.syncNow();
    const remote = await mockFile(mock.base, "trainlog/2026-09.json");
    const rids = remote.sessions[day].entries[0].sets.map(s => s.id).sort().join(",");
    ok(rids === "a1,a3,b1" && !!remote.sessions[day2], "読み込み中の記録: 次の同期でリモートにも届く (" + rids + ")");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   4. 公開リポジトリは拒否し、何も書き込まない
   ============================================================ */
async function runPublicRepoTest(port){
  console.log("\n-- integration: public repo is refused --");
  const token = "tok-pub";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    await fetch(mock.base + "/_mock/public", { method: "POST" }); // private: true → false

    const D = makeDevice(mock.base);
    D.ctx.state.sessions["2026-03-01"] = { date: "2026-03-01", entries: [{ ex: "row", sets: [{ id: "p1", at: 1, w: 5, r: 10, rpe: 7 }] }], updatedAt: Date.now() };
    const connected = await D.ctx.syncConnect("acme/public-repo", token);
    ok(connected === false, "公開リポジトリ: 接続が拒否される");
    ok(D.ctx.syncCard().indexOf("公開リポジトリ") !== -1, "公開リポジトリ: 専用のメッセージを表示する");
    ok(D.ctx.localStorage.getItem("trainlog.sync.v1") === null, "公開リポジトリ: 設定は保存されない");

    const paths = await mockList(mock.base);
    ok(paths.length === 0, "公開リポジトリ: 何も書き込まれない");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   5. 実際の422（月ファイルの新規作成が競合する）からの回復
   ============================================================ */
async function run422RecoveryTest(port){
  console.log("\n-- integration: real 422 (concurrent create) recovers --");
  const token = "tok-422";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const B2 = makeDevice(mock.base);
    await B2.ctx.syncConnect("acme/repo422", token); // 空のまま接続。まだディレクトリは無い

    const A2 = makeDevice(mock.base);
    await A2.ctx.syncConnect("acme/repo422", token); // こちらも空のまま接続

    const month = "2026-04";
    const realFetch = A2.ctx.fetch;
    A2.ctx.fetch = async function(url, opts){
      const isListing = String(url).indexOf("/contents/trainlog") !== -1 && String(url).indexOf("/contents/trainlog/") === -1
        && (!opts || !opts.method || String(opts.method).toUpperCase() === "GET");
      const res = await realFetch(url, opts);
      if(isListing){
        A2.ctx.fetch = realFetch; // 1回きり
        // Aの一覧取得が終わった直後、Bが先に同じ月のファイルを作る
        B2.ctx.state.sessions["2026-04-09"] = { date: "2026-04-09", entries: [{ ex: "row", sets: [{ id: "b1", at: 1, w: 5, r: 10, rpe: 7 }] }], updatedAt: Date.now() };
        await B2.ctx.syncNow();
      }
      return res;
    };

    A2.ctx.state.sessions["2026-04-10"] = { date: "2026-04-10", entries: [{ ex: "squat", sets: [{ id: "a1", at: 1, w: 20, r: 5, rpe: 9 }] }], updatedAt: Date.now() };
    await A2.ctx.syncNow(); // 月ファイルの新規作成が sha無し×既存で422 → 自動で再取得・再pushして回復するはず

    ok(A2.ctx.syncCard().indexOf("GitHubと同期しました") !== -1, "実際の422: 自動リトライの末に成功する");
    const monthFile = await mockFile(mock.base, "trainlog/" + month + ".json");
    ok(!!monthFile && !!monthFile.sessions["2026-04-09"] && !!monthFile.sessions["2026-04-10"], "実際の422: 双方の記録がマージされてリモートに残る");
    ok(!!A2.ctx.state.sessions["2026-04-09"] && !!A2.ctx.state.sessions["2026-04-10"], "実際の422: A自身も両方の記録を持つ");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   6. 端末の保存データが壊れた・空になったとき、GitHub側を空で上書きしない
   ============================================================ */
async function testBrokenLocalKeepsRemote(port){
  console.log("\n-- integration: broken local data never wipes the remote --");
  const token = "tok-broken";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const T = makeTab(mock.base);
    const day = "2026-05-02", month = "2026-05";
    T.st().sessions[day] = { date: day, entries: [{ ex: "goblet", sets: [{ id: "c1", at: 1, w: 10, r: 12, rpe: 8 }] }], updatedAt: Date.now() };
    T.st().gear = { items: [{ kg: 5, n: 2 }], updatedAt: 5 };
    T.ctx.saveLocal();
    ok(await T.ctx.syncConnect("acme/repo", token) === true, "壊れた保存: 最初の接続と同期に成功する");
    let f = await mockFile(mock.base, "trainlog/" + month + ".json");
    ok(!!f && !!f.sessions[day], "壊れた保存: リモートに記録がある");

    /* 保存データが壊れたままアプリを開き直す（同期の印は別のキーに残っている） */
    T.localStorage.setItem("trainlog.v1", "{壊れた");
    const T2 = makeTab(mock.base, T.localStorage);
    T2.ctx.loadLocal();
    ok(vm.runInContext("STORE_PROBLEM && STORE_PROBLEM.kind", T2.ctx) === "corrupt", "壊れた保存: 読めなかったことを覚えている");
    ok(T.localStorage.getItem("trainlog.v1.corrupt") === "{壊れた", "壊れた保存: 元の文字列は消さずに別のキーへ残す");
    await T2.ctx.syncNow();
    f = await mockFile(mock.base, "trainlog/" + month + ".json");
    ok(!!f && !!f.sessions[day] && f.sessions[day].entries[0].sets.length === 1, "壊れた保存: リモートの記録は消えない");
    ok(!!T2.st().sessions[day], "壊れた保存: 端末の記録がリモートから戻る");
    const g = await mockFile(mock.base, "trainlog/settings.json");
    ok(!!g && !!g.gear && g.gear.items.length === 1, "壊れた保存: ダンベルの登録もリモートから消えない");

    /* 端末の記録が丸ごと空になっても同じ */
    T2.st().sessions = {};
    await T2.ctx.syncNow();
    f = await mockFile(mock.base, "trainlog/" + month + ".json");
    ok(!!f && !!f.sessions[day], "空になった端末: リモートの記録は消えない");
    ok(!!T2.st().sessions[day], "空になった端末: 端末に記録が戻る");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   7. 同じ端末の2つのタブで記録しても、どちらの記録も消えない
   ============================================================ */
async function testTwoTabs(port){
  console.log("\n-- integration: two tabs on one device --");
  const token = "tok-tabs";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const ls = makeLocalStorage();
    const T1 = makeTab(mock.base, ls), T2 = makeTab(mock.base, ls);
    const day = "2026-05-03", month = "2026-05";
    T1.st().sessions[day] = { date: day, entries: [{ ex: "goblet", sets: [{ id: "o1", at: 1, w: 10, r: 12, rpe: 8 }] }], updatedAt: 1 };
    T1.ctx.saveLocal();
    T2.ctx.loadLocal();                                     /* 2つめのタブも同じ中身から始まる */
    ok(await T1.ctx.syncConnect("acme/repo", token) === true, "2タブ: 接続に成功する");

    /* タブ1で記録して同期 → タブ2は知らないまま別の記録をして同期 */
    T1.st().sessions[day].entries[0].sets.push({ id: "t1", at: 2, w: 10, r: 12, rpe: 8 });
    T1.ctx.persistSession(day);
    await T1.ctx.syncNow();
    T2.st().sessions[day].entries[0].sets.push({ id: "t2", at: 3, w: 10, r: 11, rpe: 9 });
    T2.ctx.persistSession(day);
    await T2.ctx.syncNow();

    ok(setIds(JSON.parse(ls.getItem("trainlog.v1")), day) === "o1,t1,t2", "2タブ: 端末の保存に両方のタブの記録が残る");
    const f = await mockFile(mock.base, "trainlog/" + month + ".json");
    ok(!!f && setIds(f, day) === "o1,t1,t2", "2タブ: GitHub にも両方のタブの記録が残る");

    /* 別のタブの保存を受け取ったタブは、その記録を取り込む */
    T1.win.emit("storage", { key: "trainlog.v1", newValue: ls.getItem("trainlog.v1") });
    ok(setIds(T1.st(), day) === "o1,t1,t2", "2タブ: 別のタブが保存したら、その記録も入る");
    ok(T1.renderCalls.n > 0, "2タブ: 取り込んだら描き直す");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   8. 消したセットは、読み直してから送るようになっても消えたまま伝わる
   ============================================================ */
async function testDeletePropagates(port){
  console.log("\n-- integration: deletions still propagate --");
  const token = "tok-del";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const A = makeTab(mock.base), B = makeTab(mock.base);
    const day = "2026-05-05", month = "2026-05";
    A.st().sessions[day] = { date: day, entries: [{ ex: "row", sets: [
      { id: "d1", at: 1, w: 5, r: 12, rpe: 8 }, { id: "d2", at: 2, w: 5, r: 12, rpe: 8 }] }], updatedAt: 1 };
    A.ctx.saveLocal();
    await A.ctx.syncConnect("acme/repo", token);
    await B.ctx.syncConnect("acme/repo", token);
    ok(setIds(B.st(), day) === "d1,d2", "削除: Bが両方のセットを受け取る");

    const sA = A.st().sessions[day];
    const gone = sA.entries[0].sets.shift();
    sA.del = (sA.del || []).concat(gone.id);
    A.ctx.persistSession(day);
    await A.ctx.syncNow();
    const f = await mockFile(mock.base, "trainlog/" + month + ".json");
    ok(!!f && setIds(f, day) === "d2", "削除: リモートでも消えている");
    await B.ctx.syncNow();
    ok(setIds(B.st(), day) === "d2", "削除: 相手の端末でも消える");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   9. 接続したあとでリポジトリが公開になったら、起動時に同期を止める
   ============================================================ */
async function testPublicAfterConnect(port){
  console.log("\n-- integration: repo turned public after connecting --");
  const token = "tok-pub2";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const A = makeTab(mock.base);
    A.st().sessions["2026-05-06"] = { date: "2026-05-06", entries: [{ ex: "goblet", sets: [{ id: "p1", at: 1, w: 10, r: 12, rpe: 8 }] }], updatedAt: 1 };
    A.ctx.saveLocal();
    ok(await A.ctx.syncConnect("acme/repo", token) === true, "公開化: 非公開のうちは接続できる");
    await fetch(mock.base + "/_mock/public", { method: "POST" });            /* 公開にする */
    await mockLogReset(mock.base);

    /* アプリを開き直す（同じ端末）。新しい記録もある */
    const A2 = makeTab(mock.base, A.localStorage);
    A2.ctx.loadLocal();
    A2.st().sessions["2026-05-07"] = { date: "2026-05-07", entries: [{ ex: "row", sets: [{ id: "p2", at: 1, w: 5, r: 12, rpe: 8 }] }], updatedAt: 2 };
    A2.ctx.saveLocal();
    await A2.ctx.syncInit();
    await A2.ctx.syncNow();                                                    /* 記録したとき */
    let log = await mockLog(mock.base);
    ok(!log.some(e => e.method === "PUT"), "公開化: 起動時に公開と分かったら、記録しても何も送らない");
    ok(A2.ctx.syncCard().indexOf("公開") !== -1, "公開化: 同期を止めたことを知らせる");

    await fetch(mock.base + "/_mock/public", { method: "POST" });            /* 非公開に戻す */
    await A2.ctx.syncManualNow();
    log = await mockLog(mock.base);
    ok(log.some(e => e.method === "PUT"), "公開化: 非公開に戻して「今すぐ同期」を押すと同期する");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   10. 外から入るデータの確かめ・軽い週の印
   ============================================================ */
function runSanitizeTests(){
  console.log("\n-- unit: sanitizeState / deload --");
  const D = makeDevice("http://127.0.0.1:9");
  const s = D.ctx.sanitizeState({
    sessions: {
      "2026-06-01": { entries: [
        { ex: "goblet", sets: [{ id: "x1", at: "5", w: "10", r: "12", rpe: "8", label: "ゴブレットスクワット（一番下で3秒止める）", target: "12" },
                               { id: "x2", r: "たくさん" }] },
        { ex: "<img src=x onerror=alert(1)>", sets: [{ id: "x3", r: 5 }] }
      ], note: "<script>alert(1)</script>", plan: [{ ex: "goblet", sets: 3 }, { ex: "bad id!" }] },
      "2026-06-02": { entries: [], note: 123 },
      "not-a-date": { entries: [] }
    },
    program: ["goblet", "<b>"]
  });
  const d1 = s.sessions["2026-06-01"];
  ok(d1.entries.length === 1 && d1.entries[0].sets.length === 1, "sanitize: 形の合わない種目id・数にならないセットは捨てる");
  const st = d1.entries[0].sets[0];
  ok(st.w === 10 && st.r === 12 && st.rpe === 8 && st.at === 5 && st.target === 12, "sanitize: 数字の文字列は数にする");
  ok(st.label === "ゴブレットスクワット（一番下で3秒止める）", "sanitize: 組み方の名前は残す");
  ok(d1.note === "<script>alert(1)</script>", "sanitize: メモは文字列のまま残す（エスケープは描くとき）");
  ok(d1.plan.length === 1, "sanitize: メニューの形の合わない項目は捨てる");
  ok(s.sessions["2026-06-02"].note === undefined && !("plan" in s.sessions["2026-06-02"]), "sanitize: 文字列でないメモは捨て、元に無いメニューは作らない");
  ok(!s.sessions["not-a-date"], "sanitize: 日付でないキーは捨てる");
  ok(s.program.length === 1 && s.program[0] === "goblet", "sanitize: program も種目idだけ残す");
  ok(D.ctx.esc("<a href=\"x\">'&") === "&lt;a href=&quot;x&quot;&gt;&#39;&amp;", "esc: & < > \" ' をエスケープする");

  const m = D.ctx.mergeState({ sessions: { "2026-06-03": { date: "2026-06-03", entries: [], deload: true } } },
                             { sessions: { "2026-06-03": { date: "2026-06-03", entries: [] } } });
  ok(m.sessions["2026-06-03"].deload === true, "merge: 軽い週の印（deload）は片方にあれば残す");
}

/* ============================================================
   11. 403: 回数制限（rate limit）と権限エラーを見分ける（C8）
   ============================================================ */
async function testRateLimitVsForbidden(port){
  console.log("\n-- (11) C8: 403の回数制限と権限エラーを見分ける --");
  const token = "tok-403";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const D = makeDevice(mock.base);

    await fetch(mock.base + "/_mock/403?kind=ratelimit", { method: "POST" });
    let threw = null;
    try{ await D.ctx.syncCheckRepo("acme/repo", token); }catch(e){ threw = e; }
    ok(!!threw && threw.syncKind === "ratelimit", "403(回数制限): syncKind が ratelimit になる");
    ok(!!threw && threw.message.indexOf("回数制限") !== -1, "403(回数制限): 「しばらく待つと再開」の文言になる");
    ok(!!threw && threw.message.indexOf("書き込み権限") === -1, "403(回数制限): 鍵の作り直しを促す文言は出さない");

    await fetch(mock.base + "/_mock/403?kind=perm", { method: "POST" });
    let threw2 = null;
    try{ await D.ctx.syncCheckRepo("acme/repo", token); }catch(e){ threw2 = e; }
    ok(!!threw2 && threw2.syncKind === "forbidden", "403(権限): syncKind は今までどおり forbidden");
    ok(!!threw2 && threw2.message.indexOf("書き込み権限") !== -1, "403(権限): 権限エラーの文言のまま");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   12. commit の時刻からの時計のずれ推定（C9・sync-github.js側）
   ============================================================ */
async function testClockSkew(port){
  console.log("\n-- (12) C9: commit.committer.date から端末の時計のずれを見積もる --");
  const token = "tok-skew";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const D = makeDevice(mock.base);
    await fetch(mock.base + "/_mock/clockoffset?ms=" + (6 * 3600000), { method: "POST" }); // サーバーを6時間進める
    D.ctx.state.sessions["2026-09-01"] = { date: "2026-09-01", entries: [{ ex: "squat", sets: [{ id: "k1", at: 1, w: 10, r: 10, rpe: 8 }] }], updatedAt: Date.now() };
    await D.ctx.syncConnect("acme/skew", token);
    const skew = +(D.ctx.localStorage.getItem("trainlog.sync.clockSkew") || 0);
    ok(Math.abs(skew - 6 * 3600000) < 10000, "時計のずれ: サーバーが6時間進んでいれば、ずれもおよそ+6時間になる (" + skew + ")");

    // 極端な値（1日を超える）は捨てて、前のまともな値を保つ
    await fetch(mock.base + "/_mock/clockoffset?ms=" + (3 * 86400000), { method: "POST" });
    D.ctx.state.sessions["2026-09-02"] = { date: "2026-09-02", entries: [{ ex: "squat", sets: [{ id: "k2", at: 1, w: 10, r: 10, rpe: 8 }] }], updatedAt: Date.now() };
    await D.ctx.syncNow();
    const skew2 = +(D.ctx.localStorage.getItem("trainlog.sync.clockSkew") || 0);
    ok(Math.abs(skew2 - 6 * 3600000) < 10000, "時計のずれ: 極端な値(3日)は測り損ないとして捨て、前の値を保つ (" + skew2 + ")");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   13. stampNow（core.js側）: Date.now() に見積もったずれを足す
   ============================================================ */
function testStampNow(){
  console.log("\n-- (13) C9: stampNow() は保存されたずれを Date.now() に足す --");
  const ls = makeLocalStorage();
  const ctx = vm.createContext({ console, localStorage: ls });
  vm.runInContext(CORE_SRC, ctx, { filename: "core.js" });

  const before = Date.now();
  const noSkew = vm.runInContext("stampNow()", ctx);
  ok(Math.abs(noSkew - before) < 2000, "stampNow: ずれの記録が無ければ Date.now() とほぼ同じ");

  ls.setItem("trainlog.sync.clockSkew", "3600000"); // +1時間
  const withSkew = vm.runInContext("stampNow()", ctx);
  const diff = withSkew - before;
  ok(diff > 3500000 && diff < 3700000, "stampNow: ずれの記録があれば Date.now() に足して返す (" + diff + ")");
}

/* ============================================================
   14. 消した印（del）は古い日だけ間引く（C14）
   ============================================================ */
function testDelPruning(){
  console.log("\n-- (14) C14: 古い日の del は統合のときに間引かれる --");
  const D = makeDevice("http://127.0.0.1:1");
  const M = D.ctx;
  const oldDate = "2020-01-01"; // 180日をはるかに超えている
  const recentDate = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10); // 10日前

  const aOld = { sessions: {} };
  aOld.sessions[oldDate] = { date: oldDate, entries: [], del: ["old1", "old2"] };
  const bOld = { sessions: {} };
  bOld.sessions[oldDate] = { date: oldDate, entries: [] };
  const mOld = M.mergeState(aOld, bOld);
  ok(!mOld.sessions[oldDate].del, "del間引き: 180日より前の日の del は統合すると消える");

  const aNew = { sessions: {} };
  aNew.sessions[recentDate] = { date: recentDate, entries: [], del: ["new1"] };
  const bNew = { sessions: {} };
  bNew.sessions[recentDate] = { date: recentDate, entries: [] };
  const mNew = M.mergeState(aNew, bNew);
  ok(!!mNew.sessions[recentDate].del && mNew.sessions[recentDate].del.indexOf("new1") !== -1, "del間引き: 新しい日の del はそのまま残る");

  // 日付そのものは古くても、最後にその日を触った(updatedAt)のが最近なら del は残す。
  // そうしないと「半年より前の日を今消す」操作が、まだそれを見ていない別の端末で
  // 復活してしまう（間引かれたdelのせいで消した印が無かったことになるため）
  const aOldRecentTouch = { sessions: {} };
  aOldRecentTouch.sessions[oldDate] = { date: oldDate, entries: [], del: ["old3"], updatedAt: Date.now() };
  const bOldRecentTouch = { sessions: {} };
  bOldRecentTouch.sessions[oldDate] = { date: oldDate, entries: [] };
  const mOldRecentTouch = M.mergeState(aOldRecentTouch, bOldRecentTouch);
  ok(!!mOldRecentTouch.sessions[oldDate].del && mOldRecentTouch.sessions[oldDate].del.indexOf("old3") !== -1,
    "del間引き: 日付が古くても、最後に触ったのが最近なら del は残る（復活を防ぐ）");
}

/* ============================================================
   15. entries の並び順だけの食い違いでは「変わった」と判定しない（C16）
   ============================================================ */
function testEntriesOrderStable(){
  console.log("\n-- (15) C16: 並び順だけの食い違いは内容の変化として扱わない --");
  const D = makeDevice("http://127.0.0.1:1");
  const M = D.ctx;
  const day = "2026-08-01";
  const a = { sessions: {} };
  a.sessions[day] = { date: day, entries: [
    { ex: "squat", sets: [{ id: "sq1", at: 100, w: 10, r: 10, rpe: 8 }] },
    { ex: "bench", sets: [{ id: "bn1", at: 200, w: 20, r: 8, rpe: 8 }] }
  ] };
  const b = { sessions: {} };
  b.sessions[day] = { date: day, entries: [
    { ex: "bench", sets: [{ id: "bn1", at: 200, w: 20, r: 8, rpe: 8 }] },
    { ex: "squat", sets: [{ id: "sq1", at: 100, w: 10, r: 10, rpe: 8 }] }
  ] };
  const mAB = M.mergeState(a, b);
  const mBA = M.mergeState(b, a);
  ok(M.stableKey(mAB) === M.stableKey(mBA), "並び順: a,bどちらの向きで統合しても同じ内容key(stableKey)になる");
  ok(mAB.sessions[day].entries.map(e => e.ex).join(",") === "squat,bench",
    "並び順: 統合結果はその種目の最初のセットの時刻順になる(sq1のat=100が先)");

  const mAgain = M.mergeState({ sessions: mAB.sessions }, { sessions: mBA.sessions });
  ok(M.stableKey(mAgain) === M.stableKey(mAB), "並び順: 同じ内容を繰り返し統合しても key が変わらない(送り合いが止まる)");
}

/* ============================================================
   16. 並び順のみの食い違いでは、記録していなくても送り合わない（C16・結合）
   ============================================================ */
async function testNoResendOnOrderOnly(port){
  console.log("\n-- (16) C16結合: 並び順だけ食い違う2台が同期しても、送り合いが続かない --");
  const token = "tok-order";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const A = makeDevice(mock.base), B = makeDevice(mock.base);
    const day = "2026-08-10";
    /* 中身（種目・セットの id）は同じだが、entries の並び順が端末ごとに逆になっている状態を
       それぞれのローカルに独立に作ってから接続する（片方が空のまま相手の並びをそのまま
       受け取るだけだと、並び順は最初から食い違わないので、この不具合を確かめられない） */
    A.ctx.state.sessions[day] = { date: day, entries: [
      { ex: "squat", sets: [{ id: "o1", at: 1, w: 10, r: 10, rpe: 8 }] },
      { ex: "curl", sets: [{ id: "o2", at: 2, w: 5, r: 12, rpe: 8 }] }
    ], updatedAt: Date.now() };
    B.ctx.state.sessions[day] = { date: day, entries: [
      { ex: "curl", sets: [{ id: "o2", at: 2, w: 5, r: 12, rpe: 8 }] },
      { ex: "squat", sets: [{ id: "o1", at: 1, w: 10, r: 10, rpe: 8 }] }
    ], updatedAt: Date.now() };
    await A.ctx.syncConnect("acme/order", token); // Aが先に接続・push
    await B.ctx.syncConnect("acme/order", token); // Bは自分のローカル(逆順)を持ったまま接続・合流

    await mockLogReset(mock.base);
    await B.ctx.syncNow();
    await A.ctx.syncNow();
    await B.ctx.syncNow();
    await A.ctx.syncNow();
    const log = await mockLog(mock.base);
    const puts = log.filter(e => e.method === "PUT");
    ok(puts.length === 0, "並び順のみ: 並びが逆の状態から4回同期しても、PUTは一度も起きない (" + puts.length + "件)");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   実行
   ============================================================ */
async function main(){
  try{
    runUnitTests();
    await runMainIntegration(8799);
    await testMinimalTraffic(8802);
    await testPastMonthOnly(8803);
    await testMigration(8804);
    await testRecordDuringPull(8805);
    await runPublicRepoTest(8810);
    await run422RecoveryTest(8811);
    runSanitizeTests();
    await testBrokenLocalKeepsRemote(8820);
    await testTwoTabs(8821);
    await testDeletePropagates(8822);
    await testPublicAfterConnect(8823);
    await testRateLimitVsForbidden(8830);
    await testClockSkew(8831);
    testStampNow();
    testDelPruning();
    testEntriesOrderStable();
    await testNoResendOnOrderOnly(8832);
  }catch(e){
    failed++;
    console.log("FAIL - 予期しない例外で停止: " + (e && e.stack || e));
  }finally{
    stopAllMocks();
  }

  console.log("\n==============================");
  console.log(passed + " passed, " + failed + " failed");
  console.log("==============================");
  process.exit(failed ? 1 : 0);
}

main();
