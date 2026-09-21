/* 関節角の実測。荷重下で現実的な範囲を超えていないかを見る（可動域表より厳しめの目安で判定） */
globalThis.window = undefined;
const ROOT = '../src/';
await import(ROOT + 'motion.js'); await import(ROOT + 'motions.js');
for (const f of ['b','c','d','e','f']) { try { await import(ROOT + 'motions_' + f + '.js'); } catch(e){} }
const M = globalThis.MOTION;
/* 荷重時に現実的な目安（度） */
const REAL = {
  hand:     { flex: [-35, 35], abd: [-18, 22], rot: [-12, 12] },   /* 手首: 重りを持つと中間位付近 */
  forearm:  { flex: [0, 145],  rot: [-20, 200] },                  /* 肘。前腕の回旋は 0=手のひら上、90=中間、180=手のひら下 */
  upperarm: { flex: [-55, 175], abd: [-30, 170], rot: [-95, 95] },
  shank:    { flex: [0, 145] },
  thigh:    { flex: [-20, 130], abd: [-25, 45] },
  spineL:   { flex: [-18, 45] }, spineT: { flex: [-10, 18] }, spineC: { flex: [-10, 16] },
  neck:     { flex: [-40, 40] }, head: { flex: [-22, 22] }, foot: { flex: [-45, 40] }
};
const out = [];
for (const id of Object.keys(M.motions)) {
  const m = M.motions[id], T = M.cycleTime(m);
  const ext = {};
  for (let i = 0; i <= 60; i++) {
    const t = T * i / 60, fr = M.solveFrame(m, t);
    Object.keys(M.RIG.bones).forEach((n) => {
      const base = n.replace(/[RL]$/, '');
      if (!REAL[base]) return;
      const a = M.boneAngles(fr.pose, n);
      ['flex','abd','rot'].forEach((k) => {
        const lim = REAL[base][k]; if (!lim) return;
        let v = a[k];
        [v - 360, v, v + 360].forEach((c) => { if (Math.abs(c) < Math.abs(v)) v = c; });
        const over = v < lim[0] ? v - lim[0] : (v > lim[1] ? v - lim[1] : 0);
        const key = n + '.' + k;
        if (!ext[key] || Math.abs(over) > Math.abs(ext[key].over)) ext[key] = { over, v: Math.round(v), t: +t.toFixed(1), lim };
      });
    });
  }
  const bad = Object.entries(ext).filter(([, e]) => Math.abs(e.over) > 3)
    .sort((a, b) => Math.abs(b[1].over) - Math.abs(a[1].over))
    .map(([k, e]) => `${k} ${e.v}° (目安 ${e.lim[0]}〜${e.lim[1]}) @${e.t}s`);
  out.push('== ' + id + (bad.length ? '\n   ' + bad.join('\n   ') : ' : 問題なし'));
}
console.log(out.join('\n'));
