/* ============================================================
   人体の骨格モデルと動作生成（DOM も three.js も使わない純関数群）

   座標系: X=前(体の正面)  Y=上  Z=右  単位=メートル  床 y=0
   休め姿勢: 直立・両腕を体側に垂らす。このとき各ボーンの局所軸は
   ワールド軸と一致するので、関節角は解剖学の面と一対一で対応する。
     屈曲/伸展 = Z軸まわり   外転/内転・側屈 = X軸まわり   回旋 = Y軸まわり
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------- ベクトル・クォータニオン ---------- */
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  };

  const Q = {
    id: () => [0, 0, 0, 1],
    mul: (a, b) => [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ],
    conj: (q) => [-q[0], -q[1], -q[2], q[3]],
    axis: (ax, rad) => {
      const h = rad / 2, s = Math.sin(h);
      return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(h)];
    },
    rot: (q, v) => {
      const [x, y, z, w] = q;
      const tx = 2 * (y * v[2] - z * v[1]);
      const ty = 2 * (z * v[0] - x * v[2]);
      const tz = 2 * (x * v[1] - y * v[0]);
      return [v[0] + w * tx + y * tz - z * ty,
              v[1] + w * ty + z * tx - x * tz,
              v[2] + w * tz + x * ty - y * tx];
    },
    /* 単位ベクトル from を to に最短で向けるクォータニオン */
    between: (from, to) => {
      const f = V.norm(from), t = V.norm(to);
      const d = V.dot(f, t);
      if (d > 0.999999) return Q.id();
      if (d < -0.999999) {
        let ax = V.cross(f, [1, 0, 0]);
        if (V.len(ax) < 1e-6) ax = V.cross(f, [0, 1, 0]);
        return Q.axis(V.norm(ax), Math.PI);
      }
      const c = V.cross(f, t);
      return Q.normalize([c[0], c[1], c[2], 1 + d]);
    },
    normalize: (q) => {
      const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1e-9;
      return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
    },
    /* Z(屈曲)→X(外転)→Y(回旋) の順に回す */
    fromFAT: (flexRad, abdRad, twistRad) =>
      Q.mul(Q.mul(Q.axis([0, 0, 1], flexRad), Q.axis([1, 0, 0], abdRad)), Q.axis([0, 1, 0], twistRad)),
    /* 同じ順序で分解して度で返す（可動域の検査用）
       R = Rz(f)Rx(a)Ry(t) より  m21=sin a, m20=-cos a sin t, m22=cos a cos t,
       m01=-sin f cos a, m11=cos f cos a */
    toFAT: (q) => {
      const m = Q.matrix(q), D = 180 / Math.PI;
      const a = Math.asin(clamp(m[7], -1, 1));
      const ca = Math.cos(a);
      let f, t;
      if (Math.abs(ca) > 1e-6) {
        f = Math.atan2(-m[1], m[4]);
        t = Math.atan2(-m[6], m[8]);
      } else {                      /* 外転90度付近は屈曲と回旋が縮退する */
        f = Math.atan2(m[3], m[0]);
        t = 0;
      }
      return [f * D, a * D, t * D];
    },
    /* 直交基底（各軸の行き先）からクォータニオンを作る */
    fromBasis: (x, y, z) => {
      const m = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
      const tr = m[0] + m[4] + m[8];
      let q;
      if (tr > 0) {
        const s = Math.sqrt(tr + 1) * 2;
        q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, 0.25 * s];
      } else if (m[0] > m[4] && m[0] > m[8]) {
        const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
        q = [0.25 * s, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s];
      } else if (m[4] > m[8]) {
        const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
        q = [(m[1] + m[3]) / s, 0.25 * s, (m[5] + m[7]) / s, (m[2] - m[6]) / s];
      } else {
        const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
        q = [(m[2] + m[6]) / s, (m[5] + m[7]) / s, 0.25 * s, (m[3] - m[1]) / s];
      }
      return Q.normalize(q);
    },
    /* 軸 a まわりのねじれ成分だけ取り出す（q = twist * swing の twist） */
    twistAbout: (q, a) => {
      const d = q[0] * a[0] + q[1] * a[1] + q[2] * a[2];
      return Q.normalize([a[0] * d, a[1] * d, a[2] * d, q[3]]);
    },
    /* 行優先 3x3 */
    matrix: (q) => {
      const [x, y, z, w] = q;
      return [
        1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
        2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
        2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
      ];
    }
  };

  const RAD = Math.PI / 180;
  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);

  /* ============================================================
     体格（身長175.8cm / 62kg を Winter の人体計測値で割り付け）
     offset は親ボーンの局所座標での関節位置、dir は休め姿勢での骨の向き。
     mass は体重比、com は近位端からの重心位置（骨長比）。
     rom は [最小, 最大] 度。flex=屈曲 abd=外転/側屈 rot=回旋(内旋+/右回り+)
     ============================================================ */
  const BODY = { height: 1.758, mass: 62 };

  const BONES = [
    /* 体幹 */
    { name: 'pelvis', parent: null, offset: [0, 0, 0], dir: [0, 1, 0], len: 0.10, mass: 0.142, com: 0.4 },
    { name: 'spineL', parent: 'pelvis', offset: [-0.02, 0.08, 0], dir: [0, 1, 0], len: 0.17, mass: 0.139, com: 0.45,
      rom: { flex: [-20, 50], abd: [-25, 25], rot: [-12, 12] }, sign: { flex: -1, abd: 1, rot: -1 } },
    { name: 'spineT', parent: 'spineL', offset: [0, 0.17, 0], dir: [0, 1, 0], len: 0.16, mass: 0.108, com: 0.5,
      rom: { flex: [-12, 20], abd: [-20, 20], rot: [-20, 20] }, sign: { flex: -1, abd: 1, rot: -1 } },
    { name: 'spineC', parent: 'spineT', offset: [0, 0.16, 0], dir: [0, 1, 0], len: 0.15, mass: 0.108, com: 0.5,
      rom: { flex: [-12, 18], abd: [-15, 15], rot: [-25, 25] }, sign: { flex: -1, abd: 1, rot: -1 } },
    { name: 'neck', parent: 'spineC', offset: [0, 0.15, 0], dir: [0, 1, 0], len: 0.08, mass: 0.020, com: 0.5,
      rom: { flex: [-45, 45], abd: [-35, 35], rot: [-60, 60] }, sign: { flex: -1, abd: 1, rot: -1 } },
    { name: 'head', parent: 'neck', offset: [0, 0.08, 0], dir: [0, 1, 0], len: 0.19, mass: 0.061, com: 0.5,
      rom: { flex: [-25, 25], abd: [-15, 15], rot: [-25, 25] }, sign: { flex: -1, abd: 1, rot: -1 } },
    /* 肩甲帯と腕（右を定義して左へ鏡像） */
    { name: 'clav', side: true, parent: 'spineC', offset: [0.05, 0.10, 0.02], dir: [0, 0, 1], len: 0.16, mass: 0.005, com: 0.5,
      rom: { flex: [-20, 25], abd: [-12, 30], rot: [-5, 5] },
      sign: { flex: 'side', abd: '-side', rot: 1 }, dof: { flex: 'prot', abd: 'elev' } },
    { name: 'upperarm', side: true, parent: 'clav', offset: [-0.04, -0.005, 0.16], dir: [0, -1, 0], len: 0.30, mass: 0.028, com: 0.436,
      rom: { flex: [-60, 175], abd: [-30, 165], rot: [-95, 95] }, sign: { flex: 1, abd: '-side', rot: 'side' } },
    { name: 'forearm', side: true, parent: 'upperarm', offset: [0, -0.30, 0], dir: [0, -1, 0], len: 0.255, mass: 0.016, com: 0.430,
      rom: { flex: [-5, 148], abd: [0, 0], rot: [-20, 200] }, sign: { flex: 1, abd: 1, rot: 'side' } },
    { name: 'hand', side: true, parent: 'forearm', offset: [0, -0.255, 0], dir: [0, -1, 0], len: 0.15, mass: 0.006, com: 0.506,
      rom: { flex: [-92, 80], abd: [-22, 28], rot: [-15, 15] }, sign: { flex: 1, abd: '-side', rot: 'side' } },
    /* 脚 */
    { name: 'thigh', side: true, parent: 'pelvis', offset: [0, -0.02, 0.085], dir: [0, -1, 0], len: 0.43, mass: 0.100, com: 0.433,
      rom: { flex: [-25, 132], abd: [-28, 48], rot: [-42, 42] }, sign: { flex: 1, abd: '-side', rot: 'side' } },
    { name: 'shank', side: true, parent: 'thigh', offset: [0, -0.43, 0], dir: [0, -1, 0], len: 0.43, mass: 0.0465, com: 0.433,
      rom: { flex: [-3, 146], abd: [0, 0], rot: [-18, 18] }, sign: { flex: -1, abd: 1, rot: 'side' } },
    { name: 'foot', side: true, parent: 'shank', offset: [0, -0.43, 0], dir: [1, 0, 0], len: 0.135, mass: 0.0125, com: 0.5,
      rom: { flex: [-55, 45], abd: [-18, 18], rot: [-14, 14] }, sign: { flex: 1, abd: '-side', rot: 'side' } },
    { name: 'toes', side: true, parent: 'foot', offset: [0.135, -0.03, 0], dir: [1, 0, 0], len: 0.065, mass: 0.002, com: 0.5,
      rom: { flex: [-25, 78], abd: [0, 0], rot: [0, 0] }, sign: { flex: 1, abd: 1, rot: 1 } }
  ];

  /* 足の局所形状（足首を原点とする）: 踵・母趾球・つま先の接地点 */
  const FOOT = { ankleH: 0.075, heel: [-0.058, -0.075, 0], ball: [0.135, -0.075, 0], mtp: [0.135, -0.03, 0], tip: [0.20, -0.075, 0] };
  /* 手の局所形状（手首を原点とする）: 手のひら中心とグリップ軸 */
  const HAND = { palm: [0, -0.075, 0], palmSurf: [0.042, -0.075, 0], grip: [0, -0.085, 0] };

  /* 左右に展開したボーン表を作る */
  const RIG = { bones: {}, order: [] };
  BONES.forEach((b) => {
    const mk = (name, side) => {
      const off = b.offset.slice();
      const dir = b.dir.slice();
      if (side < 0) { off[2] = -off[2]; dir[2] = -dir[2]; }
      const sign = {};
      Object.keys(b.sign || {}).forEach((k) => {
        const s = b.sign[k];
        sign[k] = s === 'side' ? side : (s === '-side' ? -side : s);
      });
      RIG.bones[name] = {
        name, side, parent: b.parent,
        offset: off, dir, len: b.len, mass: b.mass, com: b.com,
        rom: b.rom || null, sign, dof: b.dof || null
      };
      RIG.order.push(name);
    };
    if (b.side) { mk(b.name + 'R', 1); mk(b.name + 'L', -1); } else mk(b.name, 1);
  });
  /* side 付きボーンの親名を左右つきに解決する */
  Object.values(RIG.bones).forEach((b) => {
    if (b.side && b.parent && RIG.bones[b.parent] === undefined) {
      const suf = b.side > 0 ? 'R' : 'L';
      if (RIG.bones[b.parent + suf]) b.parent = b.parent + suf;
    }
  });
  const MASS_SUM = Object.values(RIG.bones).reduce((a, b) => a + b.mass, 0);

  /* ============================================================
     順運動学
     pose.q[bone] = 局所クォータニオン、pose.root = {pos, quat}
     戻り値 frame.b[bone] = { pos（関節位置）, quat（ワールド姿勢）, tip }
     ============================================================ */
  function fk(pose) {
    const out = {};
    RIG.order.forEach((name) => {
      const b = RIG.bones[name];
      const lq = pose.q[name] || Q.id();
      if (!b.parent) {
        const rq = Q.mul(pose.root.quat || Q.id(), lq);
        out[name] = { pos: pose.root.pos.slice(), quat: rq };
      } else {
        const p = out[b.parent];
        const pos = V.add(p.pos, Q.rot(p.quat, b.offset));
        out[name] = { pos, quat: Q.mul(p.quat, lq) };
      }
      const o = out[name];
      o.tip = V.add(o.pos, Q.rot(o.quat, V.mul(b.dir, b.len)));
      o.comPos = V.add(o.pos, Q.rot(o.quat, V.mul(b.dir, b.len * b.com)));
    });
    return { b: out };
  }

  /* 局所座標の点をワールドへ */
  function at(frame, bone, local) {
    const o = frame.b[bone];
    return V.add(o.pos, Q.rot(o.quat, local));
  }

  /* 角度ドライバ（度）から局所クォータニオンを組む */
  function quatFor(boneName, drivers, prefix) {
    const b = RIG.bones[boneName];
    const key = prefix !== undefined ? prefix : boneName;
    const names = { flex: 'flex', abd: 'abd', rot: 'rot' };
    if (b.dof) Object.keys(b.dof).forEach((k) => { names[k] = b.dof[k]; });
    const get = (k) => {
      const v = drivers[key + '.' + names[k]];
      return typeof v === 'number' ? v : 0;
    };
    const s = b.sign || {};
    return Q.fromFAT(get('flex') * (s.flex || 1) * RAD,
                     get('abd') * (s.abd || 1) * RAD,
                     get('rot') * (s.rot || 1) * RAD);
  }

  /* 全ボーンぶんの局所クォータニオンを作る。IK で上書きするボーンは skip に入れる */
  function poseFromDrivers(drivers, skip) {
    const q = {};
    RIG.order.forEach((name) => {
      if (skip && skip[name]) return;
      q[name] = quatFor(name, drivers);
    });
    const d = drivers;
    const root = {
      pos: [d['pelvis.x'] || 0, d['pelvis.y'] || 0, d['pelvis.z'] || 0],
      quat: Q.fromFAT((d['pelvis.pitch'] || 0) * -RAD, (d['pelvis.roll'] || 0) * RAD, (d['pelvis.yaw'] || 0) * -RAD)
    };
    return { q, root };
  }

  /* ============================================================
     2ボーンIK: 親関節 P から末端 T へ、極ベクトル pole の側に中間関節を出す
     戻り値は上腕/大腿と前腕/下腿のワールドクォータニオン
     ============================================================ */
  function twoBoneIK(P, T, L1, L2, pole, dirLocal) {
    let d = V.sub(T, P);
    let dist = V.len(d);
    const maxd = (L1 + L2) * 0.9995, mind = Math.abs(L1 - L2) + 1e-4;
    if (dist > maxd) { d = V.mul(V.norm(d), maxd); dist = maxd; }
    if (dist < mind) { d = V.mul(V.norm(d), mind); dist = mind; }
    const u = V.norm(d);
    let v = V.sub(pole, V.mul(u, V.dot(pole, u)));
    if (V.len(v) < 1e-6) {
      v = V.sub([0, 0, 1], V.mul(u, V.dot([0, 0, 1], u)));
      if (V.len(v) < 1e-6) v = [1, 0, 0];
    }
    v = V.norm(v);
    const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const a = Math.acos(cosA);
    const K = V.add(P, V.mul(V.add(V.mul(u, Math.cos(a)), V.mul(v, Math.sin(a))), L1));
    return { knee: K };
  }

  /* dirLocal を targetDir に向け、局所 Z 軸（屈曲軸）を zWorld に合わせる */
  function orientBone(dirLocal, targetDir, zWorld) {
    const d = V.norm(targetDir);
    let z = V.sub(zWorld, V.mul(d, V.dot(zWorld, d)));
    if (V.len(z) < 1e-7) {
      z = V.cross(d, [0, 1, 0]);
      if (V.len(z) < 1e-7) z = V.cross(d, [1, 0, 0]);
    }
    z = V.norm(z);
    /* 局所 X,Y,Z の行き先を作る（右手系: X = Y x Z） */
    let ix, iy, iz = z;
    if (Math.abs(dirLocal[1]) > 0.5) {            /* 骨が -Y or +Y 方向（手足・脊柱） */
      iy = dirLocal[1] > 0 ? d : V.mul(d, -1);
      ix = V.norm(V.cross(iy, iz));
    } else {                                       /* 骨が +X 方向（足・鎖骨は別処理） */
      ix = d;
      iy = V.norm(V.cross(iz, ix));
    }
    return Q.fromBasis(ix, iy, iz);
  }

  /* ============================================================
     キーフレーム補間（周期・単調三次エルミート）
     ============================================================ */
  function driverNames(m) {
    const set = {};
    Object.keys(m.base || {}).forEach((k) => { set[k] = 1; });
    (m.keys || []).forEach((k) => Object.keys(k.d || {}).forEach((n) => { set[n] = 1; }));
    return Object.keys(set);
  }

  function buildTracks(m) {
    const T = m.keys[m.keys.length - 1].t;
    const names = driverNames(m);
    const tracks = {};
    names.forEach((n) => {
      const pts = m.keys.map((k) => ({
        t: k.t,
        v: (k.d && k.d[n] !== undefined) ? k.d[n] : (m.base[n] !== undefined ? m.base[n] : 0),
        hold: !!k.hold
      }));
      /* 周期を意識した接線（値が折り返す点では 0 にして滑らかに止める） */
      const n0 = pts.length;
      pts.forEach((p, i) => {
        const prev = pts[(i - 1 + n0) % n0], next = pts[(i + 1) % n0];
        const dtp = (i === 0 ? (T - prev.t + pts[0].t) : p.t - prev.t) || 1e-6;
        const dtn = (i === n0 - 1 ? (pts[0].t + T - p.t) : next.t - p.t) || 1e-6;
        const sp = (p.v - prev.v) / dtp, sn = (next.v - p.v) / dtn;
        let tang = (sp * dtn + sn * dtp) / (dtp + dtn);
        if (p.hold || prev.hold && sp === 0 || sp * sn <= 0) tang = 0;
        p.m = tang;
      });
      tracks[n] = { pts, T };
    });
    return { tracks, T };
  }

  function sampleTrack(tr, t) {
    const pts = tr.pts, T = tr.T;
    t = ((t % T) + T) % T;
    let i = 0;
    while (i < pts.length - 1 && pts[i + 1].t <= t) i++;
    const a = pts[i], b = pts[i + 1] || pts[pts.length - 1];
    const h = (b.t - a.t) || 1e-6;
    const s = clamp((t - a.t) / h, 0, 1);
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * a.v + (s3 - 2 * s2 + s) * h * (a.m || 0)
         + (-2 * s3 + 3 * s2) * b.v + (s3 - s2) * h * (b.m || 0);
  }

  function driversAt(m, t) {
    if (!m._tracks) { const r = buildTracks(m); m._tracks = r.tracks; m._T = r.T; }
    const d = {};
    Object.keys(m._tracks).forEach((n) => { d[n] = sampleTrack(m._tracks[n], t); });
    return d;
  }

  /* ============================================================
     接地スペック → 末端ボーンのワールド姿勢と接地点
     spec = { at:[x,y,z] 接触するワールド点, local:[..] その点のボーン局所座標,
              pitch/yaw/roll: 度（ドライバ名を文字列で書くと補間値を読む）, pole:[..] }
     ============================================================ */
  function specAngle(spec, key, drivers) {
    const v = spec[key];
    if (typeof v === 'string') return drivers[v] || 0;
    return v || 0;
  }
  function endQuat(spec, drivers) {
    const yaw = specAngle(spec, 'yaw', drivers), pitch = specAngle(spec, 'pitch', drivers),
          roll = specAngle(spec, 'roll', drivers);
    return Q.mul(Q.mul(Q.axis([0, 1, 0], -yaw * RAD), Q.axis([0, 0, 1], pitch * RAD)), Q.axis([1, 0, 0], roll * RAD));
  }

  /* ============================================================
     1フレームを解く
     ============================================================ */
  function solveFrame(m, t) {
    const drivers = driversAt(m, t);
    const skip = {};
    const legs = [], arms = [];
    ['R', 'L'].forEach((s) => {
      const f = m.feet && m.feet[s];
      if (f) { ['thigh', 'shank', 'foot'].forEach((b) => { skip[b + s] = 1; }); legs.push({ s, spec: f }); }
      const h = m.hands && m.hands[s];
      if (h) { ['upperarm', 'forearm', 'hand'].forEach((b) => { skip[b + s] = 1; }); arms.push({ s, spec: h }); }
    });

    let pose = poseFromDrivers(drivers, skip);
    let frame = null;

    const pass = () => {
      frame = fk(pose);
      if (m.anchor) {                    /* 指定点（膝や肩甲骨）が台から動かないよう骨盤ごと寄せる */
        const cur = at(frame, m.anchor.bone, m.anchor.local);
        pose.root.pos = V.add(pose.root.pos, V.sub(m.anchor.at, cur));
        frame = fk(pose);
      }
      const applyIK = (chain, spec, side) => {
        const rootBone = RIG.bones[chain[0]];
        const P = frame.b[chain[0]].pos;
        /* 目標点は世界座標、または「このボーンについていく」指定 */
        let anchor, relQ = null;
        if (Array.isArray(spec.at)) anchor = spec.at.slice();
        else { anchor = at(frame, spec.at.bone, spec.at.local); relQ = frame.b[spec.at.bone].quat; }
        let endW;
        if (spec.align === 'surface') {
          const n = V.norm(spec.normal || [0, -1, 0]);        /* 手のひらの向き */
          let fwd = Q.rot(frame.b[spec.faceFrom || 'spineC'].quat, [1, 0, 0]);
          fwd = V.sub(fwd, V.mul(n, V.dot(fwd, n)));
          if (V.len(fwd) < 1e-5) fwd = V.sub([1, 0, 0], V.mul(n, V.dot([1, 0, 0], n)));
          fwd = V.norm(fwd);
          if (spec.fingerYaw) {                               /* 指の向きを水平面内で回す */
            const c = Math.cos(spec.fingerYaw * RAD), sn = Math.sin(spec.fingerYaw * RAD);
            const side = V.cross(n, fwd);
            fwd = V.norm(V.add(V.mul(fwd, c), V.mul(side, sn)));
          }
          const iY = V.mul(fwd, -1);
          endW = Q.fromBasis(n, iY, V.norm(V.cross(n, iY)));
        } else {
          endW = endQuat(spec, drivers);
          if (relQ) endW = Q.mul(relQ, endW);
        }
        const endPos = V.sub(anchor, Q.rot(endW, spec.local));
        const L1 = rootBone.len, L2 = RIG.bones[chain[1]].len;
        let pole = spec.pole ? (relQ ? Q.rot(relQ, spec.pole) : spec.pole.slice()) : Q.rot(endW, [1, 0, 0]);
        const r = twoBoneIK(P, endPos, L1, L2, pole, rootBone.dir);
        const K = r.knee;
        /* 肘・膝は蝶番。曲がる面の法線を屈曲軸にすると、ねじれが混ざらない */
        let n = V.cross(V.sub(K, P), V.sub(endPos, K));
        if (V.len(n) < 1e-6) n = V.cross(V.sub(K, P), pole);
        n = V.norm(n);
        const hingeSign = (RIG.bones[chain[1]].sign || {}).flex || 1;
        const zAxis = V.mul(n, hingeSign);
        let q1 = orientBone(rootBone.dir, V.sub(K, P), zAxis);
        let q2 = orientBone(RIG.bones[chain[1]].dir, V.sub(endPos, K), zAxis);
        const parentQ = frame.b[RIG.bones[chain[0]].parent].quat;
        /* 末端（手・足）のねじれは、前腕の回内／下腿のねじれへ逃がす */
        let endLocal = Q.mul(Q.conj(q2), endW);
        const tw = Q.twistAbout(endLocal, [0, 1, 0]);
        q2 = Q.mul(q2, tw);
        endLocal = Q.mul(Q.conj(tw), endLocal);
        pose.q[chain[0]] = Q.mul(Q.conj(parentQ), q1);
        pose.q[chain[1]] = Q.mul(Q.conj(q1), q2);
        pose.q[chain[2]] = endLocal;
        frame = fk(pose);
      };
      legs.forEach((l) => applyIK(['thigh' + l.s, 'shank' + l.s, 'foot' + l.s], l.spec, l.s));
      arms.forEach((a) => applyIK(['upperarm' + a.s, 'forearm' + a.s, 'hand' + a.s], a.spec, a.s));
    };

    pass();

    /* 重心が支持面の目標点に来るよう骨盤をずらす（立位のみ） */
    if (m.balance) {
      const axes = m.balance.axes || ['x'];
      const idx = { x: 0, y: 1, z: 2 };
      for (let it = 0; it < 6; it++) {
        const com = centerOfMass(frame, m, drivers);
        const tgt = balanceTarget(frame, m, drivers);
        let moved = 0;
        axes.forEach((ax) => {
          const i = idx[ax];
          const err = com[i] - tgt[i];
          if (Math.abs(err) < 0.0008) return;
          pose.root.pos[i] -= err * 1.35;
          moved = 1;
        });
        if (!moved) break;
        pass();
      }
    }

    const com = centerOfMass(frame, m, drivers);
    return { t, drivers, pose, b: frame.b, com, contacts: contactPoints(frame, m, drivers),
             dumbbells: dumbbellPoses(frame, m, drivers), motion: m };
  }

  /* ダンベルを含む全体重心 */
  function centerOfMass(frame, m, drivers) {
    let sum = [0, 0, 0], tot = 0;
    RIG.order.forEach((n) => {
      const b = RIG.bones[n];
      sum = V.add(sum, V.mul(frame.b[n].comPos, b.mass));
      tot += b.mass;
    });
    const dbs = dumbbellPoses(frame, m, drivers);
    dbs.forEach((d) => {
      const w = (d.kg || 0) / BODY.mass;
      sum = V.add(sum, V.mul(d.pos, w));
      tot += w;
    });
    return V.mul(sum, 1 / tot);
  }

  function balanceTarget(frame, m, drivers) {
    const cs = contactPoints(frame, m, drivers).filter((c) => c.support !== false);
    if (!cs.length) return [0, 0, 0];
    let s = [0, 0, 0];
    let w = 0;
    cs.forEach((c) => { const k = c.weight === undefined ? 1 : c.weight; s = V.add(s, V.mul(c.pos, k)); w += k; });
    const c0 = V.mul(s, 1 / w);
    const off = (m.balance && m.balance.offset) || [0, 0, 0];
    return [c0[0] + off[0], c0[1] + off[1], c0[2] + off[2]];
  }

  /* ============================================================
     接地点・ダンベル・可動域
     ============================================================ */
  function contactPoints(frame, m, drivers) {
    const out = [];
    ['R', 'L'].forEach((s) => {
      const f = m.feet && m.feet[s];
      if (f) {
        const pins = f.pins || [FOOT.heel, FOOT.ball];
        pins.forEach((p, i) => out.push({ name: 'foot' + s + i, pos: at(frame, 'foot' + s, p),
          bone: 'foot' + s, local: p, support: f.support !== false }));
      }
      const h = m.hands && m.hands[s];
      if (h && h.pins) {
        h.pins.forEach((p, i) => out.push({ name: 'hand' + s + i, pos: at(frame, 'hand' + s, p),
          bone: 'hand' + s, local: p, support: h.support !== false }));
      }
    });
    (m.contacts || []).forEach((c, i) => out.push({
      name: c.name || (c.bone + i), pos: at(frame, c.bone, c.local), bone: c.bone, local: c.local,
      anchor: c.at || null, support: c.support !== false, weight: c.weight
    }));
    return out;
  }

  function dumbbellPoses(frame, m, drivers) {
    const out = [];
    (m.dumbbells || []).forEach((d) => {
      const kg = d.kg === undefined ? 5 : d.kg;
      if (d.grip === 'both') {
        const a = at(frame, 'handR', d.local || HAND.grip);
        const b = at(frame, 'handL', d.local || HAND.grip);
        const pos = V.mul(V.add(a, b), 0.5);
        const quat = d.axis === 'vertical' ? Q.axis([1, 0, 0], Math.PI / 2)
          : Q.between([0, 0, 1], V.norm(V.len(V.sub(a, b)) > 1e-4 ? V.sub(a, b) : [0, 0, 1]));
        out.push({ pos: V.add(pos, d.offset || [0, 0, 0]), quat, kg, both: true });
      } else {
        const bone = d.grip;
        const pos = at(frame, bone, d.local || HAND.grip);
        out.push({ pos: V.add(pos, d.offset || [0, 0, 0]), quat: frame.b[bone].quat, kg });
      }
    });
    return out;
  }

  /* 局所クォータニオンを解剖学的な角度（度）に戻す */
  function boneAngles(pose, name) {
    const b = RIG.bones[name];
    const fat = Q.toFAT(pose.q[name] || Q.id());
    const s = b.sign || {};
    return { flex: fat[0] / (s.flex || 1), abd: fat[1] / (s.abd || 1), rot: fat[2] / (s.rot || 1) };
  }

  function romCheck(pose, tol) {
    const bad = [];
    const eps = tol === undefined ? 1.5 : tol;
    RIG.order.forEach((n) => {
      const b = RIG.bones[n];
      if (!b.rom) return;
      const a = boneAngles(pose, n);
      ['flex', 'abd', 'rot'].forEach((k) => {
        const r = b.rom[k];
        if (!r) return;
        /* 360度の折り返しを考え、可動域に最も近い等価角で判定する */
        let bestV = a[k], bestD = Infinity;
        [a[k] - 360, a[k], a[k] + 360].forEach((c) => {
          const d = c < r[0] ? r[0] - c : (c > r[1] ? c - r[1] : 0);
          if (d < bestD) { bestD = d; bestV = c; }
        });
        a[k] = bestV;
        if (a[k] < r[0] - eps || a[k] > r[1] + eps) {
          bad.push({ bone: n, dof: k, value: Math.round(a[k] * 10) / 10, rom: r });
        }
      });
    });
    return bad;
  }

  /* 体を覆うカプセル（自己貫通と床抜けの検査、描画の当たりにも使う） */
  function capsules(frame) {
    const caps = [];
    RIG.order.forEach((n) => {
      const b = RIG.bones[n];
      const r = CAP_R[n.replace(/[RL]$/, '')] || 0.05;
      caps.push({ bone: n, a: frame.b[n].pos, b: frame.b[n].tip, r });
    });
    return caps;
  }
  const CAP_R = {
    pelvis: 0.115, spineL: 0.115, spineT: 0.125, spineC: 0.12, neck: 0.055, head: 0.093,
    clav: 0.05, upperarm: 0.049, forearm: 0.042, hand: 0.042,
    thigh: 0.082, shank: 0.056, foot: 0.045, toes: 0.035
  };

  function cycleTime(m) { return m.keys[m.keys.length - 1].t; }

  /* 種目の登録簿（motions.js が詰める） */
  const motions = {};
  function register(def) { motions[def.id] = def; return def; }

  root.MOTION = {
    V, Q, RAD, clamp, BODY, RIG, FOOT, HAND, CAP_R,
    fk, at, poseFromDrivers, twoBoneIK, orientBone,
    driversAt, solveFrame, centerOfMass, contactPoints, dumbbellPoses,
    boneAngles, romCheck, capsules, cycleTime, motions, register
  };
})(typeof window !== 'undefined' ? window : globalThis);
