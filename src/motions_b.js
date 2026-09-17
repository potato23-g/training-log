/* 担当分の動作定義（b） */
(function (root) {
  const M = root.MOTION;
  const FOOT = M.FOOT, HAND = M.HAND;
  const sole = [0, -FOOT.ankleH, 0];

  /* 床に平らに置いた足（立位共通） */
  const flatFoot = (x, z, yaw) => ({
    at: [x, 0, z], local: sole, yaw: yaw, pitch: 0,
    pins: [FOOT.heel, FOOT.ball]
  });
  const standFeet = { R: flatFoot(0, 0.13, 8), L: flatFoot(0, -0.13, -8) };

  /* ---------------- ダンベルショルダープレス ---------------- */
  M.register({
    id: 'ohp',
    view: { az: 56, el: 9, dist: 3.3, target: [0, 1.05, 0] },
    phases: [
      { t: 0, label: '肩の高さで構える' }, { t: 1.0, label: '押し上げる 1秒' },
      { t: 1.3, label: '上で伸ばしきる' }, { t: 4.3, label: '下ろす 3秒' }
    ],
    feet: standFeet,
    dumbbells: [{ grip: 'handR', kg: 5 }, { grip: 'handL', kg: 5 }],
    balance: { axes: ['x'] },
    base: {
      'pelvis.y': 0.95, 'pelvis.pitch': 0,
      'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0,
      'clavR.prot': 0, 'clavL.prot': 0,
      'upperarmR.rot': -65, 'upperarmL.rot': -65,
      'forearmR.rot': 0, 'forearmL.rot': 0,
      'handR.flex': -8, 'handL.flex': -8
    },
    keys: [
      { t: 0.0, hold: true, d: {
          'clavR.elev': 0, 'clavL.elev': 0,
          'upperarmR.flex': 15, 'upperarmR.abd': 80, 'upperarmL.flex': 15, 'upperarmL.abd': 80,
          'forearmR.flex': 140, 'forearmL.flex': 140
      } },
      { t: 1.0, d: {
          'clavR.elev': 12, 'clavL.elev': 12,
          'upperarmR.flex': 165, 'upperarmR.abd': 12, 'upperarmL.flex': 165, 'upperarmL.abd': 12,
          'forearmR.flex': 10, 'forearmL.flex': 10
      } },
      { t: 1.3, hold: true, d: {
          'clavR.elev': 12, 'clavL.elev': 12,
          'upperarmR.flex': 165, 'upperarmR.abd': 12, 'upperarmL.flex': 165, 'upperarmL.abd': 12,
          'forearmR.flex': 10, 'forearmL.flex': 10
      } },
      { t: 4.3, hold: true, d: {
          'clavR.elev': 0, 'clavL.elev': 0,
          'upperarmR.flex': 15, 'upperarmR.abd': 80, 'upperarmL.flex': 15, 'upperarmL.abd': 80,
          'forearmR.flex': 140, 'forearmL.flex': 140
      } }
    ]
  });

  /* ---------------- サイドレイズ ---------------- */
  M.register({
    id: 'lateral',
    view: { az: 56, el: 9, dist: 3.5, target: [0, 1.05, 0] },
    phases: [
      { t: 0, label: '体の横' }, { t: 1.2, label: '上げる 1〜2秒' },
      { t: 1.5, label: '肩の高さで止める' }, { t: 5.5, label: '下ろす 3〜5秒' }
    ],
    feet: standFeet,
    dumbbells: [{ grip: 'handR', kg: 5 }, { grip: 'handL', kg: 5 }],
    balance: { axes: ['x'] },
    base: {
      'pelvis.y': 0.95, 'pelvis.pitch': 0,
      'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0,
      'clavR.elev': 0, 'clavL.elev': 0, 'clavR.prot': 0, 'clavL.prot': 0,
      'upperarmR.flex': 8, 'upperarmL.flex': 8, 'upperarmR.rot': 0, 'upperarmL.rot': 0,
      'forearmR.flex': 15, 'forearmL.flex': 15, 'forearmR.rot': 90, 'forearmL.rot': 90,
      'handR.flex': 0, 'handL.flex': 0
    },
    keys: [
      { t: 0.0, hold: true, d: { 'upperarmR.abd': 0, 'upperarmL.abd': 0 } },
      { t: 1.2, d: { 'upperarmR.abd': 85, 'upperarmL.abd': 85 } },
      { t: 1.5, hold: true, d: { 'upperarmR.abd': 85, 'upperarmL.abd': 85 } },
      { t: 5.5, hold: true, d: { 'upperarmR.abd': 0, 'upperarmL.abd': 0 } }
    ]
  });

  /* ---------------- ダンベルカール ---------------- */
  M.register({
    id: 'curl',
    view: { az: 56, el: 9, dist: 3.2, target: [0, 1.0, 0] },
    phases: [
      { t: 0, label: '下で伸ばしきる' }, { t: 1.3, label: '巻き上げる 1〜2秒' },
      { t: 1.6, label: '上で止める' }, { t: 5.1, label: '下ろす 3〜4秒' }
    ],
    feet: standFeet,
    dumbbells: [{ grip: 'handR', kg: 5 }, { grip: 'handL', kg: 5 }],
    balance: { axes: ['x'] },
    base: {
      'pelvis.y': 0.95, 'pelvis.pitch': 0,
      'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0,
      'clavR.elev': 0, 'clavL.elev': 0, 'clavR.prot': 0, 'clavL.prot': 0,
      'upperarmR.flex': 8, 'upperarmR.abd': -8, 'upperarmR.rot': 0,
      'upperarmL.flex': 8, 'upperarmL.abd': -8, 'upperarmL.rot': 0,
      'forearmR.rot': 85, 'forearmL.rot': 85,
      'handR.flex': -6, 'handL.flex': -6
    },
    keys: [
      { t: 0.0, hold: true, d: { 'forearmR.flex': 5, 'forearmL.flex': 5 } },
      { t: 1.3, d: { 'forearmR.flex': 145, 'forearmL.flex': 145 } },
      { t: 1.6, hold: true, d: { 'forearmR.flex': 145, 'forearmL.flex': 145 } },
      { t: 5.1, hold: true, d: { 'forearmR.flex': 5, 'forearmL.flex': 5 } }
    ]
  });

  /* ---------------- トライセプスエクステンション ---------------- */
  M.register({
    id: 'triext',
    view: { az: 48, el: 10, dist: 3.2, target: [0, 1.2, 0] },
    phases: [
      { t: 0, label: '頭の後ろに構える' }, { t: 1.0, label: '伸ばす 1秒' },
      { t: 1.3, label: '上で伸ばしきる' }, { t: 4.3, label: '戻す 3秒' }
    ],
    feet: standFeet,
    dumbbells: [{ grip: 'both', axis: 'vertical', kg: 5 }],
    balance: { axes: ['x'] },
    base: {
      'pelvis.y': 0.95, 'pelvis.pitch': 0,
      'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': -5,
      'upperarmR.flex': 168, 'upperarmR.abd': -20, 'upperarmR.rot': 0,
      'upperarmL.flex': 168, 'upperarmL.abd': -20, 'upperarmL.rot': 0,
      'forearmR.rot': 0, 'forearmL.rot': 0,
      'handR.flex': -10, 'handL.flex': -10
    },
    keys: [
      { t: 0.0, hold: true, d: { 'forearmR.flex': 115, 'forearmL.flex': 115 } },
      { t: 1.0, d: { 'forearmR.flex': 10, 'forearmL.flex': 10 } },
      { t: 1.3, hold: true, d: { 'forearmR.flex': 10, 'forearmL.flex': 10 } },
      { t: 4.3, hold: true, d: { 'forearmR.flex': 115, 'forearmL.flex': 115 } }
    ]
  });

  /* ---------------- ファーマーズウォーク（正しい姿勢 ⇔ 肩がすくむ崩れ） ---------------- */
  M.register({
    id: 'farmer',
    view: { az: 56, el: 9, dist: 3.3, target: [0, 1.0, 0] },
    phases: [
      { t: 0, label: '正しい姿勢' }, { t: 1.5, label: '保持' },
      { t: 2.5, label: '肩がすくむ崩れ', wrong: true }, { t: 4.0, label: '崩れたまま保持', wrong: true },
      { t: 5.0, label: '正しい姿勢に戻す' }
    ],
    feet: standFeet,
    dumbbells: [{ grip: 'handR', kg: 5 }, { grip: 'handL', kg: 5 }],
    balance: { axes: ['x'] },
    base: {
      'pelvis.y': 0.95, 'pelvis.pitch': 0,
      'upperarmR.rot': 0, 'upperarmL.rot': 0,
      'forearmR.flex': 4, 'forearmL.flex': 4, 'forearmR.rot': 86, 'forearmL.rot': 86,
      'handR.flex': 0, 'handL.flex': 0
    },
    keys: [
      { t: 0.0, hold: true, d: {
          'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0,
          'clavR.elev': -4, 'clavL.elev': -4, 'clavR.prot': 6, 'clavL.prot': -6,
          'upperarmR.flex': 3, 'upperarmR.abd': -5, 'upperarmL.flex': 3, 'upperarmL.abd': -5
      } },
      { t: 1.5, hold: true, d: {
          'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0,
          'clavR.elev': -4, 'clavL.elev': -4, 'clavR.prot': 6, 'clavL.prot': -6,
          'upperarmR.flex': 3, 'upperarmR.abd': -5, 'upperarmL.flex': 3, 'upperarmL.abd': -5
      } },
      { t: 2.5, hold: true, d: {
          'spineT.flex': 14, 'spineC.flex': 12, 'neck.flex': -8,
          'clavR.elev': 25, 'clavL.elev': 25, 'clavR.prot': -18, 'clavL.prot': 18,
          'upperarmR.flex': 40, 'upperarmR.abd': -22, 'upperarmL.flex': 40, 'upperarmL.abd': -22
      } },
      { t: 4.0, hold: true, d: {
          'spineT.flex': 14, 'spineC.flex': 12, 'neck.flex': -8,
          'clavR.elev': 25, 'clavL.elev': 25, 'clavR.prot': -18, 'clavL.prot': 18,
          'upperarmR.flex': 40, 'upperarmR.abd': -22, 'upperarmL.flex': 40, 'upperarmL.abd': -22
      } },
      { t: 5.0, hold: true, d: {
          'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0,
          'clavR.elev': -4, 'clavL.elev': -4, 'clavR.prot': 6, 'clavL.prot': -6,
          'upperarmR.flex': 3, 'upperarmR.abd': -5, 'upperarmL.flex': 3, 'upperarmL.abd': -5
      } }
    ]
  });
})(typeof window !== "undefined" ? window : globalThis);
