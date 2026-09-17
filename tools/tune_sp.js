globalThis.window = undefined;
await import('../src/motion.js');
for (const f of ['', '_b', '_c', '_d']) await import('../src/motions' + f + '.js');
const M = globalThis.MOTION, m = M.motions.sideplank;
function probe(over) {
  Object.assign(m.base, over);
  Object.assign(m.keys[0].d, over);     /* キーの値が base を上書きするので両方に入れる */
  m._tracks = null;
  const f = M.solveFrame(m, 0);
  const foot = f.contacts.find((c) => c.name === 'footR');
  return { footY: foot.pos[1], pelvisY: f.b.pelvis.pos[1], shY: f.b.upperarmR.pos[1],
           headY: f.b.head.pos[1], elbowY: f.b.forearmR.pos[1] };
}
/* 正しい姿勢: 足が床につく roll を二分法で探す */
let lo = 40, hi = 92;                 /* roll を下げるほど足が床に近づく */
for (let i = 0; i < 26; i++) {
  const mid = (lo + hi) / 2;
  const r = probe({ 'pelvis.roll': mid });
  if (r.footY > 0.004) hi = mid; else lo = mid;
}
const roll = (lo + hi) / 2;
console.log('正しい姿勢の roll =', roll.toFixed(1), JSON.stringify(probe({ 'pelvis.roll': roll })));
/* 崩れ: 脊柱の側屈で腰を落とし、足が床に残る股関節角を走査で探す */
for (const sb of [8, 12, 16]) {
  let best = null;
  for (let abd = -28; abd <= 12; abd += 0.5) {
    const r = probe({ 'pelvis.roll': roll, 'spineL.abd': -sb, 'spineT.abd': -sb * 0.6,
                      'thighR.abd': abd, 'thighL.abd': -abd - 3 });
    const err = Math.abs(r.footY);
    if (!best || err < best.err) best = { err, abd, r };
  }
  console.log('側屈', sb, '→ 股関節', best.abd.toFixed(1), '足の高さ', best.r.footY.toFixed(3),
              '骨盤', best.r.pelvisY.toFixed(3), '肩', best.r.shY.toFixed(3));
}
