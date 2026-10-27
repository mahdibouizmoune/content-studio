'use strict';
const { parseIngredient } = require('parse-ingredient');
const { parseRecipeCard, durationMinutes } = require('./recipe-card-parser');
const { validateRecipeCard } = require('./recipe-generation');
const { parseDocument } = require('htmlparser2');
const { selectAll } = require('css-select');
const { textContent } = require('domutils');
const { createHash } = require('node:crypto');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const tokens = value => String(value).toLowerCase().match(/[a-z]{3,}/g) || [];
const stop = new Set('fresh dried ground chopped sliced diced minced large small medium optional divided taste plus more cup cups tablespoon tablespoons teaspoon teaspoons ounces ounce pound pounds grams gram milliliters water salt pepper oil extra virgin cooked drained rinsed finely freshly for garnish serving unsalted whole leaves'.split(' '));
function inspectSingleRecipe(article = {}) {
  const card = parseRecipeCard(article.content || '');
  const base = validateRecipeCard(article.content || '');
  const issues = base.issues.map(message => ({ severity: 'error', message }));
  const ingredients = card.ingredients.flatMap((line, index) => {
    let parsed;
    try { parsed = parseIngredient(line, { round: false }); } catch { parsed = []; }
    if (!parsed.length) parsed = [{ description: line, quantity: null }];
    return parsed.filter(p => !p.isGroupHeader).map(p => ({ ...p, original: line, index }));
  });
  for (const p of ingredients) {
    if (p.quantity !== null && (!Number.isFinite(p.quantity) || p.quantity < 0)) issues.push({ severity: 'error', message: `Invalid quantity: ${p.original}` });
    if (p.quantity === null && !/to taste|pinch|dash|as needed|optional/i.test(p.original)) issues.push({ severity: 'warning', message: `Confirm the amount for: ${p.original}` });
    const words = [...new Set(tokens(p.description).filter(w => !stop.has(w)))];
    const method = tokens(card.instructions.join(' '));
    if (words.length && !words.some(w => method.some(m => m === w || m.replace(/s$/, '') === w.replace(/s$/, '')))) issues.push({ severity: 'warning', message: `Check where this ingredient is used: ${p.original}` });
  }
  const time = Object.fromEntries(['Prep Time', 'Cook Time', 'Total Time'].map(k => [k, durationMinutes(card.facts[k])]));
  const yieldValue = Number(String(card.facts.Servings || card.facts.Yield || '').match(/\d+(?:\.\d+)?/)?.[0]);
  return { schemaVersion: 1, articleId: article.id || '', contentSha256: createHash('sha256').update(String(article.content || '')).digest('hex'), checkedAt: new Date().toISOString(),
    status: issues.some(i => i.severity === 'error') ? 'needs-repair' : issues.length ? 'needs-review' : 'structure-checked',
    issues, recipe: { name: card.name || article.generatedTitle || article.title || 'Recipe', ingredients, instructions: card.instructions, facts: card.facts, time, servings: yieldValue || null },
    limitation: 'Structural checks do not establish taste, nutritional accuracy, allergen safety or real-world recipe testing.' };
}
function inspectRecipe(article = {}) {
  const units = require('./recipe-units').recipeUnits(article.content || '');
  const primaryCount = selectAll('[id="recipe-card"]', parseDocument(article.content || '')).length;
  const documentChecks = report => primaryCount > 1 ? { ...report, status: 'needs-repair', issues: [...report.issues, { severity: 'error', message: 'Duplicate primary recipe-card IDs. Keep one primary card and unique IDs for additional recipes.' }] } : report;
  if (units.length <= 1) {
    const report = inspectSingleRecipe({ ...article, content: units[0]?.html || article.content });
    report.contentSha256 = createHash('sha256').update(String(article.content || '')).digest('hex');
    return documentChecks({ ...report, recipeCount: units.length, recipes: units.length ? [{ ...report.recipe, name: units[0].name || report.recipe.name }] : [] });
  }
  const reports = units.map((unit, index) => inspectSingleRecipe({ ...article, title: unit.name || `Recipe ${index + 1}`, generatedTitle: unit.name, content: unit.html }));
  const issues = reports.flatMap((r, index) => r.issues.map(i => ({ ...i, recipeIndex: index, message: `Recipe ${index + 1}: ${i.message}` })));
  return documentChecks({ ...reports[0], schemaVersion: 2, contentSha256: createHash('sha256').update(String(article.content || '')).digest('hex'),
    recipeCount: reports.length, recipes: reports.map(r => r.recipe), issues,
    status: issues.some(i => i.severity === 'error') ? 'needs-repair' : issues.length ? 'needs-review' : 'structure-checked' });
}
function extractRecipeData(html, sourceUrl) {
  const doc = parseDocument(String(html), { decodeEntities: true });
  const found = [];
  function visit(value, depth = 0) {
    if (!value || depth > 12 || found.length >= 20) return;
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1); return; }
    if (typeof value !== 'object') return;
    if ([].concat(value['@type'] || []).includes('Recipe')) found.push(value);
    else for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item']) visit(value[key], depth + 1);
  }
  for (const script of selectAll('script[type="application/ld+json"]', doc)) {
    try { visit(JSON.parse(textContent(script))); } catch { /* Malformed metadata is not repaired by guessing. */ }
  }
  return found.map(r => ({ sourceUrl, name: String(r.name || '').slice(0, 300),
    ingredients: Array.isArray(r.recipeIngredient) ? r.recipeIngredient.map(String).slice(0, 100) : [],
    instructions: [].concat(r.recipeInstructions || []).flatMap(s => typeof s === 'string' ? [s] : s.itemListElement ? s.itemListElement.map(x => x.text || '') : [s.text || '']).filter(Boolean).slice(0, 100),
    prepTime: r.prepTime || null, cookTime: r.cookTime || null, totalTime: r.totalTime || null, servings: r.recipeYield || null,
    evidence: 'Recipe JSON-LD supplied by source; not verified by cooking.' }));
}
function shoppingList(articles, multiplier = 1) {
  if (!Number.isFinite(Number(multiplier)) || multiplier < 0.25 || multiplier > 20) throw new Error('Choose a serving multiplier between 0.25 and 20.');
  const groups = new Map();
  for (const article of articles) for (const [recipeIndex, recipe] of inspectRecipe(article).recipes.entries()) for (const p of recipe.ingredients) {
    const key = `${String(p.description).toLowerCase().replace(/\s+/g, ' ').trim()}|${p.unitOfMeasureID || p.unitOfMeasure || ''}`;
    if (!key.split('|')[0]) continue;
    const quantity = p.quantity === null ? null : p.quantity * multiplier;
    const quantity2 = p.quantity2 === null || p.quantity2 === undefined ? null : p.quantity2 * multiplier;
    // Ranges and unmeasured ingredients retain their own lines; no guessed density conversion.
    const mergeKey = quantity === null || quantity2 !== null ? `${article.id}:${recipeIndex}:${p.index}:${key}` : key;
    const old = groups.get(mergeKey);
    const source = { articleId: article.id || '', recipeIndex };
    groups.set(mergeKey, old ? { ...old, quantity: old.quantity + quantity, sources: [...old.sources, source], recipes: [...new Set([...old.recipes, article.generatedTitle || article.title, recipe.name].filter(Boolean))] }
      : { description: p.description, unit: p.unitOfMeasure || '', quantity, quantity2, original: p.original, sources: [source], recipes: [article.generatedTitle || article.title, ...(recipe.name && recipe.name !== article.title ? [recipe.name] : [])].filter(Boolean) });
  }
  return [...groups.values()];
}
function shoppingHtml(articles, multiplier) {
  const rows = shoppingList(articles, multiplier);
  const amount = value => Number(value.toFixed(3)).toString();
  return `<!doctype html><html><head><meta charset="utf-8"><title>Recipe Shopping List</title><style>body{font:16px Arial,sans-serif;max-width:800px;margin:32px auto;padding:16px}li{margin:16px 0}small{display:block;color:#555}h1{font-size:26px}</style></head><body><h1>Recipe Shopping List</h1><p>Serving multiplier: ${escape(multiplier)}. Adjust cooking times separately.</p><ul>${rows.map(p => `<li><label><input type="checkbox"> ${escape(p.quantity === null ? p.original : `${amount(p.quantity)}${p.quantity2 !== null ? `-${amount(p.quantity2)}` : ''} ${p.unit} ${p.description}`)}</label><small>${escape(p.recipes.join(', '))}</small></li>`).join('')}</ul></body></html>`;
}
module.exports = { inspectRecipe, extractRecipeData, shoppingList, shoppingHtml };
