(async () => {
  const today = new Date(TODAY + "T00:00:00");
  const dkey = off => { const d = new Date(today); d.setDate(d.getDate()-off);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  state.sessions = {};
  const d = dkey(1);
  state.sessions[d] = {date:d, routine:"A", note:"", entries:[
    {ex:"hipthrust", sets:[{w:10,r:15,rpe:8},{w:10,r:15,rpe:8},{w:10,r:15,rpe:8},{w:10,r:15,rpe:8}]}
  ]};
  window.__result = {
    "hipthrustの主働筋": EXMAP.hipthrust.p,
    "大殿筋の1〜2日前の負荷": muscleLoadBetween("glutes", 1, 2),
    "判定": todayAdvice({ex:"hipthrust", sets:3, r:15}),
    "しきい値": "6セット以上で回復優先"
  };
  window.__ready = true;
})();
