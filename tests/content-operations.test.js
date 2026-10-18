const test = require('node:test');
const assert = require('node:assert/strict');
const { createContentOperations, renderRecipes, experimentReport, hash } = require('../electron/content-operations');
const { inspectRecipe, shoppingList } = require('../electron/recipe-quality');
const { buildPerformanceScheduleProfile, nextPerformanceSlots } = require('../electron/performance-scheduling');
const { readReceipt } = require('../electron/pinterest-receipt');
const { suggestFailedRows } = require('../electron/pinterest-delivery');
const { createSpendLedger } = require('../electron/spend-ledger');
const recipe = { name: 'Lemon Rice', facts: { 'Prep Time': '5 minutes', 'Cook Time': '15 minutes', 'Total Time': '20 minutes', Servings: '4' }, ingredients: ['1 cup rice', '2 cups water', '1 tbsp lemon juice'], instructions: ['Combine rice and water in a saucepan.', 'Simmer for 15 minutes until rice is tender.', 'Stir in lemon juice until evenly combined.'] };
function fixture() {
  const state = { articles: [{ id: 'a', title: 'Lemon Rice', content: `<p>Original cooking notes.</p>${renderRecipes([recipe])}`, sourceUrl: 'https://recipes.example/rice', wordpressPostUrl: 'https://recipes.example/rice', workflowStatus: 'approved' }], settings: { pinCreator: { customStyles: { july: { name: 'July', prompt: 'Original centered food photograph prompt.' } } } }, pinCreatorPins: [{ id: 'p', title: 'Lemon Rice', articleId: 'a', url: 'https://recipes.example/rice', localPath: 'pin.jpg', imageQa: { sha256: hash(Buffer.from('artwork')) } }] };
  const store = { get: (k, f) => structuredClone(k.split('.').reduce((o, key) => o?.[key], state) ?? f), set: (k, v) => { const keys = k.split('.'); let o = state; for (const key of keys.slice(0, -1)) o = o[key] ||= {}; o[keys.at(-1)] = structuredClone(v); } };
  const ledger = createSpendLedger({ store }); let output;
  const service = createContentOperations({ store, ledger, readMedia: async () => Buffer.from('artwork'), saveFile: async (name, bytes) => { output = { name, html: bytes.toString() }; return { path: name }; } });
  return { state, store, ledger, service, output: () => output };
}
test('performance hours and daily caps use the chosen timezone, not the computer timezone', () => {
  const slots = nextPerformanceSlots(3, { start: new Date('2026-11-01T04:10:00Z'), timezone: 'America/New_York', preferredHours: [1], intervalHours: 1, pinsPerDay: 1 });
  assert.equal(slots[0].toISOString(), '2026-11-01T05:00:00.000Z');
  assert.equal(slots[1].toISOString(), '2026-11-02T06:00:00.000Z');
  assert.throws(() => nextPerformanceSlots(2, { timezone: 'invalid/zone' }));
});
test('weak performance samples do not become best-time claims and ambiguous local dates are skipped', () => {
  const rows = Array.from({ length: 2 }, () => ({ publishedAt: '2026-10-01T09:00:00Z', outboundClicks: 1000, impressions: 10000 }));
  assert.equal(buildPerformanceScheduleProfile(rows).mode, 'recommended-window');
  const strong = [...Array.from({ length: 5 }, () => rows[0]), ...Array.from({ length: 5 }, () => ({ ...rows[0], publishedAt: '2026-10-01T12:00:00Z' }))];
  assert.deepEqual(buildPerformanceScheduleProfile(strong, { timezone: 'Asia/Kolkata' }).preferredHours, [14, 17]);
  assert.equal(buildPerformanceScheduleProfile([{ publishedAt: '2026-11-01T01:30:00' }], { timezone: 'America/New_York' }).sampleCount, 0);
});
test('every numbered recipe is checked and shopping export includes every recipe', () => {
  const content = renderRecipes([recipe, { ...recipe, name: 'Second Rice', ingredients: ['3 cups rice', '2 cups water', '1 tbsp lemon juice'] }]);
  const report = inspectRecipe({ id: 'a', content });
  assert.equal(report.recipeCount, 2); assert.equal(report.status, 'structure-checked');
  assert.equal(shoppingList([{ id: 'a', title: 'Collection', content }]).find(i => i.description === 'rice').quantity, 4);
  const bad = inspectRecipe({ content: renderRecipes([recipe, { ...recipe, instructions: ['Stir.'] }]) });
  assert.equal(bad.status, 'needs-repair'); assert.ok(bad.issues.some(i => /Recipe 2/.test(i.message)));
});
test('separate recipe cards are inspected without losing the second card', () => {
  const html = renderRecipes([recipe]) + renderRecipes([{ ...recipe, name: 'Second', ingredients: ['rice'] }]).replace('id="recipe-card"', 'id="recipe-card-2"');
  const r = inspectRecipe({ content: html }); assert.equal(r.recipeCount, 2); assert.equal(r.status, 'needs-repair');
});

