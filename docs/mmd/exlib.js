/**
 * 種目の中身。exrig.js の pose に渡す形（骨盤と胸の向き、手首と足首の位置）を、
 * 動きの進み具合 u（0 = 始めの姿勢、1 = 動ききった姿勢）から作る。
 * 姿勢は、トレーニング記録アプリの各種目の「やり方」の文に合わせる。
 * 座標: +Y 上、+Z 正面、+X モデルの左。長さはモデルの単位（1 ≒ 7.75 cm）。
 */
import * as THREE from './vendor/three/three.module.js';
import { V } from './exrig.js';

const lerp = (a, b, u) => a + (b - a) * u;
const ss = u => u * u * (3 - 2 * u);
const D = Math.PI / 180;
const N = v => v.clone().normalize();
const mix = (a, b, u) => a.clone().lerp(b, u);
const mixN = (a, b, u) => mix(a, b, u).normalize();
const mid = (a, b) => a.clone().add(b).multiplyScalar(0.5);
const Qx = deg => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), deg * D);
const Qy = deg => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), deg * D);
const Qz = deg => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), deg * D);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const FEET = ['左足首', '右足首'];

// 時間 → 進み具合。下ろす・止める・上げる・止める。
export function phaseAt(ex, t) {
  if (ex.cycle) return { u: (t / ex.cycle) % 1, k: 0 };      // 歩く種目: 1 周を 0→1 で回し続ける
  const tp = ex.tempo || [1.6, 0.4, 1.3, 0.5];
  const per = tp[0] + tp[1] + tp[2] + tp[3];
  const k = Math.floor(t / per), x = t - k * per;
  let u;
  if (x < tp[0]) u = ss(x / tp[0]);
  else if (x < tp[0] + tp[1]) u = 1;
  else if (x < tp[0] + tp[1] + tp[2]) u = 1 - ss((x - tp[0] - tp[1]) / tp[2]);
  else u = 0;
  return { u, k: ex.alt ? k % 2 : 0 };
}

// 道具（台、段差、タオル、柱）。種目が props で名前を挙げたものだけ出す。
export function makeProps(scene, rig, grid) {
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 });
  const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  const P = {
    bench: box(6, 5.4, 14, 0x4b5563),       // 椅子・ベッドの縁（高さ 42 cm ほど）
    step: box(8, 1.3, 4, 0x4b5563),          // 段差
    towel: box(5, 0.06, 2.6, 0xcbd5e1),
    pole: new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 26, 16), mat(0x6b7280)),
    lane: new THREE.Group(),                 // 歩く種目の床の目印（床と一緒に後ろへ流す）
  };
  for (let i = -12; i <= 12; i++) for (const x of [-3.4, 3.4]) { const b = box(1.2, 0.04, 0.22, 0x64748b); b.position.set(x, 0, i * 2); P.lane.add(b); }
  for (const k in P) { P[k].visible = false; scene.add(P[k]); }
  return {
    P,
    show(spec) {
      for (const k in P) {
        P[k].visible = !!spec[k];
        if (!spec[k]) continue;
        P[k].position.set(spec[k][0], spec[k][1], spec[k][2]);
        P[k].rotation.y = (spec[k][3] || 0) * D;
      }
    },
    update(spec) {
      if (spec.props) for (const k in spec.props) if (P[k]) P[k].position.set(spec.props[k][0], spec.props[k][1], spec.props[k][2]);
      // scroll = 歩いた長さ。床の目（2 ごと）と目印を、同じだけ後ろへ流す
      const z = spec.scroll ? -(spec.scroll % 2) : 0;
      if (grid) grid.position.z = z;
      P.lane.position.z = z;
    },
  };
}

// ---------------------------------------------------------------- 部品
// 股関節の真ん中 / 肩の真ん中を、決めた場所へ合わせる
const pinHip = (y, z, x = 0) => c => V(x, y, z).sub(mid(c.hipL, c.hipR));
const pinSh = (x, y, z) => c => V(x, y, z).sub(mid(c.shL, c.shR));
// ひざの曲げ（度）を決めたときの、足首から股関節までの長さ
const legLen = (m, bend) => Math.sqrt(m.legL.L1 ** 2 + m.legL.L2 ** 2 + 2 * m.legL.L1 * m.legL.L2 * Math.cos(bend * D));

// 立っているときの足首（w は左右の足首の間、z は前後、out はつま先を外へ向ける角度）
const feet = (w = 1.66, z = 0, out = 0) => {
  const f = sg => c => {
    const L = sg > 0 ? c.m.legL : c.m.legR, d = V(sg * Math.sin(out * D), 0, Math.cos(out * D));
    return { pos: [sg * w / 2, L.ankleH, z + L.A.z], toe: d, pole: d };
  };
  return { footL: f(1), footR: f(-1) };
};
// かかとを上げる（a 度。負ならかかとを下げる）。指の付け根 (px, gy, pz) は動かさない。
const heelUp = (m, sg, px, pz, a, o = {}) => {
  const t = V(0, -Math.sin(a * D), Math.cos(a * D)), n = V(0, Math.cos(a * D), Math.sin(a * D));
  const q = Qy(sg * (o.out || 0));
  t.applyQuaternion(q); n.applyQuaternion(q);
  const pos = V(px, (o.gy || 0) + m.toeY, pz).addScaledVector(n, m.toeDown).addScaledVector(t, -m.toeFwd);
  const fw = V(0, 0, 1).applyQuaternion(q);
  return { pos, toe: t, up: n, toeFlat: true, toeDir: fw, toeUp: Y, pole: o.pole || fw };
};

// 上腕の向き ud と前腕の向き fd（世界）から、手首の位置とひじの出る側を作る
const armFK = (c, sg, ud, fd, def) => {
  const A = c.m.armL, S = sg > 0 ? c.shL : c.shR;
  const E = S.clone().addScaledVector(N(ud), A.L1), W = E.clone().addScaledVector(N(fd), A.L2 * 0.998);
  return { pos: W, pole: E.clone().sub(mid(S, W)).addScaledVector(N(def || V(0, 0, -1)), 0.03), E };
};
// 腕を垂らしてダンベルを持つ。out は肩より外、fwd は前。
// grip: n = 手のひらが体向き（親指が前）、p = 手のひらが後ろ、s = 手のひらが前
const hang = (sg, o = {}) => c => {
  const S = sg > 0 ? c.shL : c.shR, A = c.m.armL, len = (A.L1 + A.L2) * 0.985;
  const out = o.out === undefined ? 1.1 : o.out, fwd = o.fwd || 0, dn = Math.sqrt(Math.max(0.01, len * len - out * out - fwd * fwd));
  const g = o.grip || 'n';
  return { pos: S.clone().add(V(sg * out, -dn, fwd)), pole: V(sg * 0.3, 0, -1),
           bar: g === 'n' ? V(0, 0, 1) : g === 'p' ? V(-sg, 0, 0) : V(sg, 0, 0), db: o.db !== false };
};
const hangBoth = (o = {}) => ({ handL: hang(1, o), handR: hang(-1, o) });

