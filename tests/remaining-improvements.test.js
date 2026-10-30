const test = require('node:test');
const assert = require('node:assert/strict');
const { renderRecipes, createContentOperations, hash } = require('../electron/content-operations');
const { anchorRecipeRoundup, roundupSchema, replaceRoundupSchema } = require('../electron/recipe-roundup');
const { prepareRecipeSchemaForPublication } = require('../electron/article-recipe-readiness');
const { createSpendLedger } = require('../electron/spend-ledger');
const { EVALUATION_CASES, evaluateSavedOutputs } = require('../electron/prompt-evaluation');
const { rankKeywordOpportunities, seasonalOpportunity } = require('../electron/keyword-opportunity');
const { buildPublishingCalendar } = require('../electron/publishing-calendar');
const { operationsReadiness } = require('../electron/operations-readiness');
const { signedReleaseConfig } = require('../scripts/build-signed-release.cjs');
const { configuredWindowsPublisherNames } = require('../electron/update-security');
const recipe = { name: 'Lemon Rice', facts: { 'Prep Time': '5 minutes', 'Cook Time': '15 minutes', 'Total Time': '20 minutes', Servings: '4' }, ingredients: ['1 cup rice', '2 cups water', '1 tbsp lemon juice'], instructions: ['Combine rice and water in a saucepan.', 'Simmer for 15 minutes until rice is tender.', 'Stir in lemon juice until evenly combined.'] };
function memory(initial = {}) {
  const state = structuredClone(initial);
  return { state, get: (key, fallback) => key.split('.').reduce((o, k) => o?.[k], state) ?? fallback,
    set(key, value) { const keys = key.split('.'); let node = state; for (const k of keys.slice(0, -1)) node = node[k] ||= {}; node[keys.at(-1)] = structuredClone(value); } };
}

test('roundup anchors are unique, repeatable and keep existing reader IDs and image sources', () => {
  const source = '<p id="cs-recipe-1">Notes</p>' + renderRecipes([recipe, { ...recipe, name: 'Herb Rice' }]);
  const first = anchorRecipeRoundup(source);
  assert.deepEqual(first.anchors.map(a => a.id), ['cs-recipe-1-2', 'cs-recipe-2']);
  assert.equal(anchorRecipeRoundup(first.content).content, first.content);
  assert.ok(first.content.includes('<section id="recipe-card">'));
  const list = roundupSchema([{ name: 'Rice' }, { name: 'Herbs' }], first.anchors, 'https://recipes.example/roundup/?utm_source=test');
  assert.equal(list.itemListElement[0].item.url, 'https://recipes.example/roundup/#cs-recipe-1-2');
  assert.equal(roundupSchema([{}, {}], first.anchors, ''), null);
});

test('publication lists contain full eligible recipes and never make up a published URL', () => {
  const source = renderRecipes([recipe, { ...recipe, name: 'Herb Rice' }]).replace('<h2>2. Herb Rice</h2>', '<h2>2. Herb Rice</h2><img src="https://recipes.example/herb.jpg">');
  const result = prepareRecipeSchemaForPublication({ wordpressPostUrl: 'https://recipes.example/roundup/' }, source, 'https://recipes.example/lemon.jpg');
  const graph = JSON.parse(result.structuredData)['@graph'];
  assert.equal(graph[0]['@type'], 'ItemList');
  assert.equal(graph[0].itemListElement.length, 2);
  assert.equal(graph[0].itemListElement[1].item.recipeIngredient.length, 3);
  assert.match(result.content, /id="cs-recipe-2"/);
  const noUrl = prepareRecipeSchemaForPublication({}, source, 'https://recipes.example/lemon.jpg');
  assert.ok(!noUrl.structuredData.includes('ItemList'));
  assert.ok(noUrl.warnings.some(w => /permalink/.test(w)));
  const noPhoto = prepareRecipeSchemaForPublication({ wordpressPostUrl: 'https://recipes.example/roundup/' }, renderRecipes([recipe, recipe]), 'https://recipes.example/lemon.jpg');
  assert.ok(!noPhoto.structuredData.includes('ItemList'));
});

test('roundup finalization replaces only recipe markup, keeps other schema and is script-safe', () => {
  const mixed = '<p>Visible article</p><script type="application/ld+json">' + JSON.stringify({ '@graph': [{ '@type': 'Article', headline: 'Original' }, { '@type': 'Recipe', name: 'Old' }] }) + '</script>';
  const schema = JSON.stringify({ '@graph': [{ '@type': 'ItemList', name: '</script><script>bad</script>' }] });
  const output = replaceRoundupSchema(mixed, schema);
  assert.ok(output.includes('Original')); assert.ok(!output.includes('"Old"'));
  assert.ok(!output.includes('<script>bad'));
  assert.equal(replaceRoundupSchema(mixed, '{}'), null);
});

