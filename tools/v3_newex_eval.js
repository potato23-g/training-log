/* 追加した種目が「種目」タブと「今日」タブでちゃんと出るかを見る。
   図が描けているか・解説文が揃っているか・持ち方や日用品の案内が出ているかを確かめる。
   あわせて、どの種目の動きにも、並び（PATTERN_ORDER）・まとまりの見出し（PATTERN_HEAD）・呼び名（PATTERN_NAME）があり、
   種目を選ぶシートと履歴の種目選びに全部の種目が出るかを見る（patternGaps・pickerMissing・histMissing・badHeads が空で合格）。
   並びに無い動きの種目は、シートにも種目選びにも出なくなる。見出しが無いと、動きの名前（英字）がそのまま出る
   （2026-10-05 の版で、ハンマーカールの見出しが「hammer」と出ていた） */
(async () => {
  const NEW = ["sumo", "splitfloor", "bridge", "pushupknee", "fly", "skull", "front", "shrug", "row2",
               "calfseat", "sidebend", "sidelunge", "slidecurl", "pullover", "twist",
               "sissy", "rear", "abduct", "hammer", "adduct", "backext", "deadlift"];
  const out = {missing: [], noFigure: [], noDetail: [], noHold: [], noHouse: [], noMotion: [], noPattern: [],
               notInCatalog: [], badLevel: [], samples: {}};

  NEW.forEach(id => {
    const ex = EXMAP[id];
    if(!ex){ out.missing.push(id); return; }
    if(!motionOf(id)) out.noMotion.push(id);
    if(!PATTERN[id]) out.noPattern.push(id);
    if(!(ex.level >= 1 && ex.level <= 3)) out.badLevel.push(id);
    const d = DETAIL[id];
    if(!d || !d.why || !d.setup || !d.breath || !d.tempo || !d.rom || !d.feel || !d.easy || !d.hard || !d.reps) out.noDetail.push(id);
    if(ex.kind === "w" && !HOLD[id]) out.noHold.push(id);
    if(!HOUSE[id]) out.noHouse.push(id);
    if(!catalog().some(c => c.ex === id)) out.notInCatalog.push(id);
  });

  out.patternGaps = [];
  EX.forEach(e => {
    const pat = patternOf(e.id), g = groupOf(pat);
    if(!PATTERN_ORDER.includes(pat)) out.patternGaps.push(e.id + ": 並びに無い（" + pat + "）");
    if(!PATTERN_HEAD[g]) out.patternGaps.push(e.id + ": 見出しが無い（" + g + "）");
    if(!PATTERN_NAME[g]) out.patternGaps.push(e.id + ": 呼び名が無い（" + g + "）");
  });
  PATTERN_ORDER.forEach(pat => { if(!EX.some(e => patternOf(e.id) === pat)) out.patternGaps.push(pat + ": 種目が無い"); });
  if(new Set(PATTERN_ORDER).size !== PATTERN_ORDER.length) out.patternGaps.push("並びに同じ動きが2回ある");
  /* 同じまとまりの動きは、並びの中で続いている（提案タブの見出しを、まとまりごとに1回だけ出すため） */
  groupOrder().forEach(g => {
    const idx = PATTERN_ORDER.map((pt, i) => groupOf(pt) === g ? i : -1).filter(i => i >= 0);
    if(idx[idx.length - 1] - idx[0] !== idx.length - 1) out.patternGaps.push(g + ": 並びの中で離れている");
  });
  /* 仕上げに足す動き（PATTERN_AFTER）の「先に組む動き」は、実在する動き */
  Object.keys(PATTERN_AFTER).forEach(k => PATTERN_AFTER[k].concat([k]).forEach(pt => {
    if(!PATTERN_ORDER.includes(pt)) out.patternGaps.push("PATTERN_AFTER: 並びに無い（" + pt + "）");
  }));
  /* 種目を選ぶシート: 全部の種目が1回ずつ出て、見出しに英字だけのものが無い */
  const hasJa = t => /[ぁ-んァ-ヶ一-龠]/.test(t);
  tab = "today"; render(); openPicker();
  await T.wait(60);
  const picked = T.qa("[data-pick]").map(b => b.dataset.pick);
  out.pickerMissing = EX.filter(e => picked.filter(x => x === e.id).length !== 1).map(e => e.id);
  out.badHeads = T.qa(".pickhead").map(h => h.textContent).filter(t => !hasJa(t));
  sheet.classList.remove("on");
  /* 履歴の「セットを追加」の種目選び */
  const tmp = document.createElement("select");
  tmp.innerHTML = exOptionsHTML("");
  const optEx = new Set(Array.from(tmp.querySelectorAll("option")).map(o => o.value.split("|")[0]));
  out.histMissing = EX.filter(e => !optEx.has(e.id)).map(e => e.id);
  Array.from(tmp.querySelectorAll("optgroup")).map(g => g.label).filter(t => !hasJa(t)).forEach(t => out.badHeads.push("履歴: " + t));

  /* 全種目に level が付いているか */
  out.exWithoutLevel = EX.filter(e => !(e.level >= 1 && e.level <= 3)).map(e => e.id);

  /* 「種目」タブを開いて、追加分の表示を確かめる */
  tab = "ex";
  for(const id of NEW){
    refEx = id;
    render();
    await T.wait(60);
    const html = document.getElementById("view").innerHTML;
    const img = document.querySelector('.dia .figstill');
    if(!img || !img.src.startsWith("data:image/png") || img.src.length < 2000) out.noFigure.push(id);
    if(id === "sumo" || id === "fly" || id === "shrug"){
      out.samples[id] = {
        name: EXMAP[id].name,
        hold: (document.querySelector('.diahold') || {}).textContent || "",
        note: (document.querySelector('.dianote') || {}).textContent || "",
        how: html.includes(exHow(id)[0].slice(0, 12)),
        gear: /5kg|ダンベル|ペットボトル/.test(html)
      };
    }
  }

  /* 今日のメニューに追加種目を入れて、記録まで通るか */
  T.reset([{kg: 5, n: 2}]);
  const s = session(TODAY);
  s.plan = [{ex: "fly", sets: 3, r: 12}, {ex: "shrug", sets: 3, r: 15}];
  s.planAt = Date.now();
  persistSession(TODAY);
  tab = "today"; render();
  await T.wait(80);
  out.todayNames = todayItems().map(it => itemName(it));
  await T.recordAll("fly", 4);
  out.flySets = T.sets("fly");
  out.flyDone = isDoneToday("fly");
  const line = document.querySelector('[data-ex="fly"]');
  out.flyShown = !!line;
  out.restFly = restFor({ex: "fly", sets: 3});

  /* 後の版で足した種目（この版に無い種目）が、同期で今日のメニューと記録に入ってきても、今日のタブを描けるか。
     メニューの行と記録は消さずに残す（後の版の端末へ同期で戻すため） */
  out.unknownBlocked = [];
  T.reset([{kg: 5, n: 2}]);
  const su = session(TODAY);
  su.plan = [{ex: "zzlater", sets: 3, r: 10}, {ex: "goblet", sets: 3, r: 10}];
  su.planAt = Date.now();
  su.entries = [{ex: "zzlater", sets: [{id: "zz1", at: Date.now(), r: 10}]}];
  su.sore = ["zzpart"];
  persistSession(TODAY);
  for(const t of ["today", "body", "hist", "plan"]){
    tab = t; render();
    await T.wait(60);
    if(/この画面を表示できませんでした/.test(document.getElementById("view").textContent)) out.unknownBlocked.push(t);
  }
  out.unknownKept = session(TODAY).plan.some(p => p.ex === "zzlater") && session(TODAY).entries.some(e => e.ex === "zzlater");
  if(!out.unknownKept) out.unknownBlocked.push("記録から消えた");

  window.__result = out;
  window.__ready = true;
})();
