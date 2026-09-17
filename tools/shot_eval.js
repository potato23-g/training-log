(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  openEx = "goblet"; session(TODAY).routine = "A"; render(); await wait(150);
  document.getElementById("r_goblet").value = "18";
  document.querySelector('[data-act="addset"][data-ex="goblet"]').click();
  await wait(300);
  window.scrollTo(0, 320);
  window.__ready = true;
})();
