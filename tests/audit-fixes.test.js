const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { createWorkspaceStore } = require('../electron/workspace-store');
const { automaticMetaProject, metaSourceFingerprint } = require('../electron/meta-auto-pack');
const { buildWordPressPostPayload } = require('../electron/wordpress-payload');
const wordpress = require('../electron/wordpress-delivery');
const { assertSignatures } = require('../scripts/verify-release-signatures.cjs');
const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
function slice(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Source markers: ${start}`);
  return source.slice(first, last);
}
function memoryStore(initial = {}) {
  let state = structuredClone(initial);
  return {
    get: (key, fallback) => Object.hasOwn(state, key) ? state[key] : fallback,
    set: (key, value) => { state[key] = value; },
    has: (key) => Object.hasOwn(state, key),
    delete: (key) => { delete state[key]; },
    onDidAnyChange: () => () => {},
    get store() { return state; },
    set store(value) { state = value; }
  };
}
function publisher({ get, post, generateCard } = {}) {
  const requests = [];
  const store = memoryStore({ settings: { autoQueueOnPublish: false, postPublishQaEnabled: false } });
  let handler;
  const identity = (value) => value;
  const context = vm.createContext({
    toAscii: require('../electron/ascii.js').toAscii,
    validateRecipeCard: require('../electron/recipe-generation').validateRecipeCard,
    hasEditorialInstructionLeak: require('../electron/article-editorial').hasEditorialInstructionLeak,
    recipeSchemaNeedsReview: require('../electron/article-recipe-readiness').recipeSchemaNeedsReview,
    stripRecipeMicrodata: require('../electron/article-recipe-readiness').stripRecipeMicrodata,
    prepareArticleRecipe: require('../electron/article-recipe-readiness').createRecipeReadinessService({ generateCard: generateCard || (async () => { throw new Error('Replicate API token is missing'); }) }),
    removeArticleImpact: require('../electron/article-impact-cleanup').removeArticleImpact,
    Buffer, URL, Date, Number, String, Object, Array, Promise, Error, createHash, store, ...wordpress,
    setTimeout: (callback) => { callback(); },
    log: { warn() {}, error() {} },
    resolveWordPressCredentials: identity,
    normalizeWordPressUrl: (url) => url.replace(/\/$/, ''),
    wordpressRequestConfig: (_url, config) => config,
    axios: {
      get: async (url) => ({ data: get ? await get(url, context) : [] }),
      post: async (url, payload) => {
        requests.push({ url, payload });
        return { data: post ? await post(url, payload, context) : { id: 73, link: 'https://site-b.example/recipe', status: payload.status } };
      }
    },
    secureIpcHandle: (_channel, callback) => { handler = callback; },
    appendStructuredData: identity, prepareAffiliateContent: identity,
    prepareWordPressContentForPerformance: identity, structuredDataWithImage: identity,
    buildWordPressPostPayload,
    updateRankMathMeta: async () => ({ status: 'skipped' }),
    deleteWordPressMedia: async () => {},
    appendPinQueue: async () => {}, schedulePostPublishQa: () => {}
  });
  vm.runInContext(slice('function contentStudioStableId(', "secureIpcHandle('create-pinterest-pin',"), context);
  return { context, run: (article, url = 'https://site-a.example') => handler({}, { article, site: { url, username: 'mock', apiKey: 'mock' } }), requests, store };
}
const article = { id: 'article-1', title: 'Updated recipe', content: '<p>NEW body</p><section id="recipe-card"><p>Prep Time: 5 minutes; Cook Time: 10 minutes; Total Time: 15 minutes; Servings: 2</p><h3>Ingredients</h3><ul><li>1 cup rice</li><li>2 cups water</li><li>1 tsp salt</li><li>1 tbsp oil</li></ul><h3>Instructions</h3><ol><li>Bring water to a boil.</li><li>Simmer rice for 10 minutes until tender.</li><li>Rest until fluffy and serve.</li></ol></section>', wordpressPostId: 42, wordpressPostUrl: 'https://site-a.example/recipe' };
function ownedPost(context, overrides = {}) {
  const identity = context.wordpressPublicationIdentity('https://site-a.example', article);
  return { id: 42, slug: context.wordpressArticleSlug(article), status: 'publish', content: { raw: context.wordpressPublicationMarker(identity) }, ...overrides };
}
function remoteError(status) { const error = new Error(`Remote failure ${status}`); error.response = { status }; return error; }

test('WordPress never reports an old receipt as success after HTTP 403', async () => {
  const app = publisher({ get: (_url, context) => ownedPost(context), post: () => { throw remoteError(403); } });
  const identity = app.context.wordpressPublicationIdentity('https://site-a.example', article);
  app.store.set('performance.wordpressPublishReceipts', [{ identity, siteUrl: 'https://site-a.example', postId: 42, status: 'publish' }]);
  await assert.rejects(app.run(article), /403/);
  assert.equal(app.requests.length, 1);
});

test('WordPress blocks leaked instructions before paid recipe repair or publishing', async () => {
  let repairs = 0;
  const app = publisher({ generateCard: async () => { repairs++; return article.content; } });
  const leaked = { ...article, content: '<p>Deliver a complete, realistic recipe with ingredient roles.</p>' + article.content };
  await assert.rejects(app.run(leaked), /EDITORIAL_REVIEW_REQUIRED/);
  await assert.rejects(app.run({ ...article, excerpt: 'READER-FIRST RECIPE EDITORIAL STANDARD:' }), /EDITORIAL_REVIEW_REQUIRED/);
  assert.equal(repairs, 0); assert.equal(app.requests.length, 0);
});

test('WordPress repairs an incomplete saved recipe before any publication and keeps the repair locally', async () => {
  const original = { ...article, wordpressPostId: undefined, content: article.content.replace('Servings: 2', 'Servings: unknown') };
  const app = publisher({ generateCard: async () => article.content });
  app.store.set('articles', [original]);
  const result = await app.run(original);
  assert.equal(result.success, true);
  assert.equal(result.recipeArticlePatch.recipeCardRepairApplied, true);
  assert.equal(app.store.get('articles')[0].content, article.content);
  assert.ok(app.requests[0].payload.content.includes('Servings: 2'));
});

test('WordPress does not publish or damage a saved article when recipe repair fails', async () => {
  const original = { ...article, content: '<p>Useful source content to preserve for a later repair.</p>'.repeat(4) };
  const app = publisher();
  app.store.set('articles', [original]);
  await assert.rejects(app.run(original), /RECIPE_REVIEW_REQUIRED/);
  assert.equal(app.requests.length, 0);
  assert.equal(app.store.get('articles')[0].content, original.content);
  assert.equal(app.store.get('articles')[0].workflowStatus, 'needs-review');
});

test('WordPress refuses a stale recipe repair if the saved article changed while AI was working', async () => {
  const original = { ...article, content: article.content.replace('Servings: 2', 'Servings: unknown') };
  let app;
  app = publisher({ generateCard: async () => { app.store.set('articles', [{ ...original, content: '<p>New user edit</p>' }]); return article.content; } });
  app.store.set('articles', [original]);
  await assert.rejects(app.run(original), /changed while its recipe/);
  assert.equal(app.requests.length, 0);
  assert.equal(app.store.get('articles')[0].content, '<p>New user edit</p>');
});

test('WordPress creates on site B without reusing site A post ID', async () => {
  const app = publisher();
  await app.run(article, 'https://site-b.example');
  assert.equal(app.requests[0].url, 'https://site-b.example/wp-json/wp/v2/posts');
});

test('WordPress refuses an unrelated post and refuses creation when lookup fails', async () => {
  const unrelated = publisher({ get: () => ({ id: 42, content: { raw: 'Another article' } }) });
  await assert.rejects(unrelated.run(article), /does not belong/);
  assert.equal(unrelated.requests.length, 0);
  const unavailable = publisher({ get: () => { throw remoteError(503); } });
  await assert.rejects(unavailable.run({ ...article, wordpressPostId: undefined }), /503/);
  assert.equal(unavailable.requests.length, 0);
});

test('WordPress reconciles only the revision actually sent, never the old content', async () => {
  for (const accepted of [false, true]) {
    let sent;
    const app = publisher({
      get: (_url, context) => ownedPost(context, sent && accepted ? { status: sent.status, content: { raw: sent.content } } : {}),
      post: (_url, payload) => { sent = payload; throw new Error('Connection interrupted'); }
    });
    if (accepted) assert.equal((await app.run(article)).success, true);
    else await assert.rejects(app.run(article), /Connection interrupted/);
    assert.equal(app.requests.length, 1);
  }
});

test('WordPress persists an unknown create before sending and prevents a blind retry', async () => {
  const fresh = { ...article, wordpressPostId: undefined };
  const app = publisher({ post: () => {
    assert.equal(app.store.get('performance.wordpressPublishReceipts')[0].status, 'unknown');
    throw new Error('Connection interrupted');
  } });
  await assert.rejects(app.run(fresh), /Connection interrupted/);
  await assert.rejects(app.run(fresh), /unknown|uncertain|could not be confirmed/i);
  assert.equal(app.requests.length, 1);
});

test('WordPress rejects an incomplete successful response and reports actual draft status', async () => {
  const invalid = publisher({ post: () => ({}) });
  await assert.rejects(invalid.run({ ...article, wordpressPostId: undefined }), /incomplete/);
  const draft = publisher({ post: () => ({ id: 73, status: 'draft' }) });
  assert.equal((await draft.run({ ...article, wordpressPostId: undefined })).status, 'draft');
});

test('WordPress serializes the same publication while a request is pending', async () => {
  let release;
  let entered;
  const waiting = new Promise((resolve) => { entered = resolve; });
  const app = publisher({ post: async () => { entered(); return new Promise((resolve) => { release = resolve; }); } });
  const fresh = { ...article, wordpressPostId: undefined };
  const first = app.run(fresh);
  await waiting;
  await assert.rejects(app.run(fresh), /already/i);
  release({ id: 73, status: 'publish' });
  await first;
  assert.equal(app.requests.length, 1);
});

test('settings migration preserves existing SQLite roots including intentionally empty data', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'content-studio-regression-'));
  let workspace;
  try {
    workspace = createWorkspaceStore(memoryStore(), directory);
    workspace.set('articles', [{ id: 'old', content: 'NEW EDIT' }, { id: 'new' }]);
    workspace.set('metaStudioProjects', []);
    workspace.database.close();
    workspace = null;
    const settings = memoryStore({ articles: [{ id: 'old', content: 'STALE' }], metaStudioProjects: [{ id: 'stale' }] });
    workspace = createWorkspaceStore(settings, directory);
    assert.equal(workspace.get('articles').length, 2);
    assert.equal(workspace.get('articles')[0].content, 'NEW EDIT');
    assert.deepEqual(workspace.get('metaStudioProjects'), []);
    assert.equal(settings.has('articles'), false);
  } finally {
    workspace?.database.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(directory, { recursive: true });
  }
});

test('regenerated Pins invalidate Meta crops, while the same verified source retains them', () => {
  const metaArticle = { id: 'a', title: 'Soup', queueStatus: 'completed', content: '<p>Soup</p>' };
  const pin = { id: 'p', articleId: 'a', localPath: 'C:/managed/p.jpg', imageQa: { dimensionsVerified: true, sha256: 'old' } };
  const existing = automaticMetaProject(metaArticle, [pin]);
  existing.imageAssets = [{ id: 'meta-social-portrait', width: 1080, height: 1350, sourceKind: 'pin', sourcePinId: 'p', localPath: 'C:/managed/crop.jpg', sourceFingerprint: metaSourceFingerprint(existing.sourceLibrary[0]), sourceSha256: 'source-bytes-hash' }];
  assert.equal(automaticMetaProject(metaArticle, [pin], existing).imageAssets.length, 1);
  const changed = { ...pin, imageQa: { ...pin.imageQa, sha256: 'new' } };
  assert.equal(automaticMetaProject(metaArticle, [changed], existing).imageAssets.length, 0);
});

test('Meta byte validation detects changed content at the same source URL', async () => {
  let bytes = Buffer.from('first image');
  const context = vm.createContext({ createHash, metaSourceFingerprint, imageSourceBuffer: async () => bytes });
  vm.runInContext(slice('async function metaAssetMatchesSource(', 'async function prepareMetaBulkGhlRows('), context);
  const input = { kind: 'pin', pinId: 'p', publicUrl: 'https://example.com/p.jpg' };
  const asset = { sourceFingerprint: metaSourceFingerprint(input), sourceSha256: createHash('sha256').update(bytes).digest('hex') };
  assert.equal(await context.metaAssetMatchesSource(asset, input), true);
  bytes = Buffer.from('new image');
  assert.equal(await context.metaAssetMatchesSource(asset, input), false);
});

test('GHL retry identity remains stable when the original schedule expires', () => {
  let now = Date.parse('2026-09-14T08:00:00Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = vm.createContext({ Date: Clock, createHash });
  vm.runInContext(slice('function formatGhlDate(', 'function clipText('), context);
  vm.runInContext(slice('function ghlIsoDate(', 'async function fetchGhlJson('), context);
  vm.runInContext(slice('function ghlUploadFingerprint(', 'function priorGhlReceipt('), context);
  for (const schedule of ['2026-09-14 10:00:00', '']) {
    now = Date.parse('2026-09-14T08:00:00Z');
    const rows = [[schedule, 'Soup', 'https://example.com/recipe', 'https://example.com/p.jpg']];
    const fingerprint = () => context.ghlUploadFingerprint({ locationId: 'l', targetPlatform: 'facebook', targetAccountIds: ['fb'], originalSchedule: rows[0][0], payload: context.ghlCreatePostPayload(context.normalizeGhlScheduleRows(rows)[0], ['fb'], 'u') });
    const initial = fingerprint();
    now += 8 * 60 * 60 * 1000;
    assert.equal(fingerprint(), initial);
  }
});

test('GHL final outcome replaces pending intent without blocking definitive failure retries', () => {
  const store = memoryStore();
  const context = vm.createContext({ store, createHash, normalizeGhlStatus: (status) => status });
  vm.runInContext(slice('function saveGhlReceipt(', 'function googleSettings('), context);
  context.saveGhlReceipt({ idempotencyKey: 'key', status: 'unknown', createdAt: 'first' });
  assert.ok(context.priorGhlReceipt('key'));
  context.saveGhlReceipt({ idempotencyKey: 'key', status: 'failed', createdAt: 'second' });
  assert.equal(context.priorGhlReceipt('key'), null);
  assert.equal(store.get('performance.ghlReceipts').length, 1);
});

test('WordPress category overrides are scoped to the destination site', async () => {
  const { manualCategoryForSite } = await import('../src/lib/wordpressCategories.js');
  const saved = { wordpressPostId: 42, wordpressSiteUrl: 'https://a.example', wordpressCategoryId: 8, wordpressCategoriesBySite: { 'https://b.example': 12 } };
  assert.equal(manualCategoryForSite(saved, { url: 'https://a.example/' }), 8);
  assert.equal(manualCategoryForSite(saved, { url: 'https://b.example' }), 12);
  assert.equal(manualCategoryForSite(saved, { url: 'https://c.example' }), '');
});

test('distribution signature gate rejects unsigned, invalid, and missing signatures', () => {
  for (const results of [[], [{ status: 'NotSigned', signer: '' }], [{ status: 'HashMismatch', signer: 'Publisher' }], [{ status: 'Valid', signer: '' }]]) {
    assert.throws(() => assertSignatures(results), /Release blocked/);
  }
  assert.doesNotThrow(() => assertSignatures([{ status: 'Valid', signer: 'Publisher' }]));
});

function ghlUploader(post, overrides = {}) {
  let now = Date.parse('2026-09-14T08:00:00Z');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const store = memoryStore({ settings: { ghlApiToken: 'mock', ghlLocationId: 'location', ghlSocialAccountIds: 'fb', ghlUserId: 'user', ...overrides.settings } });
  let handler;
  let calls = 0;
  const bodies = [];
  const context = vm.createContext({
    Date: Clock, createHash, store,
    findLogicalGhlDuplicate: require('../electron/ghl-dedupe').findLogicalGhlDuplicate,
    decryptSecret: (value) => value,
    getPinCreatorSettings: () => ({ postInterval: 120 }),
    tagGhlRows: (_headers, rows) => rows,
    normalizeGhlStatus: (status) => status,
    secureIpcHandle: (_channel, callback) => { handler = callback; },
    logProviderError: () => {},
    fetchGhlJson: async (_url, options = {}) => { calls++; bodies.push(options.body ? JSON.parse(options.body) : null); return post(store); },
    verifyGhlPost: async () => ({ verified: false, reason: 'Service unavailable' })
  });
  vm.runInContext(slice('function formatGhlDate(', 'function clipText('), context);
  vm.runInContext(slice('function parseListSetting(', 'async function fetchGhlJson('), context);
  vm.runInContext(slice('function ghlCreatedPostId(', 'async function verifyGhlPost('), context);
  vm.runInContext(slice('function responsePost(', 'function googleSettings('), context);
  vm.runInContext(slice('let ghlUploadInFlight = false;', "secureIpcHandle('generate-featured-image-prompt',"), context);
  const rows = overrides.rows || [['2026-09-14 10:00:00', 'Soup', 'https://example.com/recipe', 'https://example.com/p.jpg']];
  return { run: () => handler({}, { headers: overrides.headers || [], rows }), store, calls: () => calls, bodies, advance: () => { now += 8 * 60 * 60 * 1000; } };
}

test('actual GHL uploader records intent and blocks uncertain retries after date expiry', async () => {
  const app = ghlUploader((store) => {
    assert.equal(store.get('performance.ghlReceipts')[0].status, 'unknown');
    throw new Error('Connection interrupted');
  });
  assert.equal((await app.run()).success, false);
  app.advance();
  assert.match((await app.run()).error, /unknown remote outcome/);
  assert.equal(app.calls(), 1);
  assert.equal(app.store.get('performance.ghlReceipts')[0].locationId, 'location');
});

test('GHL treats embedded server failures as unknown and definitive rejections as retryable', async () => {
  for (const statusCode of [400, 503]) {
    const app = ghlUploader(() => ({ response: { ok: true, status: 200 }, body: { success: false, statusCode, message: 'Rejected' } }));
    await app.run();
    await app.run();
    assert.equal(app.calls(), statusCode === 400 ? 2 : 1);
    assert.equal(app.store.get('performance.ghlReceipts').length, 1);
  }
});

test('GHL never recreates a remote ID whose previous outcome cannot be verified', async () => {
  const app = ghlUploader(() => ({ response: { ok: true, status: 201 }, body: { id: 'remote-id' } }));
  await app.run();
  const receipts = app.store.get('performance.ghlReceipts');
  receipts[0].status = 'unknown';
  app.advance();
  assert.match((await app.run()).error, /could not be verified/);
  assert.equal(app.calls(), 1);
});

test('WordPress refuses a malformed successful lookup response', async () => {
  const app = publisher({ get: () => ({ error: 'Unexpected proxy response' }) });
  await assert.rejects(app.run({ ...article, wordpressPostId: undefined }), /invalid post lookup/);
  assert.equal(app.requests.length, 0);
});

test('GHL verifies the documented results.post envelope and rejects false-positive responses', async () => {
  const good = { success: true, results: { post: { _id: 'p1', locationId: 'l1', status: 'scheduled' } } };
  const cases = [
    [good, true], [{ post: { id: 'p1' } }, true],
    [{}, false], [{ success: false, post: { id: 'p1' } }, false],
    [{ statusCode: 503, post: { id: 'p1' } }, false],
    [{ post: { id: 'other' } }, false],
    [{ post: { id: 'p1', locationId: 'other' } }, false]
  ];
  for (const [body, expected] of cases) {
    const context = vm.createContext({
      setTimeout: (callback) => callback(),
      fetchGhlJson: async () => ({ response: { ok: true, status: 200 }, body })
    });
    vm.runInContext(slice('function ghlCreatedPostId(', 'function saveGhlReceipt('), context);
    assert.equal((await context.verifyGhlPost({ postId: 'p1', locationId: 'l1', headers: {} })).verified, expected);
    if (body === good) assert.equal(context.ghlCreatedPostId(body), 'p1');
  }
});

for (const preparationFailure of [false, true]) {
test(preparationFailure ? 'bulk WordPress preparation failure does not skip the later articles or leave the batch locked' : 'bulk WordPress reporting separates public posts, drafts, and unsuccessful responses', async () => {
  const component = fs.readFileSync(path.join(__dirname, '../src/components/ArticlesList.jsx'), 'utf8');
  const start = component.indexOf('  async function bulkPublishToWordPress()');
  const end = component.indexOf('  async function bulkSendToPinCreator()', start);
  const statuses = [];
  const saved = [];
  const context = vm.createContext({
    bulkSite: { url: 'https://example.com', categories: [{ id: 1 }] },
    bulkWorking: '', bulkPublishRef: { current: false },
    selectedArticles: preparationFailure ? [{ id: 'rejected' }, { id: 'publish' }, { id: 'draft' }] : [{ id: 'publish' }, { id: 'draft' }, { id: 'rejected' }], settings: {},
    confirmAction: async () => true, setBulkWorking() {}, setBulkProgress() {},
    setBulkStatus: (message) => statuses.push(message),
    publishReadyArticle: (value) => { if (preparationFailure && value.id === 'rejected') throw new Error('Invalid draft preparation'); return value; }, manualCategoryForSite: () => '',
    matchWordPressCategory: () => ({ category: { id: 1 } }), refreshArticles: async () => {},
    electronAPI: {
      pushToWordPress: async ({ article }) => ({ success: article.id !== 'rejected', status: article.id, postId: 42, recipeArticlePatch: { content: 'Validated repair' } }),
      saveArticle: async (value) => saved.push(value)
    }
  });
  vm.runInContext(component.slice(start, end), context);
  await context.bulkPublishToWordPress();
  assert.equal(saved.length, 2);
  assert.equal(saved[0].content, 'Validated repair');
  assert.equal(context.bulkPublishRef.current, false);
  assert.match(statuses.at(-1), /Published 1\. Needs review 1\. Warnings 0\. Failed 1/);
});
}

test('a Facebook row never falls back to an account that is dedicated to Instagram', async () => {
  const app = ghlUploader(() => ({ response: { ok: true, status: 201 }, body: { id: 'remote-id' } }), {
    settings: { ghlSocialAccountIds: 'fb,ig', ghlInstagramAccountIds: 'ig' },
    headers: ['postAtSpecificTime', 'content', 'link', 'imageUrls', 'Category'],
    rows: [['2026-09-14 10:00:00', 'A bright lemon rice dinner for busy weeknights.', '', 'https://example.com/p.jpg', 'Facebook']]
  });
  await app.run();
  assert.equal(app.calls(), 1);
  assert.deepEqual(app.bodies[0].accountIds, ['fb']);
});
