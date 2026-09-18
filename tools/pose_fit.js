/* 「上腕は床と平行」「前腕は垂直」「手はここ」といった狙いの姿勢から、必要な関節角（ドライバ）を求める。
   使い方: cd tools && bun pose_fit.js <仕様ファイル.js>
   仕様ファイルは次の形の既定エクスポートを書く:
     export default {
       id: 'ohp', t: 0,                       // 種目と、合わせたいキーの時刻
       vary: { 'upperarmR.flex': [-20, 60], 'upperarmR.abd': [0, 90], 'forearmR.flex': [60, 145] },
       mirror: true,                          // R を L にも同じ値で写す
       targets: [
         { dir: 'forearmR', to: [0, 1, 0], w: 2 },        // 前腕を真上に（世界座標）
         { dir: 'upperarmR', to: [0, -0.7, 0.7], w: 1 },  // 上腕を外下 45度に
         { pos: 'handR', to: [0.05, 1.45, 0.30], w: 3 },  // 手の位置（世界座標・m）
         { gap: 'head', min: 0.28, w: 4 }                 // ダンベルと頭中心の最短距離
       ]
     };
   出力: いちばん合う角度と、各狙いの残差。可動域超過とダンベルの食い込みも併記する。 */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd']) { try { await import('../src/motions_' + f + '.js'); } catch (e) {} }
const M = globalThis.MOTION, V = M.V, Q = M.Q;

const spec = (await import('file:///' + process.argv[2].replace(/\\/g, '/'))).default;
const m = M.motions[spec.id];
if (!m) throw new Error('種目が無い: ' + spec.id);
const key = m.keys.find((k) => Math.abs(k.t - spec.t) < 1e-6);
if (!key) throw new Error('その時刻のキーが無い: ' + spec.t);

const names = Object.keys(spec.vary);
const orig = {};
names.forEach((n) => { orig[n] = key.d[n] !== undefined ? key.d[n] : (m.base[n] !== undefined ? m.base[n] : 0); });

function apply(vals) {
  names.forEach((n, i) => {
    key.d[n] = vals[i];
    if (spec.mirror && /R\./.test(n)) key.d[n.replace('R.', 'L.')] = vals[i];
  });
  delete m._tracks;
}

const DB_HALF = 0.102, DB_R = 0.052, SKIP = /^(hand|forearm)[RL]$/;
function cost(vals) {
  apply(vals);
  const fr = M.solveFrame(m, spec.t);
  let c = 0;
  const parts = [];
  (spec.targets || []).forEach((tg) => {
    const w = tg.w === undefined ? 1 : tg.w;
    if (tg.dir) {
      const b = fr.b[tg.dir];
      const d = V.norm(V.sub(b.tip, b.pos)), want = V.norm(tg.to);
      const ang = Math.acos(Math.max(-1, Math.min(1, V.dot(d, want)))) * 180 / Math.PI;
      c += w * ang / 10; parts.push(tg.dir + 'の向き ' + ang.toFixed(0) + '°ずれ');
    } else if (tg.pos) {
      const p = fr.b[tg.pos].pos, e = V.dist(p, tg.to);
      c += w * e * 20; parts.push(tg.pos + 'の位置 ' + (e * 100).toFixed(0) + 'cmずれ');
    } else if (tg.gap) {
      const b = fr.b[tg.gap];
      const center = V.mul(V.add(b.pos, b.tip), 0.5);
      let g = 9;
      fr.dumbbells.forEach((db) => { g = Math.min(g, V.dist(db.pos, center)); });
      const miss = Math.max(0, tg.min - g);
      c += w * miss * 30; parts.push(tg.gap + 'まで ' + g.toFixed(2) + 'm');
    }
  });
  /* 可動域超過とダンベルの食い込みは常に罰する */
  const rom = M.romCheck(fr.pose);
  c += rom.length * 3;
  let pen = 0;
  const caps = M.capsules(fr);
  fr.dumbbells.forEach((db) => {
    const ax = Q.rot(db.quat, [0, 0, 1]);
    const a = V.add(db.pos, V.mul(ax, -DB_HALF)), b = V.add(db.pos, V.mul(ax, DB_HALF));
    caps.forEach((cp) => {
      if (SKIP.test(cp.bone)) return;
      const d = segDist(a, b, cp.a, cp.b);
      pen = Math.max(pen, (cp.r + DB_R) - d);
    });
  });
  c += Math.max(0, pen) * 40;
  return { c, parts, rom: rom.length, pen: Math.round(Math.max(0, pen) * 1000) };
}

function segDist(p1, q1, p2, q2) {
  const d1 = V.sub(q1, p1), d2 = V.sub(q2, p2), r = V.sub(p1, p2);
  const a = V.dot(d1, d1), e = V.dot(d2, d2), f = V.dot(d2, r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return V.len(r);
  if (a <= 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c0 = V.dot(d1, r);
    if (e <= 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c0 / a)); }
    else {
      const b = V.dot(d1, d2), den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c0 * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c0 / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c0) / a)); }
    }
  }
  return V.dist(V.add(p1, V.mul(d1, s)), V.add(p2, V.mul(d2, t)));
}

/* 粗く総当たり → その周りを細かく（座標降下） */
let best = null;
const lo = names.map((n) => spec.vary[n][0]), hi = names.map((n) => spec.vary[n][1]);
const step0 = names.map((n, i) => Math.max(2, (hi[i] - lo[i]) / 6));
function walk(vals, i, acc) {
  if (i === names.length) { const r = cost(vals.slice()); if (!best || r.c < best.r.c) best = { vals: vals.slice(), r }; return; }
  for (let v = lo[i]; v <= hi[i] + 1e-9; v += step0[i]) { vals[i] = v; walk(vals, i + 1, acc); }
}
walk(names.map((_, i) => lo[i]), 0, null);
let step = step0.map((s) => s / 2);
for (let pass = 0; pass < 7; pass++) {
  let moved = false;
  for (let i = 0; i < names.length; i++) {
    for (const d of [-1, 1]) {
      const v = best.vals.slice();
      v[i] = Math.max(lo[i], Math.min(hi[i], v[i] + d * step[i]));
      const r = cost(v);
      if (r.c < best.r.c - 1e-9) { best = { vals: v, r }; moved = true; }
    }
  }
  if (!moved) step = step.map((s) => s / 2);
}

apply(best.vals);
console.log('== ' + spec.id + ' t=' + spec.t);
names.forEach((n, i) => console.log('   ' + n + ': ' + orig[n] + ' → ' + Math.round(best.vals[i] * 10) / 10));
console.log('   残差: ' + best.r.parts.join(' / '));
console.log('   可動域超過 ' + best.r.rom + ' 件 / ダンベルの食い込み ' + best.r.pen + 'mm');
