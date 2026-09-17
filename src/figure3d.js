/* ============================================================
   3Dマネキンの描画（three.js）
   骨格の各ボーンに、局所座標であらかじめ形を作ったメッシュを割り当て、
   1フレームごとにワールド姿勢をそのまま流し込む。
   ============================================================ */
(function (root) {
  'use strict';
  const M = root.MOTION;

  const THEME = {
    light: { body: 0xd8d3c8, body2: 0xc6c0b4, prop: 0xcfd0c8, db: 0xb23a31, shadow: 0.22,
             hemiSky: 0xffffff, hemiGround: 0x9a9384, key: 0xffffff, rim: 0xdfe6ee },
    dark:  { body: 0x9aa3ac, body2: 0x848d97, prop: 0x39424a, db: 0xd3584c, shadow: 0.35,
             hemiSky: 0xb9c6d2, hemiGround: 0x2a3138, key: 0xdfe8f2, rim: 0x7f8b96 }
  };

  /* ---- 体の形（すべてボーン局所座標。+Y は骨の向き、-Y に伸びる手足が多い） ---- */
  function capsuleGeom(THREE, r0, r1, len, dir, seg) {
    /* 円錐台＋両端の球でできた形を回転体で作る */
    const pts = [];
    const n = seg || 10;
    for (let i = 0; i <= n; i++) {                    /* 近位端の半球 */
      const a = Math.PI / 2 * i / n;
      pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0));
    }
    pts.reverse();
    for (let i = 0; i <= n; i++) {                    /* 遠位端の半球 */
      const a = Math.PI / 2 * i / n;
      pts.push(new THREE.Vector2(Math.cos(a) * r1, -len - Math.sin(a) * r1));
    }
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(Math.max(p.x, 0.0006), p.y)), 20);
    if (dir && dir[0] === 1) g.rotateZ(-Math.PI / 2);        /* +X に伸びる骨 */
    else if (dir && dir[1] > 0) g.rotateX(Math.PI);          /* +Y に伸びる骨（脊柱・首） */
    else if (dir && dir[2]) g.rotateX(dir[2] > 0 ? -Math.PI / 2 : Math.PI / 2);  /* ±Z（鎖骨） */
    g.computeVertexNormals();
    return g;
  }
  function ballGeom(THREE, rx, ry, rz, cy, cx) {
    const g = new THREE.SphereGeometry(1, 20, 14);
    g.scale(rx, ry, rz);
    g.translate(cx || 0, cy || 0, 0);
    return g;
  }

  function buildBody(THREE, mat, mat2) {
    const meshes = {};
    const add = (bone, geom, m) => {
      const mesh = new THREE.Mesh(geom, m || mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      meshes[bone] = mesh;
      return mesh;
    };
    const R = M.RIG.bones;
    /* 体幹 */
    /* 骨盤: 腰からお尻にかけて少し広がる形 */
    const hipPts = [[0.002, 0.108], [0.070, 0.106], [0.098, 0.088], [0.110, 0.045], [0.114, 0.000],
                    [0.108, -0.040], [0.086, -0.070], [0.046, -0.086], [0.002, -0.090]];
    const hipG = new THREE.LatheGeometry(hipPts.map((q) => new THREE.Vector2(q[0], q[1])), 22);
    hipG.scale(0.86, 1, 1.12);
    hipG.computeVertexNormals();
    add('pelvis', hipG);
    const ell = (g, depth, width) => { g.scale(depth, 1, width); return g; };
    add('spineL', ell(capsuleGeom(THREE, 0.100, 0.116, 0.17, [0, 1, 0]), 0.82, 1.00));
    add('spineT', ell(capsuleGeom(THREE, 0.115, 0.126, 0.16, [0, 1, 0]), 0.84, 1.16));
    add('spineC', ell(capsuleGeom(THREE, 0.127, 0.094, 0.155, [0, 1, 0]), 0.80, 1.30));
    add('neck', capsuleGeom(THREE, 0.058, 0.054, 0.075, [0, 1, 0]));
    const head = new THREE.Group();
    const skull = new THREE.Mesh(ballGeom(THREE, 0.082, 0.098, 0.088, 0.093, 0.004), mat);
    const face = new THREE.Mesh(ballGeom(THREE, 0.052, 0.062, 0.062, 0.072, 0.052), mat2);
    skull.castShadow = face.castShadow = true;
    head.add(skull); head.add(face);
    meshes.head = head;
    /* 腕（肩の三角筋・上腕・前腕・手） */
    ['R', 'L'].forEach((s) => {
      const sg = s === 'R' ? 1 : -1;
      const ua = new THREE.Group();
      const delt = new THREE.Mesh(ballGeom(THREE, 0.060, 0.064, 0.058, -0.016, -0.004), mat);
      const arm = new THREE.Mesh(capsuleGeom(THREE, 0.049, 0.041, 0.312, [0, -1, 0]), mat);
      delt.castShadow = arm.castShadow = true;
      ua.add(delt); ua.add(arm);
      meshes['upperarm' + s] = ua;
      add('forearm' + s, capsuleGeom(THREE, 0.044, 0.033, 0.265, [0, -1, 0]));
      const handG = new THREE.Group();
      const palm = new THREE.Mesh(capsuleGeom(THREE, 0.040, 0.030, 0.105, [0, -1, 0]), mat);
      palm.geometry.scale(0.62, 1, 1.12);            /* 手は平たく */
      const thumb = new THREE.Mesh(capsuleGeom(THREE, 0.018, 0.015, 0.055, [0, -1, 0]), mat);
      thumb.geometry.rotateZ(-0.5 * sg);             /* 親指は内側へ */
      thumb.geometry.rotateX(0.35 * sg);
      thumb.position.set(0.012, -0.022, sg * 0.030);
      palm.castShadow = thumb.castShadow = true;
      handG.add(palm); handG.add(thumb);
      meshes['hand' + s] = handG;
      /* 脚 */
      add('thigh' + s, capsuleGeom(THREE, 0.090, 0.059, 0.442, [0, -1, 0]));
      const shank = new THREE.Group();
      const calf = new THREE.Mesh(ballGeom(THREE, 0.056, 0.105, 0.052, -0.120, -0.008), mat);
      const shin = new THREE.Mesh(capsuleGeom(THREE, 0.057, 0.037, 0.442, [0, -1, 0]), mat);
      calf.castShadow = shin.castShadow = true;
      shank.add(shin); shank.add(calf);
      meshes['shank' + s] = shank;
      /* 足（足首から前へ。土踏まずのぶん少し持ち上げる） */
      const foot = new THREE.Group();
      const F = M.FOOT;
      const soleG = new THREE.BoxGeometry(0.185, 0.060, 0.086, 3, 1, 1);
      soleG.translate(0.040, -0.045, 0);
      const sp = soleG.attributes.position;           /* つま先側を少し細くして足らしくする */
      for (let i = 0; i < sp.count; i++) {
        const x = sp.getX(i);
        if (x > 0.09) sp.setZ(i, sp.getZ(i) * 0.86);
        if (x < -0.03) sp.setZ(i, sp.getZ(i) * 0.9);
      }
      soleG.computeVertexNormals();
      const sole = new THREE.Mesh(soleG, mat);
      const ankle = new THREE.Mesh(ballGeom(THREE, 0.045, 0.045, 0.045, -0.012, -0.012), mat);
      sole.castShadow = ankle.castShadow = true;
      sole.receiveShadow = true;
      foot.add(sole); foot.add(ankle);
      meshes['foot' + s] = foot;
      const toes = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.042, 0.074), mat);
      toes.geometry.translate(0.028, -0.023, 0);
      toes.castShadow = true;
      meshes['toes' + s] = toes;
      meshes['clav' + s] = null;                      /* 鎖骨は胸の形で表す */
    });
    return meshes;
  }

  function dumbbellGeom(THREE) {
    const g = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.135, 12), null);
    bar.rotation.x = Math.PI / 2;
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.048, 14), null);
    const p2 = p1.clone();
    p1.rotation.x = p2.rotation.x = Math.PI / 2;
    p1.position.z = 0.078; p2.position.z = -0.078;
    g.add(bar); g.add(p1); g.add(p2);
    return g;
  }

  function create(THREE, canvas, opts) {
    const o = opts || {};
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(o.dpr || 2, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.ColorManagement) THREE.ColorManagement.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace || renderer.outputColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    let theme = THEME[o.theme === 'dark' ? 'dark' : 'light'];

    const mat = new THREE.MeshStandardMaterial({ color: theme.body, roughness: 0.62, metalness: 0.02 });
    const mat2 = new THREE.MeshStandardMaterial({ color: theme.body2, roughness: 0.62, metalness: 0.02 });
    const matProp = new THREE.MeshStandardMaterial({ color: theme.prop, roughness: 0.85, metalness: 0.0 });
    const matDb = new THREE.MeshStandardMaterial({ color: theme.db, roughness: 0.45, metalness: 0.25 });

    const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, 1.05);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(theme.key, 1.9);
    key.position.set(1.6, 2.6, 1.9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const cam = key.shadow.camera;
    cam.left = -1.6; cam.right = 1.6; cam.top = 2.4; cam.bottom = -0.2; cam.near = 0.5; cam.far = 7;
    scene.add(key);
    const rim = new THREE.DirectionalLight(theme.rim, 0.5);
    rim.position.set(-1.8, 1.2, -1.4);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: theme.shadow }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const meshes = buildBody(THREE, mat, mat2);
    Object.keys(meshes).forEach((k) => { if (meshes[k]) scene.add(meshes[k]); });

    const propGroup = new THREE.Group();
    scene.add(propGroup);
    const dbGroup = new THREE.Group();
    scene.add(dbGroup);
    const dbPool = [];

    let propSig = null;
    function setProps(props) {
      const sig = JSON.stringify(props || []);
      if (sig === propSig) return;            /* 毎コマ作り直さない */
      propSig = sig;
      while (propGroup.children.length) {
        const c = propGroup.children[0];
        propGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
      }
      (props || []).forEach((p) => {
        const size = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), matProp);
        mesh.position.set((p.max[0] + p.min[0]) / 2, (p.max[1] + p.min[1]) / 2, (p.max[2] + p.min[2]) / 2);
        mesh.castShadow = true; mesh.receiveShadow = true;
        propGroup.add(mesh);
      });
    }

    function applyFrame(frame) {
      Object.keys(meshes).forEach((name) => {
        const mesh = meshes[name];
        if (!mesh) return;
        const b = frame.b[name];
        if (!b) { mesh.visible = false; return; }
        mesh.visible = true;
        mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
        mesh.quaternion.set(b.quat[0], b.quat[1], b.quat[2], b.quat[3]);
      });
      const dbs = frame.dumbbells || [];
      while (dbPool.length < dbs.length) {
        const g = dumbbellGeom(THREE);
        g.traverse((c) => { if (c.isMesh) { c.material = matDb; c.castShadow = true; } });
        dbPool.push(g); dbGroup.add(g);
      }
      dbPool.forEach((g, i) => {
        g.visible = i < dbs.length;
        if (!g.visible) return;
        const d = dbs[i];
        g.position.set(d.pos[0], d.pos[1], d.pos[2]);
        g.quaternion.set(d.quat[0], d.quat[1], d.quat[2], d.quat[3]);
      });
    }

    /* 動作全体が枠に収まるカメラ距離と中心を求める（種目ごとに1回だけ計算） */
    const fitCache = {};
    function fitView(motion, view, aspect) {
      /* 枠合わせは種目の基準アングルで一度だけ計算する（指で回しても再計算しない） */
      const base = motion.view || {};
      const az = (base.az === undefined ? (view.az || 0) : base.az), el = (base.el === undefined ? (view.el || 0) : base.el);
      const keyc = motion.id + '|' + Math.round(az) + '|' + Math.round(el) + '|' + aspect.toFixed(2);
      if (fitCache[keyc]) return fitCache[keyc];
      const a = az * Math.PI / 180, e = el * Math.PI / 180;
      const fwd = [-Math.cos(e) * Math.sin(a), -Math.sin(e), -Math.cos(e) * Math.cos(a)];
      const right = [Math.cos(a), 0, -Math.sin(a)];
      const up = [fwd[1] * right[2] - fwd[2] * right[1], fwd[2] * right[0] - fwd[0] * right[2],
                  fwd[0] * right[1] - fwd[1] * right[0]];
      const T = M.cycleTime(motion);
      const pts = [];
      for (let i = 0; i < 9; i++) {
        const f = M.solveFrame(motion, T * i / 9);
        Object.keys(f.b).forEach((n) => { pts.push(f.b[n].pos); pts.push(f.b[n].tip); });
        (f.dumbbells || []).forEach((d) => pts.push(d.pos));
      }
      let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9, w1 = -1e9;
      const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      pts.forEach((p) => {
        const u = dot(p, right), v = dot(p, up), w = dot(p, fwd);
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (v < v0) v0 = v; if (v > v1) v1 = v;
        if (w > w1) w1 = w;
      });
      const pad = view.pad === undefined ? 0.16 : view.pad;
      const halfU = (u1 - u0) / 2 * (1 + pad) + 0.06, halfV = (v1 - v0) / 2 * (1 + pad) + 0.06;
      const ty = Math.tan(camera.fov * Math.PI / 360);
      const dist = Math.max(halfV / ty, halfU / (ty * aspect)) + 0.55;
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      const cw = w1 - 0;
      const shape = { halfU, halfV };
      const target = [right[0] * cu + up[0] * cv + fwd[0] * cw,
                      right[1] * cu + up[1] * cv + fwd[1] * cw,
                      right[2] * cu + up[2] * cv + fwd[2] * cw];
      return (fitCache[keyc] = { target, dist, halfU, halfV });
    }

    function setCamera(view) {
      const az = (view.az || 40) * Math.PI / 180, el = (view.el || 12) * Math.PI / 180;
      const d = view.dist || 3.4;
      const t = view.target || [0, 0.9, 0];
      camera.position.set(t[0] + Math.cos(el) * Math.sin(az) * d,
                          t[1] + Math.sin(el) * d,
                          t[2] + Math.cos(el) * Math.cos(az) * d);
      camera.lookAt(t[0], t[1], t[2]);
    }

    function setSize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    function setTheme(name) {
      theme = THEME[name === 'dark' ? 'dark' : 'light'];
      wrongNow = null;
      mat.color.setHex(theme.body); mat2.color.setHex(theme.body2);
      matProp.color.setHex(theme.prop); matDb.color.setHex(theme.db);
      hemi.color.setHex(theme.hemiSky); hemi.groundColor.setHex(theme.hemiGround);
      key.color.setHex(theme.key); rim.color.setHex(theme.rim);
      ground.material.opacity = theme.shadow;
    }

    /* 「よくある崩れ」の場面は体の色を警告色に寄せる */
    function phaseWrong(motion, t) {
      let w = false;
      (motion.phases || []).forEach((p) => { if (t >= p.t) w = !!p.wrong; });
      return w;
    }
    let wrongNow = null;
    function setWrong(on) {
      if (wrongNow === on) return;
      wrongNow = on;
      const c = on ? theme.db : theme.body, c2 = on ? theme.db : theme.body2;
      mat.color.setHex(c).lerp(new THREE.Color(theme.body), on ? 0.45 : 0);
      mat2.color.setHex(c2).lerp(new THREE.Color(theme.body2), on ? 0.5 : 0);
    }

    function render(motion, t, view) {
      setWrong(phaseWrong(motion, t));
      const frame = M.solveFrame(motion, t);
      setProps(motion.props);
      applyFrame(frame);
      const v = Object.assign({}, view || motion.view || {});
      if (v.fit !== false) {
        const fitted = fitView(motion, v, camera.aspect);
        v.target = fitted.target; v.dist = fitted.dist;
      }
      setCamera(v);
      renderer.render(scene, camera);
      return frame;
    }

    /* 動きの広がりから、絵の縦横比を決める */
    function frameShape(motion) {
      const f = fitView(motion, motion.view || {}, camera.aspect);
      return { halfU: f.halfU, halfV: f.halfV, ratio: f.halfU / Math.max(0.01, f.halfV) };
    }

    return { renderer, scene, camera, render, setSize, setTheme, setCamera, applyFrame, setProps, frameShape,
             dispose: () => renderer.dispose() };
  }

  root.FIGURE3D = { create, THEME };
})(typeof window !== 'undefined' ? window : globalThis);
