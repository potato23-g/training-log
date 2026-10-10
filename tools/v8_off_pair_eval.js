/* メニューに入れない種目（rules.js の exOn）と、反対の部位どうしを隣に並べる決まり（opposite・pairUp・menuPairs）の検査（2026-10-08）。
   dist/local/training-log.html の中で動かす。fails が空で合格。
   1. 入れない種目: 何通りかの外し方で、頻度2通り×35日ぶん全部こなして組み、外した種目が一度もメニューに入らないこと。
      内転筋をメインで鍛える種目を全部外しても、メニュー作りが止まらないこと。カーフレイズを外すと座って行う方が入ること。
      「おまかせで1種目追加」「20分で組む」「やさしく／難しく」の持ち替え先にも出ないこと
   2. 画面: 種目を選ぶシートの印・からだタブの印・種目タブのボタン・設定の押しボタンが、どの種目でも exOn と同じこと
   3. 切り替え: 今日のメニューにある、まだ記録していない種目を外すと、その場でメニューから消える。記録した種目・自分で追加した種目は残る。
      端末の保存に入り、読み直しても残る
   4. 反対の部位: opposite は向きを変えても同じ。組んだメニューでは、反対の部位どうしで、まだ組になっていない種目が離れたまま
      残っていないこと。今日タブの一行が menuPairs の組の数だけ出ること。組が1つもできなければ、この検査は決まりを通っていない
   5. できる限り入れる（2026-10-09）: 相手のいない種目があるのに、反対の部位の動きが「入れられる」のまま入っていない日が無いこと
      （planWhy の理由が ""）。並びは組の数が一番多いこと（menuPairs の数 = pairMates の数）。
      「メニューを組み直す」「おまかせで1種目追加」「種目を選んで追加」の後も、反対の部位どうしが離れたまま残らないこと */
