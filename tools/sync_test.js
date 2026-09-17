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
const SYNC_SRC = fs.readFileSync(path.join(ROOT, "src", "sync-github.js"), "utf8");

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
    }
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
  vm.runInContext(SYNC_SRC, ctx, { filename: "sync-github.js" });
  ctx.SYNC_TUNE.debounce = 50;

  return { ctx, viewEl, doc, renderCalls, statusLog, localStorage };
}

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
    ok(C.ctx.syncCard().indexOf("鍵が無効か期限切れです") !== -1, "誤った鍵: 401のメッセージを表示する");
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

    ok(log.length === 2, "最小トラフィック: リクエストはちょうど2件");
    ok(log.some(e => e.method === "GET" && e.path.endsWith("/contents/trainlog")), "最小トラフィック: 一覧のGETを含む");
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
