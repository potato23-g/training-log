/* 組み方（〜（一番下で2秒止める）など）の動きが、その名前どおりになっているかを数値で確かめる。
   使い方: cd tools && bun variant_check.js
   例: 「一番下で2秒止める」ならその場面が2秒あるか、「片脚ずつ行う」なら片脚だけ上がるか */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd', 'e', 'f']) { try { await import('../src/motions_' + f + '.js'); } catch (e) { console.log('読み込み失敗', f, e.message); } }
const M = globalThis.MOTION, V = M.V;

const T = (m) => M.cycleTime(m);
const lowest = (m, bone) => { let v = 9; for (let i = 0; i <= 60; i++) v = Math.min(v, M.solveFrame(m, T(m) * i / 60).b[bone].pos[1]); return v; };
const highest = (m, bone) => { let v = -9; for (let i = 0; i <= 60; i++) v = Math.max(v, M.solveFrame(m, T(m) * i / 60).b[bone].pos[1]); return v; };
const range = (m, drv) => {
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i <= 60; i++) { const v = M.driversAt(m, T(m) * i / 60)[drv]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return { lo, hi };
};
/* ラベルがその場面に付いている区間の長さ */
const seg = (m, re) => {
  const ps = m.phases || [];
  const i = ps.findIndex((p) => re.test(p.label));
  if (i < 0) return null;
  return Math.round(((i + 1 < ps.length ? ps[i + 1].t : T(m)) - ps[i].t) * 100) / 100;
};
const dbCount = (m) => (m.dumbbells || []).length;
/* 左右の差（片側だけ動かす組み方かどうか） */
const moves = (m, drv) => { const r = range(m, drv); return Math.round((r.hi - r.lo) * 10) / 10; };