test('fixed evaluation set keeps missing data and unreviewed visuals explicit', () => {
  assert.equal(EVALUATION_CASES.length, 15);
  const article = { id: 'a', content: renderRecipes([recipe]) };
  const pin = { id: 'p', promptLabSourceHash: hash(article.content), imageQa: { sha256: 'a'.repeat(64), visualReview: { status: 'reviewed', imageSha256: 'b'.repeat(64) } } };
  const results = evaluateSavedOutputs([{ caseId: 'poultry', articleId: 'a', pinId: 'p' }], [article], [pin]);
  assert.equal(results[0].visualStatus, 'unchecked');
  assert.equal(results[1].status, 'unassigned');
  assert.equal(results[0].sourceCurrent, true);
  pin.promptLabSourceHash = 'stale';
  assert.equal(evaluateSavedOutputs([{ caseId: 'poultry', articleId: 'a', pinId: 'p' }], [article], [pin])[0].status, 'missing-or-stale-pin');
});

test('evaluation setup queues frozen candidates without purchasing generations and enforces its cap', async () => {
  const store = memory({ articles: [{ id: 'a', title: 'Rice', content: renderRecipes([recipe]), sourceUrl: 'https://recipes.example/rice' }], contentOperations: { styleVersions: [{ id: 'v', styleId: 'july', prompt: 'Frozen candidate', promptHash: hash('Frozen candidate') }] } });
  const ledger = createSpendLedger({ store });
  const service = createContentOperations({ store, ledger });
  const result = await service.run('evaluation-create', { versionId: 'v', budgetUsd: 0.05, assignments: [{ caseId: 'beans', articleId: 'a' }] });
  assert.equal(result.paidRequestsSubmitted, 0); assert.equal(ledger.get().entries.length, 0);
  const pinId = result.run.pinIds[0];
  assert.equal(store.get('pinCreatorPins')[0].promptLabPromptHash, hash('Frozen candidate'));
  ledger.reserve({ model: 'ideogram/turbo', input: {}, estimateUsd: 0.03, context: { pinId } });
  assert.throws(() => ledger.reserve({ model: 'ideogram/turbo', estimateUsd: 0.03, context: { pinId } }), /Evaluation estimated budget/);
  assert.throws(() => ledger.reserve({ model: 'unknown', context: { pinId } }), /Evaluation estimated budget/);
  await assert.rejects(service.run('evaluation-create', { versionId: 'v', budgetUsd: 1, assignments: [{ caseId: 'beans', articleId: 'a' }, { caseId: 'beans', articleId: 'a' }] }), /duplicate/);
  assert.equal(store.get('contentOperations.evaluationRuns').length, 1);
});

test('opportunity scores use real fresh sources, cap guesses and expose missing fields', () => {
  const options = { now: new Date('2026-10-30T12:00:00Z'), pinterestAt: '2026-10-29T12:00:00Z', searchAt: '2026-10-29T12:00:00Z', pinterest: [{ keyword: 'pumpkin soup', outboundClicks: 100 }], queries: [{ key: 'pumpkin soup', impressions: 1000 }] };
  const item = { keyword: 'pumpkin soup', opportunityScore: 100 };
  const measured = rankKeywordOpportunities([item], options)[0];
  assert.equal(measured.evidenceConfidence, 'high');
  assert.equal(measured.opportunityFactors.pinterest !== null, true);
  const missing = rankKeywordOpportunities([item], { ...options, pinterestAt: '2025-01-01', queries: [] })[0];
  assert.equal(missing.evidenceConfidence, 'low'); assert.ok(missing.opportunityScore <= 45);
  assert.equal(missing.opportunityFactors.pinterest, null);
  assert.throws(() => rankKeywordOpportunities([item], { weights: { pinterest: -1 } }), /weights/);
  const covered = rankKeywordOpportunities([item], { ...options, titles: ['pumpkin soup'] })[0];
  assert.equal(covered.opportunityFactors.coverage, 0);
});

test('seasonal suggestions are calendar inferences and handle hemisphere and year boundaries', () => {
  assert.equal(seasonalOpportunity('pumpkin soup', 'US', new Date('2026-08-15T00:00:00Z')).start, '2026-09-01');
  assert.equal(seasonalOpportunity('pumpkin soup', 'AU', new Date('2026-10-30T00:00:00Z')).start, '2027-03-01');
  const winter = seasonalOpportunity('winter soup', 'US', new Date('2026-01-15T00:00:00Z'));
  assert.equal(winter.start, '2025-12-01'); assert.equal(winter.priority, 100);
  assert.match(winter.evidence, /not measured/);
});

