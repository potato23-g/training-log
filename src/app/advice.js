/* ============================================================
   今日の調整（種目ごとに、器具・部位の回復・伸ばし方の結果から一言添える）
   メニュー自体は勝手に書き換えず、知らせるだけ。
   同じ種目が続いても入れ替えは勧めない（種目は負荷を合わせるために選ぶもので、気分では変えない）
   ============================================================ */

/* 指定した部位を、fromDaysAgo〜toDaysAgo 日前に何セット使ったか（今日は含めない） */
function muscleLoadBetween(muscle, fromDaysAgo, toDaysAgo){
  let n = 0;
  sessionsBetween(fromDaysAgo, toDaysAgo).forEach(s=>{
    (s.entries||[]).forEach(e=>{
      const ex = EXMAP[e.ex]; if(!ex) return;
      if(ex.p.includes(muscle)) n += e.sets.length;
      else if((ex.s||[]).includes(muscle)) n += e.sets.length * 0.5;
    });
  });
  return n;
}
/* ダンベルが無いときの代わり: 同じ主働筋で、今の器具でできる別の種目（今日のメニューにすでにある動きは除く） */
function altFor(exId, wantBodyweight){
  const ex = EXMAP[exId]; if(!ex) return null;
  const mine = ex.p[0];
  const todayPats = new Set(activeItems().filter(t=>t.ex !== exId).map(t=>patternOf(t.ex)));
  const touched = patternsYesterday();
  const cands = EX.filter(c=>{
    if(c.id === exId || baseOf(c.id) === baseOf(exId)) return false;
    if(touched.has(patternOf(c.id))) return false;
    if(!c.p.includes(mine)) return false;
    if(todayPats.has(patternOf(c.id))) return false;
    if(wantBodyweight && c.kind === "w") return false;
    if(!gearReady(c.id, c)) return false;
    return true;
  });
  if(!cands.length) return null;
  /* 今の種目に近い難しさのものを選ぶ */
  const want = levelOf(exId);
  cands.sort((a,b)=> Math.abs(levelOf(a.id) - want) - Math.abs(levelOf(b.id) - want));
  return cands[0];
}

/* 1種目ぶんの一言。優先度の高いものを1つだけ返す */
function todayAdvice(item, sug){
  const id = item.ex, ex = EXMAP[id];
  if(!ex) return null;
  const hs = houseOf(id);
  if(!sug) sug = suggestNext(item, entryFor(TODAY, id, false));
  const opts = holdOf(id) ? itemOptions(item) : [];
  const optText = o => o ? "「" + o.text + "」" : "";

  /* 1. ダンベルが要る種目なのに登録がない（HOLD のある種目は種類を問わず、無ければ needsDb の組み方も） */
  if(holdOf(id) && !opts.length){
    const alt = altFor(id, true);
    return {level:"skip", warn:true, short:"ダンベルなし",
      text: "ダンベルが登録されていません。" + (hs.down ? "「" + hs.down + "」で代用できます。" : "")
          + (alt ? "自重でやるなら、同じ" + MUSCLES[ex.p[0]] + "を使う「" + alt.name + "」に替えられます。" : (hs.down ? "" : "今日は飛ばしてください。")),
      alt: alt ? alt.id : null};
  }
  if(item.needsDb && !inventory().length){
    return {level:"skip", warn:true, short:"ダンベルなし",
      text: "ダンベルが登録されていません。今日は飛ばすか、基本のやり方に戻してください。"};
  }

  /* 2. 主働筋が回復の途中か、今日筋肉痛と選んだ部位。
        メニュー作りが入れた種目（7日使えていない部位のため: rules.js の restIncluded）には、入れた理由を出す。
        自分で足した種目など、メニュー作りを通らずに入ったものには、軽くするか外すように出す。
        種目を選ぶシートの印と同じ exRest() から作る（あと何日かも同じ数になる） */
  const rest = exRest(id);
  if(rest){
    const inc = restIncluded(item);
    if(inc) return {level:"recover", warn:true, short: recoverTag(inc.left), included:true,
      text: restIncludedText(inc) + "疲れが残っているときは、重さを軽くしてください。"};
    const soreText = rest.sore.length ? rest.sore.map(m => MUSCLES[m]).join("・") + "は今日「筋肉痛の部位」に選んでいます。" : "";
    const recText = rest.left ? MUSCLES[rest.muscle] + "はまだ回復の途中です（あと" + rest.left + "日。" + recoverFrom(rest.left) + "メインで鍛えられます）。" : "";
    return {level:"recover", warn:true, short: rest.sore.length ? "筋肉痛" : recoverTag(rest.left),
      text: soreText + recText + "重さを軽くするか、今日は外してください。"};
  }

  /* 3. 前回からの伸ばし方の結果（その日の1セット目の前だけ） */
  const n = (entryFor(TODAY, id, false) || {sets:[]}).sets.length;
  const p = sug.prog || progressFor(item);
  if(!n){
    if(p.snap !== undefined) return {level:"gear", short:"持ち方変更",
      text: "前回の " + kgText(p.snap) + " は、今登録しているダンベルでは作れません。今日は" + optText(p.opt) + "にしています。"};
    if(p.change === "heavier") return {level:"harder", short: p.steps === 2 ? "二段重く" : "一段重く", text: p.why + "。重すぎたら重量の − で戻せます。"};
    if(p.change === "lighter") return {level:"easier", warn:true, short:"一段軽く", text: p.why + "。"};
    if(p.change === "stepped-up") return {level:"harder", short:"段階を上げた", text: p.why + "。"};
    if(p.change === "stepped-down") return {level:"easier", short:"段階を下げた", text: p.why + "。"};
    if(p.change === "harder") return {level:"harder", short:"次は上の段階", text: p.why + "。"};
    if(p.change === "easier") return {level:"easier", warn:true, short:"次は下の段階", text: p.why + "。"};
    /* 一番上の段・軽い週は毎回のことなので、見出しの札にはしない（カードの中の一言だけ） */
    if(p.change === "top") return {level:"top", short:"", text: p.why + "。"};
    if(p.change === "deload") return {level:"deload", short:"", text: p.why + "。"};
  }
  return null;
}
