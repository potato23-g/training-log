/* 動作の数値診断: 可動域・接地のずれ・床や道具への貫通・重心・なめらかさ */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd', 'e', 'f']) { try { await import('../src/motions_' + f + '.js'); } catch (e) {} }
const M = globalThis.MOTION, V = M.V;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(M.motions);
const N = 48;

function boxPen(p, box, r) {          /* 箱への食い込み量(m) */
  const in0 = Math.min(p[0] - box.min[0], box.max[0] - p[0]);
  const in1 = Math.min(p[1] - box.min[1], box.max[1] - p[1]);
  const in2 = Math.min(p[2] - box.min[2], box.max[2] - p[2]);
  const d = Math.min(in0, in1, in2);          /* 箱の内側なら正 */
  const pen = d + r;                          /* カプセル表面のめり込み量 */
  return pen > 0.012 ? pen : 0;
}
function segPts(a, b, n) { const o = []; for (let i = 0; i <= n; i++) o.push(V.lerp(a, b, i / n)); return o; }

for (const id of ids) {
  const m = M.motions[id];
  if (!m) { console.log(id, 'なし'); continue; }
  const T = M.cycleTime(m);
  let rom = {}, floor = 0, floorAt = '', drift = 0, driftAt = '', prop = 0, propAt = '', bal = 0, balAt = '';
  const anchors = {};
  let prev = null, maxJump = 0, jumpAt = '';
  for (let i = 0; i < N; i++) {
    const t = T * i / N;
    const f = M.solveFrame(m, t);
    M.romCheck(f.pose).forEach((v) => {
      const k = v.bone + '.' + v.dof;
      const over = v.value < v.rom[0] ? v.rom[0] - v.value : v.value - v.rom[1];
      if (!rom[k] || over > rom[k].over) rom[k] = { over: Math.round(over * 10) / 10, value: v.value, rom: v.rom, t: t.toFixed(2) };
    });
    /* 床と道具 */
    M.capsules(f).forEach((c) => {
      segPts(c.a, c.b, 3).forEach((p) => {
        const below = c.r * 0.35 - (p[1] - 0);   /* カプセル半径の一部まで許容 */
        if (p[1] - c.r < -0.012) { const d = c.r - p[1]; if (d > floor) { floor = d; floorAt = c.bone + '@' + t.toFixed(2); } }
        (m.props || []).forEach((bx) => {
          const pen = boxPen(p, bx, c.r * 0.55);
          if (pen > prop) { prop = pen; propAt = c.bone + '/' + bx.id + '@' + t.toFixed(2); }
        });
      });
    });
    /* 接地点のずれ */
    f.contacts.forEach((c) => {
      if (!anchors[c.name]) anchors[c.name] = c.pos.slice();
      const d = V.dist(anchors[c.name], c.pos);
      if (d > drift) { drift = d; driftAt = c.name + '@' + t.toFixed(2); }
    });
    /* 重心が支持面の内側にあるか（支持点の凸包でなく最小外接矩形で近似） */
    /* 寝た姿勢は背中全体が支持面なので、重心の判定はしない */
    const sup = f.contacts.filter((c) => c.support !== false).map((c) => c.pos);
    if (sup.length) {
      const xs = sup.map((p) => p[0]), zs = sup.map((p) => p[2]);
      const ex = Math.max(Math.min(...xs) - f.com[0], f.com[0] - Math.max(...xs));
      const ez = Math.max(Math.min(...zs) - f.com[2], f.com[2] - Math.max(...zs));
      const e = Math.max(ex, ez);
      if (e > bal) { bal = e; balAt = t.toFixed(2); }
    }
    /* コマ間の飛び */
    if (prev) {
      let mx = 0, at = '';
      Object.keys(f.b).forEach((n) => { const d = V.dist(prev.b[n].pos, f.b[n].pos); if (d > mx) { mx = d; at = n; } });
      if (mx > maxJump) { maxJump = mx; jumpAt = at + '@' + t.toFixed(2); }
    }
    prev = f;
  }
  /* 角速度と周期のつながり */
  let maxW = 0, maxWat = '';
  const dt = T / N;
  let prevAng = null;
  for (let i = 0; i <= N; i++) {
    const f = M.solveFrame(m, T * i / N);
    const ang = {};
    Object.keys(M.RIG.bones).forEach((n) => { if (M.RIG.bones[n].rom) ang[n] = M.boneAngles(f.pose, n); });
    if (prevAng) {
      Object.keys(ang).forEach((n) => {
        ['flex', 'abd', 'rot'].forEach((k) => {
          let d = Math.abs(ang[n][k] - prevAng[n][k]);
          if (d > 180) d = 360 - d;
          const w = d / dt;
          if (w > maxW) { maxW = w; maxWat = n + '.' + k + '@' + (T * i / N).toFixed(2); }
        });
      });
    }
    prevAng = ang;
  }
  const f0 = M.solveFrame(m, 0), fT = M.solveFrame(m, T);
  let loopGap = 0;
  Object.keys(f0.b).forEach((n) => { const d = V.dist(f0.b[n].pos, fT.b[n].pos); if (d > loopGap) loopGap = d; });

  const mm = (x) => (x * 1000).toFixed(0) + 'mm';
  console.log('== ' + id + '  周期' + T + '秒');
  console.log('   可動域超過: ' + (Object.keys(rom).length ? Object.entries(rom).map(([k, v]) => `${k} ${v.value}° (許容${v.rom[0]}..${v.rom[1]}, t=${v.t})`).join(' / ') : 'なし'));
  console.log('   床抜け: ' + mm(floor) + (floorAt ? ' ' + floorAt : '') + ' / 道具貫通: ' + mm(prop) + (propAt ? ' ' + propAt : ''));
  console.log('   接地ずれ: ' + mm(drift) + (driftAt ? ' ' + driftAt : '') + ' / 重心はみ出し: ' + (m.balance ? mm(bal) + (balAt ? ' t=' + balAt : '') : '—(寝姿勢等は判定対象外)'));
  console.log('   最大コマ移動: ' + mm(maxJump) + ' ' + jumpAt + ' / 最大角速度: ' + maxW.toFixed(0) + '°/s ' + maxWat
    + ' / 周期のつなぎ目: ' + mm(loopGap));
}

/* 主要な関節の位置を出す（配置の手直し用） */
if (process.env.LANDMARKS) {
  for (const id of ids) {
    const m = M.motions[id];
    const f = M.solveFrame(m, 0);
    const p3 = (v) => '[' + v.map((x) => x.toFixed(3)).join(' ') + ']';
    console.log('-- ' + id + ' t=0');
    ['pelvis', 'spineC', 'head', 'thighR', 'thighL', 'shankR', 'shankL', 'footR', 'footL', 'upperarmR', 'upperarmL', 'handR', 'handL']
      .forEach((n) => console.log('   ' + n.padEnd(10), p3(f.b[n].pos), 'tip', p3(f.b[n].tip)));
    console.log('   com', p3(f.com), ' 接地', f.contacts.map((c) => c.name + p3(c.pos)).join(' '));
  }
}
