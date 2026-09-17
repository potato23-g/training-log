(async () => {
  openEx = 'goblet';
  session(TODAY).routine = 'A';
  render();
  await new Promise(r => setTimeout(r, 500));
  window.__ready = true;
})();
