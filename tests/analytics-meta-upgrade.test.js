const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { analyticsConfig, articleUrl, buildAnalyticsSnapshot, fetchAnalyticsSnapshot, analyticsWorkspace, websiteEvidence } = require('../electron/google-analytics');
const { automaticMetaContent } = require('../electron/meta-auto-pack');
const { recipePreview, withoutArticleLinks, enforceRecipeCaptions, metaRowsWithoutLinks } = require('../electron/meta-captions');

const config = analyticsConfig({ googleAnalyticsMeasurementId: 'g-abcd1234', googleAnalyticsPropertyId: '123456', googleAnalyticsSiteUrl: 'https://food.example/site/' });
const now = new Date('2026-10-11T12:00:00Z');
function report(rows = []) {
  return { dimensionHeaders: [{ name: 'landingPagePlusQueryString' }, { name: 'sessionSourceMedium' }], metricHeaders: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'userEngagementDuration' }], rowCount: rows.length, rows: rows.map(([page, source, ...metrics]) => ({ dimensionValues: [{ value: page }, { value: source }], metricValues: metrics.map((value) => ({ value: String(value) })) })), metadata: { timeZone: 'America/New_York' } };
}
const settings = { googleAnalyticsMeasurementId: config.measurementId, googleAnalyticsPropertyId: config.propertyId, googleAnalyticsSiteUrl: config.siteUrl };
const articles = [{ id: 'a', title: 'Lemon Chickpea Salad', wordpressPostUrl: 'https://food.example/salad/', seoBrief: { targetKeyword: 'lemon chickpea salad' } }, { id: 'b', title: 'Foreign recipe', wordpressPostUrl: 'https://elsewhere.example/salad' }];
const card = '<section id="recipe-card"><h2 itemprop="name">Lemon Chickpea Salad</h2><p>Prep Time: 10 minutes; Cook Time: 0 minutes; Total Time: 10 minutes; Servings: 4</p><h3>Ingredients</h3><ul><li>2 cups cooked chickpeas</li><li>1 tbsp lemon juice</li><li>1 tbsp olive oil</li></ul><h3>Instructions</h3><ol><li>Whisk lemon juice and oil until evenly combined.</li><li>Toss chickpeas until evenly coated.</li><li>Serve chilled.</li></ol></section>';

test('tracking code cannot act as a report credential and settings reject executable snippets', async () => {
  assert.equal(config.measurementId, 'G-ABCD1234');
  assert.equal(config.siteUrl, 'https://food.example');
  assert.throws(() => analyticsConfig({ googleAnalyticsMeasurementId: '<script>gtag()</script>' }), /G- tracking ID only/);
  assert.throws(() => analyticsConfig({ googleAnalyticsPropertyId: 'G-ABCD1234' }), /numeric/);
  assert.throws(() => analyticsConfig({ googleAnalyticsSiteUrl: 'https://user:secret@food.example' }), /public HTTPS/);
  let called = false;
  await assert.rejects(fetchAnalyticsSnapshot({ settings: { googleAnalyticsMeasurementId: 'G-ABCD1234' }, request: async () => { called = true; } }), /tracking ID alone/);
  assert.equal(called, false);
});

test('Analytics URL identity retains recipe queries and case while discarding only trackers', () => {
  assert.equal(articleUrl('/Salad/?recipe=2&utm_source=pinterest#card', config.siteUrl), 'https://food.example/Salad?recipe=2');
  assert.notEqual(articleUrl('/Salad', config.siteUrl), articleUrl('/salad', config.siteUrl));
  assert.equal(articleUrl('//elsewhere.example/salad', config.siteUrl), '');
  assert.equal(articleUrl('/', config.siteUrl), '');
  assert.equal(articleUrl('/(not set)', config.siteUrl), '');
});

