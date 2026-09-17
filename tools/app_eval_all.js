(async () => {
  const out = [];
  document.querySelector('nav.tabs button[data-tab="ex"]').click();
  for (const e of EX) {
    refEx = e.id;
    render();
    await new Promise(r => setTimeout(r, 30));
    const img = document.querySelector('.figstill');
    const note = document.querySelector('.dianote');
    const hold = document.querySelector('.diahold');
    out.push({
      id: e.id,
      still: img ? (img.src.length > 2000 ? 'ok' : 'small') : 'なし',
      note: note ? 'ok' : 'なし',
      hold: hold ? 'ok' : 'なし',
      motion: (typeof motionOf === 'function' && motionOf(e.id)) ? motionOf(e.id).id : 'なし'
    });
  }
  window.__result = out;
  window.__ready = true;
})();
