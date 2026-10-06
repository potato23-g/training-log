/* 回復の途中の部位があっても入れる種目（2026-10-05 本人の判断）の検査。dist/local/training-log.html の中で動かす。
   決まり: 7日以上使えていない部位が、回復の途中の部位も使う種目でしか鍛えられないときだけ、その種目をメニューに入れる。
           入れた種目には、今日タブの行の印・種目カードの「今日の調整」・種目の下の1行で、入れたことと理由を出す。
   場面ごとに、メニューと画面の文を確かめる（fails が空で合格）:
   1. 大殿筋が回復の途中で、大腿四頭筋を7日使えていない → 大腿四頭筋と大殿筋を使う種目が1つだけ入り、3か所に同じ理由が出る。
      1セット記録しても・組み直しても、理由は変わらず出る。その種目を外して組み直すと、代わりの種目は入らない
   2. 同じ記録で、大殿筋を今日「筋肉痛の部位」に選んだ → 入らない
   3. ハムストリングを7日使えていないが、回復の途中の部位を使わない種目（スライディングレッグカール）がある → そちらが入る
   4. 回復の途中の部位があるだけ（使えていない部位は無い）→ 入らない
   5. 内転筋を7日使えていないが、回復の途中の部位を使わない種目（ヒップアダクション）がある → そちらが入り、サイドランジは入らない
      （2026-10-06。それまでは内転筋をメインで鍛える種目がサイドランジだけで、サイドランジが理由つきで入っていた。
      ヒップアダクションを足しただけだと、1回の種目数がいっぱいでヒップアダクションが入らず、サイドランジも入らなかった）
   6. 自分で足した種目には、入れた理由ではなく、軽くするか外すようにと出る
   そのあと、メニューの種目を半分くらいだけこなす進め方（どれをやるかは決まった乱数）で、頻度4通り×42日ぶん組み
   （やらなかった種目の部位が使えていないまま、ほかの部位が回復の途中になる日ができる）、
   ・回復の途中の部位を使う種目が、理由の出ないままメニューに入っていないか（silent が空で合格）
   ・画面の3か所（行の印・カードの文・種目の下の1行）が、どの日も同じ種目に出ているか（mismatch が空で合格）
   ・理由つきで入れた日が1日も無ければ、この検査は決まりを通っていない（neverIncluded が空で合格）
   を見る。入れた回数（included）は目で見る */
