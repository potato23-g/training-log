/* ---- きつさに応じて次のセットの回数を決める（同じ日のセットの合間） ---- */
function clampR(kind, r){
  r = Math.round(r);
  return kind==="t" ? Math.max(10, Math.min(180, r)) : Math.max(4, Math.min(40, r));
}
function adjust(kind, r, rpe){
  const st = kind==="t" ? 5 : 2;
  if(!rpe) return {r:clampR(kind,r), why:""};
  if(rpe <= 5) return {r:clampR(kind, r + st*2), why:"かなり余裕があったので増やしました"};
  if(rpe <= 6) return {r:clampR(kind, r + st), why:"まだ余力があるので少し増やしました"};
  if(rpe <= 9) return {r:clampR(kind, r), why:"狙いの範囲です。同じ数字で続けます"};
  return {r:clampR(kind, r - st), why:"限界まで行ったので少し減らしました"};
}
/* セットの合間にダンベルを一段動かすか決める。動くのは持っている使い方の中だけ。
   up   : きつさ6以下で、回数が狙いの上限まで伸びている
   down : きつさ10で、回数が狙いの下限に届かなかった */
function setWeightPlan(item, prev){
  const id = item.ex, opts = itemOptions(item);
  const cur = opts.find(o => Math.abs(o.total - prev.w) < 0.01) || null;
  if(!opts.length || !cur) return {opt: cur, change: null};
  const i = optionIndex(opts, cur);
  const {lo, hi} = repRange(id, item);
  const rpe = prev.rpe || 0, r = prev.r || 0;
  const nx = opts[i + 1], pv = opts[i - 1];
  /* 一段上げても重さが跳ね上がらないときだけ上げる */
  if(nx && rpe && rpe <= 6 && r >= hi){
    if(nx.key <= cur.key * PROG.jumpRatio || nx.key - cur.key <= PROG.jumpKg) return {opt: nx, change: "up"};
    return {opt: cur, change: null, jump: nx};      /* 一段上げると重さが跳ね上がる */
  }
  if(pv && rpe >= 10 && r < lo) return {opt: pv, change: "down"};
  return {opt: cur, change: null};
}
/* 次のセットの提案。
   その日の1セット目は伸ばし方（progress.js）の目標から。2セット目からは前のセットのきつさで少し動かす。
   target はこの日の目標（記録にも残し、次の回の判断に使う）。重さは持っているダンベルで作れる使い方の中からだけ */
function suggestNext(item, e){
  const id = item.ex, ex = EXMAP[id], kind = ex.kind;
  const sets = e ? e.sets : [];
  const p = progressFor(item);
  const weighted = !!p.opt;                         /* 重さを扱う（時間の種目でもダンベルを持つものを含む） */
  if(!sets.length){
    return {r:p.target, target:p.target, w: weighted ? p.opt.total : undefined, opt:p.opt,
            change:p.change, why:p.why, src:p.src, prog:p};
  }
  const prev = sets[sets.length-1];
  const target = typeof prev.target === "number" ? prev.target : p.target;
  const a = adjust(kind, prev.r, prev.rpe);
  const src = "前のセットのきつさ " + (prev.rpe||"—");
  if(!weighted || prev.w === undefined) return {r:a.r, target, w: weighted ? p.opt.total : undefined, opt:p.opt, why:a.why, src, prog:p};
  const wp = setWeightPlan(item, prev);
  const rr = repRange(id, item);
  if(wp.change === "up") return {r:clampR(kind, rr.lo), target:clampR(kind, rr.lo), w:wp.opt.total, opt:wp.opt, change:"up", mid:true, src, prog:p,
    why:"余裕があって回数も伸びたので、ダンベルを一段重くしました。回数は" + rr.lo + "回から"};
  if(wp.change === "down") return {r:clampR(kind, prev.r), target:clampR(kind, prev.r), w:wp.opt.total, opt:wp.opt, change:"down", mid:true, src, prog:p,
    why:"限界で回数が届かなかったので、ダンベルを一段軽くしました"};
  if(wp.jump){
    /* 持っているダンベルでは次が重すぎる。回数を増やすか、やり方で効かせる */
    return {r:a.r, target, w:prev.w, opt:wp.opt, mid:true, src, prog:p,
      why:"次に重いのは" + kgText(wShown(item, wp.jump.total)) + (perArm(id) ? "（片手）" : "") + "で上がり幅が大きいので、重さは変えずに回数で伸ばします"};
  }
  return {r:a.r, target, w:prev.w, opt:wp.opt || p.opt, why:a.why, src, prog:p};
}
/* 「10 kg × 13」のような短い書き方（腕の種目は片手あたり） */
function sugText(item, sug){
  const ex = EXMAP[item.ex], side = item.side ? "（左右それぞれ）" : "";
  const w = sug.w !== undefined && ex.kind === "w" ? (perArm(item.ex) ? "片手 " : "") + wShown(item, sug.w) + " kg × " : "";
  if(ex.kind === "t") return (sug.w !== undefined ? kgText(sug.w) + "を持って " : "") + sug.r + " 秒" + side;
  return w + sug.r + (ex.kind === "w" ? "" : " 回") + side;
}
