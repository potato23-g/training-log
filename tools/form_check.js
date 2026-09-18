/* フォーム適合チェック: アプリの解説文（DETAIL/EX の setup・how・rom）に書いてある内容どおりに
   3Dの動きがなっているかを数値で確かめる。使い方: cd tools && bun form_check.js [種目id...]
   角度の定義: 股関節屈曲=体幹と大腿のなす角の補角、膝屈曲=まっすぐ0、肩外転90=上腕が床と平行 */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd']) { try { await import('../src/motions_' + f + '.js'); } catch (e) {} }
const M = globalThis.MOTION, V = M.V;
const DEG = 180 / Math.PI;

const dir = (fr, b) => V.norm(V.sub(fr.b[b].tip, fr.b[b].pos));
const angWith = (a, b) => Math.acos(Math.max(-1, Math.min(1, V.dot(V.norm(a), V.norm(b))))) * DEG;
const fromHoriz = (d) => Math.asin(Math.max(-1, Math.min(1, d[1]))) * DEG;   /* 水平からの角度。+は上向き */
const ang3 = (a, b, c) => angWith(V.sub(a, b), V.sub(c, b));                  /* b を頂点とする角 */

/* 時刻の探し方: extremes で「一番下」「一番上」などを見つける */
function findT(m, score) {
  const T = M.cycleTime(m);
  let best = null;
  for (let i = 0; i <= 80; i++) {
    const t = T * i / 80, fr = M.solveFrame(m, t), v = score(fr);
    if (best === null || v > best.v) best = { v, t, fr };
  }
  return best;
}
function at(m, t) { return M.solveFrame(m, t); }

