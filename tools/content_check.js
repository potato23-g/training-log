/* data.js / variants.js の中身どうしの食い違いを確かめる（画面に触れない定義だけのファイルなので、
   node:vm で読み込んで実行する。動きのファイルは他の検査と同じく import で読み込む）。
   使い方: cd tools && bun content_check.js

   (a) 大変版のラベルの「N秒かけて〜」「〜でN秒止める」が、DETAIL の tempo の同じ場面の標準
       （幅なら上限、書いていなければ0秒）より2秒以上長い
   (b) 大変版のラベルに「深く」「深め」を含まない
   (c) ROUTINES でラベル無し・side:true の種目の組み方の行は side:true
   (d) ROUTINES・EX・組み方の行の r が DETAIL の幅に収まる
   (e) VARIANT_MOTION のキーはすべて VARIANT_TEXT にあり、動きidは src/motions*.js に登録されている */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

/* ---- data.js / variants.js を node:vm で（この2つは画面に触れない定義だけなので、これで読める） ---- */
const ctx = vm.createContext({ console });
function loadVm(rel) {
  const p = path.join(ROOT, rel);
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel });
}
loadVm('src/app/data.js');
loadVm('src/app/variants.js');
const pull = (name) => vm.runInContext(name, ctx);
const EX = pull('EX'), DETAIL = pull('DETAIL'), ROUTINES = pull('ROUTINES');
const VARIANT_TEXT = pull('VARIANT_TEXT'), VARIANT_MOTION = pull('VARIANT_MOTION'), VARIANT_ROWS = pull('VARIANT_ROWS');
const baseOf = pull('baseOf');

/* ---- 動きのファイルは他の検査と同じ読み込み方（IIFE が globalThis.MOTION に登録する） ---- */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd', 'e', 'f']) {
  try { await import('../src/motions_' + f + '.js'); } catch (e) { console.log('読み込み失敗', f, e.message); }
}
const M = globalThis.MOTION;

let ng = 0;
const report = (ok, msg) => { if (!ok) ng++; console.log((ok ? 'OK  ' : 'NG  ') + msg); };

/* ============ (a)(b) 大変版のラベルの文言 ============ */
/* ラベル自身の「位置＋で」を取り出し、DETAIL[...].tempo の同じ位置の区間（幅なら上限、
   無ければ0秒）より2秒以上長いことを確かめる。「N秒かけて〜」の形はその動詞の区間と比べる */
function stillStandard(posWord, tempo) {
  if (!tempo) return 0;
  const esc = posWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(esc + 'で(\\d+)(?:〜(\\d+))?秒').exec(tempo);
  if (!m) return 0;
  return m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10);
}
function verbStandard(verb, tempo) {
  if (!tempo) return 0;
  const esc = verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(esc + '(\\d+)(?:〜(\\d+))?秒').exec(tempo);
  if (!m) return 0;
  return m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10);
}

EX.forEach((e) => {
  const v = VARIANT_TEXT[e.id];
  if (!v || !v.hard) return;
  const label = v.hard[0];
  const det = DETAIL[e.id] || DETAIL[baseOf(e.id)];
  const tempo = det && det.tempo;

  report(!/深く|深め/.test(label), `(b) ${e.id}（${label}）… ラベルに「深く／深め」を含まない`);

  let mHold, mPace;
  if ((mHold = /^(.+?)で(\d+)(?:〜\d+)?秒止める/.exec(label))) {
    const declared = parseInt(mHold[2], 10);
    const std = stillStandard(mHold[1], tempo);
    report(declared >= std + 2,
      `(a) ${e.id}（${label}）… 標準${std}秒に対し${declared}秒（2秒以上長いこと）`);
  } else if ((mPace = /^(\d+)秒かけて(.+)$/.exec(label))) {
    const declared = parseInt(mPace[1], 10);
    const std = verbStandard(mPace[2], tempo);
    report(declared >= std + 2,
      `(a) ${e.id}（${label}）… 標準${std}秒に対し${declared}秒（2秒以上長いこと）`);
  }
});

/* ============ (c) ROUTINES でラベル無し・side:true の種目 → 組み方の行も side:true ============ */
function routineWantsSide(id) {
  return ROUTINES.some((r) => r.items.some((it) => it.ex === id && it.side && !it.label));
}
const sideWanted = [...new Set(EX.map((e) => e.id).filter(routineWantsSide))];
sideWanted.forEach((id) => {
  VARIANT_ROWS.filter((r) => r.ex === id).forEach((r) => {
    report(!!r.side, `(c) ${id}（${r.label}）… side:true が付いている`);
  });
});

/* ============ (d) ROUTINES・EX・組み方の行の r が DETAIL の幅に収まる ============ */
function repsRange(id) {
  const det = DETAIL[id] || DETAIL[baseOf(id)];
  const m = det && /(\d+)\s*〜\s*(\d+)\s*(?:回|秒)/.exec(det.reps);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}
function checkR(label, id, r) {
  const rng = repsRange(id);
  if (!rng) { report(true, `(d) ${label} … DETAIL に幅の記載なし（対象外）`); return; }
  report(r >= rng[0] && r <= rng[1], `(d) ${label} … r=${r}（幅 ${rng[0]}〜${rng[1]}）`);
}
EX.forEach((e) => checkR('EX ' + e.id, e.id, e.r));
ROUTINES.forEach((rt) => rt.items.forEach((it) => checkR('ROUTINES ' + rt.id + '/' + it.ex + (it.label ? '(' + it.label + ')' : ''), it.ex, it.r)));
VARIANT_ROWS.forEach((row) => checkR('組み方 ' + row.ex + '（' + row.tag + '）', row.ex, row.r));

/* ============ (e) VARIANT_MOTION のキー・値の整合 ============ */
Object.keys(VARIANT_MOTION).forEach((key) => {
  const i = key.indexOf('|');
  const exId = key.slice(0, i), label = key.slice(i + 1);
  const v = VARIANT_TEXT[exId];
  const inText = !!(v && ((v.hard && v.hard[0] === label) || (v.easy && v.easy[0] === label)));
  report(inText, `(e) VARIANT_MOTION キー「${key}」… VARIANT_TEXT に対応する組み方がある`);
  const motionId = VARIANT_MOTION[key];
  report(!!(M.motions && M.motions[motionId]), `(e) VARIANT_MOTION「${key}」→「${motionId}」… 動きが登録されている`);
});

console.log('\n合わない項目: ' + ng + ' 件');
