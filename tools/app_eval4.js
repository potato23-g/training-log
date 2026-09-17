(async () => {
  /* 記録を1件入れて、からだ・履歴タブが壊れていないか見る */
  const e = entryFor(TODAY, 'goblet', true);
  e.sets.push({w:5, r:12, rpe:8}); e.sets.push({w:5, r:10, rpe:9});
  session(TODAY).routine = 'A';
  tab = 'body'; render();
  await new Promise(r => setTimeout(r, 300));
  window.__ready = true;
})();
