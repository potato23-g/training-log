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
      phases: [{ t: 0, label: '腕を開いた位置' }, { t: 1.0, label: '閉じる 1秒' },
               { t: 2.0, label: '開く 3秒' }]
    },
    /* 肘の角度は25度で固定したまま、上腕を横に開いて閉じる */
    keys: { 0: { 'upperarmR.flex': -10, 'upperarmR.abd': 80, 'upperarmL.flex': -10, 'upperarmL.abd': 80,
                 'forearmR.flex': 25, 'forearmL.flex': 25, 'forearmR.rot': 0, 'forearmL.rot': 0 },
            1: { 'upperarmR.flex': 78, 'upperarmR.abd': -8, 'upperarmL.flex': 78, 'upperarmL.abd': -8,
                 'forearmR.flex': 25, 'forearmL.flex': 25, 'forearmR.rot': 90, 'forearmL.rot': 90 },
            2: { 'upperarmR.flex': 78, 'upperarmR.abd': -8, 'upperarmL.flex': 78, 'upperarmL.abd': -8,
                   'forearmR.flex': 25, 'forearmL.flex': 25, 'forearmR.rot': 90, 'forearmL.rot': 90 },
            5: { 'upperarmR.flex': -10, 'upperarmR.abd': 80, 'upperarmL.flex': -10, 'upperarmL.abd': 80,
                 'forearmR.flex': 25, 'forearmL.flex': 25, 'forearmR.rot': 0, 'forearmL.rot': 0 } }
  });

  /* ---------------- フロアトライセプスエクステンション ----------------
     仰向けで上腕を立てたまま、肘だけ曲げ伸ばしする */
  derive('floorpress', {
    id: 'skull',
    set: {
      phases: [{ t: 0, label: '肘を曲げた位置' }, { t: 1.0, label: '伸ばす 1秒' },
               { t: 2.0, label: '戻す 3秒' }]
    },
    base: { 'forearmR.rot': 70, 'forearmL.rot': 70 },
    keys: { 0: { 'upperarmR.flex': 96, 'upperarmR.abd': 10, 'upperarmL.flex': 96, 'upperarmL.abd': 10,
                 'forearmR.flex': 96, 'forearmL.flex': 96 },
            1: { 'upperarmR.flex': 92, 'upperarmR.abd': 8, 'upperarmL.flex': 92, 'upperarmL.abd': 8,
                 'forearmR.flex': 8, 'forearmL.flex': 8 },
            2: { 'upperarmR.flex': 92, 'upperarmR.abd': 8, 'upperarmL.flex': 92, 'upperarmL.abd': 8,
                 'forearmR.flex': 8, 'forearmL.flex': 8 },
            5: { 'upperarmR.flex': 96, 'upperarmR.abd': 10, 'upperarmL.flex': 96, 'upperarmL.abd': 10,
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
      phases: [{ t: 0, label: '腕を垂らした位置' }, { t: 0.9, label: '肘を引き上げる 1秒' },
               { t: 2.1, label: '上で1秒止める' }, { t: 3.4, label: '下ろす 2秒' }]
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
      phases: [{ t: 0, label: '立った位置' }, { t: 1.5, label: '横に倒す 2秒' },
               { t: 3.5, label: '一番下で1秒止める' }, { t: 4.5, label: '起こす 2秒' }],
      dumbbells: [{ grip: 'handR', kg: 5 }]
    },
    base: {
      'forearmL.flex': 96, 'forearmL.rot': 40, 'handL.flex': 0
    },
    times: { 2.5: 3.5, 4.0: 4.5, 5.0: 6.5 },
    keys: { 0: sbPose(0), 1.5: sbPose(1), 3.5: sbPose(1), 4.5: sbPose(0), 6.5: sbPose(0) }
  });

  /* ---------------- サイドランジ ----------------
     足を大きく横に開き、片側の股関節に体重を預けて沈む。内ももと尻を使う */
  derive('goblet', {
    id: 'sidelunge',
    set: {
      view: { az: 78, el: 8, dist: 3.4, target: [0, 0.85, 0] },
      phases: [{ t: 0, label: '立った位置' }, { t: 0.5, label: '右へ沈む 3秒' },
               { t: 3.5, label: '一番下' }, { t: 4.1, label: '立ち上がる 1秒' },
               { t: 5.0, label: '立った位置' }],
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
      { t: 0, label: 'かかとを下げた位置' }, { t: 0.6, label: 'かかとを上げる 1秒' },
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

})(typeof window !== 'undefined' ? window : globalThis);
