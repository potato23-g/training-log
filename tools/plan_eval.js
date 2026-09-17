(async () => {
  await new Promise(r => setTimeout(r, 100));
  document.querySelector('nav.tabs button[data-tab="plan"]').click();
  await new Promise(r => setTimeout(r, 200));
  const view = document.getElementById('view');
  window.__result = {
    html_snippet: view.innerHTML.replace(/\s+/g,' ').slice(0, 6000),
    levelup検出: view.innerHTML.includes('そろそろ切り替え時'),
    plateau検出: view.innerHTML.includes('伸び悩み'),
    easy検出: view.innerHTML.includes('余裕が続いています'),
    balance検出: view.innerHTML.includes('直近30日でほぼ使えていません'),
    routine検出: view.innerHTML.includes('をしばらく行っていません')
  };
  window.__ready = true;
})();