test('GA4 weights aggregated sessions correctly and distinguishes Pinterest from spoofed sources', () => {
  const snapshot = buildAnalyticsSnapshot({ config, now, current: report([
    ['/salad/?utm_source=pinterest', 'pinterest / social', 40, 30, 1200], ['/salad', 'google / organic', 60, 45, 3000], ['/salad', 'pinterest.fake.evil / referral', 10, 5, 100]
  ]), previous: report([['/salad', 'google / organic', 50, 30, 1000]]) });
  const page = snapshot.pages[0];
  assert.equal(page.sessions, 110);
  assert.equal(page.engagedSessions, 80);
  assert.equal(page.pinterestSessions, 40);
  assert.equal(page.averageEngagementSeconds, 39);
  assert.equal(page.growthPercent, 120);
  const workspace = analyticsWorkspace(snapshot, settings, articles, now);
  assert.equal(workspace.recommendations.length, 1);
  assert.equal(websiteEvidence(workspace, 'lemon chickpea').length, 1);
  assert.equal(websiteEvidence(workspace, 'chocolate pie').length, 0);
  assert.equal(websiteEvidence(analyticsWorkspace(snapshot, settings, articles, new Date('2026-11-01')), 'lemon chickpea').length, 0);
  assert.equal(analyticsWorkspace(snapshot, { ...settings, googleAnalyticsPropertyId: '999' }, articles, now).snapshot, null);
});

test('small baselines never become fake growth evidence and thresholded reports are not used', () => {
  const snapshot = buildAnalyticsSnapshot({ config, now, current: report([['/salad', 'google / organic', 8, 7, 500]]), previous: report([['/salad', 'google / organic', 1, 1, 5]]) });
  assert.equal(snapshot.pages[0].growthPercent, null);
  assert.equal(snapshot.pages[0].confidence, 'low');
  assert.equal(websiteEvidence(analyticsWorkspace(snapshot, settings, articles, now), 'lemon chickpea').length, 0);
  snapshot.limited = true;
  snapshot.pages[0].sessions = 100;
  assert.equal(websiteEvidence(analyticsWorkspace(snapshot, settings, articles, now), 'lemon chickpea').length, 0);
});

test('Analytics reports use read-only authenticated requests without redirects and nonoverlapping periods', async () => {
  const requests = [];
  const snapshot = await fetchAnalyticsSnapshot({ settings, token: 'test-token', now, request: async (url, body, options) => { requests.push({ url, body, options }); return { data: report([['/salad', 'pinterest / social', 100, 80, 4000]]) }; } });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport');
  assert.equal(requests[0].options.maxRedirects, 0);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
  assert.equal(requests[0].body.dimensionFilter.filter.stringFilter.value, 'food.example');
  assert.ok(requests[1].body.dateRanges[0].endDate < requests[0].body.dateRanges[0].startDate);
  assert.equal(JSON.stringify(snapshot).includes('test-token'), false);
});

test('Meta captions use a validated real recipe preview, no links and no invented incomplete card', () => {
  const article = { title: 'Lemon Chickpea Salad', content: card };
  assert.match(recipePreview(article), /2 cups cooked chickpeas/);
  assert.match(recipePreview(article), /not the full recipe/);
  assert.equal(recipePreview({ content: '<section id="recipe-card"><li>Magic ingredient</li></section>' }), '');
  const content = automaticMetaContent(article, { description: 'Fresh lunch. Visit our website https://food.example/salad/' });
  for (const caption of [content.facebook.primaryPost, content.instagram.feedCaption]) {
    assert.match(caption, /1 tbsp lemon juice/);
    assert.match(caption, /Send us a message/);
    assert.doesNotMatch(caption, /https?:|link in|on the blog|comment RECIPE|automatically/i);
  }
  const revised = enforceRecipeCaptions(content, article);
  assert.equal((revised.facebook.primaryPost.match(/Recipe preview \(not the full recipe\):/g) || []).length, 1);
  assert.equal((revised.facebook.primaryPost.match(/Send us a message/g) || []).length, 1);
  assert.doesNotMatch(withoutArticleLinks('<a href="https://food.example">Recipe</a> https://food.example/salad'), /https?:|href/);
});

test('native GHL Meta rows do not inject a destination or follow-up link while other exports retain theirs', async () => {
  const source = fs.readFileSync(require.resolve('../electron/main'), 'utf8');
  const start = source.indexOf('async function buildGhlSocialRows(');
  const end = source.indexOf('\nfunction ghlRowsToCsvPayload(', start);
  const context = vm.createContext({ withoutArticleLinks, withPinImageFallbacks: (packs) => packs, getPinCreatorSettings: () => ({ postInterval: 60 }), firstFutureSlot: () => new Date(), preferredPlatformAsset: () => null, sharedSocialAsset: () => null, publicImageUrlForAsset: async () => 'https://images.example/p.jpg', contentPrefixFor: () => 'feed', trackedPackUrl: (pack) => pack.sourceUrl, replaceSourceUrlInText: (caption) => caption, captionWithHashtags: (caption) => caption, formatGhlDate: (date) => date.toISOString() });
  vm.runInContext(source.slice(start, end), context);
  const result = await context.buildGhlSocialRows([{ campaignStyle: 'meta-traffic', sourceUrl: 'https://food.example/salad', content: { facebook: { pagePost: 'Recipe https://food.example/salad' }, instagram: { caption: 'Tasty recipe' } } }, { campaignStyle: 'social', sourceUrl: 'https://food.example/other', content: { facebook: { pagePost: 'Other recipe' } } }]);
  for (const row of result.rows.slice(0, 2)) { assert.equal(row[2], ''); assert.equal(row[11], ''); assert.doesNotMatch(row[1], /https?:/); }
  assert.equal(result.rows[2][2], 'https://food.example/other');
});

