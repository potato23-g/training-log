globalThis.window = undefined;
await import('../src/motion.js'); await import('../src/motions.js');
const M = globalThis.MOTION, V = M.V;
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, V.dot(V.norm(a), V.norm(b))))) * 180 / Math.PI;
for (const pole of [[0.1,-0.35,-1], [-1,-0.3,-0.2], [-1,-0.3,0.3], [-0.5,-1,-0.3]]) {
  M.motions.row.hands.L.pole = pole;
  const f = M.solveFrame(M.motions.row, 0);
  const sh = f.b.upperarmL.pos, el = f.b.forearmL.pos, wr = f.b.handL.pos, tip = f.b.handL.tip;
  const a = M.boneAngles(f.pose, 'handL'), ua = M.boneAngles(f.pose, 'upperarmL'), fa = M.boneAngles(f.pose, 'forearmL');
  console.log('pole', JSON.stringify(pole),
    '肘角', (180 - ang(V.sub(el, sh), V.sub(wr, el))).toFixed(0),
    '手首角(幾何)', (180 - ang(V.sub(wr, el), V.sub(tip, wr))).toFixed(0),
    '| 上腕 flex', ua.flex.toFixed(0), 'abd', ua.abd.toFixed(0), 'rot', ua.rot.toFixed(0),
    '| 前腕 flex', fa.flex.toFixed(0), 'rot', fa.rot.toFixed(0),
    '| 手 flex', a.flex.toFixed(0), 'abd', a.abd.toFixed(0), 'rot', a.rot.toFixed(0),
    '| 肘位置', el.map(v=>v.toFixed(2)).join(','));
}
