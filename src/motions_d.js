/* ============================================================
   担当分の動作定義（d）: rdl / rdl1 / split / hipthrust
   ドライバは度・メートル。t は秒、最後のキーは最初と同じ値にして輪にする。
   ============================================================ */
(function (root) {
  'use strict';
  const M = root.MOTION;
  const FOOT = M.FOOT, HAND = M.HAND;
  const sole = [0, -FOOT.ankleH, 0];

  /* 床に平らに置いた足（motions.js と同じ定義） */
  const flatFoot = (x, z, yaw) => ({
    at: [x, 0, z], local: sole, yaw: yaw, pitch: 0,
    pins: [FOOT.heel, FOOT.ball]
  });
  /* 片脚立ち用: 支持面に前後だけでなく左右の広がりも持たせる（踵・母趾球 × 内外側4点） */
  const wideFoot = (x, z, yaw) => ({
    at: [x, 0, z], local: sole, yaw: yaw, pitch: 0,
    pins: [
      [FOOT.heel[0], FOOT.heel[1], 0.035], [FOOT.heel[0], FOOT.heel[1], -0.035],
      [FOOT.ball[0], FOOT.ball[1], 0.035], [FOOT.ball[0], FOOT.ball[1], -0.035]
    ]
  });

  /* ---------------- ルーマニアンデッドリフト（両脚） ---------------- */
  M.register({
    id: 'rdl',
    view: { az: 62, el: 10, dist: 3.4, target: [-0.05, 0.70, 0] },
    phases: [
      { t: 0, label: '立つ' }, { t: 0.4, label: '股関節を折る 3秒' }, { t: 3.4, label: '深く倒す' },
      { t: 3.9, label: '戻す' }, { t: 4.9, label: '立つ' }
    ],
    feet: { R: flatFoot(0, 0.12, 5), L: flatFoot(0, -0.12, -5) },
    dumbbells: [{ grip: 'handR', kg: 5 }, { grip: 'handL', kg: 5 }],
    balance: { axes: ['x'] },
    base: {
      'spineL.flex': 0, 'spineT.flex': 1, 'spineC.flex': 2,
      'forearmR.flex': 8, 'forearmR.rot': 90, 'forearmL.flex': 8, 'forearmL.rot': 90,
      'upperarmR.abd': 3, 'upperarmL.abd': 3
    },
    keys: [
      { t: 0.0, hold: true, d: { 'pelvis.y': 0.925, 'pelvis.pitch': 5, 'upperarmR.flex': 10, 'upperarmL.flex': 10, 'neck.flex': -3 } },
      { t: 0.9, d: { 'pelvis.y': 0.900, 'pelvis.pitch': 24, 'upperarmR.flex': 29, 'upperarmL.flex': 29, 'neck.flex': -9 } },
      { t: 2.1, d: { 'pelvis.y': 0.862, 'pelvis.pitch': 52, 'upperarmR.flex': 57, 'upperarmL.flex': 57, 'neck.flex': -17 } },
      { t: 3.4, hold: true, d: { 'pelvis.y': 0.840, 'pelvis.pitch': 72, 'upperarmR.flex': 77, 'upperarmL.flex': 77, 'neck.flex': -23 } },
      { t: 4.2, d: { 'pelvis.y': 0.878, 'pelvis.pitch': 38, 'upperarmR.flex': 43, 'upperarmL.flex': 43, 'neck.flex': -12 } },
      { t: 4.9, hold: true, d: { 'pelvis.y': 0.925, 'pelvis.pitch': 5, 'upperarmR.flex': 10, 'upperarmL.flex': 10, 'neck.flex': -3 } }
    ]
  });

  /* ---------------- 片脚ルーマニアンデッドリフト ---------------- */
  /* 右脚で立つ。左脚は股関節を動かさずペルビスごと後ろへ振れることで釣り合いを取る */
  M.register({
    id: 'rdl1',
    view: { az: 55, el: 11, dist: 3.3, target: [-0.05, 0.68, 0] },
    phases: [
      { t: 0, label: '立つ' }, { t: 0.4, label: '股関節を折る 3秒' }, { t: 3.4, label: '深く倒す' },
      { t: 3.9, label: '戻す' }, { t: 4.9, label: '立つ' }
    ],
    feet: { R: wideFoot(0, 0, 0) },
    dumbbells: [{ grip: 'handR', kg: 5 }, { grip: 'handL', kg: 5 }],
    balance: { axes: ['x', 'z'] },
    base: {
      'spineL.flex': 0, 'spineT.flex': 1, 'spineC.flex': 2,
      'forearmR.flex': 8, 'forearmR.rot': 90, 'forearmL.flex': 8, 'forearmL.rot': 90,
      'upperarmR.abd': 3, 'upperarmL.abd': 3, 'thighL.abd': 2
    },
    /* 自由脚（左）: 股関節・膝を大きめに曲げて浮かせておき、骨盤の前傾が深くなるほど
       後方へ伸びて釣り合いを取る（股関節の相対角はむしろ緩める） */
    keys: [
      { t: 0.0, hold: true, d: { 'pelvis.y': 0.928, 'pelvis.pitch': 5, 'upperarmR.flex': 10, 'upperarmL.flex': 10, 'neck.flex': -3,
                                 'thighL.flex': -15, 'shankL.flex': 35, 'footL.flex': 12, 'toesL.flex': 15 } },
      { t: 0.9, d: { 'pelvis.y': 0.904, 'pelvis.pitch': 24, 'upperarmR.flex': 29, 'upperarmL.flex': 29, 'neck.flex': -9,
                     'thighL.flex': -12, 'shankL.flex': 27, 'footL.flex': 5, 'toesL.flex': 8 } },
      { t: 2.1, d: { 'pelvis.y': 0.868, 'pelvis.pitch': 52, 'upperarmR.flex': 57, 'upperarmL.flex': 57, 'neck.flex': -17,
                     'thighL.flex': -8, 'shankL.flex': 16, 'footL.flex': -5, 'toesL.flex': -1 } },
      { t: 3.4, hold: true, d: { 'pelvis.y': 0.846, 'pelvis.pitch': 72, 'upperarmR.flex': 77, 'upperarmL.flex': 77, 'neck.flex': -23,
                                 'thighL.flex': -5, 'shankL.flex': 8, 'footL.flex': -12, 'toesL.flex': -8 } },
      { t: 4.2, d: { 'pelvis.y': 0.882, 'pelvis.pitch': 38, 'upperarmR.flex': 43, 'upperarmL.flex': 43, 'neck.flex': -12,
                     'thighL.flex': -10, 'shankL.flex': 22, 'footL.flex': 0, 'toesL.flex': 4 } },
      { t: 4.9, hold: true, d: { 'pelvis.y': 0.928, 'pelvis.pitch': 5, 'upperarmR.flex': 10, 'upperarmL.flex': 10, 'neck.flex': -3,
                                 'thighL.flex': -15, 'shankL.flex': 35, 'footL.flex': 12, 'toesL.flex': 15 } }
    ]
  });

  /* ---------------- ブルガリアンスクワット ---------------- */
  /* 後ろ足（左）の甲を高さ30cmのベッドに乗せる。前足（右）は床。両手にダンベル */
  const BED_SPLIT = { type: 'box', id: 'bed', min: [-0.75, 0, -0.20], max: [-0.32, 0.30, 0.24], label: 'ベッド' };
  M.register({
    id: 'split',
    view: { az: 28, el: 10, dist: 3.4, target: [0.0, 0.72, 0] },
    props: [BED_SPLIT],
    phases: [
      { t: 0, label: '立つ' }, { t: 0.5, label: '沈む 2.5秒' }, { t: 3.0, label: '一番下' },
      { t: 3.5, label: '戻す 1秒' }, { t: 4.5, label: '立つ' }
    ],
    /* 後ろ足（左）: 甲の先寄り（つま先の付け根）をベッド上面に乗せる。しゃがむほど
       股関節と足首の相対角が変わるので pitch はキーごとに変える（骨盤が沈むほど深く: -40°→-88°） */
    feet: {
      R: flatFoot(0.45, 0.09, 6),
      L: { at: [-0.35, 0.32, -0.08], local: [0.135, -0.03, 0], pitch: 'splitBackPitch', yaw: 0, pole: [1, -0.85, 0], pins: [[0.135, -0.03, 0]] }
    },
    dumbbells: [{ grip: 'handR', kg: 5 }, { grip: 'handL', kg: 5 }],
    base: {
      'pelvis.x': 0.15, 'pelvis.z': 0,
      'spineT.flex': 1, 'spineC.flex': 2, 'neck.flex': -3,
      'upperarmR.flex': 10, 'upperarmR.abd': 5, 'forearmR.flex': 6, 'forearmR.rot': 90,
      'upperarmL.flex': 10, 'upperarmL.abd': 5, 'forearmL.flex': 6, 'forearmL.rot': 90,
      'toesL.flex': 75
    },
    keys: [
      { t: 0.0, hold: true, d: { 'pelvis.y': 0.895, 'pelvis.pitch': 10, splitBackPitch: -40 } },
      { t: 0.5, d: { 'pelvis.y': 0.845, 'pelvis.pitch': 11, splitBackPitch: -49 } },
      { t: 0.9, d: { 'pelvis.y': 0.800, 'pelvis.pitch': 12, splitBackPitch: -56 } },
      { t: 2.0, d: { 'pelvis.y': 0.680, 'pelvis.pitch': 15, splitBackPitch: -76 } },
      { t: 3.0, hold: true, d: { 'pelvis.y': 0.610, 'pelvis.pitch': 17, splitBackPitch: -88 } },
      { t: 3.3, d: { 'pelvis.y': 0.665, 'pelvis.pitch': 16, splitBackPitch: -78 } },
      { t: 3.6, d: { 'pelvis.y': 0.715, 'pelvis.pitch': 14, splitBackPitch: -70 } },
      { t: 3.9, d: { 'pelvis.y': 0.780, 'pelvis.pitch': 12, splitBackPitch: -60 } },
      { t: 4.2, d: { 'pelvis.y': 0.830, 'pelvis.pitch': 11, splitBackPitch: -51 } },
      { t: 4.5, hold: true, d: { 'pelvis.y': 0.895, 'pelvis.pitch': 10, splitBackPitch: -40 } }
    ]
  });

  /* ---------------- ヒップスラスト ---------------- */
  /* 肩甲骨を高さ30cmのベッドの縁に当てる。足は床。ダンベルは骨盤の上を両手で支える */
  const BED_HIP = { type: 'box', id: 'bed', min: [-0.65, 0, -0.16], max: [-0.15, 0.30, 0.16], label: 'ベッド' };
  M.register({
    id: 'hipthrust',
    view: { az: 18, el: 9, dist: 3.2, target: [-0.15, 0.35, 0] },
    props: [BED_HIP],
    anchor: { bone: 'spineT', local: [-0.1, 0, 0], at: [-0.15, 0.30, 0] },
    phases: [
      { t: 0, label: '下ろす' }, { t: 0.3, label: '持ち上げる 1秒' }, { t: 1.3, label: '上で2秒' },
      { t: 3.3, label: '下ろす 2秒' }, { t: 5.3, label: '下ろす' }
    ],
    feet: { R: flatFoot(0.65, 0.11, 4), L: flatFoot(0.65, -0.11, -4) },
    hands: {
      R: { at: { bone: 'pelvis', local: [0.16, 0.17, 0.085] }, local: HAND.palm, pitch: 60, yaw: -30, pole: [-0.87, -0.5, 0.15] },
      L: { at: { bone: 'pelvis', local: [0.16, 0.17, -0.085] }, local: HAND.palm, pitch: 60, yaw: 30, pole: [-0.87, -0.5, -0.15] }
    },
    dumbbells: [{ grip: 'both', kg: 5, local: HAND.grip }],
    contacts: [{ name: 'scap', bone: 'spineT', local: [-0.1, 0, 0], weight: 1 }],
    base: {
      'spineL.flex': 2, 'spineT.flex': 0, 'spineC.flex': 0
    },
    keys: [
      { t: 0.0, hold: true, d: { 'pelvis.pitch': -30, 'neck.flex': 8, 'head.flex': 4 } },
      { t: 1.0, d: { 'pelvis.pitch': -75, 'neck.flex': 16, 'head.flex': 8 } },
      { t: 1.3, hold: true, d: { 'pelvis.pitch': -90, 'neck.flex': 18, 'head.flex': 9 } },
      { t: 3.3, hold: true, d: { 'pelvis.pitch': -90, 'neck.flex': 18, 'head.flex': 9 } },
      { t: 4.6, d: { 'pelvis.pitch': -52, 'neck.flex': 11, 'head.flex': 5 } },
      { t: 5.3, hold: true, d: { 'pelvis.pitch': -30, 'neck.flex': 8, 'head.flex': 4 } }
    ]
  });
})(typeof window !== "undefined" ? window : globalThis);