test('quality checks catch duplicate primary IDs while preserving uniquely named additional cards', () => {
  const card = renderRecipes([recipe]);
  const duplicate = inspectRecipe({ content: card + card });
  assert.equal(duplicate.recipeCount, 2); assert.equal(duplicate.status, 'needs-repair');
  assert.ok(duplicate.issues.some(issue => /Duplicate primary/.test(issue.message)));
  const separate = inspectRecipe({ content: card + card.replace('id="recipe-card"', 'id="recipe-card-2"') });
  assert.equal(separate.recipeCount, 2); assert.equal(separate.status, 'structure-checked');
});
test('pipeline checkpoint detects article changes while linking assets and import outcomes', async () => {
  const f = fixture(); await f.service.run('baseline', { articleId: 'a' });
  assert.equal((await f.service.run('snapshot')).pipeline[0].sourceState, 'current');
  f.state.articles[0].content += '<p>New substitution.</p>';
  assert.equal((await f.service.run('snapshot')).pipeline[0].sourceState, 'source-changed');
  f.state.pinterestDelivery = { batches: [{ id: 'batch', rows: [{ pinId: 'p', number: 1 }], outcomes: { 1: { status: 'failed' } } }] };
  assert.equal((await f.service.run('snapshot')).pipeline[0].deliveries[0].status, 'failed');
});
test('structured recipe editing is versioned, escaped, stale-safe and never publishes', async () => {
  const f = fixture(), opened = await f.service.run('recipe-open', { articleId: 'a' });
  const saved = await f.service.run('recipe-save', { articleId: 'a', sourceHash: opened.sourceHash, recipes: [{ ...recipe, name: '<script>bad</script>Rice' }] });
  assert.ok(saved.article.content.startsWith('<p>Original cooking notes.</p>'));
  assert.ok(!saved.article.content.includes('<script>')); assert.equal(saved.article.workflowStatus, 'needs-review');
  assert.equal(saved.article.wordpressPostUrl, 'https://recipes.example/rice');
  assert.equal(saved.article.recipeRecord.revision, 1);
  await assert.rejects(f.service.run('recipe-save', { articleId: 'a', sourceHash: opened.sourceHash, recipes: [recipe] }), /changed/);
  await assert.rejects(f.service.run('recipe-save', { articleId: 'a', sourceHash: saved.article.recipeRecord.sourceHash, recipes: [{ ...recipe, ingredients: [] }] }), /ingredients/);
});
test('saving a prompt candidate freezes the original baseline without replacing defaults or spending', async () => {
  const f = fixture(); const v = await f.service.run('style-save', { styleId: 'july', name: 'Candidate', prompt: 'Updated camera instructions.' });
  assert.equal(v.version, 2); assert.equal(f.state.contentOperations.styleVersions[0].locked, true);
  assert.equal(f.state.settings.pinCreator.customStyles.july.prompt, 'Original centered food photograph prompt.');
  const queued = await f.service.run('benchmark-queue', { articleId: 'a', versionId: v.id });
  assert.equal(queued.pin.promptLabPromptHash, v.promptHash); assert.equal(f.ledger.get().entries.length, 0);
  await assert.rejects(f.service.run('benchmark-save', { articleId: 'a', versionId: v.id, pinId: 'p' }), /exact benchmark/);
});
test('benchmark results require actual candidate lineage and current image/source fingerprints', async () => {
  const f = fixture(), v = await f.service.run('style-save', { styleId: 'july', name: 'Candidate', prompt: 'Photo.' });
  const { pin } = await f.service.run('benchmark-queue', { articleId: 'a', versionId: v.id });
  Object.assign(f.state.pinCreatorPins.find(x => x.id === pin.id), { localPath: 'pin.jpg', imageQa: { sha256: hash(Buffer.from('artwork')) }, generationConfig: { promptLabVersionId: v.id, promptLabPromptHash: v.promptHash } });
  const result = await f.service.run('benchmark-save', { articleId: 'a', versionId: v.id, pinId: pin.id });
  assert.equal(result.textStatus, 'unchecked'); assert.equal(result.realism, 'unchecked');
  f.state.articles[0].content += 'changed';
  await assert.rejects(f.service.run('benchmark-save', { articleId: 'a', versionId: v.id, pinId: pin.id }), /Recipe changed/);
});
test('experiments use exact remote IDs, reject duplicate/ambiguous rows and never invent a winner', () => {
  const experiment = { variants: [{ remotePinId: '111' }, { remotePinId: '222' }] };
  assert.equal(experimentReport(experiment, []).status, 'insufficient-evidence');
  const rows = [{ id: '111', impressions: 2000, outboundClicks: 100 }, { id: '222', impressions: 3000, outboundClicks: 100 }];
  const result = experimentReport(experiment, rows); assert.equal(result.variants[0].ctr, 0.05); assert.equal(result.status, 'observational-comparison'); assert.equal(result.winner, undefined);
  assert.equal(experimentReport(experiment, [...rows, rows[0]]).variants[0].evidence, 'ambiguous-rows');
});
test('cost attribution keeps unknown actual charges distinct and reuses only matching recipe artwork', async () => {
  const f = fixture(); const id = f.ledger.reserve({ model: 'image', input: {}, estimateUsd: 0.03, context: { articleId: 'a', apiKey: 'never-log' } });
  const snapshot = await f.service.run('snapshot'); assert.equal(snapshot.costs[0].reserved, 0.03); assert.equal(snapshot.costs[0].reported, 0); assert.equal(snapshot.costs[0].unknown, 1);
  assert.ok(!JSON.stringify(f.ledger.get()).includes('never-log'));
  const reused = await f.service.run('reuse-pin', { articleId: 'a', pinId: 'p' }); assert.equal(reused.additionalGenerationCost, 0);
  await f.service.run('cost-link', { requestId: id, articleId: 'a', evidence: 'Prediction receipt mapping' });
  f.state.articles.push({ id: 'b', sourceUrl: 'https://recipes.example/other' });
  await assert.rejects(f.service.run('reuse-pin', { articleId: 'b', pinId: 'p' }), /same destination/);
});
test('weekly packs include useful full recipes and shopping totals, with no remote scripts or fake links', async () => {
  const f = fixture(); await f.service.run('pack-export', { ids: ['a'], name: '<img src=x>Week', multiplier: 2 });
  const output = f.output(); assert.match(output.html, /2 cup rice/); assert.match(output.html, /Simmer for 15 minutes/); assert.ok(!output.html.includes('<img')); assert.match(output.html, /&lt;img/);
  await assert.rejects(f.service.run('pack-export', { ids: Array(8).fill('a') }), /1 to 7/);
  await assert.rejects(f.service.run('pack-export', { ids: ['a'], multiplier: -1 }), /multiplier/);
  for (const multiplier of [0, '', NaN, Infinity]) await assert.rejects(f.service.run('pack-export', { ids: ['a'], multiplier }), /multiplier/);
});

