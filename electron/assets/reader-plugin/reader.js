(() => {
  'use strict';
  const recipe = document.querySelector('#recipe-card');
  if (!recipe || recipe.dataset.csReader) return;
  recipe.dataset.csReader = 'ready';
  const config = window.csReaderSettings || {};
  const emit = event => { if (config.events === true && typeof window.gtag === 'function') window.gtag('event', event, { recipe_id: config.postId, transport_type: 'beacon' }); };
  const toolbar = document.createElement('div'); toolbar.className = 'cs-reader-toolbar'; toolbar.setAttribute('aria-label', 'Recipe actions');
  function button(label, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); toolbar.append(b); return b; }
  recipe.prepend(toolbar);
  button('Print Recipe', () => { emit('cs_recipe_print'); document.body.classList.add('cs-recipe-print'); window.print(); });
  window.addEventListener('afterprint', () => document.body.classList.remove('cs-recipe-print'));
  const savedKey = `cs-saved-recipe:${config.postId || location.pathname}`;
  const save = button('Save Recipe', () => {
    try { localStorage.setItem(savedKey, JSON.stringify({ title: document.title, url: location.origin + location.pathname, savedAt: new Date().toISOString() })); save.textContent = 'Saved on This Device'; emit('cs_recipe_save'); }
    catch { save.textContent = 'Storage Unavailable'; }
  });
  try { if (localStorage.getItem(savedKey)) save.textContent = 'Saved on This Device'; } catch {}
  const ingredients = [...recipe.querySelectorAll('h3')].filter(h => /^ingredients\s*:?$/i.test(h.textContent.trim())).flatMap(h => h.nextElementSibling?.tagName === 'UL' ? [...h.nextElementSibling.querySelectorAll('li')] : []);
  for (const [i, li] of ingredients.entries()) {
    const label = document.createElement('label'), checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.id = `cs-ingredient-${i}`;
    while (li.firstChild) label.append(li.firstChild);
    label.prepend(checkbox); li.append(label);
  }
  if (ingredients.length) button('Shopping List', () => {
    let panel = recipe.querySelector('.cs-shopping-list');
    if (!panel) {
      panel = document.createElement('section'); panel.className = 'cs-shopping-list'; panel.setAttribute('aria-label', 'Shopping list');
      const heading = document.createElement('h3'); heading.textContent = 'Shopping List'; panel.append(heading);
      const output = document.createElement('textarea'); output.rows = Math.min(ingredients.length + 1, 14); output.setAttribute('aria-label', 'Shopping list'); output.value = ingredients.map(li => li.textContent.trim()).join('\n'); panel.append(output);
      const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close'; close.addEventListener('click', () => { panel.hidden = true; }); panel.append(close); toolbar.after(panel);
    }
    panel.hidden = false; panel.querySelector('textarea').focus(); panel.querySelector('textarea').select(); emit('cs_shopping_list');
  });
  const steps = [...recipe.querySelectorAll('h3')].filter(h => /^(instructions|directions|method)\s*:?$/i.test(h.textContent.trim())).flatMap(h => ['OL', 'UL'].includes(h.nextElementSibling?.tagName) ? [...h.nextElementSibling.children].filter(n => n.tagName === 'LI') : []);
  if (steps.length) {
    const progress = document.createElement('output'); progress.className = 'cs-step-progress'; progress.setAttribute('aria-live', 'polite'); toolbar.append(progress);
    const checks = [];
    const update = () => { progress.textContent = `${checks.filter(c => c.checked).length} of ${steps.length} steps checked`; };
    for (const [i, step] of steps.entries()) {
      const label = document.createElement('label'), box = document.createElement('input'); box.type = 'checkbox'; box.setAttribute('aria-label', `Step ${i + 1} complete`);
      const words = document.createElement('span'); while (step.firstChild) words.append(step.firstChild); label.append(box, words); step.append(label); checks.push(box); box.addEventListener('change', update);
    }
    update();
  }
  const timer = document.createElement('div'); timer.className = 'cs-recipe-timer';
  const timerLabel = document.createElement('label'); timerLabel.textContent = 'Timer (minutes)';
  const minutes = document.createElement('input'); minutes.type = 'number'; minutes.min = '1'; minutes.max = '1440'; minutes.value = '5'; minutes.setAttribute('aria-label', 'Timer minutes'); timerLabel.append(minutes);
  const start = document.createElement('button'); start.type = 'button'; start.textContent = 'Start Timer';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel Timer'; cancel.disabled = true;
  const remaining = document.createElement('output'); remaining.setAttribute('aria-label', 'Timer remaining');
  const alert = document.createElement('span'); alert.setAttribute('role', 'status');
  timer.append(timerLabel, start, cancel, remaining, alert); toolbar.after(timer);
  let deadline = 0, interval;
  const tick = () => {
    if (!deadline) return;
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); remaining.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (!seconds) { clearInterval(interval); deadline = 0; start.disabled = false; cancel.disabled = true; minutes.disabled = false; alert.textContent = 'Timer ended. Check the recipe result; time alone does not establish doneness.'; }
  };
  start.addEventListener('click', () => {
    const value = Number(minutes.value); if (!Number.isFinite(value) || value < 1 || value > 1440) { alert.textContent = 'Choose 1 to 1440 minutes.'; return; }
    clearInterval(interval); deadline = Date.now() + value * 60000; alert.textContent = ''; start.disabled = true; cancel.disabled = false; minutes.disabled = true; tick(); interval = setInterval(tick, 1000);
  });
  cancel.addEventListener('click', () => { clearInterval(interval); deadline = 0; remaining.textContent = ''; alert.textContent = 'Timer cancelled.'; start.disabled = false; cancel.disabled = true; minutes.disabled = false; });
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pagehide', () => clearInterval(interval));
  window.addEventListener('pageshow', () => { if (deadline) { tick(); if (deadline) interval = setInterval(tick, 1000); } });
  let wake;
  const cook = button('Cook Mode', async () => {
    const enabled = !recipe.classList.contains('cs-cook-mode'); recipe.classList.toggle('cs-cook-mode', enabled); cook.setAttribute('aria-pressed', String(enabled));
    if (enabled) { try { wake = await navigator.wakeLock?.request('screen'); } catch {} }
    else { try { await wake?.release(); } catch {} wake = null; }
  });
  cook.setAttribute('aria-pressed', 'false');
  document.addEventListener('visibilitychange', () => { if (document.hidden) { wake?.release().catch(() => {}); wake = null; } });
  if (navigator.share) button('Share Recipe', async () => { try { await navigator.share({ title: document.title, url: location.origin + location.pathname }); } catch {} });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { emit('cs_recipe_view'); observer.disconnect(); } }, { threshold: 0.01 }); observer.observe(recipe);
  }
})();
