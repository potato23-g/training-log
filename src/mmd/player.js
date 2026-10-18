// キャラクターの図。骨の仕組みは exrig.js、種目と組み方の姿勢は exlib.js、髪と服は exphys.js・exskirt.js。
// いつ・どこまで動くか（進み具合 u、左右の番 k、悪い例の度合い w）はアプリが線の図の時間割から決めて渡す。ここでは時間を持たない。
//   const p = await create();  p.set(id, { dbn }, a);  p.frame(dt, az, a);  p.still(id, { dbn }, a)
import * as THREE from './vendor/three/three.module.js';
import { MMDLoader } from './vendor/jsm/loaders/MMDLoader.js';
import { MMDPhysics } from './vendor/jsm/animation/MMDPhysics.js';
import { OutlineEffect } from './vendor/jsm/effects/OutlineEffect.js';
import { ExRig } from './exrig.js';
import { EXLIB, resolve, poseEx, makeProps } from './exlib.js';
import { tunePhysics, softenJoints, Calm, TUNE } from './exphys.js';
import { Skirt } from './exskirt.js';

const HERE = new URL('./', import.meta.url);
const YAW = 35, FOV = 35, HAIR_FLOOR = -0.45;
// 回したときにはみ出さないよう引く距離の上限（初めの向きでぴったり収めた距離の何倍まで）
const TURN_MAX = 1.12;
// 枠取りに使う点（骨の名前 → まわりに取る余白）。頭は帽子と髪のぶん広く取る
const FRAME = { '頭先': 1.5, '頭': 2.1, '首': 1.6, '上半身2': 1.9, '下半身': 1.9, '左手首': 0.9, '右手首': 0.9, '左中指１': 0.8, '右中指１': 0.8, '左ひじ': 1.2, '右ひじ': 1.2,
                '左ひざ': 0.9, '右ひざ': 0.9, '左足首': 1.0, '右足首': 1.0, '左つま先': 0.9, '右つま先': 0.9 };
// 枠の形。寝る種目は横長、立つ種目は縦長
// 床に寝る・伏せる種目は、頭や足の側からだと体の線が見えないので、真横に近い向きから見る（向きに足す角度）
const SIDE = { pushup: 35, pushupknee: 35, plank: 35, backext: 35, bridge: 35, slidecurl: 35, crunch: 35, floorpress: 35, skull: 35, deadbug: 35 };
const SHAPES = { t: [720, 960], s: [840, 840], w: [960, 660], x: [960, 500] };

let ammoReady = null;
function loadAmmo() {
  if (ammoReady) return ammoReady;
  return (ammoReady = new Promise((ok, ng) => {
    if (typeof WebAssembly === 'undefined') { ng(new Error('wasm')); return; }
    const s = document.createElement('script');
    s.src = new URL('vendor/jsm/libs/ammo.wasm.js', HERE).href;
    s.onload = () => { try { window.Ammo().then(ok, ng); } catch (e) { ng(e); } };
    s.onerror = () => ng(new Error('ammo'));
    document.head.appendChild(s);
  }).catch(e => { ammoReady = null; throw e; }));
}
function loadModel() {
  return new Promise((ok, ng) => {
    // 画像まで読み終えてから渡す（途中の白い体を見せない）
    const man = new THREE.LoadingManager();
    let mesh = null, failed = false;
    man.onLoad = () => { if (mesh && !failed) ok(mesh); };
    man.onError = () => { failed = true; ng(new Error('model')); };
    new MMDLoader(man).load(new URL('model/SakurabaEma_ByPOWER.pmx', HERE).href, m => { mesh = m; }, undefined, e => { failed = true; ng(e); });
  });
}

