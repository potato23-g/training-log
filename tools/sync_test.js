#!/usr/bin/env bun
/* sync-github.js のテスト。 `bun tools/sync_test.js` で実行する。
   src/ids.js + src/sync-github.js を node:vm の別コンテキストに読み込み、
   端末ごとに独立した state / localStorage / fetch を持たせて2台をシミュレートする。
   結合テストは python 製のモック（tools/mock_github.py）を子プロセスで立てて相手にする。 */

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
  ctx.SYNC_TUNE.interval = 999999999;
  ctx.SYNC_TUNE.visThrottle = 0;

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
      const res = await fetch(base + "/_mock/file");
      if(res.status === 200 || res.status === 404) return;
    }catch(e){}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("mock server did not become ready: " + base);
}
function stopAllMocks(){
  mockProcs.forEach(p => { try{ p.kill(); }catch(e){} });
}

/* ============================================================
   1. 単体テスト: mergeState / stableKey
   ============================================================ */
function runUnitTests(){
  console.log("\n-- unit: mergeState / stableKey --");
  const d = makeDevice("http://127.0.0.1:1"); // API は叩かないのでダミー
  const M = d.ctx;

  // stableKey: キーの並びが違っても同じ
  ok(M.stableKey({ b: 2, a: 1 }) === M.stableKey({ a: 1, b: 2 }), "stableKey: オブジェクトのキー順は結果に影響しない");

  // セットの和集合
  {
    const a = { sessions: { "2026-01-01": { date: "2026-01-01", entries: [{ ex: "squat", sets: [{ id: "s1", at: 1, w: 10, r: 10, rpe: 8 }] }] } } };
    const b = { sessions: { "2026-01-01": { date: "2026-01-01", entries: [{ ex: "squat", sets: [{ id: "s2", at: 2, w: 10, r: 8, rpe: 9 }] }] } } };
    const sets = M.mergeState(a, b).sessions["2026-01-01"].entries[0].sets;
    ok(sets.length === 2 && sets.map(s => s.id).sort().join(",") === "s1,s2", "merge: 両側のセットを id で和集合する");
    ok(sets[0].at <= sets[1].at, "merge: セットは at 昇順で並ぶ");
  }

  // 削除の墓標（どちらの向きでマージしても消えたままになる）
  {
    const withDel = { sessions: { "2026-01-02": { date: "2026-01-02", entries: [{ ex: "bench", sets: [{ id: "x1", at: 1, w: 20, r: 8, rpe: 8 }] }], del: ["x1"] } } };
    const withoutDel = { sessions: { "2026-01-02": { date: "2026-01-02", entries: [{ ex: "bench", sets: [{ id: "x1", at: 1, w: 20, r: 8, rpe: 8 }] }] } } };
    // エントリ自体は a 側に存在する限り残る（空セットのエントリごと消えるのは remote 側だけにある場合）。
    // 消えるべきなのはセットそのもの。
    ok(M.mergeState(withDel, withoutDel).sessions["2026-01-02"].entries[0].sets.length === 0, "merge: 削除したセットは相手側から復活しない(local側が削除)");
    ok(M.mergeState(withoutDel, withDel).sessions["2026-01-02"].entries[0].sets.length === 0, "merge: 削除したセットは相手側から復活しない(remote側が削除)");
  }

  // note: noteAt が大きい方が勝つ／同点は a
  {
    const a = { sessions: { "2026-01-03": { date: "2026-01-03", entries: [], note: "A", noteAt: 100 } } };
    const b = { sessions: { "2026-01-03": { date: "2026-01-03", entries: [], note: "B", noteAt: 200 } } };
    const m = M.mergeState(a, b).sessions["2026-01-03"];
    ok(m.note === "B" && m.noteAt === 200, "merge: note は noteAt が大きい方");
    const bTie = { sessions: { "2026-01-03": { date: "2026-01-03", entries: [], note: "B", noteAt: 100 } } };
    ok(M.mergeState(a, bTie).sessions["2026-01-03"].note === "A", "merge: noteAt 同点なら local(a)");
  }

  // plan: planAt が小さい方（先に決めた方）が勝つ。片側だけならそれを採用
  {
    const a = { sessions: { "2026-01-04": { date: "2026-01-04", entries: [], plan: [{ ex: "a" }], planAt: 500 } } };
    const b = { sessions: { "2026-01-04": { date: "2026-01-04", entries: [], plan: [{ ex: "b" }], planAt: 200 } } };
    const m = M.mergeState(a, b).sessions["2026-01-04"];
    ok(m.plan[0].ex === "b" && m.planAt === 200, "merge: plan は planAt が小さい方（先着）");
    const onlyA = { sessions: { "2026-01-04b": { date: "2026-01-04b", entries: [], plan: [{ ex: "solo" }], planAt: 9 } } };
    const none = { sessions: { "2026-01-04b": { date: "2026-01-04b", entries: [] } } };
    ok(M.mergeState(onlyA, none).sessions["2026-01-04b"].plan[0].ex === "solo", "merge: plan は片側にしか無ければそれを採用");
  }

  // gear: updatedAt が大きい方
  {
    const a = { sessions: {}, gear: { items: [{ kg: 5, n: 2 }], updatedAt: 10 } };
    const b = { sessions: {}, gear: { items: [{ kg: 10, n: 2 }], updatedAt: 20 } };
    const m = M.mergeState(a, b);
    ok(m.gear.updatedAt === 20 && m.gear.items[0].kg === 10, "merge: gear は updatedAt が大きい方");
  }

  // 旧形式（idなし）のセットは両端末で同じIDになり重複しない
  {
    const legacy = () => ({ w: 10, r: 10, rpe: 8 });
    const a = { sessions: { "2026-01-05": { date: "2026-01-05", entries: [{ ex: "row", sets: [legacy()] }] } } };
    const b = { sessions: { "2026-01-05": { date: "2026-01-05", entries: [{ ex: "row", sets: [legacy()] }] } } };
    ok(M.mergeState(a, b).sessions["2026-01-05"].entries[0].sets.length === 1, "merge: 同一内容の旧形式セットは両端末で同じidになり重複しない");
  }

  // remote側だけの空エントリは落ちる。local側の空エントリは残る
  {
    const a = { sessions: { "2026-01-06": { date: "2026-01-06", entries: [] } } };
    const b = { sessions: { "2026-01-06": { date: "2026-01-06", entries: [{ ex: "curl", sets: [] }] } } };
    ok(M.mergeState(a, b).sessions["2026-01-06"].entries.length === 0, "merge: remote側だけにある空エントリは落ちる");
    const a2 = { sessions: { "2026-01-06b": { date: "2026-01-06b", entries: [{ ex: "curl", sets: [] }] } } };
    const b2 = { sessions: { "2026-01-06b": { date: "2026-01-06b", entries: [] } } };
    ok(M.mergeState(a2, b2).sessions["2026-01-06b"].entries.length === 1, "merge: local側にある空エントリは残る");
  }

  // syncCard / syncWire の最低限の健全性
  {
    const html = M.syncCard();
    ok(html.indexOf('id="syncRepo"') !== -1 && html.indexOf('data-sync="connect"') !== -1, "syncCard: 未設定時はリポジトリ欄・鍵欄・接続ボタンを含む");
    let threw = false;
    try{ M.syncWire({ querySelector(){ return null; } }); }catch(e){ threw = true; }
    ok(!threw, "syncWire: カードが root に無くても例外を投げない");
  }
}

