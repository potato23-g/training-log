/* 場面のラベルと、実際に図がどう動いているかが合っているかを測る。
   使い方: cd tools && bun anim_check.js [種目id...]

   その動きで一番大きく変わる関節（主役のドライバ）を選び、場面ごとの変化量を見る。
   ・「止める」「〜の位置」なのに大きく動いている
   ・動きの名前（上げる・下ろすなど）なのに止まっている
   ・上げる場面と下ろす場面が同じ向きに動いている（ラベルがずれている）
   向きそのものは種目ごとに違うので、「上げる系」と「下ろす系」が逆向きかどうかで見る */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd', 'e', 'f']) { try { await import('../src/motions_' + f + '.js'); } catch (e) { console.log('読み込み失敗 ' + f + ': ' + e.message); } }
const M = globalThis.MOTION;

const UP = /上げる|押し上げる|巻き上げる|立ち上がる|起こす|起き上がる|伸ばす|すくめる|引き上げる|浮かせる|閉じる|持ち上げる|崩れていく/;
const DOWN = /下ろす|下げる|沈む|倒す|戻す|開く|折る/;
const STILL = /止める|保つ|位置$|構える|一番下$|一番上$|伸ばしきる|90度に|崩れたまま|崩れた姿勢|正しい姿勢$|胸が床の手前/;

function mainDriver(m) {
  const T = M.cycleTime(m), N = 80;
  const samples = [];
  for (let i = 0; i <= N; i++) samples.push(M.driversAt(m, T * i / N));
  let best = null, bestAmp = 0;
  Object.keys(samples[0]).forEach((n) => {
    const vs = samples.map((s) => s[n]);
    const amp = Math.max(...vs) - Math.min(...vs);
    /* 位置（メートル）と角度（度）が混ざるので、位置は100倍して比べる */
    const w = /\.(x|y|z)$/.test(n) ? 100 : 1;
    if (amp * w > bestAmp) { bestAmp = amp * w; best = { name: n, vs: vs, amp: amp, w: w }; }
  });
  return { T, N, best, score: bestAmp };
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(M.motions);
let ng = 0;
for (const id of ids) {
  const m = M.motions[id];
  if (!m || !(m.phases || []).length) continue;
  const { T, N, best, score } = mainDriver(m);
  if (!best || score < 5) continue;                       /* ほとんど動かない種目は対象外 */
  const at = (t) => best.vs[Math.max(0, Math.min(N, Math.round(t / T * N)))];
  const ps = m.phases;
  /* 「動いているか」はどのドライバでもよいので、全部の中で一番大きく動いた割合で見る */
  const allSamples = [];
  for (let i = 0; i <= N; i++) allSamples.push(M.driversAt(m, T * i / N));
  const names = Object.keys(allSamples[0]);
  const ampAll = {};
  names.forEach((n) => {
    const vs = allSamples.map((s2) => s2[n]);
    ampAll[n] = Math.max(...vs) - Math.min(...vs);
  });
  const movedRatio = (t0, t1) => {
    let best2 = 0;
    names.forEach((n) => {
      if (ampAll[n] < 1e-6) return;
      let lo2 = 1e9, hi2 = -1e9;
      for (let i = 0; i <= N; i++) {
        const t = T * i / N;
        if (t < t0 - 1e-9 || t > t1 + 1e-9) continue;
        const v = allSamples[i][n];
        lo2 = Math.min(lo2, v); hi2 = Math.max(hi2, v);
      }
      best2 = Math.max(best2, (hi2 - lo2) / ampAll[n]);
    });
    return best2;
  };
  const rows = ps.map((p, i) => {
    const end = (i + 1 < ps.length) ? ps[i + 1].t : T;
    let lo = 1e9, hi = -1e9;
    for (let t = p.t; t <= end + 1e-9; t += T / N) { const v = at(t); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    return { p, end, d: at(end) - at(p.t), span: hi - lo, ratio: movedRatio(p.t, end),
             kind: STILL.test(p.label) ? 'still' : (UP.test(p.label) ? 'up' : (DOWN.test(p.label) ? 'down' : null)) };
  });
  /* 「上げる系」の向きを、上げる場面の変化の合計から決める */
  const sum = (k) => rows.filter((r) => r.kind === k).reduce((a, r) => a + r.d, 0);
  const upSign = Math.sign(sum('up')) || -Math.sign(sum('down')) || 1;
  const lines = [];
  rows.forEach((r) => {
    if (!r.kind) return;
    const moving = r.ratio > 0.15;
    const mainMoves = r.span > best.amp * 0.15;
    const unit = best.w === 100 ? 'cm' : '°';
    const val = (x) => (best.w === 100 ? (x * 100).toFixed(0) : x.toFixed(0)) + unit;
    if (r.kind === 'still' && moving)
      lines.push('   ' + r.p.t + 's「' + r.p.label + '」… 止まるはずが ' + val(r.span) + ' 動いている');
    else if (r.kind !== 'still' && !moving)
      lines.push('   ' + r.p.t + 's「' + r.p.label + '」… 動くはずが止まっている');
    else if (r.kind === 'up' && mainMoves && Math.sign(r.d) !== upSign)
      lines.push('   ' + r.p.t + 's「' + r.p.label + '」… 逆向きに動いている（この場面は下ろす動き）');
    else if (r.kind === 'down' && mainMoves && Math.sign(r.d) === upSign)
      lines.push('   ' + r.p.t + 's「' + r.p.label + '」… 逆向きに動いている（この場面は上げる動き）');
  });
  if (lines.length) {
    console.log('== ' + id + '  周期' + T + '秒  主に動く関節: ' + best.name);
    lines.forEach((l) => console.log(l));
    ng += lines.length;
  }
}
console.log('\nラベルと動きが食い違う場面: ' + ng + ' 件');