// 物理（髪・服）に床を足す。寝る種目は、体と床のあいだに服がはさまって暴れるので、服は床と当てず、髪だけを少し低い床に乗せる。
function addFloor(ph) {
  const Ammo = window.Ammo, world = ph.world, used = new Set(ph.bodies.map(b => b.params.groupIndex));
  let gi = 15; for (let i = 15; i >= 0; i--) if (!used.has(i)) { gi = i; break; }
  for (const b of ph.bodies) {
    if (b.params.type === 0) continue;
    world.removeRigidBody(b.body);
    world.addRigidBody(b.body, 1 << b.params.groupIndex, b.params.groupTarget | (1 << gi));
  }
  const make = top => {
    const shape = new Ammo.btBoxShape(new Ammo.btVector3(200, 2, 200));
    const tr = new Ammo.btTransform(); tr.setIdentity(); tr.setOrigin(new Ammo.btVector3(0, top - 2, 0));
    const body = new Ammo.btRigidBody(new Ammo.btRigidBodyConstructionInfo(0, new Ammo.btDefaultMotionState(tr), shape, new Ammo.btVector3(0, 0, 0)));
    body.setFriction(0.6);
    return body;
  };
  const full = make(-0.05), hair = make(HAIR_FLOOR), tr = new Ammo.btTransform();
  world.addRigidBody(full, 1 << gi, 0xffff);
  let on = true;
  return (v, y = 0) => {
    world.removeRigidBody(on ? full : hair); on = v;
    if (v) { world.addRigidBody(full, 1 << gi, 0xffff); return; }
    tr.setIdentity(); tr.setOrigin(new Ammo.btVector3(0, y + HAIR_FLOOR - 2, 0)); hair.setWorldTransform(tr); hair.getMotionState().setWorldTransform(tr);
    world.addRigidBody(hair, 1 << gi, 1 << 5);
  };
}

export const has = id => !!resolve(id);

