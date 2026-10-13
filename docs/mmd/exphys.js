/**
 * 髪・服・飾りの物理の設定を、読み込んだあとに作り替える（PMX には手を入れない）。
 * もとの設定は立ち姿勢向けで、髪はほとんど動かず（回る幅 ±10° 以下・減衰 1）、背中や肩とも当たらない。
 * 筋トレの姿勢（前に倒す・寝る）でも重力に従って動き、体に埋まらないようにする。
 * 胸のリボン（ChestRb）は、もとのままにする。
 */
const R = Math.PI / 180;

// 名前の終わりの番号 = 根元から何番目か
const depth = n => { const m = n.match(/(\d+)(?:_[LR])?$/); return m ? +m[1] : 1; };

// 回る幅を広げる。もとの幅が片側だけなら（頭の中へは曲がらない向き）、その向きを保つ。
function widen(c, axis, big, small) {
  const lo = c.rotationLimitation1[axis], hi = c.rotationLimitation2[axis], dir = Math.sign(hi + lo);
  if (small === undefined) small = big;
  c.rotationLimitation1[axis] = -(dir > 0 ? small : big) * R;
  c.rotationLimitation2[axis] = (dir < 0 ? small : big) * R;
}

export const TUNE = {
  hairDamp: [0.93, 0.97],          // 髪の減衰（動き・回転）。1 は「まったく揺れない」
  spring: [320, 100, 36],          // 髪の形を保つばね（根元・2 番目・その先）。重さ 1 あたり
  back: { out: 42, in: 3, side: 20 },    // 後ろ髪: 外へ・内へ・横へ（度）
  side: { bend: 18, side: 20 },          // 横の髪
  bang: { bend: 7, side: 10 },            // 前髪
  strand: { bend: 16, side: 24 },        // 長い房
  collar: { out: 14, in: 2, side: 8, damp: [0.95, 0.98] },
  ribbon: { k: 2, damp: [0.95, 0.98] },  // 帽子のリボン
  skirtDamp: [0.96, 0.98],
  ownSkirt: true,                        // コートのすそは exskirt.js で解く（もとの剛体は当たりを切って骨に従わせる）
  armAcs: { k: 0.12, damp: [0.995, 0.995], spring: 300, amp: 0.7, rate: 5 }, // 腕の花の飾り: 揺れる幅を狭く。ばねは硬すぎると震えるので弱める
  joint: { erp: 0.2, cfm: 0.02 },        // 継ぎ手の止まり方（もとは erp 0.475・cfm 0 で、はさまれると震える）
};

