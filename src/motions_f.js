/* 組み方（楽にする／大変にする）ごとの動き。
   ・テンポや止める時間だけ変わるものは、元の動きの時間を伸ばして作る（retime）
   ・深さや姿勢が変わるものは、元の動きを写して変わるところだけ書き換える（derive）
   ・元の動きに無い場所で止めるものは、新しい静止区間を挿し込んで作る（insertHold） */
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

  /* 元の動きの時刻 atT に、N 秒の静止区間を新しく挿し込む。
     atT にキーが無ければ、その瞬間の姿勢を補間で求めて両端の値が同じキー対を作る
     （エンジンの hold は接線を0にするだけなので、止まって見えるのは値が同じときだけ）。
     atT=0（動きの始まり）や atT=周期（終わり＝始まりと同じ姿勢）にも挿せる。
     label はその位置に新しく付ける場面の名前。挿し込んだ位置に既存の場面がかかっているとき:
       ・その場面がちょうど atT から始まっていた → 名前は新しい場面に譲り、元の場面（秒数つきの
         ものに限る）は止めたあとに同じ長さのまま再開する
       ・atT が場面の途中だった（例: 「巻き上げる」の途中で止める） → 止めたあとは、その場面の
         秒数表記を外した名前（「巻き上げる」など）で再開する（実際の残り時間は元の秒数と違うため）
     後ろのキー・場面は sec 秒ぶん時刻をずらす。 */
  function insertHold(baseId, id, atT, sec, label) {
    const b = M.motions[baseId];
    if (!b) throw new Error('元の動きが無い: ' + baseId);
    const T = M.cycleTime(b);
    const round = (t) => Math.round(t * 1000) / 1000;
    atT = round(atT);

    const names = Object.keys(b.base || {});
    (b.keys || []).forEach((k) => Object.keys(k.d || {}).forEach((n) => { if (names.indexOf(n) < 0) names.push(n); }));
    const d0 = M.driversAt(b, ((atT % T) + T) % T);
    const sampled = {};
    names.forEach((n) => { sampled[n] = d0[n]; });

    const keys = clone(b.keys);
    keys.forEach((k) => { if (k.t > atT + 1e-9) k.t = round(k.t + sec); });
    const startKey = keys.find((k) => Math.abs(k.t - atT) < 1e-6);
    if (startKey) startKey.hold = true;
    else keys.push({ t: atT, hold: true, d: clone(sampled) });
    keys.push({ t: round(atT + sec), hold: true, d: clone(sampled) });
    keys.sort((a, c) => a.t - c.t);

    const ps = clone(b.phases) || [];
    let idx = -1;
    for (let i = 0; i < ps.length; i++) { if (ps[i].t <= atT + 1e-9) idx = i; }
    const containing = idx >= 0 ? ps[idx] : null;
    const startsHere = !!(containing && Math.abs(containing.t - atT) < 1e-6);
    if (startsHere) ps.splice(idx, 1);
    ps.forEach((p) => { if (p.t > atT + 1e-9) p.t = round(p.t + sec); });
    ps.push({ t: atT, label: label });
    if (containing) {
      if (startsHere) {
        if (/\d/.test(containing.label)) ps.push({ t: round(atT + sec), label: containing.label });
      } else {
        const stripped = containing.label.replace(/[\d.〜]+秒.*$/, '').trim();
        if (stripped) ps.push({ t: round(atT + sec), label: stripped });
      }
    }
    ps.sort((a, c) => a.t - c.t);

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
  M.insertHold = insertHold;

  /* ============ 止める組み方: 既にある場面を伸ばして名前を付け直す ============ */
  /* 「一番下」のように既に一番下・一番上で止まっている場面を、そのまま長く伸ばす */
  (function () {
    const m = retime('goblet', 'goblet_hold', /^一番下$/, 3);
    m.phases.find((p) => p.label === '一番下').label = '一番下で3秒止める';
  })();
  (function () {
    const m = retime('sumo', 'sumo_hold', /^一番下$/, 2);
    m.phases.find((p) => p.label === '一番下').label = '一番下で2秒止める';
  })();
  (function () {
    const m = retime('sidelunge', 'sidelunge_hold', /^一番下$/, 2);
    m.phases.find((p) => p.label === '一番下').label = '一番下で2秒止める';
  })();
  (function () {
    const m = retime('lateral', 'lateral_hold', /肩の高さで止める/, 2);
    m.phases.find((p) => p.label === '肩の高さで止める').label = '上で2秒止める';
  })();
  (function () {
    const m = retime('front', 'front_hold', /肩の高さで止める/, 2);
    m.phases.find((p) => p.label === '肩の高さで止める').label = '上で2秒止める';
  })();
  /* ラベルに秒数が既にあるので retime の自動書き換えでそのまま文言が揃う */
  retime('sidebend', 'sidebend_hold', /^一番下で\d+秒止める/, 3);
  retime('shrug', 'shrug_hold', /^上で\d+秒止める/, 3);
  retime('row2', 'row2_hold', /^上で[\d.]+秒止める/, 3);

  /* ============ 止める組み方: 元の動きに新しい静止区間を挿し込む ============ */
  insertHold('rdl', 'rdl_hold', 3.4, 2, '一番下で2秒止める');
  insertHold('rdl1', 'rdl1_hold', 3.4, 2, '一番下で2秒止める');
  insertHold('deadlift', 'deadlift_hold', 3.4, 2, '一番下で2秒止める');
  insertHold('split', 'split_hold', 3.0, 2, '一番下で2秒止める');
  insertHold('splitfloor', 'splitfloor_hold', 3.0, 2, '一番下で2秒止める');
  /* row の t=0 はもともと「腕を垂らした位置」で0.4秒の場面（秒数なし）。
     この0.4秒は新しい場面にそのまま吸収されるので、合計が2秒になるよう1.6秒だけ挿し込む */
  insertHold('row', 'row_hold', 0, 1.6, '下で2秒止める');
  insertHold('floorpress', 'floorpress_hold', 0, 2, '一番下で2秒止める');
  insertHold('pushupknee', 'pushupknee_hold', 3.0, 2, '一番下で2秒止める');
  insertHold('fly', 'fly_hold', 0, 2, '床の手前で2秒止める');
  insertHold('triext', 'triext_hold', 0, 2, '下ろしたところで2秒止める');
  insertHold('skull', 'skull_hold', 0, 2, '下ろしたところで2秒止める');
  /* 前腕が床と平行（肘の曲げ約90°）になる付近。巻き上げ始めの約0.75秒後 */
  insertHold('curl', 'curl_hold', 0.75, 2, '途中で2秒止める');
  /* ダンベルプルオーバー: t=3.0 はもともと「頭の後ろで止める」で0.4秒の場面（秒数なし）。
     この0.4秒は新しい場面にそのまま吸収されるので、合計が2秒になるよう1.6秒だけ挿し込む */
  insertHold('pullover', 'pullover_hold', 3.0, 1.6, '頭の後ろで2秒止める');

  /* ============ 深さ・角度が変わる組み方（楽にする方） ============ */
  derive('goblet', { id: 'goblet_box',
    keys: { 2.2: { 'pelvis.y': 0.640 }, 3.5: { 'pelvis.y': 0.560, 'pelvis.pitch': 24 },
            4.1: { 'pelvis.y': 0.560, 'pelvis.pitch': 24 }, 4.6: { 'pelvis.y': 0.700 } } });
  derive('sumo', { id: 'sumo_shallow',
    keys: { 2.2: { 'pelvis.y': 0.660 }, 3.5: { 'pelvis.y': 0.560, 'pelvis.pitch': 24 },
            4.1: { 'pelvis.y': 0.560, 'pelvis.pitch': 24 }, 4.6: { 'pelvis.y': 0.720 } } });
  derive('sidelunge', { id: 'sidelunge_shallow',
    keys: { 2.2: { 'pelvis.y': 0.890, 'pelvis.z': 0.100 }, 3.5: { 'pelvis.y': 0.870, 'pelvis.z': 0.130 },
            4.1: { 'pelvis.y': 0.870, 'pelvis.z': 0.130 }, 4.6: { 'pelvis.y': 0.900, 'pelvis.z': 0.090 } } });
  derive('fly', { id: 'fly_shallow',
    keys: { 0: { 'upperarmR.abd': 52, 'upperarmL.abd': 52 }, 4.6: { 'upperarmR.abd': 52, 'upperarmL.abd': 52 } } });
  derive('bridge', { id: 'bridge_low',
    set: { phases: [{ t: 0, label: '持ち上げる 1.3秒' }, { t: 1.3, label: '上で2秒止める' },
                    { t: 3.3, label: '下ろす 2秒' }] },
    keys: { 1.3: { 'pelvis.pitch': -104 }, 3.3: { 'pelvis.pitch': -104 } } });
  derive('pullover', { id: 'pullover_shallow',
    keys: { 1.8: { 'upperarmR.flex': 105, 'upperarmL.flex': 105 },
            3.0: { 'upperarmR.flex': 120, 'upperarmL.flex': 120 },
            3.4: { 'upperarmR.flex': 120, 'upperarmL.flex': 120 } } });

  /* スライディングレッグカール: 左脚は曲げたまま浮かせて止め、右脚だけを滑らせる */
  const SC_BENT = { 'thighL.flex': 18.5, 'shankL.flex': 116, 'footL.flex': 14 };
  derive('slidecurl', { id: 'slidecurl_one',
    keys: { 0.0: SC_BENT, 0.7: SC_BENT, 1.4: SC_BENT, 2.0: SC_BENT, 2.3: SC_BENT, 3.0: SC_BENT, 3.7: SC_BENT, 4.3: SC_BENT } });

  /* ロシアンツイスト: ダンベルを両手でまとめて持つ（動きはそのまま）。
     胸の高さで持つので、フロアプレス系と違って下げすぎると太ももに当たる。手の位置より少し上で持つ */
  derive('twist', { id: 'twist_db',
    set: { dumbbells: [{ grip: 'both', axis: 'vertical', kg: 5, offset: [0, 0.08, 0] }] } });

  /* ロシアンツイスト: ひねる角度を浅くする */
  const twistShallow = (bend) => ({ 'spineL.rot': bend * 5, 'spineT.rot': bend * 8, 'spineC.rot': bend * 10 });
  derive('twist', { id: 'twist_shallow',
    keys: { 1.4: twistShallow(1), 1.7: twistShallow(1), 4.5: twistShallow(-1), 4.8: twistShallow(-1) } });

  /* スライディングレッグカール: 浅く行う（伸ばしきらない） */
  derive('slidecurl', { id: 'slidecurl_shallow',
    keys: { 1.4: { 'thighR.flex': 12, 'shankR.flex': 88, 'footR.flex': -9,
                   'thighL.flex': 12, 'shankL.flex': 88, 'footL.flex': -9 },
            2.0: { 'thighR.flex': 9, 'shankR.flex': 78, 'footR.flex': -14,
                   'thighL.flex': 9, 'shankL.flex': 78, 'footL.flex': -14 },
            2.3: { 'thighR.flex': 9, 'shankR.flex': 78, 'footR.flex': -14,
                   'thighL.flex': 9, 'shankL.flex': 78, 'footL.flex': -14 },
            3.0: { 'thighR.flex': 12, 'shankR.flex': 88, 'footR.flex': -9,
                   'thighL.flex': 12, 'shankL.flex': 88, 'footL.flex': -9 } } });

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
    base: { 'upperarmR.flex': -40, 'upperarmR.abd': 70, 'forearmR.flex': 30, 'forearmR.rot': 0,
            'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30, 'forearmL.rot': 0 },
    keys: { 0: { 'upperarmR.flex': -40, 'upperarmR.abd': 70, 'forearmR.flex': 30,
                 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            1.5: { 'upperarmR.flex': -36, 'upperarmR.abd': 70, 'forearmR.flex': 30,
                   'upperarmL.flex': -36, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            4.0: { 'upperarmR.flex': -40, 'upperarmR.abd': 70, 'forearmR.flex': 30,
                   'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 } } });

  /* ダンベルフロアプレス: 右手だけ押し、左手は床に置く */
  derive('floorpress', { id: 'floorpress_one',
    set: { dumbbells: [{ grip: 'handR', kg: 5 }] },
    base: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30, 'forearmL.rot': 0 },
    keys: { 0: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            1: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            2.6: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            4: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 } } });

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
            1.6: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 },
            4.6: { 'upperarmL.flex': -40, 'upperarmL.abd': 70, 'forearmL.flex': 30 } } });

  /* デッドバグ: 腕だけ動かす（脚は90度のまま） */
  derive('deadbug', { id: 'deadbug_half',
    set: { phases: [{ t: 0, label: '右腕を伸ばす 1.8秒' }, { t: 1.8, label: 'そのまま止める' },
                    { t: 2.2, label: '戻す 1.8秒' }, { t: 4.0, label: '左腕を伸ばす 1.8秒' },
                    { t: 5.8, label: 'そのまま止める' }, { t: 6.2, label: '戻す 1.8秒' }] },
    keys: { 1.8: { 'thighL.flex': 88, 'thighL.abd': 0, 'shankL.flex': 88 },
            2.2: { 'thighL.flex': 88, 'thighL.abd': 0, 'shankL.flex': 88 },
            5.8: { 'thighR.flex': 88, 'thighR.abd': 0, 'shankR.flex': 88 },
            6.2: { 'thighR.flex': 88, 'thighR.abd': 0, 'shankR.flex': 88 } } });
  /* デッドバグ: 両手に1つずつダンベルを持って行う（動きはそのまま） */
  derive('deadbug', { id: 'deadbug_db',
    set: { dumbbells: [{ grip: 'handR', kg: 5 }, { grip: 'handL', kg: 5 }] } });

  /* ============ 支点・接地が変わる組み方 ============ */
  /* カーフレイズ: 段差を使わず床の上で行う（かかとは床までしか下がらない） */
  const floorCalf = (z) => ({ at: [0.01, 0, z], local: FOOT.ball, pitch: 'footPitch', yaw: 0, pins: [FOOT.ball] });
  derive('calf', { id: 'calf_floor',
    set: { props: [], feet: { R: floorCalf(0.10), L: floorCalf(-0.10) },
           phases: [{ t: 0, label: 'かかとを上げる 1.6秒' },
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
    base: { 'thighL.flex': 30, 'thighL.abd': 2, 'shankL.flex': 4, 'footL.flex': 10 },
    keys: { 0: { 'thighL.flex': 30, 'shankL.flex': 4 }, 1.0: { 'thighL.flex': 24, 'shankL.flex': 4 },
            1.3: { 'thighL.flex': 20, 'shankL.flex': 4 }, 3.3: { 'thighL.flex': 20, 'shankL.flex': 4 },
            4.6: { 'thighL.flex': 26, 'shankL.flex': 4 }, 5.3: { 'thighL.flex': 30, 'shankL.flex': 4 } } });

  /* プランク: 片脚を浮かせて行う */
  derive('plank', { id: 'plank_leg',
    set: { feet: { R: M.motions.plank.feet.R } },
    base: { 'thighL.flex': -14, 'thighL.abd': 2, 'shankL.flex': 4, 'footL.flex': 16, 'toesL.flex': 20 } });

  /* サイドプランク: 上の脚を浮かせて行う */
  derive('sideplank', { id: 'sideplank_leg',
    base: { 'thighL.abd': 26, 'thighL.flex': 2, 'shankL.flex': 4 },
    keys: { 0: { 'thighL.abd': 26 }, 2.0: { 'thighL.abd': 26 }, 3.0: { 'thighL.abd': 26 },
            4.0: { 'thighL.abd': 26 }, 5.0: { 'thighL.abd': 26 } } });

  /* サイドレイズ: 肘を深く曲げて腕を短くする */
  derive('lateral', { id: 'lateral_short',
    base: { 'forearmR.flex': 62, 'forearmL.flex': 62 },
    keys: { 0: { 'forearmR.flex': 62, 'forearmL.flex': 62 }, 1.2: { 'forearmR.flex': 62, 'forearmL.flex': 62 },
            1.5: { 'forearmR.flex': 62, 'forearmL.flex': 62 }, 5.5: { 'forearmR.flex': 62, 'forearmL.flex': 62 } } });

  /* シーテッドカーフレイズ: 片脚ずつ行う。ダンベル2つを右膝にまとめ、右足だけ上げ下げする。
     左足は床にフラットに置いたまま（footPitch を追わない固定ピッチにする） */
  const seatFoot = (z) => ({ at: [0.56, 0, z], local: FOOT.ball, pitch: 'footPitch', yaw: 0, pins: [FOOT.ball],
                              pole: [0.5, 1, z > 0 ? 0.2 : -0.2] });
  const seatFootStill = (z) => ({ at: [0.56, 0, z], local: FOOT.ball, pitch: 0, yaw: 0,
                                   pins: [FOOT.heel, FOOT.ball] });
  derive('calfseat', { id: 'calfseat_single',
    set: {
      feet: { R: seatFoot(0.11), L: seatFootStill(-0.11) },
      dumbbells: [{ grip: 'handR', kg: 5, local: [0, -0.05, 0.03] }, { grip: 'handL', kg: 5, local: [0, -0.05, -0.03] }]
    },
    base: {
      'upperarmL.flex': 34, 'upperarmL.abd': -26, 'upperarmL.rot': -4,
      'forearmL.flex': 62, 'forearmL.rot': 150, 'handL.flex': 0
    } });
  /* ============ 2026-10-04 追加の4種目（sissy/rear/abduct/hammer）の組み方 ============ */

  /* シシースクワット: 一番下で2秒止める */
  (function () {
    const m = retime('sissy', 'sissy_hold', /^一番下$/, 2);
    m.phases.find((p) => p.label === '一番下').label = '一番下で2秒止める';
  })();

  /* シシースクワット: 浅めに沈み、膝が90度に曲がる手前で戻る */
  derive('sissy', { id: 'sissy_shallow',
    keys: { 3.0: { 'pelvis.pitch': -18, 'shankR.flex': 60, 'shankL.flex': 60,
                    'footR.flex': 10, 'footL.flex': 10, 'toesR.flex': 40, 'toesL.flex': 40 },
            3.3: { 'pelvis.pitch': -18, 'shankR.flex': 60, 'shankL.flex': 60,
                    'footR.flex': 10, 'footL.flex': 10, 'toesR.flex': 40, 'toesL.flex': 40 } } });

  /* リアレイズ: 肩の高さで上で2秒止める */
  insertHold('rear', 'rear_hold', 1.2, 2, '上で2秒止める');

  /* リアレイズ: 肘を深く曲げて腕を短くする（サイドレイズの lateral_short と同じ考え方） */
  derive('rear', { id: 'rear_short',
    base: { 'forearmR.flex': 62, 'forearmL.flex': 62 },
    keys: { 0: { 'forearmR.flex': 62, 'forearmL.flex': 62 }, 1.2: { 'forearmR.flex': 62, 'forearmL.flex': 62 },
            1.5: { 'forearmR.flex': 62, 'forearmL.flex': 62 }, 4.5: { 'forearmR.flex': 62, 'forearmL.flex': 62 } } });

  /* ヒップアブダクション: 太ももの付け根寄り（太ももの長さの15%・前へ10cm）にダンベルを乗せ、上の手で押さえる。
     手は IK で太ももの骨（thighL）に付ける（脚がどの角度でも、握りが太ももに乗ったまま動く）。
     置く場所は腕が届く範囲で決めてある: 肩から腰まで約53cmあり、腕の長さ（約55cm）にほとんど余裕が無い。
     膝に近づけたり真横に置いたりすると届かず、IK が伸びきって手が太ももから浮く */
  derive('abduct', { id: 'abduct_db',
    set: {
      hands: { L: { at: { bone: 'thighL', local: [0.10, -0.43 * 0.15, -0.17] }, local: HAND.grip,
                    pitch: 40, yaw: -10, roll: 0, pole: [-1, 0.2, 0.3] } },
      dumbbells: [{ grip: 'handL', kg: 5, local: HAND.grip }]
    } });

  /* ヒップアブダクション: 上の脚の膝を曲げて行う（脚全体を曲げたまま上げる） */
  derive('abduct', { id: 'abduct_bent',
    base: { 'shankL.flex': 90 },
    keys: { 0.0: { 'shankL.flex': 90 }, 1.0: { 'shankL.flex': 90 },
            1.3: { 'shankL.flex': 90 }, 3.3: { 'shankL.flex': 90 } } });

  /* ハンマーカール: 途中で2秒止める（curl_hold と同じ構成） */
  insertHold('hammer', 'hammer_hold', 0.75, 2, '途中で2秒止める');

  /* ハンマーカール: 右手だけ巻き上げ、左手は右肘に添える（curl_one と同じ構成） */
  derive('hammer', { id: 'hammer_one',
    set: { dumbbells: [{ grip: 'handR', kg: 5 }] },
    base: { 'upperarmL.flex': 26, 'upperarmL.abd': -14, 'upperarmL.rot': 24,
            'forearmL.flex': 96, 'forearmL.rot': 40, 'handL.flex': 0 },
    keys: { 0: { 'forearmL.flex': 96 }, 1.3: { 'forearmL.flex': 96 }, 1.6: { 'forearmL.flex': 96 }, 5.1: { 'forearmL.flex': 96 } } });

  /* ヒップアダクション: 上で2秒止める */
  insertHold('adduct', 'adduct_hold', 1.0, 2, '上で2秒止める');

  /* バックエクステンション: 上で3秒止める */
  insertHold('backext', 'backext_hold', 2.0, 3, '上で3秒止める');

  /* バックエクステンション: 腕を体の横に伸ばす。
     下ろした姿勢では腕を体の横の床に置き、起こすときは上体と一緒に床から浮かせる（手で床を押さない）。
     腕は胸についていくので、そのままだと起こしたときに手が床へ沈む。肩を後ろへ引いた角度を上のキーに入れてある */
  derive('backext', { id: 'backext_arms',
    base: { 'upperarmR.abd': 8, 'upperarmR.rot': 31, 'forearmR.flex': 5, 'forearmR.rot': 149, 'handR.flex': 9,
            'upperarmL.abd': 8, 'upperarmL.rot': 31, 'forearmL.flex': 5, 'forearmL.rot': 149, 'handL.flex': 9 },
    keys: { 0.0: { 'upperarmR.flex': 7, 'upperarmL.flex': 7 }, 2.0: { 'upperarmR.flex': -18, 'upperarmL.flex': -18 },
            2.3: { 'upperarmR.flex': -18, 'upperarmL.flex': -18 }, 4.3: { 'upperarmR.flex': 7, 'upperarmL.flex': 7 } } });

  /* 腕立て伏せ: 床に置いた2つのダンベルの柄（左右方向。2本が一直線に並ぶ）に手のひらを乗せて行う。
     手は指が曲がらない1本の棒（長さ15cm）なので、柄を握る代わりに、手のひらを柄の上にかぶせて
     指先を前下へ PHI 度傾ける（'surface' の法線を前へ倒す）。こうすると手首が床から約13cmの高さに来て、
     柄は水平のまま床に乗り（ダンベルの中心の高さ5.2cm）、指先は床の上に収まる。
     ・手のひらの当たる点は手首から8.5cm・手の軸から2cm（local）。柄の中心はそこから柄の半径ぶん外（dumbbells.local）
     ・手の位置は元の腕立て伏せとほぼ同じ（左右の間隔64cm。元は60cm）。手首が高いぶん肘が深く曲がるので、
       肘の曲げが目安（145°）に収まるところまで、少しだけ外・足側へ寄せている
     ・体は元の腕立て伏せと同じ板の姿勢で、つま先を支点に回す。一番下（t=3.0）は元と同じ高さ、
       上は手首が高いぶんだけ肩を高くしている（肩と手首の高さの差を元と同じ44.9cmにそろえる）
     ・t=2.25・3.4・3.75 は、つま先の接地がずれないようにするための中継点 */
  (function () {
    const PHI = 40 * Math.PI / 180, BAR = 0.016, DB_Y = 0.052, X = 0.10, Z = 0.32;
    const PALM = [0.020, -0.085, 0], N = [-Math.sin(PHI), -Math.cos(PHI), 0];
    const hand = s => ({ at: [X + BAR * Math.sin(PHI), DB_Y + BAR * Math.cos(PHI), s * Z], local: PALM,
                         align: 'surface', normal: N, pins: [PALM], pole: [-1, 0.1, s * 0.8] });
    const db = [PALM[0] + BAR, PALM[1], 0];
    const m = derive('pushup', { id: 'pushup_deep',
      set: {
        hands: { R: hand(1), L: hand(-1) },
        dumbbells: [{ grip: 'handR', kg: 5, local: db }, { grip: 'handL', kg: 5, local: db }]
      } });
    m.keys = [
      { t: 0.0, hold: true, d: { 'pelvis.x': -0.418172, 'pelvis.y': 0.435679, 'pelvis.pitch': 74.1512 } },
      { t: 1.5, d: { 'pelvis.x': -0.401751, 'pelvis.y': 0.396281, 'pelvis.pitch': 76.6870 } },
      { t: 2.25, d: { 'pelvis.x': -0.365747, 'pelvis.y': 0.284626, 'pelvis.pitch': 83.6605 } },
      { t: 3.0, hold: true, d: { 'pelvis.x': -0.345, 'pelvis.y': 0.180, 'pelvis.pitch': 90 } },
      { t: 3.4, d: { 'pelvis.x': -0.364760, 'pelvis.y': 0.280747, 'pelvis.pitch': 83.8982 } },
      { t: 3.75, d: { 'pelvis.x': -0.400397, 'pelvis.y': 0.392800, 'pelvis.pitch': 76.9089 } },
      { t: 4.0, hold: true, d: { 'pelvis.x': -0.418172, 'pelvis.y': 0.435679, 'pelvis.pitch': 74.1512 } }
    ];
  })();

})(typeof window !== 'undefined' ? window : globalThis);
