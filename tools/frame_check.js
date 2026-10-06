/* 動きの図が、再生中に枠（canvas）からはみ出さないかを見る。
   使い方: cd tools && bun frame_check.js        （はみ出す動きと、カメラを引いた動きを出す）
           cd tools && bun frame_check.js all    （全部の動きの比を出す）
   測り方: 1周を60等分した61コマで、骨の両端とダンベルを「点＋半径」の球とみなし、アプリと同じカメラから見て、
   枠の半分の幅・高さの何倍のところまで来るか（比）の最大を取る。1 を超えると枠の外に出ている。
   カメラの位置は figure3d.js の fitView（アプリと同じ関数）、向きは viewbase.js の figView と figure3d.js の setCamera、
   枠の縦横比は viewbase.js の figSize と同じ決め方にする。
   ・どの動きも比が 1 以下か
   ・fitView は、はみ出す動きだけカメラを引く。引く前から 1 以下だった動きのカメラを動かしていないか
     （確認済みの図を変えない）、引いた動きは遠ざける向きにだけ動かしているか */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd', 'e', 'f']) { try { await import('../src/motions_' + f + '.js'); } catch (e) {} }
await import('../src/figure3d.js');
const M = globalThis.MOTION, F = globalThis.FIGURE3D;
const ALL = process.argv[2] === 'all';
const STEPS = 60;
const RAD = Math.PI / 180;

/* 体とダンベルの太さ（m）。骨の名前の末尾の R・L は外して引く */
const R = { pelvis: 0.13, spineL: 0.12, spineT: 0.15, spineC: 0.165, neck: 0.06, head: 0.105, clav: 0.05,
            upperarm: 0.065, forearm: 0.046, hand: 0.05, thigh: 0.09, shank: 0.066, foot: 0.095, toes: 0.055 };
const R_DB = 0.115;
const unknown = new Set();      /* 太さの表に無い骨（あれば不合格にする。黙って太さ 0 で通さない） */
const radius = (n) => {
  const r = R[n] !== undefined ? R[n] : R[n.replace(/[RL]$/, '')];
  if (r === undefined) unknown.add(n);
  return r || 0;
};

const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const unit = (p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };

/* 枠の大きさ（viewbase.js の figSize）: 基本は 480×560、横に広い動きは 560×h */
function canvasSize(m) {
  let w = 480, h = 560;
  const f = F.fitView(m, m.view || {}, w / h);
  const r = f.halfU / Math.max(0.01, f.halfV);
  if (r > 1.15) { h = Math.round(Math.max(300, 560 / Math.min(2.0, r / 0.85))); w = 560; }
  return [w, h];
}
/* アプリが渡す見る向き（viewbase.js の figView）: az が無ければ 40 */
function appView(m) {
  const v = Object.assign({}, m.view || {});
  v.az = (v.az === undefined ? 40 : v.az);
  return v;
}

/* 1周ぶんの球 [位置, 半径, コマ, 名前] */
function balls(m) {
  const T = M.cycleTime(m), out = [];
  for (let i = 0; i <= STEPS; i++) {
    const f = M.solveFrame(m, T * i / STEPS);
    Object.keys(f.b).forEach((n) => {
      out.push([f.b[n].pos, radius(n), i, n]);
      out.push([f.b[n].tip, radius(n), i, n + 'の先']);
    });
    (f.dumbbells || []).forEach((d, k) => out.push([d.pos, R_DB, i, 'ダンベル' + (k + 1)]));
  }
  return out;
}

/* 注視点 target・距離 dist のカメラ（figure3d.js の setCamera と同じ置き方）から見た、比の最大 */
function worst(bs, v, fit, aspect) {
  const az = (v.az || 40) * RAD, el = (v.el || 12) * RAD;
  const back = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  const eye = [fit.target[0] + back[0] * fit.dist, fit.target[1] + back[1] * fit.dist, fit.target[2] + back[2] * fit.dist];
  /* lookAt: 上が (0,1,0) のとき、右 = 上 × 後ろ、カメラの上 = 後ろ × 右 */
  const right = unit(cross([0, 1, 0], back)), up = cross(back, right);
  const ty = Math.tan(F.FOV * RAD / 2);
  let best = { ratio: 0 };
  bs.forEach(([p, r, i, name]) => {
    const q = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
    const x = dot(q, right), y = dot(q, up), depth = -dot(q, back);
    const rh = depth > 0 ? (Math.abs(x) + r) / (depth * ty * aspect) : Infinity;
    const rv = depth > 0 ? (Math.abs(y) + r) / (depth * ty) : Infinity;
    if (rh > best.ratio) best = { ratio: rh, side: x > 0 ? '右' : '左', i, name };
    if (rv > best.ratio) best = { ratio: rv, side: y > 0 ? '上' : '下', i, name };
  });
  return best;
}

const f3 = (x) => x.toFixed(3), f2 = (x) => x.toFixed(2);
const where = (b) => b.side + 'へ コマ' + b.i + ' ' + b.name;
let bad = 0;
const pulled = [], rows = [];
for (const id of Object.keys(M.motions)) {
  const m = M.motions[id];
  const [w, h] = canvasSize(m), aspect = w / h;
  const v = appView(m), fit = F.fitView(m, v, aspect), bs = balls(m);
  const now = worst(bs, v, fit, aspect);
  const notes = [];
  if (!(now.ratio <= 1)) notes.push('枠の外に出る（比 ' + f3(now.ratio) + '・' + where(now) + '）');
  if (fit.raw) {
    const was = worst(bs, v, fit.raw, aspect);
    if (was.ratio <= 1) notes.push('はみ出していないのにカメラを動かしている（引く前の比 ' + f3(was.ratio) + '）');
    if (fit.dist < fit.raw.dist) notes.push('カメラを近づけている（' + f2(fit.raw.dist) + ' → ' + f2(fit.dist) + '）');
    pulled.push('   ' + id.padEnd(20) + '比 ' + f3(was.ratio) + ' → ' + f3(now.ratio) + '  距離 ' + f2(fit.raw.dist) + ' → ' + f2(fit.dist) +
                'm（図の大きさ 約' + f2(fit.raw.dist / fit.dist) + '倍）  ' + where(was));
  }
  rows.push({ id, w, h, now });
  if (notes.length) { bad++; console.log('== ' + id + '  枠 ' + w + '×' + h); notes.forEach((n) => console.log('   ' + n)); }
}
if (unknown.size) {
  bad += unknown.size;
  console.log('== 太さの表に無い骨: ' + [...unknown].join(' ') + '（この検査の R と figure3d.js の BULK に足す）');
}
if (ALL) {
  rows.sort((a, b) => b.now.ratio - a.now.ratio);
  rows.forEach((r) => console.log(r.id.padEnd(20) + f3(r.now.ratio) + '  枠 ' + r.w + '×' + r.h + '  ' + where(r.now)));
  console.log('');
}
console.log('カメラを引いた動き（引く前に比が 1 を超えていたもの）: ' + pulled.length + ' 個');
pulled.forEach((l) => console.log(l));
console.log('\n動き ' + rows.length + ' 個・比の最大 ' + f3(Math.max(...rows.map((r) => r.now.ratio))));
console.log('枠からはみ出す動き: ' + bad + ' 件');
