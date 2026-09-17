(async () => {
  document.querySelector('nav.tabs button[data-tab="ex"]').click();
  refEx = 'goblet';
  render();
  await new Promise(r => setTimeout(r, 400));
  window.__figState = { fig: (typeof FIG === 'object' && FIG) ? 'ok' : String(FIG),
                        motions: typeof MOTION !== 'undefined' ? Object.keys(MOTION.motions) : 'なし',
                        three: typeof THREE !== 'undefined' ? THREE.REVISION : 'なし' };
  window.__ready = true;
})();
