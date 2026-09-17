/* ============================================================
   記録1セットごとのID
   端末間で記録を突き合わせる（同じセットを二重にしない・消したセットを復活させない）ために使う。
   - 新しく記録したセット: 乱数ID + 記録時刻 at（ミリ秒）
   - IDの無い古い記録: 日付・種目・順番・中身から決まるID（どの端末で振っても同じ値になる）
   ============================================================ */
function newSetId(){
  let a, b;
  try{
    const r = crypto.getRandomValues(new Uint32Array(2));
    a = r[0]; b = r[1];
  }catch(e){
    a = Math.floor(Math.random() * 4294967296); b = Math.floor(Math.random() * 4294967296);
  }
  return "s" + Date.now().toString(36) + a.toString(36) + b.toString(36);
}
function fnv1a(str){
  let h = 0x811c9dc5;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
function legacySetId(date, ex, i, set){
  return "L" + fnv1a([date, ex, i, set.w === undefined ? "" : set.w, set.r, set.rpe || 0].join("|"));
}
/* IDや記録時刻の無いセットに値を振る（回数などの中身は変えない）。何か振ったら true */
function ensureIds(st){
  let changed = false;
  Object.keys((st && st.sessions) || {}).forEach(date=>{
    const s = st.sessions[date];
    if(!s) return;
    (s.entries || []).forEach(e=>{
      (e.sets || []).forEach((set, i)=>{
        if(!set.id){ set.id = legacySetId(date, e.ex, i, set); changed = true; }
        if(set.at === undefined){ set.at = i; changed = true; }
      });
    });
  });
  return changed;
}
