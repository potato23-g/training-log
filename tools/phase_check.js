/* 動きの「場面」ラベルが、実際の長さ・順番と合っているかを見る。
   使い方: cd tools && bun phase_check.js
   ・ラベルに書いた秒数と、その場面が続く長さがずれていないか
   ・最後の場面が周期の終わりに置かれていて、再生中に一度も出ないものがないか */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd', 'e', 'f']) { try { await import('../src/motions_' + f + '.js'); } catch (e) {} }
const M = globalThis.MOTION;
let bad = 0;
for (const id of Object.keys(M.motions)) {
  const m = M.motions[id], T = M.cycleTime(m), ps = m.phases || [];
  const lines = [];
  ps.forEach((p, i) => {
    const end = (i + 1 < ps.length) ? ps[i + 1].t : T;
    const dur = Math.round((end - p.t) * 100) / 100;
    const mm = /(\d+(?:\.\d+)?)(?:〜(\d+(?:\.\d+)?))?\s*秒/.exec(p.label);
    const notes = [];
    if (dur <= 0.001) notes.push('出ない（周期の終わりに置かれている）');
    else if (dur < 0.25) notes.push('一瞬しか出ない');
    if (mm) {
      const lo = parseFloat(mm[1]), hi = mm[2] ? parseFloat(mm[2]) : lo;
      if (dur < lo - 0.35 || dur > hi + 0.35) notes.push('ラベルは' + mm[0] + 'だが実際は' + dur + '秒');
    }
    if (notes.length) { lines.push('   ' + p.t + 's ' + p.label + ' … ' + notes.join(' / ')); bad++; }
  });
  if (lines.length) { console.log('== ' + id + '  周期' + T + '秒'); lines.forEach((l) => console.log(l)); }
}
console.log('\n合っていない場面: ' + bad + ' 件');
