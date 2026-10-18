'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { canonicalArticle } = require('./pin-scheduler');
const { inspectRecipe, shoppingHtml } = require('./recipe-quality');
const { recipeUnits } = require('./recipe-units');
const { parseRecipeCard } = require('./recipe-card-parser');
const { parseDocument } = require('htmlparser2');
const { selectAll } = require('css-select');
const { getOuterHTML } = require('domutils');
const hash = value => createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = value => { try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
const identity = value => { try { return canonicalArticle(value); } catch { return ''; } };
const text = (value, max = 300) => { if (typeof value !== 'string' || value.length > max) throw new Error(`Enter text of at most ${max} characters.`); return value.trim(); };
function renderRecipes(recipes) {
  if (!Array.isArray(recipes) || !recipes.length || recipes.length > 50) throw new Error('Use 1 to 50 complete recipes.');
  if (JSON.stringify(recipes).length > 200000) throw new Error('Recipe record exceeds 200 KB.');
  return `<section id="recipe-card">${recipes.map((r, index) => {
    const name = text(r.name), facts = r.facts || {};
    const lines = (values, maximum) => {
      if (!Array.isArray(values) || values.length > maximum) throw new Error('Invalid recipe lines.');
      return values.map(v => `<li>${escape(text(v, 2000))}</li>`).join('');
    };
    return `<h2${recipes.length === 1 ? ' itemprop="name"' : ''}>${recipes.length > 1 ? `${index + 1}. ` : ''}${escape(name)}</h2><p>${['Prep Time', 'Cook Time', 'Total Time', 'Servings'].map(k => `${k}: ${escape(text(facts[k] || '', 120))}`).join('; ')}</p><h3>Ingredients</h3><ul>${lines(r.ingredients, 100)}</ul><h3>Instructions</h3><ol>${lines(r.instructions, 100)}</ol>`;
  }).join('')}</section>`;
}
function editableRecipes(article) {
  return recipeUnits(article.content || '').map(unit => {
    const parsed = parseRecipeCard(unit.html);
    return { name: unit.name || article.generatedTitle || article.title, facts: { ...parsed.facts, Servings: parsed.facts.Servings || parsed.facts.Yield }, ingredients: parsed.ingredients, instructions: parsed.instructions };
  });
}
function experimentReport(experiment, metrics, currentPins) {
  const mapped = experiment.variants.map(v => {
    const changed = currentPins && !currentPins.some(p => p.id === v.pinId && p.imageQa?.sha256 === v.sha256);
    const rows = metrics.filter(r => String(r.pinId || r.id || '') === v.remotePinId);
    const valid = !changed && rows.length === 1 && ['impressions', 'outboundClicks'].every(k => rows[0][k] !== null && rows[0][k] !== '' && Number.isFinite(Number(rows[0][k])) && Number(rows[0][k]) >= 0) && Number(rows[0].outboundClicks) <= Number(rows[0].impressions);
    const sum = key => valid ? Number(rows[0][key]) : 0;
    const impressions = sum('impressions'), clicks = sum('outboundClicks');
    return { ...v, evidence: changed ? 'artwork-changed' : rows.length > 1 ? 'ambiguous-rows' : valid ? 'measured' : 'unavailable', impressions, clicks, ctr: impressions ? clicks / impressions : null };
  });
  return { ...experiment, variants: mapped, status: mapped.every(v => v.evidence === 'measured' && v.impressions >= 1000) ? 'observational-comparison' : 'insufficient-evidence', limitation: 'Different dates, audiences and distribution may explain differences. No causal winner is declared.' };
}
function createContentOperations({ store, ledger, saveFile, readMedia }) {
  const countCache = new Map();
  const get = () => ({ baselines: {}, recipeRecords: {}, styleVersions: [], benchmarkCases: [], experiments: [], packs: [], costLinks: {}, ...store.get('contentOperations', {}) });
  const save = value => store.set('contentOperations', value);
  const articles = () => store.get('articles', []);
  const pins = () => store.get('pinCreatorPins', []);
  function article(id) { if (['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Invalid article identity.'); const a = articles().find(a => a.id === id); if (!a) throw new Error('Saved article no longer exists.'); return a; }
  function related(a) {
    const urls = [a.wordpressPostUrl, a.sourceUrl, a.url].map(identity).filter(Boolean);
    return pins().filter(p => p.articleId === a.id || p.sourceSnapshot?.articleId === a.id || urls.includes(identity(p.url)));
  }
  function pipeline(d) {
    const batches = store.get('pinterestDelivery.batches', []), projects = store.get('metaStudioProjects', []);
    return articles().map(a => {
      const ps = related(a), ids = new Set(ps.map(p => String(p.id))), baseline = d.baselines[a.id];
      const sourceHash = hash(a.content || '');
      const linked = projects.filter(p => String(p.articleId) === String(a.id));
      return { id: a.id, title: String(a.generatedTitle || a.title || 'Untitled article'), queueStatus: a.queueStatus, url: safeUrl(a.wordpressPostUrl), sourceHash,
        sourceState: !baseline ? 'untracked' : baseline.sourceHash === sourceHash ? 'current' : 'source-changed',
        artworkState: !baseline?.pins ? 'untracked' : JSON.stringify(baseline.pins) === JSON.stringify(ps.map(p => ({ id: p.id, sha256: p.imageQa?.sha256 || '' }))) ? 'current' : 'artwork-changed',
        pins: ps.map(p => ({ id: p.id, title: p.title, status: p.status, style: p.generationConfig?.pinStyle || p.promptStyle || '', sha256: p.imageQa?.sha256 || '' })),
        meta: linked.map(p => ({ id: p.id, title: p.articleTitle || p.content?.campaignTitle, status: p.status || 'draft' })),
        deliveries: batches.flatMap(b => b.rows.filter(r => ids.has(String(r.pinId))).map(r => ({ batchId: b.id, number: r.number, status: b.outcomes?.[r.number]?.status || 'pending' }))),
        recipeCount: (() => { if (!countCache.has(sourceHash)) { if (countCache.size > 2000) countCache.clear(); countCache.set(sourceHash, recipeUnits(a.content || '').length); } return countCache.get(sourceHash); })(), revision: a.recipeRecord?.revision || 0 };
    });
  }
  function costs(d, lines) {
    const entries = ledger.get().entries;
    const pinOwners = new Map(lines.flatMap(a => a.pins.map(p => [p.id, a.id])));
    const groups = new Map();
    for (const e of entries) {
      const linked = d.costLinks[e.id];
      const label = linked?.articleId || e.articleId || pinOwners.get(e.pinId) || 'unassigned';
      const g = groups.get(label) || { articleId: label, requests: 0, reserved: 0, reported: 0, unknown: 0 };
      g.requests++; if (e.status !== 'rejected') g.reserved += e.reportedUsd ?? e.estimateUsd ?? 0;
      g.reported += e.reportedUsd ?? 0; if (e.reportedUsd == null && e.status !== 'rejected') g.unknown++;
      groups.set(label, g);
    }
    return [...groups.values()].map(g => {
      const a = articles().find(a => a.id === g.articleId), ps = a ? related(a) : [];
      const usablePins = ps.filter(p => /^[a-f0-9]{64}$/.test(p.imageQa?.sha256 || '') && p.imageQa?.visualReview?.status === 'reviewed' && p.imageQa.visualReview.imageSha256 === p.imageQa.sha256).length;
      const usableArticle = ['approved', 'published'].includes(a?.workflowStatus) && lines.find(line => line.id === a.id)?.sourceState !== 'source-changed';
      return { ...g, title: a?.generatedTitle || a?.title || 'Unassigned requests', usablePins, usableArticle: Boolean(usableArticle), costPerApprovedArticle: usableArticle ? g.reserved : null, costPerUsablePin: usablePins ? g.reserved / usablePins : null };
    });
  }
  async function execute(action, p = {}) {
    const d = get();
    switch (action) {
      case 'snapshot': {
        const metrics = store.get('trendResearch.pinterestAnalytics', {}).rows || [];
        const lines = pipeline(d);
        return { styleVersions: d.styleVersions, benchmarkCases: d.benchmarkCases, packs: d.packs, pipeline: lines, costs: costs(d, lines), spending: ledger.get().entries.map(e => ({ id: e.id, model: e.model, predictionId: e.predictionId, createdAt: e.createdAt, estimateUsd: e.estimateUsd, reportedUsd: e.reportedUsd })),
          experiments: d.experiments.map(e => experimentReport(e, metrics, pins())), metricsFetchedAt: store.get('trendResearch.pinterestAnalytics', {}).importedAt || null,
          pins: pins().map(p => ({ id: p.id, title: p.title, prompt: p.prompt || '', style: p.generationConfig?.pinStyle || p.promptStyle || '', sourceArticleId: p.articleId || '', sha256: p.imageQa?.sha256 || '', displayUrl: p.displayUrl || p.imageUrl })),
          styles: Object.entries(store.get('settings', {}).pinCreator?.customStyles || {}).map(([id, s]) => ({ id, name: s.name, prompt: s.prompt })),
          events: store.get('qualityWorkspace.events', null) };
      }
      case 'baseline': {
        const a = article(p.articleId); if (!a.content) throw new Error('Complete the article first.');
        d.baselines[a.id] = { sourceHash: hash(a.content), pins: related(a).map(p => ({ id: p.id, sha256: p.imageQa?.sha256 || '' })), recordedAt: new Date().toISOString() };
        save(d); return {};
      }
      case 'recipe-open': { const a = article(p.articleId); return { articleId: a.id, sourceHash: hash(a.content || ''), recipes: editableRecipes(a), previous: d.recipeRecords[a.id] || null }; }
      case 'recipe-save': {
        const a = article(p.articleId);
        if (p.sourceHash !== hash(a.content || '')) throw new Error('Article changed. Reopen its recipe before saving.');
        const html = renderRecipes(p.recipes), report = inspectRecipe({ ...a, content: html });
        if (report.status === 'needs-repair') throw new Error(report.issues.map(i => i.message).join(' '));
        const primary = parseRecipeCard(a.content || '');
        const candidates = selectAll('[id="recipe-card"], [id^="recipe-card-"], .recipe-card', parseDocument(a.content || '', { withStartIndices: true, withEndIndices: true }));
        if (candidates.some(c => primary.start === undefined || c.startIndex < primary.start || c.endIndex > primary.end)) throw new Error('This article has separate recipe cards. Consolidate them in the article editor before replacing the recipe record.');
        const content = primary.start !== undefined ? a.content.slice(0, primary.start) + html + a.content.slice(primary.end) : `${a.content || ''}\n${html}`;
        const previous = d.recipeRecords[a.id];
        const record = { revision: (previous?.revision || 0) + 1, recipes: p.recipes, sourceHash: hash(content), updatedAt: new Date().toISOString(), history: [...(previous?.history || []), previous ? { revision: previous.revision, recipes: previous.recipes, sourceHash: previous.sourceHash } : { revision: 0, recipes: editableRecipes(a), sourceHash: hash(a.content || '') }].slice(-20) };
        const next = { ...a, content, recipeRecord: record, structuredData: null, workflowStatus: 'needs-review', updatedAt: record.updatedAt, recipeQuality: inspectRecipe({ ...a, content }) };
        d.baselines[a.id] ||= { sourceHash: hash(a.content || ''), recordedAt: record.updatedAt };
        store.set('articles', articles().map(x => x.id === a.id ? next : x)); d.recipeRecords[a.id] = record; save(d);
        return { article: next, report: next.recipeQuality };
      }
      case 'style-save': {
        const styleId = text(p.styleId, 120), prompt = text(p.prompt, 12000), name = text(p.name, 120);
        if (!prompt || !name || !styleId) throw new Error('Choose a style, name and prompt.');
        const versions = d.styleVersions.filter(v => v.styleId === styleId);
        if (!versions.length) {
          const original = store.get('settings', {}).pinCreator?.customStyles?.[styleId];
          if (!original?.prompt) throw new Error('This style no longer exists.');
          d.styleVersions.push({ id: randomUUID(), styleId, name: `${original.name} baseline`, prompt: original.prompt, promptHash: hash(original.prompt), version: 1, locked: true, createdAt: new Date().toISOString() });
        }
        const version = { id: randomUUID(), styleId, name, prompt, promptHash: hash(prompt), version: versions.length + (versions.length ? 1 : 2), locked: true, createdAt: new Date().toISOString() };
        if (d.styleVersions.length >= 200) throw new Error('Style version limit reached. Export your workspace before adding more.');
        d.styleVersions.push(version); save(d); return version;
      }
      case 'benchmark-save': {
        const version = d.styleVersions.find(v => v.id === p.versionId), a = article(p.articleId), pin = pins().find(x => x.id === p.pinId);
        if (!version || !pin || !pin.imageQa?.sha256) throw new Error('Choose an immutable style version and a saved finished Pin.');
        const bytes = await readMedia(pin); if (hash(bytes) !== pin.imageQa.sha256) throw new Error('Artwork changed. Recheck the final image first.');
        if (hash(article(a.id).content || '') !== hash(a.content || '') || pins().find(x => x.id === pin.id)?.imageQa?.sha256 !== pin.imageQa.sha256) throw new Error('Recipe or artwork changed during review. Reopen the benchmark.');
        if (pin.generationConfig?.promptLabVersionId !== version.id || pin.generationConfig?.promptLabPromptHash !== version.promptHash) throw new Error('This image was not generated using this exact benchmark version. Send the candidate to Pin Creator first.');
        if (pin.promptLabSourceHash !== hash(a.content || '')) throw new Error('Recipe changed since this benchmark was queued. Create a new benchmark case.');
        const check = pin.imageQa.textCheck, visual = pin.imageQa.visualReview;
        const result = { id: randomUUID(), versionId: version.id, articleId: a.id, sourceHash: hash(a.content || ''), pinId: pin.id, imageHash: pin.imageQa.sha256,
          recipeStatus: inspectRecipe(a).status, textStatus: check?.imageSha256 === pin.imageQa.sha256 ? check.status : 'unchecked',
          realism: visual?.imageSha256 === pin.imageQa.sha256 && visual.status === 'reviewed' ? 'human-reviewed' : 'unchecked', note: text(p.note || '', 1000), createdAt: new Date().toISOString() };
        d.benchmarkCases = [...d.benchmarkCases, result].slice(-1000); save(d); return result;
      }
      case 'benchmark-queue': {
        const v = d.styleVersions.find(v => v.id === p.versionId), a = article(p.articleId);
        if (!v) throw new Error('Select a saved style version.');
        const url = safeUrl(a.wordpressPostUrl || a.sourceUrl); if (!url) throw new Error('The article needs a public source URL.');
        const id = randomUUID(); const pin = { id, url, articleId: a.id, queueType: 'prompt-benchmark', sourceTitle: a.generatedTitle || a.title, title: a.generatedTitle || a.title,
          description: '', prompt: v.prompt, promptStyle: v.styleId, imageSourceMode: 'generate-new', status: 'pending', promptLabVersionId: v.id, promptLabPromptHash: v.promptHash,
          promptLabPrompt: v.prompt, promptLabSourceHash: hash(a.content || ''), sourceSnapshot: { title: a.generatedTitle || a.title, recipe: { name: a.generatedTitle || a.title, ingredients: editableRecipes(a)[0]?.ingredients || [], instructions: editableRecipes(a)[0]?.instructions || [] } }, createdAt: new Date().toISOString() };
        store.set('pinCreatorPins', [...pins(), pin]); return { pin };
      }
      case 'experiment-save': {
        const name = text(p.name, 120);
        if (!name || !Array.isArray(p.variants) || p.variants.length < 2 || p.variants.length > 6) throw new Error('Choose 2 to 6 distinct saved Pins.');
        const ids = new Set(), localIds = new Set();
        const variants = p.variants.map(v => { const pin = pins().find(x => x.id === v.pinId); const remotePinId = text(v.remotePinId, 120); if (!pin?.localPath || !pin.imageQa?.sha256 || !/^\d+$/.test(remotePinId) || ids.has(remotePinId) || localIds.has(pin.id)) throw new Error('Each variant needs a different finished Pin and real Pinterest Pin ID.'); ids.add(remotePinId); localIds.add(pin.id); return { pinId: pin.id, remotePinId, style: pin.generationConfig?.pinStyle || pin.promptStyle, label: pin.title, sha256: pin.imageQa.sha256 }; });
        const experiment = { id: randomUUID(), name, variants, createdAt: new Date().toISOString() }; d.experiments = [...d.experiments, experiment].slice(-200); save(d); return experiment;
      }
      case 'cost-link': {
        article(p.articleId); if (!ledger.get().entries.some(e => e.id === p.requestId)) throw new Error('Unknown generation request.');
        d.costLinks[p.requestId] = { articleId: p.articleId, evidence: text(p.evidence, 500), linkedAt: new Date().toISOString() }; save(d); return {};
      }
      case 'reuse-pin': {
        const source = pins().find(x => x.id === p.pinId); article(p.articleId);
        if (!source?.localPath || !source.imageQa?.sha256) throw new Error('Choose an existing finished local Pin.');
        const target = article(p.articleId), expected = identity(target.wordpressPostUrl || target.sourceUrl);
        if (!expected || identity(source.url) !== expected) throw new Error('Reuse is limited to the same destination recipe.');
        const bytes = await readMedia(source); if (hash(bytes) !== source.imageQa.sha256) throw new Error('Saved image bytes changed.');
        return { pinId: source.id, reused: true, additionalGenerationCost: 0 };
      }
      case 'pack-export': {
        if (!Array.isArray(p.ids) || !p.ids.length || p.ids.length > 7) throw new Error('Choose 1 to 7 articles for the weekly pack.');
        const selected = [...new Set(p.ids)].map(article);
        const reports = selected.map(a => inspectRecipe(a));
        if (reports.some(r => r.status === 'needs-repair' || !r.recipes.length)) throw new Error('Repair incomplete recipes before exporting the pack.');
        const name = text(p.name || 'Weekly Recipe Pack', 120), multiplier = Number(p.multiplier ?? 1);
        const cards = selected.map((a, i) => `<article><h2>Day ${i + 1}: ${escape(a.generatedTitle || a.title)}</h2>${reports[i].recipes.map(r => renderRecipes([{ name: r.name, facts: { ...r.facts, Servings: r.facts.Servings || r.facts.Yield }, ingredients: r.ingredients.map(i => i.original), instructions: r.instructions }]).replace('id="recipe-card"', `id="pack-${i}-${randomUUID()}"`)).join('')}${safeUrl(a.wordpressPostUrl) ? `<p><a href="${escape(safeUrl(a.wordpressPostUrl))}">Full recipe and cooking notes</a></p>` : ''}</article>`).join('');
        const shopping = selectAll('ul', parseDocument(shoppingHtml(selected, multiplier))).map(node => getOuterHTML(node)).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(name)}</title><style>body{font:16px system-ui;max-width:850px;margin:auto;padding:24px;line-height:1.6}article{break-inside:avoid;border-bottom:1px solid #ddd;padding-block:24px}h1{font-size:28px}h2{font-size:22px}li{margin-block:8px}@media print{a{color:inherit}}</style></head><body><h1>${escape(name)}</h1><p>Shopping quantities use multiplier ${escape(multiplier)}. Recipe cards retain their original servings and cooking times. Check portions and cook safely.</p>${cards}<h2>Combined Shopping List</h2>${shopping}</body></html>`;
        const result = await saveFile('weekly-recipe-pack.html', Buffer.from(html), [{ name: 'Printable Recipe Pack', extensions: ['html'] }]);
        if (!result.canceled) { d.packs = [{ id: randomUUID(), name, ids: selected.map(a => a.id), hashes: selected.map(a => hash(a.content || '')), createdAt: new Date().toISOString() }, ...d.packs].slice(0, 200); save(d); }
        return result;
      }
      default: throw new Error('Unknown content operation.');
    }
  }
  let pending = Promise.resolve();
  return { run: (action, params) => {
    if (['snapshot', 'recipe-open'].includes(action)) return execute(action, params);
    const result = pending.then(() => execute(action, params)); pending = result.catch(() => {}); return result;
  } };
}
module.exports = { createContentOperations, renderRecipes, editableRecipes, experimentReport, hash };
