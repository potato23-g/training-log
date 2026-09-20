/* 手の向きの検査: 各種目の要所で「手のひらがどちらを向いているか」を測り、出典・解説文の握りと突き合わせる。
   使い方: cd tools && bun grip_check.js [種目id...]
   手のモデル: 手のひらは局所X方向に平たく、親指は右手なら局所+Z側。
   よって手のひらの法線 = 手の姿勢を局所[1,0,0]に掛けたもの（+側が手のひらの面）。 */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd', 'e']) { try { await import('../src/motions_' + f + '.js'); } catch (e) {} }
const M = globalThis.MOTION, V = M.V, Q = M.Q;
const DEG = 180 / Math.PI;

const dirName = (v) => {
  const names = [['前', [1, 0, 0]], ['後ろ', [-1, 0, 0]], ['上', [0, 1, 0]], ['下', [0, -1, 0]], ['右', [0, 0, 1]], ['左', [0, 0, -1]]];
  return names.map(([n, d]) => [n, V.dot(v, d)]).sort((a, b) => b[1] - a[1])[0][0];
};
const angTo = (v, to) => Math.acos(Math.max(-1, Math.min(1, V.dot(V.norm(v), V.norm(to))))) * DEG;

/* 期待する手のひらの向き（世界座標）。side: 右手の内側= -Z、外側= +Z */
const WANT = {
  /* ACE: "closed, pronated grip (palms facing forward)" 構えも頭上も手のひらは前 */
  ohp: [{ t: 0, hand: 'handR', to: [1, 0, 0], label: '構え: 手のひらは前（ACE pronated grip）' },
        { t: 1.3, hand: 'handR', to: [1, 0, 0], label: '頭上: 手のひらは前' }],
  /* ACE: 開始は "closed, neutral grip"（手のひらは体側）、肩の高さでは手のひらは下向き */
  lateral: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '下: 手のひらは体の側（ニュートラル）' },
            { t: 1.5, hand: 'handR', to: [0, -1, 0], label: '肩の高さ: 手のひらは下' }],
  /* ACE(座位版): "supinated grip (palms facing forward)" */
  curl: [{ t: 0, hand: 'handR', to: [1, 0, 0], label: '下: 手のひらは前（supinated）' }],
  /* ACE: "palms facing upwards" でダンベルの上側を包む */
  triext: [{ t: 0, hand: 'handR', to: [0, 1, 0], label: '手のひらは上（ACE palms facing upwards）' }],
  /* 仰向けのプロネイテッド: 手のひらは足の方（頭は+X側なので -X） */
  floorpress: [{ t: 1.3, hand: 'handR', to: [-1, 0, 0], label: '押し上げ: 手のひらは足の方（pronated）' }],
  /* 解説文「反対の手でダンベルを持ち、腕を真下に垂らす」= ニュートラル（手のひらは体の側） */
  row: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '下: 手のひらは体の側' }],
  /* NASM: "a neutral grip"（手のひらは太もも側） */
  rdl: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '立位: 手のひらは太ももの側' }],
  rdl1: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '立位: 手のひらは太ももの側' }],
  /* ACE: ダンベルは腰の真横、ニュートラル */
  farmer: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '手のひらは太ももの側' }],
  calf: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '手のひらは太ももの側' }],
  /* ACE: ダンベルを縦にして上のプレートを下から支える = 手のひらは上 */
  goblet: [{ t: 0, hand: 'handR', to: [0, 1, 0], label: '胸の前: 手のひらは上（下から支える）' }],
  /* 床に手をつく = 手のひらは下 */
  pushup: [{ t: 0, hand: 'handR', to: [0, -1, 0], label: '床につく手: 手のひらは下' }],
  plank: [{ t: 0, hand: 'handR', to: [0, -1, 0], label: '床につく手: 手のひらは下' }],
  sideplank: [{ t: 0, hand: 'handR', to: [0, -1, 0], label: '床につく手: 手のひらは下' }],
  /* 腰に乗せたダンベルの端を両側から押さえる。手の向きはIKの都合で「内側」まで回しきれず、
     手のひらは頭側を向く。手首は無理のない角度（約18度）なので、この骨格ではここを許容範囲とする */
  hipthrust: [{ t: 1.3, hand: 'handR', to: [-1, 0, 0], label: '腰の上: ダンベルの端を横から押さえる' }],
  /* 両手に1つずつ、体の横 */
  split: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '手のひらは太ももの側' }],
  /* NASM: 腕は天井へ。手のひらは向かい合わせ（内側） */
  deadbug: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '天井へ伸ばす腕: 手のひらは内側' }],
  /* ---- 追加種目 ---- */
  /* ゴブレットと同じ持ち方（縦のダンベルを下から支える） */
  sumo: [{ t: 0, hand: 'handR', to: [0, 1, 0], label: '胸の前: 手のひらは上（下から支える）' }],
  /* 両手に1つずつ、体の横（ニュートラル） */
  splitfloor: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '手のひらは太ももの側' }],
  /* 床に手をつく */
  bridge: [{ t: 0, hand: 'handR', to: [0, -1, 0], label: '体の横につく手: 手のひらは下' }],
  pushupknee: [{ t: 0, hand: 'handR', to: [0, -1, 0], label: '床につく手: 手のひらは下' }],
  /* 解説文「手のひらは向かい合わせ」。開いた位置でも前腕の向きは変えない */
  fly: [{ t: 2.6, hand: 'handR', to: [0, 0, -1], label: '胸の上: 手のひらは向かい合わせ' },
        { t: 0, hand: 'handR', to: [0, 1, 0], label: '開いた位置: 手のひらは上（向かい合わせのまま開く）' }],
  /* ニュートラルグリップの三頭筋伸展。手のひらは向かい合わせ */
  skull: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '手のひらは向かい合わせ' }],
  /* 解説文「手のひらを下に向ける」。下では太もも側、肩の高さでは下向き */
  front: [{ t: 0, hand: 'handR', to: [-1, 0, 0], label: '下: 手のひらは体の方（pronated）' },
          { t: 1.5, hand: 'handR', to: [0, -1, 0], label: '肩の高さ: 手のひらは下' }],
  /* 解説文「手のひらを向かい合わせにする」。下でも上でも変えない */
  hammer: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '下: 手のひらは向かい合わせ' },
           { t: 1.6, hand: 'handR', to: [0, 0, -1], label: '上: 手のひらは向かい合わせ' }],
  /* 体の横に垂らす。ニュートラル */
  shrug: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '手のひらは太ももの側' }],
  /* 前傾して垂らす。ニュートラル（手のひらは向かい合わせ） */
  row2: [{ t: 0, hand: 'handR', to: [0, 0, -1], label: '下: 手のひらは向かい合わせ' }]
};

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(WANT);
let ng = 0;
for (const id of ids) {
  const m = M.motions[id], want = WANT[id];
  if (!m || !want) { console.log('== ' + id + ' : 検査なし'); continue; }
  console.log('== ' + id);
  want.forEach((w) => {
    const fr = M.solveFrame(m, w.t);
    const palm = V.norm(Q.rot(fr.b[w.hand].quat, [1, 0, 0]));
    const err = angTo(palm, w.to);
    const ok = err < 50;
    if (!ok) ng++;
    console.log('   ' + (ok ? 'OK  ' : 'NG  ') + w.label + ' … 実際は「' + dirName(palm) + '」向き（ずれ ' + err.toFixed(0) + '°）');
  });
}
console.log('\n手の向きが合わない箇所: ' + ng + ' 件');
