(async () => {
  const today = new Date(TODAY + "T00:00:00");
  const dkey = off => { const d = new Date(today); d.setDate(d.getDate()-off);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
  const out = {};

  /* ルーチンA を昨日やった場合、各部位の負荷がどうなるか（実際のメニュー構成で確認） */
  state.sessions = {};
  const d = dkey(1);
  state.sessions[d] = {date:d, routine:"A", note:"", entries:
    RMAP.A.items.map(it => ({ex: it.ex, sets: Array.from({length: it.sets}, ()=>({w:10, r:it.r, rpe:8}))}))};
  ["quads","glutes","hams","calves","abs"].forEach(m=>{
    out["A実施翌日_" + MUSCLES[m]] = Math.round(muscleLoadBetween(m,1,2)*10)/10;
  });
  out["A翌日にA種目をやる場合の判定_goblet"] = (todayAdvice({ex:"goblet",sets:3,r:18})||{}).short || "なし";

  /* 連続2日やった場合 */
  const d2 = dkey(2);
  state.sessions[d2] = {date:d2, routine:"A", note:"", entries:
    RMAP.A.items.map(it => ({ex: it.ex, sets: Array.from({length: it.sets}, ()=>({w:10, r:it.r, rpe:8}))}))};
  out["A_2日連続後_大腿四頭筋"] = Math.round(muscleLoadBetween("quads",1,2)*10)/10;
  out["A_2日連続後の判定_goblet"] = (todayAdvice({ex:"goblet",sets:3,r:18})||{}).short || "なし";

  /* 通常のローテーション（A→B→C→D）なら、A の翌々日に C（脚後ろ側）が来る */
  state.sessions = {};
  const dB = dkey(1);
  state.sessions[dB] = {date:dB, routine:"B", note:"", entries:
    RMAP.B.items.map(it => ({ex: it.ex, sets: Array.from({length: it.sets}, ()=>({w:10, r:it.r, rpe:8}))}))};
  out["B実施翌日にC種目_rdl"] = (todayAdvice({ex:"rdl",sets:3,r:18})||{}).short || "なし";

  state.sessions = {};
  window.__result = out;
  window.__ready = true;
})();