test('pipeline tolerates untitled legacy drafts and ignores reviews missing an artwork fingerprint', async () => {
  const f = fixture(); f.state.articles[0].title = '';
  f.state.pinCreatorPins[0].imageQa = { visualReview: { status: 'reviewed' } };
  f.ledger.reserve({ model: 'image', input: {}, estimateUsd: 0.03, context: { articleId: 'a' } });
  const data = await f.service.run('snapshot');
  assert.equal(data.pipeline[0].title, 'Untitled article'); assert.equal(data.costs[0].usablePins, 0);
});

test('experiment variants require different finished artwork records and invalidate changed artwork', async () => {
  const f = fixture();
  await assert.rejects(f.service.run('experiment-save', { name: 'Comparison', variants: [{ pinId: 'p', remotePinId: '111' }, { pinId: 'p', remotePinId: '222' }] }), /different finished/);
  f.state.pinCreatorPins.push({ ...f.state.pinCreatorPins[0], id: 'p2' });
  await f.service.run('experiment-save', { name: 'Comparison', variants: [{ pinId: 'p', remotePinId: '111' }, { pinId: 'p2', remotePinId: '222' }] });
  f.state.trendResearch = { pinterestAnalytics: { rows: [{ id: '111', impressions: 2000, outboundClicks: 100 }, { id: '222', impressions: 2000, outboundClicks: 50 }] } };
  assert.equal((await f.service.run('snapshot')).experiments[0].status, 'observational-comparison');
  f.state.pinCreatorPins[0].imageQa.sha256 = 'changed';
  const changed = (await f.service.run('snapshot')).experiments[0];
  assert.equal(changed.status, 'insufficient-evidence'); assert.equal(changed.variants[0].evidence, 'artwork-changed'); assert.equal(changed.variants[0].ctr, null);
  assert.equal(experimentReport({ variants: [{ remotePinId: '111' }] }, [{ id: '111', impressions: 2000, outboundClicks: null }]).variants[0].evidence, 'unavailable');
});

