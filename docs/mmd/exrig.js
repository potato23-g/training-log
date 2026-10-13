/**
 * 筋トレの種目を動かすための骨の仕組み。会話用（avatar.html）とは別に持つ。
 *
 * avatar.html は「素立ちに角度の差分を足す」作りで、呼吸や視線の揺れも一緒に乗る。
 * 種目の動きは手や足の置き場所が決まっている（足は床、手は床かダンベル）ので、ここでは
 *   ・骨盤と胸の向き、手首と足首の位置を「世界の座標」で受け取り、
 *   ・ひじ・ひざは 2 本の骨の IK を式で解く（曲がる向きは 1 つ、角度は範囲の中だけ）
 * という形にする。目の骨は一切さわらない（視線は動かない）。
 *
 * 座標: +Y が上、+Z がモデルの正面、+X がモデルの左。長さはモデルの単位（1 ≒ 7.75 cm）。
 * このモデル（PMX）の骨は、初期姿勢の回転がすべて無回転。なので「骨の世界での回転」＝
 * 「初期姿勢からどれだけ回したか」になり、親の回転の逆を掛ければ骨に書く値になる。
 */
import * as THREE from './vendor/three/three.module.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = () => new THREE.Quaternion();
const RAD = Math.PI / 180;
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const arr = a => (a && a.isVector3) ? a.clone() : V(a[0], a[1], a[2]);

// 前へ倒す（pitch+）、左を向く（yaw+）、左へ傾く（roll+）。度。
export function eul(pitch = 0, yaw = 0, roll = 0) {
  return Q().setFromEuler(new THREE.Euler(pitch * RAD, yaw * RAD, -roll * RAD, 'YXZ'));
}
// 直交する 2 本の組 (a0, b0) を (a, b) へ写す回転。b は a に直交する成分だけ使う。
function basisQ(a0, b0, a, b) {
  const m = (p, q) => {
    const x = p.clone().normalize();
    const y = q.clone().addScaledVector(x, -q.dot(x)).normalize();
    const z = x.clone().cross(y);
    return new THREE.Matrix4().makeBasis(x, y, z);
  };
  const M = m(a, b).multiply(m(a0, b0).transpose());
  return Q().setFromRotationMatrix(M);
}
// q = swing * twist（twist は axis まわり）。
function swingTwist(q, axis) {
  const d = axis.x * q.x + axis.y * q.y + axis.z * q.z;
  const twist = new THREE.Quaternion(axis.x * d, axis.y * d, axis.z * d, q.w);
  if (twist.lengthSq() < 1e-12) twist.set(0, 0, 0, 1); else twist.normalize();
  const swing = q.clone().multiply(twist.clone().invert());
  return { swing, twist };
}
const angOf = q => 2 * Math.acos(Math.min(1, Math.abs(q.w))) / RAD;
// 符号つきのねじり角（度）
const wrap = d => ((d + 180) % 360 + 360) % 360 - 180;
const twistDeg = (t, axis) => wrap(2 * Math.atan2(t.x * axis.x + t.y * axis.y + t.z * axis.z, t.w) / RAD);
const perp = (v, n) => v.clone().addScaledVector(n, -v.dot(n));

// 体の向きの型。寝る種目は体ごと回す。
export const BASE = {
  stand:  Q(),
  supine: Q().setFromAxisAngle(X, -90 * RAD),     // あおむけ。頭が −Z、足が +Z、顔が上
  prone:  Q().setFromAxisAngle(X, 90 * RAD),      // うつ伏せ。頭が +Z、顔が下
  sideL:  Q().setFromAxisAngle(Z, 90 * RAD),      // 右を下にして横向き。頭が −X、顔が +Z
};

// 関節の範囲（度）。これを超えたら diag.bad に入る。
export const LIMIT = {
  elbow: [0, 150], knee: [0, 155],
  wristTwist: [-115, 95], wristBend: 92,
  shoulderTwist: [-90, 70],     // 上腕のねじり。内へは 70 まで。外へは 90 に、腕を上げた角度を足したところまで（腕を前から上げると、横から上げたときに比べてその角度ぶん外へねじれて見えるため）     // 前腕のねじり: 手のひらが下 = 0、＋が内へ（回内）、−が外へ（回外）
  hipFlex: 135, hipExt: 35, hipAbd: 65, hipTwist: 55,
  ankleUp: 35, ankleDown: 60,
  spine: 60, neck: 60,
};

