/* 折りたたみ・今日タブ・種目タブ・履歴のグラフの検査（2026-10-11 本人の要望）。
   dist/local/training-log.html の中で動かす。fails が空で合格。
   1. 提案タブ・設定タブの折りたたみは初めは閉じている（ダンベルを登録していないときの「持っているダンベル」だけ開く）。
      開くと、描き直しても・タブを移っても開いたまま。提案タブに「部位のバランス」は無い
   2. 今日タブ: 進み具合の1行が、終えた種目数 / メニューの種目数と同じ。「この内容で記録」で、次の種目に1セット入る
   3. 種目タブ: 消した見出しが出ない。「やり方」の下に足す文（howExtra）は、準備・どこまで動かすか（DETAIL）の文だけで、
      手順（how）と同じ文は足さない
   4. 履歴タブ: 種目ごとのグラフは、ダンベルの種目は重さと回数の2段、回数の種目は1段。点の数は記録した日数 × 段の数。
      日付と目盛りが出る。腕の種目は片手の重さ
   5. 今日タブの進み具合の1行は、下へ送っても画面の上に残る。からだタブで選んだ部位は、もう一度選ぶか、ほかの場所を押すと戻る */
setTimeout(() => {
  const out = {fails: []};
  const need = (cond, msg) => { if(!cond) out.fails.push(msg); };
  const view = () => document.getElementById("view");
  const key = n => { const d = new Date(TODAY + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const put = (off, ex, sets) => {
    const d = key(off);
    state.sessions[d] = state.sessions[d] || {date: d, entries: [], note: ""};
    state.sessions[d].entries.push({ex, sets: sets.map((x, i) => Object.assign({id: d + ex + i, at: i}, x))});
  };
  const fresh = () => { planMemo = null; if(typeof resetProg === "function") resetProg(); };
  const folds = () => Array.from(view().querySelectorAll("details[data-fold]"));

  /* 1. 折りたたみ */
  state.sessions = {}; delete state.gear; delete state.tune; fresh();
  Object.keys(foldOpen).forEach(k => delete foldOpen[k]);
  switchTab("set");
  let f = folds();
  need(f.length >= 4, "設定タブの折りたたみが少ない: " + f.length);
  need(f.filter(d => d.open).map(d => d.dataset.fold).join() === "gear", "ダンベルを登録していないとき、開いているのが「持っているダンベル」だけでない: " + f.filter(d => d.open).map(d => d.dataset.fold).join());
  state.gear = {items: [{adj: true, n: 2, min: 2, max: 20, step: 2}], updatedAt: 1};
  [-9, -6, -3].forEach((off, i) => { put(off, "curl", [0,1,2].map(() => ({w: 12 + 4 * i, r: 10 + i}))); put(off, "pushup", [0,1,2].map(() => ({r: 10 + i}))); });
  fresh(); render();
  need(folds().every(d => !d.open), "ダンベルを登録してあるのに、設定タブで開いている折りたたみがある");
  need(!!view().querySelector("#dayStartSel") && !view().querySelector("#dayStartSel").closest("details"), "1日の区切りが折りたたみの中にある");
  switchTab("plan");
  f = folds();
  need(f.length >= 4 && f.every(d => !d.open), "提案タブの折りたたみが初めから開いている・足りない: " + f.map(d => d.dataset.fold + (d.open ? "*" : "")).join());
  need(!/部位のバランス/.test(view().textContent), "提案タブに「部位のバランス」が残っている");
  const d0 = f[0]; d0.open = true; d0.dispatchEvent(new Event("toggle"));
  render();
  need(folds()[0].open && folds().slice(1).every(d => !d.open), "開いた折りたたみが、描き直すと閉じる");
  switchTab("today"); switchTab("plan");
  need(folds()[0].open, "開いた折りたたみが、タブを移ると閉じる");

  /* 2. 今日タブ */
  switchTab("today");
  const items = todayItems().filter(it => !it.skip && !it.extra);
  const prog = view().querySelector("[data-dayprog]");
  need(!!prog && prog.textContent.replace(/\s+/g, "").indexOf("今日0/" + items.length + "種目") === 0 && /残り約\d+分/.test(prog.textContent.replace(/\s+/g, "")), "進み具合の1行が違う: " + (prog ? prog.textContent.replace(/\s+/g, " ") : "無い"));
  const btn = view().querySelector("[data-act=herorec]");
  need(!!btn, "「次の種目」に記録ボタンが無い");
  if(btn){
    const ex = btn.dataset.ex, before = (entryFor(TODAY, ex, false) || {sets: []}).sets.length;
    btn.click();
    const e = entryFor(TODAY, ex, false);
    need(!!e && e.sets.length === before + 1, "「この内容で記録」で1セット入らない");
    need(openEx === ex, "「この内容で記録」のあと、その種目のカードが開いていない");
    const sug = suggestNext(items.find(it => it.ex === ex), null);
    need(!!e && e.sets[0].r === sug.target, "入った回数が、表示した目標と違う");
    /* 残りのセットは記録へじかに足す（addSet は、同じ値を続けて押したときの二重の記録を防ぐので、続けては呼べない） */
    for(let k = e.sets.length; k < 3; k++) e.sets.push(Object.assign({}, e.sets[0], {id: newSetId(), at: Date.now() + k}));
    fresh(); render();
    const p2 = view().querySelector("[data-dayprog]");
    need(!!p2 && p2.textContent.replace(/\s+/g, "").indexOf("今日1/") === 0, "1種目終えても、進み具合が 1 にならない: " + (p2 ? p2.textContent.replace(/\s+/g, " ") : "無い"));
  }

  /* 3. 種目タブ */
  switchTab("ex");
  const GONE = ["この種目を入れる理由", "呼吸とテンポ", "効いているかの判断", "よくある間違い", "中止する合図", "どこまで動かすか"];
  const bad = [];
  let extraN = 0;
  EX.forEach(ex => {
    refEx = ex.id; render();
    const heads = Array.from(view().querySelectorAll("h3, h4, summary")).map(h => h.textContent.trim());
    GONE.concat(["準備"]).forEach(g => { if(heads.includes(g)) bad.push(ex.id + ":" + g); });
    const extra = howExtra(ex.id), D = DETAIL[ex.id] || DETAIL[baseOf(ex.id)] || {};
    const src = [].concat(D.setup || [], D.rom || []).join("。").replace(/\s+/g, "");
    extra.forEach(t => { if(t.split("。").some(x => src.indexOf(x.trim().replace(/\s+/g, "")) < 0)) bad.push(ex.id + ":足した文が DETAIL に無い"); if((ex.how || []).includes(t)) bad.push(ex.id + ":手順と同じ文"); });
    const shown = Array.from(view().querySelectorAll(".howextra li")).length;
    if(shown !== extra.length) bad.push(ex.id + ":足した文の数 " + shown + "≠" + extra.length);
    extraN += extra.length;
  });
  need(!bad.length, "種目タブ: " + bad.slice(0, 6).join(" / "));
  need(extraN > 0, "「やり方」に足す文が1つも無い");

  /* 4. 履歴タブ */
  switchTab("hist");
  const cards = Array.from(view().querySelectorAll(".card")).filter(c => c.querySelector("svg.trendline"));
  const cardOf = name => cards.find(c => c.querySelector("h4, h3, b, .name") && c.textContent.indexOf(name) >= 0);
  const curl = cardOf(EXMAP.curl.name), push = cardOf(EXMAP.pushup.name);
  need(!!curl && !!push, "履歴に、記録した種目のグラフが無い");
  if(curl && push){
    const dots = c => c.querySelectorAll("svg.trendline circle").length, heads = c => Array.from(c.querySelectorAll("svg.trendline .charthead")).map(t => t.textContent);
    need(heads(curl).length === 2 && /重さ/.test(heads(curl)[0]) && heads(curl)[1] === "回数" && dots(curl) === 6, "ダンベルの種目のグラフが、重さと回数の2段でない: " + heads(curl).join() + " 点" + dots(curl));
    need(heads(push).length === 1 && heads(push)[0] === "回数" && dots(push) === 3 + (push === curl ? 0 : 0), "回数の種目のグラフが1段でない: " + heads(push).join() + " 点" + dots(push));
    const ticks = Array.from(curl.querySelectorAll("svg.trendline .charttick")).map(t => t.textContent);
    const md = off => { const d = new Date(key(off) + "T00:00:00"); return (d.getMonth() + 1) + "/" + d.getDate(); };
    need(ticks.includes(md(-9)) && ticks.includes(md(-3)), "グラフに日付が出ていない: " + ticks.join());
    const item = {ex: "curl", label: ""};
    need(ticks.includes(String(wShown(item, 12))) && ticks.includes(String(wShown(item, 20))) && ticks.includes("10") && ticks.includes("12"), "グラフの目盛りが、記録した重さ・回数と違う: " + ticks.join());
    need(perArm("curl") === /片手/.test(heads(curl)[0]), "片手の重さの書き方が、種目の持ち方と違う");
    need(curl.querySelectorAll(".prdot").length >= 2 && /最高セット/.test(curl.textContent), "自己ベストの点・最高セットが出ていない");
  }

  /* 5. 進み具合の1行は、下へ送っても画面の上に残る。からだタブで選んだ部位は、もう一度選ぶか、ほかの場所を押すと戻る */
  switchTab("today");
  const dp = view().querySelector("[data-dayprog]");
  need(!!dp && getComputedStyle(dp).position === "sticky", "進み具合の1行が、上に固定されていない");
  if(dp && document.documentElement.scrollHeight > innerHeight + 200){
    scrollTo(0, 400);
    const top = dp.getBoundingClientRect().top;
    need(scrollY > 200 && top > -1 && top < 60, "下へ送ると、進み具合の1行が画面の上に残らない: " + Math.round(top));
    out.stickyTop = Math.round(top);
    scrollTo(0, 0);
  }
  switchTab("body");
  const mb = () => view().querySelector("[data-act=selmuscle]");
  need(!!mb(), "からだタブに、部位を選ぶ行が無い");
  if(mb()){
    const m = mb().dataset.m;
    mb().click();
    need(selMuscle === m, "部位を選べない");
    view().querySelector("[data-act=selmuscle][data-m=" + m + "]").click();
    need(selMuscle === null, "同じ部位をもう一度選んでも戻らない");
    mb().click();
    view().querySelector("h4").click();
    need(selMuscle === null, "ほかの場所を押しても、選んだ部位が戻らない");
    mb().click();
    const other = Array.from(view().querySelectorAll("[data-act=selmuscle]")).find(el => el.dataset.m !== m);
    if(other){ other.click(); need(selMuscle === other.dataset.m, "選んでいるときに別の部位を押すと、その部位に切り替わらない"); }
    selMuscle = null;
  }

  out.failCount = out.fails.length;
  window.__result = out; window.__ready = true;
}, 300);