const CHECKS = [
  /* --- 深さ・角度 --- */
  ['goblet_box', 'goblet', '椅子に触れて止める（浅い）', (v, b) => {
    const a = lowest(v, 'pelvis'), c = lowest(b, 'pelvis');
    return [a > c + 0.06, `腰の一番低い位置 ${(a * 100).toFixed(0)}cm（元は ${(c * 100).toFixed(0)}cm）`];
  }],
  ['sumo_shallow', 'sumo', '浅めに止める', (v, b) => {
    const a = lowest(v, 'pelvis'), c = lowest(b, 'pelvis');
    return [a > c + 0.06, `腰の一番低い位置 ${(a * 100).toFixed(0)}cm（元は ${(c * 100).toFixed(0)}cm）`];
  }],
  ['sidelunge_shallow', 'sidelunge', '浅めに沈む', (v, b) => {
    const a = lowest(v, 'pelvis'), c = lowest(b, 'pelvis');
    return [a > c + 0.03, `腰の一番低い位置 ${(a * 100).toFixed(0)}cm（元は ${(c * 100).toFixed(0)}cm）`];
  }],
  ['fly_shallow', 'fly', '浅めに開く', (v, b) => {
    const a = range(v, 'upperarmR.abd').hi, c = range(b, 'upperarmR.abd').hi;
    return [a < c - 10, `開く角度 ${a.toFixed(0)}°（元は ${c.toFixed(0)}°）`];
  }],
  ['bridge_low', 'bridge', '高さを下げる', (v, b) => {
    const a = highest(v, 'pelvis'), c = highest(b, 'pelvis');
    return [a < c - 0.02, `腰の一番高い位置 ${(a * 100).toFixed(0)}cm（元は ${(c * 100).toFixed(0)}cm）`];
  }],
  ['lateral_short', 'lateral', '肘を深く曲げる', (v, b) => {
    const a = range(v, 'forearmR.flex').lo, c = range(b, 'forearmR.flex').lo;
    return [a > c + 20, `肘の曲げ ${a.toFixed(0)}°（元は ${c.toFixed(0)}°）`];
  }],
  ['calf_floor', 'calf', '床の上で行う', (v, b) => {
    const noStep = !(v.props || []).length;
    const heel = lowest(v, 'footR');
    return [noStep && heel > 0.02, `段差なし=${noStep} / かかと側の一番低い位置 ${(heel * 100).toFixed(0)}cm`];
  }],

  /* --- テンポ・止める時間（標準の位置で2〜3秒止まる） --- */
  ['goblet_hold', 'goblet', '一番下で3秒止める', (v) => [seg(v, /^一番下で\d+秒止める/) >= 2.7, `止める場面 ${seg(v, /^一番下で\d+秒止める/)}秒`]],
  ['sumo_hold', 'sumo', '一番下で2秒止める', (v) => [seg(v, /^一番下で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^一番下で\d+秒止める/)}秒`]],
  ['sidelunge_hold', 'sidelunge', '一番下で2秒止める', (v) => [seg(v, /^一番下で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^一番下で\d+秒止める/)}秒`]],
  ['rdl_hold', 'rdl', '一番下で2秒止める', (v) => [seg(v, /^一番下で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^一番下で\d+秒止める/)}秒`]],
  ['rdl1_hold', 'rdl1', '一番下で2秒止める', (v) => [seg(v, /^一番下で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^一番下で\d+秒止める/)}秒`]],
  ['split_hold', 'split', '一番下で2秒止める', (v) => [seg(v, /^一番下で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^一番下で\d+秒止める/)}秒`]],
  ['splitfloor_hold', 'splitfloor', '一番下で2秒止める', (v) => [seg(v, /^一番下で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^一番下で\d+秒止める/)}秒`]],
  ['row_hold', 'row', '下で2秒止める', (v) => [seg(v, /^下で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^下で\d+秒止める/)}秒`]],
  ['row2_hold', 'row2', '上で3秒止める', (v) => [seg(v, /^上で\d+秒止める/) >= 2.7, `止める場面 ${seg(v, /^上で\d+秒止める/)}秒`]],
  ['lateral_hold', 'lateral', '上で2秒止める', (v) => [seg(v, /^上で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^上で\d+秒止める/)}秒`]],
  ['front_hold', 'front', '上で2秒止める', (v) => [seg(v, /^上で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^上で\d+秒止める/)}秒`]],
  ['shrug_hold', 'shrug', '上で3秒止める', (v) => [seg(v, /^上で\d+秒止める/) >= 2.7, `止める場面 ${seg(v, /^上で\d+秒止める/)}秒`]],
  ['floorpress_hold', 'floorpress', '一番下で2秒止める', (v) => [seg(v, /^一番下で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^一番下で\d+秒止める/)}秒`]],
  ['fly_hold', 'fly', '床の手前で2秒止める', (v) => [seg(v, /^床の手前で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^床の手前で\d+秒止める/)}秒`]],
  ['pushupknee_hold', 'pushupknee', '一番下で2秒止める', (v) => [seg(v, /^一番下で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^一番下で\d+秒止める/)}秒`]],
  ['curl_hold', 'curl', '途中で2秒止める', (v) => [seg(v, /^途中で\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^途中で\d+秒止める/)}秒`]],
  ['triext_hold', 'triext', '下ろしたところで2秒止める', (v) => [seg(v, /^下ろしたところで\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^下ろしたところで\d+秒止める/)}秒`]],
  ['skull_hold', 'skull', '下ろしたところで2秒止める', (v) => [seg(v, /^下ろしたところで\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^下ろしたところで\d+秒止める/)}秒`]],
  ['sidebend_hold', 'sidebend', '一番下で3秒止める', (v) => [seg(v, /^一番下で\d+秒止める/) >= 2.7, `止める場面 ${seg(v, /^一番下で\d+秒止める/)}秒`]],

  /* --- 片側だけ / 重り --- */
  ['ohp_one', 'ohp', '片手ずつ押す', (v) => [dbCount(v) === 1 && moves(v, 'upperarmL.flex') < 5,
    `ダンベル ${dbCount(v)}個 / 左腕の動き ${moves(v, 'upperarmL.flex')}°`]],
  ['front_one', 'front', '片手ずつ上げる', (v) => [dbCount(v) === 1 && moves(v, 'upperarmL.flex') < 5,
    `ダンベル ${dbCount(v)}個 / 左腕の動き ${moves(v, 'upperarmL.flex')}°`]],
  ['floorpress_one', 'floorpress', '片手ずつ押す', (v) => [dbCount(v) === 1 && moves(v, 'upperarmL.flex') < 5,
    `ダンベル ${dbCount(v)}個 / 左腕の動き ${moves(v, 'upperarmL.flex')}°`]],
  ['curl_one', 'curl', '肘を手で支える', (v) => [dbCount(v) === 1 && moves(v, 'forearmL.flex') < 5,
    `ダンベル ${dbCount(v)}個 / 左腕の動き ${moves(v, 'forearmL.flex')}°`]],
  ['triext_one', 'triext', '肘を手で支える', (v) => [dbCount(v) === 1 && moves(v, 'forearmL.flex') < 5,
    `ダンベル ${dbCount(v)}個 / 左腕の動き ${moves(v, 'forearmL.flex')}°`]],
  ['skull_one', 'skull', '肘を手で支える', (v) => [dbCount(v) === 1 && moves(v, 'forearmL.flex') < 5,
    `ダンベル ${dbCount(v)}個 / 左腕の動き ${moves(v, 'forearmL.flex')}°`]],
  ['farmer_one', 'farmer', '片手だけで持つ', (v) => [dbCount(v) === 1, `ダンベル ${dbCount(v)}個`]],
  ['crunch_db', 'crunch', '胸に重りを抱える', (v, b) => [dbCount(v) > dbCount(b), `ダンベル ${dbCount(v)}個（元は ${dbCount(b)}個）`]],
  ['crunch_arms', 'crunch', '腕を体の横に置く', (v, b) => {
    const a = M.solveFrame(v, 0).b.handR.pos, c = M.solveFrame(b, 0).b.handR.pos;
    return [a[1] < c[1] - 0.10, `手の高さ ${(a[1] * 100).toFixed(0)}cm（元は ${(c[1] * 100).toFixed(0)}cm）`];
  }],
  ['plank_leg', 'plank', '片脚を上げる', (v, b) => {
    const a = lowest(v, 'footL'), c = lowest(b, 'footL');
    return [a > c + 0.08, `左足の高さ ${(a * 100).toFixed(0)}cm（元は ${(c * 100).toFixed(0)}cm）`];
  }],
  ['sideplank_leg', 'sideplank', '上の脚を上げる', (v, b) => {
    const a = lowest(v, 'footL'), c = lowest(b, 'footL');
    return [a > c + 0.06, `上の足の高さ ${(a * 100).toFixed(0)}cm（元は ${(c * 100).toFixed(0)}cm）`];
  }],
  ['bridge_one', 'bridge', '片脚で行う', (v, b) => {
    const a = lowest(v, 'footL'), c = lowest(b, 'footL');
    return [a > c + 0.08, `左足の高さ ${(a * 100).toFixed(0)}cm（元は ${(c * 100).toFixed(0)}cm）`];
  }],
  ['deadbug_half', 'deadbug', '腕か脚だけ動かす', (v, b) => {
    const a = moves(v, 'thighL.flex'), c = moves(b, 'thighL.flex');
    return [a < 5 && c > 20, `左脚の動き ${a}°（元は ${c}°）`];
  }],
  ['deadbug_db', 'deadbug', 'ダンベルを持って行う', (v, b) => [dbCount(v) === 2 && dbCount(b) === 0,
    `ダンベル ${dbCount(v)}個（元は ${dbCount(b)}個）`]],
  ['pullover_hold', 'pullover', '頭の後ろで2秒止める', (v) => [seg(v, /^頭の後ろで\d+秒止める/) >= 1.7, `止める場面 ${seg(v, /^頭の後ろで\d+秒止める/)}秒`]],
  ['pullover_shallow', 'pullover', '浅めに下ろす', (v, b) => {
    const a = range(v, 'upperarmR.flex').hi, c = range(b, 'upperarmR.flex').hi;
    return [a < c - 20, `下ろす深さ（上腕の角度） ${a.toFixed(0)}°（元は ${c.toFixed(0)}°）`];
  }],
  ['slidecurl_shallow', 'slidecurl', '浅く行う', (v, b) => {
    const a = range(v, 'shankR.flex').lo, c = range(b, 'shankR.flex').lo;
    return [a > c + 20, `一番伸ばした位置の膝屈曲 ${a.toFixed(0)}°（元は ${c.toFixed(0)}°）`];
  }],
  ['slidecurl_one', 'slidecurl', '片脚で行う', (v, b) => {
    const a = moves(v, 'shankL.flex'), c = moves(b, 'shankL.flex');
    return [a < 5 && c > 20, `左脚（膝）の動き ${a}°（元は ${c}°）`];
  }],
  ['twist_db', 'twist', 'ダンベルを持って行う', (v, b) => [dbCount(v) > dbCount(b), `ダンベル ${dbCount(v)}個（元は ${dbCount(b)}個）`]],
  ['twist_shallow', 'twist', '浅くひねる', (v, b) => {
    const a = range(v, 'spineC.rot').hi, c = range(b, 'spineC.rot').hi;
    return [a < c - 5, `ひねる角度（脊柱） ${a.toFixed(0)}°（元は ${c.toFixed(0)}°）`];
  }],
  ['calfseat_single', 'calfseat', '片脚ずつ行う', (v) => {
    const Tv = T(v);
    let rHi = -9, rLo = 9, lHi = -9, lLo = 9;
    for (let i = 0; i <= 40; i++) {
      const fr = M.solveFrame(v, Tv * i / 40);
      const rh = M.at(fr, 'footR', M.FOOT.heel)[1], lh = M.at(fr, 'footL', M.FOOT.heel)[1];
      rHi = Math.max(rHi, rh); rLo = Math.min(rLo, rh);
      lHi = Math.max(lHi, lh); lLo = Math.min(lLo, lh);
    }
    const rMove = rHi - rLo, lMove = lHi - lLo;
    return [rMove > 0.03 && lMove < 0.01,
      `右かかとの動き ${(rMove * 100).toFixed(1)}cm / 左かかとの動き ${(lMove * 100).toFixed(1)}cm`];
  }]
];

let ng = 0;
CHECKS.forEach(([id, baseId, label, fn]) => {
  const v = M.motions[id], b = M.motions[baseId];
  if (!v) { console.log('NG  ' + id + ' … 動きが無い'); ng++; return; }
  let ok, detail;
  try { [ok, detail] = fn(v, b); } catch (e) { ok = false; detail = 'エラー ' + e.message; }
  if (!ok) ng++;
  console.log((ok ? 'OK  ' : 'NG  ') + (baseId + '（' + label + '）').padEnd(30) + ' … ' + detail);
});
console.log('\n名前どおりになっていない組み方: ' + ng + ' 件');