export function tunePhysics(raw, bones, rest, T = TUNE) {
  const bodies = raw.rigidBodies.map(b => ({ ...b, position: [...b.position], rotation: [...b.rotation] }));
  const joints = raw.constraints.map(c => ({ ...c, rotationLimitation1: [...c.rotationLimitation1], rotationLimitation2: [...c.rotationLimitation2],
                                            springRotation: [...c.springRotation] }));
  const isHair = n => /^(Ba|Sd|Fr)Hair/.test(n);
  for (const b of bodies) {
    if (b.type === 0) continue;
    if (isHair(b.name)) { b.positionDamping = T.hairDamp[0]; b.rotationDamping = T.hairDamp[1]; b.weight = Math.max(b.weight, 0.3); }
    else if (/^Eri/.test(b.name)) { b.groupTarget &= ~(1 << 2); b.positionDamping = T.collar.damp[0]; b.rotationDamping = T.collar.damp[1]; b.weight = Math.max(b.weight, 0.2); }
    else if (/^HairAcsC/.test(b.name)) { b.positionDamping = T.ribbon.damp[0]; b.rotationDamping = T.ribbon.damp[1]; b.weight = Math.max(b.weight, 0.3); }
    else if (/^ArmAcs/.test(b.name)) { b.positionDamping = T.armAcs.damp[0]; b.rotationDamping = T.armAcs.damp[1]; }
    else if (/^Skt_/.test(b.name) && T.ownSkirt) { b.type = 0; b.groupTarget = 0; }
    else if (/^Skt_/.test(b.name)) { b.positionDamping = T.skirtDamp[0]; b.rotationDamping = T.skirtDamp[1]; }
  }
  for (const c of joints) {
    const n = c.name, d = depth(n), k = d <= 1 ? 0.6 : d === 2 ? 1 : 1.25, w = bodies[c.rigidBodyIndex2].weight;
    const spring = s => { const v = T.spring[Math.min(d, 3) - 1] * w * (s || 1); c.springRotation = [v, v, v]; };
    if (/^BaHair/.test(n)) { widen(c, 0, T.back.out * k, T.back.in); widen(c, 2, T.back.side * k); widen(c, 1, 4); spring(); }
    else if (/^SdHair/.test(n)) { widen(c, 0, T.side.bend * k); widen(c, 2, T.side.side * k); widen(c, 1, 3); spring(); }
    else if (/^FrHair_A/.test(n)) { widen(c, 0, T.strand.bend * k); widen(c, 2, T.strand.side * k); widen(c, 1, 3); spring(); }
    else if (/^FrHair/.test(n)) { widen(c, 0, T.bang.bend * k); widen(c, 2, T.bang.side * k); spring(2); }
    else if (/^Eri/.test(n)) { widen(c, 0, T.collar.out, T.collar.in); if (d > 1) widen(c, 2, T.collar.side); }
    else if (/^ArmAcs/.test(n)) { for (let a = 0; a < 3; a++) { c.rotationLimitation1[a] *= T.armAcs.k; c.rotationLimitation2[a] *= T.armAcs.k; c.springRotation[a] = T.armAcs.spring; } }
    else if (/^HairAcsC/.test(n)) for (const a of [0, 2]) { c.rotationLimitation1[a] *= T.ribbon.k; c.rotationLimitation2[a] *= T.ribbon.k; }
  }
  // 髪だけが当たる体（背中・肩）。もとの設定では、髪は胴と腕をすり抜ける。
  // 置き場所は初めの姿勢での世界の座標。骨からのずれに直して渡す。
  const bi = n => bones.findIndex(b => b.name === n);
  const used = new Set(bodies.map(b => b.groupIndex));
  let gi = 14; while (used.has(gi)) gi--;
  const add = (name, bone, pos, shape, w, h, rot) => bodies.push({
    name, englishName: name, boneIndex: bi(bone), groupIndex: gi, groupTarget: 1 << 5, shapeType: shape, width: w, height: h, depth: 0,
    position: pos.map((v, i) => v - rest[bone].getComponent(i)), rotation: rot || [0, 0, 0], weight: 1, positionDamping: 0.5, rotationDamping: 0.5,
    restitution: 0, friction: 0.3, type: 0 });
  add('髪よけ_背中', '上半身2', [0, 14.85, -0.35], 2, 0.78, 1.5, [0, 0, Math.PI / 2]);
  add('髪よけ_えり', '上半身2', [0, 15.3, -0.6], 2, 0.4, 1.6, [0, 0, Math.PI / 2]);
  add('髪よけ_左肩', '左肩', [1.3, 15.2, -0.5], 0, 0.6, 0);
  add('髪よけ_右肩', '右肩', [-1.3, 15.2, -0.5], 0, 0.6, 0);
  for (const [re, bits] of T.maskOff || []) for (const x of bodies) if (new RegExp(re).test(x.name)) x.groupTarget &= ~bits;
  return { rigidBodies: bodies, constraints: T.ownSkirt ? joints.filter(c => !/^Skt/.test(c.name)) : joints, hairGroup: 5 };
}

// 継ぎ手の「止まり」をやわらかくする。もとの硬さだと、体と床・脚にはさまれた布や髪が止まらずに震える。
export function softenJoints(physics, T = TUNE) {
  for (const c of physics.constraints) {
    if (!/^(Skt|SktS|BaHair|SdHair|FrHair|Eri|HairAcsC)/.test(c.params.name)) continue;
    for (let i = 0; i < 6; i++) { c.constraint.setParam(2, T.joint.erp, i); c.constraint.setParam(4, T.joint.cfm, i); }
  }
}

// 飾りの骨の動きを、物理のあとでならす。継ぎ手の幅を狭めても、止まりに当たって細かく速く揺れるのが残るため。
// 物理の体はそのまま動かし、骨に書く回転だけを「小さく・ゆっくり」にする。
export class Calm {
  constructor(mesh, T = TUNE) {
    this.o = T.armAcs;
    this.b = mesh.skeleton.bones.filter(b => /^ArmAcs/.test(b.name) && !/Root/.test(b.name));
    this.q = this.b.map(b => b.quaternion.clone()); this.t = this.q[0] ? this.q[0].clone() : null;
  }
  reset() { this.b.forEach((b, i) => { this.q[i].identity().slerp(b.quaternion, this.o.amp); b.quaternion.copy(this.q[i]); }); }
  update(dt) {
    const a = 1 - Math.exp(-dt * this.o.rate), t = this.t;
    this.b.forEach((b, i) => { t.identity().slerp(b.quaternion, this.o.amp); b.quaternion.copy(this.q[i].slerp(t, a)); });
  }
}