test('unified agenda preserves UTC timing and separates planned, exported and confirmed posts', () => {
  const events = buildPublishingCalendar({ articles: [{ id: 'a', title: 'Rice', wordpressPostUrl: 'https://recipes.example/rice' }], pins: [{ id: 'p', articleId: 'a', csvPublishDate: '2026-11-01T10:00:00Z' }, { id: 'q', title: 'Next', csvPublishDate: '2026-11-02T10:00:00Z' }], batches: [{ id: 'b', rows: [{ pinId: 'p', number: 1, cells: ['Rice', '', '', '', '', 'https://recipes.example/rice', '2026-11-01 10:00:00'] }], outcomes: {} }], ghl: [{ id: 'g', destinationUrl: 'https://recipes.example/rice', scheduleDate: '2026-11-01T11:30:00+02:00', platform: 'instagram', verified: true, status: 'scheduled' }] });
  assert.equal(events.find(e => e.id === 'csv:b:1').status, 'exported-unconfirmed');
  assert.equal(events.find(e => e.id === 'csv:b:1').date, '2026-11-01T10:00:00.000Z');
  assert.equal(events[0].date, '2026-11-01T09:30:00.000Z');
  assert.equal(events[0].articleId, 'a');
  assert.equal(events.filter(e => e.id === 'pin:p').length, 0);
  assert.equal(events.find(e => e.id === 'pin:q').status, 'planned-not-exported');
});

test('roundup links and calendar ownership preserve WordPress query-based post identities', () => {
  const list = roundupSchema([{ name: 'One' }, { name: 'Two' }], [{ id: 'one' }, { id: 'two' }], 'https://recipes.example/?p=73&utm_source=pinterest');
  assert.equal(list.itemListElement[0].item.url, 'https://recipes.example/?p=73#one');
  const events = buildPublishingCalendar({ articles: [{ id: 'a', title: 'First', wordpressPostUrl: 'https://recipes.example/?p=73' }, { id: 'b', title: 'Second', wordpressPostUrl: 'https://recipes.example/?p=74' }], ghl: [{ id: 'g', destinationUrl: 'https://recipes.example/?p=74&utm_source=pinterest' }] });
  assert.equal(events[0].articleId, 'b');
});

test('readiness reports contain no secrets and never treat configuration as a live verification', () => {
  const store = memory({ settings: { wordpressSites: [{ apiKey_encrypted: 'secret-value' }], googleAnalyticsMeasurementId: 'G-ONLY' }, pinterestDelivery: { batches: [{ rows: [{ number: 1 }], outcomes: {} }] } });
  const report = operationsReadiness({ store, platform: 'win32' });
  assert.ok(!JSON.stringify(report).includes('secret-value'));
  assert.equal(report.checks.find(c => c.id === 'wordpress').status, 'configured-unverified');
  assert.equal(report.checks.find(c => c.id === 'pinterest').status, 'receipt-required');
  assert.equal(report.checks.find(c => c.id === 'analytics').status, 'report-access-required');
  assert.equal(report.liveWritesSubmitted, 0);
});

test('signed build setup refuses bypasses, includes manifests and preserves publisher verification', () => {
  assert.throws(() => signedReleaseConfig({}, 'win32'), /HTTPS/);
  assert.throws(() => signedReleaseConfig({ CONTENT_STUDIO_UPDATE_URL: 'https://updates.example/app' }, 'win32'), /certificate/);
  assert.throws(() => signedReleaseConfig({ CONTENT_STUDIO_ALLOW_UNSIGNED: '1' }, 'win32'), /override/);
  const config = signedReleaseConfig({ CONTENT_STUDIO_UPDATE_URL: 'https://updates.example/app', CONTENT_STUDIO_WINDOWS_PUBLISHER: 'Example Ltd', CSC_LINK: 'private-certificate' }, 'win32');
  assert.equal(config.forceCodeSigning, true); assert.equal(config.win.verifyUpdateCodeSignature, true);
  assert.equal(config.publish[0].url, 'https://updates.example/app');
  assert.deepEqual(configuredWindowsPublisherNames({ windowsPublisherNames: ['Example Ltd'] }), ['Example Ltd']);
  assert.ok(!JSON.stringify(config).includes('private-certificate'));
});
