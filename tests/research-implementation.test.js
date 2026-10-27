const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecipeEvidence, planningReport, recipeReport, assetLeases } = require('../electron/recipe-evidence');
const { renderRecipes, hash } = require('../electron/content-operations');
const { createPinWorkspace } = require('../electron/pin-workspace');
const { createQualityWorkspace } = require('../electron/quality-workspace');
const { assertArticleSource, assertArticleRedirect } = require('../electron/source-policy');
const { postPublishChecks } = require('../electron/post-publish-qa');
const { aggregateReport } = require('../electron/google-analytics');
const { serializePinterestCsv, validatePinterestRows } = require('../electron/pinterest-export');
const recipe = { name: 'Lemon Rice', facts: { 'Prep Time': '5 minutes', 'Cook Time': '15 minutes', 'Total Time': '20 minutes', Servings: '4' }, ingredients: ['1 cup rice', '2 cups water', '1 tbsp lemon juice'], instructions: ['Combine rice and water in a saucepan.', 'Simmer for 15 minutes until rice is tender.', 'Stir in lemon juice until evenly combined.'] };
function fixture() {
  const data = { articles: [{ id: 'a', title: 'Lemon Rice', content: renderRecipes([recipe]) }], pinCreatorPins: [{ id: 'p', title: 'Rice', articleId: 'a', imageQa: { sha256: hash('image') } }] };
  const store = { get: (key, fallback) => structuredClone(key.split('.').reduce((o, k) => o?.[k], data) ?? fallback), set: (key, value) => { const parts = key.split('.'); let o = data; for (const k of parts.slice(0, -1)) o = o[k] ||= {}; o[parts.at(-1)] = structuredClone(value); } };
  let file;
  const service = createRecipeEvidence({ store, saveFile: async (name, bytes) => { file = { name, bytes }; return { path: name }; }, now: () => Date.parse('2026-10-19T12:00Z') });
  return { data, store, service, file: () => file };
}
test('required recipe cards, repeated content links and leaked editorial prompts cannot score as valid', async () => {
  const { buildArticleQualityReport } = await import('../src/lib/articleQuality.mjs');
  const report = buildArticleQualityReport({ recipeCardEnabled: true, content: '<p>Deliver a complete, realistic recipe with ingredient roles, exact method.</p><a href="/rice">Rice</a><a href="https://example.com/rice#card">More rice</a>', internalLinks: [{ url: '/rice' }] }, { site: { url: 'https://example.com' } });
  assert.ok(report.categories.find(c => c.id === 'recipe').score < 100);
  assert.ok(report.blockers.some(i => i.id === 'missing-recipe-card'));
  assert.ok(report.blockers.some(i => i.id === 'prompt-leak'));
  assert.ok(report.warnings.some(i => i.id === 'duplicate-internal-links'));
  const once = buildArticleQualityReport({ recipeCardEnabled: false, content: '<a href="/rice">Rice</a>', internalLinks: [{ url: '/rice' }] }, { site: { url: 'https://example.com' } });
  assert.ok(!once.warnings.some(i => i.id === 'duplicate-internal-links'));
});
test('CSV preserves exact multilingual board identity and UTF-8 round trips', () => {
  for (const board of ['D\u00e9jeuners fran\u00e7ais', '\u0648\u0635\u0641\u0627\u062a', '\u65e5\u672c\u6599\u7406']) {
    const row = ['Caf\u00e9', 'https://images.example/p.jpg', board, '', 'Cr\u00e8me', '', '', 'caf\u00e9'];
    assert.equal(validatePinterestRows([row], [board]).valid, true);
    assert.equal(require('csv-parse/sync').parse(serializePinterestCsv([row]))[1][2], board);
    assert.equal(validatePinterestRows([row], ['Other']).valid, false);
  }
});
test('Pinterest page and redirect extraction is fenced without blocking original recipe websites', () => {
  for (const url of ['https://pinterest.com/pin/1', 'https://uk.pinterest.com/pin/1', 'https://pinterest.co.uk/pin/1', 'https://pin.it/abc', 'https://i.pinimg.com/a.jpg']) assert.throws(() => assertArticleSource(url), /extraction is disabled/);
  assert.throws(() => assertArticleRedirect({ protocol: 'https:', hostname: 'www.pinterest.com', path: '/pin/1' }), /extraction/);
  assert.equal(assertArticleSource('https://recipes.example/pinterest-recipe'), 'https://recipes.example/pinterest-recipe');
});
test('API profiles, board responses and research stay in memory; original CSV profiles remain durable', async () => {
  const f = fixture();
  f.store.set('pinWorkspace', { accounts: [{ id: 'pinterest:1', connected: true, username: 'remote', profile: { about: 'private' }, boards: [{ id: 'remote' }] }, { id: 'csv:1', csvOnly: true, username: 'My label', boards: [{ id: 'manual' }] }], research: [{ accountId: 'pinterest:1', rows: ['legacy'] }], audits: [{ profile: 'legacy' }] });
  const w = createPinWorkspace({ store: f.store, provider: { research: async () => ({ available: true, rows: [{ keyword: 'rice' }] }) } });
  assert.equal(w.get().accounts[0].profile, undefined); assert.equal(f.store.get('pinWorkspace').research.length, 0);
  const d = w.get(); Object.assign(d.accounts[0], { username: 'remote', profile: { about: 'remote' }, boards: [{ id: 'new' }] }); w.save(d);
  assert.equal(w.get().accounts[0].boards[0].id, 'new'); assert.equal(f.store.get('pinWorkspace').accounts[0].boards, undefined);
  await w.research({ accountId: 'pinterest:1' }); assert.equal(w.get().research[0].rows[0].keyword, 'rice'); assert.deepEqual(f.store.get('pinWorkspace').research, []);
  assert.equal(f.store.get('pinWorkspace').accounts[1].boards[0].id, 'manual');
  assert.equal(createPinWorkspace({ store: f.store, provider: {} }).get().accounts[0].boards, undefined);
});
test('evidence requires actual tester identification, revision consistency and never asserts independent validation', async () => {
  const f = fixture(), opened = await f.service.run('article', { articleId: 'a' });
  const p = { articleId: 'a', sourceHash: opened.sourceHash, kind: 'kitchen-test', note: 'Rice was tender.', evidence: 'Cooked the saved recipe in a saucepan.' };
  await assert.rejects(f.service.run('note-save', p), /actual recipe tester/);
  const note = await f.service.run('note-save', { ...p, author: 'Recipe owner' });
  assert.equal(note.status, 'user-provided-not-independently-verified');
  f.data.articles[0].content += '<p>New yield.</p>';
  assert.equal((await f.service.run('article', { articleId: 'a' })).notes[0].revisionState, 'recipe-changed');
  await assert.rejects(f.service.run('note-save', { ...p, author: 'Owner' }), /Article changed/);
});
test('Pin promise manifest needs exact current recipe evidence and invalidates changed artwork or recipes', async () => {
  const f = fixture(), r = await f.service.run('article', { articleId: 'a' });
  const p = { articleId: 'a', sourceHash: r.sourceHash, pinId: 'p', claim: '20-minute rice', evidence: 'Total Time: 20 minutes' };
  await assert.rejects(f.service.run('promise-save', { ...p, evidence: 'Tested ten times' }), /exact excerpt/);
  await f.service.run('promise-save', p);
  assert.equal((await f.service.run('article', { articleId: 'a' })).claims[0].state, 'evidence-recorded');
  f.data.pinCreatorPins[0].imageQa.sha256 = hash('new');
  assert.equal((await f.service.run('article', { articleId: 'a' })).claims[0].state, 'artwork-changed');
  f.data.articles[0].content += '<p>Changed recipe.</p>';
  assert.equal((await f.service.run('article', { articleId: 'a' })).claims[0].state, 'recipe-changed');
});
test('roundup and shot planner use visible recipes, not a headline or made-up image result', () => {
  const f = fixture(); f.data.articles[0].title = '7 Quick Lunch Ideas';
  const r = recipeReport(f.data.articles[0]); assert.equal(r.coverage.status, 'needs-review'); assert.equal(r.coverage.expected, 7); assert.equal(r.coverage.visible, 1);
  assert.ok(r.shots.some(s => s.detail === recipe.instructions[1])); assert.equal(r.impact.automaticRepublishing, false);
});
test('meal planning scales only known quantities, preserves units and reports nonlinear cooking limits', () => {
  const f = fixture(); const plan = planningReport([...f.data.articles, { ...f.data.articles[0], id: 'b', title: 'Other Rice' }], 2);
  assert.equal(plan.shopping.find(i => i.description === 'rice').quantity, 4);
  assert.ok(plan.shared.length); assert.ok(plan.warnings.some(w => /not multiplied/.test(w)));
  assert.throws(() => planningReport(f.data.articles, 0), /multiplier/);
  assert.equal(planningReport([{ ...f.data.articles[0], title: 'A Different Long Rice Headline' }]).shared.length, 0);
});
test('leftover pathways require real saved destinations and do not invent storage rules', async () => {
  const f = fixture(), r = await f.service.run('article', { articleId: 'a' });
  const p = { articleId: 'a', sourceHash: r.sourceHash, kind: 'leftover', note: 'Next meal', evidence: 'Owner planning note' };
  await assert.rejects(f.service.run('note-save', p), /real next-meal/);
  await assert.rejects(f.service.run('note-save', { ...p, relatedArticleId: 'missing' }), /saved article/);
});
test('internal review deadlines do not change publishing schedules and decisions expire with evidence', async () => {
  const f = fixture(); f.data.articles[0].scheduledAt = '2026-10-20T13:00Z';
  const p = { articleId: 'a', label: 'Review serving promise', dueAt: '2026-10-20T12:00Z' };
  await f.service.run('deadline-save', p);
  await assert.rejects(f.service.run('decision-save', p), /supporting evidence/);
  await f.service.run('decision-save', { ...p, evidence: 'Actual recipe notes' });
  assert.equal(f.data.articles[0].scheduledAt, '2026-10-20T13:00Z');
  f.data.articles[0].content += 'revised';
  assert.equal((await f.service.run('snapshot')).decisions[0].state, 'review-due');
});
test('unresolved and future imports protect image leases; missing results never imply success', async () => {
  const f = fixture(), b = { id: 'b', createdAt: '2026-10-01T00:00Z', fileStatus: 'ready', rows: [{ number: 1, pinId: 'p', cells: ['', '', '', '', '', '', '2026-10-21T13:00:00'] }, { number: 2, pinId: 'q', cells: [] }], outcomes: { 1: { status: 'confirmed' } } };
  f.store.set('pinterestDelivery.batches', [b]); const r = await f.service.run('snapshot');
  assert.equal(r.delivery[0].confirmed, 1); assert.equal(r.delivery[0].unknown, 1);
  assert.equal(r.delivery[0].written, 2);
  assert.equal(require('../electron/recipe-evidence').deliverySummary([{ ...b, fileStatus: 'partial' }])[0].written, null);
  assert.ok(assetLeases([b], Date.parse('2026-10-19T00:00Z')).every(a => a.protected));
});
test('incident bundle is allowlisted, preview-bound and contains no text, credentials, media paths or receipt bodies', async () => {
  const f = fixture(); f.store.set('settings', { replicateApiKey: 'never-export-token' }); f.data.articles[0].content += 'never-export-content';
  f.store.set('jobCenterJobs', [{ id: 'j', status: 'failed', error: 'never-export-token', localPath: 'C:\\secrets' }]);
  const r = await f.service.run('incident-preview'); assert.doesNotMatch(JSON.stringify(r.report), /never-export|C:\\secrets/);
  await assert.rejects(f.service.run('incident-export', { fingerprint: 'stale' }), /Preview/);
  await f.service.run('incident-export', { fingerprint: r.fingerprint }); assert.equal(f.file().name, 'content-studio-incident.json');
});
test('model readiness validates names, only calls metadata and reports zero predictions', async () => {
  let calls = 0;
  const q = createQualityWorkspace({ store: fixture().store, readModelMetadata: async () => { calls++; return { latest_version: { id: 'v1', openapi_schema: { components: { schemas: { Input: { properties: { prompt: {} }, required: ['prompt'] } } } } } }; } });
  await assert.rejects(q.run('model-readiness', { model: 'owner/model/../../predictions' }), /owner\/model/);
  const r = await q.run('model-readiness', { model: 'owner/model' }); assert.equal(r.paidPredictionsSubmitted, 0); assert.equal(calls, 1); assert.deepEqual(r.requiredInputs, ['prompt']);
});
test('zero serving multiplier is rejected in the older shopping-list workflow', async () => {
  const q = createQualityWorkspace({ store: fixture().store, saveFile: async () => { throw new Error('Must not write'); } });
  await assert.rejects(q.run('shopping-list', { ids: ['a'], multiplier: 0 }), /multiplier/);
});
test('post-publish QA ignores external and navigation links and detects prompt leakage', () => {
  const html = '<nav><a href="/x">Home</a><a href="/y">About</a></nav><article><p>Deliver a complete, realistic recipe with ingredient roles.</p><a href="https://outside.example/x">External</a></article>';
  const r = postPublishChecks({ html, url: 'https://example.com/rice', status: 200 });
  assert.equal(r.checks.find(c => c.id === 'internal-links').ok, false); assert.equal(r.checks.find(c => c.id === 'reader-copy').ok, false);
});
test('Pinterest engagement totals do not mix Google search sessions into Pinterest retention', () => {
  const report = { dimensionHeaders: ['landingPagePlusQueryString', 'sessionSourceMedium'].map(name => ({ name })), metricHeaders: ['sessions', 'engagedSessions', 'userEngagementDuration'].map(name => ({ name })), rows: [['pinterest / social', 10, 8, 200], ['google / organic', 100, 50, 4000]].map(([source, ...values]) => ({ dimensionValues: [{ value: '/rice' }, { value: source }], metricValues: values.map(value => ({ value: String(value) })) })) };
  const page = [...aggregateReport(report, 'https://example.com').values()][0];
  assert.equal(page.pinterestSessions, 10); assert.equal(page.pinterestEngagedSessions, 8); assert.equal(page.pinterestEngagementSeconds, 200); assert.equal(page.sessions, 110);
});

