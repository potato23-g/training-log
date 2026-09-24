/* ============================================================
   今日の調整（種目ごとに、きつさ・部位の回復・器具・マンネリから判断する）
   メニュー自体は勝手に書き換えず、提案だけ出す。
   ============================================================ */

/* 指定した部位を、fromDaysAgo〜toDaysAgo 日前に何セット使ったか（今日は含めない） */
function muscleLoadBetween(muscle, fromDaysAgo, toDaysAgo){
  let n = 0;
  sortedDates().forEach(d=>{
    const ago = daysAgo(d);
    if(ago < fromDaysAgo || ago > toDaysAgo) return;
    (state.sessions[d].entries||[]).forEach(e=>{
      const ex = EXMAP[e.ex]; if(!ex) return;
      if(ex.p.includes(muscle)) n += e.sets.length;
      else if((ex.s||[]).includes(muscle)) n += e.sets.length * 0.5;
    });
  });
  return n;
}
/* 直近2回の平均きつさ（記録が2回に満たなければ null） */
function recentRpe(exId, count){
  const hist = exerciseHistory(exId).slice(-(count || 2));
  if(hist.length < (count || 2)) return null;
  const vals = hist.map(h=>{
    const rs = h.sets.map(s=>s.rpe||0).filter(x=>x>0);
    return rs.length ? rs.reduce((a,b)=>a+b,0)/rs.length : 0;
  }).filter(x=>x>0);
  if(!vals.length) return null;
  return vals.reduce((a,b)=>a+b,0)/vals.length;
}
/* 同じ主働筋で、今の器具でできる別の種目（今日のメニューにすでにある動きは除く） */
function altFor(exId, wantBodyweight){
  const ex = EXMAP[exId]; if(!ex) return null;
  const mine = ex.p[0];
  const todayPats = new Set(todayItems().filter(t=>t.ex !== exId).map(t=>patternOf(t.ex)));
  const touched = patternsYesterday();
  const cands = EX.filter(c=>{
    if(c.id === exId || baseOf(c.id) === baseOf(exId)) return false;
    if(touched.has(patternOf(c.id))) return false;
    if(!c.p.includes(mine)) return false;
    if(todayPats.has(patternOf(c.id))) return false;
    if(wantBodyweight && c.kind === "w") return false;
    if(c.kind === "w" && !gearOptions(c.id).length) return false;
    return true;
  });
  if(!cands.length) return null;
  /* 今ちょうどよい難しさに近いものを選ぶ */
  const want = wantedLevel(patternOf(exId));
  cands.sort((a,b)=> Math.abs(levelOf(a.id) - want) - Math.abs(levelOf(b.id) - want));
  return cands[0];
}
/* 同じ種目が何回続けて出てきているか（直近のセッション連続数） */
function streakOf(exId){
  let n = 0;
  for(const d of sortedDates()){
    const s = state.sessions[d];
    if(!(s.entries||[]).some(e=>e.sets.length)) continue;
    if((s.entries||[]).some(e=>e.ex===exId && e.sets.length)) n++;
    else break;
  }
  return n;
}

