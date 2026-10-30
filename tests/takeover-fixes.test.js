const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { renderRecipes } = require('../electron/content-operations');
const { createRecipeReadinessService, recipeSchemaNeedsReview, prepareRecipeSchemaForPublication } = require('../electron/article-recipe-readiness');
const { createWorkspaceStore, WorkspaceDatabase, isWorkspaceCorruption } = require('../electron/workspace-store');
const { findLogicalGhlDuplicate } = require('../electron/ghl-dedupe');

const rice = { name: 'Lemon Rice', facts: { 'Prep Time': '10 minutes', 'Cook Time': '20 minutes', 'Total Time': '30 minutes', Servings: '4' }, ingredients: ['1 cup rice', '2 cups water', '1 lemon, juiced', '1 tsp salt'], instructions: ['Rinse rice for 1 minute until the water runs clear.', 'Simmer rice in water with salt for 18 minutes until absorbed and tender.', 'Fluff rice with lemon juice until evenly coated.'] };
const chicken = { name: 'Chicken Bake', facts: { 'Prep Time': '10 minutes', 'Cook Time': '30 minutes', 'Total Time': '40 minutes', Servings: '4' }, ingredients: ['1 lb chicken breast', '1 tbsp olive oil', '1 tsp salt'], instructions: ['Heat the oven to 400 F for 10 minutes.', 'Coat chicken with olive oil and salt until evenly coated.', 'Bake for 30 minutes until golden.'] };

function memoryStore(initial) {
  let state = structuredClone(initial);
  return { get: (key, fallback) => Object.hasOwn(state, key) ? state[key] : fallback, has: key => Object.hasOwn(state, key),
    set(key, value) { state[key] = value; }, delete(key) { delete state[key]; }, onDidAnyChange: () => () => {},
    get store() { return state; }, set store(value) { state = value; } };
}
function cleanup(dir) {
  const target = fs.realpathSync(dir);
  assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(target).startsWith('cs-takeover-'));
  fs.rmSync(target, { recursive: true, force: true });
}

test('queue completion retains provenance and collection metadata used by publish review', async () => {
  const { checkpointArticleDraft, completeGenerationMetadata } = await import('../src/lib/generationCheckpoint.mjs');
  const content = renderRecipes([rice]);
  const checkpoint = { content, recipeCollection: { depth: 'complete-recipes', itemCount: 2 }, stage: 'article' };
  const draft = checkpointArticleDraft({ id: 'fixture', content }, checkpoint);
  const finished = { ...draft, ...completeGenerationMetadata(draft, checkpoint), generationCheckpoint: null, recipeCardRepairApplied: false };
  assert.equal(recipeSchemaNeedsReview(finished), true);
  assert.equal(finished.recipeCollection.itemCount, 2);
  assert.equal(finished.generationProvenance.kind, 'ai');
  assert.equal(recipeSchemaNeedsReview({ content, generationCheckpoint: null, editorialQualityPassApplied: false }), true, 'legacy completed generated records remain reviewable');
  assert.equal(recipeSchemaNeedsReview({ content }), false, 'plain imported cards are not mislabeled as generated');
});

test('later invalid recipes are blocked even when legacy collection metadata is missing', async () => {
  const prepare = createRecipeReadinessService({ generateCard: async () => assert.fail('no paid repair') });
  const result = await prepare({ title: 'Two Dinners', content: renderRecipes([rice, chicken]), generationCheckpoint: null }, { repair: false });
  assert.equal(result.success, false);
  assert.ok(result.issues.some(issue => /Recipe 2:.*poultry/i.test(issue)));
});

test('a failed list migration preserves originals and can be retried after reopening', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-takeover-migration-'));
  const original = { affiliateLinks: [{ id: 'a' }], wordpressSites: [{ id: 's', internalLinkPosts: [{ id: 1 }] }] };
  const settings = memoryStore({ settings: original });
  const set = WorkspaceDatabase.prototype.set;
  let failedDb;
  try {
    WorkspaceDatabase.prototype.set = function (key, value) { if (key === 'settingsLists') { failedDb = this; throw new Error('Injected write failure'); } return set.call(this, key, value); };
    assert.throws(() => createWorkspaceStore(settings, dir), /Injected write failure/);
    assert.deepEqual(settings.get('settings'), original);
  } finally { WorkspaceDatabase.prototype.set = set; try { failedDb?.close(); } catch { /* initialization closes it */ } }
  let workspace;
  try { workspace = createWorkspaceStore(settings, dir); assert.deepEqual(workspace.get('settings'), original); }
  finally { workspace?.database.close(); cleanup(dir); }
});

test('a settings-file failure rolls back the replacement lists without removing old data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-takeover-rollback-'));
  const settings = memoryStore({ settings: { affiliateLinks: [{ id: 'old' }] } });
  const workspace = createWorkspaceStore(settings, dir);
  const set = settings.set;
  settings.set = () => { throw new Error('Injected JSON write failure'); };
  try {
    assert.throws(() => workspace.set('settings', { affiliateLinks: [{ id: 'new' }] }), /Injected JSON write failure/);
    assert.deepEqual(workspace.get('settings.affiliateLinks'), [{ id: 'old' }]);
  } finally { settings.set = set; workspace.database.close(); cleanup(dir); }
});

