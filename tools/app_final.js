(async () => {
  document.documentElement.setAttribute('data-theme', 'dark');
  figThemeChanged();
  document.querySelector('nav.tabs button[data-tab="ex"]').click();
  refEx = 'hipthrust'; render();
  await new Promise(r => setTimeout(r, 500));
  window.__ready = true;
})();
