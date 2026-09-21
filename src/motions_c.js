/* ============================================================
   種目ごとの動き（フロアプレス / 腕立て / プランク / クランチ / デッドバグ / サイドプランク）
   床に寝る・支える種目なので balance は使わず、anchor で骨盤や肩甲骨を床の高さに固定する。
   座標系: X=前(体の正面) Y=上 Z=右。pelvis.pitch=-90で仰向け(胸が上)、+90でうつ伏せ(胸が下)、
   pelvis.roll=90で右側を下にした横向きになる（このリグでの実測に基づく規約）。
   ============================================================ */
(function (root) {
  'use strict';
  const M = root.MOTION;
  const FOOT = M.FOOT, HAND = M.HAND;
  const sole = [0, -FOOT.ankleH, 0];

  /* 仰向け・膝を立てた状態で床につく足（フロアプレス・クランチ共通） */
  const hookFoot = (z) => ({
    at: [0.50, 0, z], local: sole, yaw: 0, pitch: 0,
    pins: [FOOT.heel, FOOT.ball], pole: [0, 1, 0.5 * Math.sign(z)]
  });

  /* うつ伏せでつま先（母趾球）だけが床につく足（プランク用。腕立ては直伸ばしFKで別途扱う） */
  const toeFoot = (x, z) => ({
    at: [x, 0.045, z], local: FOOT.ball, yaw: 0, pitch: -60,
    pins: [FOOT.ball], pole: [0, -1, 0.15 * Math.sign(z)]
  });

  /* ---------------- ダンベルフロアプレス ---------------- */
  M.register({
    id: 'floorpress',
    view: { az: 12, el: 16, dist: 3.2, target: [0.15, 0.2, 0] },
    phases: [
      { t: 0, label: '肘を床につけた位置' }, { t: 1.0, label: '押し上げる 1秒' },
      { t: 2.0, label: '下ろす 3秒' }
    ],
    feet: { R: hookFoot(0.13), L: hookFoot(-0.13) },
    dumbbells: [{ grip: 'handR', kg: 5 }, { grip: 'handL', kg: 5 }],
    base: {
      'pelvis.y': 0.135, 'pelvis.pitch': -90, 'pelvis.x': 0, 'pelvis.z': 0,
      'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 2, 'head.flex': 0,
      'forearmR.rot': 0, 'forearmL.rot': 0, 'handR.flex': 0, 'handL.flex': 0
    },
    keys: [
      { t: 0.0, hold: true, d: { 'upperarmR.flex': -15, 'upperarmR.abd': 45, 'upperarmL.flex': -15, 'upperarmL.abd': 45,
                                 'forearmR.flex': 95, 'forearmL.flex': 95 } },
      { t: 1.0, hold: true, d: { 'upperarmR.flex': 90, 'upperarmR.abd': 27, 'upperarmL.flex': 90, 'upperarmL.abd': 27,
                                 'forearmR.flex': 6, 'forearmL.flex': 6 } },
      { t: 2.0, d: { 'upperarmR.flex': 30, 'upperarmR.abd': 38, 'upperarmL.flex': 30, 'upperarmL.abd': 38,
                     'forearmR.flex': 50, 'forearmL.flex': 50 } },
      { t: 5.0, hold: true, d: { 'upperarmR.flex': -15, 'upperarmR.abd': 45, 'upperarmL.flex': -15, 'upperarmL.abd': 45,
                                 'forearmR.flex': 95, 'forearmL.flex': 95 } }
    ]
  });

  /* ---------------- 腕立て伏せ ----------------
     頭からかかとまで完全な直線（脚は伸ばしたままFK、膝を曲げない）。
     つま先を床に固定したまま、骨盤の位置と pitch を一緒に動かして剛体棒のように
     つま先を支点に体全体を起こし下ろしする。肘の曲げ伸ばしだけで胸が上下する。 */
  M.register({
    id: 'pushup',
    view: { az: 8, el: 7, dist: 3.6, target: [-0.4, 0.3, 0] },
    phases: [
      { t: 0, label: '下ろす 3秒' }, { t: 3.0, label: '押し上げる 1秒' }
    ],
    hands: {
      R: { at: [0.15, 0, 0.30], local: HAND.palmSurf, align: 'surface', normal: [0, -1, 0],
           pins: [HAND.palmSurf], pole: [-1, -0.1, 0.8] },
      L: { at: [0.15, 0, -0.30], local: HAND.palmSurf, align: 'surface', normal: [0, -1, 0],
           pins: [HAND.palmSurf], pole: [-1, -0.1, -0.8] }
    },
    contacts: [
      { name: 'toeR', bone: 'footR', local: FOOT.ball, weight: 1 },
      { name: 'toeL', bone: 'footL', local: FOOT.ball, weight: 1 }
    ],
    base: {
      'pelvis.z': 0, 'toesR.flex': 78, 'toesL.flex': 78,
      'thighR.flex': 0, 'shankR.flex': 0, 'thighL.flex': 0, 'shankL.flex': 0,
      'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': -8, 'head.flex': -4
    },
    keys: [
      { t: 0.0, hold: true, d: { 'pelvis.x': -0.394, 'pelvis.y': 0.376, 'pelvis.pitch': 78 } },
      { t: 1.5, d: { 'pelvis.x': -0.383, 'pelvis.y': 0.344, 'pelvis.pitch': 80 } },
      { t: 3.0, hold: true, d: { 'pelvis.x': -0.345, 'pelvis.y': 0.180, 'pelvis.pitch': 90 } },
      { t: 4.0, hold: true, d: { 'pelvis.x': -0.394, 'pelvis.y': 0.376, 'pelvis.pitch': 78 } }
    ]
  });

  /* ---------------- プランク（正しい姿勢 ⇄ 腰が落ちる崩れ） ----------------
     正しい側は脚をほぼ伸ばしたまま（pitch=86 で頭〜かかとが一直線）。
     崩れ側は骨盤を下げて腰椎・胸椎を伸展させ、手足は固定のまま脚のIKだけ追従する。 */
  M.register({
    id: 'plank',
    view: { az: 8, el: 7, dist: 3.6, target: [-0.4, 0.2, 0] },
    phases: [
      { t: 0, label: '正しい姿勢' }, { t: 2.5, label: '崩れていく' },
      { t: 3.5, label: '崩れた姿勢（腰が落ちる）', wrong: true }, { t: 4.5, label: '正しい姿勢に戻す' }
    ],
    feet: { R: toeFoot(-1.30, 0.11), L: toeFoot(-1.30, -0.11) },
    hands: {
      R: { at: [0.44, 0, 0.18], local: HAND.palmSurf, align: 'surface', normal: [0, -1, 0],
           pins: [HAND.palmSurf], pole: [-1, 0, 0.2] },
      L: { at: [0.44, 0, -0.18], local: HAND.palmSurf, align: 'surface', normal: [0, -1, 0],
           pins: [HAND.palmSurf], pole: [-1, 0, -0.2] }
    },
    base: {
      'pelvis.x': -0.357, 'pelvis.z': 0, 'pelvis.y': 0.310, 'pelvis.pitch': 86,
      'neck.flex': -6, 'head.flex': -4, 'toesR.flex': 78, 'toesL.flex': 78,
      'forearmR.rot': 90, 'forearmL.rot': 90
    },
    keys: [
      { t: 0.0, hold: true, d: { 'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'pelvis.y': 0.310, 'pelvis.pitch': 86 } },
      { t: 2.5, hold: true, d: { 'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'pelvis.y': 0.310, 'pelvis.pitch': 86 } },
      { t: 3.0, d: { 'spineL.flex': -7, 'spineT.flex': -4, 'spineC.flex': -1.5, 'pelvis.y': 0.264, 'pelvis.pitch': 88 } },
      { t: 3.5, hold: true, d: { 'spineL.flex': -14, 'spineT.flex': -8, 'spineC.flex': -3, 'pelvis.y': 0.220, 'pelvis.pitch': 90 } },
      { t: 4.5, hold: true, d: { 'spineL.flex': -14, 'spineT.flex': -8, 'spineC.flex': -3, 'pelvis.y': 0.220, 'pelvis.pitch': 90 } },
      { t: 5.0, d: { 'spineL.flex': -7, 'spineT.flex': -4, 'spineC.flex': -1.5, 'pelvis.y': 0.264, 'pelvis.pitch': 88 } },
      { t: 6.0, hold: true, d: { 'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'pelvis.y': 0.310, 'pelvis.pitch': 86 } }
    ]
  });

  /* ---------------- 腹筋クランチ ---------------- */
  M.register({
    id: 'crunch',
    view: { az: 12, el: 16, dist: 3.2, target: [0.15, 0.2, 0] },
    phases: [
      { t: 0, label: '肩甲骨を浮かせる 1.5秒' }, { t: 1.5, label: '戻す 2.5秒' }
    ],
    feet: { R: hookFoot(0.13), L: hookFoot(-0.13) },
    base: {
      'pelvis.y': 0.135, 'pelvis.pitch': -90, 'pelvis.x': 0, 'pelvis.z': 0,
      'forearmR.rot': 60, 'forearmL.rot': 60
    },
    keys: [
      { t: 0.0, hold: true, d: {
          'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 4, 'head.flex': 0,
          'upperarmR.flex': 96, 'upperarmR.abd': 16, 'upperarmL.flex': 96, 'upperarmL.abd': 16,
          'forearmR.flex': 112, 'forearmL.flex': 112 } },
      { t: 1.5, hold: true, d: {
          'spineL.flex': 2, 'spineT.flex': 18, 'spineC.flex': 16, 'neck.flex': -6, 'head.flex': -4,
          'upperarmR.flex': 100, 'upperarmR.abd': 18, 'upperarmL.flex': 100, 'upperarmL.abd': 18,
          'forearmR.flex': 116, 'forearmL.flex': 116 } },
      { t: 4.0, hold: true, d: {
          'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 4, 'head.flex': 0,
          'upperarmR.flex': 96, 'upperarmR.abd': 16, 'upperarmL.flex': 96, 'upperarmL.abd': 16,
          'forearmR.flex': 112, 'forearmL.flex': 112 } }
    ]
  });

  /* ---------------- デッドバグ ---------------- */
  /* 両腕は天井へ、股関節と膝は90度。右腕+左脚 → 戻す → 左腕+右脚 → 戻す、で1周期。 */
  M.register({
    id: 'deadbug',
    view: { az: 12, el: 16, dist: 3.3, target: [0.15, 0.35, 0] },
    phases: [
      { t: 0, label: '股関節と膝を90度に' }, { t: 2.0, label: '右腕と左脚を伸ばす' },
      { t: 4.0, label: '戻す' }, { t: 6.0, label: '左腕と右脚を伸ばす' }
    ],
    base: {
      'pelvis.y': 0.135, 'pelvis.pitch': -90, 'pelvis.x': 0, 'pelvis.z': 0,
      'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 4, 'head.flex': 0,
      'upperarmR.flex': 90, 'upperarmR.abd': 6, 'forearmR.flex': 2, 'forearmR.rot': 90,
      'upperarmL.flex': 90, 'upperarmL.abd': 6, 'forearmL.flex': 2, 'forearmL.rot': 90,
      'thighR.flex': 90, 'thighR.abd': 8, 'shankR.flex': 90,
      'thighL.flex': 90, 'thighL.abd': 8, 'shankL.flex': 90
    },
    keys: [
      { t: 0.0, hold: true, d: {} },
      { t: 1.8, d: { 'upperarmR.flex': 172, 'thighL.flex': 22, 'thighL.abd': 4, 'shankL.flex': 8 } },
      { t: 2.2, hold: true, d: { 'upperarmR.flex': 172, 'thighL.flex': 22, 'thighL.abd': 4, 'shankL.flex': 8 } },
      { t: 4.0, hold: true, d: {} },
      { t: 5.8, d: { 'upperarmL.flex': 172, 'thighR.flex': 22, 'thighR.abd': 4, 'shankR.flex': 8 } },
      { t: 6.2, hold: true, d: { 'upperarmL.flex': 172, 'thighR.flex': 22, 'thighR.abd': 4, 'shankR.flex': 8 } },
      { t: 8.0, hold: true, d: {} }
    ]
  });

  /* ---------------- サイドプランク（正しい姿勢 ⇄ 腰が落ちる崩れ） ---------------- */
  /* pelvis.roll=90 で右側が下。右前腕と右足の外側で支え、頭〜足を一直線に持ち上げる
     （右脚は flex=0/abd≈23 のほぼ伸ばしたままで一直線を作る）。左手は腰、左脚は少し浮かせて前にずらす。 */
  M.register({
    id: 'sideplank',
    view: { az: 88, el: 10, dist: 3.4, target: [0, 0.22, -0.2] },
    phases: [
      { t: 0, label: '正しい姿勢' }, { t: 2.0, label: '崩れていく' },
      { t: 3.0, label: '崩れた姿勢（腰が落ちる）', wrong: true }, { t: 4.0, label: '正しい姿勢に戻す' }
    ],
    /* 下側の前腕の裏を床に固定する。肘は肩の真下、前腕は前方（+X）に伸びる */
    anchor: { bone: 'forearmR', local: [0.043, -0.13, 0], at: [0.13, 0, 0] },
    contacts: [
      /* 前腕を回した向きに合わせて、床に着く側（手のひら側）の点を取る */
      { name: 'elbowR', bone: 'forearmR', local: [0.043, -0.02, 0] },
      { name: 'wristR', bone: 'forearmR', local: [0.040, -0.24, 0] },
      { name: 'footR', bone: 'footR', local: [0.06, -0.02, 0.045] }
    ],
    base: {
      'pelvis.roll': 74.7, 'pelvis.pitch': 0, 'pelvis.yaw': 0,
      'upperarmR.abd': 90, 'upperarmR.flex': 0, 'upperarmR.rot': 0,
      'forearmR.flex': 90, 'forearmR.rot': 180, 'handR.flex': 0,
      'upperarmL.flex': 8, 'upperarmL.abd': 26, 'forearmL.flex': 96, 'forearmL.rot': 80, 'handL.flex': 0,
      'thighR.flex': 0, 'thighR.abd': 0, 'shankR.flex': 2, 'footR.flex': -12, 'footR.abd': 10,
      'thighL.flex': 0, 'thighL.abd': -3, 'shankL.flex': 2, 'footL.flex': -12,
      'spineL.abd': 0, 'spineT.abd': 0, 'spineC.abd': 0, 'neck.abd': 0
    },
    keys: [
      { t: 0.0, hold: true, d: { 'spineL.abd': 0, 'spineT.abd': 0, 'neck.abd': 0,
                                 'thighR.abd': 0, 'thighL.abd': -3 } },
      { t: 2.0, hold: true, d: { 'spineL.abd': 0, 'spineT.abd': 0, 'neck.abd': 0,
                                 'thighR.abd': 0, 'thighL.abd': -3 } },
      { t: 3.0, hold: true, d: { 'spineL.abd': -12, 'spineT.abd': -7.2, 'neck.abd': -4,
                                 'thighR.abd': -12, 'thighL.abd': 9 } },
      { t: 4.0, hold: true, d: { 'spineL.abd': -12, 'spineT.abd': -7.2, 'neck.abd': -4,
                                 'thighR.abd': -12, 'thighL.abd': 9 } },
      { t: 5.0, hold: true, d: { 'spineL.abd': 0, 'spineT.abd': 0, 'neck.abd': 0,
                                 'thighR.abd': 0, 'thighL.abd': -3 } }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
