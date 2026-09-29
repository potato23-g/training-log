/* ---- 次のセットの入力欄に入れる数字 ---- */
function clampR(kind, r){
  r = Math.round(r);
  return kind==="t" ? Math.max(10, Math.min(180, r)) : Math.max(4, Math.min(40, r));
}
/* 次のセットの提案（入力欄の初めの値）。
   その日の1セット目は伸ばし方（progress.js）の目標から。2セット目からは前のセットの重さ・回数をそのまま出す
   （きつさの入力はやめた。重さ・回数は本人が調整する: 2026-09-29）。
   target はこの日の目標（記録にも残し、次の回の判断に使う）。重さは持っているダンベルで作れる使い方の中からだけ */
function suggestNext(item, e){
  const id = item.ex, kind = EXMAP[id].kind;
  const sets = e ? e.sets : [];
  const p = progressFor(item);
  const weighted = !!p.opt;                         /* 重さを扱う（時間の種目でもダンベルを持つものを含む） */
  if(!sets.length){
    return {r:p.target, target:p.target, w: weighted ? p.opt.total : undefined, opt:p.opt,
            change:p.change, why:p.why, src:p.src, prog:p};
  }
  const prev = sets[sets.length-1];
  const target = typeof prev.target === "number" ? prev.target : p.target;
  const src = "目標は" + target + unitOf(kind);
  if(!weighted || prev.w === undefined) return {r:clampR(kind, prev.r), target, w: weighted ? p.opt.total : undefined, opt:p.opt, why:"", src, prog:p};
  const cur = itemOptions(item).find(o => Math.abs(o.total - prev.w) < 0.01) || null;
  return {r:clampR(kind, prev.r), target, w:prev.w, opt:cur || p.opt, why:"", src, prog:p};
}
/* 「10 kg × 13」のような短い書き方（腕の種目は片手あたり） */
function sugText(item, sug){
  const ex = EXMAP[item.ex], side = item.side ? "（左右それぞれ）" : "";
  const w = sug.w !== undefined && ex.kind === "w" ? (perArm(item.ex) ? "片手 " : "") + wShown(item, sug.w) + " kg × " : "";
  if(ex.kind === "t") return (sug.w !== undefined ? kgText(sug.w) + "を持って " : "") + sug.r + " 秒" + side;
  return w + sug.r + (ex.kind === "w" ? "" : " 回") + side;
}
