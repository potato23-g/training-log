(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  setGear({unit:5, count:2, adjustable:true, max:20});
  session(TODAY).routine = "A"; openEx = "goblet"; render(); await wait(150);
  document.querySelector('[data-act="addset"][data-ex="goblet"]').click();
  await wait(300);
  /* 設定カードまでスクロール */
  const card = [...document.querySelectorAll("h3.sec")].find(h=>h.textContent.includes("使える器具"));
  if(card) card.scrollIntoView({block:"start"});
  await wait(200);
  window.__ready = true;
})();
