/* フォーム適合チェック: アプリの解説文（DETAIL/EX の setup・how・rom）に書いてある内容どおりに
   3Dの動きがなっているかを数値で確かめる。使い方: cd tools && bun form_check.js [種目id...]
   角度の定義: 股関節屈曲=体幹と大腿のなす角の補角、膝屈曲=まっすぐ0、肩外転90=上腕が床と平行 */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd', 'e']) { try { await import('../src/motions_' + f + '.js'); } catch (e) {} }
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
      ['肘は体の内側に落とす（外に開かない）', `肘は肩より内側に ${(-elbowIn * 100).toFixed(0)}cm`, elbowIn < 0.02],
      /* ACE: "the hips are below the knees" */
      ['一番下で股関節が膝より下（ACE）', `股関節 ${(bottom.fr.b.thighR.pos[1] * 100).toFixed(0)}cm / 膝 ${(bottom.fr.b.shankR.pos[1] * 100).toFixed(0)}cm`,
        bottom.fr.b.thighR.pos[1] <= bottom.fr.b.shankR.pos[1] + 0.02]
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
      ['ダンベルは脚のすぐ前をこする', `手と膝の水平距離 ${(gap * 100).toFixed(0)}cm`, gap < 0.25],
      /* NASM: "typically at mid-shin height or slightly above" */
      ['一番下でダンベルは膝より下（NASMの目安はすね半ば。解説文は「膝下まで下りない人も珍しくない」）',
        `手の高さ ${(hand[1] * 100).toFixed(0)}cm / 膝 ${(knee[1] * 100).toFixed(0)}cm`, hand[1] < knee[1] + 0.02]
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
      ['膝は90度前後', `膝屈曲 ${kneeAng.toFixed(0)}°`, kneeAng > 70 && kneeAng < 110],
      /* ACE: "hips are fully extended" */
      ['一番上で股関節を伸ばしきる（ACE "hips are fully extended"。この骨格では165°前後が限界）', `肩-腰-膝 ${line.toFixed(0)}°`, line > 163]
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
      ['肘は外に開かない（体側に沿わせる）', `肘は肩より外に ${(elbowOut * 100).toFixed(0)}cm`, elbowOut < 0.12],
      /* ACE: "placed directly under your shoulder" / "directly under your hips" */
      ['支える手は肩の真下（ACE）', `手と肩の水平差 ${(Math.hypot(t0.b.handL.pos[0] - t0.b.upperarmL.pos[0], t0.b.handL.pos[2] - t0.b.upperarmL.pos[2]) * 100).toFixed(0)}cm`,
        Math.hypot(t0.b.handL.pos[0] - t0.b.upperarmL.pos[0], t0.b.handL.pos[2] - t0.b.upperarmL.pos[2]) < 0.18],
      ['支える膝は股関節の真下（ACE）', `膝と股関節の水平差 ${(Math.hypot(t0.b.shankL.pos[0] - t0.b.thighL.pos[0], t0.b.shankL.pos[2] - t0.b.thighL.pos[2]) * 100).toFixed(0)}cm`,
        Math.hypot(t0.b.shankL.pos[0] - t0.b.thighL.pos[0], t0.b.shankL.pos[2] - t0.b.thighL.pos[2]) <= 0.19]
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
      ['上で腕が耳の横に来る（真上）', `腕と鉛直のなす角 ${armUp.toFixed(0)}° / 手と頭の左右差 ${(handNearEar * 100).toFixed(0)}cm`, armUp < 20],
      /* ACE: "keep your elbows pointed in front of you" */
      ['構えで肘は体の前を向く（ACE）', `肘の向き ${(() => { const d = V.sub(start.b.forearmR.pos, start.b.upperarmR.pos); return (Math.atan2(Math.abs(d[2]), d[0]) * DEG).toFixed(0); })()}°（0=真正面、90=真横）`,
        (() => { const d = V.sub(start.b.forearmR.pos, start.b.upperarmR.pos); return Math.atan2(Math.abs(d[2]), d[0]) * DEG < 62; })()]
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
      ['上腕は耳の横（真上）に固定（ACE "keep your upper arms vertical"）', `上腕と鉛直のなす角 ${upArm.toFixed(0)}°`, upArm < 15],
      ['肘は開かない', `肘は肩より外に ${(elbowWide * 100).toFixed(0)}cm`, elbowWide < 0.16],
      ['上で肘を伸ばしきる（完全にロックはしない）', `肘屈曲 ${elbowTop.toFixed(0)}°`, elbowTop < 20],
      /* ACE: "a 90 degree bend or until your upper arms begin to move backwards" */
      ['下ろすのは肘90度くらいまで（ACE）', `構えの肘屈曲 ${elbowStart.toFixed(0)}°`, elbowStart > 80 && elbowStart < 110]
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
      ['肘は体幹から45度くらい（NASM）', `体幹とのなす角 ${flare.toFixed(0)}°`, flare > 28 && flare < 62]
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
      ['腰は床につけたまま', `骨盤の上下 ${(pelvisMove * 100).toFixed(0)}cm`, pelvisMove < 0.05],
      /* ACE: heels 12-18 inches (30-46cm) from the tailbone */
      ['かかとは尾骨から30〜46cm（ACE）', `${(V.dist(M.at(start, 'footR', M.FOOT.heel), start.b.pelvis.pos) * 100).toFixed(0)}cm`,
        (() => { const d = V.dist(M.at(start, 'footR', M.FOOT.heel), start.b.pelvis.pos); return d > 0.28 && d < 0.50; })()]
    ];
  },
  calf: (m) => {
    const T = M.cycleTime(m);
    let lo = 9, hi = -9;
    for (let i = 0; i <= 60; i++) { const y = at(m, T * i / 60).b.footR.pos[1]; lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const stepTop = 0.18;
    return [
      ['かかとは段差より下まで下がる', `足首の最低 ${(lo * 100).toFixed(0)}cm（段差の上面 ${(stepTop * 100).toFixed(0)}cm）`, lo < stepTop + 0.075],
      ['上は限界まで背伸びする', `足首の可動 ${((hi - lo) * 100).toFixed(0)}cm`, hi - lo > 0.06],
      /* NASM: "straight knees" */
      ['膝は伸ばしたまま（NASM）', `膝屈曲 ${M.boneAngles(at(m, 0).pose, 'shankR').flex.toFixed(0)}°`,
        M.boneAngles(at(m, 0).pose, 'shankR').flex < 12]
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
      ['支持脚の膝は軽く曲げたまま', `膝屈曲 ${stanceKnee.toFixed(0)}°`, stanceKnee >= 5 && stanceKnee <= 30],
      /* ACE: "straightening the leg directly behind the body" */
      ['後ろ脚はまっすぐ伸ばす（ACE）', `後ろ膝の屈曲 ${M.boneAngles(deepest.fr.pose, 'shankL').flex.toFixed(0)}°`,
        M.boneAngles(deepest.fr.pose, 'shankL').flex < 35],
      ['後ろ脚は体幹と一直線に近い（ACE）', `体幹と後ろ腿のなす角 ${(180 - ang3(deepest.fr.b.spineC.tip, deepest.fr.b.pelvis.pos, deepest.fr.b.shankL.pos)).toFixed(0)}°ずれ`,
        ang3(deepest.fr.b.spineC.tip, deepest.fr.b.pelvis.pos, deepest.fr.b.shankL.pos) > 140]
    ];
  },

  /* ============ 追加種目 ============ */
  sumo: (m) => {
    const bottom = findT(m, (fr) => -fr.b.pelvis.pos[1]);
    const thigh = fromHoriz(dir(bottom.fr, 'thighR'));
    const heel = M.at(bottom.fr, 'footR', M.FOOT.heel)[1];
    const stance = Math.abs(bottom.fr.b.footR.pos[2] - bottom.fr.b.footL.pos[2]);
    const shoulder = Math.abs(bottom.fr.b.upperarmR.pos[2] - bottom.fr.b.upperarmL.pos[2]);
    const toeOut = Math.abs(M.at(bottom.fr, 'footR', M.FOOT.ball)[2] - M.at(bottom.fr, 'footR', M.FOOT.heel)[2]);
    return [
      ['一番下で太ももが床と平行（ワイドなので厳密な平行までは求めない）', `太ももの傾き ${thigh.toFixed(0)}°（0=平行）`, Math.abs(thigh) <= 12],
      ['一番下で股関節が膝と同じ高さ以下（ゴブレットと同じ基準）', `股関節 ${(bottom.fr.b.thighR.pos[1] * 100).toFixed(0)}cm / 膝 ${(bottom.fr.b.shankR.pos[1] * 100).toFixed(0)}cm`,
        bottom.fr.b.thighR.pos[1] <= bottom.fr.b.shankR.pos[1] + 0.02],
      ['かかとが浮かない', `かかとの高さ ${(heel * 100).toFixed(1)}cm`, heel < 0.02],
      ['足幅は肩幅より広い（解説文「肩幅の1.5倍」）', `足幅 ${(stance * 100).toFixed(0)}cm / 肩幅 ${(shoulder * 100).toFixed(0)}cm`, stance > shoulder * 1.2],
      ['つま先を外へ向ける', `つま先の横ずれ ${(toeOut * 100).toFixed(1)}cm`, toeOut > 0.04]
    ];
  },
  splitfloor: (m) => {
    const bottom = findT(m, (fr) => -fr.b.pelvis.pos[1]);
    const rearKnee = bottom.fr.b.shankL.pos[1];
    const rearHeel = M.at(bottom.fr, 'footL', M.FOOT.heel)[1];
    const frontKnee = M.boneAngles(bottom.fr.pose, 'shankR').flex;
    const torso = fromHoriz(dir(bottom.fr, 'spineT'));
    return [
      ['一番下で後ろの膝が床に近づく', `後ろ膝の高さ ${(rearKnee * 100).toFixed(0)}cm`, rearKnee < 0.30],
      ['後ろのかかとは上げたまま', `後ろかかとの高さ ${(rearHeel * 100).toFixed(0)}cm`, rearHeel > 0.06],
      ['前脚の膝は深く曲がる', `前膝の屈曲 ${frontKnee.toFixed(0)}°`, frontKnee > 80],
      ['上体はやや前傾（倒しすぎない）', `体幹の傾き ${torso.toFixed(0)}°（90=直立）`, torso > 60 && torso < 88]
    ];
  },
  bridge: (m) => {
    const top = findT(m, (fr) => fr.b.pelvis.pos[1]);
    const sh = top.fr.b.upperarmR.pos, hip = top.fr.b.thighR.pos, knee = top.fr.b.shankR.pos;
    const line = ang3(sh, hip, knee);
    const kneeAng = M.boneAngles(top.fr.pose, 'shankR').flex;
    return [
      ['一番上で肩・腰・膝が一直線に近づく（肩が床にあるぶん、この骨格では150°前後が限界）',
        `肩-腰-膝 ${line.toFixed(0)}°（180=一直線）`, line > 148],
      ['膝は90度前後', `膝屈曲 ${kneeAng.toFixed(0)}°`, kneeAng > 70 && kneeAng < 115],
      ['肩は床につけたまま', `肩の高さ ${(sh[1] * 100).toFixed(0)}cm`, sh[1] < 0.32]
    ];
  },
  pushupknee: (m) => {
    const bottom = findT(m, (fr) => -fr.b.spineC.pos[1]);
    const line = ang3(bottom.fr.b.neck.pos, bottom.fr.b.pelvis.pos, bottom.fr.b.shankR.pos);
    const chest = bottom.fr.b.spineC.pos[1];
    const knee = bottom.fr.b.shankR.pos[1];
    const top = findT(m, (fr) => fr.b.spineC.pos[1]);
    const elbowTop = M.boneAngles(top.fr.pose, 'forearmR').flex;
    const elbowBottom = M.boneAngles(bottom.fr.pose, 'forearmR').flex;
    return [
      ['頭から膝までが一直線', `首-腰-膝 ${line.toFixed(0)}°（180=一直線）`, line > 160],
      ['胸が床に近づくまで下ろす', `胸の高さ ${(chest * 100).toFixed(0)}cm`, chest < 0.34],
      ['膝は床についたまま', `膝の高さ ${(knee * 100).toFixed(1)}cm`, knee < 0.10],
      ['上では肘が伸びる（腕立てと同じく、体を支える腕は完全には伸びきらない）', `肘屈曲 上${elbowTop.toFixed(0)}° / 下${elbowBottom.toFixed(0)}°`, elbowBottom - elbowTop > 30]
    ];
  },
  fly: (m) => {
    const T = M.cycleTime(m);
    let minE = 999, maxE = -999, openY = 999, closeGap = 999;
    for (let i = 0; i <= 60; i++) {
      const fr = at(m, T * i / 60), e = M.boneAngles(fr.pose, 'forearmR').flex;
      minE = Math.min(minE, e); maxE = Math.max(maxE, e);
      openY = Math.min(openY, fr.b.forearmR.pos[1]);
      closeGap = Math.min(closeGap, Math.abs(fr.b.handR.pos[2] - fr.b.handL.pos[2]));
    }
    return [
      ['肘の角度は固定したまま（伸ばしきらない）', `肘屈曲 ${minE.toFixed(0)}〜${maxE.toFixed(0)}°`, maxE - minE < 12 && minE > 12],
      ['上腕が床につくまで開く', `開いたときの肘の高さ ${(openY * 100).toFixed(0)}cm`, openY < 0.22],
      ['閉じたとき両手が胸の上で近づく', `両手の間隔 ${(closeGap * 100).toFixed(0)}cm`, closeGap < 0.30]
    ];
  },
  skull: (m) => {
    const T = M.cycleTime(m);
    let maxTilt = 0, deepest = 0, straight = 999;
    for (let i = 0; i <= 60; i++) {
      const fr = at(m, T * i / 60);
      maxTilt = Math.max(maxTilt, angWith(V.sub(fr.b.forearmR.pos, fr.b.upperarmR.pos), [0, 1, 0]));
      const e = M.boneAngles(fr.pose, 'forearmR').flex;
      deepest = Math.max(deepest, e); straight = Math.min(straight, e);
    }
    return [
      ['上腕は床に垂直のまま（肘の位置を動かさない）', `上腕の傾き 最大${maxTilt.toFixed(0)}°（0=垂直）`, maxTilt < 22],
      ['耳の横まで下ろす（肘を深く曲げる）', `肘屈曲 ${deepest.toFixed(0)}°`, deepest > 70],
      ['最後は肘を伸ばす', `肘屈曲 ${straight.toFixed(0)}°`, straight < 20]
    ];
  },
  front: (m) => {
    const top = findT(m, (fr) => fr.b.handR.pos[1]);
    const armH = fromHoriz(dir(top.fr, 'upperarmR'));
    const handVsShoulder = top.fr.b.handR.pos[1] - top.fr.b.upperarmR.pos[1];
    const T = M.cycleTime(m);
    let minE = 999, maxE = -999, lean = 0;
    for (let i = 0; i <= 60; i++) {
      const fr = at(m, T * i / 60);
      const e = M.boneAngles(fr.pose, 'forearmR').flex;
      minE = Math.min(minE, e); maxE = Math.max(maxE, e);
      lean = Math.max(lean, Math.abs(90 - fromHoriz(dir(fr, 'spineT'))));
    }
    return [
      ['肩の高さまで（それ以上上げない）', `上腕の傾き ${armH.toFixed(0)}°（0=水平）`, armH > -8 && armH < 14],
      ['手は肩の高さ付近まで', `手と肩の高さの差 ${(handVsShoulder * 100).toFixed(0)}cm`, Math.abs(handVsShoulder) < 0.14],
      ['肘の角度は固定したまま', `肘屈曲 ${minE.toFixed(0)}〜${maxE.toFixed(0)}°`, maxE - minE < 12],
      ['反動で腰を反らせない', `体幹の傾きの振れ ${lean.toFixed(0)}°`, lean < 8]
    ];
  },
  shrug: (m) => {
    const T = M.cycleTime(m);
    let lo = 999, hi = -999, side = 0, maxE = 0, handOut = 0;
    const sh0 = at(m, 0).b.upperarmR.pos, hand0 = at(m, 0).b.handR.pos;
    for (let i = 0; i <= 60; i++) {
      const fr = at(m, T * i / 60), sh = fr.b.upperarmR.pos;
      lo = Math.min(lo, sh[1]); hi = Math.max(hi, sh[1]);
      side = Math.max(side, Math.hypot(sh[0] - sh0[0], sh[2] - sh0[2]));
      maxE = Math.max(maxE, M.boneAngles(fr.pose, 'forearmR').flex);
      handOut = Math.max(handOut, Math.abs(fr.b.handR.pos[2] - hand0[2]));
    }
    return [
      ['肩がはっきり上がる', `肩の上下 ${((hi - lo) * 100).toFixed(1)}cm`, hi - lo > 0.02],
      ['肩をまっすぐ上下させる（回さない）', `前後左右のずれ ${(side * 100).toFixed(1)}cm`, side < 0.04],
      ['腕は伸ばしたまま（肘で引かない）', `肘屈曲 最大${maxE.toFixed(0)}°`, maxE < 20],
      ['腕は体の横に垂らしたまま（外へ開かない）', `手の横ずれ ${(handOut * 100).toFixed(1)}cm`, handOut < 0.04]
    ];
  },
  row2: (m) => {
    const T = M.cycleTime(m);
    let loT = 999, hiT = -999, minE = 999, maxE = -999;
    for (let i = 0; i <= 60; i++) {
      const fr = at(m, T * i / 60), tor = fromHoriz(dir(fr, 'spineT'));
      loT = Math.min(loT, tor); hiT = Math.max(hiT, tor);
      const e = M.boneAngles(fr.pose, 'forearmR').flex;
      minE = Math.min(minE, e); maxE = Math.max(maxE, e);
    }
    const top = findT(m, (fr) => M.boneAngles(fr.pose, 'forearmR').flex);
    const elbowBack = top.fr.b.forearmR.pos[0] - top.fr.b.upperarmR.pos[0];
    const back = fromHoriz(dir(at(m, 0), 'spineT'));
    return [
      ['上体の角度を保つ（起き上がってこない）', `体幹の傾き ${loT.toFixed(0)}〜${hiT.toFixed(0)}°`, hiT - loT < 8],
      ['上体は床と平行に近い', `体幹の傾き ${back.toFixed(0)}°（0=床と平行）`, Math.abs(back) < 35],
      ['下では腕が垂れる', `肘屈曲 ${minE.toFixed(0)}°`, minE < 20],
      ['肘を腰の方向へ引き上げる', `肘は肩より後ろへ ${(elbowBack * 100).toFixed(0)}cm`, elbowBack < -0.02 && maxE > 100]
    ];
  },
  calfseat: (m) => {
    const T = M.cycleTime(m);
    let loHeel = 9, hiHeel = -9, kneeMin = 999, kneeMax = -999, kneeMove = 0;
    const knee0 = at(m, 0).b.shankR.pos;
    for (let i = 0; i <= 40; i++) {
      const fr = at(m, T * i / 40);
      const heel = M.at(fr, 'footR', M.FOOT.heel)[1];
      loHeel = Math.min(loHeel, heel); hiHeel = Math.max(hiHeel, heel);
      const k = M.boneAngles(fr.pose, 'shankR').flex;
      kneeMin = Math.min(kneeMin, k); kneeMax = Math.max(kneeMax, k);
      kneeMove = Math.max(kneeMove, Math.abs(fr.b.shankR.pos[0] - knee0[0]));
    }
    return [
      ['膝は90度前後で座る', `膝屈曲 ${kneeMin.toFixed(0)}〜${kneeMax.toFixed(0)}°`, kneeMin > 60 && kneeMax < 120],
      ['かかとが下がりきってから上がりきる', `かかとの高さ ${(loHeel * 100).toFixed(0)}〜${(hiHeel * 100).toFixed(0)}cm`,
        loHeel < 0.06 && hiHeel > 0.08],
      ['膝の位置は前後に動かさない', `膝の前後移動 ${(kneeMove * 100).toFixed(1)}cm`, kneeMove < 0.05]
    ];
  },
  sidebend: (m) => {
    const T = M.cycleTime(m);
    let lean = 0, side = 0, dbLo = 9, dbHi = -9, hip = 0;
    const hip0 = at(m, 0).b.pelvis.pos;
    for (let i = 0; i <= 40; i++) {
      const fr = at(m, T * i / 40);
      const up = dir(fr, 'spineT');
      lean = Math.max(lean, Math.abs(Math.atan2(up[0], up[1]) * DEG));      /* 前後の傾き */
      side = Math.max(side, Math.abs(Math.atan2(up[2], up[1]) * DEG));      /* 左右の傾き */
      dbLo = Math.min(dbLo, fr.b.handR.pos[1]); dbHi = Math.max(dbHi, fr.b.handR.pos[1]);
      hip = Math.max(hip, V.dist(fr.b.pelvis.pos, hip0));
    }
    return [
      ['真横に倒す（前後に傾かない）', `前後の傾き ${lean.toFixed(0)}° / 左右の傾き ${side.toFixed(0)}°`, lean < 10 && side > 20],
      ['ダンベルが体の横を下りる', `手の高さ ${(dbLo * 100).toFixed(0)}〜${(dbHi * 100).toFixed(0)}cm`, dbHi - dbLo > 0.15],
      ['骨盤は動かさない', `骨盤の移動 ${(hip * 100).toFixed(1)}cm`, hip < 0.05]
    ];
  },
  sidelunge: (m) => {
    const bottom = findT(m, (fr) => -fr.b.pelvis.pos[1]);
    const bend = M.boneAngles(bottom.fr.pose, 'shankR').flex;
    const straight = M.boneAngles(bottom.fr.pose, 'shankL').flex;
    const heelR = M.at(bottom.fr, 'footR', M.FOOT.heel)[1];
    const heelL = M.at(bottom.fr, 'footL', M.FOOT.heel)[1];
    const stance = Math.abs(bottom.fr.b.footR.pos[2] - bottom.fr.b.footL.pos[2]);
    const shift = bottom.fr.b.pelvis.pos[2];
    return [
      ['沈む側の膝はしっかり曲げる', `膝屈曲 ${bend.toFixed(0)}°`, bend > 55],
      ['反対の脚は伸ばしたまま', `反対の膝屈曲 ${straight.toFixed(0)}°`, straight < 35],
      ['両足のかかとは床につけたまま', `かかとの高さ 右${(heelR * 100).toFixed(1)}cm / 左${(heelL * 100).toFixed(1)}cm`,
        heelR < 0.02 && heelL < 0.02],
      ['体重を片側へ移す', `足幅 ${(stance * 100).toFixed(0)}cm / 腰の移動 ${(shift * 100).toFixed(0)}cm`,
        stance > 0.40 && shift > 0.08]
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
