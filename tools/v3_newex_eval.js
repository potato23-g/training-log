/* 追加した種目が「種目」タブと「今日」タブでちゃんと出るかを見る。
   図が描けているか・解説文が揃っているか・持ち方や日用品の案内が出ているかを確かめる */
(async () => {
  const NEW = ["sumo", "splitfloor", "bridge", "pushupknee", "fly", "skull", "front", "shrug", "row2",
               "calfseat", "sidebend", "sidelunge"];
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

  window.__result = out;
  window.__ready = true;
})();
