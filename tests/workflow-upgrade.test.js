const test = require('node:test');
const assert = require('node:assert/strict');
const { mapBounded, runSerial } = require('../electron/bounded-work');
const { removeArticleImpact } = require('../electron/article-impact-cleanup');
const { eligibleWordPressPins, cleanupWordPressPins } = require('../electron/wordpress-pin-retention');
const { validateRecipeCard } = require('../electron/recipe-generation');
const { hasPinterestDimensions } = require('../electron/pinterest-delivery');

test('bounded checks preserve row order and serialize uploads to the same site', async () => {
  let active = 0;
  let maximum = 0;
  const result = await mapBounded([1, 2, 3, 4, 5, 6], 4, async (value) => {
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 8 - value));
    active--;
    return value;
  });
  assert.deepEqual(result, [1, 2, 3, 4, 5, 6]);
  assert.equal(maximum, 4);
  maximum = 0;
  await Promise.all([1, 2, 3].map(() => runSerial('site', async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
  })));
  assert.equal(maximum, 1);
});

const now = Date.parse('2026-10-06T12:00:00Z');
const record = { kind: 'finished-pinterest-pin', mediaId: 71, siteUrl: 'https://site.example', url: 'https://site.example/pin.jpg', uploadedAt: '2026-09-20T12:00:00Z' };
const batch = (status, date = '') => ({ fileStatus: 'ready', rows: [{ number: 1, cells: ['Title', record.url, '', '', '', '', date] }], outcomes: { 1: { status, reportedAt: '2026-09-22T12:00:00Z' } } });

test('WordPress retention protects pending imports, future publication and fresh uploads', () => {
  assert.equal(eligibleWordPressPins([record], [], now).length, 1);
  assert.equal(eligibleWordPressPins([record], [batch('pending')], now).length, 0);
  assert.equal(eligibleWordPressPins([record], [batch('confirmed', '2026-10-08T12:00:00')], now).length, 0);
  assert.equal(eligibleWordPressPins([record], [batch('confirmed', '2026-09-22T12:00:00')], now).length, 1);
  assert.equal(eligibleWordPressPins([{ ...record, uploadedAt: '2026-10-01T12:00:00Z' }], [], now).length, 0);
  assert.equal(eligibleWordPressPins([{ ...record, kind: 'article-image' }], [], now).length, 0);
});

test('WordPress cleanup checks exact identity, attachment and references before deleting', async () => {
  for (const mode of ['owned', 'attached', 'changed', 'referenced', 'check-failed']) {
    let deleted = 0;
    let saved = 0;
    const result = await cleanupWordPressPins({
      records: [record], batches: [], now,
      inspect: async () => ({ id: 71, post: mode === 'attached' ? 2 : 0, source_url: mode === 'changed' ? 'https://site.example/article.jpg' : record.url }),
      isReferenced: async () => { if (mode === 'check-failed') throw new Error('Site unavailable'); return mode === 'referenced'; },
      remove: async () => { deleted++; }, save: async () => { saved++; }
    });
    assert.equal(deleted, mode === 'owned' ? 1 : 0);
    assert.equal(saved, deleted);
    if (mode === 'check-failed') assert.equal(result[0].error, 'Site unavailable');
  }
});

test('Impact removal keeps prose, recipes and Amazon links', () => {
  const original = {
    content: '<p data-affiliate-disclosure="true">Paid links</p><p>Use <a data-affiliate-id="impact" href="https://shop.pxf.io/product">a bowl</a>.</p><aside data-affiliate-recommendation="true"><a href="https://shop.pxf.io/product">Buy bowl</a></aside><section id="recipe-card">Cook.</section><a data-affiliate-id="amazon" href="https://amazon.com/dp/B000000001?tag=site">Pan</a>',
    affiliateLinks: [{ id: 'impact', source: 'impact' }, { id: 'amazon', source: 'amazon' }]
  };
  const cleaned = removeArticleImpact(original);
  assert.match(cleaned.content, /Use a bowl/);
  assert.match(cleaned.content, /recipe-card/);
  assert.match(cleaned.content, /amazon.com/);
  assert.doesNotMatch(cleaned.content, /pxf.io|Buy bowl/);
  assert.deepEqual(cleaned.affiliateLinks.map((item) => item.id), ['amazon']);
  assert.deepEqual(removeArticleImpact(cleaned), cleaned);
});