export class ExRig {
  constructor(mesh) {
    this.mesh = mesh;
    this.b = {};
    for (const bone of mesh.skeleton.bones) this.b[bone.name] = bone;
    this.restP = new Map();
    for (const bone of mesh.skeleton.bones) this.restP.set(bone, bone.position.clone());
    mesh.updateMatrixWorld(true);
    this.rw = {};                                   // 初期姿勢での世界の位置
    for (const bone of mesh.skeleton.bones) this.rw[bone.name] = V().setFromMatrixPosition(bone.matrixWorld);
    const raw = mesh.geometry.userData.MMD;
    this.physIdx = new Set((raw.rigidBodies || []).filter(r => r.type !== 0).map(r => r.boneIndex));
    this.diag = {};
    this._measure();
    this._makeDumbbells();
  }

  // ---------------------------------------------------------------- 寸法と軸
  _measure() {
    const rw = this.rw, M = (this.m = {});
    for (const [s, p] of [['L', '左'], ['R', '右']]) {
      const S = rw[p + '腕'], E = rw[p + 'ひじ'], W = rw[p + '手首'], F = rw[p + '中指１'];
      const a0 = E.clone().sub(S).normalize(), f0 = W.clone().sub(E).normalize();
      const g0 = F.clone().sub(W).normalize();
      // ひじは前腕が前（+Z）へ寄る向きに曲がる
      const h0 = a0.clone().cross(perp(Z, a0).normalize()).normalize();
      // 手: 初期姿勢は手のひらが下、親指が前
      const t0 = perp(Z, g0).normalize();
      const p0 = perp(V(0, -1, 0), g0); p0.addScaledVector(t0, -p0.dot(t0)).normalize();
      M['arm' + s] = { p, S, E, W, a0, f0, h0, g0, t0, p0, L1: E.distanceTo(S), L2: W.distanceTo(E),
                       hand: F.distanceTo(W) };
      const H = rw[p + '足'], K = rw[p + 'ひざ'], A = rw[p + '足首'], T = rw[p + 'つま先'];
      const th0 = K.clone().sub(H).normalize(), sh0 = A.clone().sub(K).normalize();
      // ひざは、すねが後ろ（−Z）へ寄る向きに曲がる
      const k0 = th0.clone().cross(perp(V(0, 0, -1), th0).normalize()).normalize();
      M['leg' + s] = { p, H, K, A, T, th0, sh0, k0, L1: K.distanceTo(H), L2: A.distanceTo(K),
                       ankleH: A.y, toe: T.clone().sub(A) };
    }
    M.pelvis = rw['下半身'].clone();
    M.center = rw['センター'].clone();
    M.hipY = (M.legL.H.y + M.legR.H.y) / 2;
    M.legLen = M.legL.L1 + M.legL.L2;
    M.armLen = M.armL.L1 + M.armL.L2;
    M.shoulderY = M.armL.S.y;
    // 指の付け根（足先EX）の位置。足首から見て下へ toeDown、前へ toeFwd
    const ex = rw['左足先EX'];
    M.toeDown = ex ? M.legL.A.y - ex.y : 0.84; M.toeFwd = ex ? ex.z - M.legL.A.z : 0.8; M.toeY = ex ? ex.y : 0.49;
  }