test('WordPress archive is read-only, sanitized, revision-aware and duplicate-safe', async () => {
  const { createWordPressArchive } = require('../electron/wordpress-archive');
  const f = fixture(); f.store.set('settings', { wordpressSites: [{ id: 'site', url: 'https://example.com', username: 'private-name', apiKey: 'private-secret' }] });
  let content = '<p>Useful rice notes.</p><img src="https://example.com/rice.jpg" alt="Rice"><script>alert(1)</script>' + renderRecipes([recipe]);
  const service = createWordPressArchive({ store: f.store, readArchive: async p => { assert.equal(p.siteId, 'site'); return { posts: [{ id: 42, status: 'publish', link: 'https://example.com/rice', title: { rendered: 'Lemon Rice' }, content: { rendered: content }, modified_gmt: '2026-10-19T12:00:00' }], totalPages: 1 }; } });
  await service.run('sync', { siteId: 'site' }); let snap = await service.run('snapshot');
  assert.equal(snap.posts.length, 1); assert.equal(snap.posts[0].images[0].alt, 'Rice'); assert.doesNotMatch(JSON.stringify(snap), /private-secret|private-name|alert\(1\)/);
  const r = await service.run('import', { key: snap.posts[0].key }); assert.equal(r.duplicate, false);
  const imported = f.data.articles.find(a => a.id === r.articleId); assert.doesNotMatch(imported.content, /<script/);
  content += '<p>New revision.</p>'; await service.run('sync', { siteId: 'site' });
  assert.equal((await service.run('snapshot')).posts.length, 1);
  assert.equal((await service.run('import', { key: snap.posts[0].key })).duplicate, true);
  assert.doesNotMatch(f.data.articles.find(a => a.id === r.articleId).content, /New revision/);
  await service.run('remove', { key: snap.posts[0].key }); snap = await service.run('snapshot'); assert.equal(snap.posts.length, 0); assert.equal(f.data.articles.length, 2);
});

