/* 組み方（楽にする／大変にする）ごとの動き。
   ・テンポや止める時間だけ変わるものは、元の動きの時間を伸ばして作る（retime）
   ・深さや姿勢が変わるものは、元の動きを写して変わるところだけ書き換える（derive） */
(function (root) {
  'use strict';
  const M = root.MOTION;
  const FOOT = M.FOOT, HAND = M.HAND;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  /* 元の動きを写して patch を当てる（motions_e.js と同じ） */
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
    if (patch.keys) {
      Object.keys(patch.keys).forEach((t) => {
        const key = m.keys.find((k) => Math.abs(k.t - parseFloat(t)) < 1e-6);
        if (!key) throw new Error(patch.id + ': そのキーが無い t=' + t);
        Object.assign(key.d, patch.keys[t]);
      });
    }
    return M.register(m);
  }

  /* ラベルに秒数が入っている場面の長さを変える。
     例: retime('curl', 'curl_slow', /下ろす/, 4) で「下ろす 3〜4秒」の区間を4秒にする。
     その区間のキーを引き伸ばし、あとに続くキーはずらす。ラベルの秒数も書き換える */
  function retime(baseId, id, labelRe, sec) {
    const b = M.motions[baseId];
    if (!b) throw new Error('元の動きが無い: ' + baseId);
    const ps = clone(b.phases) || [];
    const i = ps.findIndex((p) => labelRe.test(p.label));
    if (i < 0) throw new Error(id + ': その場面が無い ' + labelRe);
    const T = M.cycleTime(b);
    const start = ps[i].t;
    const end = (i + 1 < ps.length) ? ps[i + 1].t : T;
    const oldDur = end - start;
    const k = sec / oldDur, shift = sec - oldDur;
    const map = (t) => (t <= start + 1e-9 ? t : (t >= end - 1e-9 ? t + shift : start + (t - start) * k));
    const round = (t) => Math.round(t * 1000) / 1000;

    ps.forEach((p) => { p.t = round(map(p.t)); });
    /* 「下ろす 3秒」「上で2秒止める」のような秒数を書き換える */
    ps[i].label = ps[i].label.replace(/\d+(?:\.\d+)?(?:〜\d+(?:\.\d+)?)?\s*秒/, sec + '秒');

    const keys = clone(b.keys);
    keys.forEach((key) => { key.t = round(map(key.t)); });

    const m = {
      id: id,
      view: clone(b.view), phases: ps,
      props: clone(b.props), feet: clone(b.feet), hands: clone(b.hands),
      anchor: clone(b.anchor), contacts: clone(b.contacts),
      dumbbells: clone(b.dumbbells), balance: clone(b.balance),
      base: clone(b.base), keys: keys
    };
    Object.keys(m).forEach((x) => { if (m[x] === undefined) delete m[x]; });
    return M.register(m);
  }

  M.deriveFrom = derive;
  M.retime = retime;

  /* ============ テンポ・止める時間だけ変わる組み方 ============ */
  retime('lateral', 'lateral_slow', /^下ろす/, 5);
  retime('front', 'front_slow', /^下ろす/, 5);
  retime('curl', 'curl_slow', /^下ろす/, 4);
  retime('triext', 'triext_slow', /^戻す/, 4);
  retime('skull', 'skull_slow', /^戻す/, 4);
  retime('fly', 'fly_slow', /^開く/, 4);
  retime('floorpress', 'floorpress_slow', /^下ろす/, 3);
  retime('pushupknee', 'pushupknee_slow', /^下ろす/, 3);
  retime('sumo', 'sumo_slow', /^下ろす/, 3);
  retime('splitfloor', 'splitfloor_slow', /^沈む/, 3);
  retime('sidelunge', 'sidelunge_slow', /沈む/, 3);
  retime('sidebend', 'sidebend_slow', /^横に倒す/, 3);
  retime('deadbug', 'deadbug_slow', /^右腕と左脚を伸ばす/, 4);
  retime('hipthrust', 'hipthrust_hold', /^上で\d+秒止める/, 3);
  retime('shrug', 'shrug_hold', /^上で\d+秒止める/, 2);
  retime('row2', 'row2_hold', /^上で\d+秒止める/, 2);
  retime('calfseat', 'calfseat_hold', /^一番上で\d+秒止める/, 2);
  retime('row', 'row_pause', /^上で\d+秒止める/, 2);


  /* ============ 深さ・角度が変わる組み方 ============ */
  derive('goblet', { id: 'goblet_deep',
    keys: { 3.5: { 'pelvis.y': 0.386, 'pelvis.pitch': 32 }, 4.1: { 'pelvis.y': 0.386, 'pelvis.pitch': 32 } } });
  derive('goblet', { id: 'goblet_box',
    keys: { 2.2: { 'pelvis.y': 0.640 }, 3.5: { 'pelvis.y': 0.560, 'pelvis.pitch': 24 },
            4.1: { 'pelvis.y': 0.560, 'pelvis.pitch': 24 }, 4.6: { 'pelvis.y': 0.700 } } });
  derive('rdl', { id: 'rdl_deep',
    keys: { 3.4: { 'pelvis.pitch': 90, 'pelvis.y': 0.893 } } });
  derive('rdl1', { id: 'rdl1_deep',
    keys: { 3.4: { 'pelvis.pitch': 90, 'pelvis.y': 0.893 } } });
  derive('sumo', { id: 'sumo_shallow',
    keys: { 2.2: { 'pelvis.y': 0.660 }, 3.5: { 'pelvis.y': 0.560, 'pelvis.pitch': 24 },
            4.1: { 'pelvis.y': 0.560, 'pelvis.pitch': 24 }, 4.6: { 'pelvis.y': 0.720 } } });
  derive('sidelunge', { id: 'sidelunge_shallow',
    keys: { 2.2: { 'pelvis.y': 0.890, 'pelvis.z': 0.100 }, 3.5: { 'pelvis.y': 0.870, 'pelvis.z': 0.130 },
            4.1: { 'pelvis.y': 0.870, 'pelvis.z': 0.130 }, 4.6: { 'pelvis.y': 0.900, 'pelvis.z': 0.090 } } });
  derive('fly', { id: 'fly_shallow',
    keys: { 0: { 'upperarmR.abd': 52, 'upperarmL.abd': 52 }, 5: { 'upperarmR.abd': 52, 'upperarmL.abd': 52 } } });
  derive('bridge', { id: 'bridge_low',
    keys: { 1.3: { 'pelvis.pitch': -104 }, 3.3: { 'pelvis.pitch': -104 } } });

  /* ============ 片側だけ動かす組み方 ============ */
  /* ダンベルショルダープレス: 右手だけ押し上げ、左手は体の横に下ろす */
  derive('ohp', { id: 'ohp_one',
    set: { dumbbells: [{ grip: 'handR', kg: 5 }] },
    base: { 'upperarmL.flex': 5, 'upperarmL.abd': 10, 'upperarmL.rot': 0, 'forearmL.flex': 12, 'forearmL.rot': 86 },
    keys: { 0: { 'upperarmL.flex': 5, 'upperarmL.abd': 10, 'upperarmL.rot': 0, 'forearmL.flex': 12, 'forearmL.rot': 86 }, 1.0: { 'upperarmL.flex': 5, 'upperarmL.abd': 10, 'upperarmL.rot': 0, 'forearmL.flex': 12, 'forearmL.rot': 86 }, 1.3: { 'upperarmL.flex': 5, 'upperarmL.abd': 10, 'upperarmL.rot': 0, 'forearmL.flex': 12, 'forearmL.rot': 86 }, 4.3: { 'upperarmL.flex': 5, 'upperarmL.abd': 10, 'upperarmL.rot': 0, 'forearmL.flex': 12, 'forearmL.rot': 86 } } });

  /* フロントレイズ: 右手だけ上げる */
  derive('front', { id: 'front_one',
    set: { dumbbells: [{ grip: 'handR', kg: 5 }] },
    base: { 'upperarmL.flex': 8, 'upperarmL.abd': 4 },
    keys: { 0: { 'upperarmL.flex': 8 }, 1.2: { 'upperarmL.flex': 8 }, 1.5: { 'upperarmL.flex': 8 }, 5.5: { 'upperarmL.flex': 8 } } });

  /* ファーマーズウォーク: 片手だけで持つ */
  derive('farmer', { id: 'farmer_one',
    set: { dumbbells: [{ grip: 'handR', kg: 5 }] } });

  /* ダンベルカール: 右手だけ巻き上げ、左手は右肘に添える */
  derive('curl', { id: 'curl_one',
    set: { dumbbells: [{ grip: 'handR', kg: 5 }] },
    base: { 'upperarmL.flex': 26, 'upperarmL.abd': -14, 'upperarmL.rot': 24,
            'forearmL.flex': 96, 'forearmL.rot': 40, 'handL.flex': 0 },
    keys: { 0: { 'forearmL.flex': 96 }, 1.3: { 'forearmL.flex': 96 }, 1.6: { 'forearmL.flex': 96 }, 5.1: { 'forearmL.flex': 96 } } });

  /* 腹筋（クランチ）: 胸にダンベルを抱える／腕を体の横に置く */
  derive('crunch', { id: 'crunch_db',
    set: { dumbbells: [{ grip: 'both', axis: 'bone', bone: 'spineC', kg: 5, local: HAND.grip, offset: [0.06, -0.10, 0] }] },
    base: { 'upperarmR.flex': 36, 'upperarmR.abd': -10, 'forearmR.flex': 128, 'forearmR.rot': 40,
            'upperarmL.flex': 36, 'upperarmL.abd': -10, 'forearmL.flex': 128, 'forearmL.rot': 40 },
    keys: { 0: { 'upperarmR.flex': 36, 'upperarmR.abd': -10, 'forearmR.flex': 128,
                 'upperarmL.flex': 36, 'upperarmL.abd': -10, 'forearmL.flex': 128 },
            1.5: { 'upperarmR.flex': 40, 'upperarmR.abd': -8, 'forearmR.flex': 130,
                   'upperarmL.flex': 40, 'upperarmL.abd': -8, 'forearmL.flex': 130 },
            4.0: { 'upperarmR.flex': 36, 'upperarmR.abd': -10, 'forearmR.flex': 128,
                   'upperarmL.flex': 36, 'upperarmL.abd': -10, 'forearmL.flex': 128 } } });
  derive('crunch', { id: 'crunch_arms',
    base: { 'upperarmR.flex': 8, 'upperarmR.abd': 12, 'forearmR.flex': 10, 'forearmR.rot': 120,
            'upperarmL.flex': 8, 'upperarmL.abd': 12, 'forearmL.flex': 10, 'forearmL.rot': 120 },
    keys: { 0: { 'upperarmR.flex': 8, 'upperarmR.abd': 12, 'forearmR.flex': 10,
                 'upperarmL.flex': 8, 'upperarmL.abd': 12, 'forearmL.flex': 10 },
            1.5: { 'upperarmR.flex': 14, 'upperarmR.abd': 12, 'forearmR.flex': 10,
                   'upperarmL.flex': 14, 'upperarmL.abd': 12, 'forearmL.flex': 10 },
            4.0: { 'upperarmR.flex': 8, 'upperarmR.abd': 12, 'forearmR.flex': 10,
                   'upperarmL.flex': 8, 'upperarmL.abd': 12, 'forearmL.flex': 10 } } });

  /* ダンベルフロアプレス: 右手だけ押し、左手は床に置く */
  derive('floorpress', { id: 'floorpress_one',
    set: { dumbbells: [{ grip: 'handR', kg: 5 }] },
    base: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30, 'forearmL.rot': 0 },
    keys: { 0: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            1: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            2: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            5: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 } } });

  /* トライセプスエクステンション: 右手だけ伸ばし、左手で右肘を支える */
  derive('triext', { id: 'triext_one',
    set: { dumbbells: [{ grip: 'handR', kg: 5 }] },
    base: { 'upperarmL.flex': 130, 'upperarmL.abd': 24, 'upperarmL.rot': 30,
            'forearmL.flex': 110, 'forearmL.rot': 60, 'handL.flex': 0 },
    keys: { 0: { 'forearmL.flex': 110 }, 1.0: { 'forearmL.flex': 110 }, 1.3: { 'forearmL.flex': 110 }, 4.3: { 'forearmL.flex': 110 } } });

  /* フロアトライセプスエクステンション: 右手だけ伸ばし、左手は床に置く */
  derive('skull', { id: 'skull_one',
    set: { dumbbells: [{ grip: 'handR', kg: 5 }] },
    base: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30, 'forearmL.rot': 0 },
    keys: { 0: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            1: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            2: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            5: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 } } });

  /* デッドバグ: 腕だけ動かす（脚は90度のまま） */
  derive('deadbug', { id: 'deadbug_half',
    set: { phases: [{ t: 0, label: '股関節と膝を90度に' }, { t: 2.0, label: '右腕を伸ばす' },
                    { t: 4.0, label: '戻す' }, { t: 6.0, label: '左腕を伸ばす' }] },
    keys: { 1.8: { 'thighL.flex': 88, 'thighL.abd': 0, 'shankL.flex': 88 },
            2.2: { 'thighL.flex': 88, 'thighL.abd': 0, 'shankL.flex': 88 },
            5.8: { 'thighR.flex': 88, 'thighR.abd': 0, 'shankR.flex': 88 },
            6.2: { 'thighR.flex': 88, 'thighR.abd': 0, 'shankR.flex': 88 } } });

  /* ============ 支点・接地が変わる組み方 ============ */
  /* カーフレイズ: 段差を使わず床の上で行う（かかとは床までしか下がらない） */
  const floorCalf = (z) => ({ at: [0.01, 0, z], local: FOOT.ball, pitch: 'footPitch', yaw: 0, pins: [FOOT.ball] });
  derive('calf', { id: 'calf_floor',
    set: { props: [], feet: { R: floorCalf(0.10), L: floorCalf(-0.10) },
           phases: [{ t: 0, label: 'かかとを下ろした位置' }, { t: 0.6, label: 'かかとを上げる 1秒' },
                    { t: 1.6, label: '一番上で2秒止める' }, { t: 3.6, label: '下ろす 3秒' }] },
    base: { footPitch: 0, 'toesR.flex': 0, 'toesL.flex': 0 },
    keys: { 0.0: { footPitch: 0, 'toesR.flex': 0, 'toesL.flex': 0, 'pelvis.y': 0.930 },
            0.6: { footPitch: -6, 'toesR.flex': 6, 'toesL.flex': 6, 'pelvis.y': 0.950 },
            1.6: { footPitch: -30, 'toesR.flex': 30, 'toesL.flex': 30, 'pelvis.y': 1.005 },
            3.6: { footPitch: -30, 'toesR.flex': 30, 'toesL.flex': 30, 'pelvis.y': 1.005 },
            4.8: { footPitch: -5, 'toesR.flex': 5, 'toesL.flex': 5, 'pelvis.y': 0.945 },
            6.6: { footPitch: 0, 'toesR.flex': 0, 'toesL.flex': 0, 'pelvis.y': 0.930 } } });

  /* ヒップリフト: 片脚を浮かせて行う */
  derive('bridge', { id: 'bridge_one',
    set: { feet: { R: { at: [0.52, 0, 0.11], local: [0, -FOOT.ankleH, 0], yaw: 4, pitch: 0,
                        pins: [FOOT.heel, FOOT.ball], pole: [0.2, 1, 0.3] } } },
    base: { 'thighL.flex': -8, 'thighL.abd': 2, 'shankL.flex': 6, 'footL.flex': 10 },
    keys: { 0: { 'thighL.flex': -8, 'shankL.flex': 6 }, 1.0: { 'thighL.flex': -14, 'shankL.flex': 6 },
            1.3: { 'thighL.flex': -18, 'shankL.flex': 6 }, 3.3: { 'thighL.flex': -18, 'shankL.flex': 6 },
            4.6: { 'thighL.flex': -12, 'shankL.flex': 6 }, 5.3: { 'thighL.flex': -8, 'shankL.flex': 6 } } });

  /* プランク: 片脚を浮かせて行う */
  derive('plank', { id: 'plank_leg',
    set: { feet: { R: M.motions.plank.feet.R } },
    base: { 'thighL.flex': -14, 'thighL.abd': 2, 'shankL.flex': 4, 'footL.flex': 16, 'toesL.flex': 20 } });

  /* サイドプランク: 上の脚を浮かせて行う */
  derive('sideplank', { id: 'sideplank_leg',
    base: { 'thighL.abd': -22, 'thighL.flex': 2, 'shankL.flex': 4 } });

  /* ブルガリアンスクワット: 深く沈む */
  derive('split', { id: 'split_deep',
    keys: { 3.0: { 'pelvis.y': 0.640 }, 2.0: { 'pelvis.y': 0.700 } } });

  /* サイドレイズ: 肘を深く曲げて腕を短くする */
  derive('lateral', { id: 'lateral_short',
    base: { 'forearmR.flex': 62, 'forearmL.flex': 62 },
    keys: { 0: { 'forearmR.flex': 62, 'forearmL.flex': 62 }, 1.2: { 'forearmR.flex': 62, 'forearmL.flex': 62 },
            1.5: { 'forearmR.flex': 62, 'forearmL.flex': 62 }, 5.5: { 'forearmR.flex': 62, 'forearmL.flex': 62 } } });
})(typeof window !== 'undefined' ? window : globalThis);
