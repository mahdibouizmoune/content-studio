'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { parseDocument } = require('htmlparser2');
const { selectAll } = require('css-select');
const { textContent } = require('domutils');
const { inspectRecipe, shoppingList } = require('./recipe-quality');
const { assessEditorialGaps } = require('./article-editorial');
const digest = value => createHash('sha256').update(String(value || '')).digest('hex');
const normalize = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const plain = html => normalize(textContent(parseDocument(String(html || ''))));
const title = a => a.generatedTitle || a.title || 'Untitled article';
const KINDS = new Set(['kitchen-test', 'substitution', 'allergen', 'appliance', 'leftover', 'unit-conversion', 'reader-outcome']);
function bounded(value, max = 2000) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`Enter text of at most ${max} characters.`);
  return value.trim();
}
function httpUrl(value) {
  if (!value) return '';
  const u = new URL(value);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new Error('Use an HTTP or HTTPS reference without credentials.');
  return u.href;
}
function roundupCoverage(article, report = inspectRecipe(article)) {
  const doc = parseDocument(article.content || '');
  const promises = [...title(article).matchAll(/\b(\d{1,2})\s+(?:(?:quick|easy|delicious|simple|best|cozy|flavorful|healthy|fall|lunch|dinner)\s+)*(?:recipes?|ideas?|ways|meals|results|dinners|lunches|soups|snacks|tips)\b/gi)].map(m => Number(m[1]));
  const expected = promises.length === 1 ? promises[0] : null;
  const cards = report.recipes.map((r, i) => ({ number: i + 1, name: r.name, coverage: 'visible-recipe' }));
  const links = selectAll('a[href]', doc).flatMap(node => {
    const label = normalize(textContent(node));
    if (!/^\d+[.)]\s+/.test(label)) return [];
    try { return [{ number: Number(label.match(/^\d+/)[0]), name: label, url: httpUrl(new URL(node.attribs.href, article.wordpressPostUrl || article.sourceUrl).href), coverage: 'linked-recipe-needs-review' }]; } catch { return []; }
  });
  // Linked headings remain review candidates, not proof that the destination contains a full recipe.
  return { expected, visible: cards.length, status: expected == null ? 'not-numbered' : cards.length >= expected ? 'visible-coverage' : 'needs-review', items: [...cards, ...links] };
}
function recipeReport(article, records = [], promises = [], pins = []) {
  const hash = digest(article.content), structural = inspectRecipe(article), editorial = assessEditorialGaps(article.content);
  const notes = records.map(r => ({ ...r, revisionState: r.sourceHash === hash ? 'current' : 'recipe-changed' }));
  const claims = promises.map(p => ({ ...p, state: p.sourceHash !== hash ? 'recipe-changed' : !pins.some(pin => pin.id === p.pinId && pin.imageQa?.sha256 === p.imageHash) ? 'artwork-changed' : 'evidence-recorded' }));
  return { articleId: article.id, title: title(article), sourceHash: hash, structural, editorial, coverage: roundupCoverage(article, structural), notes, claims,
    shots: structural.recipes.flatMap(r => [{ subject: r.name, shot: 'Finished dish', detail: `Show the actual serving and ingredients: ${r.ingredients.slice(0, 5).map(i => i.original).join('; ')}` }, ...r.instructions.slice(0, 8).map((step, i) => ({ subject: r.name, shot: `Step ${i + 1}`, detail: step }))]),
    impact: { pins: pins.map(p => ({ id: p.id, title: p.title, requiresReview: claims.some(c => c.pinId === p.id && c.state !== 'evidence-recorded') })), automaticRepublishing: false },
    caution: 'Structural checks and user notes do not prove taste, nutrition, testing or allergen safety.' };
}
function planningReport(articles, multiplier = 1) {
  if (articles.some(a => { const report = inspectRecipe(a); return report.status === 'needs-repair' || !report.recipes.length; })) throw new Error('Repair incomplete recipes before planning meals.');
  const shopping = shoppingList(articles, multiplier);
  const shared = shopping.filter(i => new Set(i.sources.map(s => `${s.articleId}:${s.recipeIndex}`)).size > 1);
  return { articles: articles.map(a => ({ id: a.id, title: title(a) })), multiplier: Number(multiplier), shopping, shared,
    warnings: ['Scale ingredient quantities only. Cooking, chilling and fermentation times are not multiplied.', 'Check pan capacity, batch size, heat transfer and leavening before changing servings.', 'Ingredient overlap is not a storage-safety assessment or a price estimate.'],
    conversions: 'Units are preserved. Volume-to-weight conversions require ingredient-specific measured evidence.' };
}
function deliverySummary(batches = []) {
  return batches.map(b => {
    const counts = { selected: b.selectedRowCount ?? null, rejected: b.rejectedRows?.length ?? null, planned: b.rows.length, written: ['ready', 'saved'].includes(b.fileStatus) ? b.rows.length : null, confirmed: 0, failed: 0, unknown: 0, review: 0 };
    for (const r of b.rows) {
      const status = b.outcomes?.[r.number]?.status;
      counts[status === 'confirmed' ? 'confirmed' : status === 'failed' ? 'failed' : status === 'review' ? 'review' : 'unknown']++;
    }
    return { id: b.id, createdAt: b.createdAt, fileStatus: b.fileStatus, ...counts };
  });
}
function assetLeases(batches = [], now = Date.now()) {
  const assets = new Map();
  for (const b of batches) for (const r of b.rows) {
    const pinId = r.pinId, old = assets.get(pinId) || { pinId, protected: false, reasons: [], latestUse: 0 };
    const state = b.outcomes?.[r.number]?.status || 'unknown';
    const scheduled = r.cells?.[6];
    const at = Date.parse(scheduled ? /Z$|[+-]\d{2}:\d{2}$/.test(scheduled) ? scheduled : `${scheduled}Z` : b.createdAt);
    if (!['confirmed', 'failed'].includes(state)) { old.protected = true; old.reasons.push('Import result unresolved'); }
    if (at > now) { old.protected = true; old.reasons.push('Future scheduled import'); }
    old.latestUse = Math.max(old.latestUse, Number.isFinite(at) ? at : now); assets.set(pinId, old);
  }
  return [...assets.values()].map(a => ({ ...a, reasons: [...new Set(a.reasons)], reviewAfter: new Date(a.latestUse + 7 * 86400000).toISOString(), automaticDeletion: false }));
}
function createRecipeEvidence({ store, saveFile, now = Date.now }) {
  const get = () => ({ notes: [], promises: [], deadlines: [], decisions: [], ...store.get('contentOperations.evidence', {}) });
  const save = d => store.set('contentOperations.evidence', d);
  const articles = () => store.get('articles', []);
  const pins = () => store.get('pinCreatorPins', []);
  const article = id => { const a = articles().find(a => a.id === id); if (!a) throw new Error('Choose a saved article.'); return a; };
  const related = a => pins().filter(p => p.articleId === a.id || p.sourceSnapshot?.articleId === a.id);
  const stamp = () => new Date(now()).toISOString();
  function incident() {
    const batches = deliverySummary(store.get('pinterestDelivery.batches', []));
    return { schemaVersion: 1, counts: { articles: articles().length, pins: pins().length },
      // Job Center stores newest first.
      batches, jobs: store.get('jobCenterJobs', []).slice(0, 100).map(j => ({ id: j.id, type: j.type, status: j.status })),
      environment: { node: process.versions.node, icu: process.versions.icu, tz: process.versions.tz },
      redaction: 'No settings, credentials, article text, local paths, media URLs, receipt bodies or user-entered error text included.' };
  }
  async function run(action, p = {}) {
    const d = get();
    if (action === 'snapshot') {
      const batches = store.get('pinterestDelivery.batches', []), jobs = store.get('jobCenterJobs', []);
      return { deadlines: d.deadlines.map(x => ({ ...x, stale: articleExistsChanged(x), overdue: Date.parse(x.dueAt) < now() })),
        attribution: require('./reader-attribution').readerAttribution({ settings: store.get('settings', {}), analytics: store.get('trendResearch.googleAnalytics', null), events: store.get('qualityWorkspace.events', null), batches, now: now() }),
        decisions: d.decisions.map(x => ({ ...x, state: Date.parse(x.reviewAt) < now() || articleExistsChanged(x) ? 'review-due' : 'current' })),
        delivery: deliverySummary(batches), assets: assetLeases(batches, now()),
        jobs: jobs.filter(j => ['failed', 'interrupted', 'error', 'needs-review', 'running', 'cancelling', 'queued', 'pending', 'paused'].includes(j.status)).map(j => ({ id: j.id, title: j.title || j.label || j.type || 'Background job', status: j.status, updatedAt: j.updatedAt })),
        capabilities: [
          { name: 'Timezone database', state: require('./timezone-data').hasCurrentMoroccoRules() ? 'current-morocco-rules' : 'update-needed', detail: `Runtime tzdata ${process.versions.tz || 'unknown'}. Outdated Morocco conversions are blocked; explicit UTC remains available.` },
          { name: 'Pinterest CSV', state: 'available', detail: 'No developer account required; import results remain unknown until confirmed.' },
          { name: 'Recipe evidence and planning', state: 'available', detail: 'Local checks; no paid generation request.' },
          { name: 'Pinterest API', state: Object.keys(store.get('pinterestConnections', {})).length ? 'configured' : 'not-connected', detail: 'Approved access and actual granted permissions still required.' },
          { name: 'Hosted worker', state: store.get('qualityWorkerSigningSecret', '') ? 'paired' : 'not-paired', detail: 'No server is deployed by this desktop workspace.' },
          { name: 'Team roles and tenant isolation', state: 'not-configured', detail: 'Local brand presets are not a multi-user authorization boundary.' }
        ], evidenceCount: d.notes.length, claimCount: d.promises.length };
    }
    if (action === 'article') { const a = article(p.articleId); return recipeReport(a, d.notes.filter(n => n.articleId === a.id), d.promises.filter(n => n.articleId === a.id), related(a)); }
    if (action === 'note-save') {
      const a = article(p.articleId);
      if (p.sourceHash !== digest(a.content)) throw new Error('Article changed. Reopen before adding evidence.');
      if (!KINDS.has(p.kind)) throw new Error('Choose an evidence category.');
      const note = bounded(p.note), evidence = bounded(p.evidence), author = bounded(p.author || '', 120);
      if (!note || !evidence) throw new Error('Enter an observation and its supporting evidence.');
      if (p.kind === 'kitchen-test' && !author) throw new Error('Name the actual recipe tester.');
      const target = p.relatedArticleId ? article(p.relatedArticleId) : null;
      if (p.kind === 'leftover' && !target) throw new Error('Choose a real next-meal recipe.');
      if (d.notes.length >= 2000) throw new Error('Evidence notebook limit reached.');
      const record = { id: randomUUID(), articleId: a.id, sourceHash: digest(a.content), kind: p.kind, note, evidence, author,
        referenceUrl: httpUrl(p.referenceUrl), relatedArticleId: target?.id || '', status: 'user-provided-not-independently-verified', createdAt: stamp() };
      d.notes.push(record); save(d); return record;
    }
    if (action === 'promise-save') {
      const a = article(p.articleId), pin = related(a).find(pin => pin.id === p.pinId);
      const claim = bounded(p.claim, 300), evidence = bounded(p.evidence);
      if (p.sourceHash !== digest(a.content)) throw new Error('Recipe changed. Reopen before recording a claim.');
      if (!pin?.imageQa?.sha256 || !claim || !evidence) throw new Error('Choose a finished related Pin, its displayed claim and exact recipe evidence.');
      if (!plain(a.content).toLowerCase().includes(normalize(evidence).toLowerCase())) throw new Error('The evidence must be an exact excerpt from this recipe.');
      if (d.promises.length >= 2000) throw new Error('Claim manifest limit reached.');
      const r = { id: randomUUID(), pinId: pin.id, articleId: a.id, sourceHash: digest(a.content), imageHash: pin.imageQa.sha256, claim, evidence, createdAt: stamp() };
      d.promises.push(r); save(d); return r;
    }
    if (action === 'planning') {
      if (!Array.isArray(p.ids) || !p.ids.length || p.ids.length > 7) throw new Error('Choose 1 to 7 articles.');
      return planningReport([...new Set(p.ids)].map(article), Number(p.multiplier ?? 1));
    }
    if (action === 'deadline-save' || action === 'decision-save') {
      const a = article(p.articleId), field = action === 'deadline-save' ? 'deadlines' : 'decisions';
      const date = Date.parse(p.dueAt || p.reviewAt), label = bounded(p.label, 300), evidence = bounded(p.evidence || '');
      if (!label || !Number.isFinite(date) || date <= now() || date > now() + 366 * 86400000) throw new Error('Choose a title and a future review date within one year.');
      if (field === 'decisions' && !evidence) throw new Error('A decision needs supporting evidence.');
      if (d[field].length >= 1000) throw new Error('Review record limit reached.');
      const r = { id: randomUUID(), articleId: a.id, title: title(a), label, evidence, sourceHash: digest(a.content), [field === 'deadlines' ? 'dueAt' : 'reviewAt']: new Date(date).toISOString(), createdAt: stamp() };
      d[field].push(r); save(d); return r;
    }
    if (action === 'record-delete') {
      if (!['notes', 'promises', 'deadlines', 'decisions'].includes(p.collection)) throw new Error('Unknown record collection.');
      d[p.collection] = d[p.collection].filter(r => r.id !== p.id); save(d); return {};
    }
    if (action === 'incident-preview') { const report = incident(); return { report, fingerprint: digest(JSON.stringify(report)) }; }
    if (action === 'incident-export') {
      const report = incident(); if (p.fingerprint !== digest(JSON.stringify(report))) throw new Error('Diagnostics changed. Preview the bundle again before exporting.');
      return saveFile('content-studio-incident.json', Buffer.from(JSON.stringify(report, null, 2)), [{ name: 'Sanitized diagnostics', extensions: ['json'] }]);
    }
    throw new Error('Unknown evidence operation.');
  }
  function articleExistsChanged(r) { const a = articles().find(a => a.id === r.articleId); return !a || digest(a.content) !== r.sourceHash; }
  return { run };
}
module.exports = { createRecipeEvidence, recipeReport, planningReport, deliverySummary, assetLeases, roundupCoverage };