  // ---------------------------------------------------------------- ダンベル
  // 手首の骨の子にする。持ち手は「親指の向き」の軸に沿い、指の付け根の手のひら側に置く。
  _makeDumbbells() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.55, metalness: 0.35 });
    const bar = new THREE.MeshStandardMaterial({ color: 0xb4bcc8, roughness: 0.35, metalness: 0.7 });
    this.DB = { r: 0.17, len: 2.0, plateR: 0.64, plateT: 0.5 };
    const D = this.DB;
    this.db = {};
    const make = () => {
      const g = new THREE.Group();
      const h = new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, D.len + D.plateT, 14), bar);
      g.add(h);                                      // 円柱の軸は Y。あとで親指の向きへ合わせる
      for (const y of [-1, 1]) {
        const pl = new THREE.Mesh(new THREE.CylinderGeometry(D.plateR, D.plateR, D.plateT, 24), mat);
        pl.position.y = y * (D.len / 2); g.add(pl);
      }
      g.visible = false;
      return g;
    };
    // 両手で 1 個を持つ種目用。手の骨には付けず、種目が置き場所を決めて両手を添える。
    this.db.F = make(); this.mesh.add(this.db.F);
    for (const s of ['L', 'R']) {
      const a = this.m['arm' + s];
      const g = make();
      g.quaternion.copy(Q().setFromUnitVectors(Y, a.t0));
      a.grip = a.g0.clone().multiplyScalar(a.hand * 0.92).addScaledVector(a.p0, D.r + 0.10);
      g.position.copy(a.grip);
      this.b[a.p + '手首'].add(g);
      this.db[s] = g;
      a.gripW = a.W.clone().add(a.grip);            // 初期姿勢での持ち手の中心（世界）
    }
  }

  // ---------------------------------------------------------------- 姿勢を作る
  /**
   * spec:
   *   base      BASE のどれか（体ごとの向き）。baseQ で回転をじかに渡してもよい
   *   hips      [x,y,z] 骨盤（下半身の骨の付け根）の世界の位置
   *   pelvis    [pitch,yaw,roll] 骨盤の向き（base から。度）
   *   chest     [pitch,yaw,roll] 胸の向き（base から）。省くと骨盤と同じ＝背中まっすぐ
   *   head      [pitch,yaw,roll] 頭の向き（胸から）
   *   shrugL/R  肩をすくめる角度、shFwdL/R 肩を前へ出す角度
   *   handL/R   ctx => { pos, pole, bar | palm+fingers, fingers:'grip'|'relax'|'flat'|'fist', db:true }
   *   footL/R   ctx => { pos, pole, toe, up, toeFlat }
   * ctx には、胴体を置いたあとの肩・股関節の位置などが入る。
   */
  pose(spec) {
    const b = this.b, m = this.m, d = (this.diag = { bad: [], ang: {} });
    const bad = (k, v) => d.bad.push(k + '=' + (typeof v === 'number' ? v.toFixed(1) : v));
    const Qb = (spec.baseQ || BASE[spec.base || 'stand']).clone();
    const e3 = a => (a && a.isQuaternion) ? a : eul(a ? a[0] : 0, a ? a[1] : 0, a ? a[2] : 0);
    const Qp = Qb.clone().multiply(e3(spec.pelvis));
    const Qc = Qb.clone().multiply(e3(spec.chest || spec.pelvis));
    const Qlum = Qp.clone().slerp(Qc, 0.5);
    const Qh = Qc.clone().multiply(e3(spec.head));
    const Qn = Qc.clone().slerp(Qh, 0.4);
    d.ang.spine = angOf(Qp.clone().invert().multiply(Qc));
    d.ang.neck = angOf(Qc.clone().invert().multiply(Qh));
    if (d.ang.spine > LIMIT.spine) bad('spine', d.ang.spine);
    if (d.ang.neck > LIMIT.neck) bad('neck', d.ang.neck);

    // 胴体。センターを体ごとの向きに回し、骨盤が hips に来るように置く。
    for (const n of ['全ての親', 'グルーブ', '腰']) { b[n].quaternion.identity(); b[n].position.copy(this.restP.get(b[n])); }
    const hips = arr(spec.hips || [m.pelvis.x, m.pelvis.y, m.pelvis.z]);
    const cpos = hips.clone().sub(m.pelvis.clone().sub(m.center).applyQuaternion(Qb));
    b['センター'].quaternion.copy(Qb);
    b['センター'].position.copy(cpos);              // 親（全ての親）は原点・無回転
    const inv = q => q.clone().invert();
    b['下半身'].quaternion.copy(inv(Qb).multiply(Qp));
    b['上半身'].quaternion.copy(inv(Qb).multiply(Qlum));
    b['上半身2'].quaternion.copy(inv(Qlum).multiply(Qc));
    b['首'].quaternion.copy(inv(Qc).multiply(Qn));
    b['頭'].quaternion.copy(inv(Qn).multiply(Qh));
    const Qsh = {};
    for (const [s, p, sg] of [['L', '左', 1], ['R', '右', -1]]) {
      const up = spec['shrug' + s] || 0, fw = spec['shFwd' + s] || 0;
      const q = Q().setFromAxisAngle(Z, sg * up * RAD).multiply(Q().setFromAxisAngle(Y, sg * fw * RAD));
      b[p + '肩'].quaternion.copy(q);
      for (const n of [p + '肩P', p + '肩C']) b[n].quaternion.identity();
      Qsh[s] = Qc.clone().multiply(q);
    }
    for (const p of ['左', '右']) b['腰キャンセル' + p].quaternion.identity();
    this.mesh.updateMatrixWorld(true);

    const wp = n => V().setFromMatrixPosition(b[n].matrixWorld);
    // pin: 胴体を置いたあと、体のどこか（肩・股関節など）を決めた場所へ合わせるための平行移動
    let ctx0 = { m, Qb, Qp, Qc, Qh, shL: wp('左腕'), shR: wp('右腕'), hipL: wp('左足'), hipR: wp('右足'),
                 w: (x, y, z) => V(x, y, z).applyQuaternion(Qb), c: (x, y, z) => V(x, y, z).applyQuaternion(Qc), p: (x, y, z) => V(x, y, z).applyQuaternion(Qp) };
    if (spec.pin) {
      const dl = spec.pin(ctx0);
      b['センター'].position.add(dl); hips.add(dl);
      this.mesh.updateMatrixWorld(true);
    }
    const ctx = {
      m, Qb, Qp, Qc, Qh, hips,
      shL: wp('左腕'), shR: wp('右腕'), hipL: wp('左足'), hipR: wp('右足'),
      head: wp('頭'), neck: wp('首'), chest: wp('上半身2'),
      h: (x, y, z) => V(x, y, z).applyQuaternion(Qh),
      // 体の向きに合わせたベクトル（胸・骨盤・体ごと）
      c: (x, y, z) => V(x, y, z).applyQuaternion(Qc),
      p: (x, y, z) => V(x, y, z).applyQuaternion(Qp),
      w: (x, y, z) => V(x, y, z).applyQuaternion(Qb),
    };
    this.ctx = ctx;

    // ---- 脚
    for (const [s, p] of [['L', '左'], ['R', '右']]) {
      const L = m['leg' + s], H = ctx['hip' + s];
      const f = spec['foot' + s] ? spec['foot' + s](ctx) : {};
      const A = arr(f.pos || H.clone().add(V(0, -(L.L1 + L.L2) * 0.999, 0).applyQuaternion(Qp)));
      const pole = arr(f.pole || ctx.p(0, 0, 1));
      const r = this._twoBone(H, A, L.L1, L.L2, pole, LIMIT.knee[1]);
      if (r.err > 0.02) bad('reach_foot' + s, r.err);
      const Qth = basisQ(L.th0, L.k0, r.u, r.n), Qs = basisQ(L.sh0, L.k0, r.f, r.n);
      d.ang['knee' + s] = r.bend;
      // 足首: つま先の向きと足の裏の向きから
      const toe = arr(f.toe || ctx.w(0, 0, 1)), up = arr(f.up || ctx.w(0, 1, 0));
      const Qf = basisQ(Y, Z, up, toe);
      // 股関節の範囲（骨盤から見た太ももの向き）
      const tl = r.u.clone().applyQuaternion(inv(Qp));
      const flex = Math.atan2(tl.z, -tl.y) / RAD, abd = Math.asin(Math.max(-1, Math.min(1, tl.x * (s === 'L' ? 1 : -1)))) / RAD;
      d.ang['hipFlex' + s] = flex; d.ang['hipAbd' + s] = abd;
      if (flex > LIMIT.hipFlex || flex < -LIMIT.hipExt) bad('hipFlex' + s, flex);
      if (abd > LIMIT.hipAbd || abd < -35) bad('hipAbd' + s, abd);
      const tw = twistDeg(swingTwist(inv(Qp).multiply(Qth), L.th0).twist, L.th0);
      d.ang['hipTwist' + s] = tw;
      if (Math.abs(tw) > LIMIT.hipTwist) bad('hipTwist' + s, tw);
      // 足首の範囲（すねから見た足の裏の傾き）
      const sole = up.clone().normalize(), shin = r.f.clone().negate();        // すねの上向き
      const toeN = perp(toe, sole).normalize();
      const dorsi = Math.asin(Math.max(-1, Math.min(1, shin.dot(toeN)))) / RAD;   // + でつま先がすね側へ
      d.ang['ankle' + s] = dorsi;
      if (dorsi > LIMIT.ankleUp || dorsi < -LIMIT.ankleDown) bad('ankle' + s, dorsi);
      const set = (n, q) => { b[n].quaternion.copy(q); if (b[n + 'D']) b[n + 'D'].quaternion.copy(q); };
      set(p + '足', inv(Qp).multiply(Qth));
      set(p + 'ひざ', inv(Qth).multiply(Qs));
      set(p + '足首', inv(Qs).multiply(Qf));
      const ex = b[p + '足先EX'];
      if (ex) {                                       // 指の付け根から先。かかとを上げるとき床に残す
        if (f.toeFlat) ex.quaternion.copy(inv(Qf).multiply(basisQ(Y, Z, arr(f.toeUp || V(0, 1, 0)), arr(f.toeDir || toe))));
        else ex.quaternion.identity();
      }
      ctx['ankle' + s] = r.w; ctx['knee' + s] = r.e;
    }

    // ---- 両手で持つダンベル（脚のあと、腕の前に決める。腕はこれに合わせて置く）
    const fr = spec.free ? spec.free(ctx) : null;
    ctx.free = fr;
    this.db.F.visible = !!fr;
    if (fr) {
      this.db.F.position.copy(arr(fr.pos));
      this.db.F.quaternion.copy(Q().setFromUnitVectors(Y, arr(fr.axis).normalize()));
    }

    // ---- 腕
    for (const [s, p] of [['L', '左'], ['R', '右']]) {
      const A = m['arm' + s], S = ctx['sh' + s];
      const h = spec['hand' + s] ? spec['hand' + s](ctx) : {};
      const W = arr(h.pos || S.clone().add(ctx.c(s === 'L' ? 0.5 : -0.5, -(A.L1 + A.L2) * 0.985, 0.3)));
      const pole = arr(h.pole || ctx.c(s === 'L' ? 0.4 : -0.4, 0, -1));
      // ダンベルを持つ手は、コートの外形から少し離す（立っているときだけ。布とぶつからないように間を空ける）
      if (h.db && this.coatGap) {
        const up = ctx.p(0, 1, 0).y, wu = Math.min(1, Math.max(0, (up - 0.8) / 0.15));
        if (wu > 0) {
          const hm = ctx.hipL.clone().add(ctx.hipR).multiplyScalar(0.5), hm0 = m.legL.H.clone().add(m.legR.H).multiplyScalar(0.5);
          const iq = Qp.clone().invert(), bar = h.bar ? arr(h.bar).clone().normalize() : V(0, 0, 1), dn = W.clone().sub(S).normalize().multiplyScalar(0.6);
          let best = null, bl = 0;
          for (const [k, rad] of [[-1, 0.62], [0, 0.35], [1, 0.62]]) {
            const p0 = W.clone().add(dn).addScaledVector(bar, k).sub(hm).applyQuaternion(iq).add(hm0), g = this.coatGap(p0, rad);
            if (g && g.length() > bl) { bl = g.length(); best = g; }
          }
          if (best) {
            W.add(best.multiplyScalar(wu * wu * (3 - 2 * wu)).applyQuaternion(Qp));
            const lim = (A.L1 + A.L2) * 0.985, dv = W.clone().sub(S); if (dv.length() > lim) W.copy(S).addScaledVector(dv.normalize(), lim);
          }
        }
      }
      const r = this._twoBone(S, W, A.L1, A.L2, pole, LIMIT.elbow[1]);
      if (r.err > 0.02) bad('reach_hand' + s, r.err);
      const Qu = basisQ(A.a0, A.h0, r.u, r.n), Qf = basisQ(A.f0, A.h0, r.f, r.n);
      d.ang['elbow' + s] = r.bend;
      // 手の向き
      let Qhd;
      if (h.palm) Qhd = basisQ(A.g0, A.p0, arr(h.fingers || r.f), arr(h.palm));
      else if (h.bar) Qhd = basisQ(A.g0, A.t0, arr(h.g || r.f), arr(h.bar));
      else Qhd = Qf.clone();
      // 上腕: 肩で振る分と、骨の軸まわりのねじりに分ける（ねじりは 腕捩 へ）
      const lu = inv(Qsh[s]).multiply(Qu), st = swingTwist(lu, A.a0);
      const ut = twistDeg(st.twist, A.a0);
      d.ang['shTwist' + s] = ut; d.ang['shSwing' + s] = angOf(st.swing);
      const us = ut * (s === 'L' ? 1 : -1);      // ＋が内へ、−が外へ（左右で符号をそろえる）
      if (us > LIMIT.shoulderTwist[1] || us < LIMIT.shoulderTwist[0] - d.ang['shSwing' + s]) bad('shTwist' + s, ut);
      // ねじりの半分は肩の関節で、残りの半分を上腕の途中（腕捩）で受ける。腕を頭の上へ上げたときに上腕だけが絞られないように。
      const tq = k => Q().setFromAxisAngle(A.a0, ut * k * RAD);
      b[p + '腕'].quaternion.copy(st.swing).multiply(tq(0.5));
      b[p + '腕捩'].quaternion.copy(tq(0.5));
      for (const [i, k] of [[1, 0.25], [2, 0.5], [3, 0.75]]) {
        const bb = b[p + '腕捩' + i]; if (bb) bb.quaternion.copy(tq(0.5 * k));
      }
      const le = inv(Qu).multiply(Qf);
      b[p + 'ひじ'].quaternion.copy(le);
      const aux = b['ひじ補助_' + s]; if (aux) aux.quaternion.identity().slerp(le, 0.65);
      // 前腕: ねじり（手捩）→ 手首の曲げ
      const R = inv(Qf).multiply(Qhd), ri = swingTwist(R.clone().invert(), A.f0);
      const tw = ri.twist.clone().invert(), sw = ri.swing.clone().invert();
      d.ang['wristTwist' + s] = twistDeg(tw, A.f0); d.ang['wristBend' + s] = angOf(sw);
      const wt = d.ang['wristTwist' + s] * (s === 'L' ? 1 : -1);
      if (wt < LIMIT.wristTwist[0] || wt > LIMIT.wristTwist[1]) bad('wristTwist' + s, d.ang['wristTwist' + s]);
      if (d.ang['wristBend' + s] > LIMIT.wristBend) bad('wristBend' + s, d.ang['wristBend' + s]);
      b[p + '手捩'].quaternion.copy(tw);
      for (const [i, k] of [[1, 0.25], [2, 0.5], [3, 0.75]]) {
        const bb = b[p + '手捩' + i]; if (bb) bb.quaternion.identity().slerp(tw, k);
      }
      b[p + '手首'].quaternion.copy(sw);
      this._fingers(s, h.hand || (h.db ? 'grip' : 'relax'));
      this.db[s].visible = !!h.db;
      ctx['wrist' + s] = r.w; ctx['elbow' + s] = r.e;
    }
    this.mesh.updateMatrixWorld(true);
    return d;
  }

  // 2 本の骨の IK。S から W へ、長さ L1・L2、曲がりの外側（ひじ・ひざの出る側）を pole で指す。
  // 届かないとき・曲げすぎになるときは、届く範囲へ寄せて err にずれを返す。
  _twoBone(S, W, L1, L2, pole, maxBend) {
    const dv = W.clone().sub(S);
    let dist = dv.length();
    const dmax = (L1 + L2) * 0.9995;
    const dmin = Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(maxBend * RAD));
    const want = dist;
    dist = Math.max(dmin, Math.min(dmax, dist));
    const dir = dv.lengthSq() > 1e-10 ? dv.clone().normalize() : V(0, -1, 0);
    let pp = perp(pole, dir);
    if (pp.lengthSq() < 1e-8) pp = perp(Math.abs(dir.y) < 0.9 ? Y : Z, dir);
    pp.normalize();
    const cosA = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const e = S.clone().addScaledVector(dir, L1 * cosA).addScaledVector(pp, L1 * sinA);
    const w = S.clone().addScaledVector(dir, dist);
    const u = e.clone().sub(S).normalize(), f = w.clone().sub(e).normalize();
    const n = u.clone().cross(pp.clone().negate()).normalize();
    const bend = Math.acos(Math.max(-1, Math.min(1, u.dot(f)))) / RAD;
    return { e, w, u, f, n, bend, err: Math.abs(want - dist) };
  }

  // 指。握る・力を抜く・開く。曲げる軸は「親指の向き」の軸で、指先が手のひら側へ寄る符号。
  _fingers(s, mode) {
    const A = this.m['arm' + s], b = this.b, p = A.p;
    const sign = Math.sign(A.t0.clone().cross(A.g0).dot(A.p0)) || 1;
    const T = {
      relax: { four: [[14, 20, 16], [17, 24, 19], [20, 27, 21], [25, 30, 24]], th: [8, 10, 12], opp: 0 },
      flat:  { four: [[0, 2, 2], [0, 2, 2], [0, 2, 2], [0, 2, 2]], th: [0, 0, 0], opp: 0 },
      grip:  { four: [[62, 78, 52], [64, 80, 54], [66, 82, 56], [68, 84, 58]], th: [22, 28, 40], opp: 34 },
      fist:  { four: [[70, 90, 60], [72, 92, 62], [74, 94, 64], [76, 96, 66]], th: [25, 30, 45], opp: 30 },
      cup:   { four: [[30, 40, 30], [32, 42, 32], [34, 44, 34], [36, 46, 36]], th: [10, 14, 18], opp: 12 },
    }[mode] || null;
    if (!T) return;
    ['人指', '中指', '薬指', '小指'].forEach((f, i) => ['１', '２', '３'].forEach((nn, j) => {
      const bone = b[p + f + nn]; if (bone) bone.quaternion.setFromAxisAngle(A.t0, sign * T.four[i][j] * RAD);
    }));
    // 親指: 手のひら側へ回してから（対立）、付け根から巻く
    const t0 = b[p + '親指０'], t1 = b[p + '親指１'], t2 = b[p + '親指２'];
    if (t0 && t1) {
      const td = this.rw[p + '親指１'].clone().sub(this.rw[p + '親指０']).normalize();
      const ax = td.clone().cross(A.p0).normalize();        // この軸で回すと親指が手のひら側へ倒れる
      const o = Q().setFromAxisAngle(A.g0, -Math.sign(A.t0.clone().cross(A.p0).dot(A.g0)) * T.opp * RAD);
      t0.quaternion.copy(o).multiply(Q().setFromAxisAngle(ax, T.th[0] * RAD));
      t1.quaternion.setFromAxisAngle(ax, T.th[1] * RAD);
      if (t2) t2.quaternion.setFromAxisAngle(ax, T.th[2] * RAD);
    }
  }

  // ---------------------------------------------------------------- 検査用
  // 物理で動かない骨（体・手足・頭）に付いている頂点の表を作る。sample 個に 1 個。
  _bodyVerts(step = 5) {
    if (this._bv) return this._bv;
    const g = this.mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const bones = this.mesh.skeleton.bones, list = [];
    for (let i = 0; i < si.count; i += step) {
      let best = 0, bi = si.getX(i);
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } }
      if (this.physIdx.has(bi) || /^(Hair|Skirt_Root)/i.test(bones[bi].name)) continue;      // 髪とコートはやわらかいので床の検査から外す
      list.push([i, bones[bi].name]);
    }
    return (this._bv = list);
  }
  // 体の頂点のうち、いちばん低い高さ。names を渡すと、その骨に付いた頂点だけ。
  minY(names, skip) {
    this.mesh.skeleton.update();
    const v = V(), set = names ? new Set(names) : null, no = skip ? new Set(skip) : null;
    let lo = Infinity, who = '';
    for (const [i, n] of this._bodyVerts()) {
      if ((set && !set.has(n)) || (no && no.has(n))) continue;
      this.mesh.getVertexPosition(i, v); v.applyMatrix4(this.mesh.matrixWorld);
      if (v.y < lo) { lo = v.y; who = n; }
    }
    return { y: lo, bone: who };
  }
  // 体の頂点の範囲（寸法を測る用）
  extent(names) {
    this.mesh.skeleton.update();
    const v = V(), set = new Set(names), box = new THREE.Box3();
    for (const [i, n] of this._bodyVerts()) {
      if (!set.has(n)) continue;
      this.mesh.getVertexPosition(i, v); v.applyMatrix4(this.mesh.matrixWorld);
      box.expandByPoint(v);
    }
    return box;
  }
  // 頭の中へ、頭以外（服・髪・腕）の頂点が入りこんでいないか。初めの姿勢で頭の外にある頂点だけを見る。
  // 頭は、頭の骨に付いた頂点を囲む箱に内接する楕円体（少し小さめ）として扱う。
  headPen(step = 3, shrink = 0.95) {
    const mesh = this.mesh, g = mesh.geometry, bones = mesh.skeleton.bones, v = V();
    const hi = bones.indexOf(this.b['頭']);
    if (!this._hp) {
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position, binv = mesh.skeleton.boneInverses[hi];
      const dom = i => { let best = 0, bi = si.getX(i); for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } } return [bi, best]; };
      // 顔の材質（0 番）の頂点から。顔は頭の前半分なので、奥行きは幅と同じとみなす
      const box = new THREE.Box3(), gr = g.groups[0];
      for (let j = gr.start; j < gr.start + gr.count; j += 3) { const i = g.index.getX(j), [bi, w] = dom(i); if (bi === hi && w > 0.95) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(binv)); }
      const h = box.getSize(V()).multiplyScalar(0.5); h.z = h.x * 1.1;
      const c = box.getCenter(V()); c.z = box.max.z - h.z; h.multiplyScalar(shrink);
      const rad = p => Math.hypot((p.x - c.x) / h.x, (p.y - c.y) / h.y, (p.z - c.z) / h.z);
      const list = [];
      for (let i = 0; i < pos.count; i += step) {
        const [bi] = dom(i), n = bones[bi].name;
        if (bi === hi || /足|ひざ|Skt|下半身|つま先|Hair|頭|目/.test(n)) continue;
        if (rad(v.fromBufferAttribute(pos, i).applyMatrix4(binv)) > 1.04) list.push([i, n]);
      }
      this._hp = { rad, list, c, h };
    }
    mesh.skeleton.update();
    const inv = new THREE.Matrix4().copy(bones[hi].matrixWorld).invert().multiply(mesh.matrixWorld), out = {};
    for (const [i, n] of this._hp.list) {
      mesh.getVertexPosition(i, v); v.applyMatrix4(inv);
      const r = this._hp.rad(v);
      if (r < 1) { const o = out[n] || (out[n] = [0, 1]); o[0]++; o[1] = Math.min(o[1], r); }
    }
    return out;
  }
  wp(n) { return V().setFromMatrixPosition(this.b[n].matrixWorld); }
  // ダンベルの中心と軸（世界）
  dbWorld(s) {
    const g = this.db[s]; g.updateWorldMatrix(true, false);
    const c = V().setFromMatrixPosition(g.matrixWorld);
    const ax = V(0, 1, 0).transformDirection(g.matrixWorld);
    return { c, ax, vis: g.visible };
  }
}

export { V, Q, RAD, X, Y, Z, perp, basisQ };
