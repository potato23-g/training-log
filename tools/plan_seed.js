(function(){
  /* 提案の4系統を全て発火させるテストデータを組み立てる */
  const today = new Date(TODAY + "T00:00:00");
  function dkey(offsetDays){
    const d = new Date(today); d.setDate(d.getDate() - offsetDays);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }
  state.sessions = {};

  /* goblet: 直近3回とも上限付近＋きつさ高 → levelup */
  [18,12,6,0].forEach((off,i)=>{
    const d = dkey(off);
    state.sessions[d] = { date:d, routine:"A", note:"",
      entries:[{ex:"goblet", sets:[{w:5,r:40,rpe: i===0?8:9}]}] };
  });

  /* rdl: 4回とも量が横ばい＋きつさ高 → plateau */
  [21,14,7,0].forEach((off)=>{
    const d = dkey(off);
    if(!state.sessions[d]) state.sessions[d] = { date:d, routine:"C", note:"", entries:[] };
    state.sessions[d].entries.push({ex:"rdl", sets:[{w:5,r:12,rpe:8}]});
  });

  /* curl: 直近3回ともきつさ低くまだ余裕 → easy */
  [10,5,0].forEach((off)=>{
    const d = dkey(off);
    if(!state.sessions[d]) state.sessions[d] = { date:d, routine:"D", note:"", entries:[] };
    state.sessions[d].entries.push({ex:"curl", sets:[{w:5,r:10,rpe:5}]});
  });

  /* 部位バランス: lats を使う種目(row)を一切やらない一方、他は十分やる */
  for(let off=0; off<30; off+=3){
    const d = dkey(off);
    if(!state.sessions[d]) state.sessions[d] = { date:d, routine:"A", note:"", entries:[] };
    if(!state.sessions[d].entries.some(e=>e.ex==="hipthrust"))
      state.sessions[d].entries.push({ex:"hipthrust", sets:[{w:5,r:15,rpe:7},{w:5,r:15,rpe:7},{w:5,r:15,rpe:7}]});
  }

  /* ルーチンD(引く・腕)を28日間1度もやっていない状態にする（rowはB/D双方に無い前提で追加しない） */

  saveLocal();
  render();
})();
