const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { assessEditorialGaps, READER_RECIPE_GUIDANCE } = require('../electron/article-editorial');
const { createReplicatePoller } = require('../electron/replicate-polling');
const { eligibleWordPressPins } = require('../electron/wordpress-pin-retention');
const { validateRecipeCard, replaceRecipeCard } = require('../electron/recipe-generation');

const card = '<section id="recipe-card"><p>Prep Time: 10 minutes; Cook Time: 0 minutes; Total Time: 10 minutes; Servings: 2</p><h3>Ingredients</h3><ul><li>1 cup yogurt</li><li>1 cup berries</li><li>1 tsp honey</li></ul><h3>Instructions</h3><ol><li>Stir honey into yogurt until smooth.</li><li>Fold in berries until evenly combined.</li><li>Serve chilled.</li></ol></section>';
const useful = '<p>Make a cold berry bowl with creamy yogurt and sweet honey.</p><h2>Ingredient choices and substitutions</h2><p>Swap berries for chopped peaches for a softer bite.</p><h2>Prevent mistakes</h2><p>Avoid wet berries: dry them before mixing to prevent watery yogurt.</p><h2>Storage and serving</h2><p>Serve chilled. Store in a covered container in the refrigerator.</p>' + card;

test('editorial checks skip a useful cold recipe without demanding reheating or fake testing', () => {
  assert.deepEqual(assessEditorialGaps(useful), { needsRevision: false, issues: [], recipeReady: true });
  assert.equal(assessEditorialGaps('<p>Generic introduction</p>' + card).needsRevision, true);
  assert.match(READER_RECIPE_GUIDANCE, /Never.*invent|Never invent/);
});

test('successful paid companion work is checkpointed before a failure is raised', async () => {
  const { checkpointParallelTasks } = await import('../src/lib/generationCheckpoint.mjs');
  let saved;
  await assert.rejects(checkpointParallelTasks({ featured: Promise.resolve({ localPath: 'photo.webp' }), imagePrompts: Promise.reject(new Error('Prompt failed')) }, async (patch) => { saved = patch; }), /Prompt failed/);
  assert.deepEqual(saved, { featured: { localPath: 'photo.webp' } });
  const both = await checkpointParallelTasks({ title: 'Useful title', prompt: Promise.resolve('food') }, async () => {});
  assert.deepEqual(both, { title: 'Useful title', prompt: 'food' });
  await assert.rejects(checkpointParallelTasks({ prompt: Promise.reject(null) }, async () => {}), /Generation task failed/);
});

test('polling retries temporary reads of the SAME prediction without submitting or canceling a successful run', async () => {
  const requests = [];
  let canceled = 0;
  const poll = createReplicatePoller({ delay: async () => {}, cancel: async () => canceled++, get: async (url) => {
    requests.push(url);
    if (requests.length === 1) { const error = new Error('Busy'); error.response = { status: 503 }; throw error; }
    return { data: { status: 'succeeded', output: ['Done', '!'] } };
  } });
  assert.equal(await poll('existing-id', 'token'), 'Done!');
  assert.equal(new Set(requests).size, 1);
  assert.equal(canceled, 0);
});