const CHECKS = {
  goblet: (m) => {
    const bottom = findT(m, (fr) => -fr.b.pelvis.pos[1]);                     /* 骨盤が一番低い */
    const thigh = fromHoriz(dir(bottom.fr, 'thighR'));
    const heel = M.at(bottom.fr, 'footR', M.FOOT.heel)[1];
    const elbowIn = bottom.fr.b.forearmR.pos[2] - bottom.fr.b.upperarmR.pos[2];
    return [
      ['一番下で太ももが床と平行かそれ以下', `太ももの傾き ${thigh.toFixed(0)}°（0=平行、負=お尻が下）`, thigh <= 5],
      ['かかとが浮かない', `かかとの高さ ${(heel * 100).toFixed(1)}cm`, heel < 0.02],
      ['肘は体の内側に落とす（外に開かない）', `肘は肩より内側に ${(-elbowIn * 100).toFixed(0)}cm`, elbowIn < 0.02]
    ];
  },
  rdl: (m) => {
    const T = M.cycleTime(m);
    let kmin = 999, kmax = -999, deepest = findT(m, (fr) => -fr.b.handR.pos[1]);
    for (let i = 0; i <= 60; i++) {
      const k = M.boneAngles(at(m, T * i / 60).pose, 'shankR').flex;
      kmin = Math.min(kmin, k); kmax = Math.max(kmax, k);
    }
    const torso = fromHoriz(dir(deepest.fr, 'spineT'));
    const hand = deepest.fr.b.handR.pos, knee = deepest.fr.b.shankR.pos;
    const gap = Math.hypot(hand[0] - knee[0], hand[2] - knee[2]);
    return [
      ['膝の角度は10〜15度で固定（変えない）', `膝屈曲 ${kmin.toFixed(0)}〜${kmax.toFixed(0)}°`, kmax - kmin <= 6 && kmin >= 5 && kmax <= 22],
      ['一番下でも背中は丸めない（体幹はほぼ一直線）', `体幹の傾き ${torso.toFixed(0)}°`, torso > 5 && torso < 60],
      ['ダンベルは脚のすぐ前をこする', `手と膝の水平距離 ${(gap * 100).toFixed(0)}cm`, gap < 0.25]
    ];
  },
  split: (m) => {
    const bottom = findT(m, (fr) => -fr.b.pelvis.pos[1]);
    const rearKnee = bottom.fr.b.shankL.pos[1];
    const frontKnee = M.boneAngles(bottom.fr.pose, 'shankR').flex;
    const torso = fromHoriz(dir(bottom.fr, 'spineT'));
    return [
      ['一番下で後ろの膝が床に近づく', `後ろ膝の高さ ${(rearKnee * 100).toFixed(0)}cm`, rearKnee < 0.30],
      ['前脚の膝は深く曲がる', `前膝の屈曲 ${frontKnee.toFixed(0)}°`, frontKnee > 80],
      ['上体はやや前傾（倒しすぎない）', `体幹の傾き ${torso.toFixed(0)}°（90=直立）`, torso > 60 && torso < 88]
    ];
  },
  hipthrust: (m) => {
    const top = findT(m, (fr) => fr.b.pelvis.pos[1]);
    const sh = top.fr.b.upperarmR.pos, hip = top.fr.b.thighR.pos, knee = top.fr.b.shankR.pos;
    const line = ang3(sh, hip, knee);
    const kneeAng = M.boneAngles(top.fr.pose, 'shankR').flex;
    return [
      ['一番上で肩・腰・膝が一直線', `肩-腰-膝の角度 ${line.toFixed(0)}°（180=一直線）`, line > 160],
      ['膝は90度前後', `膝屈曲 ${kneeAng.toFixed(0)}°`, kneeAng > 70 && kneeAng < 110]
    ];
  },
  row: (m) => {
    const t0 = at(m, 0);
    const back = fromHoriz(dir(t0, 'spineT'));
    const armDown = angWith(V.sub(t0.b.handR.pos, t0.b.upperarmR.pos), [0, -1, 0]);
    const top = findT(m, (fr) => fr.b.forearmR.pos[1]);
    const elbowY = top.fr.b.forearmR.pos[1], hipY = top.fr.b.thighR.pos[1];
    const elbowOut = top.fr.b.forearmR.pos[2] - top.fr.b.upperarmR.pos[2];
    return [
      ['背中は床と平行に近い', `体幹の傾き ${back.toFixed(0)}°（0=床と平行）`, Math.abs(back) < 30],
      ['下では腕を真下に垂らす', `腕と鉛直のなす角 ${armDown.toFixed(0)}°`, armDown < 20],
      ['肘は腰の高さまで引く', `肘の高さ ${(elbowY * 100).toFixed(0)}cm / 腰 ${(hipY * 100).toFixed(0)}cm`, elbowY >= hipY - 0.08],
      ['肘は外に開かない（体側に沿わせる）', `肘は肩より外に ${(elbowOut * 100).toFixed(0)}cm`, elbowOut < 0.12]
    ];
  },
  ohp: (m) => {
    const start = at(m, 0);
    const earY = start.b.head.pos[1] + 0.06;
    const handY = start.b.handR.pos[1];
    const foreUp = angWith(V.sub(start.b.handR.pos, start.b.forearmR.pos), [0, 1, 0]);
    const top = findT(m, (fr) => fr.b.handR.pos[1]);
    const armUp = angWith(V.sub(top.fr.b.handR.pos, top.fr.b.upperarmR.pos), [0, 1, 0]);
    const elbow = M.boneAngles(top.fr.pose, 'forearmR').flex;
    const handNearEar = Math.abs(top.fr.b.handR.pos[2] - top.fr.b.head.pos[2]);
    return [
      ['構えは肩〜耳の高さ', `手の高さ ${(handY * 100).toFixed(0)}cm / 耳 ${(earY * 100).toFixed(0)}cm`, Math.abs(handY - earY) < 0.18],
      ['構えで前腕は立てる', `前腕と鉛直のなす角 ${foreUp.toFixed(0)}°`, foreUp < 25],
      ['上で肘を伸ばしきる', `肘屈曲 ${elbow.toFixed(0)}°`, elbow < 15],
      ['上で腕が耳の横に来る（真上）', `腕と鉛直のなす角 ${armUp.toFixed(0)}° / 手と頭の左右差 ${(handNearEar * 100).toFixed(0)}cm`, armUp < 20]
    ];
  },
  lateral: (m) => {
    const top = findT(m, (fr) => fr.b.handR.pos[1]);
    const abd = fromHoriz(dir(top.fr, 'upperarmR'));
    const elbow = M.boneAngles(top.fr.pose, 'forearmR').flex;
    const start = at(m, 0);
    const clav = M.boneAngles(top.fr.pose, 'clavR').abd;
    return [
      ['上げるのは肩の高さまで（上腕が床と平行）', `上腕の傾き ${abd.toFixed(0)}°（0=平行）`, Math.abs(abd) < 12],
      ['肘は10度ほど曲げて固定', `肘屈曲 ${elbow.toFixed(0)}°`, elbow > 3 && elbow < 25],
      ['肩をすくめない', `鎖骨の挙上 ${clav.toFixed(0)}°`, clav < 12]
    ];
  },
  curl: (m) => {
    const start = at(m, 0), top = findT(m, (fr) => fr.b.handR.pos[1]);
    const elbowStart = M.boneAngles(start.pose, 'forearmR').flex;
    const foreTop = fromHoriz(dir(top.fr, 'forearmR'));
    const elbowDrift = Math.abs(top.fr.b.forearmR.pos[0] - start.b.forearmR.pos[0]);
    return [
      ['下は肘を伸ばしきる', `肘屈曲 ${elbowStart.toFixed(0)}°`, elbowStart < 15],
      ['上は前腕が立つところまで（肘を体側に固定したまま巻き上げる）', `前腕の傾き ${foreTop.toFixed(0)}°（90=垂直）`, foreTop > 60 && foreTop < 110],
      ['肘は前に出ない', `肘の前後移動 ${(elbowDrift * 100).toFixed(0)}cm`, elbowDrift < 0.08]
    ];
  },
  triext: (m) => {
    const start = at(m, 0), top = findT(m, (fr) => fr.dumbbells[0].pos[1]);
    const elbowStart = M.boneAngles(start.pose, 'forearmR').flex;
    const elbowTop = M.boneAngles(top.fr.pose, 'forearmR').flex;
    const upArm = angWith(V.sub(start.b.forearmR.pos, start.b.upperarmR.pos), [0, 1, 0]);
    const elbowWide = Math.abs(start.b.forearmR.pos[2] - start.b.upperarmR.pos[2]);
    const dbBehind = start.dumbbells[0].pos[0] - start.b.head.pos[0];
    return [
      ['構えでダンベルは頭の後ろ', `ダンベルは頭より前後 ${(dbBehind * 100).toFixed(0)}cm（負=後ろ）`, dbBehind < 0],
      ['上腕は耳の横（真上）に固定', `上腕と鉛直のなす角 ${upArm.toFixed(0)}°`, upArm < 25],
      ['肘は開かない', `肘は肩より外に ${(elbowWide * 100).toFixed(0)}cm`, elbowWide < 0.16],
      ['上で肘を伸ばしきる', `肘屈曲 ${elbowTop.toFixed(0)}°`, elbowTop < 20]
    ];
  },
  floorpress: (m) => {
    const bottom = findT(m, (fr) => -fr.b.handR.pos[1]);
    const torsoDown = V.mul(dir(bottom.fr, 'spineT'), -1);        /* 体幹の足側 */
    const armDir = V.sub(bottom.fr.b.forearmR.pos, bottom.fr.b.upperarmR.pos);
    const flare = angWith(armDir, torsoDown);
    const elbowY = bottom.fr.b.forearmR.pos[1];
    const top = findT(m, (fr) => fr.b.handR.pos[1]);
    const elbowTop = M.boneAngles(top.fr.pose, 'forearmR').flex;
    return [
      ['上腕は体幹から45度くらい', `体幹とのなす角 ${flare.toFixed(0)}°`, flare > 30 && flare < 65],
      ['肘が床につくまで下ろす', `肘の高さ ${(elbowY * 100).toFixed(0)}cm`, elbowY < 0.16],
      ['上で肘を伸ばす', `肘屈曲 ${elbowTop.toFixed(0)}°`, elbowTop < 20]
    ];
  },
  pushup: (m) => {
    const bottom = findT(m, (fr) => -fr.b.spineT.pos[1]);
    const chest = bottom.fr.b.spineT.pos[1] - 0.125;
    const line = ang3(bottom.fr.b.head.pos, bottom.fr.b.pelvis.pos, bottom.fr.b.footR.pos);
    const torsoDown = V.mul(dir(bottom.fr, 'spineT'), -1);
    const flare = angWith(V.sub(bottom.fr.b.forearmR.pos, bottom.fr.b.upperarmR.pos), torsoDown);
    return [
      ['胸が床から拳一つ分まで下りる', `胸の下端 ${(chest * 100).toFixed(0)}cm`, chest < 0.14],
      ['頭からかかとまで一直線', `頭-骨盤-足の角度 ${line.toFixed(0)}°`, line > 160],
      ['肘を真横に開かない', `体幹とのなす角 ${flare.toFixed(0)}°`, flare < 75]
    ];
  },
  plank: (m) => {
    const fr = at(m, 0);
    const under = Math.hypot(fr.b.forearmR.pos[0] - fr.b.upperarmR.pos[0], fr.b.forearmR.pos[2] - fr.b.upperarmR.pos[2]);
    const line = ang3(fr.b.head.pos, fr.b.pelvis.pos, fr.b.footR.pos);
    return [
      ['肘は肩の真下', `肘と肩の水平差 ${(under * 100).toFixed(0)}cm`, under < 0.08],
      ['頭からかかとまで一直線', `頭-骨盤-足の角度 ${line.toFixed(0)}°`, line > 160]
    ];
  },
  sideplank: (m) => {
    const fr = at(m, 0);
    const under = Math.hypot(fr.b.forearmR.pos[0] - fr.b.upperarmR.pos[0], fr.b.forearmR.pos[2] - fr.b.upperarmR.pos[2]);
    const line = ang3(fr.b.head.pos, fr.b.pelvis.pos, fr.b.footR.pos);
    return [
      ['肘は肩の真下', `肘と肩の水平差 ${(under * 100).toFixed(0)}cm`, under < 0.10],
      ['頭から足まで一直線', `頭-骨盤-足の角度 ${line.toFixed(0)}°`, line > 155]
    ];
  },
  deadbug: (m) => {
    const fr = at(m, 0);
    const hip = M.boneAngles(fr.pose, 'thighR').flex, knee = M.boneAngles(fr.pose, 'shankR').flex;
    const armUp = angWith(V.sub(fr.b.handR.pos, fr.b.upperarmR.pos), [0, 1, 0]);
    const T = M.cycleTime(m);
    let lowBack = 0;
    for (let i = 0; i <= 40; i++) { const f = at(m, T * i / 40); lowBack = Math.max(lowBack, f.b.spineL.pos[1]); }
    return [
      ['構えは股関節・膝とも90度', `股関節 ${hip.toFixed(0)}° / 膝 ${knee.toFixed(0)}°`, Math.abs(hip - 90) < 20 && Math.abs(knee - 90) < 20],
      ['腕は天井に伸ばす', `腕と鉛直のなす角 ${armUp.toFixed(0)}°`, armUp < 25],
      ['腰は床から浮かせない', `腰の高さの最大 ${(lowBack * 100).toFixed(0)}cm`, lowBack < 0.22]
    ];
  },
  crunch: (m) => {
    const top = findT(m, (fr) => fr.b.spineC.pos[1]);
    const start = at(m, 0);
    const lift = top.fr.b.spineC.pos[1] - start.b.spineC.pos[1];
    const pelvisMove = Math.abs(top.fr.b.pelvis.pos[1] - start.b.pelvis.pos[1]);
    return [
      ['肩甲骨が床から離れるところまで', `胸郭の持ち上がり ${(lift * 100).toFixed(0)}cm`, lift > 0.04 && lift < 0.25],
      ['腰は床につけたまま', `骨盤の上下 ${(pelvisMove * 100).toFixed(0)}cm`, pelvisMove < 0.05]
    ];
  },
  calf: (m) => {
    const T = M.cycleTime(m);
    let lo = 9, hi = -9;
    for (let i = 0; i <= 60; i++) { const y = at(m, T * i / 60).b.footR.pos[1]; lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const stepTop = 0.18;
    return [
      ['かかとは段差より下まで下がる', `足首の最低 ${(lo * 100).toFixed(0)}cm（段差の上面 ${(stepTop * 100).toFixed(0)}cm）`, lo < stepTop + 0.075],
      ['上は限界まで背伸びする', `足首の可動 ${((hi - lo) * 100).toFixed(0)}cm`, hi - lo > 0.06]
    ];
  },
  farmer: (m) => {
    const fr = at(m, 0);
    const clav = M.boneAngles(fr.pose, 'clavR').abd;
    const torso = fromHoriz(dir(fr, 'spineT'));
    const armDown = angWith(V.sub(fr.b.handR.pos, fr.b.upperarmR.pos), [0, -1, 0]);
    return [
      ['肩をすくめず下げたまま', `鎖骨の挙上 ${clav.toFixed(0)}°`, clav < 2],
      ['前傾しない', `体幹の傾き ${torso.toFixed(0)}°（90=直立）`, torso > 82],
      ['腕は体の横に垂らす', `腕と鉛直のなす角 ${armDown.toFixed(0)}°`, armDown < 20]
    ];
  },
  rdl1: (m) => {
    const deepest = findT(m, (fr) => -fr.b.handR.pos[1]);
    const back = fromHoriz(dir(deepest.fr, 'spineT'));
    const freeLeg = deepest.fr.b.shankL.pos[1];
    const stanceKnee = M.boneAngles(deepest.fr.pose, 'shankR').flex;
    return [
      ['上体と後ろ脚が一直線に近づく', `体幹の傾き ${back.toFixed(0)}°（0=床と平行）`, Math.abs(back) < 35],
      ['後ろ脚は上がる', `後ろ膝の高さ ${(freeLeg * 100).toFixed(0)}cm`, freeLeg > 0.35],
      ['支持脚の膝は軽く曲げたまま', `膝屈曲 ${stanceKnee.toFixed(0)}°`, stanceKnee >= 5 && stanceKnee <= 30]
    ];
  }
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHECKS);
let ng = 0;
for (const id of ids) {
  const m = M.motions[id];
  if (!m || !CHECKS[id]) { console.log('== ' + id + ' : 検査なし'); continue; }
  console.log('== ' + id);
  CHECKS[id](m).forEach(([name, detail, ok]) => {
    if (!ok) ng++;
    console.log('   ' + (ok ? 'OK  ' : 'NG  ') + name + ' … ' + detail);
  });
}
console.log('\n合わない項目: ' + ng + ' 件');