test('feed-only Meta drafts are not penalized for missing carousel or video plans', async () => {
  const { scoreMetaContent } = await import('../src/lib/metaQuality.mjs');
  const result = scoreMetaContent(automaticMetaContent({ title: 'Lemon Chickpea Salad', content: card }), { imageAssets: [{ publicUrl: 'https://images.example/p.jpg' }] });
  assert.equal(result.checks.some((check) => ['ig-reel', 'ig-carousel', 'ig-production'].includes(check.id)), false);
  assert.equal(result.checks.find((check) => check.id === 'public-link').passed, true);
});

test('previously prepared or edited Meta rows lose destination links but retain image addresses and schedules', () => {
  const headers = ['postAtSpecificTime (YYYY-MM-DD HH:mm:ss)', 'content', 'link (OGmetaUrl)', 'imageUrls', 'followUpComment'];
  const rows = [['2026-10-12 12:00:00', 'Salad https://food.example/salad', 'https://food.example/salad', 'https://images.example/p.jpg', 'Full recipe: https://food.example/salad']];
  const result = metaRowsWithoutLinks(headers, rows);
  assert.equal(result[0][0], rows[0][0]);
  assert.equal(result[0][3], rows[0][3]);
  assert.equal(result[0][2], '');
  assert.equal(result[0][4], '');
  assert.equal(result[0][1], 'Salad');
  assert.equal(rows[0][2], 'https://food.example/salad');
});

test('local Trends fallback stays on the requested topic and does not label inferred demand as proven', () => {
  const source = fs.readFileSync(require.resolve('../electron/main'), 'utf8');
  const context = vm.createContext({ keywordTokens: (text) => String(text).toLowerCase().split(/\W+/).filter(Boolean), removeEmDashes: (value) => value, classifyKeywordEvidence: () => ({ evidenceConfidence: 'low', evidenceLabel: 'Evergreen inference' }) });
  vm.runInContext(source.slice(source.indexOf('function fallbackKeywordResearch('), source.indexOf('\nfunction cannibalizationMatch(')), context);
  const plan = context.fallbackKeywordResearch({ seed: 'chickpea salad', evidence: [{ keyword: 'chocolate cake', score: 100, pinClicks: 500, boards: [] }], liveTrends: [{ title: 'Political election', traffic: '1M' }] });
  assert.ok(plan.keywords.every((entry) => entry.keyword.includes('chickpea salad')));
  assert.equal(plan.keywords.some((entry) => entry.keyword.includes('chocolate')), false);
  assert.match(plan.summary, /planning ideas, not proven demand/);
  assert.equal(plan.seasonalOpportunities.length, 0);
});

test('clearing Google credentials also clears cached access and Analytics reports', () => {
  const source = fs.readFileSync(require.resolve('../electron/main'), 'utf8');
  const saved = { googleClientSecret_encrypted: 'encrypted', googleRefreshToken_encrypted: 'encrypted' };
  const removed = [];
  let handler;
  const context = vm.createContext({ secureIpcHandle: (_name, callback) => { handler = callback; }, store: { get: () => saved, set: (_key, value) => Object.assign(saved, value), delete: (key) => removed.push(key) }, googleAccessTokenCache: { token: 'cached-access', expiresAt: Date.now() + 3600000 } });
  vm.runInContext(source.slice(source.indexOf("secureIpcHandle('clear-stored-credential'"), source.indexOf("secureIpcHandle('connect-google-search-console'")), context);
  assert.equal(handler(null, { credential: 'google' }).success, true);
  assert.equal(context.googleAccessTokenCache.token, '');
  assert.ok(removed.includes('trendResearch.googleAnalytics'));
});