// 両手ではさむ。g = { top: 手のひらの間の中心, X: 左右の向き, F: 指の向き, h: 中心から手首までの左右の幅 }
const clasp = (sg, g, c) => ({
  pos: g.top.clone().addScaledVector(g.X, sg * g.h).addScaledVector(g.F, -0.5),
  pole: g.pole ? g.pole(sg) : c.c(sg * 0.3, -1, 0), palm: g.X.clone().multiplyScalar(-sg), fingers: g.F, hand: g.hand || 'cup',
});
const claspBoth = { handL: c => clasp(1, c.free, c), handR: c => clasp(-1, c.free, c) };
// ダンベルを縦にして胸の前で抱える（上のプレートを両手ではさむ）
const gobletHold = () => ({
  free: c => {
    const ax = c.c(0, 1, 0), top = mid(c.shL, c.shR).add(c.c(0, -0.3, 2.3));
    return { pos: top.clone().addScaledVector(ax, -1), axis: ax, top, X: c.c(1, 0, 0), F: c.c(0, 0.85, 0.5).normalize(), h: 0.78,
             pole: sg => c.c(sg * 0.25, -1, 0) };
  },
  ...claspBoth,
});

// あおむけ。a は腰を持ち上げる角度（肩を支点に体を傾ける）
const SUP_SH = 0.97, SUP_Z = -3.2;
const supine = (a = 0) => ({ baseQ: Qx(-90 - a), pin: pinSh(0, SUP_SH + 0.5 * Math.sin(a * D), SUP_Z), head: [10 + 1.3 * a, 0, 0] });
// 膝を立てる（足首の前後の位置 z は世界の座標）
const kneeUp = (sg, z, y0 = 0) => c => ({ pos: [sg * 0.83, y0 + c.m.legL.ankleH, z], pole: V(0, 1, 0), toe: Z, up: Y });
const KNEE_Z = SUP_Z + 3.14 + 1.43 + 4.2;       // 平らに寝たときの股関節から 4.2 先
const kneesUp = (z = KNEE_Z, y0 = 0) => ({ footL: kneeUp(1, z, y0), footR: kneeUp(-1, z, y0) });
// 台（長さ 14・幅 6・高さ 5.4）の上に、縦にあおむけで寝る。肩の前後の位置は、床に寝るときと同じ。
const BENCH_H = 5.4;
const benchSupine = () => ({ baseQ: Qx(-90), pin: pinSh(0, BENCH_H + SUP_SH, SUP_Z), head: [10, 0, 0] });
// 台の端から足を下ろして、床を踏む
const feetDown = (z, w = 1.25) => { const f = sg => c => ({ pos: [sg * w, c.m.legL.ankleH, z], pole: V(sg * 0.2, 1, 0.4), toe: V(sg * 0.2, 0, 0.98), up: Y }); return { footL: f(1), footR: f(-1) }; };
// 腕を体の横の床に置く
const armsFloor = sg => c => {
  const S = sg > 0 ? c.shL : c.shR;
  return { pos: [S.x + sg * 1.1, 0.42, S.z + 4.1], pole: V(sg * 0.6, -0.8, 0), palm: V(0, -1, 0), fingers: Z, hand: 'flat' };
};
// 手を耳の横に添える（頭の向きについていく）
const atEar = sg => c => ({ pos: c.head.clone().add(c.h(sg * 1.8, 0.45, 0.25)), pole: c.c(sg, -0.15, 0.15), palm: c.h(-sg, 0, 0), fingers: c.h(0, 1, 0.1), hand: 'relax' });
// 手を腰に当てる
const onHip = sg => c => ({ pos: (sg > 0 ? c.hipL : c.hipR).clone().add(c.p(sg * 0.8, 1.25, 0.55)), pole: c.c(sg * 0.6, 0, -1),
                             palm: c.p(-sg, 0, -0.2), fingers: c.p(0, -0.75, 0.65), hand: 'relax' });

// うつ伏せで、支える点（つま先立ちの足首か、ひざ）から肩までをまっすぐにして、肩を高さ sh に置く
const plankLine = (sh, lowY, len) => {
  const R = Math.hypot(len, 0.44), f0 = Math.atan2(0.44, len), th = f0 + Math.acos(Math.min(1, (sh - lowY) / R));
  return { th: th / D, z: R * Math.sin(th - f0) };
};
const TOE_ANK = 1.54;                             // つま先立ちのときの足首の高さ
const toeStand = sg => c => {
  const H = sg > 0 ? c.hipL : c.hipR;
  return { pos: H.clone().add(c.w(0, -9.39, 0)), toe: V(0, -1, 0), up: Z, toeFlat: true, toeDir: Z, pole: V(0, -1, 0) };
};
const palmFloor = (sg, x, z, out = 0.2) => c => ({ pos: [sg * x, 0.42, z], pole: V(sg * 0.6, 0.3, -1), palm: V(0, -1, 0), fingers: V(sg * out, 0, 1), hand: 'flat' });

// 上体を倒して立つ（ベントオーバーロウ・リアレイズ）
const bentOver = (m, pitch) => ({ pelvis: [pitch, 0, 0], chest: [pitch + 3, 0, 0], head: [-12, 0, 0],
                                  pin: pinHip(m.legL.ankleH + Math.sqrt(legLen(m, 34) ** 2 - 2.2 ** 2), m.legL.A.z - 2.2), ...feet(1.66) });