test('polling timeout and cancellation stop remote work and do not trigger blind resubmission', async () => {
  let canceled = 0;
  const poll = createReplicatePoller({ delay: async () => {}, cancel: async () => canceled++, get: async () => ({ data: { status: 'processing' } }) });
  await assert.rejects(poll('existing-id', 'token', { maxAttempts: 2 }), (error) => error.noRetry === true && /timed out/.test(error.message));
  assert.equal(canceled, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(poll('second-id', 'token', { signal: controller.signal }), /Cancelled by user/);
  assert.equal(canceled, 2);
});

test('media polling preserves structured output and a closed progress view cannot discard it', async () => {
  const output = ['https://replicate.delivery/finished.webp'];
  const poll = createReplicatePoller({ delay: async () => {}, cancel: async () => { throw new Error('Should not cancel success'); }, get: async () => ({ data: { status: 'succeeded', output } }) });
  assert.deepEqual(await poll('image', 'token', { preserveOutput: true, onProgress: () => { throw new Error('View closed'); } }), output);
});

test('article images and videos use managed polling and video retains a longer provider deadline', () => {
  const source = fs.readFileSync(require.resolve('../electron/main.js'), 'utf8');
  // Check the actual media handlers, not just the helper implementation.
  const start = source.lastIndexOf('const id = res.data.id;', source.indexOf("secureIpcHandle('generate-video'"));
  const end = source.indexOf("secureIpcHandle('get-generated-videos'");
  assert.ok(start > 0 && end > start);
  const media = source.slice(start, end);
  assert.match(media, /onProgress: \(progress\) => emitProgress\('image-generation-progress'/);
  assert.match(media, /onProgress: \(progress\) => emitProgress\('video-generation-progress'/);
  assert.match(media, /predictionDeadlineSeconds: 660/);
  assert.doesNotMatch(media, /await axios\.get\(`https:\/\/api\.replicate/);
});

test('malformed import records protect hosted media instead of interrupting or deleting it', () => {
  const record = { kind: 'finished-pinterest-pin', mediaId: 7, url: 'https://site.example/pin.jpg', uploadedAt: '2026-09-01T00:00:00Z' };
  const now = Date.parse('2026-10-11T00:00:00Z');
  for (const batch of [null, { rows: [null] }, { rows: [{}] }, { rows: null }]) assert.equal(eligibleWordPressPins([record], [batch], now).length, 0);
  assert.equal(eligibleWordPressPins([record], [], now).length, 1);
});

test('recipe navigation is idempotent and does not add paid calls or scripts', async () => {
  const { ensureRecipeCard, scoreArticle } = await import('../src/lib/articlePostProcess.mjs');
  const once = ensureRecipeCard(useful);
  assert.equal(ensureRecipeCard(once), once);
  assert.equal((once.match(/Jump to Recipe/g) || []).length, 1);
  assert.doesNotMatch(once, /<script|onclick|javascript:/i);
  assert.equal(scoreArticle({ title: 'Berry bowl', content: once }, once).checks.find((check) => check.id === 'recipeCard').ok, true);
});

test('actual article generation avoids a second paid rewrite when reader checks already pass', async () => {
  const source = fs.readFileSync(require.resolve('../electron/main.js'), 'utf8');
  const start = source.indexOf("secureIpcHandle('generate-article',");
  const end = source.indexOf('async function prepareArticleRecipe', start);
  let handler;
  const calls = [];
  const paragraphs = Array.from({ length: 12 }, (_, index) => `<p>Part ${index}: ${'Choose ripe berries and dry them carefully before adding to yogurt. '.repeat(5)}</p>`).join('');
  const content = paragraphs + useful;
  const context = vm.createContext({
    READER_RECIPE_GUIDANCE, assessEditorialGaps, validateRecipeCard, replaceRecipeCard,
    isNonFoodArticle: require('../electron/article-recipe-readiness').isNonFoodArticle,
    AbortController, Map, Promise, Error, setTimeout, activeJobs: new Map(),
    secureIpcHandle: (_channel, fn) => { handler = fn; },
    resolveReplicateApiToken: () => 'test-token', relevantPinterestSignals: () => [], getAIModelUrl: () => 'test-url',
    stripHtml: (html) => html.replace(/<[^>]+>/g, ' '), log: { warn() {} },
    replicateRequest: async (_url, body) => { calls.push(body); return { data: { id: `prediction-${calls.length}` } }; },
    pollReplicate: async () => content
  });
  vm.runInContext(source.slice(start, end), context);
  const result = await handler({}, { title: 'Berry Bowl', settings: { articleLength: '600-800', articlePrompt: 'Write {title}', smartQualityPass: true } });
  assert.equal(calls.length, 1);
  assert.equal(result.qualityPassApplied, false);
  assert.equal(result.editorialChecks.needsRevision, false);
  assert.match(calls[0].input.prompt, /READER-FIRST RECIPE EDITORIAL STANDARD/);
});
