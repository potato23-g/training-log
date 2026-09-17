/* 仕上げのゲート: 全種目に動きがあるか・診断が通るか */
globalThis.window = undefined;
await import('../src/motion.js');
await import('../src/motions.js');
for (const f of ['b', 'c', 'd']) { try { await import('../src/motions_' + f + '.js'); } catch (e) { console.log('読み込み失敗', f, e.message); } }
const M = globalThis.MOTION;
const html = await Bun.file('../training-log/original.html').text().catch(() => Bun.file('original.html').text());
const ids = [...html.matchAll(/\n\s*id:"(\w+)", name:"/g)].map((m) => m[1]);
const extra = [...html.matchAll(/id:"(\w+)", name:"[^"]*", kind/g)].map((m) => m[1]);
const all = [...new Set([...ids, ...extra])];
const missing = all.filter((id) => !M.motions[id] && !M.motions[id.replace(/1$/, '')]);
console.log('種目数', all.length, '／ 動きが定義済み', all.filter((id) => M.motions[id]).length);
console.log('動きが無い種目:', missing.length ? missing.join(', ') : 'なし');
console.log('登録されている動き:', Object.keys(M.motions).join(', '));
