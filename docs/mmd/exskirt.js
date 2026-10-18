/**
 * コートのすそ（Skt の骨 6 段 × 12 列）を、布として解く。
 * もとの物理（薄い箱を継ぎ手でつないだもの）は、脚や床にはさまれると暴れ、台やダンベルとは当たらない。
 * ここでは点と長さの決まり（position based dynamics）で解く。当たる相手は、体のカプセル・床・台・段差・柱・ダンベル。
 * 点は骨の根元に置き、解いた形から骨の回転を書き戻す。髪や襟などは、もとの物理のまま。
 */
import * as THREE from './vendor/three/three.module.js';

const R = 6, C = 12, K = 6;                       // 段・列・太さの刻み
const id = (r, c) => r * C + ((c % C) + C) % C;
const linked = c => (((c % C) + C) % C) !== 0;      // 列 c と c+1 がつながっているか（前の合わせ目 0-1 は開いている）
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Skirt {
  constructor(rig, raw, props, opt) {
    const mesh = this.mesh = rig.mesh, bones = mesh.skeleton.bones, rw = rig.rw;
    this.rig = rig; this.props = props;
    this.o = Object.assign({ sub: 6, iter: 3, g: -98, drag: 1.8, vmax: 55, margin: 0.13, mu: 0.45, muPin: 0.8, muSlick: 0.02, arms: false, hem: 0.65, bend: 0.0004, ring: 0.0005, shear: 0.004, comp: 0.006, vcomp: 1, floor: 0, pmax: 0.12, pmaxB: 0.2, slit: [0.8, 1.6, 2.6, 3.8, 5, 6, 7] }, opt);
    const bone = n => bones.find(b => b.name === n), body = n => raw.rigidBodies.find(b => b.name === n);
    this.root = bone('Skirt_Root'); this.rootRest = rw['Skirt_Root'].clone();
    const n = this.n = (R + 1) * C;
    this.x = new Float64Array(n * 3); this.p = new Float64Array(n * 3); this.v = new Float64Array(n * 3);
    this.xl = new Float64Array(n * 3); this.w = new Float64Array(n).fill(1);
    this.pin0 = new Float64Array(C * 3); this.pin1 = new Float64Array(C * 3);
    this.sk = [];
    const x0 = [];
    for (let r = 0; r <= R; r++) for (let c = 0; c < C; c++) {
      let q;
      if (r < R) { const nm = `Skt_${r}_${c}`; q = rw[nm].clone(); this.sk.push(bone(nm)); }
      else { const nm = `Skt_${R - 1}_${c}`, b = body(nm); q = rw[nm].clone().add(V(...b.position).multiplyScalar(2)); }
      x0.push(q); q.clone().sub(this.rootRest).toArray(this.xl, id(r, c) * 3);
      if (r === 0) this.w[id(r, c)] = 0;
    }
    this.x0 = x0;
    // 長さの決まり: [点, 点, 長さ, 伸びへの強さ, 縮みへの強さ]
    const con = [], add = (i, j, ks, kc) => con.push([i, j, x0[i].distanceTo(x0[j]), ks, kc]);
    const o = this.o;
    for (let r = 0; r <= R; r++) for (let c = 0; c < C; c++) {
      if (r < R) add(id(r, c), id(r + 1, c), 1, o.vcomp);      // 縦は縮みにも硬い（やわらかくすると骨の長さと合わなくなり、床や台へ入りこむ）
      if (r > 0 && linked(c)) add(id(r, c), id(r, c + 1), 0.9, o.comp);
      if (r < R && linked(c)) { add(id(r, c), id(r + 1, c + 1), o.shear, o.shear); add(id(r, c + 1), id(r + 1, c), o.shear, o.shear); }
      if (r + 2 <= R) add(id(r, c), id(r + 2, c), o.bend, o.bend);
      if (r > 0 && linked(c) && linked(c + 1)) add(id(r, c), id(r, c + 2), o.ring, o.ring);
    }
    // 前の合わせ目: 上のほうは留めてあり、下へいくほど開く。開ききって片側が体の後ろへ回りこむのを止める
    for (let r = 1; r <= R; r++) con.push([id(r, 0), id(r, 1), x0[id(r, 0)].distanceTo(x0[id(r, 1)]) + o.slit[r - 1], 1, 0]);
    this.con = con;
    // 当たりを見る点: 点そのもの・辺のまんなか・ますのまんなか
    const S = [];
    for (let r = 1; r <= R; r++) for (let c = 0; c < C; c++) S.push([[id(r, c)], [1]]);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) S.push([[id(r, c), id(r + 1, c)], [0.5, 0.5]]);
    for (let r = 1; r <= R; r++) for (let c = 0; c < C; c++) if (linked(c)) S.push([[id(r, c), id(r, c + 1)], [0.5, 0.5]]);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (linked(c)) S.push([[id(r, c), id(r, c + 1), id(r + 1, c), id(r + 1, c + 1)], [0.25, 0.25, 0.25, 0.25]]);
    this.S = S;
    // 床との当たりを、すそほど高めに取る。点のあいだの布の面とフリルは点より外へ出るので、点だけを床の上に置いても面が床へ刺さる
    this.lift = Float32Array.from(S, ([I]) => { const r = Math.max(...I.map(i => Math.floor(i / C))); return r >= R ? o.hem : r === R - 1 ? o.hem * 0.6 : o.hem * 0.3; });
    this.cn = new Float64Array(n * 3); this.cv = new Float64Array(n * 3); this.ch = new Uint8Array(n); this.bn = new Float64Array(n * 3); this.fn = new Float64Array(n * 3); this.ba = new Float64Array(n);

    // 当たる相手（体）。もとの物理の「骨に従う剛体」から取る。脚は、見た目の太さを頂点から測る。
    this.cols = [];
    const mk = (name, b, la, lb, r) => {
      const col = { name, bone: b, la, lb, prof: new Float64Array(K + 1).fill(r), on: true, was: false, morph: true,
        a: V(), b: V(), pa: V(), pb: V(), ta: V(), tb: V(), ra: null, rb: null, clamp: null, rmax: r };
      if (b) { const o0 = rw[b.name]; col.ra = la.clone().add(o0); col.rb = lb.clone().add(o0); }
      this.cols.push(col); return col;
    };
    const want = /^(上半身|下半身02|下半身[左右]足付け根0[12]|[左右]腕|[左右]ひじ)$/;   // 手は入れない（腰に当てた手が布の内側に入って、布を外へ押し出すため）
    for (const bd of raw.rigidBodies) {
      if (bd.type !== 0 || !want.test(bd.name)) continue;
      const off = new THREE.Matrix4().compose(V(...bd.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...bd.rotation)), V(1, 1, 1));
      const b = bones[bd.boneIndex], P = (x, y, z) => V(x, y, z).applyMatrix4(off);
      if (/ひじ/.test(bd.name)) mk(bd.name, b, P(0, bd.height / 2, 0), P(0, -bd.height / 2, 0), 0.3).outer = 1;
      else if (/腕/.test(bd.name)) mk(bd.name, b, P(0, bd.height / 2, 0), P(0, -bd.height / 2, 0), bd.width).outer = 1;
      else if (bd.shapeType === 0) mk(bd.name, b, P(0, 0, 0), P(0, 0, 0), bd.width);
      else mk(bd.name, b, P(0, bd.height / 2, 0), P(0, -bd.height / 2, 0), bd.width);
    }
    const g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const coat = new Uint8Array(pos.count);
    g.groups.forEach((gr, mi) => { if (/Clothes01/.test(mesh.material[mi].name)) for (let j = gr.start; j < gr.start + gr.count; j++) coat[g.index.getX(j)] = 1; });
    const dom = i => { let best = 0, bi = si.getX(i); for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } } return bones[bi].name; };
    const dn = new Array(pos.count); for (let i = 0; i < pos.count; i++) dn[i] = coat[i] ? '' : dom(i);
    const pick = (a, b) => (bone(a) ? a : b);
    for (const s of ['左', '右']) {
      const hip = pick(s + '足D', s + '足'), knee = pick(s + 'ひざD', s + 'ひざ'), ank = pick(s + '足首D', s + '足首');
      for (const [top, bot, re, r0] of [[hip, knee, new RegExp('^' + s + '足(D|捩|$)'), 0.55], [knee, ank, new RegExp('^' + s + 'ひざ(D|$)'), 0.45]]) {
        const A = rw[top], B = rw[bot], col = mk(top, bone(top), V(), B.clone().sub(A), r0);
        const ab = B.clone().sub(A), L2 = ab.lengthSq(), bins = Array.from({ length: K + 1 }, () => []), q = V();
        for (let i = 0; i < pos.count; i++) {
          if (!re.test(dn[i])) continue;
          q.fromBufferAttribute(pos, i); const t = q.clone().sub(A).dot(ab) / L2; if (t < -0.02 || t > 1.02) continue;
          bins[Math.min(K, Math.max(0, Math.round(t * K)))].push(q.distanceTo(A.clone().addScaledVector(ab, t)));
        }
        for (let k = 0; k <= K; k++) { const d = bins[k].sort((u, w) => u - w); if (d.length > 8) col.prof[k] = Math.min(r0 * 2.2, Math.max(r0 * 0.7, d[Math.floor(d.length * 0.95)])); }
        col.rmax = Math.max(...col.prof);
      }
    }
    // 腰まわり（下半身・足の付け根）も、見た目の太さを頂点から測る（ショートパンツのふくらみが、剛体の幅より外へ出てコートを突き抜けるため）
    for (const col of this.cols) {
      if (!col.bone || !/^下半身/.test(col.name)) continue;
      const A = col.ra, ab = col.rb.clone().sub(A), L2 = ab.lengthSq(), r0 = col.prof[0], bins = Array.from({ length: K + 1 }, () => []), q = V();
      // 球（足の付け根）は測らない。骨盤の頂点の95%を包む球は実際のお尻よりずっと大きく（1.9〜2.2。剛体は 0.9〜1.0）、
      // 横に寝ると上側のお尻の上に見えない球が張り出して、コートが宙に立ち、球の中では脚が布を突き抜けた
      if (L2 < 1e-9) continue;
      for (let i = 0; i < pos.count; i++) {
        if (dn[i] !== col.bone.name) continue;
        q.fromBufferAttribute(pos, i); const t = L2 > 1e-9 ? q.clone().sub(A).dot(ab) / L2 : 0; if (t < -0.1 || t > 1.1) continue;
        const d = q.distanceTo(A.clone().addScaledVector(ab, Math.min(1, Math.max(0, t)))); if (d > r0 * 2.5) continue;
        bins[Math.min(K, Math.max(0, Math.round(t * K)))].push(d);
      }
      for (let k = 0; k <= K; k++) { const d = bins[k].sort((u, w) => u - w); if (d.length > 8) col.prof[k] = Math.max(r0, d[Math.floor(d.length * 0.95)]); }
      col.rmax = Math.max(...col.prof);
    }
    // 道具とダンベル
    this.dbs = ['L', 'R', 'F'].map(s => { const c = mk('db' + s, null, V(), V(), 0.62); c.morph = false; c.db = s; c.slick = true; c.outer = 1; return c; });
    this.pole = mk('pole', null, V(), V(), 0.19 + 0.05); this.pole.morph = false;
    this.boxes = ['bench', 'step'].map(k => { const p = props.P[k].geometry.parameters; return { k, m: props.P[k], h: [p.width / 2, p.height / 2, p.depth / 2] }; });
    // 初めの形でもう重なっている相手は、その近さまでは押し返さない（腰まわりは体に沿っている）
    const m = this.o.margin, sp = V();
    for (const col of this.cols) {
      if (!col.ra) continue;
      col.clamp = new Float32Array(S.length).fill(1e9);
      const ab = col.rb.clone().sub(col.ra), L2 = ab.lengthSq();
      S.forEach(([I, Wt], s) => {
        sp.set(0, 0, 0); I.forEach((i, k) => sp.addScaledVector(x0[i], Wt[k]));
        const t = L2 > 1e-9 ? Math.min(1, Math.max(0, sp.clone().sub(col.ra).dot(ab) / L2)) : 0;
        const d = sp.distanceTo(col.ra.clone().addScaledVector(ab, t));
        if (d < this._rad(col, t) + m) col.clamp[s] = d * 0.97;
      });
    }
    this.M = new THREE.Matrix4(); this._tmp = V();
    if (!this.o.passive) this.reseed();
  }
  _rad(col, t) { const f = t * K, k = Math.min(K - 1, Math.floor(f)); return col.prof[k] + (col.prof[k + 1] - col.prof[k]) * (f - k); }

  // 相手のいまの置き場所を読む（前のコマの分は pa/pb に残す）
  _targets() {
    this.mesh.updateMatrixWorld(true);
    const P = this.props.P;
    for (const col of this.cols) {
      col.pa.copy(col.a); col.pb.copy(col.b); const was = col.on;
      if (col.bone) { col.a.copy(col.la).applyMatrix4(col.bone.matrixWorld); col.b.copy(col.lb).applyMatrix4(col.bone.matrixWorld); col.on = true; }
      else if (col.db) { const d = this.rig.dbWorld(col.db); col.on = d.vis; col.a.copy(d.c).addScaledVector(d.ax, 1); col.b.copy(d.c).addScaledVector(d.ax, -1); }
      else { col.on = P.pole.visible; col.a.copy(P.pole.position); col.b.copy(P.pole.position); col.a.y += 13; col.b.y -= 13; }
      if (!was || !col.was) { col.pa.copy(col.a); col.pb.copy(col.b); }
      col.was = true;
    }
    this.pin0.set(this.pin1);
    const M = this.M.copy(this.root.matrixWorld), q = this._tmp;
    for (let c = 0; c < C; c++) { q.fromArray(this.xl, c * 3).applyMatrix4(M); q.toArray(this.pin1, c * 3); }
  }

  // 姿勢が飛んだとき（種目の切り替え・止め絵）。立った形から、いまの姿勢へ体を動かしながら布を落ち着かせる。
  // 仕上げは、ふつうの減衰で落とす。止め絵は settle を長く（重い減衰で短く止めると、寝た種目で上になった側のすそが立ったまま残り、脚が布を通り抜けた）
  reseed(frames = 36, settle = 24) {
    this._targets(); this._targets();
    const M = this.M, q = this._tmp, x = this.x;
    for (let i = 0; i < this.n; i++) { q.fromArray(this.xl, i * 3).applyMatrix4(M); q.toArray(x, i * 3); }
    this.v.fill(0); this.pin0.set(this.pin1);
    const rest = c => [c.ra.clone().sub(this.rootRest).applyMatrix4(M), c.rb.clone().sub(this.rootRest).applyMatrix4(M)];
    const mv = this.cols.filter(c => c.morph && c.ra).map(c => ({ c, s: rest(c), ta: c.a.clone(), tb: c.b.clone() }));
    for (const e of mv) { e.c.a.copy(e.s[0]); e.c.b.copy(e.s[1]); }
    for (let f = 1; f <= frames; f++) {
      const u = f / frames, b = u * u * (3 - 2 * u);
      for (const e of mv) { e.c.pa.copy(e.c.a); e.c.pb.copy(e.c.b); e.c.a.lerpVectors(e.s[0], e.ta, b); e.c.b.lerpVectors(e.s[1], e.tb, b); }
      this._sim(1 / 60, 6);
    }
    for (const col of this.cols) { col.pa.copy(col.a); col.pb.copy(col.b); }
    for (let f = 0; f < settle; f++) this._sim(1 / 60, this.o.drag);
    this.v.fill(0);
    this._write();
  }

  update(dt) { this._targets(); this._sim(dt, this.o.drag); this._write(); }

  _sim(dt, drag) {
    const o = this.o, n = this.n, x = this.x, p = this.p, v = this.v, w = this.w;
    const ns = Math.max(1, Math.min(o.sub * 2, Math.round(o.sub * dt * 60))), h = dt / ns, df = Math.exp(-drag * h);
    // 腕とダンベルを先に、体をあとに当てる。はさまれた布は体の側に残る（体の中へ押しこまれない）
    const cols = this.cols.filter(c => c.on).sort((a, b) => (b.outer || b.slick ? 1 : 0) - (a.outer || a.slick ? 1 : 0)), nc = cols.length;
    const ca = new Float64Array(nc * 3), cb = new Float64Array(nc * 3), va = new Float64Array(nc * 3), vb = new Float64Array(nc * 3);
    cols.forEach((c, k) => { for (let a = 0; a < 3; a++) { va[k * 3 + a] = (c.a.getComponent(a) - c.pa.getComponent(a)) / dt; vb[k * 3 + a] = (c.b.getComponent(a) - c.pb.getComponent(a)) / dt; } });
    const boxes = this.boxes.filter(b => b.m.visible).map(b => ({ c: b.m.position, cs: Math.cos(b.m.rotation.y), sn: Math.sin(b.m.rotation.y), h: b.h }));
    // 腕とダンベルは、いつも布の外にある。布を体のほうへ押すだけにする（内側から外へは押し出さない）
    const e = this.M.elements, c0x = e[12], c0y = e[13], c0z = e[14], al = Math.hypot(e[4], e[5], e[6]) || 1, adx = e[4] / al, ady = e[5] / al, adz = e[6] / al;
    const m = o.margin, fy = o.floor + m * 0.6, lift = this.lift, S = this.S, con = this.con, cn = this.cn, cv = this.cv, ch = this.ch, bn = this.bn, fn = this.fn, ba = this.ba;
    for (let s = 0; s < ns; s++) {
      const al = (s + 1) / ns;
      cols.forEach((c, k) => { for (let a = 0; a < 3; a++) { ca[k * 3 + a] = c.pa.getComponent(a) + (c.a.getComponent(a) - c.pa.getComponent(a)) * al; cb[k * 3 + a] = c.pb.getComponent(a) + (c.b.getComponent(a) - c.pb.getComponent(a)) * al; } });
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        if (w[i] === 0) { for (let a = 0; a < 3; a++) { p[j + a] = x[j + a]; x[j + a] = this.pin0[j + a] + (this.pin1[j + a] - this.pin0[j + a]) * al; } continue; }
        v[j + 1] += o.g * h;
        let vx = v[j] * df, vy = v[j + 1] * df, vz = v[j + 2] * df; const sp = Math.hypot(vx, vy, vz);
        if (sp > o.vmax) { const k = o.vmax / sp; vx *= k; vy *= k; vz *= k; }
        p[j] = x[j]; p[j + 1] = x[j + 1]; p[j + 2] = x[j + 2];
        x[j] += vx * h; x[j + 1] += vy * h; x[j + 2] += vz * h;
      }
      ch.fill(0); bn.fill(0); fn.fill(0); ba.fill(0);
      for (let it = 0; it < o.iter; it++) {
        for (let k = 0; k < con.length; k++) {
          const e = con[k], i = e[0] * 3, j = e[1] * 3, wi = w[e[0]], wj = w[e[1]], ws = wi + wj; if (ws === 0) continue;
          const dx = x[j] - x[i], dy = x[j + 1] - x[i + 1], dz = x[j + 2] - x[i + 2], d = Math.hypot(dx, dy, dz); if (d < 1e-9) continue;
          const f = (d - e[2]) / d * (d > e[2] ? e[3] : e[4]) / ws;
          x[i] += dx * f * wi; x[i + 1] += dy * f * wi; x[i + 2] += dz * f * wi;
          x[j] -= dx * f * wj; x[j + 1] -= dy * f * wj; x[j + 2] -= dz * f * wj;
        }
        for (let s2 = 0; s2 < S.length; s2++) {
          const I = S[s2][0], Wt = S[s2][1]; let den = 0, qx = 0, qy = 0, qz = 0, py0 = 0;
          for (let k = 0; k < I.length; k++) { const j = I[k] * 3; qx += x[j] * Wt[k]; qy += x[j + 1] * Wt[k]; qz += x[j + 2] * Wt[k]; py0 += p[j + 1] * Wt[k]; if (w[I[k]]) den += Wt[k] * Wt[k]; }
          if (den === 0) continue;
          let lf = 1;                                // 床から浮かせる割合（脚に近いほど小さく）
          const push = (px, py, pz, k3, t) => {
            // 深く入りこんだ所を一度に押し出さない（脚や台の角に押されたすそが、1コマで跳ねた）。床は上限なし。体は台より大きく（小さいと脚に押されたすそが追いつけず、空中に残って脚が布を通り抜けた）
            const cap = k3 >= 0 ? o.pmaxB : px || pz ? o.pmax : 0; if (cap) { const l = Math.hypot(px, py, pz); if (l > cap) { const k = cap / l; px *= k; py *= k; pz *= k; } }
            for (let k = 0; k < I.length; k++) { const i = I[k]; if (!w[i]) continue; const f = Wt[k] / den, j = i * 3; x[j] += px * f; x[j + 1] += py * f; x[j + 2] += pz * f;
              const l = Math.hypot(px, py, pz) || 1;
              if (k3 < 0) { fn[j] += px / l; fn[j + 1] += py / l; fn[j + 2] += pz / l; } else if (!cols[k3 / 3].outer && !cols[k3 / 3].slick) { bn[j] += px / l; bn[j + 1] += py / l; bn[j + 2] += pz / l; ba[i]++; } ch[i] = k3 >= 0 && (cols[k3 / 3].outer || cols[k3 / 3].slick) ? 2 : 1; cn[j] = px / l; cn[j + 1] = py / l; cn[j + 2] = pz / l;
              if (k3 >= 0) for (let a = 0; a < 3; a++) cv[j + a] = va[k3 + a] + (vb[k3 + a] - va[k3 + a]) * t; else cv[j] = cv[j + 1] = cv[j + 2] = 0;  }
            qx += px; qy += py; qz += pz;
          };
          for (let k = 0; k < nc; k++) {
            const c = cols[k]; if (c.outer && !o.arms) continue;
            const k3 = k * 3, ax = ca[k3], ay = ca[k3 + 1], az = ca[k3 + 2], bx = cb[k3] - ax, by = cb[k3 + 1] - ay, bz = cb[k3 + 2] - az;
            const L2 = bx * bx + by * by + bz * bz; let t = L2 > 1e-9 ? ((qx - ax) * bx + (qy - ay) * by + (qz - az) * bz) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = qx - ax - bx * t, dy = qy - ay - by * t, dz = qz - az - bz * t, d2 = dx * dx + dy * dy + dz * dz, rm = c.rmax + m + lift[s2];
            if (d2 > rm * rm) continue;
            let r = this._rad(c, t) + m; if (c.clamp && c.clamp[s2] < r) r = c.clamp[s2];
            const d = Math.sqrt(d2);
            if (!c.outer && !c.slick && lift[s2] > 0) lf = Math.min(lf, Math.max(0, (d - r) / lift[s2]));
            if (d >= r || d < 1e-6) continue;
            const f = (r - d) / d;
            if (c.outer) {                            // 体の軸に向かう横の分だけ押す。上下には押さない（下から来た腕やダンベルに布が引っかかって持ち上がるため）
              const ux = qx - c0x, uy = qy - c0y, uz = qz - c0z, h2 = ux * adx + uy * ady + uz * adz, da = dx * adx + dy * ady + dz * adz;
              const px = (dx - adx * da) * f, py = (dy - ady * da) * f, pz = (dz - adz * da) * f;
              if (px * (ux - adx * h2) + py * (uy - ady * h2) + pz * (uz - adz * h2) > 0) continue;
              push(px, py, pz, k3, t); continue;
            }
            push(dx * f, dy * f, dz * f, k3, t);
          }
          for (const b of boxes) {
            const rx = qx - b.c.x, ry = qy - b.c.y, rz = qz - b.c.z, lx = rx * b.cs - rz * b.sn, lz = rx * b.sn + rz * b.cs;
            const ex = b.h[0] + m - Math.abs(lx), ey = b.h[1] + m - Math.abs(ry), ez = b.h[2] + m - Math.abs(lz);
            if (ex <= 0 || ey <= 0 || ez <= 0) continue;
            // 箱の外にある点は、箱のいちばん近い所から離す（角を丸く当てる。上面と横の面の押し合いが角で入れ替わり、すそが跳ねた）
            const cx = Math.max(-b.h[0], Math.min(b.h[0], lx)), cy = Math.max(-b.h[1], Math.min(b.h[1], ry)), cz = Math.max(-b.h[2], Math.min(b.h[2], lz));
            const dx = lx - cx, dy = ry - cy, dz = lz - cz, dd = Math.hypot(dx, dy, dz);
            if (dd > 1e-6) { if (dd >= m) continue; const f = (m - dd) / dd, sx = dx * f, sz = dz * f; push(sx * b.cs + sz * b.sn, dy * f, -sx * b.sn + sz * b.cs, -1, 0); continue; }
            // 上から来た布は上へ返す（座ると尻に押されて上面より下へ入り、横の面へはじき出されてすそが跳ねた）
            const above = py0 >= b.c.y + b.h[1] + m * 0.5;
            if (above || (ry > 0 && ey <= Math.min(ex, ez) * 1.5) || (ey <= ex && ey <= ez)) push(0, above ? b.h[1] + m - ry : Math.sign(ry) * ey, 0, -1, 0);
            else if (ex <= ez) { const sx = Math.sign(lx) * ex; push(sx * b.cs, 0, -sx * b.sn, -1, 0); }
            else { const sz = Math.sign(lz) * ez; push(sz * b.sn, 0, sz * b.cs, -1, 0); }
          }
          // 体の近くは床から浮かせない。体からの距離に応じてなめらかに減らす（すそを浮かせる分 lift が、床に寝た太ももの下の布を脚の中へ押し上げ、
          // 太ももの内側に布が入りこんだ。浮かせる・浮かせないを切り替えると、境目で床の高さが跳んで布が震えた）
          const fl0 = fy + lift[s2] * lf;
          if (qy < fl0) push(0, fl0 - qy, 0, -1, 0);
        }
      }
      for (let i = 0; i < n; i++) {
        if (w[i] === 0) continue; const j = i * 3;
        let vx = (x[j] - p[j]) / h, vy = (x[j + 1] - p[j + 1]) / h, vz = (x[j + 2] - p[j + 2]) / h;
        // 床（台）と体に逆向きから押された点（はさまれた点）は、はさむ向きの速さを消す。重力とすべる向きは残す
        // （横に寝る種目で、下になった側のすそが押し合いを毎コマ速さにしてはね回った。速さを丸ごと0にすると、脚に触れたすそが空中で止まった）
        const bl = Math.hypot(bn[j], bn[j + 1], bn[j + 2]), fl = Math.hypot(fn[j], fn[j + 1], fn[j + 2]);
        // はさまれた点の摩擦は muPin（ふつうの mu 0.45 だと、両脚と床にはさまれたすそが脚の上げ下げのたびに 4cm ほど弾けた）
        // 体の2か所（両脚など）に逆向きから押された点は、はさむ向き（最後に押された向き）の動きを消し、位置も前のコマ＋その速さに戻す
        // （骨盤の球を小さくしたら、横に寝る種目ですそが両脚にはさまれ、重なった脚の当たりの間で位置が毎コマ入れ替わった。速さだけ消しても位置は跳ねる）
        if (ba[i] >= 2 && bl < ba[i] * 0.5) {
          const d = vx * cn[j] + vy * cn[j + 1] + vz * cn[j + 2], k = 1 - o.muPin;
          v[j] = (vx - cn[j] * d) * k; v[j + 1] = (vy - cn[j + 1] * d) * k; v[j + 2] = (vz - cn[j + 2] * d) * k;
          x[j] = p[j] + v[j] * h; x[j + 1] = p[j + 1] + v[j + 1] * h; x[j + 2] = p[j + 2] + v[j + 2] * h; continue;
        }
        if (bl && fl && (bn[j] * fn[j] + bn[j + 1] * fn[j + 1] + bn[j + 2] * fn[j + 2]) / (bl * fl) < -0.3) {
          const ax = fn[j] / fl - bn[j] / bl, ay = fn[j + 1] / fl - bn[j + 1] / bl, az = fn[j + 2] / fl - bn[j + 2] / bl, al = Math.hypot(ax, ay, az), d = (vx * ax + vy * ay + vz * az) / (al * al), k = 1 - o.muPin;
          v[j] = (vx - ax * d) * k; v[j + 1] = (vy - ay * d) * k; v[j + 2] = (vz - az * d) * k; continue;
        }
        if (ch[i]) {                                  // 触れている相手に対するすべりを減らす。押し返された分は速さにしない（はね返ると、脚とダンベルにはさまれた所が震える）
          const rx = vx - cv[j], ry = vy - cv[j + 1], rz = vz - cv[j + 2], vn = 0, k = 1 - (ch[i] === 2 ? o.muSlick : o.mu);   // 腕とダンベルはよくすべる（布を引きずって後ろへ回さない）
          const dn = rx * cn[j] + ry * cn[j + 1] + rz * cn[j + 2];
          vx = cv[j] + (rx - cn[j] * dn) * k + cn[j] * vn; vy = cv[j + 1] + (ry - cn[j + 1] * dn) * k + cn[j + 1] * vn; vz = cv[j + 2] + (rz - cn[j + 2] * dn) * k + cn[j + 2] * vn;
        }
        v[j] = vx; v[j + 1] = vy; v[j + 2] = vz;
      }
    }
  }

  // 点の並びから、骨の向きを決める（下向き = 次の段、横向き = となりの列）
  _basis(get, r, c, out) {
    const L = c === 1 ? c : c - 1, Rr = c === 0 ? c : c + 1;
    const d = get(r + 1, c).sub(get(r, c)).normalize();
    const t = get(r, Rr).sub(get(r, L)).add(get(r + 1, Rr)).sub(get(r + 1, L));
    const nn = V().crossVectors(t, d).normalize(); t.crossVectors(d, nn);
    return out.makeBasis(t, d, nn);
  }
  _write() {
    const x = this.x, B0 = new THREE.Matrix4(), B = new THREE.Matrix4(), Qw = new THREE.Quaternion(), Qp = [];
    if (!this.q0) { this.q0 = []; const g0 = (r, c) => this.x0[id(r, c)].clone();
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) this.q0.push(new THREE.Quaternion().setFromRotationMatrix(this._basis(g0, r, c, B0)).invert()); }
    const get = (r, c) => V().fromArray(x, id(r, c) * 3);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c;
      Qw.setFromRotationMatrix(this._basis(get, r, c, B)).multiply(this.q0[i]);
      const par = r === 0 ? rootQ : Qp[(r - 1) * C + c];
      this.sk[i].quaternion.copy(par).invert().multiply(Qw);
      Qp[i] = Qw.clone();
    }
    this.root.updateMatrixWorld(true);
  }

  // 検査: すその骨（見えている形）が、体・道具・床へどれだけ入っているか。もとの物理のままでも測れる。
  // 立った形のコートの外形から、点 p（立った形の座標）を半径 rad ぶん離すのに要る横向きの移動。離れていれば null
  gap(p, rad, clear = 0.5) {
    if (!this._env) {
      const cz = this.x0.reduce((s, q) => s + q.z, 0) / this.x0.length, rows = [];
      for (let r = 0; r <= R; r++) { const pts = []; let y = 0;
        for (let c = 0; c < C; c++) { const q = this.x0[id(r, c)]; y += q.y / C; pts.push([Math.atan2(q.x, q.z - cz), Math.hypot(q.x, q.z - cz)]); }
        pts.sort((a, b) => a[0] - b[0]); rows.push({ y, pts }); }
      this._env = { cz, rows };
    }
    const { cz, rows } = this._env, yT = rows[0].y, yB = rows[R].y;
    if (p.y > yT + rad || p.y < yB - rad) return null;
    const th = Math.atan2(p.x, p.z - cz), rho = Math.hypot(p.x, p.z - cz);
    const at = row => { const P = row.pts, n = P.length; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; let a0 = a[0], b0 = b[0], t = th; if (b0 < a0) { b0 += 2 * Math.PI; if (t < a0) t += 2 * Math.PI; }
      if (t >= a0 && t <= b0) return a[1] + (b[1] - a[1]) * (b0 > a0 ? (t - a0) / (b0 - a0) : 0); } return P[0][1]; };
    const y = Math.min(yT, Math.max(yB, p.y)); let r = 0; while (r < R - 1 && rows[r + 1].y > y) r++;
    const t = (rows[r].y - y) / Math.max(1e-6, rows[r].y - rows[r + 1].y), env = at(rows[r]) * (1 - t) + at(rows[r + 1]) * t;
    const sm = (a, b, v) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
    const d = (env + rad + clear - rho) * sm(env - 1.6, env - 0.8, rho) * sm(yB - rad, yB - rad * 0.3, p.y) * (1 - sm(yT, yT + rad, p.y));
    return d > 0.01 ? V(Math.sin(th), 0, Math.cos(th)).multiplyScalar(Math.min(d, 1.4)) : null;
  }

  pen() {
    this.mesh.updateMatrixWorld(true);
    const P = this.props.P, pts = new Float64Array(this.n * 3), q = V(), m = this.o.margin;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { q.setFromMatrixPosition(this.sk[r * C + c].matrixWorld).toArray(pts, id(r, c) * 3);
      if (r === R - 1) { q.copy(this.x0[id(R, c)]).sub(this.x0[id(r, c)]).applyMatrix4(this.sk[r * C + c].matrixWorld).toArray(pts, id(R, c) * 3); } }
    const out = { body: 0, who: '', by: {}, prop: 0, floor: 0, n: 0, arm: 0, armWho: '', armN: 0 }, a = V(), b = V(), sp = V();
    const boxes = this.boxes.filter(bx => bx.m.visible);
    this.S.forEach(([I, Wt], s) => {
      sp.set(0, 0, 0); I.forEach((i, k) => { sp.x += pts[i * 3] * Wt[k]; sp.y += pts[i * 3 + 1] * Wt[k]; sp.z += pts[i * 3 + 2] * Wt[k]; });
      let hit = false;
      for (const col of this.cols) {
        if (col.bone) { a.copy(col.la).applyMatrix4(col.bone.matrixWorld); b.copy(col.lb).applyMatrix4(col.bone.matrixWorld); }
        else if (col.db) { const d = this.rig.dbWorld(col.db); if (!d.vis) continue; a.copy(d.c).addScaledVector(d.ax, 1); b.copy(d.c).addScaledVector(d.ax, -1); }
        else { if (!P.pole.visible) continue; a.copy(P.pole.position); b.copy(a); a.y += 13; b.y -= 13; }
        const ab = b.clone().sub(a), L2 = ab.lengthSq(), t = L2 > 1e-9 ? Math.min(1, Math.max(0, sp.clone().sub(a).dot(ab) / L2)) : 0;
        let r = this._rad(col, t); if (!col.outer && col.clamp && col.clamp[s] - m < r) r = col.clamp[s] - m;
        const dep = r - sp.distanceTo(a.addScaledVector(ab, t));
        if (col.outer) { if (dep > 0.05) { out.armN++; if (dep > out.arm) { out.arm = dep; out.armWho = col.name; } } continue; }
        if (dep > 0.05) { hit = true; if (col.bone) { if (dep > out.body) { out.body = dep; out.who = col.name; } const w = out.by[col.name] || (out.by[col.name] = [0, 0]); w[0]++; w[1] = Math.max(w[1], +dep.toFixed(2)); } else out.prop = Math.max(out.prop, dep); }
      }
      for (const bx of boxes) { const c = bx.m.position, cs = Math.cos(bx.m.rotation.y), sn = Math.sin(bx.m.rotation.y), rx = sp.x - c.x, rz = sp.z - c.z;
        const dep = Math.min(bx.h[0] - Math.abs(rx * cs - rz * sn), bx.h[1] - Math.abs(sp.y - c.y), bx.h[2] - Math.abs(rx * sn + rz * cs));
        if (dep > 0.05) { hit = true; out.prop = Math.max(out.prop, dep); } }
      if (sp.y < this.o.floor - 0.05) { hit = true; out.floor = Math.max(out.floor, this.o.floor - sp.y); }
      if (hit) out.n++;
    });
    return out;
  }
}
