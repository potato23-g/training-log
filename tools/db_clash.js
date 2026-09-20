/* ダンベルと体のぶつかりを測る（頭・首・胴・脚に食い込んでいないか）。
   ダンベルは軸（局所Z）に沿った長さ0.204m・半径0.052mの棒として扱う。
   握っている手・前腕は当たって当然なので除く。胸に抱える種目などは当たるのが正しいので、数値を見て判断する。
   使い方: cd tools && bun db_clash.js [種目id...] */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd', 'e']) { try { await import('../src/motions_' + f + '.js'); } catch (e) {} }
const M = globalThis.MOTION, V = M.V, Q = M.Q;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(M.motions);
const N = 64;
const DB_HALF = 0.102, DB_R = 0.052;
const SKIP = /^(hand|forearm)[RL]$/;

/* 線分同士の最短距離 */
function segDist(p1, q1, p2, q2) {
  const d1 = V.sub(q1, p1), d2 = V.sub(q2, p2), r = V.sub(p1, p2);
  const a = V.dot(d1, d1), e = V.dot(d2, d2), f = V.dot(d2, r);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) return V.len(r);
  if (a <= 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = V.dot(d1, r);
    if (e <= 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = V.dot(d1, d2), den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  return V.dist(V.add(p1, V.mul(d1, s)), V.add(p2, V.mul(d2, t)));
}

for (const id of ids) {
  const m = M.motions[id];
  if (!m) { console.log(id, 'なし'); continue; }
  if (!(m.dumbbells || []).length) { console.log('== ' + id + ' : ダンベルなし'); continue; }
  const T = M.cycleTime(m);
  const worst = {};
  for (let i = 0; i <= N; i++) {
    const t = T * i / N;
    const fr = M.solveFrame(m, t);
    const caps = M.capsules(fr);
    fr.dumbbells.forEach((db, di) => {
      const ax = Q.rot(db.quat, [0, 0, 1]);
      const a = V.add(db.pos, V.mul(ax, -DB_HALF)), b = V.add(db.pos, V.mul(ax, DB_HALF));
      caps.forEach((c) => {
        if (SKIP.test(c.bone)) return;
        const pen = (c.r + DB_R) - segDist(a, b, c.a, c.b);
        if (pen <= 0.005) return;
        const k = c.bone;
        if (!worst[k] || pen > worst[k].pen) worst[k] = { pen, t, db: di };
      });
    });
  }
  const list = Object.entries(worst).sort((x, y) => y[1].pen - x[1].pen)
    .map(([b, w]) => b + ' ' + Math.round(w.pen * 1000) + 'mm@' + w.t.toFixed(1) + 's');
  console.log('== ' + id + ' : ' + (list.length ? list.join(' / ') : 'ぶつかりなし'));
}
