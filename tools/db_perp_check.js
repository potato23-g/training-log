/* 線の図: ダンベルの持ち手は前腕と直角に通す（2026-11-04 本人の指摘「手とダンベルは横から見て直角に持つ。トライセプスとか同じ向きで持っておかしい」）。
   各種目の周期を通して、持ち手の向きと前腕（肘→手首）の向きのなす角を測り、いちばん直角から離れた値を出す。
   使い方: cd tools && bun db_perp_check.js [種目id...]   最後の「合わない項目: N 件」で判定 */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd', 'e', 'f']) { try { await import('../src/motions_' + f + '.js'); } catch (e) {} }
const M = globalThis.MOTION, V = M.V, Q = M.Q;
const DEG = 180 / Math.PI, MIN = 65;     /* 直角から 25 度まではよい（手首の自然な傾き） */
const only = process.argv.slice(2);
let bad = 0;
const ang = (a, b) => Math.acos(Math.min(1, Math.abs(V.dot(V.norm(a), V.norm(b))))) * DEG;
for (const id of Object.keys(M.motions).sort()) {
  if (only.length && !only.includes(id)) continue;
  const m = M.motions[id];
  if (!(m.dumbbells || []).length) continue;
  const T = M.cycleTime(m), N = 40;
  let worst = 90, wt = 0;
  for (let i = 0; i <= N; i++) {
    const t = T * i / N, f = M.solveFrame(m, t);
    f.dumbbells.forEach((db, k) => {
      const d = m.dumbbells[k], ax = Q.rot(db.quat, [0, 0, 1]);
      const sides = d.grip === 'both' ? ['R', 'L'] : [d.grip === 'handL' ? 'L' : 'R'];
      sides.forEach((s) => {
        const fa = V.sub(f.b['hand' + s].pos, f.b['forearm' + s].pos), a = ang(ax, fa);
        if (a < worst) { worst = a; wt = t; }
      });
    });
  }
  const ok = worst >= MIN;
  if (!ok) bad++;
  console.log(`${ok ? '   OK' : '   NG'}  ${id} … 持ち手と前腕のなす角 いちばん小さいとき ${worst.toFixed(0)}°（t=${wt.toFixed(2)}）`);
}
console.log(`\n合わない項目: ${bad} 件`);
