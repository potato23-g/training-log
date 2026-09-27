#!/usr/bin/env bun
/* export.js（CSV・テキスト書き出し）のテスト。 `bun tools/export_test.js` で実行する。
   src/app/core.js + src/app/export.js を node:vm に読み込み、DOM は最小限のスタブで済ませる。
   C13: = + - @ やタブ・改行で始まるセル（メモなど）は表計算ソフトに式として読まれうるので、
        頭に ' を付ける
   C17: セットが無くメモだけの日も、CSV・テキストどちらの書き出しにも出す */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const CORE_SRC = fs.readFileSync(path.join(ROOT, "src", "app", "core.js"), "utf8");
const EXPORT_SRC = fs.readFileSync(path.join(ROOT, "src", "app", "export.js"), "utf8");

let passed = 0, failed = 0;
function ok(cond, msg){
  if(cond){ passed++; console.log("PASS - " + msg); }
  else{ failed++; console.log("FAIL - " + msg); }
}

function makeLocalStorage(){
  const map = new Map();
  return {
    getItem(k){ return map.has(k) ? map.get(k) : null; },
    setItem(k, v){ map.set(k, String(v)); },
    removeItem(k){ map.delete(k); }
  };
}
/* showText() が触る #sheetInner / #sheet の最小スタブ。querySelector は常に同じダミー要素を返す
   （"textarea" でも "[data-close]" でも困らない。onfocus/onclick を生やせればよいだけ） */
function makeSheetStub(){
  let html = "";
  const el = { onfocus: null, onclick: null, value: "", select(){} };
  const fake = { querySelector(){ return el; }, querySelectorAll(){ return []; } };
  Object.defineProperty(fake, "innerHTML", { get: () => html, set: (v) => { html = v; } });
  return { sheetInner: fake, sheet: { classList: { add(){}, remove(){} } }, getHTML: () => html };
}
function makeEnv(){
  const { sheetInner, sheet, getHTML } = makeSheetStub();
  const sandbox = {
    console,
    localStorage: makeLocalStorage(),
    state: { sessions: {} },
    EXMAP: {
      squat: { name: "スクワット", kind: "w" },
      curl: { name: "カール", kind: "w" }
    },
    sheetInner, sheet,
    TODAY: "2026-09-27",
    esc(v){ return String(v === undefined || v === null ? "" : v); }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CORE_SRC, ctx, { filename: "core.js" });
  vm.runInContext(EXPORT_SRC, ctx, { filename: "export.js" });
  return { ctx, getHTML };
}

console.log("-- export: CSV / テキスト書き出し --");

/* ---- C17: セットが無くメモだけの日も出す（CSV） ---- */
{
  const { ctx } = makeEnv();
  ctx.state.sessions = {
    "2026-09-01": { date: "2026-09-01", entries: [{ ex: "squat", sets: [{ id: "s1", at: 1, w: 10, r: 10, rpe: 8 }] }], note: "普通の日" },
    "2026-09-02": { date: "2026-09-02", entries: [], note: "セットは無いがメモだけある日" },
    "2026-09-03": { date: "2026-09-03", entries: [{ ex: "curl", sets: [] }], note: "空エントリだけでメモがある日" }
  };
  const rows = ctx.buildCSV().split("\n");

  ok(rows.some(r => r.indexOf("2026-09-02") === 0 && r.indexOf("セットは無いがメモだけある日") !== -1),
    "C17/CSV: セットが無くメモだけの日も行として出る");
  ok(rows.some(r => r.indexOf("2026-09-03") === 0 && r.indexOf("空エントリだけでメモがある日") !== -1),
    "C17/CSV: 空エントリだけでセットが無い日も出る");
  ok(rows.some(r => r.indexOf("2026-09-01") === 0 && r.indexOf("普通の日") !== -1),
    "CSV: 通常の記録がある日は今までどおり出る（回帰確認）");
}

/* ---- C13: 式として読まれうるセルの頭に ' を付ける（CSV） ---- */
{
  const { ctx } = makeEnv();
  ctx.state.sessions = {
    "2026-09-10": { date: "2026-09-10", entries: [], note: "=cmd(danger)" },
    "2026-09-11": { date: "2026-09-11", entries: [{ ex: "squat", sets: [{ id: "z1", at: 1, w: 10, r: 5, rpe: 7 }] }], note: "+1危険な先頭文字" },
    "2026-09-12": { date: "2026-09-12", entries: [{ ex: "squat", sets: [{ id: "z2", at: 1, w: 10, r: 5, rpe: 7 }] }], note: "@SUM(A1)" },
    "2026-09-13": { date: "2026-09-13", entries: [{ ex: "squat", sets: [{ id: "z3", at: 1, w: 10, r: 5, rpe: 7 }] }], note: "-1これも危ない" },
    "2026-09-14": { date: "2026-09-14", entries: [{ ex: "squat", sets: [{ id: "z4", at: 1, w: 10, r: 5, rpe: 7 }] }], note: "ふつうのメモ" }
  };
  const csv = ctx.buildCSV();
  ok(csv.indexOf("'=cmd(danger)") !== -1, "C13/CSV: = で始まるメモの頭に ' を付ける");
  ok(csv.indexOf("'+1危険な先頭文字") !== -1, "C13/CSV: + で始まるメモの頭に ' を付ける");
  ok(csv.indexOf("'@SUM(A1)") !== -1, "C13/CSV: @ で始まるメモの頭に ' を付ける");
  ok(csv.indexOf("'-1これも危ない") !== -1, "C13/CSV: - で始まるメモの頭に ' を付ける");
  ok(csv.indexOf("ふつうのメモ") !== -1 && csv.indexOf("'ふつうのメモ") === -1, "C13/CSV: 危険な文字で始まらないメモは変えない");
}

/* ---- C17: セットが無くメモだけの日も出す（テキスト） ---- */
{
  const { ctx, getHTML } = makeEnv();
  ctx.state.sessions = {
    "2026-09-20": { date: "2026-09-20", entries: [], note: "テキスト書き出しのメモだけの日" },
    "2026-09-21": { date: "2026-09-21", entries: [], note: "" } // メモも無い日は今までどおり出ない
  };
  ctx.showText();
  const html = getHTML();
  ok(html.indexOf("テキスト書き出しのメモだけの日") !== -1, "C17/テキスト: セットが無くメモだけの日も出る");
  ok(html.indexOf(ctx.fmtDate("2026-09-20")) !== -1, "C17/テキスト: その日の日付見出しも出る");
  ok(html.indexOf(ctx.fmtDate("2026-09-21")) === -1, "C17/テキスト: セットもメモも無い日は今までどおり出ない（回帰確認）");
}

console.log("\n==============================");
console.log(passed + " passed, " + failed + " failed");
console.log("==============================");
process.exit(failed ? 1 : 0);