export async function create() {
  const [, mesh] = await Promise.all([loadAmmo(), loadModel()]);
  let W = SHAPES.t[0], H = SHAPES.t[1];
  // 背景は透かす（明るい表示でも暗い表示でも、置いた場所の色がそのまま出る）
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  const effect = new OutlineEffect(renderer);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 400);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 10, 8); scene.add(key);
  const grid = new THREE.GridHelper(60, 30, 0x7d8590, 0x7d8590);
  grid.material.transparent = true; grid.material.opacity = 0.3; grid.material.depthWrite = false; scene.add(grid);
  // 床は、色を塗らずに奥行きだけを書く板にする（床より下へ垂れた布を隠す）
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ colorWrite: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.renderOrder = -1; ground.material.userData.outlineParameters = { visible: false }; scene.add(ground);

  scene.add(mesh);
  const fm = mesh.material[0];
  if (fm) { fm.polygonOffset = true; fm.polygonOffsetFactor = 1; fm.polygonOffsetUnits = 1; }
  const rig = new ExRig(mesh);
  const props = makeProps(scene, rig, grid);
  const blinkIdx = 'まばたき' in mesh.morphTargetDictionary ? mesh.morphTargetDictionary['まばたき'] : -1;
  let cur = EXLIB[Object.keys(EXLIB)[0]], opt = {}, T = 0, side = 0;
  const applyPose = a => poseEx(rig, props, cur, a.u || 0, a.k || 0, { w: a.w || 0, dbn: opt.dbn });
  props.show(cur.props || {});

  // 物理は初めの姿勢のまま作る（剛体の置き場所が、骨が回っていない前提で決まるため）
  const raw = tunePhysics(mesh.geometry.userData.MMD, mesh.skeleton.bones, rig.rw);
  const physics = new MMDPhysics(mesh, raw.rigidBodies, raw.constraints, { unitStep: 1 / 120, maxStepNum: 4 });
  softenJoints(physics);
  const calm = new Calm(mesh);
  const floor = addFloor(physics);
  physics.warmup(60);
  applyPose({});
  const skirtM = new Skirt(rig, mesh.geometry.userData.MMD, props, { passive: !TUNE.ownSkirt });
  const skirt = TUNE.ownSkirt ? skirtM : null;
  if (skirt) rig.coatGap = (p, r) => skirtM.gap(p, r);

  // ---- 枠取り。1 回の動きのあいだに体と道具が通る点を覚えておき、今の向きから見てちょうど収まる所にカメラを置く
  function collect() {
    const pts = [], add = (p, r) => pts.push([p.x, p.y, p.z, r]);
    const us = cur.cycle ? [0, 0.25, 0.5, 0.75] : [0, 0.5, 1];
    for (const w of ((cur.sag || cur.cycle) ? [0, 1] : [0])) for (const k of (cur.alt ? [0, 1] : [0])) for (const u of us) {
      applyPose({ u, k, w });
      for (const n in FRAME) if (rig.b[n]) add(rig.wp(n), FRAME[n]);
      for (const s of ['L', 'R', 'F']) { const d = rig.dbWorld(s); if (d.vis) { add(d.c.clone().addScaledVector(d.ax, 1.1), 0.75); add(d.c.clone().addScaledVector(d.ax, -1.1), 0.75); } }
      const h = rig.wp('下半身'); add(new THREE.Vector3(h.x, 0.4, h.z), 0.4);      // 床（台に乗る種目でも、床までを枠に入れる）
    }
    // 懸垂バーは両端の柱まで入れる（回したときに柱が切れないように）
    const bar = cur.props && cur.props.bar;
    if (bar) for (const x of [-5.6, 5.6]) for (const y of [0.4, bar[1] + 0.9]) add(new THREE.Vector3(bar[0] + x, y, bar[2]), 0.5);
    return pts;
  }
  const cR = new THREE.Vector3(), cU = new THREE.Vector3(), cD = new THREE.Vector3(), cT = new THREE.Vector3();
  const keyAt = key.position.clone();
  function axes(yawDeg) {
    const c = Object.assign({ alt: 8, yaw0: 0 }, cur.cam);
    const yaw = (c.yaw0 + YAW + side + yawDeg) * Math.PI / 180, alt = c.alt * Math.PI / 180;
    cD.set(Math.sin(yaw) * Math.cos(alt), Math.sin(alt), Math.cos(yaw) * Math.cos(alt));
    cR.set(0, 1, 0).cross(cD).normalize(); cU.copy(cD).cross(cR);
  }
  // 中心 o から見て、全部の点が枠に収まる距離。ずらし (sx, sy) は、枠の中で中心をどこに置くか
  function need(o, sx, sy) {
    const tf = Math.tan(FOV / 2 * Math.PI / 180), asp = W / H;
    let dist = 0;
    for (const p of cur._pts) {
      const dx = p[0] - o.x, dy = p[1] - o.y, dz = p[2] - o.z;
      const x = dx * cR.x + dy * cR.y + dz * cR.z - sx, y = dx * cU.x + dy * cU.y + dz * cU.z - sy, z = dx * cD.x + dy * cD.y + dz * cD.z;
      dist = Math.max(dist, (Math.abs(x) + p[3]) / (tf * asp) + z, (Math.abs(y) + p[3]) / tf + z);
    }
    return dist;
  }
  // 回す軸と距離を、種目ごとに 1 回だけ決める。回すのは人と台（カメラと光を、軸のまわりに同じだけ回すのと同じ見え方）。
  // 距離はどの向きでも変えない（回しても大きさが変わらない）。初めの向きでぴったり収め、ほかの向きではみ出す所だけ少し引く
  function fit() {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of cur._pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1] - p[3]); y1 = Math.max(y1, p[1] + p[3]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
    const o = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    axes(0);
    let d0 = need(o, 0, 0), dm = d0;
    for (let a = 15; a < 360; a += 15) { axes(a); dm = Math.max(dm, need(o, 0, 0)); }
    cur._cam = { o, dist: Math.min(dm, d0 * TURN_MAX) * 1.03 };
  }
  function view0() {
    axes(0);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of cur._pts) {
      const x = p[0] * cR.x + p[1] * cR.y + p[2] * cR.z, y = p[0] * cU.x + p[1] * cU.y + p[2] * cU.z;
      x0 = Math.min(x0, x - p[3]); x1 = Math.max(x1, x + p[3]); y0 = Math.min(y0, y - p[3]); y1 = Math.max(y1, y + p[3]);
    }
    return { hw: (x1 - x0) / 2, hh: (y1 - y0) / 2 };
  }
  function setCam(az) {
    if (!cur._cam) fit();
    axes(az);
    const { o, dist } = cur._cam;
    camera.position.copy(o).addScaledVector(cD, dist);
    camera.up.set(0, 1, 0); camera.lookAt(o);
    // 光も同じだけ回す（人と台を回したときと同じ当たり方）
    const r = (az) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    key.position.set(keyAt.x * c + keyAt.z * s, keyAt.y, -keyAt.x * s + keyAt.z * c);
  }
  const settle = (a, n, sn) => { physics.reset(); for (let i = 0; i < n; i++) { applyPose(a); physics.update(1 / 60); } if (skirt) skirt.reseed(36, sn); calm.reset(); };
  let shown = '';
  function set(id, o, a) {
    const ex = resolve(id);
    if (!ex) return false;
    o = o || {}; a = a || {};
    const key = id + '|' + (o.dbn || '');
    if (key === shown) return true;
    shown = key; cur = ex; opt = { dbn: o.dbn || 0 }; side = SIDE[EXLIB[id] ? id : ex.base] || 0;
    props.show(cur.props || {});
    floor(cur.floor !== false, cur.bedY || 0);
    if (!cur._pts) cur._pts = collect();
    mesh.skeleton.pose();      // 前の種目の布の形を持ちこまない
    if (!cur._shape) {
      const b = view0(), r = b.hw / b.hh;
      cur._shape = r > 1.9 ? 'x' : r > 1.2 ? 'w' : r > 0.8 ? 's' : 't';
      mesh.skeleton.pose();
    }
    const sz = SHAPES[cur._shape];
    if (sz[0] !== W || sz[1] !== H) { W = sz[0]; H = sz[1]; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
    applyPose(a);
    settle(a, 30);
    return true;
  }
  // 1 コマ進めて描く。dt は前のコマからの秒（髪と服を進めるのに使う）
  function frame(dt, az, a) {
    // 遅い端末でも動きの速さは変えない。髪と服は、1 回に進める時間を抑える
    dt = Math.min(1 / 15, Math.max(0, dt));
    const ds = Math.min(dt, 0.05);
    T += dt;
    applyPose(a || {});
    physics.update(dt);
    if (skirt) skirt.update(ds);
    calm.update(ds);
    // まばたきだけ残す（目の骨は動かさない）
    if (blinkIdx >= 0) { const p = (T % 4.3) / 0.16; mesh.morphTargetInfluences[blinkIdx] = p < 1 ? Math.sin(p * Math.PI) : 0; }
    setCam(az || 0);
    effect.render(scene, camera);
  }
  // 止まった姿を描く（髪と服が落ち着くまで待ってから）。描いた canvas を返す
  function still(id, o, a) {
    shown = '';
    if (!set(id, o, a)) return null;
    shown = '';
    settle(a || {}, 80, 120);   // 止め絵はコートを長めに落とす（短いと、寝た種目で上になった側のすそが立ったまま残る）
    if (blinkIdx >= 0) mesh.morphTargetInfluences[blinkIdx] = 0;
    setCam(0);
    effect.render(scene, camera);
    return canvas;
  }
  return { canvas, has, set, frame, still, shape: () => cur._shape, size: () => [W, H], rig, get skirt() { return skirtM; },
           dispose() { try { renderer.dispose(); } catch (e) {} } };
}
export { SHAPES };