test('only actual corruption permits database quarantine, not permissions or migration failures', () => {
  assert.equal(isWorkspaceCorruption({ errcode: 11 }), true);
  assert.equal(isWorkspaceCorruption({ errcode: 26 }), true);
  assert.equal(isWorkspaceCorruption({ code: 'EACCES' }), false);
  assert.equal(isWorkspaceCorruption({ errcode: 13, message: 'disk full' }), false);
});

test('ID-scoped settings edits preserve synced lists, unrelated sites and explicit removals', async () => {
  const { settingsPatch, mergeSettingsPatch } = await import('../src/lib/settingsPatch.mjs');
  const site = { id: 's', url: 'https://example.org', name: 'Original', internalLinkPosts: [{ id: 1 }] };
  const base = { wordpressSites: [site] };
  const current = { wordpressSites: [{ ...site, internalLinkPosts: [{ id: 1 }, { id: 2 }], internalLinksSyncedAt: '2026-10-29T10:00:00Z' }, { id: 'background', url: 'https://example.net' }] };
  const merged = mergeSettingsPatch(current, settingsPatch(base, { wordpressSites: [{ ...site, name: 'Renamed' }] }));
  assert.equal(merged.wordpressSites[0].name, 'Renamed');
  assert.equal(merged.wordpressSites[0].internalLinkPosts.length, 2);
  assert.equal(merged.wordpressSites[1].id, 'background');
  assert.deepEqual(mergeSettingsPatch(current, settingsPatch(base, { wordpressSites: [] })).wordpressSites.map(s => s.id), ['background']);
  assert.equal(mergeSettingsPatch(current, { wordpressSites: [{ ...site, name: 'Legacy caller' }] }).wordpressSites[0].internalLinkPosts.length, 2);
  assert.throws(() => mergeSettingsPatch({ wordpressSites: [] }, settingsPatch(base, { wordpressSites: [{ ...site, name: 'Deleted elsewhere' }] })), /changed|removed|reload/i);
});

test('GHL duplicates block overlapping accounts, allow disjoint accounts and guard unknown legacy targets', () => {
  const candidate = { platform: 'facebook', locationId: 'loc', caption: 'A bright and practical lemon rice recipe for weeknight dinner.', scheduleDate: '2026-11-01T12:00:00Z', targetAccountIds: ['B'] };
  const receipt = { ...candidate, targetAccountIds: ['A'], status: 'scheduled', postId: 'post' };
  assert.equal(findLogicalGhlDuplicate([receipt], candidate), null);
  assert.equal(findLogicalGhlDuplicate([receipt], { ...candidate, targetAccountIds: ['A', 'B'] })?.postId, 'post');
  assert.equal(findLogicalGhlDuplicate([{ ...receipt, targetAccountIds: undefined }], candidate)?.postId, 'post');
});

test('publication schema excludes recipes without their own photo and uses uploaded inline images', () => {
  const content = renderRecipes([rice, { ...chicken, instructions: [...chicken.instructions.slice(0, 2), 'Cook for 30 minutes and verify 165 F with a thermometer.'] }]);
  const article = { title: 'Two Dinners', recipeCollection: { depth: 'complete-recipes', itemCount: 2 } };
  const first = prepareRecipeSchemaForPublication(article, content, 'https://example.org/rice.jpg');
  const graph = JSON.parse(first.structuredData)['@graph'];
  assert.equal(graph.length, 1);
  assert.ok(first.warnings.some(w => /Chicken Bake/.test(w)));
  const inline = content.replace('<h2>2. Chicken Bake</h2>', '<h2>2. Chicken Bake</h2><img src="https://example.org/chicken.jpg">');
  const full = prepareRecipeSchemaForPublication(article, inline, 'https://example.org/rice.jpg');
  assert.equal(JSON.parse(full.structuredData)['@graph'].length, 2);
  assert.deepEqual(JSON.parse(full.structuredData)['@graph'][1].image, ['https://example.org/chicken.jpg']);
  assert.equal(prepareRecipeSchemaForPublication({ title: 'Rice' }, renderRecipes([rice]), '').structuredData, '');
});

test('a complete collection missing a promised recipe cannot pass as its valid first recipe', async () => {
  const prepare = createRecipeReadinessService({ generateCard: async () => assert.fail('no paid repair') });
  const result = await prepare({ title: 'Two Dinners', content: renderRecipes([rice]), recipeCollection: { depth: 'complete-recipes', itemCount: 2 } }, { repair: false });
  assert.equal(result.success, false);
  assert.match(result.issues.join(' '), /promises 2/);
});

test('changing a site URL clears old-domain sync data and accepts a fresh sync on the same URL', async () => {
  const { settingsPatch, mergeSettingsPatch } = await import('../src/lib/settingsPatch.mjs');
  const site = { id: 's', url: 'https://example.org', internalLinkPosts: [{ id: 1 }], internalLinksSyncedAt: '2026-10-29T10:00:00Z' };
  const base = { wordpressSites: [site] };
  const changed = mergeSettingsPatch(base, settingsPatch(base, { wordpressSites: [{ ...site, url: 'https://example.net' }] }));
  assert.equal(changed.wordpressSites[0].internalLinkPosts, undefined);
  const synced = mergeSettingsPatch(base, settingsPatch(base, { wordpressSites: [{ ...site, internalLinkPosts: [{ id: 2 }], internalLinksSyncedAt: '2026-10-29T11:00:00Z' }] }));
  assert.equal(synced.wordpressSites[0].internalLinkPosts[0].id, 2);
});