test('archive identity validation rejects drafts, foreign sites, missing revisions and credential URLs', () => {
  const { cleanPost } = require('../electron/wordpress-archive');
  const site = { id: 'site', url: 'https://example.com' }, post = { id: 1, status: 'publish', link: 'https://example.com/rice', title: { rendered: 'Rice' }, content: { rendered: '<p>Rice</p>' }, modified_gmt: '2026-10-19T12:00:00' };
  for (const change of [{ status: 'draft' }, { link: 'https://foreign.example/rice' }, { modified_gmt: '' }, { link: 'https://secret@example.com/rice' }]) assert.throws(() => cleanPost({ ...post, ...change }, site));
});

test('creative attribution joins exact CSV tracking IDs and excludes other or unknown-source recipe actions', () => {
  const { readerAttribution } = require('../electron/reader-attribution');
  const config = { propertyId: '123', siteUrl: 'https://example.com', fetchedAt: '2026-10-19T12:00:00Z' };
  const r = readerAttribution({ now: Date.parse(config.fetchedAt), settings: { googleAnalyticsPropertyId: '123', googleAnalyticsSiteUrl: config.siteUrl },
    analytics: { ...config, creatives: [{ url: 'https://example.com/rice', creative: 'pin_p', sessions: 12, engagedSessions: 8 }] },
    events: { ...config, rows: [{ path: '/rice', creative: 'pin_p', event: 'cs_recipe_print', channel: 'pinterest', count: 3 }, { path: '/rice', creative: 'pin_p', event: 'cs_recipe_save', channel: 'other', count: 100 }, { path: '/rice', creative: '', event: 'cs_recipe_view', count: 4 }] },
    batches: [{ rows: [{ pinId: 'p', cells: ['', '', '', '', '', 'https://example.com/rice?utm_content=pin_p&utm_source=pinterest'] }] }] });
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].pinId, 'p'); assert.equal(r.rows[0].sessions, 12); assert.deepEqual(r.rows[0].events, { cs_recipe_print: 3 });
  assert.ok(r.gaps.some(g => /unknown traffic source/.test(g))); assert.equal(r.rows[0].conversionRate, undefined);
});