export const EXLIB = {
  // ゴブレットスクワット: ダンベルを縦にして胸の前で抱える。足は肩幅よりやや広く、つま先は少し外。太ももが床と平行かそれ以下まで。
  goblet: {
    name: 'ゴブレットスクワット', fixed: FEET,
    pose: (u, k, m) => ({
      pelvis: [34 * u, 0, 0], chest: [24 * u, 0, 0], head: [-8 * u, 0, 0],
      pin: pinHip(lerp(10.55, 5.75, u), m.legL.H.z + lerp(0, -2.3, u)), ...feet(3.0, 0, 15), ...gobletHold(),
    }),
  },

  // ルーマニアンデッドリフト: ダンベルは体の前。膝は軽く曲げた角度のまま、尻を後ろへ引いて上体を倒す。ダンベルは脚のすぐ前を通す。
  rdl: {
    name: 'ルーマニアンデッドリフト', fixed: FEET,
    pose: (u, k, m) => {
      const dz = m.legL.H.z - m.legL.A.z + lerp(0, -2.6, u), fwd = 1.9 * (1 - u) * (1 - u);
      return {
        pelvis: [74 * u, 0, 0], chest: [77 * u, 0, 0], head: [-12 * u, 0, 0],
        pin: pinHip(m.legL.ankleH + Math.sqrt(legLen(m, 22) ** 2 - dz * dz), m.legL.A.z + dz), ...feet(1.66),
        ...hangBoth({ out: 0.15, fwd, grip: 'p' }),
      };
    },
  },

  // ブルガリアンスクワット: 後ろ足の甲を椅子に乗せ、前脚の膝を曲げて真下に沈む。後ろの膝が床に近づくまで。
  split: {
    name: 'ブルガリアンスクワット', props: { bench: [0, 2.7, -10.7, 90] }, fixed: ['左足首', '右足首'],
    pose: (u, k, m) => ({
      pelvis: [lerp(8, 22, u), 0, 0], chest: [lerp(8, 20, u), 0, 0], head: [-6 * u, 0, 0],
      pin: pinHip(lerp(10.15, 5.7, u), lerp(-2.4, -2.7, u)),
      footL: c => ({ pos: [0.83, m.legL.ankleH, 0], toe: Z, pole: Z }),
      footR: c => ({ pos: [-0.83, 6.3, -8.3], toe: V(0, -0.6, -0.8), up: V(0, -0.8, 0.6), pole: V(0, -1, 0.5) }),
      ...hangBoth({ out: 1.25 }),
    }),
  },

  // ヒップスラスト: 肩甲骨を台の縁に乗せ、ダンベルを骨盤の上に置いて両手で支える。肩・腰・膝が一直線になるまで。
  hipthrust: {
    name: 'ヒップスラスト', props: { bench: [0, 2.7, -5, 90] }, dbOk: ['胴', '太もも'], fixed: FEET, cam: { alt: 10 },
    pose: (u, k, m) => {
      const b = lerp(58, 0, u), ze = -2;
      const foot = sg => c => ({ pos: [sg * 0.9, m.legL.ankleH, ze + 7.95], toe: Z, up: Y, pole: Y });
      return {
        baseQ: Qx(-90 + b), head: [lerp(32, 14, u), 0, 0],
        pin: c => V(0, 5.42, ze).sub(mid(c.shL, c.shR).add(c.w(0, -1.0, -0.96))),
        footL: foot(1), footR: foot(-1),
        free: c => {
          const P = c.hips.clone().add(c.p(0, 0.1, 1.32));
          return { pos: P, axis: X, top: P, X, F: c.p(0, -1, -0.15).normalize(), h: 1.46, pole: sg => c.c(sg, 0, -0.5) };
        },
        ...claspBoth,
      };
    },
  },

  // ワンハンドロウ: 椅子に片手と片膝をつき、背中は床と平行に近く。反対の手のダンベルを、肘を腰の方向へ引き上げる。
  row: {
    name: 'ワンハンドロウ', cam: { yaw0: -110 }, props: { bench: [4.0, 2.7, 1.0, 0] }, fixed: ['左手首', '右足首'],
    pose: (u, k, m) => ({
      pelvis: [88, 0, 0], chest: [88, 0, 0], head: [-12, 0, 0],
      pin: pinHip(9.5, 0, 1.2),
      footL: c => ({ pos: [2.0, 6.3, -2.34], toe: V(0, -0.6, -0.8), up: V(0, -0.8, 0.6), pole: V(0, -0.3, 1) }),
      footR: c => ({ pos: [-0.5, m.legL.ankleH, -0.8], toe: V(-0.15, 0, 1), pole: V(-0.2, 0, 1) }),
      handL: c => ({ pos: [c.shL.x + 0.1, 5.82, c.shL.z + 0.5], pole: V(0.3, 0, -1), palm: V(0, -1, 0), fingers: Z, hand: 'flat' }),
      handR: c => ({ ...armFK(c, -1, mixN(V(-0.24, -1, 0), V(-0.55, 0.3, -0.8), u), mixN(V(-0.24, -1, 0), V(-0.3, -1, 0.1), u), V(0, 0, -1)), bar: Z, db: true }),
    }),
  },

  // ダンベルショルダープレス: ダンベルを肩の高さ、耳の横あたりに構え、真上に押し上げて肘を伸ばしきる。
  ohp: {
    name: 'ダンベルショルダープレス', fixed: FEET,
    pose: (u, k, m) => {
      const hand = sg => c => {
        const S = sg > 0 ? c.shL : c.shR;
        const w = Math.pow(u, 3);
        return { pos: V(S.x + sg * lerp(1.78, 1.1, w), S.y + lerp(1.14, 4.38, u), S.z + lerp(0.4, 0.1, u)),
                 pole: V(sg * 0.5, -0.85, 0.05), bar: V(-sg, 0, 0), db: true };
      };
      return { ...feet(1.66), shrugL: 14 * u, shrugR: 14 * u, handL: hand(1), handR: hand(-1) };
    },
  },

  // サイドレイズ: 肘をわずかに曲げて固定し、肩の高さまで真横に上げる。
  lateral: {
    name: 'サイドレイズ', fixed: FEET, tempo: [1.3, 0.4, 2.4, 0.5],
    pose: (u, k, m) => {
      const hand = sg => c => {
        const ph = lerp(14, 86, u) * D, ud = V(sg * Math.sin(ph), -Math.cos(ph), 0);
        return { ...armFK(c, sg, ud, ud.clone().multiplyScalar(Math.cos(12 * D)).addScaledVector(Z, Math.sin(12 * D)), V(0, 0, -1)), bar: Z, db: true };
      };
      return { ...feet(1.66), shrugL: 6 * u, shrugR: 6 * u, handL: hand(1), handR: hand(-1) };
    },
  },

  // ダンベルフロアプレス: 仰向けで膝を立てる。肘が床につくまで下ろし（上腕は体幹から 45 度）、真上へ上げる。
  floorpress: {
    name: 'ダンベルフロアプレス', cam: { alt: 14 },
    pose: (u, k, m) => {
      const hand = sg => c => {
        const S = sg > 0 ? c.shL : c.shR;
        const top = S.clone().add(V(sg * 0.3, 4.5, 0.15));
        const bot = S.clone().addScaledVector(V(sg * 0.69, -0.21, 0.69), m.armL.L1).add(V(0, m.armL.L2, 0));
        return { pos: mix(top, bot, u), pole: V(sg * 0.69, -0.35, 0.69), bar: V(-sg, 0, 0), db: true };
      };
      return { ...supine(), ...kneesUp(), handL: hand(1), handR: hand(-1) };
    },
  },

  // 腕立て伏せ: 手は肩幅よりやや広く、指先はやや外向き。頭からかかとまで一直線。胸が床に近づくまで。
  pushup: {
    name: '腕立て伏せ', cam: { alt: 12 }, fixed: ['左手首', '右手首'],
    pose: (u, k, m) => {
      const top = plankLine(4.75, TOE_ANK, 13.96), L = plankLine(lerp(4.75, 2.15, u), TOE_ANK, 13.96);
      return { baseQ: Qx(L.th), pin: pinSh(0, lerp(4.75, 2.15, u), L.z), head: [-8, 0, 0],
               footL: toeStand(1), footR: toeStand(-1), handL: palmFloor(1, 1.85, top.z - 0.25), handR: palmFloor(-1, 1.85, top.z - 0.25) };
    },
  },

  // ダンベルカール: 肘を体側に固定し、前腕だけを巻き上げる。下では肘を伸ばしきる。
  curl: {
    name: 'ダンベルカール', fixed: FEET,
    pose: (u, k, m) => {
      const hand = sg => c => {
        const ud = V(sg * 0.24, -0.97, 0), th = lerp(4, 132, u) * D, w = Math.min(1, u / 0.7);
        const fd = N(ud).multiplyScalar(Math.cos(th)).addScaledVector(V(sg * 0.14, 0, 1).normalize(), Math.sin(th));
        const a = ss(w) * 90 * D;      // 握りを、親指が前（手のひらが体向き）から手のひらが上へ、前腕のまわりに回す
        return { ...armFK(c, sg, ud, fd, V(0, 0, -1)), bar: V(sg * Math.sin(a), Math.sin(th) * Math.cos(a), Math.cos(th) * Math.cos(a)), db: true };
      };
      return { ...feet(1.66), handL: hand(1), handR: hand(-1) };
    },
  },

  // トライセプスエクステンション: ダンベルを両手で持って頭の後ろに構え、肘の位置を固定したまま腕を真上に伸ばす。
  triext: {
    name: 'トライセプスエクステンション', fixed: FEET,
    pose: (u, k, m) => ({
      ...feet(1.66), shrugL: 12, shrugR: 12,
      free: c => {
        const th = lerp(115, 0, u) * D, f = c.c(0, Math.cos(th), -Math.sin(th));
        const C = mid(c.shL, c.shR).add(c.c(0, 2.2, 0.3)).addScaledVector(f, 2.3);
        const P = C.clone().addScaledVector(f, 0.5);
        return { pos: P, axis: c.c(1, 0, 0), top: P, X: c.c(1, 0, 0), F: f, h: 1.46, pole: sg => c.c(sg * 1.1, 0.5, 0.8) };
      },
      ...claspBoth,
    }),
  },

  // プランク: 肘を肩の真下につき、つま先で支える。頭からかかとまで一直線。
  plank: {
    name: 'プランク', cam: { alt: 12 }, tempo: [2, 2, 2, 2],
    pose: (u, k, m) => {
      const L = plankLine(2.9, TOE_ANK, 13.96);
      const hand = sg => c => { const S = sg > 0 ? c.shL : c.shR; return { pos: [S.x, 0.6, S.z + 2.3], pole: V(0, -1, -0.3), palm: V(0, -1, 0), fingers: Z, hand: 'flat' }; };
      return { baseQ: Qx(L.th), pin: pinSh(0, 2.9, L.z), head: [-8, 0, 0], footL: toeStand(1), footR: toeStand(-1), handL: hand(1), handR: hand(-1) };
    },
  },

  // デッドバグ: 仰向けで両腕を天井に、股関節と膝を 90 度に。右腕と左脚をゆっくり伸ばし、戻して反対側。
  deadbug: {
    name: 'デッドバグ', alt: true, cam: { alt: 14 }, tempo: [1.8, 0.5, 1.5, 0.4],
    pose: (u, k, m) => {
      const armS = k ? 1 : -1, legS = -armS;
      const hand = sg => c => {
        const S = sg > 0 ? c.shL : c.shR, t = sg === armS ? u : 0, a = lerp(0, 68, t) * D;
        const d = V(sg * lerp(0.05, 0.32, t), Math.cos(a), -Math.sin(a)).normalize();
        return { pos: S.clone().addScaledVector(d, 4.5), pole: V(sg * 0.5, 0, 1), palm: V(-sg, 0, 0), fingers: d, hand: 'relax' };
      };
      const foot = sg => c => {
        const H = sg > 0 ? c.hipL : c.hipR, t = sg === legS ? u : 0;
        return { pos: H.clone().add(mix(V(0, m.legL.L1, m.legL.L2), V(0, 1.5, 9.2), t)), pole: V(0, 1, -0.2), toe: Y, up: V(0, 0, -1) };
      };
      return { ...supine(), handL: hand(1), handR: hand(-1), footL: foot(1), footR: foot(-1) };
    },
  },

  // 腹筋（クランチ）: 仰向けで膝を立て、手は側頭部に。あごを引き、みぞおちを中心に背中を丸めて、肩甲骨が床からはっきり離れるまで起こす。
  // 腰は床につけたまま（骨盤はわずかに後ろへ傾くだけ）。背骨の丸めは 55° ほど。
  crunch: {
    name: '腹筋（クランチ）', cam: { alt: 14 }, fixed: FEET, tempo: [1.4, 0.5, 1.6, 0.4],
    pose: (u, k, m) => ({ baseQ: Qx(-90), pin: pinHip(SUP_SH + 0.44 + 0.08 * u, SUP_Z + 4.57), ...kneesUp(), pelvis: [9 * u, 0, 0], chest: [64 * u, 0, 0], head: [10 + 14 * u, 0, 0],
                          handL: atEar(1), handR: atEar(-1) }),
  },

  // サイドプランク: 横向きで肘を肩の真下につき、腰を持ち上げて頭から足まで一直線。
  sideplank: {
    name: 'サイドプランク', tempo: [2, 2, 2, 2], cam: { alt: 12, yaw0: -78 },
    pose: (u, k, m) => {
      const aY = 1.42, sh = 2.95, half = m.armL.S.x;
      const th = Math.acos((sh - aY) / Math.hypot(13.96, half)) - Math.atan2(half, 13.96);     // 体の線の傾き（Z まわり）
      const foot = sg => c => ({ pos: (sg > 0 ? c.hipL : c.hipR).clone().add(c.w(0, -9.39, 0)), toe: Z, up: c.w(0, 1, 0), pole: Z });
      return {
        baseQ: Qz(th / D), pin: pinSh(-13.96 * Math.sin(th) + 6, aY + 13.96 * Math.cos(th), 0),
        footL: foot(1), footR: foot(-1),
        handR: c => ({ pos: [c.shR.x, 0.6, c.shR.z + 2.3], pole: V(0, -1, -0.1), palm: V(0, -1, 0), fingers: Z, hand: 'flat' }),
        handL: onHip(1),
      };
    },
  },

  // カーフレイズ: 段差のふちにつま先を乗せ、かかとを下げてから限界まで背伸びする。
  calf: {
    name: 'カーフレイズ', props: { step: [0, 0.65, 2] }, air: true, touch: [['toeL', 1.3, 0.3], ['toeR', 1.3, 0.3]],
    pose: (u, k, m) => {
      const a = lerp(-18, 38, u), pz = m.legL.A.z + m.toeFwd;
      const f = sg => c => heelUp(m, sg, sg * 0.83, pz, a, { gy: 1.3 });
      const an = heelUp(m, 1, 0.83, pz, a, { gy: 1.3 }).pos;
      return { pin: pinHip(an.y + m.legL.H.y - m.legL.A.y, an.z + m.legL.H.z - m.legL.A.z), footL: f(1), footR: f(-1), ...hangBoth(),
               props: { step: [0, 0.65, pz + 1.3] } };
    },
  },

  // ファーマーズウォーク: ダンベルを持って、胸を張ったまま小さめの歩幅で歩く。肩をすくめない。
  // その場で歩く形にする（体は動かさず、床を後ろへ流す）。踏んでいる足は床と同じ速さで後ろへ動くので、足は滑らない。
  // u は 1 周（左右 1 歩ずつ）。左足は u = 0 でかかとから着き、STANCE まで床の上、そのあと前へ振り出す。右足は半周ずれる。
  farmer: {
    name: 'ファーマーズウォーク', cycle: 1.0,
    pose: (u, k, m) => {
      const STRIDE = 8, STANCE = 0.62, S = STRIDE * STANCE, L = m.legL, w2 = 2 * Math.PI;
      const foot = sg => c => {
        const p = (u + (sg > 0 ? 0 : 0.5)) % 1, x = sg * 0.8, z0 = L.A.z + 0.25;
        if (p < STANCE) {
          const z = z0 + S * (0.5 - p / STANCE), a = 34 * ss(Math.max(0, (p / STANCE - 0.6) / 0.4));     // 後半はかかとが上がる
          return a > 0.01 ? heelUp(m, sg, x, z + m.toeFwd, a) : { pos: [x, L.ankleH, z], toe: Z, up: Y, pole: Z };
        }
        const s = (p - STANCE) / (1 - STANCE), e = ss(s);
        const from = heelUp(m, sg, x, z0 - S / 2 + m.toeFwd, 34).pos, to = V(x, L.ankleH, z0 + S / 2);
        const a = (34 * (1 - e) - 12 * Math.sin(Math.PI * s) * s) * D;      // つま先下がりで離れ、つま先を少し上げて着く
        return { pos: mix(from, to, e).add(V(0, 0.95 * Math.sin(Math.PI * s), 0)), toe: V(0, -Math.sin(a), Math.cos(a)), up: V(0, Math.cos(a), Math.sin(a)), pole: Z,
                 toeFlat: a > 0, toeDir: Z, toeUp: Y };      // 離れぎわは指の付け根から先を床に沿わせる
      };
      const ph = w2 * (u - 0.06), yaw = -5 * Math.cos(w2 * u);
      return {
        scroll: u * STRIDE,
        pelvis: [2, yaw, 2.5 * Math.sin(ph)], chest: [3, -0.4 * yaw, 0], head: [-2, 0.4 * yaw, 0],
        pin: pinHip(L.ankleH + 9.0 - 0.2 * Math.cos(2 * ph), L.H.z + 0.25, 0.2 * Math.sin(ph)),
        footL: foot(1), footR: foot(-1),
        handL: hang(1, { out: 1.15, fwd: -0.3 * Math.cos(w2 * u) }), handR: hang(-1, { out: 1.15, fwd: 0.3 * Math.cos(w2 * u) }),
        props: { lane: [0, 0.02, 0] },
      };
    },
  },

  // ワイドスクワット: 足を肩幅の 1.5 倍に開き、つま先を 30 度外へ。ダンベルを縦にして胸の前で支え、まっすぐ下に沈む。
  sumo: {
    name: 'ワイドスクワット', fixed: FEET,
    pose: (u, k, m) => ({
      pelvis: [22 * u, 0, 0], chest: [15 * u, 0, 0], head: [-5 * u, 0, 0],
      pin: pinHip(lerp(10.3, 6.3, u), m.legL.H.z + lerp(0, -0.95, u)), ...feet(5.6, 0, 30), ...gobletHold(),
    }),
  },

  // スプリットスクワット: 足を前後に大きく開き、後ろのかかとは上げたまま。上体を立てたまま、後ろの膝を床に近づける。
  splitfloor: {
    name: 'スプリットスクワット', fixed: ['左足首'],
    pose: (u, k, m) => ({
      pelvis: [4, 0, 0], chest: [4, 0, 0],
      pin: pinHip(lerp(9.3, 6.2, u), 0),
      footL: c => ({ pos: [0.83, m.legL.ankleH, 4.4], toe: Z, pole: Z }),
      footR: c => heelUp(m, -1, -0.83, -5.1, lerp(40, 62, u), { pole: V(0, -0.3, 1) }),
      ...hangBoth({ out: 1.25 }),
    }),
  },

  // ヒップリフト: 仰向けで膝を立て、かかとは尻から 30 cm ほど。肩・腰・膝が一直線になるまで尻を持ち上げる。
  bridge: {
    name: 'ヒップリフト', cam: { alt: 14 }, fixed: FEET, tempo: [1.3, 1.2, 1.5, 0.5],
    pose: (u, k, m) => ({ ...supine(30 * u), ...kneesUp(SUP_Z + 7.9), handL: armsFloor(1), handR: armsFloor(-1) }),
  },

  // 膝つき腕立て伏せ: 膝を床につき、手は肩幅よりやや広く。頭から膝までを一直線に。
  pushupknee: {
    name: '膝つき腕立て伏せ', cam: { alt: 12 }, fixed: ['左手首', '右手首'],
    pose: (u, k, m) => {
      const kY = 0.8, top = plankLine(4.75, kY, 8.95), L = plankLine(lerp(4.75, 2.2, u), kY, 8.95);
      const foot = sg => c => ({ pos: [sg * 0.8, TOE_ANK, -Math.sqrt(m.legL.L2 ** 2 - (TOE_ANK - kY) ** 2)], toe: V(0, -1, 0), up: Z, toeFlat: true, toeDir: Z, pole: V(0, -1, 0.3) });
      return { baseQ: Qx(L.th), pin: pinSh(0, lerp(4.75, 2.2, u), L.z), head: [-8, 0, 0],
               footL: foot(1), footR: foot(-1), handL: palmFloor(1, 1.85, top.z - 0.25), handR: palmFloor(-1, 1.85, top.z - 0.25) };
    },
  },

  // ダンベルフライ: 台に仰向けになり、足は床。手のひらは向かい合わせ。肘を軽く曲げたまま、胸が伸びるところまで横に開く。
  // 台に寝るので、ひじは肩より下まで下がる（床の上では上腕が床で止まり、胸が伸びきらない）。
  // 上: ダンベルは胸の真上でそろえ、手のひらは向かい合わせ。下: ひじを少し深く曲げながら、大きな弧で横へ開く。ひじは肩の線より少し足寄り。
  fly: {
    name: 'ダンベルフライ', cam: { alt: 12 }, props: { bench: [0, 2.7, -3.6, 0] }, bedY: BENCH_H, tempo: [1.9, 0.4, 1.5, 0.5],
    pose: (u, k, m) => {
      const hand = sg => c => {
        const ph = lerp(2, 103, u) * D, eb = lerp(14, 30, u) * D, d = (a, z) => V(sg * Math.sin(a), Math.cos(a), z * Math.sin(a));
        return { ...armFK(c, sg, d(ph, 0.2), d(ph - eb, 0.2), V(sg * 0.3, -1, 0.2)), bar: V(0, 0, -1), db: true };
      };
      return { ...benchSupine(), ...feetDown(4.9), handL: hand(1), handR: hand(-1) };
    },
  },

  // フロアトライセプスエクステンション: 仰向けで上腕を床に垂直に立て、肘だけを曲げてダンベルを耳の横へ下ろす。
  skull: {
    name: 'フロアトライセプスエクステンション', cam: { alt: 14 },
    pose: (u, k, m) => {
      const hand = sg => c => {
        const ud = V(sg * 0.3, 0.954, 0), th = lerp(3, 110, u) * D;
        const fd = N(ud).multiplyScalar(Math.cos(th)).addScaledVector(V(0, 0, -1), Math.sin(th)).add(V(sg * 0.22 * Math.sin(th), 0, 0));
        const td = N(ud).multiplyScalar(-Math.sin(th)).addScaledVector(V(0, 0, -1), Math.cos(th));
        return { ...armFK(c, sg, ud, fd, V(0, 0, 1)), bar: td, db: true };
      };
      return { ...supine(), ...kneesUp(), handL: hand(1), handR: hand(-1) };
    },
  },

  // フロントレイズ: ダンベルを体の前に持ち、手のひらを下に。肘を軽く曲げた角度のまま、肩の高さまで前に上げる。
  front: {
    name: 'フロントレイズ', fixed: FEET, tempo: [1.3, 0.4, 2.4, 0.5],
    pose: (u, k, m) => {
      const hand = sg => c => {
        const ph = lerp(25, 90, u) * D, ud = V(sg * 0.04, -Math.cos(ph), Math.sin(ph));
        const fd = N(ud).multiplyScalar(Math.cos(10 * D)).addScaledVector(V(0, Math.sin(ph), Math.cos(ph)), Math.sin(10 * D));
        return { ...armFK(c, sg, ud, fd, V(0, -Math.sin(ph), -Math.cos(ph))), bar: V(-sg, 0, 0), db: true };
      };
      return { ...feet(1.66), handL: hand(1), handR: hand(-1) };
    },
  },

  // シュラッグ: ダンベルを体の横に持ち、肩を耳に近づけるようにまっすぐすくめる。
  shrug: {
    name: 'シュラッグ', fixed: FEET, tempo: [1.0, 1.0, 1.4, 0.5],
    pose: (u, k, m) => ({ ...feet(1.66), shrugL: 22 * u, shrugR: 22 * u, ...hangBoth() }),
  },

  // ベントオーバーロウ: 膝を軽く曲げ、背中を床と平行に近く。両手のダンベルを、肘を腰の方向へ引き上げる。
  row2: {
    name: 'ベントオーバーロウ', fixed: FEET,
    pose: (u, k, m) => {
      const hand = sg => c => ({ ...armFK(c, sg, mixN(V(sg * 0.24, -0.97, 0), V(sg * 0.45, 0.33, -0.83), u), mixN(V(sg * 0.24, -0.97, 0), V(sg * 0.03, -1, 0.05), u), V(0, 0, -1)), bar: Z, db: true });
      return { ...bentOver(m, 72), handL: hand(1), handR: hand(-1) };
    },
  },

  // シーテッドカーフレイズ: 椅子に浅く座り、かかとは膝の真下。ダンベルを膝の少し上に縦に置いて両手で押さえ、かかとを持ち上げる。
  calfseat: {
    name: 'シーテッドカーフレイズ', props: { bench: [0, 2.7, -1.9, 90] }, dbOk: ['太もも'], tempo: [1.0, 1.2, 1.4, 0.5],
    pose: (u, k, m) => {
      const a = lerp(0, 38, u), pz = m.legL.L1 + m.toeFwd;
      const f = sg => c => heelUp(m, sg, sg * 0.83, pz, a, { pole: V(0, 1, 0.3) });
      return {
        pelvis: [6, 0, 0], chest: [16, 0, 0], head: [-4, 0, 0], pin: pinHip(m.legL.ankleH + m.legL.L2 + 0.05, 0), footL: f(1), footR: f(-1),
        free: c => {
          const base = mid(c.kneeL, c.kneeR).add(V(0, 0.62, -1.0)), top = base.clone().add(V(0, 2.25, 0));
          return { pos: base.clone().add(V(0, 1.25, 0)), axis: Y, top, X, F: V(0, -0.55, 0.83), h: 0.78, pole: sg => V(sg * 0.8, -0.3, -0.6) };
        },
        ...claspBoth,
      };
    },
  },

  // サイドベンド: 片手にダンベル、反対の手は腰。上体を真横に倒し、ダンベルを太ももの外側に沿って下ろす。
  sidebend: {
    name: 'サイドベンド', cam: { yaw0: -70 }, fixed: FEET,
    pose: (u, k, m) => ({ ...feet(1.66), chest: [0, 0, -30 * u], head: [0, 0, 10 * u],
                          handR: hang(-1, { out: lerp(1.1, 0.3, u) }), handL: onHip(1) }),
  },

  // サイドランジ: 足を肩幅の 2 倍に開き、ダンベルを縦にして胸の前で支える。片側の膝を曲げて沈み、反対の脚は伸ばしたまま。
  sidelunge: {
    name: 'サイドランジ', alt: true, fixed: FEET,
    pose: (u, k, m) => {
      const s = k ? -1 : 1, a = 4.1, y1 = 8.0, z1 = -1.2;
      const y0 = m.legL.ankleH + Math.sqrt(9.3 ** 2 - (a - 0.74) ** 2);
      const foot = sg => c => { const d = V(sg * Math.sin(12 * D), 0, Math.cos(12 * D)); return { pos: [sg * a, m.legL.ankleH, m.legL.A.z], toe: d, pole: sg === s ? V(sg * 0.35, 0, 1) : d }; };
      return { pelvis: [30 * u, 0, 0], chest: [24 * u, 0, 0], head: [-8 * u, 0, 0],
               pin: pinHip(lerp(y0, y1, u), m.legL.H.z + lerp(0, z1, u), s * 3.1 * u), footL: foot(1), footR: foot(-1), ...gobletHold() };
    },
  },

  // スライディングレッグカール: 尻を浮かせたまま、かかとをタオルの上で滑らせて膝を伸ばし、引き寄せて戻す。
  slidecurl: {
    name: 'スライディングレッグカール', props: { towel: [0, 0.03, 5] }, cam: { alt: 14 }, tempo: [1.8, 0.4, 1.6, 0.5],
    pose: (u, k, m) => {
      const z = SUP_Z + lerp(7.9, 13.3, u), t = lerp(0, 50, u) * D, y = m.legL.ankleH + 0.12 * u;
      const foot = sg => c => ({ pos: [sg * 0.83, y, z], pole: Y, toe: V(0, Math.sin(t), Math.cos(t)), up: V(0, Math.cos(t), -Math.sin(t)) });
      return { ...supine(lerp(30, 15, u)), footL: foot(1), footR: foot(-1), handL: armsFloor(1), handR: armsFloor(-1),
               props: { towel: [0, 0.03, z - 0.3] } };
    },
  },

  // ダンベルプルオーバー: 台に仰向けになり、ダンベルを両手で胸の上に構える。肘の角度を変えずに、弧を描いて頭の向こうへ下ろす。
  // 頭を台の端に置くので、ダンベルは頭の向こうで台より下まで下ろせる（床の上では頭の上で止まる）。
  // この体は腕が短く頭が大きいので、ダンベルは横にして両端のプレートを両手ではさむ（縦に持つと頭に当たる）。
  pullover: {
    name: 'ダンベルプルオーバー', cam: { alt: 12 }, props: { bench: [0, 2.7, -0.1, 0] }, bedY: BENCH_H, air: true, tempo: [1.9, 0.4, 1.6, 0.5],
    pose: (u, k, m) => ({
      ...benchSupine(), ...kneesUp(KNEE_Z, BENCH_H),
      free: c => {
        const a = lerp(-6, 94, u) * D, d = V(0, Math.cos(a), -Math.sin(a)), P = mid(c.shL, c.shR).addScaledVector(d, 4.95);
        return { pos: P, axis: X, top: P, X, F: d, h: 1.46, pole: sg => V(sg, 0.25 * Math.sin(a), 0.25 * Math.cos(a)) };
      },
      ...claspBoth,
    }),
  },

  // ロシアンツイスト: 床に座って膝を曲げ、上体を少し後ろに倒す。手を体の前で合わせ、体幹をひねって片側の床へ近づける。
  twist: {
    name: 'ロシアンツイスト', alt: true, tempo: [0.9, 0.3, 0.9, 0.1],
    pose: (u, k, m) => {
      const s = k ? -1 : 1, yaw = s * 42 * u;
      const foot = sg => c => ({ pos: [sg * 0.9, m.legL.ankleH, 6.0], pole: Y, toe: Z });
      const G = c => ({ top: mid(c.shL, c.shR).add(c.c(s * 0.6 * u, -1.3 - 1.3 * u, 3.1 - 0.3 * u)), X: c.c(1, 0, 0), F: c.c(0, -0.25, 0.97), h: 0.14, hand: 'flat',
                        pole: sg => c.c(sg * 0.7, -0.7, -0.2) });
      return { pelvis: [-28, 0, 0], chest: Qx(-32).multiply(Qy(yaw)), head: [8, -yaw * 0.35, 0], pin: pinHip(1.2, 0),
               footL: foot(1), footR: foot(-1), handL: c => clasp(1, G(c), c), handR: c => clasp(-1, G(c), c) };
    },
  },

  // シシースクワット: 柱を片手で軽くつかみ、つま先立ちで膝を前に出しながら上体を後ろへ倒す。膝から肩までは一直線。膝が 90 度まで。
  sissy: {
    name: 'シシースクワット', props: { pole: [3.3, 13, 1.2] },
    pose: (u, k, m) => {
      const be = 50 * u * D, ga = 40 * u * D, a = lerp(16, 46, u), pz = m.legL.A.z + m.toeFwd;
      const an = heelUp(m, 1, 0.83, pz, a).pos, L = m.legL;
      const f = sg => c => heelUp(m, sg, sg * 0.83, pz, a);
      return {
        pelvis: [-40 * u, 0, 0], chest: [-40 * u, 0, 0], head: [16 * u, 0, 0],
        pin: pinHip(an.y + (L.L2 * Math.cos(be) + L.L1 * Math.cos(ga)) * 0.998, an.z + L.L2 * Math.sin(be) - L.L1 * Math.sin(ga)),
        footL: f(1), footR: f(-1),
        handL: c => ({ pos: [3.3 - 0.53, 13.0, 1.2 - 0.74], pole: V(0.5, -1, -0.3), g: V(0.8, 0, 0.6), bar: Y, hand: 'grip' }),
      };
    },
  },

  // リアレイズ: 上体を床と平行近くまで倒し、腕を真下に垂らす。肘の角度を変えずに、肩の高さまで真横へ開く。
  rear: {
    name: 'リアレイズ', fixed: FEET, tempo: [1.3, 0.4, 2.4, 0.5],
    pose: (u, k, m) => {
      const hand = sg => c => {
        const ph = lerp(14, 84, u) * D, ud = V(sg * Math.sin(ph), -Math.cos(ph), 0);
        return { ...armFK(c, sg, ud, ud.clone().multiplyScalar(Math.cos(14 * D)).addScaledVector(Z, Math.sin(14 * D)), V(0, 0, -1)), bar: Z, db: true };
      };
      return { ...bentOver(m, 76), handL: hand(1), handR: hand(-1) };
    },
  },

  // ヒップアブダクション: 横向きに寝て、下の脚は膝を軽く曲げる。上の脚は膝を伸ばし、斜め後ろ上へ上げる。
  abduct: {
    name: 'ヒップアブダクション', cam: { alt: 14, yaw0: -78 }, tempo: [1.2, 0.4, 2.0, 0.3],
    pose: (u, k, m) => ({
      base: 'sideL', hips: [0, 1.65, 0], chest: [0, 0, 8], head: [0, 0, 14],
      footR: c => ({ pos: [c.hipR.x + 8.5, 0.7, c.hipR.z + 2.0], pole: Z, toe: V(0.2, 0, 1), up: V(-1, 0, 0.2) }),
      footL: c => { const ph = lerp(2, 38, u) * D, b = 10 * D, d = V(Math.cos(ph) * Math.cos(b), Math.sin(ph), -Math.sin(b) * Math.cos(ph));
                    return { pos: c.hipL.clone().addScaledVector(d, 9.39), pole: Z, toe: Z, up: d.clone().negate() }; },
      handR: c => ({ pos: [c.shR.x - 4.3, 0.85, c.shR.z + 0.8], pole: V(0, 0.4, 1), palm: Y, fingers: V(-1, 0, 0.1), hand: 'relax' }),
      handL: onHip(1),
    }),
  },

  // ハンマーカール: 親指が前を向くように縦に握り、手首の向きを変えずに肘を曲げて巻き上げる。
  hammer: {
    name: 'ハンマーカール', fixed: FEET,
    pose: (u, k, m) => {
      const hand = sg => c => {
        const ud = N(V(sg * 0.24, -0.97, 0)), th = lerp(4, 125, u) * D;
        const fd = ud.clone().multiplyScalar(Math.cos(th)).addScaledVector(Z, Math.sin(th));
        return { ...armFK(c, sg, ud, fd, V(0, 0, -1)), bar: ud.clone().multiplyScalar(-Math.sin(th)).addScaledVector(Z, Math.cos(th)), db: true };
      };
      return { ...feet(1.66), handL: hand(1), handR: hand(-1) };
    },
  },

  // ヒップアダクション: 横向きに寝て、下の脚を上の脚の前に置く。下の脚を、膝を伸ばしたまま床から 10〜15 cm 上げる。
  adduct: {
    name: 'ヒップアダクション', cam: { alt: 14, yaw0: -78 }, tempo: [1.2, 0.4, 2.0, 0.3],
    pose: (u, k, m) => ({
      base: 'sideL', hips: [0, 1.65, 0], chest: [0, 0, 8], head: [0, 0, 14],
      footL: c => ({ pos: [c.hipL.x + 9.1, 0.75, c.hipL.z - 1.6], pole: Z, toe: Z, up: V(-1, 0, 0) }),
      footR: c => { const d = V(0, lerp(-0.02, 0.17, u), 0.2); d.x = Math.sqrt(1 - d.y * d.y - d.z * d.z);
                    return { pos: c.hipR.clone().addScaledVector(d, 9.37), pole: Z, toe: Z, up: d.clone().negate() }; },
      handR: c => ({ pos: [c.shR.x - 4.3, 0.85, c.shR.z + 0.8], pole: V(0, 0.4, 1), palm: Y, fingers: V(-1, 0, 0.1), hand: 'relax' }),
      handL: onHip(1),
    }),
  },

  // バックエクステンション: うつ伏せで脚は腰幅。手は耳の横、肘は横に開く。骨盤とつま先を床につけたまま、みぞおちが離れるところまで。
  backext: {
    name: 'バックエクステンション', cam: { alt: 14 }, tempo: [1.2, 0.5, 2.0, 0.4],
    pose: (u, k, m) => {
      const foot = sg => c => { const H = sg > 0 ? c.hipL : c.hipR, y = 1.5;
        return { pos: [H.x, y, H.z - Math.sqrt(9.39 ** 2 - (y - H.y) ** 2)], toe: V(0, -0.57, -0.82), up: V(0, -0.82, 0.57), pole: V(0, -1, 0) }; };
      return { base: 'prone', hips: [0, 0.8, 0], chest: [-40 * u, 0, 0], head: [8 * u, 0, 0], footL: foot(1), footR: foot(-1), handL: atEar(1), handR: atEar(-1) };
    },
  },

  // 片脚ルーマニアンデッドリフト: 片脚で立ち、反対の脚を後ろへ伸ばしながら上体を倒す。
  rdl1: {
    name: '片脚ルーマニアンデッドリフト', fixed: ['左足首'],
    pose: (u, k, m) => {
      const dz = m.legL.H.z - m.legL.A.z + lerp(0, -1.7, u), hy = m.legL.ankleH + Math.sqrt(legLen(m, 22) ** 2 - dz * dz), fwd = 1.9 * (1 - u) * (1 - u);
      return {
        pelvis: [72 * u, 0, 0], chest: [75 * u, 0, 0], head: [-12 * u, 0, 0],
        pin: pinHip(hy, m.legL.A.z + dz, -0.35),
        footL: c => ({ pos: [0.4, m.legL.ankleH, m.legL.A.z], toe: Z, pole: Z }),
        footR: c => ({ pos: c.hipR.clone().add(c.p(0, -(hy - m.legL.ankleH - 0.02), lerp(-0.6, 0, u))), toe: c.p(0, 0, 1), up: c.p(0, 1, 0), pole: c.p(0, 0, 1) }),
        ...hangBoth({ out: 0.15, fwd, grip: 'p' }),
      };
    },
  },

  // ダンベルデッドリフト: ダンベルは体の横。背中をまっすぐにしたまま、尻を後ろへ引きながら膝も曲げ、すねの外側に沿ってすねの半ばまで。
  deadlift: {
    name: 'ダンベルデッドリフト', fixed: FEET,
    pose: (u, k, m) => ({
      hips: [0, lerp(m.pelvis.y, 8.3, u), lerp(m.pelvis.z - 0.1, -2.7, u)],
      pelvis: [56 * u, 0, 0], chest: [62 * u, 0, 0], head: [-14 * u, 0, 0],
      ...feet(1.66), ...hangBoth(),
    }),
  },
};

// 寝る種目: 物理の床を外す（布が体と床にはさまれて暴れるため）
for (const id of ['floorpress', 'deadbug', 'crunch', 'bridge', 'fly', 'skull', 'slidecurl', 'pullover', 'hipthrust', 'sideplank']) EXLIB[id].floor = false;
EXLIB.hipthrust.bedY = BENCH_H;      // 頭は台の上
// 腕を床に置く種目: ふくらんだ袖は床でつぶれるので、ひじのまわりだけ深めに許す
for (const id of ['bridge', 'slidecurl']) EXLIB[id].soft = { match: /ひじ|腕捩|手捩/, sink: 0.7 };

export { lerp, ss, D, feet };