setTimeout(() => {
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const fresh = () => { planMemo = null; if(typeof resetProg === "function") resetProg(); };
  const put = (dateKey, it, n) => {
    const sug = suggestNext(it, entryFor(dateKey, it.ex, false));
    const e = entryFor(dateKey, it.ex, true);
    for(let k = 0; k < n; k++){
      const st = {id: newSetId(), at: Date.now() + k, r: sug.target, label: it.label || "", target: sug.target};
      if(sug.opt) st.w = sug.w;
      e.sets.push(st);
    }
  };
  /* recs: [[何日前, 種目, セット数]] */
  const reset = (recs, sore) => {
    state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1};
    recs.forEach(r => put(shiftKey(TODAY, -r[0]), catalogItem(r[1]), r[2] || 3));
    if(sore){ session(TODAY).sore = sore; session(TODAY).soreAt = stampNow(); }
    openEx = null; editEx = null; fresh();
  };
  const out = {fails: [], scenes: {}, silent: [], mismatch: [], neverIncluded: [], included: {}};
  const need = (cond, msg) => { if(!cond) out.fails.push(msg); };
  const mains = it => EXMAP[it.ex].p;
  const names = list => list.map(itemName).join(" / ");
  /* 回復の途中・筋肉痛の部位をメインで使う種目 */
  const tiredItems = list => list.filter(it => exRest(it.ex));
  /* 今日タブの3か所が、理由つきで入れた種目（restIncluded）だけに、同じ文で出ているか。食い違いを文で返す */
  const screen = tag => {
    const items = activeItems(), bad = [];
    const html = viewToday();
    items.forEach(it => {
      const inc = restIncluded(it), adv = todayAdvice(it);
      const e = entryFor(TODAY, it.ex, false), done = !!e && e.sets.length >= SETS_PER_EXERCISE;
      const line = esc(itemName(it)) + ": " + (inc ? esc(restIncludedText(inc)) : "");
      const lineShown = inc ? html.indexOf('<p class="skipped">' + line + "</p>") >= 0
                            : html.indexOf('<p class="skipped">' + esc(itemName(it)) + ": ") >= 0;
      if(!!inc !== lineShown) bad.push(tag + " " + itemName(it) + ": 種目の下の1行が" + (inc ? "出ていない" : "出ている"));
      if(!!inc !== !!(adv && adv.included)) bad.push(tag + " " + itemName(it) + ": 種目カードの文が" + (inc ? "入れた理由になっていない" : "入れた理由になっている"));
      if(inc){
        if(adv.text.indexOf(restIncludedText(inc)) !== 0) bad.push(tag + " " + itemName(it) + ": カードの文が、下の1行と同じ文で始まっていない");
        if(adv.short !== recoverTag(inc.left)) bad.push(tag + " " + itemName(it) + ": 行の印が「" + adv.short + "」");
        if(/外してください/.test(adv.text)) bad.push(tag + " " + itemName(it) + ": 入れた種目に「外してください」と出ている");
        if(!done && html.indexOf('<span class="adv warn">' + esc(recoverTag(inc.left)) + "</span>") < 0) bad.push(tag + " " + itemName(it) + ": 行に印が出ていない");
        if(pickerTags(it.ex).indexOf(recoverTag(inc.left)) < 0) bad.push(tag + " " + itemName(it) + ": 種目を選ぶシートの印と日数が合わない");
      }
    });
    return bad;
  };

  /* ---- 場面1: 大殿筋が回復の途中（2日前にルーマニアンデッドリフト）。大腿四頭筋は8日前のスクワットが最後 ---- */
  const S1 = [[8, "goblet"], [5, "hipthrust"], [2, "rdl"]];
  reset(S1);
  need(recoverDaysLeft("glutes") === 2 && muscleLoadBetween("quads", 1, 6) === 0, "場面1: 前提（大殿筋はあと2日・大腿四頭筋は7日0）が作れていない");
  let plan = buildPlan().map(x => Object.assign({}, x));
  let inc = plan.filter(it => restIncluded(it));
  out.scenes["1"] = {plan: names(plan), included: names(inc)};
  need(inc.length === 1 && mains(inc[0]).includes("quads") && mains(inc[0]).includes("glutes"),
       "場面1: 大腿四頭筋と大殿筋を使う種目が1つだけ入るはず（入ったのは " + (names(inc) || "なし") + "）");
  need(tiredItems(plan).length === inc.length, "場面1: 回復の途中の部位を使う種目が、理由の出ないまま入っている: " + names(tiredItems(plan)));
  out.fails = out.fails.concat(screen("場面1"));
  if(inc.length === 1){
    const it = inc[0], text = restIncludedText(restIncluded(it));
    out.scenes["1"].text = text;
    need(text === "大腿四頭筋を7日以上使えていないので、回復の途中の部位（大殿筋はあと2日）があっても入れています。", "場面1: 文が違う: " + text);
    /* 1セット記録する（記録を始めるとメニューが保存される） */
    fixPlan(session(TODAY)); put(TODAY, it, 1); fresh();
    let cur = activeItems().find(i => i.ex === it.ex);
    need(!!cur && !!restIncluded(cur) && restIncludedText(restIncluded(cur)) === text, "場面1: 1セット記録したら、入れた理由の文が変わった・消えた");
    out.fails = out.fails.concat(screen("場面1・1セット後"));
    /* 組み直す（記録した種目は残る） */
    replanToday(); fresh();
    cur = activeItems().find(i => i.ex === it.ex);
    need(!!cur && !!restIncluded(cur), "場面1: 組み直したら、記録した種目の理由が消えた");
    need(tiredItems(activeItems()).length === 1, "場面1: 組み直したら、回復の途中の部位を使う種目が増えた: " + names(tiredItems(activeItems())));
    out.fails = out.fails.concat(screen("場面1・組み直し後"));
    /* 3セット終えても、下の1行は残る */
    put(TODAY, it, 2); fresh();
    out.fails = out.fails.concat(screen("場面1・終えたあと"));
    /* 記録の無い状態で、その種目を外して組み直す → 大殿筋を使う代わりの種目は入らない */
    reset(S1);
    const s = session(TODAY);
    fixPlan(s);
    s.plan.forEach(x => { if(x.ex === it.ex) x.skip = true; });
    fresh(); replanToday(); fresh();
    out.scenes["1"].afterSkip = names(activeItems());
    need(!tiredItems(activeItems()).length, "場面1: 外して組み直したら、回復の途中の部位を使う別の種目が入った: " + names(tiredItems(activeItems())));
  }

  /* ---- 場面2: 同じ記録で、大殿筋を筋肉痛に選んだ ---- */
  reset(S1, ["glutes"]);
  plan = buildPlan().map(x => Object.assign({}, x));
  out.scenes["2"] = {plan: names(plan)};
  need(!plan.some(it => mains(it).includes("glutes")), "場面2: 筋肉痛と選んだ大殿筋をメインで鍛える種目が入っている: " + names(plan.filter(it => mains(it).includes("glutes"))));
  need(!tiredItems(plan).length, "場面2: 回復の途中・筋肉痛の部位を使う種目が入っている: " + names(tiredItems(plan)));
  out.fails = out.fails.concat(screen("場面2"));

  /* ---- 場面3: ハムストリングは8日前が最後。大殿筋・大腿四頭筋は2日前のスクワットで回復の途中 ---- */
  reset([[8, "rdl"], [2, "goblet"]]);
  need(recoverDaysLeft("glutes") > 0 && muscleLoadBetween("hams", 1, 6) === 0, "場面3: 前提が作れていない");
  plan = buildPlan().map(x => Object.assign({}, x));
  out.scenes["3"] = {plan: names(plan)};
  need(plan.some(it => mains(it).includes("hams")), "場面3: ハムストリングをメインで鍛える種目が入っていない");
  need(!tiredItems(plan).length, "場面3: 回復の途中の部位を使わない種目があるのに、使う種目が入っている: " + names(tiredItems(plan)));
  out.fails = out.fails.concat(screen("場面3"));

  /* ---- 場面4: 回復の途中の部位があるだけ（どの部位も7日のうちに使っている） ---- */
  reset([[2, "goblet"], [2, "rdl"], [2, "sidelunge"]]);
  plan = buildPlan().map(x => Object.assign({}, x));
  out.scenes["4"] = {plan: names(plan)};
  need(!tiredItems(plan).length, "場面4: 使えていない部位が無いのに、回復の途中の部位を使う種目が入っている: " + names(tiredItems(plan)));
  out.fails = out.fails.concat(screen("場面4"));

  /* ---- 場面5: 内転筋は8日前が最後（スクワットもランジもやっていない）。大殿筋は2日前のルーマニアンデッドリフトで回復の途中。
          大腿四頭筋は4日前のシシースクワットで使っている（回復は済んでいる）。
          サイドランジは大殿筋を使うので入れず、回復の途中の部位を使わないヒップアダクションを入れる。
          ヒップアダクションは価値が小さく、ほかの種目で1回の種目数がいっぱいになる日なので、先に入れないと入らない
          （planner.js の buildPlan: 使えていない部位がどの種目にも入らなかったら、その部位の種目を先に入れて組み直す） ---- */
  reset([[8, "sidelunge"], [4, "sissy"], [2, "rdl"]]);
  need(recoverDaysLeft("glutes") > 0 && !recoverDaysLeft("quads") && muscleLoadBetween("adductors", 1, 6) === 0 && muscleLoadBetween("quads", 1, 6) > 0,
       "場面5: 前提が作れていない");
  plan = buildPlan().map(x => Object.assign({}, x));
  out.scenes["5"] = {plan: names(plan), count: plan.length};
  need(plan.some(it => it.ex === "adduct"), "場面5: ヒップアダクションが入っていない（内転筋を7日使えていない）");
  need(!plan.some(it => it.ex === "sidelunge"), "場面5: 回復の途中の部位を使わない種目があるのに、サイドランジが入っている");
  need(!tiredItems(plan).length, "場面5: 回復の途中の部位を使う種目が入っている: " + names(tiredItems(plan)));
  out.fails = out.fails.concat(screen("場面5"));

  /* ---- 場面6: 自分で足した種目（場面1の記録で、ルーマニアンデッドリフトを自分で足す） ---- */
  reset(S1);
  {
    const mine = Object.assign(catalogItem("goblet"), {manual: true}), adv = todayAdvice(mine);
    need(!restIncluded(mine) && adv && !adv.included && /外してください/.test(adv.text) && adv.short === recoverTag(2),
         "場面6: 自分で足した種目に、入れた理由が出ている・回復の途中の案内が出ていない: " + (adv ? adv.text : "なし"));
  }

  /* ---- 種目を半分くらいだけこなす進め方で42日ぶん ---- */
  let seed = 11;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; fresh();
  };
  const schedules = {daily: d => true, "1日おき": d => d % 2 === 0, "4/week": d => [0,1,3,4].includes(d % 7), "3/week": d => [0,2,4].includes(d % 7)};
  for(const [name, on] of Object.entries(schedules)){
    reset([]);
    const count = {};
    for(let day = 0; day < 42; day++){
      if(on(day)){
        const p = buildPlan().map(x => Object.assign({}, x));
        tiredItems(p).forEach(it => {
          if(!restIncluded(it)) out.silent.push(name + " " + day + "日目: " + itemName(it));
          else count[itemName(it)] = (count[itemName(it)] || 0) + 1;
        });
        out.mismatch = out.mismatch.concat(screen(name + " " + day + "日目"));
        fixPlan(session(TODAY));
        p.filter(() => rand() < 0.5).forEach(it => put(TODAY, it, 3));
        fresh();
        out.mismatch = out.mismatch.concat(screen(name + " " + day + "日目・記録後"));
      }
      nextDay();
    }
    out.included[name] = count;
  }
  if(!Object.keys(out.included).some(k => Object.keys(out.included[k]).length)) out.neverIncluded.push("理由つきで入れた日が1日も無い");
  out.failCount = out.fails.length;
  out.silent = out.silent.slice(0, 40);
  out.mismatch = out.mismatch.slice(0, 40);
  window.__result = out;
  window.__ready = true;
}, 300);
