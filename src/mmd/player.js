// 「動きを再生」で出すモデル。骨の仕組みは exrig.js、種目の中身は exlib.js、髪と服は exphys.js・exskirt.js。
// アプリ（src/app/viewbase.js）が、再生を押したときに初めて読み込む。
//   const p = await create({ bg, dark });  p.set(id);  p.frame(dt, az) → 1 回の動きの進み具合（0〜1）
import * as THREE from './vendor/three/three.module.js';
import { MMDLoader } from './vendor/jsm/loaders/MMDLoader.js';
import { MMDPhysics } from './vendor/jsm/animation/MMDPhysics.js';
import { OutlineEffect } from './vendor/jsm/effects/OutlineEffect.js';
import { ExRig } from './exrig.js';
import { EXLIB, phaseAt, makeProps } from './exlib.js';
import { tunePhysics, softenJoints, Calm, TUNE } from './exphys.js';
import { Skirt } from './exskirt.js';

const HERE = new URL('./', import.meta.url);
const YAW = 35, FOV = 35, HAIR_FLOOR = -0.45;
const FRAME = ['頭先', '頭', '首', '下半身', '左手首', '右手首', '左中指１', '右中指１', '左ひじ', '右ひじ', '左ひざ', '右ひざ', '左足首', '右足首', '左つま先', '右つま先'];

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

export const has = id => !!EXLIB[id];

export async function create(opt = {}) {
  const [, mesh] = await Promise.all([loadAmmo(), loadModel()]);
  let W = 600, H = 800;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  const canvas = renderer.domElement;
  const effect = new OutlineEffect(renderer);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 10, 8); scene.add(key);
  const grid = new THREE.GridHelper(60, 30); grid.material.vertexColors = false; scene.add(grid);
  // 床は向こうが透けない板にする（床より下へ垂れた布を見せない）
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial());
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.material.userData.outlineParameters = { visible: false }; scene.add(ground);
  const setTheme = t => {
    const bg = new THREE.Color(t.bg || (t.dark ? '#1b1d22' : '#e6e6df'));
    scene.background.copy(bg); ground.material.color.copy(bg);
    grid.material.color.copy(bg).lerp(new THREE.Color(t.dark ? 0xffffff : 0x000000), t.dark ? 0.14 : 0.16);
  };
  setTheme(opt);

  scene.add(mesh);
  const fm = mesh.material[0];
  if (fm) { fm.polygonOffset = true; fm.polygonOffsetFactor = 1; fm.polygonOffsetUnits = 1; }
  const rig = new ExRig(mesh);
  const props = makeProps(scene, rig, grid);
  const blinkIdx = 'まばたき' in mesh.morphTargetDictionary ? mesh.morphTargetDictionary['まばたき'] : -1;
  let cur = EXLIB[Object.keys(EXLIB)[0]], T = 0;
  const applyPose = (u, k) => { const spec = cur.pose(u, k, rig.m); rig.pose(spec); props.update(spec, rig); };
  props.show(cur.props || {});

  // 物理は初めの姿勢のまま作る（剛体の置き場所が、骨が回っていない前提で決まるため）
  const raw = tunePhysics(mesh.geometry.userData.MMD, mesh.skeleton.bones, rig.rw);
  const physics = new MMDPhysics(mesh, raw.rigidBodies, raw.constraints, { unitStep: 1 / 120, maxStepNum: 4 });
  softenJoints(physics);
  const calm = new Calm(mesh);
  const floor = addFloor(physics);
  physics.warmup(60);
  applyPose(0, 0);
  const skirtM = new Skirt(rig, mesh.geometry.userData.MMD, props, { passive: !TUNE.ownSkirt });
  const skirt = TUNE.ownSkirt ? skirtM : null;
  if (skirt) rig.coatGap = (p, r) => skirtM.gap(p, r);

  // 体と道具が動く範囲を測る。指で回しても全体が入るように、横は回したときのいちばん広い幅で見る
  function measure() {
    const box = new THREE.Box3();
    for (const k of (cur.alt ? [0, 1] : [0])) for (const u of [0, 0.5, 1]) {
      applyPose(u, k);
      for (const n of FRAME) if (rig.b[n]) box.expandByPoint(rig.wp(n));
      for (const s of ['L', 'R', 'F']) { const d = rig.dbWorld(s); if (d.vis) { box.expandByPoint(d.c.clone().addScaledVector(d.ax, 1.2)); box.expandByPoint(d.c.clone().addScaledVector(d.ax, -1.2)); } }
    }
    box.expandByScalar(1.3);
    box.min.y = Math.min(box.min.y, 0);
    const s = box.getSize(new THREE.Vector3());
    return { c: box.getCenter(new THREE.Vector3()), hw: Math.hypot(s.x, s.z) / 2, hh: s.y / 2 };
  }
  function setCam(az) {
    const c = Object.assign({ alt: 8, yaw0: 0 }, cur.cam), f = cur._fit;
    const yaw = (c.yaw0 + YAW + az) * Math.PI / 180, alt = c.alt * Math.PI / 180;
    const tf = Math.tan(FOV / 2 * Math.PI / 180);
    const hh = f.hh * Math.cos(alt) + f.hw * Math.sin(alt);
    const dist = Math.max(hh / tf, f.hw / (tf * W / H)) * 1.02 + f.hw * 0.5;
    camera.position.set(f.c.x + Math.sin(yaw) * Math.cos(alt) * dist, f.c.y + Math.sin(alt) * dist, f.c.z + Math.cos(yaw) * Math.cos(alt) * dist);
    camera.lookAt(f.c);
  }
  function set(id) {
    if (!EXLIB[id]) return false;
    cur = EXLIB[id];
    props.show(cur.props || {});
    T = 0;
    floor(cur.floor !== false, cur.bedY || 0);
    if (!cur._fit) cur._fit = measure();
    // 寝る種目は横長、立つ種目は縦長の枠にする
    const wide = cur._fit.hw / cur._fit.hh > 1.15, w = wide ? 800 : 600, h = wide ? 600 : 800;
    if (w !== W) { W = w; H = h; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
    mesh.skeleton.pose();      // 前の種目の布の形を持ちこまない
    applyPose(0, 0);
    physics.reset(); for (let i = 0; i < 30; i++) physics.update(1 / 60);
    if (skirt) skirt.reseed();
    calm.reset();
    return true;
  }
  function step(dt) {
    dt = Math.min(0.05, Math.max(0, dt));
    T += dt;
    const ph = phaseAt(cur, T);
    applyPose(ph.u, ph.k);
    physics.update(dt);
    if (skirt) skirt.update(dt);
    calm.update(dt);
    // まばたきだけ残す（目の骨は動かさない）
    if (blinkIdx >= 0) { const p = (T % 4.3) / 0.16; mesh.morphTargetInfluences[blinkIdx] = p < 1 ? Math.sin(p * Math.PI) : 0; }
    if (cur.cycle) return (T / cur.cycle) % 1;
    const tp = cur.tempo || [1.6, 0.4, 1.3, 0.5], per = tp[0] + tp[1] + tp[2] + tp[3];
    return (T % per) / per;
  }
  function frame(dt, az) {
    const u = step(dt);
    setCam(az || 0);
    effect.render(scene, camera);
    return u;
  }
  return { canvas, has, set, step, frame, setTheme, rig, get skirt() { return skirtM; }, dispose() { try { renderer.dispose(); } catch (e) {} } };
}