test('a disconnected account cannot be repopulated by an in-flight research response', async () => {
  const f = fixture(); f.store.set('pinWorkspace', { accounts: [{ id: 'pinterest:1', connected: true }] });
  let release;
  const w = createPinWorkspace({ store: f.store, provider: { research: () => new Promise(resolve => { release = resolve; }) } });
  const pending = w.research({ accountId: 'pinterest:1' });
  const d = w.get(); d.accounts[0].connected = false; w.save(d);
  release({ available: true, rows: [{ keyword: 'must-not-be-cached' }] });
  const r = await pending; assert.equal(r.available, false); assert.deepEqual(r.rows, []); assert.deepEqual(w.get().research, []);
});

test('Review Desk lists restart-interrupted jobs and diagnostics keep the newest Job Center records', async () => {
  const f = fixture();
  // Job Center stores newest first.
  f.data.jobCenterJobs = Array.from({ length: 150 }, (_, i) => ({ id: `job-${i}`, type: 'wordpress', label: 'WordPress publishing', status: i === 0 ? 'interrupted' : 'completed', updatedAt: new Date(Date.parse('2026-10-19T11:00Z') - i * 60000).toISOString() }));
  const snapshot = await f.service.run('snapshot');
  assert.deepEqual(snapshot.jobs.map(j => [j.id, j.title, j.status]), [['job-0', 'WordPress publishing', 'interrupted']]);
  const { report } = await f.service.run('incident-preview');
  assert.equal(report.jobs.length, 100); assert.equal(report.jobs[0].id, 'job-0'); assert.equal(report.jobs.at(-1).id, 'job-99');
});
