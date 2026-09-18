/* ============================================================
   種目ごとの動き
   ドライバは度・メートル。balance 指定のある種目では pelvis.x は
   重心と支持面の釣り合いで自動的に決まるのでキーに書かない。
   t は秒。最後のキーは最初のキーと同じ値にして輪にする。
   ============================================================ */
(function (root) {
  'use strict';
  const M = root.MOTION;
  const FOOT = M.FOOT, HAND = M.HAND;
  const sole = [0, -FOOT.ankleH, 0];              /* 足首の真下の接地点 */

  /* 床に平らに置いた足 */
  const flatFoot = (x, z, yaw) => ({
    at: [x, 0, z], local: sole, yaw: yaw, pitch: 0,
    pins: [FOOT.heel, FOOT.ball]
  });

  /* 胸の前で両手にダンベルを抱える（ゴブレット持ち） */
  const gobletHands = {
    R: { at: { bone: 'spineC', local: [0.210, 0.060, 0.052] }, local: HAND.palm, pitch: 158, yaw: -25,
         pole: [0.05, -1, 0.14] },
    L: { at: { bone: 'spineC', local: [0.210, 0.060, -0.052] }, local: HAND.palm, pitch: 158, yaw: 25,
         pole: [0.05, -1, -0.14] }
  };

  /* ---------------- ゴブレットスクワット ---------------- */
  M.register({
    id: 'goblet',
    view: { az: 36, el: 8 },
    phases: [
      { t: 0, label: '立つ' }, { t: 0.5, label: '下ろす 3秒' }, { t: 3.5, label: '一番下' },
      { t: 4.1, label: '立ち上がる' }, { t: 5.0, label: '立つ' }
    ],
    feet: { R: flatFoot(0, 0.17, 16), L: flatFoot(0, -0.17, -16) },
    hands: gobletHands,
    dumbbells: [{ grip: 'both', axis: 'bone', bone: 'spineC', kg: 5, local: HAND.grip, offset: [0.01, 0.075, 0] }],
    balance: { axes: ['x'] },
    base: {
      'pelvis.y': 0.955, 'pelvis.pitch': 4,
      'spineL.flex': 0, 'spineT.flex': 3, 'spineC.flex': 2, 'neck.flex': -2, 'head.flex': 0
    },
    keys: [
      { t: 0.0, hold: true, d: { 'pelvis.y': 0.955, 'pelvis.pitch': 4, 'neck.flex': -2 } },
      { t: 0.5, d: { 'pelvis.y': 0.925, 'pelvis.pitch': 7, 'neck.flex': -3 } },
      { t: 1.3, d: { 'pelvis.y': 0.830, 'pelvis.pitch': 14, 'neck.flex': -6 } },
      { t: 2.2, d: { 'pelvis.y': 0.690, 'pelvis.pitch': 22, 'neck.flex': -10 } },
      { t: 3.5, hold: true, d: { 'pelvis.y': 0.520, 'pelvis.pitch': 30, 'spineT.flex': 5, 'neck.flex': -14 } },
      { t: 4.1, hold: true, d: { 'pelvis.y': 0.520, 'pelvis.pitch': 30, 'spineT.flex': 5, 'neck.flex': -14 } },
      { t: 4.6, d: { 'pelvis.y': 0.700, 'pelvis.pitch': 26, 'neck.flex': -11 } },
      { t: 5.0, d: { 'pelvis.y': 0.870, 'pelvis.pitch': 12, 'neck.flex': -5 } },
      { t: 5.3, hold: true, d: { 'pelvis.y': 0.955, 'pelvis.pitch': 4, 'neck.flex': -2 } }
    ]
  });

  /* ---------------- ワンハンドロウ ---------------- */
  /* 椅子（座面45cm）に左手と左膝、右足は床。右手でダンベルを引く */
  const CHAIR = { type: 'box', id: 'chair', min: [-0.06, 0, -0.70], max: [0.56, 0.45, -0.22], label: '椅子' };
  M.register({
    id: 'row',
    view: { az: -28, el: 16 },
    props: [CHAIR],
    phases: [
      { t: 0, label: '下で伸ばす' }, { t: 0.4, label: '肘を引き上げる 1秒' },
      { t: 1.4, label: '上で1秒' }, { t: 2.4, label: '下ろす 3秒' }, { t: 5.4, label: '下で伸ばす' }
    ],
    /* 左膝を座面に固定し、そこから骨盤の位置が決まる */
    anchor: { bone: 'shankL', local: [0.075, 0, 0], at: [0.10, 0.45, -0.26] },
    feet: { R: { at: [-0.24, 0, 0.14], local: sole, yaw: 6, pins: [FOOT.heel, FOOT.ball] } },
    hands: { L: { at: [0.46, 0.45, -0.31], local: HAND.palmSurf, align: 'surface', normal: [0, -1, 0],
                  pins: [HAND.palmSurf], pole: [-1, -0.3, 0.3] } },
    dumbbells: [{ grip: 'handR', kg: 5 }],
    contacts: [{ name: 'kneeL', bone: 'shankL', local: [0.075, 0, 0], weight: 1 },
                { name: 'shinL', bone: 'shankL', local: [0.055, -0.20, 0], weight: 0.5 }],
    base: {
      'pelvis.y': 0.80, 'pelvis.x': -0.02, 'pelvis.z': -0.11, 'pelvis.pitch': 76, 'pelvis.yaw': -5, 'pelvis.roll': -5,
      'spineL.flex': -4, 'spineT.flex': -3, 'spineC.flex': -2, 'spineC.rot': 0, 'neck.flex': -14, 'head.flex': -6,
      'thighL.flex': 121, 'thighL.abd': -7, 'thighL.rot': 5, 'shankL.flex': 135,
      'footL.flex': -34, 'toesL.flex': 2,
      'clavR.prot': 6, 'clavR.elev': -4,
      'upperarmR.flex': 67, 'upperarmR.abd': 1, 'upperarmR.rot': 4,
      'forearmR.flex': 6, 'forearmR.rot': 82, 'handR.flex': 0
    },
    keys: [
      { t: 0.0, hold: true, d: { 'upperarmR.flex': 67, 'upperarmR.abd': 1, 'upperarmR.rot': 4, 'forearmR.flex': 6,
                                 'clavR.prot': 12, 'clavR.elev': 3, 'spineC.rot': 4 } },
      { t: 0.9, d: { 'upperarmR.flex': 45, 'upperarmR.abd': 3, 'upperarmR.rot': 8, 'forearmR.flex': 56,
                     'clavR.prot': 2, 'clavR.elev': 0, 'spineC.rot': 1 } },
      { t: 1.4, hold: true, d: { 'upperarmR.flex': 9, 'upperarmR.abd': 7, 'upperarmR.rot': 16,
                                 'forearmR.flex': 112, 'clavR.prot': -10, 'clavR.elev': -5, 'spineC.rot': -2 } },
      { t: 2.4, hold: true, d: { 'upperarmR.flex': 9, 'upperarmR.abd': 7, 'upperarmR.rot': 16,
                                 'forearmR.flex': 112, 'clavR.prot': -10, 'clavR.elev': -5, 'spineC.rot': -2 } },
      { t: 3.6, d: { 'upperarmR.flex': 48, 'upperarmR.abd': 3, 'upperarmR.rot': 8, 'forearmR.flex': 52,
                     'clavR.prot': 2, 'clavR.elev': 0, 'spineC.rot': 1 } },
      { t: 5.4, hold: true, d: { 'upperarmR.flex': 67, 'upperarmR.abd': 1, 'upperarmR.rot': 4, 'forearmR.flex': 6,
                                 'clavR.prot': 12, 'clavR.elev': 3, 'spineC.rot': 4 } }
    ]
  });

  /* ---------------- カーフレイズ ---------------- */
  /* 段差（高さ18cm）のふちに母趾球、かかとは空中 */
  const STEP = { type: 'box', id: 'step', min: [0, 0, -0.42], max: [0.40, 0.18, 0.42], label: '段差' };
  const calfFoot = (z) => ({
    at: [0.01, 0.18, z], local: FOOT.ball, pitch: 'footPitch', yaw: 0,
    pins: [FOOT.ball]
  });
  M.register({
    id: 'calf',
    view: { az: 24, el: 8 },
    props: [STEP],
    phases: [
      { t: 0, label: 'かかとを下げる' }, { t: 0.6, label: '上げる 1秒' }, { t: 1.6, label: '一番上で2秒' },
      { t: 3.6, label: '下ろす 3秒' }, { t: 6.6, label: 'かかとを下げきる' }
    ],
    feet: { R: calfFoot(0.10), L: calfFoot(-0.10) },
    dumbbells: [{ grip: 'handR', kg: 5 }],
    balance: { axes: ['x'] },
    base: {
      'pelvis.y': 1.049, 'pelvis.pitch': 2,
      'spineT.flex': 2, 'neck.flex': 0,
      'upperarmR.flex': 2, 'upperarmR.abd': 4, 'forearmR.flex': 4, 'forearmR.rot': 86,
      'upperarmL.flex': 6, 'upperarmL.abd': -7, 'forearmL.flex': 12, 'forearmL.rot': 84, 'handL.flex': -4,
      footPitch: 22, 'toesR.flex': -22, 'toesL.flex': -22
    },
    keys: [
      { t: 0.0, hold: true, d: { footPitch: 22, 'toesR.flex': -22, 'toesL.flex': -22, 'pelvis.y': 1.049 } },
      { t: 0.6, d: { footPitch: 8, 'toesR.flex': -8, 'toesL.flex': -8, 'pelvis.y': 1.085 } },
      { t: 1.6, hold: true, d: { footPitch: -36, 'toesR.flex': 36, 'toesL.flex': 36, 'pelvis.y': 1.170 } },
      { t: 3.6, hold: true, d: { footPitch: -36, 'toesR.flex': 36, 'toesL.flex': 36, 'pelvis.y': 1.170 } },
      { t: 4.8, d: { footPitch: -6, 'toesR.flex': 6, 'toesL.flex': 6, 'pelvis.y': 1.119 } },
      { t: 6.6, hold: true, d: { footPitch: 22, 'toesR.flex': -22, 'toesL.flex': -22, 'pelvis.y': 1.049 } }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
