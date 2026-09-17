(async () => {
  const today = new Date(TODAY + "T00:00:00");
  function dkey(off){ const d=new Date(today); d.setDate(d.getDate()-off); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  state.sessions = {};
  [18,12,6,0].forEach((off,i)=>{ const d=dkey(off); state.sessions[d]={date:d,routine:"A",note:"",entries:[{ex:"goblet",sets:[{w:5,r:40,rpe:i===0?8:9}]}]}; });
  tab = "plan"; render();
  await new Promise(r=>setTimeout(r,150));
  document.querySelector('[data-act="goref"][data-ex="goblet"]').click();
  await new Promise(r=>setTimeout(r,150));
  window.__result = { tab, refEx, 種目タブ表示中: document.querySelector('#exSel') ? document.querySelector('#exSel').value : null };
  window.__ready = true;
})();