const card = '<section id="recipe-card"><p>Prep Time: 10 minutes Cook Time: 20 minutes Total Time: 30 minutes Servings: 4</p><h3>Ingredients</h3><ul><li>1 lb chicken</li><li>1 tbsp oil</li><li>1 tsp salt</li></ul><h3>Instructions</h3><ol><li>Heat oil until shimmering.</li><li>Cook for 20 minutes until a thermometer in the thickest part reads 165 F.</li><li>Rest and serve.</li></ol></section>';
test('recipe checks reject missing cards, unsafe poultry and contradictory times or yield', () => {
  assert.equal(validateRecipeCard(card).ok, true);
  assert.equal(validateRecipeCard('').ok, false);
  assert.equal(validateRecipeCard(card.replace('165 F', '150 F')).ok, false);
  assert.equal(validateRecipeCard(card.replace('30 minutes', '5 minutes')).ok, false);
  assert.equal(validateRecipeCard(card.replace('Servings: 4', 'Servings: 0')).ok, false);
});

test('new portrait dimensions and existing legacy Pins are both exportable', () => {
  assert.equal(hasPinterestDimensions({ width: 1080, height: 1920 }), true);
  assert.equal(hasPinterestDimensions({ width: 1000, height: 1500 }), true);
  assert.equal(hasPinterestDimensions({ width: 1200, height: 800 }), false);
});

test('bounded failures wait for already-running work before releasing the caller', async () => {
  let finished = false;
  await assert.rejects(mapBounded([0, 1], 2, async (value) => {
    if (!value) throw new Error('Failed');
    await new Promise((resolve) => setTimeout(resolve, 10));
    finished = true;
  }), /Failed/);
  assert.equal(finished, true);
});

test('invalid retention outcomes and dates never authorize deletion', () => {
  for (const item of [batch('unknown'), batch('confirmed', 'not-a-date'), { rows: null }]) {
    assert.equal(eligibleWordPressPins([record], [item], now).length, 0);
  }
  assert.equal(eligibleWordPressPins([record], [batch('confirmed', '2026-10-08T12:00:00Z')], now).length, 0);
});

test('recipe thermometer checks accept common HTML degree entities', () => {
  assert.equal(validateRecipeCard(card.replace('165 F', '165&deg;F')).ok, true);
});

test('Meta bulk work runs two ordered workers without duplicate article images', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const source = fs.readFileSync(require('node:path').join(__dirname, '../electron/main.js'), 'utf8');
  const start = source.indexOf('async function prepareMetaBulkGhlRows(');
  const end = source.indexOf("secureIpcHandle('get-meta-projects'", start);
  const articles = [1, 2, 3, 4].map((id) => ({ id, title: String(id), content: 'Recipe', queueStatus: 'completed' }));
  let active = 0;
  let maximum = 0;
  let order;
  const state = {};
  const context = vm.createContext({
    mapBounded, store: { get: (key, fallback) => key === 'articles' ? articles : state[key] || fallback, set: (key, value) => { state[key] = value; } },
    pinCreatorPins: () => [], syncAutomaticMetaProjects: () => [],
    automaticMetaProject: (article) => ({ id: article.id, articleId: article.id }),
    metaProjectSource: (project) => ({ id: project.id, kind: 'pin', pinId: project.id }),
    metaProjectPack: (article) => ({ articleId: article.id, imageAssets: [] }),
    hasCompleteMetaPlatformAssets: (assets) => !!assets.length,
    createRepurposeImageVariants: async ({ packs }) => {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 8 - packs[0].articleId));
      active--;
      return { success: true, packs: [{ ...packs[0], imageAssets: [{ id: 'meta-social-portrait' }] }] };
    },
    buildGhlSocialRows: async (packs) => { order = packs.map((pack) => pack.articleId); return { headers: [], rows: packs.map(() => ['', '', '', 'https://site.example/meta.jpg']) }; },
    emitMetaBulkProgress: () => {}, emitProgress: () => {}
  });
  vm.runInContext(source.slice(start, end), context);
  const result = await context.prepareMetaBulkGhlRows(articles.map((article) => article.id));
  assert.equal(result.success, true);
  assert.equal(maximum, 2);
  assert.deepEqual(Array.from(order), [1, 2, 3, 4]);
  assert.equal(result.failures.length, 0);
  assert.equal(state.metaStudioProjects.length, 4);
});