setTimeout(() => {
  const out = {fails: [], pairs: 0, sessions: 0, seat: 0};
  const need = (cond, msg) => { if(!cond) out.fails.push(msg); };
  const shiftKey = (k, n) => { const d = new Date(k + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); };
  const fresh = () => { planMemo = null; if(typeof resetProg === "function") resetProg(); };
  const nextDay = () => {
    const next = {};
    Object.keys(state.sessions).forEach(k => { const nk = shiftKey(k, -1); next[nk] = Object.assign({}, state.sessions[k], {date: nk}); });
    state.sessions = next; fresh();
  };
  const doAll = plan => plan.forEach(it => {
    const sug = suggestNext(it, entryFor(TODAY, it.ex, false)), e = entryFor(TODAY, it.ex, true);
    for(let k = 0; k < (it.sets || 3); k++){
      const st = {id: newSetId(), at: Date.now() + k, r: sug.target, label: it.label || "", target: sug.target};
      if(sug.opt) st.w = sug.w;
      e.sets.push(st);
    }
  });
  const reset = off => {
    state.sessions = {}; state.gear = {items: [{kg: 5, n: 2}], updatedAt: 1};
    if(off) state.exOff = {ids: off, updatedAt: 1}; else delete state.exOff;
    openEx = null; editEx = null; fresh();
  };
  /* 反対の部位どうしで、組になっていない種目が残っていないか */
  const loose = plan => {
    const inPair = new Set();
    menuPairs(plan).forEach(p => p.forEach(it => inPair.add(it.ex)));
    const free = plan.filter(it => !inPair.has(it.ex));
    return free.some((a, i) => free.slice(i + 1).some(b => opposite(a.ex, b.ex)));
  };
  const schedules = {"毎日": d => true, "週3": d => [0, 2, 4].includes(d % 7)};

  /* ---- 1. 入れない種目 ---- */
  const adductorMains = EX.filter(e => e.p.includes("adductors")).map(e => e.id);
  const offSets = [[], ["goblet", "rdl", "pushup", "row"], adductorMains, ["calf"], ["curl", "hammer", "plank", "crunch", "deadbug"]];
  offSets.forEach(off => {
    Object.keys(schedules).forEach(name => {
      reset(off);
      for(let day = 0; day < 35; day++){
        if(schedules[name](day)){
          planWhy = {}; planMemo = null;
          const plan = buildPlan(), W = planWhy;
          planWhy = null;
          unpaired(plan).forEach(it => Object.keys(W).forEach(pat => need(!(W[pat] === "" && catalog().some(c => patternOf(c.ex) === pat && exOn(c.ex) && opposite(it.ex, c.ex))),
            "相手を入れられるのに入っていない: " + it.ex + "←" + pat + "（" + off.join(",") + "・" + name + "・" + day + "日目）")));
          need(menuPairs(plan).length * 2 === plan.length - unpaired(plan).length, "組の数が一番多い並びになっていない: " + plan.map(it => it.ex).join(","));
          plan.forEach(it => need(exOn(it.ex), "外した種目がメニューに入った: " + it.ex + "（" + off.join(",") + "・" + name + "・" + day + "日目）"));
          need(new Set(plan.map(it => it.ex)).size === plan.length, "同じ種目が2回入った（" + name + "・" + day + "日目）");
          need(!loose(plan), "反対の部位どうしが離れたまま: " + plan.map(it => it.ex).join(",") + "（" + name + "・" + day + "日目）");
          menuPairs(plan).forEach(p => need(opposite(p[0].ex, p[1].ex) && plan.indexOf(p[1]) === plan.indexOf(p[0]) + 1, "組が隣り合っていない"));
          if(!off.length){ out.pairs += menuPairs(plan).length; out.sessions++; }
          if(off.includes("calf") && plan.some(it => it.ex === "calfseat")) out.seat++;
          /* おまかせで1種目追加・20分で組む */
          planSeed = plan.map(x => Object.assign({}, x)); planRelax = true; planMemo = null;
          buildPlan().forEach(it => need(exOn(it.ex), "おまかせ追加で外した種目が入った: " + it.ex));
          planSeed = null; planRelax = false; planShort = true; planMemo = null;
          buildPlan().forEach(it => need(exOn(it.ex), "20分のメニューに外した種目が入った: " + it.ex));
          planShort = false; planMemo = null;
          /* やさしく／難しく */
          plan.forEach(it => [-1, 1].forEach(dir => { const s = stepItem(it, dir); need(!s || s.ex === it.ex || exOn(s.ex), "持ち替え先に外した種目: " + (s && s.ex)); }));
          fixPlan(session(TODAY));
          doAll(plan);
        }
        nextDay();
      }
    });
  });
  need(out.seat > 0, "カーフレイズを外しても、座って行う方が一度も入らなかった");
  need(out.pairs > 0, "反対の部位どうしの組が一度もできなかった");

  /* ---- 2. 画面 ---- */
  reset(["rdl", "pushup", "adduct"]);
  openPicker();
  EX.forEach(e => {
    const b = sheetInner.querySelector('[data-pick="' + e.id + '"]');
    need(!!b && b.innerHTML.includes(EX_OFF_TAG) === !exOn(e.id), "種目を選ぶシートの印が合わない: " + e.id);
    need(exByRow(e).includes(EX_OFF_TAG) === !exOn(e.id), "からだタブの印が合わない: " + e.id);
    refEx = e.id;
    const html = viewEx();
    need(html.includes(">メニューに入れる<") === !exOn(e.id) && html.includes(">メニューに入れない<") === exOn(e.id), "種目タブのボタンが合わない: " + e.id);
  });
  sheet.classList.remove("on");
  const box = document.createElement("div");
  box.innerHTML = exOffBody();
  const chips = Array.from(box.querySelectorAll("[data-act=exoff]"));
  need(chips.length === EX.length, "設定の押しボタンの数が種目の数と違う: " + chips.length);
  chips.forEach(c => need(c.classList.contains("on") === !exOn(c.dataset.ex) && c.getAttribute("aria-pressed") === String(!exOn(c.dataset.ex)), "設定の押しボタンが合わない: " + c.dataset.ex));

  /* ---- 3. 切り替え ---- */
  reset(null);
  tab = "today";
  const s = session(TODAY);
  fixPlan(s);
  const base = s.plan.map(x => x.ex);
  need(base.length >= 3, "検査の前提: 今日のメニューが3種目以上");
  const [x1, x2] = base;
  doAll([s.plan[1]]);                                  /* 2つ目は記録済み */
  ACTIONS.exoff({dataset: {ex: x1}});
  need(!todayItems().some(it => it.ex === x1), "外した種目が今日のメニューに残った: " + x1);
  ACTIONS.exoff({dataset: {ex: x2}});
  need(todayItems().some(it => it.ex === x2), "記録した種目が、外したら今日のメニューから消えた: " + x2);
  const manual = EX.find(e => !todayItems().some(it => it.ex === e.id) && exOn(e.id) && !isDoneToday(e.id) && (!holdOf(e.id) || gearOptions(e.id).length)).id;
  addToProgramToday(manual, "");
  ACTIONS.exoff({dataset: {ex: manual}});
  need(todayItems().some(it => it.ex === manual), "自分で追加した種目が、外したら今日のメニューから消えた: " + manual);
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem("trainlog.v1")); }catch(e){}
  need(!!saved && saved.exOff && [x1, x2, manual].every(id => saved.exOff.ids.includes(id)), "端末の保存に入っていない");
  const clean = sanitizeState(saved);
  need(!!clean.exOff && clean.exOff.ids.length === 3 && clean.exOff.updatedAt > 0, "保存の確かめ（sanitizeState）で落ちた");
  need(!sanitizeState({sessions: {}, exOff: {ids: ["<b>", 3, "rdl", "rdl"]}}).exOff.ids.some(id => id !== "rdl"), "形の合わない id が通った");
  ACTIONS.exoff({dataset: {ex: x1}});
  need(exOn(x1) && !state.exOff.ids.includes(x1), "入れる種目に戻せない");

  /* ---- 4. 反対の部位 ---- */
  EX.forEach(a => EX.forEach(b => need(opposite(a.id, b.id) === opposite(b.id, a.id), "opposite が向きで変わる: " + a.id + "/" + b.id)));
  need(opposite("pushup", "row") && opposite("curl", "triext") && opposite("abduct", "adduct") && !opposite("goblet", "rdl"), "反対の部位の表が想定と違う");
  reset(null);
  let lines = 0, shown = 0;
  for(let day = 0; day < 14; day++){
    const plan = buildPlan();
    fixPlan(session(TODAY));
    tab = "today"; openEx = null;
    const html = viewToday(), n = menuPairs(activeItems()).length;
    const got = (html.match(/反対の部位を使う種目です/g) || []).length;
    need(got === n, "今日タブの一行の数が組の数と違う: " + got + "/" + n + "（" + day + "日目）");
    lines += got; shown++;
    doAll(plan);
    planMemo = null;
    need(!(viewToday().match(/反対の部位を使う種目です/g) || []).length, "全部終えたあとも一行が出ている（" + day + "日目）");
    nextDay(); nextDay();
  }
  need(lines > 0, "今日タブに一行が一度も出なかった");
  out.lines = lines + "/" + shown;

  /* ---- 5. 組み直し・追加の後の並び ---- */
  need(pairUp([{ex: "sidelunge"}, {ex: "goblet"}, {ex: "slidecurl"}, {ex: "abduct"}]).map(x => x.ex).join(",") === "sidelunge,abduct,goblet,slidecurl", "相手の取り合いで組が減った");
  reset(null);
  tab = "today";
  let moved = 0;
  for(let day = 0; day < 10; day++){
    const s5 = session(TODAY);
    fixPlan(s5);
    const names = () => activeItems().map(it => it.ex).join(",");
    /* 反対の部位の片方を自分で追加する（もう片方がメニューにあって、まだ組になっていないとき、その隣に入る） */
    const freeNow = unpaired(activeItems());
    const want = EX.find(e => exOn(e.id) && !todayItems().some(it => it.ex === e.id) && freeNow.some(a => opposite(a.ex, e.id)) && (!holdOf(e.id) || gearOptions(e.id).length));
    if(want){
      addToProgramToday(want.id, "");
      need(!loose(activeItems()), "種目を選んで追加の後、反対の部位どうしが離れている: " + names());
      moved++;
    }
    addAutoToday();
    need(!loose(activeItems()), "おまかせで1種目追加の後、反対の部位どうしが離れている: " + names());
    doAll([activeItems()[0]]);
    replanToday();
    need(!loose(activeItems()), "メニューを組み直した後、反対の部位どうしが離れている: " + names());
    doAll(activeItems().filter(it => !isDoneToday(it.ex)));
    openEx = null; editEx = null; todayMsg = "";
    nextDay(); nextDay();
  }
  need(moved > 0, "種目を選んで追加の場面を一度も通らなかった");
  out.moved = moved;

  reset(null);
  try{ localStorage.removeItem("trainlog.v1"); }catch(e){}
  window.__result = out;
  window.__ready = true;
}, 300);