/* ============================================================
   2. 結合テスト: A/B 2端末 + モック
   ============================================================ */
async function runMainIntegration(port){
  console.log("\n-- integration: two devices against the mock --");
  const token = "tok-main";
  const mock = startMock(port, token);
  await waitReady(mock.base);

  try{
    const A = makeDevice(mock.base);
    const B = makeDevice(mock.base);

    // A: 何かレコードを持った状態で接続 → 検証 → push でファイルが作られる
    A.ctx.state.sessions["2026-02-01"] = {
      date: "2026-02-01", entries: [{ ex: "squat", sets: [{ id: "a1", at: 1, w: 10, r: 10, rpe: 8 }] }], updatedAt: Date.now()
    };
    const connectedA = await A.ctx.syncConnect("acme/repo", token);
    ok(connectedA === true, "A: 接続に成功する");
    const afterConnectCard = A.ctx.syncCard();
    ok(afterConnectCard.indexOf("接続中: acme/repo") !== -1, "A: 接続後のカードは「接続中」表示になる");

    let fileRes = await fetch(mock.base + "/_mock/file");
    ok(fileRes.status === 200, "A接続後: リモートに trainlog.json が作られる");
    let fileJson = JSON.parse(await fileRes.text());
    ok(fileJson.app === "trainlog" && !!fileJson.sessions["2026-02-01"], "A接続後: 中身はAの記録を含む");

    // B: 空の状態で接続 → Aの記録を受け取る
    const connectedB = await B.ctx.syncConnect("acme/repo", token);
    ok(connectedB === true, "B: 接続に成功する");
    ok(!!B.ctx.state.sessions["2026-02-01"], "B: 接続後にAの記録を受け取る");
    ok(B.ctx.state.sessions["2026-02-01"].entries[0].sets[0].id === "a1", "B: 受け取ったセットのidが一致する");

    // B: 1セット削除、1セット追加、メモ編集 → 同期
    const sB = B.ctx.state.sessions["2026-02-01"];
    const removed = sB.entries[0].sets.shift();
    sB.del = (sB.del || []).concat(removed.id);
    sB.entries[0].sets.push({ id: "b-new-1", at: Date.now(), w: 12, r: 9, rpe: 9 });
    sB.note = "Bからのメモ";
    sB.noteAt = Date.now();
    sB.updatedAt = Date.now();
    await B.ctx.syncNow();

    // A: 同期して3つの変化をすべて確認
    await A.ctx.syncNow();
    const sA = A.ctx.state.sessions["2026-02-01"];
    const idsA = sA.entries[0].sets.map(s => s.id);
    ok(idsA.indexOf("a1") === -1, "A: Bが削除したセットが消えている");
    ok(idsA.indexOf("b-new-1") !== -1, "A: Bが追加したセットが届いている");
    ok(sA.note === "Bからのメモ", "A: Bが編集したメモが届いている");

    // 両端末が同じ日に別々の新しいセットを、同期せずに追加 → 両方同期 → 最終同期で両方に揃う
    const day2 = "2026-02-05";
    A.ctx.state.sessions[day2] = { date: day2, entries: [{ ex: "bench", sets: [{ id: "concurrentA", at: 1, w: 15, r: 8, rpe: 8 }] }], updatedAt: Date.now() };
    B.ctx.state.sessions[day2] = { date: day2, entries: [{ ex: "bench", sets: [{ id: "concurrentB", at: 1, w: 16, r: 7, rpe: 8 }] }], updatedAt: Date.now() };
    await A.ctx.syncNow();
    await B.ctx.syncNow();
    await A.ctx.syncNow(); // 最終同期
    const idsDay2A = A.ctx.state.sessions[day2].entries[0].sets.map(s => s.id).sort();
    const idsDay2B = B.ctx.state.sessions[day2].entries[0].sets.map(s => s.id).sort();
    ok(idsDay2A.join(",") === "concurrentA,concurrentB", "同時追加: 最終同期後、Aは両方のセットを持つ");
    ok(idsDay2B.join(",") === "concurrentA,concurrentB", "同時追加: Bは(自分が先にpushされているので)両方のセットを持つ");

    // gear の変更が B → A に届く
    B.ctx.state.gear = { items: [{ kg: 8, n: 2 }], updatedAt: Date.now() };
    await B.ctx.syncNow();
    await A.ctx.syncNow();
    ok(!!A.ctx.state.gear && A.ctx.state.gear.items[0].kg === 8, "gear: Bの変更がAに届く");

    // 409を1回だけ強制 → 自動リトライで成功する
    await fetch(mock.base + "/_mock/conflict", { method: "POST" });
    A.ctx.state.sessions["2026-02-06"] = { date: "2026-02-06", entries: [{ ex: "curl", sets: [{ id: "retry1", at: 1, w: 6, r: 12, rpe: 7 }] }], updatedAt: Date.now() };
    await A.ctx.syncNow();
    ok(A.ctx.syncCard().indexOf("GitHubと同期しました") !== -1, "409を1回強制: 自動リトライの末に成功する");
    fileRes = await fetch(mock.base + "/_mock/file");
    fileJson = JSON.parse(await fileRes.text());
    ok(!!fileJson.sessions["2026-02-06"], "409を1回強制: リトライ後の内容がリモートに反映されている");

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
   3. 公開リポジトリは拒否し、何も書き込まない
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

    const fileRes = await fetch(mock.base + "/_mock/file");
    ok(fileRes.status === 404, "公開リポジトリ: 何も書き込まれない");
  } finally {
    mock.proc.kill();
  }
}