test('recipe history retains the original revision and never silently approves changed content', async () => {
  const f = fixture(), opened = await f.service.run('recipe-open', { articleId: 'a' });
  const first = await f.service.run('recipe-save', { articleId: 'a', sourceHash: opened.sourceHash, recipes: [{ ...recipe, name: 'Revised Rice' }] });
  assert.equal(first.article.recipeRecord.history[0].recipes[0].name, recipe.name);
  assert.equal((await f.service.run('snapshot')).pipeline[0].sourceState, 'source-changed');
  const restored = await f.service.run('recipe-save', { articleId: 'a', sourceHash: first.article.recipeRecord.sourceHash, recipes: first.article.recipeRecord.history[0].recipes });
  assert.equal(restored.article.recipeRecord.revision, 2); assert.equal(restored.article.recipeRecord.history.length, 2);
  assert.equal(restored.article.workflowStatus, 'needs-review');
});

test('content mutations serialize without losing prompt versions and validate scheduler boundaries', async () => {
  const f = fixture();
  const versions = await Promise.all(['One', 'Two', 'Three'].map(name => f.service.run('style-save', { styleId: 'july', name, prompt: `Prompt ${name}` })));
  assert.deepEqual(versions.map(v => v.version), [2, 3, 4]); assert.equal(f.state.contentOperations.styleVersions.length, 4);
  assert.throws(() => nextPerformanceSlots(2, { preferredHours: [1.5] }), /whole preferred hour/);
  assert.throws(() => nextPerformanceSlots(2, { maximumDate: 'bad date' }), /end date/);
});

test('benchmark queue identities never merge with the normal article Pin or another test version', async () => {
  const { pinQueueIdentity } = await import('../src/lib/pinBatch.mjs');
  const normal = { id: 'normal', articleId: 'a', url: 'https://recipe.example/rice' };
  const first = { ...normal, id: 'test1', promptLabVersionId: 'v1' };
  const second = { ...normal, id: 'test2', promptLabVersionId: 'v2' };
  assert.equal(new Set([normal, first, second].map(pinQueueIdentity)).size, 3);
  assert.equal(pinQueueIdentity({ ...normal, id: 'duplicate' }), pinQueueIdentity(normal));
});
test('MIME result emails are parsed as data and matched only to exact failed title/board rows', async () => {
  const html = `<table><tr><td>Upload didn't work</td><td>Lemon Rice</td><td>Dinner</td></tr></table>`;
  const email = Buffer.from(`MIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(html).toString('base64')}`);
  const text = await readReceipt(email, 'results.eml');
  const r = suggestFailedRows({ rows: [{ number: 1, cells: ['Lemon Rice', '', 'Dinner'] }], outcomes: {} }, text);
  assert.deepEqual(r.updates.map(x => x.status), ['failed']);
  assert.equal(suggestFailedRows({ rows: [{ number: 1, cells: ['Other', '', 'Dinner'] }], outcomes: {} }, text).updates.length, 0);
});