/* 1種目ぶんの判断。優先度の高いものを1つだけ返す */
function todayAdvice(item, sug){
  const id = item.ex, ex = EXMAP[id];
  if(!ex) return null;
  const d = DETAIL[id] || DETAIL[baseOf(id)] || {};
  const hs = houseOf(id);
  if(!sug) sug = suggestNext(item, entryFor(TODAY, id, false), lastPerformance(id, TODAY));
  const opts = holdOf(id) ? gearOptions(id) : [];

  /* 1. ダンベルが要る種目なのに登録がない */
  if(ex.kind === "w" && !opts.length){
    const alt = altFor(id, true);
    return {level:"skip", warn:true, short:"ダンベルなし",
      text: "ダンベルが登録されていません。" + (hs.down ? "「" + hs.down + "」で代用できます。" : "")
          + (alt ? "自重でやるなら、同じ" + MUSCLES[ex.p[0]] + "を使う「" + alt.name + "」に替えられます。" : (hs.down ? "" : "今日は飛ばしてください。")),
      alt: alt ? alt.id : null};
  }

  /* 2. 主働筋を昨日しっかり使っている（回復優先） */
  const tired = tiredMuscle(id);
  if(tired){
    return {level:"recover", warn:true, short:"回復優先",
      text: MUSCLES[tired] + "を昨日 " + (Math.round(muscleLoadBetween(tired, 1, 1)*10)/10) + " セット使っています。今日はセット数を1つ減らすか、きつさ7くらいで止めると回復が進みます。"};
  }

  /* 3. 前回の記録から、今日の持ち方を変えた */
  if(sug.change === "up") return {level:"harder", short:"一段重く",
    text: (sug.mid ? "さっきのセットは余裕があって回数も伸びたので、次は一段重い「"
                   : "前回は余裕があったので、今日は持っているダンベルの中で一段重い「")
        + sug.opt.text + "」にしています。重すぎたら重量の − で元に戻せます。"};
  if(sug.change === "down") return {level:"easier", warn:true, short:"一段軽く",
    text: (sug.mid ? "さっきのセットは限界で回数が届かなかったので、次は一段軽い「"
                   : "前回は限界で回数が届かなかったので、今日は一段軽い「")
        + sug.opt.text + "」にしています。"};
  if(sug.change === "snap") return {level:"gear", short:"持ち方変更",
    text: "前回の重さは、今登録しているダンベルでは作れません。今日は「" + sug.opt.text + "」にしています。"};

  const rpe2 = recentRpe(id, 2);
  const cur = sug.opt || (opts.length && sug.w !== undefined && sug.w !== null && !isNaN(sug.w) ? nearestOption(opts, sug.w) : null);
  const i = optionIndex(opts, cur);

  /* 4. 限界が続いている → やさしくする */
  if(rpe2 !== null && rpe2 >= 9.5){
    const tip = i > 0 ? "持っている中で一段軽い「" + opts[i-1].text + "」に替えてください。"
      : (d.easy ? "今日は「" + gearText(d.easy) + "」でもいいです。" : "回数を落として余力を残してください。")
        + (ex.kind === "w" && hs.down ? "ダンベル自体が重すぎるなら「" + hs.down + "」でも構いません。" : "");
    return {level:"easier", warn:true, short:"やさしく",
      text: "直近2回のきつさが平均 " + rpe2.toFixed(1) + "。限界続きはフォームが崩れます。" + tip};
  }

  /* 5. 余裕が続いている → 強くする。持っているダンベルの範囲で、足りなければやり方と日用品で */
  if(rpe2 !== null && rpe2 <= 6){
    let tip;
    if(i >= 0 && i < opts.length - 1){
      tip = "持っている中で一段重い「" + opts[i+1].text + "」に持ち替えてください。";
    }else{
      let way = d.hard ? gearText(d.hard) : (ex.up && ex.up[0] ? gearText(ex.up[0]) : "");
      if(!inventory().length && /ダンベル/.test(way)) way = "";
      tip = (ex.kind === "w" ? "持っているダンベルではこれ以上重くできません。" : "")
          + (way ? "「" + way + "」を試してください。" : "")
          + (hs.up ? (way ? "日用品を使うなら「" + hs.up + "」も手です。" : "「" + hs.up + "」を試してください。") : "")
          + (!way && !hs.up ? "回数を増やしてください。" : "");
    }
    return {level:"harder", short:"強めに",
      text: "直近2回のきつさが平均 " + rpe2.toFixed(1) + "。8〜9に届いていません。" + tip};
  }

  /* 6. 同じ種目が続いている → たまには変える */
  const st = streakOf(id);
  if(st >= 4){
    const alt = altFor(id, false);
    if(alt) return {level:"swap", short:"変えてもいい",
      text: st + "回続けて同じ種目です。" + MUSCLES[ex.p[0]] + "を同じように使う「" + alt.name + "」に替えると、刺激が変わります。",
      alt: alt.id};
  }
  return null;
}