/* ============================================================
   4. 422（sha無しでの既存ファイル上書き）からの回復
      実際の競合（別端末が pull と push の間に先にファイルを作る）を fetch を
      差し替えて再現する。403/409 をモックの制御エンドポイントで強制する
      テストとは別に、本物の 422 が返る状況を作ることが目的。
   ============================================================ */
async function run422RecoveryTest(port){
  console.log("\n-- integration: real 422 (concurrent create) recovers --");
  const token = "tok-422";
  const mock = startMock(port, token);
  await waitReady(mock.base);
  try{
    const B2 = makeDevice(mock.base);
    await B2.ctx.syncConnect("acme/repo422", token); // 空のまま接続。まだファイルは無い

    const A2 = makeDevice(mock.base);
    await A2.ctx.syncConnect("acme/repo422", token); // こちらも空のまま接続

    const realFetch = A2.ctx.fetch;
    A2.ctx.fetch = async function(url, opts){
      const isPull = String(url).indexOf("/contents/trainlog.json") !== -1
        && (!opts || !opts.method || String(opts.method).toUpperCase() === "GET");
      const res = await realFetch(url, opts);
      if(isPull){
        A2.ctx.fetch = realFetch; // 1回きり
        // Aのpullが終わった直後、Bが先にファイルを作る
        B2.ctx.state.sessions["2026-04-09"] = { date: "2026-04-09", entries: [{ ex: "row", sets: [{ id: "b1", at: 1, w: 5, r: 10, rpe: 7 }] }], updatedAt: Date.now() };
        await B2.ctx.syncNow();
      }
      return res;
    };

    A2.ctx.state.sessions["2026-04-10"] = { date: "2026-04-10", entries: [{ ex: "squat", sets: [{ id: "a1", at: 1, w: 20, r: 5, rpe: 9 }] }], updatedAt: Date.now() };
    await A2.ctx.syncNow(); // 1回目 push は sha無し×既存ファイルで422 → 自動で再pull・再push

    ok(A2.ctx.syncCard().indexOf("GitHubと同期しました") !== -1, "実際の422: 自動リトライの末に成功する");
    const fileRes = await fetch(mock.base + "/_mock/file");
    const fileJson = JSON.parse(await fileRes.text());
    ok(!!fileJson.sessions["2026-04-09"] && !!fileJson.sessions["2026-04-10"], "実際の422: 双方の記録がマージされてリモートに残る");
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
