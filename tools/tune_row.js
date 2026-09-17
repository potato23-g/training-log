/* 支え手の向きと肘の向きを総当たりで探す（可動域の超過が最小になる組み合わせ） */
globalThis.window = undefined;
await import('../src/motion.js'); await import('../src/motions.js');
const M = globalThis.MOTION;
const m = M.motions.row, T = M.cycleTime(m);
function score(pitch, yaw, poleZ, poleY, handX) {
  m.hands.L.pitch = pitch; m.hands.L.yaw = yaw; m.hands.L.pole = [0.15, poleY, poleZ];
  m.hands.L.at = [handX, 0.45, -0.23];
  m._tracks = null;
  let s = 0, worst = '';
  for (let i = 0; i < 12; i++) {
    const f = M.solveFrame(m, T * i / 12);
    M.romCheck(f.pose).forEach((v) => {
      const over = v.value < v.rom[0] ? v.rom[0] - v.value : v.value - v.rom[1];
      s += over * over;
      if (over > 12) worst = v.bone + '.' + v.dof;
    });
  }
  return { s, worst };
}
let best = null;
for (const pitch of [-90, -80, -70, -60]) {
  for (const yaw of [150, 165, 180, 195, 210]) {
    for (const poleZ of [-1, -0.4, 0.3]) {
      for (const poleY of [-0.3, -1]) {
        for (const handX of [0.26, 0.31, 0.36]) {
          const r = score(pitch, yaw, poleZ, poleY, handX);
          if (!best || r.s < best.s) best = { s: r.s, worst: r.worst, pitch, yaw, poleZ, poleY, handX };
        }
      }
    }
  }
}
console.log('best', JSON.stringify(best));
