/* 追加種目の動き。
   すでにある動きを写して、変わるところだけ書き換える（derive）。
   同じ動きの別バリエーション（手幅・握り・台の有無・片脚など）を増やすための仕組み。 */
(function (root) {
  'use strict';
  const M = root.MOTION;
  const FOOT = M.FOOT, HAND = M.HAND;

  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  /* 元の動きを写して patch を当てる。
     patch.base  : ドライバの上書き（追加・変更）
     patch.keys  : { 秒数: { ドライバ: 値 } } でキーの上書き
     patch.set   : view / phases / feet / hands / anchor / contacts / props / dumbbells / balance の差し替え */
  function derive(baseId, patch) {
    const b = M.motions[baseId];
    if (!b) throw new Error('元の動きが無い: ' + baseId);
    const m = {
      id: patch.id,
      view: clone(patch.set && patch.set.view || b.view),
      phases: clone(patch.set && patch.set.phases || b.phases),
      props: clone(patch.set && 'props' in patch.set ? patch.set.props : b.props),
      feet: clone(patch.set && 'feet' in patch.set ? patch.set.feet : b.feet),
      hands: clone(patch.set && 'hands' in patch.set ? patch.set.hands : b.hands),
      anchor: clone(patch.set && 'anchor' in patch.set ? patch.set.anchor : b.anchor),
      contacts: clone(patch.set && 'contacts' in patch.set ? patch.set.contacts : b.contacts),
      dumbbells: clone(patch.set && 'dumbbells' in patch.set ? patch.set.dumbbells : b.dumbbells),
      balance: clone(patch.set && 'balance' in patch.set ? patch.set.balance : b.balance),
      base: Object.assign(clone(b.base) || {}, patch.base || {}),
      keys: clone(b.keys)
    };
    Object.keys(m).forEach((k) => { if (m[k] === undefined) delete m[k]; });
    if (patch.times) {               /* キーの時刻を動かす（姿勢は変えず、速さだけ変える） */
      Object.keys(patch.times).forEach((t) => {
        const key = m.keys.find((k) => Math.abs(k.t - parseFloat(t)) < 1e-6);
        if (!key) throw new Error(patch.id + ': その時刻のキーが無い t=' + t);
        key.t = patch.times[t];
      });
      m.keys.sort((a, b) => a.t - b.t);
    }
    if (patch.keys) {
      Object.keys(patch.keys).forEach((t) => {
        const key = m.keys.find((k) => Math.abs(k.t - parseFloat(t)) < 1e-6);
        if (!key) throw new Error(patch.id + ': そのキーが無い t=' + t);
        Object.assign(key.d, patch.keys[t]);
      });
    }
    return M.register(m);
  }

  /* ---------------- ワイドスクワット（相撲） ----------------
     足を広くつま先を外へ。内ももと尻の負担が増える */
  const wideFoot = (z, yaw) => ({ at: [0, 0, z], local: [0, -FOOT.ankleH, 0], yaw: yaw, pitch: 0,
                                  pins: [FOOT.heel, FOOT.ball] });
  derive('goblet', {
    id: 'sumo',
    set: { feet: { R: wideFoot(0.22, 30), L: wideFoot(-0.22, -30) } },
    base: { 'thighR.abd': 12, 'thighL.abd': 12, 'thighR.rot': -14, 'thighL.rot': -14 }
  });

  /* ---------------- スプリットスクワット（床） ----------------
     後ろ足を台に乗せず床に置く。ブルガリアンより易しい */
  derive('split', {
    id: 'splitfloor',
    set: {
      props: [],
      feet: {
        R: { at: [0.22, 0, 0.12], local: [0, -FOOT.ankleH, 0], yaw: 4, pitch: 0, pins: [FOOT.heel, FOOT.ball] },
        L: { at: [-0.34, 0.045, -0.12], local: FOOT.ball, yaw: -4, pitch: -50, pins: [FOOT.ball], pole: [0, -1, -0.15] }
      }
    }
  });

  /* ---------------- ヒップリフト（床） ----------------
     肩を床に置く自重版。ダンベルなしで可動域は狭い */
  derive('hipthrust', {
    id: 'bridge',
    set: {
      props: [],
      dumbbells: [],
      hands: undefined,
      anchor: { bone: 'spineT', local: [-0.1, 0, 0], at: [-0.15, 0.148, 0] },
      feet: { R: { at: [0.52, 0, 0.11], local: [0, -FOOT.ankleH, 0], yaw: 4, pitch: 0, pins: [FOOT.heel, FOOT.ball], pole: [0.2, 1, 0.3] },
              L: { at: [0.52, 0, -0.11], local: [0, -FOOT.ankleH, 0], yaw: -4, pitch: 0, pins: [FOOT.heel, FOOT.ball], pole: [0.2, 1, -0.3] } },
      view: { az: 18, el: 9, dist: 3.0, target: [-0.15, 0.25, 0] }
    },
    base: { 'upperarmR.flex': -26, 'upperarmR.abd': 50, 'forearmR.flex': 0, 'forearmR.rot': 160,
            'upperarmL.flex': -26, 'upperarmL.abd': 50, 'forearmL.flex': 0, 'forearmL.rot': 160 },
    keys: { 0: { 'pelvis.pitch': -88 }, 1.0: { 'pelvis.pitch': -108 }, 1.3: { 'pelvis.pitch': -116 },
            3.3: { 'pelvis.pitch': -116 }, 4.6: { 'pelvis.pitch': -98 }, 5.3: { 'pelvis.pitch': -88 } }
  });

  /* ---------------- 膝つき腕立て伏せ ---------------- */
  derive('pushup', {
    id: 'pushupknee',
    set: {
      feet: undefined,
      contacts: [{ name: 'kneeR', bone: 'shankR', local: [0, 0, 0], weight: 1 },
                 { name: 'kneeL', bone: 'shankL', local: [0, 0, 0], weight: 1 }],
      /* 膝を床の1点に固定して、その点を中心に体を起こし下ろす */
      anchor: { bone: 'shankR', local: [0, 0, 0], at: [-0.70, 0.085, 0.085] },
      view: { az: 8, el: 7, dist: 3.2, target: [-0.3, 0.3, 0] }
    },
    base: { 'thighR.flex': 0, 'thighL.flex': 0, 'shankR.flex': 100, 'shankL.flex': 100,
            'footR.flex': 20, 'footL.flex': 20, 'toesR.flex': 0, 'toesL.flex': 0 },
    /* 膝を支点に体を起こし下ろす。頭から膝までは一直線のまま */
    keys: { 0: { 'pelvis.pitch': 64 }, 1.5: { 'pelvis.pitch': 67 },
            3.0: { 'pelvis.pitch': 82 }, 4.0: { 'pelvis.pitch': 64 } }
  });

  /* ---------------- ダンベルフライ（床） ----------------
     肘の角度を保ったまま腕を開く。胸を伸ばす動き */
  derive('floorpress', {
    id: 'fly',
    set: {
      phases: [{ t: 0, label: '閉じる 1秒' }, { t: 1.0, label: '胸の上で止める' },
               { t: 1.6, label: '開く 3秒' }]
    },
    /* 肘の角度は25度で固定したまま、上腕を横に開いて閉じる */
    times: { 2.6: 1.6, 4: 4.6 },
    keys: { 0: { 'upperarmR.flex': -10, 'upperarmR.abd': 80, 'upperarmL.flex': -10, 'upperarmL.abd': 80,
                 'forearmR.flex': 25, 'forearmL.flex': 25, 'forearmR.rot': 0, 'forearmL.rot': 0 },
            1: { 'upperarmR.flex': 78, 'upperarmR.abd': -8, 'upperarmL.flex': 78, 'upperarmL.abd': -8,
                 'forearmR.flex': 25, 'forearmL.flex': 25, 'forearmR.rot': 90, 'forearmL.rot': 90 },
            1.6: { 'upperarmR.flex': 78, 'upperarmR.abd': -8, 'upperarmL.flex': 78, 'upperarmL.abd': -8,
                   'forearmR.flex': 25, 'forearmL.flex': 25, 'forearmR.rot': 90, 'forearmL.rot': 90 },
            4.6: { 'upperarmR.flex': -10, 'upperarmR.abd': 80, 'upperarmL.flex': -10, 'upperarmL.abd': 80,
                   'forearmR.flex': 25, 'forearmL.flex': 25, 'forearmR.rot': 0, 'forearmL.rot': 0 } }
  });

  /* ---------------- フロアトライセプスエクステンション ----------------
     仰向けで上腕を立てたまま、肘だけ曲げ伸ばしする */
  derive('floorpress', {
    id: 'skull',
    set: {
      phases: [{ t: 0, label: '伸ばす 1秒' }, { t: 1.0, label: '上で伸ばしきる' },
               { t: 1.6, label: '戻す 3秒' }]
    },
    base: { 'forearmR.rot': 70, 'forearmL.rot': 70 },
    times: { 2.6: 1.6, 4: 4.6 },
    keys: { 0: { 'upperarmR.flex': 96, 'upperarmR.abd': 10, 'upperarmL.flex': 96, 'upperarmL.abd': 10,
                 'forearmR.flex': 96, 'forearmL.flex': 96 },
            1: { 'upperarmR.flex': 92, 'upperarmR.abd': 8, 'upperarmL.flex': 92, 'upperarmL.abd': 8,
                 'forearmR.flex': 8, 'forearmL.flex': 8 },
            1.6: { 'upperarmR.flex': 92, 'upperarmR.abd': 8, 'upperarmL.flex': 92, 'upperarmL.abd': 8,
                   'forearmR.flex': 8, 'forearmL.flex': 8 },
            4.6: { 'upperarmR.flex': 96, 'upperarmR.abd': 10, 'upperarmL.flex': 96, 'upperarmL.abd': 10,
                   'forearmR.flex': 96, 'forearmL.flex': 96 } }
  });

  /* ---------------- フロントレイズ ----------------
     体の前へ、肩の高さまで上げる */
  derive('lateral', {
    id: 'front',
    set: {
      phases: [{ t: 0, label: '前に上げる 1〜2秒' }, { t: 1.2, label: '肩の高さで止める' },
               { t: 1.5, label: '下ろす 4秒' }],
      view: { az: 40, el: 9, dist: 3.5, target: [0, 1.05, 0] }
    },
    base: { 'upperarmR.abd': 4, 'upperarmL.abd': 4, 'forearmR.rot': 170, 'forearmL.rot': 170 },
    keys: { 0: { 'upperarmR.abd': 4, 'upperarmL.abd': 4, 'upperarmR.flex': 8, 'upperarmL.flex': 8 },
            1.2: { 'upperarmR.abd': 4, 'upperarmL.abd': 4, 'upperarmR.flex': 88, 'upperarmL.flex': 88 },
            1.5: { 'upperarmR.abd': 4, 'upperarmL.abd': 4, 'upperarmR.flex': 88, 'upperarmL.flex': 88 },
            5.5: { 'upperarmR.abd': 4, 'upperarmL.abd': 4, 'upperarmR.flex': 8, 'upperarmL.flex': 8 } }
  });

  /* ---------------- シュラッグ ----------------
     肩をすくめて僧帽筋の上部だけを動かす */
  derive('farmer', {
    id: 'shrug',
    set: {
      phases: [{ t: 0, label: '肩を下ろした位置' }, { t: 1.5, label: 'すくめる 1秒' },
               { t: 2.5, label: '上で1秒止める' }, { t: 3.5, label: '下ろす 2秒' }]
    },
    times: { 4.0: 3.5, 5.0: 5.5 },
    keys: { 2.5: { 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0,
                   'clavR.elev': 14, 'clavL.elev': 14, 'clavR.prot': 2, 'clavL.prot': -2,
                   /* 肩を上げると腕も外へ開くので、その分だけ内へ戻して腕を垂らしたまま保つ */
                   'upperarmR.flex': 3, 'upperarmR.abd': -6, 'upperarmL.flex': 3, 'upperarmL.abd': -6 },
            3.5: { 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0,
                   'clavR.elev': 14, 'clavL.elev': 14, 'clavR.prot': 2, 'clavL.prot': -2,
                   /* 肩を上げると腕も外へ開くので、その分だけ内へ戻して腕を垂らしたまま保つ */
                   'upperarmR.flex': 3, 'upperarmR.abd': -6, 'upperarmL.flex': 3, 'upperarmL.abd': -6 } }
  });

  /* ---------------- ベントオーバーロウ（両手） ----------------
     股関節を折った姿勢のまま、両手のダンベルを腰へ引く */
  derive('rdl', {
    id: 'row2',
    set: {
      phases: [{ t: 0, label: '肘を引き上げる 2秒' }, { t: 2.1, label: '上で1.3秒止める' },
               { t: 3.4, label: '下ろす 2秒' }]
    },
    base: { 'spineL.flex': 0, 'spineT.flex': 1, 'spineC.flex': 2 },
    times: { 4.2: 4.6, 4.9: 5.4 },
    keys: { 0: { 'pelvis.y': 0.903, 'pelvis.pitch': 82, 'upperarmR.flex': 55, 'upperarmL.flex': 55,
                 'forearmR.flex': 8, 'forearmL.flex': 8, 'neck.flex': -23 },
            0.9: { 'pelvis.y': 0.903, 'pelvis.pitch': 82, 'upperarmR.flex': 30, 'upperarmL.flex': 30,
                   'forearmR.flex': 70, 'forearmL.flex': 70, 'neck.flex': -23 },
            2.1: { 'pelvis.y': 0.903, 'pelvis.pitch': 82, 'upperarmR.flex': 8, 'upperarmL.flex': 8,
                   'forearmR.flex': 116, 'forearmL.flex': 116, 'neck.flex': -23 },
            3.4: { 'pelvis.y': 0.903, 'pelvis.pitch': 82, 'upperarmR.flex': 8, 'upperarmL.flex': 8,
                   'forearmR.flex': 116, 'forearmL.flex': 116, 'neck.flex': -23 },
            4.6: { 'pelvis.y': 0.903, 'pelvis.pitch': 82, 'upperarmR.flex': 30, 'upperarmL.flex': 30,
                   'forearmR.flex': 70, 'forearmL.flex': 70, 'neck.flex': -23 },
            5.4: { 'pelvis.y': 0.903, 'pelvis.pitch': 82, 'upperarmR.flex': 55, 'upperarmL.flex': 55,
                   'forearmR.flex': 8, 'forearmL.flex': 8, 'neck.flex': -23 } }
  });

  /* ---------------- サイドベンド ----------------
     片手にダンベルを持ち、体を真横に倒して戻す。腹斜筋を直接使う */
  const sbPose = (bend) => ({
    'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0,
    'clavR.elev': -4, 'clavL.elev': -4, 'clavR.prot': 6, 'clavL.prot': -6,
    'spineL.abd': bend * 22, 'spineT.abd': bend * 16, 'spineC.abd': bend * 9, 'neck.abd': -bend * 6,
    /* 腕は重力で垂れたまま。体が傾くぶんだけ肩を開いて、ダンベルが真下へ下りるようにする */
    'upperarmR.flex': 3, 'upperarmR.abd': 8 + bend * 40, 'upperarmL.flex': 4, 'upperarmL.abd': -24
  });
  derive('farmer', {
    id: 'sidebend',
    set: {
      view: { az: 86, el: 6, dist: 3.3, target: [0, 1.0, 0] },
      phases: [{ t: 0, label: '横に倒す 2秒' }, { t: 2.0, label: '一番下で1秒止める' },
               { t: 3.0, label: '起こす 2秒' }, { t: 5.0, label: '立った位置' }],
      dumbbells: [{ grip: 'handR', kg: 5 }]
    },
    base: {
      'forearmL.flex': 96, 'forearmL.rot': 40, 'handL.flex': 0
    },
    times: { 1.5: 2.0, 2.5: 3.0, 4.0: 5.0, 5.0: 6.0 },
    keys: { 0: sbPose(0), 2.0: sbPose(1), 3.0: sbPose(1), 5.0: sbPose(0), 6.0: sbPose(0) }
  });

  /* ---------------- サイドランジ ----------------
     足を大きく横に開き、片側の股関節に体重を預けて沈む。内ももと尻を使う */
  derive('goblet', {
    id: 'sidelunge',
    set: {
      view: { az: 78, el: 8, dist: 3.4, target: [0, 0.85, 0] },
      phases: [{ t: 0, label: '右へ沈む 3.5秒' }, { t: 3.5, label: '一番下' },
               { t: 4.1, label: '立ち上がる 1.2秒' }],
      feet: {
        R: { at: [0, 0, 0.26], local: [0, -M.FOOT.ankleH, 0], yaw: 8, pitch: 0, pins: [M.FOOT.heel, M.FOOT.ball] },
        /* 支える側の足は外へ向ける（足首がひっくり返らない） */
        L: { at: [0, 0, -0.26], local: [0, -M.FOOT.ankleH, 0], yaw: -30, pitch: 0, pins: [M.FOOT.heel, M.FOOT.ball] }
      }
    },
    keys: {
      0.0: { 'pelvis.y': 0.950, 'pelvis.z': 0.000, 'pelvis.pitch': 4 },
      0.5: { 'pelvis.y': 0.925, 'pelvis.z': 0.034, 'pelvis.pitch': 8 },
      1.3: { 'pelvis.y': 0.860, 'pelvis.z': 0.085, 'pelvis.pitch': 16 },
      2.2: { 'pelvis.y': 0.840, 'pelvis.z': 0.137, 'pelvis.pitch': 24 },
      3.5: { 'pelvis.y': 0.820, 'pelvis.z': 0.180, 'pelvis.pitch': 30 },
      4.1: { 'pelvis.y': 0.820, 'pelvis.z': 0.180, 'pelvis.pitch': 30 },
      4.6: { 'pelvis.y': 0.840, 'pelvis.z': 0.119, 'pelvis.pitch': 22 },
      5.0: { 'pelvis.y': 0.900, 'pelvis.z': 0.043, 'pelvis.pitch': 10 },
      5.3: { 'pelvis.y': 0.950, 'pelvis.z': 0.000, 'pelvis.pitch': 4 }
    }
  });

  /* ---------------- シーテッドカーフレイズ ----------------
     椅子に座り、膝の上にダンベルを置いてかかとを上げ下げする。膝を曲げるのでヒラメ筋に効く */
  const STOOL = { type: 'box', id: 'stool', min: [-0.34, 0, -0.26], max: [0.16, 0.42, 0.26], label: '椅子' };
  const seatFoot = (z) => ({
    at: [0.56, 0, z], local: M.FOOT.ball, pitch: 'footPitch', yaw: 0, pins: [M.FOOT.ball],
    pole: [0.5, 1, z > 0 ? 0.2 : -0.2]
  });
  M.register({
    id: 'calfseat',
    view: { az: 22, el: 8, dist: 3.0, target: [0.15, 0.55, 0] },
    props: [STOOL],
    phases: [
      { t: 0, label: 'かかとを上げる 1.6秒' },
      { t: 1.6, label: '一番上で2秒止める' }, { t: 3.6, label: '下ろす 3秒' }
    ],
    feet: { R: seatFoot(0.11), L: seatFoot(-0.11) },
    /* 腕は自然に垂らし、ダンベルを腿の上に立てて手で押さえる */
    dumbbells: [{ grip: 'handR', kg: 5, local: [0, -0.05, 0] }, { grip: 'handL', kg: 5, local: [0, -0.05, 0] }],
    base: {
      'pelvis.y': 0.52, 'pelvis.x': -0.02, 'pelvis.pitch': 4,
      'spineL.flex': 0, 'spineT.flex': 2, 'spineC.flex': 2, 'neck.flex': -2,
      'upperarmR.flex': 35, 'upperarmR.abd': -8, 'upperarmR.rot': -10, 'forearmR.flex': 55, 'forearmR.rot': 170, 'handR.flex': 0,
      'upperarmL.flex': 35, 'upperarmL.abd': -8, 'upperarmL.rot': -10, 'forearmL.flex': 55, 'forearmL.rot': 170, 'handL.flex': 0,
      footPitch: 0, 'toesR.flex': 0, 'toesL.flex': 0
    },
    keys: [
      { t: 0.0, hold: true, d: { footPitch: 0, 'toesR.flex': 0, 'toesL.flex': 0 } },
      { t: 0.6, d: { footPitch: -8, 'toesR.flex': 8, 'toesL.flex': 8 } },
      { t: 1.6, hold: true, d: { footPitch: -32, 'toesR.flex': 32, 'toesL.flex': 32 } },
      { t: 3.6, hold: true, d: { footPitch: -32, 'toesR.flex': 32, 'toesL.flex': 32 } },
      { t: 4.8, d: { footPitch: -6, 'toesR.flex': 6, 'toesL.flex': 6 } },
      { t: 6.6, hold: true, d: { footPitch: 0, 'toesR.flex': 0, 'toesL.flex': 0 } }
    ]
  });

  /* ---------------- ダンベルプルオーバー ----------------
     仰向け、膝を立てる（フロアプレスと同じ仰向け姿勢）。ダンベル1つを両手でまとめて持ち、
     胸の真上から弧を描いて頭の後ろへ。肘の角度（前腕の曲げ）は最後まで変えない。 */
  const pulloverFoot = (z) => ({
    at: [0.50, 0, z], local: [0, -FOOT.ankleH, 0], yaw: 0, pitch: 0,
    pins: [FOOT.heel, FOOT.ball], pole: [0, 1, 0.5 * Math.sign(z)]
  });
  M.register({
    id: 'pullover',
    view: { az: 14, el: 15, dist: 3.3, target: [0.1, 0.3, 0] },
    phases: [
      { t: 0, label: '下ろす 3秒' }, { t: 3.0, label: '頭の後ろで止める' }, { t: 3.4, label: '引き上げる 2秒' }
    ],
    feet: { R: pulloverFoot(0.13), L: pulloverFoot(-0.13) },
    dumbbells: [{ grip: 'both', axis: 'vertical', kg: 5, offset: [0, -0.05, 0] }],
    base: {
      'pelvis.y': 0.135, 'pelvis.pitch': -90, 'pelvis.x': 0, 'pelvis.z': 0,
      'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 4, 'head.flex': 0,
      'upperarmR.abd': -16, 'upperarmL.abd': -16,   /* 両手を寄せて、ダンベル1つの端を下から一緒に支える */
      'forearmR.flex': 22, 'forearmL.flex': 22, 'forearmR.rot': 170, 'forearmL.rot': 170,
      'handR.flex': -10, 'handL.flex': -10
    },
    keys: [
      { t: 0.0, hold: true, d: { 'upperarmR.flex': 88, 'upperarmL.flex': 88 } },
      { t: 1.8, d: { 'upperarmR.flex': 128, 'upperarmL.flex': 128 } },
      { t: 3.0, hold: true, d: { 'upperarmR.flex': 163, 'upperarmL.flex': 163 } },
      { t: 3.4, hold: true, d: { 'upperarmR.flex': 163, 'upperarmL.flex': 163 } },
      { t: 5.4, hold: true, d: { 'upperarmR.flex': 88, 'upperarmL.flex': 88 } }
    ]
  });

  /* ---------------- スライディングレッグカール ----------------
     仰向けでヒップリフトの姿勢を保ったまま（肩甲骨は床に固定）、かかとを滑らせて膝を伸ばし・引き寄せる。
     脚は接地点を固定するIKではなく、股関節・膝・足首の角度を直接キーにして動かす（かかとが床の上を
     前後に動くため）。肩甲骨の1点だけを anchor で固定し、股関節の高さはそこから自然に決まる。 */
  M.register({
    id: 'slidecurl',
    view: { az: 20, el: 11, dist: 3.4, target: [0.15, 0.35, 0] },
    anchor: { bone: 'spineT', local: [-0.1, 0, 0], at: [-0.15, 0.148, 0] },
    contacts: [{ name: 'scap', bone: 'spineT', local: [-0.1, 0, 0], weight: 1 }],
    phases: [
      { t: 0, label: '伸ばす 2秒' }, { t: 2.0, label: '伸ばしきる直前' }, { t: 2.3, label: '引き寄せる 2秒' }
    ],
    base: {
      'spineL.flex': 2, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 8, 'head.flex': 4,
      'upperarmR.flex': -26, 'upperarmR.abd': 50, 'forearmR.flex': 0, 'forearmR.rot': 160,
      'upperarmL.flex': -26, 'upperarmL.abd': 50, 'forearmL.flex': 0, 'forearmL.rot': 160,
      'pelvis.pitch': -100
    },
    /* 股関節・膝・足首の角度は、かかとが常に床の高さ（腰の骨盤アンカーを基準にヒップリフトの姿勢を保った
       まま）になるよう、それぞれの膝の曲げに対して個別に解いた値（tools/pose_fit.js 相当の手作業）。
       曲げ(t=0/4.3)→伸ばし(t=2.0/2.3)のあいだ、かかとが床から浮いたり沈んだりしないようにしてある */
    keys: [
      { t: 0.0, hold: true, d: { 'thighR.flex': 18.5, 'shankR.flex': 116, 'footR.flex': 14,
                                 'thighL.flex': 18.5, 'shankL.flex': 116, 'footL.flex': 14 } },
      { t: 0.7, d: { 'thighR.flex': 16, 'shankR.flex': 100, 'footR.flex': 0,
                     'thighL.flex': 16, 'shankL.flex': 100, 'footL.flex': 0 } },
      { t: 1.4, d: { 'thighR.flex': 6.5, 'shankR.flex': 70, 'footR.flex': -18,
                     'thighL.flex': 6.5, 'shankL.flex': 70, 'footL.flex': -18 } },
      { t: 2.0, hold: true, d: { 'thighR.flex': -6, 'shankR.flex': 40, 'footR.flex': -34,
                                 'thighL.flex': -6, 'shankL.flex': 40, 'footL.flex': -34 } },
      { t: 2.3, hold: true, d: { 'thighR.flex': -6, 'shankR.flex': 40, 'footR.flex': -34,
                                 'thighL.flex': -6, 'shankL.flex': 40, 'footL.flex': -34 } },
      { t: 3.0, d: { 'thighR.flex': 6.5, 'shankR.flex': 70, 'footR.flex': -18,
                     'thighL.flex': 6.5, 'shankL.flex': 70, 'footL.flex': -18 } },
      { t: 3.7, d: { 'thighR.flex': 16, 'shankR.flex': 100, 'footR.flex': 0,
                     'thighL.flex': 16, 'shankL.flex': 100, 'footL.flex': 0 } },
      { t: 4.3, hold: true, d: { 'thighR.flex': 18.5, 'shankR.flex': 116, 'footR.flex': 14,
                                 'thighL.flex': 18.5, 'shankL.flex': 116, 'footL.flex': 14 } }
    ]
  });

  /* ---------------- ロシアンツイスト ----------------
     床に座り、膝を曲げて足は床。上体を少し後ろに倒す。脚と骨盤は動かさず、脊柱の回旋だけで
     体幹を左右にひねる。手は体の前で合わせ、体幹と一緒についてくる（腕自体の角度は変えない）。 */
  const twistFoot = (x, z, yaw) => ({
    at: [x, 0, z], local: [0, -FOOT.ankleH, 0], yaw: yaw, pitch: 0,
    pins: [FOOT.heel, FOOT.ball]
  });
  const twistPose = (bend) => ({
    'spineL.rot': bend * 10, 'spineT.rot': bend * 16, 'spineC.rot': bend * 20
  });
  M.register({
    id: 'twist',
    view: { az: 30, el: 14, dist: 3.3, target: [0.15, 0.45, 0] },
    feet: { R: twistFoot(0.55, 0.13, 6), L: twistFoot(0.55, -0.13, -6) },
    phases: [
      { t: 0, label: '右へひねる 1.4秒' }, { t: 1.4, label: '右で止める' },
      { t: 1.7, label: '中心へ戻る 1.4秒' }, { t: 3.1, label: '左へひねる 1.4秒' }, { t: 4.5, label: '左で止める' },
      { t: 4.8, label: '中心へ戻る 1.4秒' }
    ],
    base: {
      'pelvis.y': 0.22, 'pelvis.pitch': -40, 'pelvis.x': 0, 'pelvis.z': 0,
      'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 6, 'head.flex': 2,
      'clavR.prot': 10, 'clavL.prot': -10,
      'upperarmR.flex': 10, 'upperarmR.abd': -12, 'upperarmR.rot': 10,
      'upperarmL.flex': 10, 'upperarmL.abd': -12, 'upperarmL.rot': -10,
      'forearmR.flex': 55, 'forearmR.rot': 96, 'handR.flex': 0,
      'forearmL.flex': 55, 'forearmL.rot': 96, 'handL.flex': 0
    },
    keys: [
      { t: 0.0, hold: true, d: twistPose(0) },
      { t: 1.4, hold: true, d: twistPose(1) },
      { t: 1.7, hold: true, d: twistPose(1) },
      { t: 3.1, hold: true, d: twistPose(0) },
      { t: 4.5, hold: true, d: twistPose(-1) },
      { t: 4.8, hold: true, d: twistPose(-1) },
      { t: 6.2, hold: true, d: twistPose(0) }
    ]
  });

  /* ---------------- シシースクワット ----------------
     柱を軽くつかむだけ（荷重はかけない）。股関節は曲げず、骨盤・脊柱・大腿を一直線のまま
     後ろへ傾け、膝だけを曲げて沈む。つま先（母趾球）の1点を anchor で固定し、骨盤の並行移動は
     そこから自然に決まるようにする（pushupknee と同じ技法。膝で固定する代わりに、つま先で固定する）。 */
  M.register({
    id: 'sissy',
    view: { az: 24, el: 9, dist: 3.1, target: [0, 0.75, 0] },
    anchor: { bone: 'footR', local: FOOT.ball, at: [0, 0, 0.13] },
    contacts: [
      { name: 'toeR', bone: 'footR', local: FOOT.ball, weight: 1 },
      { name: 'toeL', bone: 'footL', local: FOOT.ball, weight: 1 }
    ],
    phases: [
      { t: 0, label: '沈む 3秒' }, { t: 3.0, label: '一番下' }, { t: 3.3, label: '戻る 2秒' }
    ],
    base: {
      'pelvis.pitch': 0,
      'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0, 'head.flex': 0,
      /* 股関節は曲げない（膝から肩まで一直線）。曲げるのは膝と足首だけ */
      'thighR.flex': 0, 'thighR.abd': 0, 'thighR.rot': 0,
      'thighL.flex': 0, 'thighL.abd': 0, 'thighL.rot': 0,
      /* 片手で柱を軽くつかむだけ。もう片方は体側に自然に下げる */
      'upperarmR.flex': 4, 'upperarmR.abd': 24, 'upperarmR.rot': 0, 'forearmR.flex': 88, 'forearmR.rot': 20, 'handR.flex': 0,
      'upperarmL.flex': 4, 'upperarmL.abd': 4, 'upperarmL.rot': 0, 'forearmL.flex': 10, 'forearmL.rot': 10, 'handL.flex': 0
    },
    /* 足首・足先の角度は、母趾球（anchor で固定）を軸にかかとと足先が実際に床の高さへ来るよう
       膝の曲げごとに個別に解いた値（tools/pose_fit.js 相当の手作業。足先が床を貫通しない・
       かかとが浮いたままになるように toesR/L.flex で足首の角度を打ち消している） */
    keys: [
      { t: 0.0, hold: true, d: { 'pelvis.pitch': 0, 'shankR.flex': 4, 'shankL.flex': 4,
                                  'footR.flex': -20, 'footL.flex': -20, 'toesR.flex': 40, 'toesL.flex': 40 } },
      { t: 3.0, hold: true, d: { 'pelvis.pitch': -30, 'shankR.flex': 90, 'shankL.flex': 90,
                                  'footR.flex': 40, 'footL.flex': 40, 'toesR.flex': 40, 'toesL.flex': 40 } },
      { t: 3.3, hold: true, d: { 'pelvis.pitch': -30, 'shankR.flex': 90, 'shankL.flex': 90,
                                  'footR.flex': 40, 'footL.flex': 40, 'toesR.flex': 40, 'toesL.flex': 40 } },
      { t: 5.3, hold: true, d: { 'pelvis.pitch': 0, 'shankR.flex': 4, 'shankL.flex': 4,
                                  'footR.flex': -20, 'footL.flex': -20, 'toesR.flex': 40, 'toesL.flex': 40 } }
    ]
  });

  /* ---------------- リアレイズ ----------------
     股関節を折った姿勢（ベントオーバーロウ・RDLと同じ前傾）を保ったまま、肘の角度を変えずに
     腕を真横へ開く（外転）。肘を引き上げないので row2 とは違う筋を使う。 */
  const rearFoot = (z, yaw) => ({ at: [0, 0, z], local: [0, -FOOT.ankleH, 0], yaw: yaw, pitch: 0, pins: [FOOT.heel, FOOT.ball] });
  M.register({
    id: 'rear',
    view: { az: 60, el: 9, dist: 3.4, target: [-0.05, 0.75, 0] },
    feet: { R: rearFoot(0.12, 5), L: rearFoot(-0.12, -5) },
    dumbbells: [{ grip: 'handR', kg: 5 }, { grip: 'handL', kg: 5 }],
    balance: { axes: ['x'] },
    phases: [
      { t: 0, label: '横に上げる 1〜2秒' }, { t: 1.2, label: '肩の高さで止める' }, { t: 1.5, label: '下ろす 3秒' }
    ],
    base: {
      'pelvis.y': 0.903, 'pelvis.pitch': 82,
      'spineL.flex': 0, 'spineT.flex': 1, 'spineC.flex': 2, 'neck.flex': -23,
      /* 肘はわずかに曲げて固定。前腕の回旋90度＝手のひらが向かい合う中間位 */
      'upperarmR.flex': 55, 'upperarmL.flex': 55, 'upperarmR.rot': 0, 'upperarmL.rot': 0,
      'forearmR.flex': 12, 'forearmL.flex': 12, 'forearmR.rot': 90, 'forearmL.rot': 90,
      'handR.flex': 0, 'handL.flex': 0
    },
    keys: [
      { t: 0.0, hold: true, d: { 'upperarmR.abd': 3, 'upperarmL.abd': 3 } },
      { t: 1.2, d: { 'upperarmR.abd': 85, 'upperarmL.abd': 85 } },
      { t: 1.5, hold: true, d: { 'upperarmR.abd': 85, 'upperarmL.abd': 85 } },
      { t: 4.5, hold: true, d: { 'upperarmR.abd': 3, 'upperarmL.abd': 3 } }
    ]
  });

  /* ---------------- ヒップアブダクション ----------------
     横向きに寝る（pelvis.roll=90で右側を下にする。motions_c.js のサイドプランクと同じ規約）。
     下側（右）の脚は軽く曲げて安定させる。上側（左）の脚を伸ばしたまま外転で斜め上へ上げる。
     体全体が床に接しており支点を動かす必要がないので anchor・balance は使わない。 */
  M.register({
    id: 'abduct',
    view: { az: 92, el: 14, dist: 3.0, target: [0, 0.22, 0] },
    base: {
      'pelvis.y': 0.22, 'pelvis.roll': 90, 'pelvis.pitch': 0, 'pelvis.x': 0, 'pelvis.z': 0,
      'spineL.flex': 0, 'spineT.flex': 0, 'spineC.flex': 0, 'neck.flex': 0, 'head.flex': 0,
      /* 横向きに寝ると、頭の下へ伸ばした下側の腕がそのまま床へ沈む向きになる。
         pelvis.y を少し上げ、鎖骨（clav.elev、可動域上限30）も上限近くまで使って
         下側の腕の床貫通を避ける。上側の肩は体の前で床につくだけなので elev は不要 */
      'clavR.elev': 28, 'clavR.prot': 0, 'clavL.elev': 0, 'clavL.prot': 0,
      /* 下側（右）の腕は頭の下。上側（左）の腕は体の前で床について安定させる */
      'upperarmR.flex': 110, 'upperarmR.abd': 0, 'upperarmR.rot': 0, 'forearmR.flex': 90, 'forearmR.rot': 90, 'handR.flex': 0,
      'upperarmL.flex': 30, 'upperarmL.abd': 20, 'upperarmL.rot': 0, 'forearmL.flex': 40, 'forearmL.rot': 90, 'handL.flex': 0,
      /* 下側（右）の脚は軽く曲げる */
      'thighR.flex': 22, 'thighR.abd': 0, 'thighR.rot': 0, 'shankR.flex': 50, 'footR.flex': 4, 'toesR.flex': 0,
      /* 上側（左）の脚は伸ばして体よりわずかに後ろへ。つま先は正面のまま外転だけで上げる */
      'thighL.flex': -8, 'thighL.rot': 0, 'shankL.flex': 2, 'footL.flex': 0, 'toesL.flex': 0
    },
    phases: [
      { t: 0, label: '上げる 1秒' }, { t: 1.0, label: '一番上' }, { t: 1.3, label: '下ろす 2秒' }
    ],
    keys: [
      { t: 0.0, hold: true, d: { 'thighL.abd': 0 } },
      { t: 1.0, hold: true, d: { 'thighL.abd': 35 } },
      { t: 1.3, hold: true, d: { 'thighL.abd': 35 } },
      { t: 3.3, hold: true, d: { 'thighL.abd': 0 } }
    ]
  });

  /* ---------------- ハンマーカール ----------------
     ダンベルカールと同じ動き。握りを縦（前腕の回旋90度＝中間位、親指が前）に変える。
     縦に握るとダンベルが前後に長くなるので、カールの腕の位置のままでは下で太ももに、上で肩に重なる。
     腕を少し外に開いて体の横で持ち（外転4度）、上は肩に当たる手前（肘138度）で止める */
  derive('curl', {
    id: 'hammer',
    base: { 'forearmR.rot': 90, 'forearmL.rot': 90, 'upperarmR.abd': 4, 'upperarmL.abd': 4 },
    keys: {
      0: { 'forearmR.rot': 90, 'forearmL.rot': 90 },
      1.3: { 'forearmR.rot': 90, 'forearmL.rot': 90, 'forearmR.flex': 138, 'forearmL.flex': 138 },
      1.6: { 'forearmR.rot': 90, 'forearmL.rot': 90, 'forearmR.flex': 138, 'forearmL.flex': 138 },
      5.1: { 'forearmR.rot': 90, 'forearmL.rot': 90 }
    }
  });

})(typeof window !== 'undefined' ? window : globalThis);
