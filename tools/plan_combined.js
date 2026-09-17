(async () => {
  /* 1回のページ読み込み内でテストデータを組み立て、直接renderして提案タブを見る */
  const today = new Date(TODAY + "T00:00:00");
  function dkey(offsetDays){
    const d = new Date(today); d.setDate(d.getDate() - offsetDays);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  state.sessions = {};

  [18,12,6,0].forEach((off,i)=>{
    const d = dkey(off);
    state.sessions[d] = { date:d, routine:"A", note:"",
      entries:[{ex:"goblet", sets:[{w:5,r:40,rpe: i===0?8:9}]}] };
  });
  [21,14,7,0].forEach((off)=>{
    const d = dkey(off);
    if(!state.sessions[d]) state.sessions[d] = { date:d, routine:"C", note:"", entries:[] };
    state.sessions[d].entries.push({ex:"rdl", sets:[{w:5,r:12,rpe:8}]});
  });
  [10,5,0].forEach((off)=>{
    const d = dkey(off);
    if(!state.sessions[d]) state.sessions[d] = { date:d, routine:"D", note:"", entries:[] };
    state.sessions[d].entries.push({ex:"curl", sets:[{w:5,r:10,rpe:5}]});
  });
  for(let off=0; off<30; off+=3){
    const d = dkey(off);
    if(!state.sessions[d]) state.sessions[d] = { date:d, routine:"A", note:"", entries:[] };
    if(!state.sessions[d].entries.some(e=>e.ex==="hipthrust"))
      state.sessions[d].entries.push({ex:"hipthrust", sets:[{w:5,r:15,rpe:7},{w:5,r:15,rpe:7},{w:5,r:15,rpe:7}]});
  }

  tab = "plan";
  render();
  await new Promise(r => setTimeout(r, 200));
  const view = document.getElementById('view');
  window.__result = {
    levelup検出: view.innerHTML.includes('そろそろ切り替え時'),
    plateau検出: view.innerHTML.includes('伸び悩み'),
    easy検出: view.innerHTML.includes('余裕が続いています'),
    balance検出: view.innerHTML.includes('直近30日でほぼ使えていません'),
    routine検出: view.innerHTML.includes('をしばらく行っていません'),
    エラー数: (window.__errs||[]).length
  };
  window.__ready = true;
})();
