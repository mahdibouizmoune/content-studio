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
  const ingredientHeading = [...recipe.querySelectorAll('h3')].find(h => /^ingredients/i.test(h.textContent.trim()));
  const list = ingredientHeading?.nextElementSibling;
  const ingredients = list?.tagName === 'UL' ? [...list.querySelectorAll('li')] : [];
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
