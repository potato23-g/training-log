/* ---- きつさに応じて次のセットの回数を決める ---- */
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
  const id = item.ex, opts = gearOptions(id);
  const cur = optionByTotal(id, prev.w);
  if(!opts.length || !cur) return {opt: cur, change: null};
  const i = optionIndex(opts, cur);
  const {lo, hi} = repRange(id, item);
  const rpe = prev.rpe || 0, r = prev.r || 0;
  const nx = opts[i + 1], pv = opts[i - 1];
  /* 一段上げても重さが跳ね上がらないときだけ上げる */
  if(nx && rpe && rpe <= 6 && r >= hi){
    if(nx.key <= cur.key * 1.6 || nx.key - cur.key <= 3) return {opt: nx, change: "up"};
    return {opt: cur, change: null, jump: nx};      /* 一段上げると重さが跳ね上がる */
  }
  if(pv && rpe >= 10 && r < lo) return {opt: pv, change: "down"};
  return {opt: cur, change: null};
}
/* 次のセットの提案。重さは持っているダンベルで作れる使い方の中からだけ選ぶ */
function suggestNext(item, e, last){
  const id = item.ex, ex = EXMAP[id], kind = ex.kind;
  const sets = e ? e.sets : [];
  const held = kind !== "w" && holdOf(id) ? defaultOption(id) : null;   /* 時間の種目でもダンベルを持つもの */
  if(sets.length){
    const prev = sets[sets.length-1];
    const a = adjust(kind, prev.r, prev.rpe);
    const src = "前のセットのきつさ " + (prev.rpe||"—");
    if(kind !== "w") return {r:a.r, opt:held, why:a.why, src};
    const p = setWeightPlan(item, prev);
    const rr = repRange(id, item);
    if(p.change === "up") return {r:clampR(kind, rr.lo), w:p.opt.total, opt:p.opt, change:"up", mid:true, src,
      why:"余裕があって回数も伸びたので、ダンベルを一段重くしました。回数は" + rr.lo + "回から"};
    if(p.change === "down") return {r:clampR(kind, prev.r), w:p.opt.total, opt:p.opt, change:"down", mid:true, src,
      why:"限界で回数が届かなかったので、ダンベルを一段軽くしました"};
    if(p.jump){
      /* 持っているダンベルでは次が重すぎる。回数を増やすか、やり方で効かせる */
      const harder = stepItem(item, 1);
      const tip = harder && harder.ex === id ? "「" + itemName(harder) + "」のやり方に変えると、重さを上げずに効かせられます"
                                             : "テンポを落とす・止める時間を作ると、重さを上げずに効かせられます";
      return {r:a.r, w:prev.w, opt:p.opt, mid:true, src,
        why:"次に重いのは" + kgText(p.jump.total) + "で上がり幅が大きいので、重さは変えずに回数で伸ばします。" + tip};
    }
    return {r:a.r, w:prev.w, opt:p.opt, why:a.why, src};
  }
  if(last && last.sets.length){
    const first = last.sets[0];
    const avg = last.sets.reduce((x,st)=>x+(st.rpe||0),0) / last.sets.length;
    const a = adjust(kind, first.r, avg ? Math.round(avg*2)/2 : 0);
    const src = "前回のきつさ平均 " + (avg ? Math.round(avg*10)/10 : "—");
    if(kind !== "w") return {r:a.r, opt:held, why:a.why, src};
    const p = weightPlan(item, last, avg);
    if(!p.opt) return {r:a.r, w:first.w, opt:null, why:a.why, src};
    const rr = repRange(id, item);
    if(p.change === "up") return {r:clampR(kind, rr.lo), w:p.opt.total, opt:p.opt, change:"up", src,
      why:"余裕があったので、持っているダンベルの中で一段重い使い方にしました。回数は" + rr.lo + "回から"};
    if(p.change === "down") return {r:clampR(kind, item.r || rr.hi), w:p.opt.total, opt:p.opt, change:"down", src,
      why:"限界で回数が届かなかったので、一段軽い使い方にしました"};
    if(p.change === "snap") return {r:clampR(kind, item.r || ex.r), w:p.opt.total, opt:p.opt, change:"snap", src,
      why:"前回の " + kgText(p.lastW) + " は登録しているダンベルでは作れないので、近い使い方にしました"};
    return {r:a.r, w:p.opt.total, opt:p.opt, why:a.why, src};
  }
  const opt = kind==="w" ? defaultOption(id) : held;
  return {r:clampR(kind, item.r || ex.r), w: kind==="w" ? (opt ? opt.total : 0) : undefined, opt,
          why:"初回はフォームを優先します。余力を2〜3回残して終えてください", src:"初回"};
}
function sugText(item, sug){
  const ex = EXMAP[item.ex];
  if(ex.kind === "w") return sug.w + " kg × " + sug.r + (item.side ? "（左右それぞれ）" : "");
  if(ex.kind === "t") return sug.r + " 秒" + (item.side ? "（左右それぞれ）" : "");
  return sug.r + " 回" + (item.side ? "（左右それぞれ）" : "");
}

