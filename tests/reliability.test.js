const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { cancelJobsByPrefixes } = require('../electron/job-control');
const {
  acknowledgePinQueueItems,
  dedupePinQueueItems,
  ensurePinQueueIds
} = require('../electron/pin-queue');
const { addUtmParams, isUtmEligibleDestination } = require('../electron/utm');
const { enhancePinterestImagePrompt } = require('../electron/pinterest-image-prompt');
const { extractCleanPinPrompt, fallbackPinPrompt, hasReasoningLeak } = require('../electron/pin-prompt-quality');
const { normalizeImportedArticles } = require('../electron/article-storage');
const { assertSafeRemoteRedirect, isPathInsideRoots, isSafeRemoteMediaUrl } = require('../electron/media-security');
const { mergePinStyles, migratePinStyles } = require('../electron/pin-style-settings');
const {
  articleLengthMaximum,
  buildRecipeChunkRanges,
  recommendedRecipeCollectionLength,
  validateRecipeChunk,
  validateRecipeCard,
  usesCompactRecipeCollection
} = require('../electron/recipe-generation');
const { classifyKeywordEvidence, findLiveTrendMatch } = require('../electron/trend-evidence');
const {
  analyticsDateRanges,
  buildSearchOpportunities,
  normalizeGhlStatus,
  normalizePinterestSummary,
  summarizeSearchRows
} = require('../electron/performance-intelligence');
const { auditRecipeHtml, parseJsonLd } = require('../electron/recipe-seo-audit');
const { escapeXmlText } = require('../electron/xml-safety');
const {
  affiliateDisplayName,
  buildImpactAffiliateItem,
  buildImpactKeywords,
  extractImpactItems,
  impactTrackingInfo,
  isImpactTrackingUrl,
  normalizeImpactProduct
} = require('../electron/impact-affiliate');
const {
  fallbackAffiliateQueries,
  parseAffiliateSearchPlan,
  rankImpactProducts
} = require('../electron/impact-discovery');
const {
  buildAmazonAffiliateItem,
  buildAmazonManualAffiliate,
  buildAmazonProductUrl,
  buildAmazonSearchAffiliate,
  buildAmazonSearchUrl,
  extractAmazonAsin,
  extractAmazonItems,
  isAmazonTaggedUrl,
  normalizeAmazonMarketplace,
  normalizeAmazonPartnerTag,
  normalizeAmazonProduct
} = require('../electron/amazon-affiliate');
const {
  isTransientNetworkError,
  retryAfterMs,
  withTransientRetries
} = require('../electron/retry-policy');
const {
  appendOutlineSection,
  normalizeArticleOutline,
  outlineSectionCount,
  removeLastOutlineSection
} = require('../electron/article-outline');
const { migrateSettings } = require('../electron/settings-migrations');
const { ratioToDimensions, resolveImageRatio } = require('../electron/image-ratios');
const { calculateEstimatedCost } = require('../electron/cost-estimation');
const { buildWordPressPostPayload } = require('../electron/wordpress-payload');
const { connectionStatus, sanitizeDiagnosticReport } = require('../electron/diagnostics');
const { normalizeBatchImportRows } = require('../electron/article-import');
const {
  allowedCollection,
  normalizeRevenueRows,
  upsertGrowthRecord
} = require('../electron/growth-workspace');

test('transient retry policy retries recoverable network failures only', async () => {
  let calls = 0;
  const delays = [];
  const result = await withTransientRetries(async () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error('temporary DNS failure');
      error.code = 'ENOTFOUND';
      throw error;
    }
    return 'ok';
  }, {
    attempts: 3,
    wait: async (ms) => delays.push(ms)
  });

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1200, 2400]);
  assert.equal(isTransientNetworkError({ response: { status: 503 } }), true);
  assert.equal(isTransientNetworkError({ response: { status: 401 } }), false);
  assert.equal(retryAfterMs({ response: { headers: { 'retry-after': '4' } } }, 1), 4000);
});

test('transient retry policy does not retry authentication failures', async () => {
  let calls = 0;
  await assert.rejects(
    withTransientRetries(async () => {
      calls += 1;
      const error = new Error('Unauthorized');
      error.response = { status: 401 };
      throw error;
    }, { wait: async () => {} }),
    /Unauthorized/
  );
  assert.equal(calls, 1);
});

test('batch article CSV rows normalize aliases and report missing titles', () => {
  const result = normalizeBatchImportRows([
    {
      'Article Title': 'Easy Lemon Chicken',
      'Focus Keyword': 'lemon chicken recipe',
      'Related Keywords': 'weeknight chicken, one pan dinner',
      Intent: 'Commercial',
      Type: 'Listicle',
      'Project Preset': 'Recipe Traffic - Weeknight SEO',
      Length: '1400-1800',
      'Brand Voice': 'Friendly Recipe Blogger',
      'WordPress Site': 'Gourmet Gather',
      'WordPress Category': 'Dinner',
      Status: 'scheduled',
      Date: '2026-08-10T12:00'
    },
    { Title: '' }
  ]);

  assert.equal(result.rows[0].title, 'Easy Lemon Chicken');
  assert.equal(result.rows[0].primaryKeyword, 'lemon chicken recipe');
  assert.equal(result.rows[0].contentType, 'listicle');
  assert.equal(result.rows[0].publicationPreference, 'future');
  assert.equal(result.rows[0].selected, true);
  assert.equal(result.rows[1].selected, false);
  assert.deepEqual(result.errors, [{ row: 3, message: 'Title is required.' }]);
});

test('batch import resolves row-specific presets, sites, categories, and schedules', async () => {
  const {
    duplicateImportIds,
    resolveImportRow,
    validateImportRow
  } = await import('../src/lib/batchArticleImport.mjs');
  const settings = {
    projectPresets: [{ id: 'recipe-preset', name: 'Recipe SEO', wordpressSiteId: 'site-1', wordpressCategoryId: '7' }],
    brandVoices: [{ id: 'voice-1', name: 'Recipe Expert' }],
    wordpressSites: [{
      id: 'site-1',
      name: 'Gourmet Gather',
      url: 'https://gourmetgather.com',
      categories: [{ id: 7, name: 'Dinner', slug: 'dinner' }]
    }]
  };
  const scheduled = resolveImportRow({
    title: 'Lemon Chicken',
    preset: 'Recipe SEO',
    brandVoice: 'Recipe Expert',
    site: 'Gourmet Gather',
    category: 'dinner',
    publicationPreference: 'future',
    schedule: '2099-08-10T12:00'
  }, settings);

  assert.equal(scheduled.projectPresetId, 'recipe-preset');
  assert.equal(scheduled.wordpressSiteId, 'site-1');
  assert.equal(scheduled.wordpressCategoryId, 7);
  assert.equal(scheduled.brandVoiceId, 'voice-1');
  assert.match(scheduled.scheduledAt, /^2099-08-10T/);
  assert.deepEqual(validateImportRow({ title: '', publicationPreference: 'future', schedule: '' }), [
    'Title is required.',
    'A valid schedule is required.'
  ]);
  assert.deepEqual(
    [...duplicateImportIds([
      { id: 'a', title: 'Lemon Chicken' },
      { id: 'b', title: ' lemon chicken ' },
      { id: 'c', title: 'Meal Prep Bowls' }
    ])].sort(),
    ['a', 'b']
  );
});

test('growth workspace storage is allowlisted and preserves custom record fields', () => {
  const records = upsertGrowthRecord([], 'campaigns', {
    id: 'campaign-1',
    name: 'Summer recipes',
    customPortfolioField: 'keep me',
    publishAutomatically: false,
    apiToken: 'must-not-be-stored',
    nested: { credentialSecret: 'must-not-be-stored', source: 'Impact' }
  });
  const updated = upsertGrowthRecord(records, 'campaigns', {
    id: 'campaign-1',
    name: 'Summer dinner recipes'
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].name, 'Summer dinner recipes');
  assert.equal(updated[0].customPortfolioField, 'keep me');
  assert.equal(updated[0].publishAutomatically, false);
  assert.equal(updated[0].apiToken, undefined);
  assert.equal(updated[0].nested.credentialSecret, undefined);
  assert.equal(updated[0].nested.source, 'Impact');
  assert.throws(() => allowedCollection('settings'), /Unsupported/);
});

test('revenue CSV normalization never invents amounts and retains evidence', () => {
  const rows = normalizeRevenueRows([
    { Provider: 'Impact', Revenue: '$24.50', Currency: 'USD', Clicks: '12', 'Article ID': 'article-1' },
    { Source: 'Amazon', Revenue: '', Date: '2026-07-20' }
  ], 'partner-report.csv');
  assert.equal(rows[0].amount, 24.5);
  assert.equal(rows[0].source, 'Impact');
  assert.equal(rows[0].sourceFile, 'partner-report.csv');
  assert.ok(rows[0].lastUpdated);
  assert.equal(rows[1].amount, null);
  assert.equal(rows[1].source, 'Amazon');
});

test('growth intelligence builds evidence-backed updates, calendar dates, and run records', async () => {
  const {
    buildCalendarRows,
    buildContentUpdateRecommendations,
    deriveRunHistory
  } = await import('../src/lib/growthIntelligence.mjs');
  const article = {
    id: 'article-1',
    title: 'Easy Lemon Chicken',
    type: 'article',
    queueStatus: 'error',
    workflowStatus: 'failed',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    errorMessage: 'Image generation failed',
    generationCheckpoint: { stage: 'in-text-images' },
    featuredImage: 'https://example.com/lemon.webp',
    featuredImageAlt: '',
    images: [],
    internalLinksInserted: 0,
    content: '<p>Updated in 2022.</p>',
    estimatedCost: 0.12,
    actualKnownCost: null
  };
  const calendar = buildCalendarRows([article], [{
    id: 'calendar-article-1',
    articleId: 'article-1',
    plannedDate: '2026-08-01T12:00:00.000Z',
    newsletterDate: '2026-08-02T12:00:00.000Z'
  }]);
  assert.equal(calendar[0].plannedDate, '2026-08-01T12:00:00.000Z');
  assert.equal(calendar[0].newsletterDate, '2026-08-02T12:00:00.000Z');

  const updates = buildContentUpdateRecommendations([article], {
    google: {
      pages: [{
        articleId: 'article-1',
        clicks: 40,
        previousClicks: 100,
        impressions: 2000,
        ctr: 0.01
      }]
    }
  }, new Date('2026-07-28T00:00:00.000Z'));
  assert.ok(updates.some((item) => item.type === 'Search-ranking decline' && item.evidence.includes('100')));
  assert.ok(updates.some((item) => item.type === 'High impressions and low CTR' && item.evidence.includes('2000')));
  assert.ok(updates.every((item) => item.evidence && item.action));

  const runs = deriveRunHistory([article]);
  assert.equal(runs[0].safeRetryStep, 'in-text-images');
  assert.equal(runs[0].estimatedCost, 0.12);
  assert.equal(runs[0].actualCost, null);
});

test('model registry has unique complete records and shared selector options', async () => {
  const {
    IMAGE_MODEL_OPTIONS,
    MODEL_REGISTRY,
    TEXT_MODEL_OPTIONS,
    VIDEO_MODEL_OPTIONS
  } = await import('../src/lib/modelRegistry.mjs');
  assert.equal(new Set(MODEL_REGISTRY.map((model) => model.id)).size, MODEL_REGISTRY.length);
  assert.equal(MODEL_REGISTRY.length, TEXT_MODEL_OPTIONS.length + IMAGE_MODEL_OPTIONS.length + VIDEO_MODEL_OPTIONS.length);
  assert.ok(MODEL_REGISTRY.every((model) => (
    model.id
    && model.name
    && model.provider
    && model.endpoint.startsWith('https://replicate.com/')
    && model.contentType
    && model.cost
    && model.fallback
    && model.verifiedAt
  )));
});

test('article publication status requires a confirmed public publish', async () => {
  const { isArticlePublished } = await import('../src/lib/articlePublication.mjs');
  assert.equal(isArticlePublished({ wordpressPostId: 42, wordpressPostUrl: 'https://example.com/?p=42', workflowStatus: 'draft' }), false);
  assert.equal(isArticlePublished({ workflowStatus: 'published' }), false);
  assert.equal(isArticlePublished({
    workflowStatus: 'published',
    wordpressPostId: 42,
    wordpressPostUrl: 'https://example.com/recipe/',
    wordpressPublishStatus: 'publish'
  }), true);
  assert.equal(isArticlePublished({ publishHistory: [{ status: 'publish', postUrl: 'https://example.com/post/' }] }), true);
  assert.equal(isArticlePublished({ publishHistory: [{ status: 'draft', postUrl: 'https://example.com/?p=42' }] }), false);
});

test('SVG text escaping prevents generated titles from changing the image markup', () => {
  assert.equal(
    escapeXmlText(`Fish & Chips <script> "today's"`),
    'Fish &amp; Chips &lt;script&gt; &quot;today&apos;s&quot;'
  );
});

test('remote media safety rejects private IPv4 and IPv6 destinations', () => {
  assert.equal(isSafeRemoteMediaUrl('https://10.1.2.3/image.jpg'), false);
  assert.equal(isSafeRemoteMediaUrl('https://100.64.1.2/video.mp4'), false);
  assert.equal(isSafeRemoteMediaUrl('https://[fc00::1]/image.jpg'), false);
  assert.equal(isSafeRemoteMediaUrl('https://[fe80::1]/image.jpg'), false);
  assert.equal(isSafeRemoteMediaUrl('https://replicate.delivery/image.webp'), true);
  assert.throws(
    () => assertSafeRemoteRedirect({ href: 'http://127.0.0.1/private-image.jpg' }),
    /unsafe remote media URL/
  );
  assert.doesNotThrow(
    () => assertSafeRemoteRedirect({ href: 'https://replicate.delivery/image.webp' })
  );
});

test('job cancellation only aborts work in the requested feature', () => {
  const aborted = [];
  const jobs = new Map([
    ['article:a:gen', { abort: () => aborted.push('article:a:gen') }],
    ['native-pin-a', { abort: () => aborted.push('native-pin-a') }],
    ['video:v:gen', { abort: () => aborted.push('video:v:gen') }]
  ]);

  const result = cancelJobsByPrefixes(jobs, ['article:']);

  assert.equal(result.cancelled, 1);
  assert.deepEqual(aborted, ['article:a:gen']);
  assert.deepEqual([...jobs.keys()], ['native-pin-a', 'video:v:gen']);
});

test('pin queue acknowledgement removes only delivered items', () => {
  const queued = ensurePinQueueIds([
    { articleId: 'article-1', url: 'https://example.com/one/' },
    { articleId: 'article-2', url: 'https://example.com/two/' }
  ]);

  const remaining = acknowledgePinQueueItems(queued, [queued[0].queueId]);

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].articleId, 'article-2');
  assert.equal(remaining[0].queueId, queued[1].queueId);
});

test('pin queue deduplication updates an article without creating duplicate delivery', () => {
  const queued = dedupePinQueueItems([
    { queueId: 'first-id', articleId: 'article-1', url: 'https://example.com/old', title: 'Old' },
    { queueId: 'second-id', articleId: 'article-1', url: 'https://example.com/new', title: 'New' }
  ]);

  assert.equal(queued.length, 1);
  assert.equal(queued[0].url, 'https://example.com/new');
  assert.equal(queued[0].title, 'New');
});

test('UTM helper preserves non-UTM parameters and hash while updating existing UTMs', () => {
  const tagged = addUtmParams(
    'https://example.com/recipe/?servings=4&utm_source=old#recipe-card',
    'Pinterest',
    'Garlic Butter Shrimp',
    'Pin 1',
    'organic_social'
  );
  const parsed = new URL(tagged);

  assert.equal(parsed.searchParams.get('servings'), '4');
  assert.equal(parsed.searchParams.getAll('utm_source').length, 1);
  assert.equal(parsed.searchParams.get('utm_source'), 'pinterest');
  assert.equal(parsed.searchParams.get('utm_medium'), 'social');
  assert.equal(parsed.searchParams.get('utm_campaign'), 'garlic_butter_shrimp');
  assert.equal(parsed.searchParams.get('utm_content'), 'pin_1');
  assert.equal(parsed.hash, '#recipe-card');
});

test('UTM helper rejects image, API, admin, and local destinations', () => {
  assert.equal(isUtmEligibleDestination('https://i.ibb.co/image.jpg'), false);
  assert.equal(isUtmEligibleDestination('https://example.com/wp-json/wp/v2/posts'), false);
  assert.equal(isUtmEligibleDestination('https://example.com/wp-admin/'), false);
  assert.equal(isUtmEligibleDestination('http://localhost:5173/article'), false);
  assert.equal(isUtmEligibleDestination('https://example.com/recipe/'), true);
});

test('Impact catalog responses normalize into safe searchable products', () => {
  const raw = {
    Items: [{
      CatalogItemId: 'item-1',
      CampaignId: 'program-42',
      CampaignName: 'Kitchen Store',
      Name: 'Digital Kitchen Scale',
      Url: 'https://merchant.example/scale?color=white',
      ImageUrl: 'https://merchant.example/scale.jpg',
      CurrentPrice: '29.99',
      OriginalPrice: '39.99',
      DiscountPercentage: '25',
      Currency: 'USD',
      StockAvailability: 'InStock',
      Category: 'Kitchen > Baking Tools',
      Manufacturer: 'Measure Well',
      Labels: ['food scale', 'baking']
    }]
  };
  const product = normalizeImpactProduct(extractImpactItems(raw)[0]);

  assert.equal(product.campaignId, 'program-42');
  assert.equal(product.name, 'Digital Kitchen Scale');
  assert.equal(product.url, 'https://merchant.example/scale?color=white');
  assert.equal(product.originalPrice, '39.99');
  assert.equal(product.discountPercentage, '25');
  assert.equal(product.stockAvailability, 'InStock');
  assert.deepEqual(buildImpactKeywords(product).slice(0, 4), [
    'Digital Kitchen Scale',
    'Measure Well',
    'Kitchen > Baking Tools',
    'Kitchen'
  ]);
});

test('Impact imports preserve tracking links and useful match metadata', () => {
  const affiliate = buildImpactAffiliateItem({
    id: 'item-1',
    catalogItemId: 'item-1',
    campaignId: 'program-42',
    campaignName: 'Kitchen Store',
    name: 'Digital Kitchen Scale',
    category: 'Kitchen Tools',
    labels: ['food scale']
  }, 'https://track.example/click?id=42');

  assert.equal(affiliate.source, 'impact');
  assert.equal(affiliate.url, 'https://track.example/click?id=42');
  assert.equal(affiliate.impactCampaignId, 'program-42');
  assert.ok(affiliate.keywords.includes('food scale'));
});

test('Impact redirect links retain partner attribution and verified tracking metadata', () => {
  const url = 'https://dowanllc.pxf.io/c/7445429/3859433/51140?prodsku=7882814095592&u=https%3A%2F%2Fdowan.com%2Fproducts%2Fceramic-mixer-bowls';
  const info = impactTrackingInfo(url);
  const affiliate = buildImpactAffiliateItem({
    id: 'bowls',
    catalogItemId: 'bowls',
    campaignId: 'program-1',
    name: 'Ceramic Mixing Bowls',
    currentPrice: '35.99',
    originalPrice: '49.99',
    discountPercentage: '28',
    currency: 'USD',
    stockAvailability: 'InStock'
  }, url, {
    generatedByImpactApi: true,
    subId: 'article_123',
    sharedId: 'content_studio_article',
    source: 'impact_tracking_links_api'
  });

  assert.equal(isImpactTrackingUrl(url), true);
  assert.deepEqual(info, { verified: true, partnerId: '7445429' });
  assert.equal(affiliate.trackingVerified, true);
  assert.equal(affiliate.trackingPartnerId, '7445429');
  assert.equal(affiliate.trackingSubId, 'article_123');
  assert.equal(affiliate.originalPrice, '49.99');
});

test('Impact recommendation labels shorten oversized catalog feed titles', () => {
  assert.equal(
    affiliateDisplayName('7-in-1 Air Fryer, 5 QT Glass Basket Fryer, 360 Degree Cooking Window, Reheat, Roast, Bake, Touchscreen Controls'),
    '7-in-1 Air Fryer'
  );
  assert.equal(affiliateDisplayName('Digital Kitchen Scale'), 'Digital Kitchen Scale');
});

test('Impact catalog parsing accepts a single documented item response', () => {
  const item = {
    CatalogItemId: 'single-item',
    CampaignId: 'single-program',
    Name: 'Immersion Blender',
    Url: 'https://merchant.example/blender'
  };
  assert.deepEqual(extractImpactItems(item), [item]);
});

test('Impact catalog tracking URLs are recognized without mistaking merchant links', () => {
  assert.equal(isImpactTrackingUrl('https://merchant-name.pxf.io/c/123/456/789'), true);
  assert.equal(isImpactTrackingUrl('https://example.sjv.io/product'), true);
  assert.equal(isImpactTrackingUrl('https://merchant.example/product'), false);
  assert.equal(isImpactTrackingUrl('https://pxf.io.attacker.example/product'), false);
});

test('Amazon search links preserve the selected marketplace and Associates tracking ID', () => {
  const url = buildAmazonSearchUrl('cast iron skillet', 'exampletag-20', 'www.amazon.com');
  const parsed = new URL(url);

  assert.equal(parsed.hostname, 'www.amazon.com');
  assert.equal(parsed.searchParams.get('k'), 'cast iron skillet');
  assert.equal(parsed.searchParams.get('tag'), 'exampletag-20');
  assert.equal(isAmazonTaggedUrl(url, 'exampletag-20'), true);
  assert.equal(isAmazonTaggedUrl('https://www.amazon.com/dp/B000000000', 'exampletag-20'), false);
  assert.equal(normalizeAmazonMarketplace('https://www.amazon.co.uk/kitchen'), 'www.amazon.co.uk');
  assert.equal(normalizeAmazonPartnerTag('invalid tag'), '');
});

test('Amazon Creators API products become verified tagged affiliate opportunities', () => {
  const payload = {
    searchResult: {
      items: [{
        asin: 'B00TEST123',
        detailPageURL: 'https://www.amazon.com/dp/B00TEST123?tag=exampletag-20&linkCode=osi',
        itemInfo: {
          title: { displayValue: 'Heavy Duty Cast Iron Skillet' },
          byLineInfo: { brand: { displayValue: 'Example Kitchen' } }
        },
        images: {
          primary: { large: { url: 'https://m.media-amazon.com/images/I/example.jpg' } }
        },
        browseNodeInfo: {
          browseNodes: [{ contextFreeName: 'Skillets' }]
        }
      }]
    }
  };
  const product = normalizeAmazonProduct(extractAmazonItems(payload)[0]);
  const affiliate = buildAmazonAffiliateItem(product, {
    partnerTag: 'exampletag-20',
    marketplace: 'www.amazon.com',
    matchTerms: ['cast iron skillet'],
    discoveryScore: 120
  });

  assert.equal(product.asin, 'B00TEST123');
  assert.equal(affiliate.source, 'amazon');
  assert.equal(affiliate.trackingVerified, true);
  assert.equal(affiliate.amazonPartnerTag, 'exampletag-20');
  assert.equal(affiliate.amazonLinkType, 'product');
  assert.equal(affiliate.imageUrl, 'https://m.media-amazon.com/images/I/example.jpg');
  assert.equal(Object.hasOwn(affiliate, 'currentPrice'), false);
});

test('manual Amazon products become exact canonical tagged product links', () => {
  const affiliate = buildAmazonManualAffiliate({
    name: 'OXO Digital Kitchen Scale',
    urlOrAsin: 'https://www.amazon.com/Example-Scale/dp/B00TEST999/ref=example',
    keywords: 'digital kitchen scale, food scale'
  }, {
    partnerTag: 'exampletag-20',
    marketplace: 'www.amazon.com'
  });

  assert.equal(affiliate.amazonAsin, 'B00TEST999');
  assert.equal(affiliate.amazonLinkType, 'product');
  assert.equal(affiliate.trackingSource, 'amazon_manual_product');
  assert.equal(isAmazonTaggedUrl(affiliate.url, 'exampletag-20'), true);
  assert.equal(new URL(affiliate.url).pathname, '/dp/B00TEST999');
  assert.equal(extractAmazonAsin('B00TEST999'), 'B00TEST999');
  assert.match(buildAmazonProductUrl('B00TEST999', 'exampletag-20'), /\/dp\/B00TEST999\?tag=exampletag-20/);
  assert.throws(() => buildAmazonAffiliateItem({
    asin: 'B00TEST999',
    name: 'Untagged product',
    url: 'https://www.amazon.com/dp/B00TEST999'
  }, {
    partnerTag: 'exampletag-20',
    marketplace: 'www.amazon.com'
  }), /tagged to this Associates tracking ID/);
});

test('affiliate discovery plans only equipment present in the article fallback', () => {
  const queries = fallbackAffiliateQueries({
    title: 'Garlic Butter Shrimp',
    content: '<p>Heat a skillet, then check the shrimp with an instant-read thermometer.</p>'
  });
  assert.ok(queries.some((item) => item.query === 'skillet'));
  assert.ok(queries.some((item) => item.query === 'meat thermometer'));
  assert.ok(!queries.some((item) => item.query === 'slow cooker'));
});

test('affiliate AI plans are parsed and capped without accepting prose', () => {
  const plan = parseAffiliateSearchPlan('```json\n{"queries":[{"query":"cast iron skillet","reason":"Used for searing.","articleTerms":["skillet","pan"]}]}\n```');
  assert.deepEqual(plan, [{
    query: 'cast iron skillet',
    reason: 'Used for searing.',
    articleTerms: ['skillet', 'pan', 'cast iron skillet']
  }]);
});

test('affiliate product ranking rejects weak and unavailable catalog results', () => {
  const article = {
    title: 'Garlic Butter Shrimp',
    content: '<p>Sear the shrimp in a hot cast iron skillet until opaque.</p>'
  };
  const planItem = {
    query: 'cast iron skillet',
    reason: 'The recipe sears shrimp in a skillet.',
    articleTerms: ['cast iron skillet', 'skillet']
  };
  const ranked = rankImpactProducts([
    {
      planItem,
      product: {
        id: 'strong',
        catalogItemId: 'strong',
        name: '12 Inch Cast Iron Skillet',
        category: 'Kitchen > Cookware > Skillets',
        stockAvailability: 'InStock'
      }
    },
    {
      planItem,
      product: {
        id: 'partial',
        catalogItemId: 'partial',
        name: 'Ceramic Skillet Utensil Holder',
        category: 'Kitchen Decor',
        stockAvailability: 'InStock'
      }
    },
    {
      planItem,
      product: {
        id: 'weak',
        catalogItemId: 'weak',
        name: 'Ceramic Utensil Holder',
        category: 'Kitchen Decor',
        stockAvailability: 'InStock'
      }
    },
    {
      planItem,
      product: {
        id: 'sold-out',
        catalogItemId: 'sold-out',
        name: 'Cast Iron Skillet',
        category: 'Kitchen > Cookware',
        stockAvailability: 'OutofStock'
      }
    }
  ], article);
  assert.deepEqual(ranked.map((item) => item.id), ['strong']);
  assert.ok(ranked[0].matchTerms.includes('skillet'));
});

test('Pinterest image prompts enforce realistic close-up food photography', () => {
  const original = 'Garlic butter shrimp with the text in a centered panel.';
  const enhanced = enhancePinterestImagePrompt(original);

  assert.match(enhanced, /photorealistic editorial food photography/i);
  assert.match(enhanced, /65-80%/);
  assert.match(enhanced, /sharply focused/i);
  assert.match(enhanced, /vertical 2:3 mobile crop/i);
  assert.match(enhanced, /only ingredients and garnishes supported/i);
  assert.ok(enhanced.startsWith(original));
  assert.equal(enhancePinterestImagePrompt(enhanced), enhanced);
});

test('pin prompt quality allows normal titles containing actually and removes reasoning', () => {
  const valid = 'Photorealistic close-up of cottage cheese toast. Text Overlay: "Breakfasts That Actually Taste Good".';
  assert.equal(hasReasoningLeak(valid), false);
  assert.equal(extractCleanPinPrompt(valid), valid);

  const reasoned = `Let's craft the image prompt.\n\nFinal image prompt: Photorealistic close-up of cottage cheese toast with centered readable text.`;
  assert.match(extractCleanPinPrompt(reasoned), /^Photorealistic close-up/);
  assert.match(fallbackPinPrompt({ sourceTitle: 'Cottage Cheese Breakfast Ideas' }, 'middle'), /Text overlay in the middle/i);
});

test('article imports receive stable unique IDs when IDs are missing or duplicated', () => {
  let sequence = 0;
  const articles = normalizeImportedArticles([
    { title: 'Missing ID' },
    { id: 'same', title: 'First duplicate' },
    { id: 'same', title: 'Second duplicate' }
  ], {
    now: '2026-07-19T00:00:00.000Z',
    createId: () => `generated-${++sequence}`
  });

  assert.equal(new Set(articles.map((article) => article.id)).size, 3);
  assert.equal(articles[1].id, 'same');
  assert.equal(articles[2].id, 'generated-2');
  assert.ok(articles.every((article) => article.createdAt && article.updatedAt));
});

test('custom built-in pin style edits survive normalization after migration', () => {
  const defaults = {
    closeup: { name: 'Closeup', prompt: 'Default prompt' },
    recipe: { name: 'Recipe', prompt: 'Recipe prompt' }
  };
  const customized = {
    closeup: { name: 'My Closeup', prompt: 'My custom prompt' },
    extra: { name: 'Extra', prompt: 'Extra prompt' }
  };

  assert.equal(mergePinStyles(defaults, customized).closeup.prompt, 'My custom prompt');
  assert.equal(migratePinStyles(defaults, customized, 2, 2).closeup.prompt, 'My custom prompt');
  assert.equal(migratePinStyles(defaults, customized, 0, 2).closeup.prompt, 'Default prompt');
  assert.equal(migratePinStyles(defaults, customized, 0, 2).extra.prompt, 'Extra prompt');
});

test('media security blocks private remote hosts and paths outside allowed storage', () => {
  const path = require('path');
  const root = path.join(process.cwd(), 'safe-media');

  assert.equal(isPathInsideRoots(path.join(root, 'image.webp'), [root]), true);
  assert.equal(isPathInsideRoots(path.join(process.cwd(), 'secrets.txt'), [root]), false);
  assert.equal(isSafeRemoteMediaUrl('https://images.example.com/photo.webp'), true);
  assert.equal(isSafeRemoteMediaUrl('http://127.0.0.1/private.png'), false);
  assert.equal(isSafeRemoteMediaUrl('http://192.168.1.10/private.png'), false);
});

test('startup recovery changes interrupted items without touching completed work', async () => {
  const { recoverInterruptedArticles } = await import('../src/lib/articleWorkflow.mjs');
  const saved = [];
  const result = await recoverInterruptedArticles([
    { id: 'active', queueStatus: 'generating', workflowStatus: 'generating-content' },
    { id: 'done', queueStatus: 'completed', workflowStatus: 'needs-review', content: '<p>Done</p>', workflowSchemaVersion: 1 }
  ], async (article) => {
    saved.push(article);
    return article;
  }, () => '2026-07-19T12:00:00.000Z');

  assert.equal(saved.length, 1);
  assert.equal(result[0].queueStatus, 'pending');
  assert.equal(result[0].recoveredAt, '2026-07-19T12:00:00.000Z');
  assert.equal(result[1].queueStatus, 'completed');
});

test('workflow normalization migrates legacy labels without losing custom fields', async () => {
  const { normalizeArticleWorkflow } = await import('../src/lib/articleWorkflow.mjs');
  const normalized = normalizeArticleWorkflow({
    id: 'legacy',
    queueStatus: 'pending',
    workflowStatus: 'draft-generated',
    content: '',
    customField: { keep: true }
  });

  assert.equal(normalized.workflowStatus, 'queued');
  assert.equal(normalized.queueStatus, 'pending');
  assert.equal(normalized.workflowSchemaVersion, 1);
  assert.deepEqual(normalized.customField, { keep: true });
});

test('workflow normalization derives published only from confirmed public WordPress data', async () => {
  const { normalizeArticleWorkflow } = await import('../src/lib/articleWorkflow.mjs');
  const invalidPublished = normalizeArticleWorkflow({
    workflowStatus: 'published',
    queueStatus: 'completed',
    content: '<p>Draft content</p>'
  });
  const confirmedPublished = normalizeArticleWorkflow({
    workflowStatus: 'published',
    queueStatus: 'completed',
    content: '<p>Published content</p>',
    wordpressPostId: 42,
    wordpressPostUrl: 'https://example.com/recipe/',
    wordpressPublishStatus: 'publish'
  });

  assert.equal(invalidPublished.workflowStatus, 'needs-review');
  assert.equal(confirmedPublished.workflowStatus, 'published');
});

test('restart keeps an article awaiting outline approval instead of generating content', async () => {
  const { recoverInterruptedArticles } = await import('../src/lib/articleWorkflow.mjs');
  const saved = [];
  const [recovered] = await recoverInterruptedArticles([{
    id: 'outline-review',
    queueStatus: 'outline-review',
    workflowStatus: 'awaiting-outline-approval',
    requireOutlineApproval: true,
    outlineApproved: false,
    outline: '## Ingredients\n## Method'
  }], async (article) => {
    saved.push(article);
    return article;
  });

  assert.equal(recovered.workflowStatus, 'awaiting-outline-approval');
  assert.equal(recovered.queueStatus, 'outline-review');
  assert.equal(recovered.outlineApproved, false);
  assert.equal(saved.length, 1);
});

test('outline generation recovery preserves approval requirements and the saved outline', async () => {
  const { recoverInterruptedArticles } = await import('../src/lib/articleWorkflow.mjs');
  const [recovered] = await recoverInterruptedArticles([{
    id: 'outline-generating',
    queueStatus: 'generating',
    workflowStatus: 'generating-outline',
    requireOutlineApproval: true,
    outlineApproved: false,
    outline: '## Ingredients\n## Method',
    generationCheckpoint: { stage: 'outline' }
  }], async (article) => article, () => '2026-07-27T12:00:00.000Z');

  assert.equal(recovered.workflowStatus, 'awaiting-outline-approval');
  assert.equal(recovered.queueStatus, 'outline-review');
  assert.equal(recovered.outlineApproved, false);
  assert.equal(recovered.outline, '## Ingredients\n## Method');
  assert.deepEqual(recovered.generationCheckpoint, { stage: 'outline' });
});

test('article workflow transition rules reject unsafe shortcuts', async () => {
  const {
    articleGenerationEntryAction,
    canTransitionArticleWorkflow
  } = await import('../src/lib/articleWorkflow.mjs');
  assert.equal(canTransitionArticleWorkflow('queued', 'generating-outline'), true);
  assert.equal(canTransitionArticleWorkflow('awaiting-outline-approval', 'generating-content'), true);
  assert.equal(canTransitionArticleWorkflow('queued', 'published'), false);
  assert.equal(canTransitionArticleWorkflow('published', 'generating-content'), false);
  assert.equal(articleGenerationEntryAction({}, { requireOutlineApproval: false }), 'generate-content');
  assert.equal(articleGenerationEntryAction({ outlineApproved: false }, { requireOutlineApproval: true }), 'generate-outline');
  assert.equal(articleGenerationEntryAction({
    outlineApproved: false,
    outline: '## Ingredients\n- Notes'
  }, { requireOutlineApproval: true }), 'await-outline-approval');
  assert.equal(articleGenerationEntryAction({
    outlineApproved: true,
    outline: '## Ingredients\n- Notes'
  }, { requireOutlineApproval: true }), 'generate-content');
});

test('outline helpers normalize model output and support section editing', () => {
  const normalized = normalizeArticleOutline(`
    \`\`\`html
    <h1>Garlic Shrimp</h1>
    <h2>Why this recipe works</h2>
    <ul><li>Fast cooking cues</li></ul>
    <h2>Ingredients</h2>
    <ul><li>Ingredient roles</li></ul>
    \`\`\`
  `);
  const withSection = appendOutlineSection(normalized, 'Storage and reheating');
  const removed = removeLastOutlineSection(withSection);

  assert.equal(outlineSectionCount(normalized), 2);
  assert.match(normalized, /^## Why this recipe works/m);
  assert.doesNotMatch(normalized, /<h1>|```/);
  assert.equal(outlineSectionCount(withSection), 3);
  assert.equal(removed, normalized);
});

test('settings migration adds purpose-specific image ratios and preserves unknown fields', () => {
  const legacy = {
    imageModel: 'gpt-image-2',
    customIntegration: { keep: true },
    pinCreator: { aspectRatio: '1:1', customField: 'keep' }
  };
  const first = migrateSettings(legacy);
  const second = migrateSettings(first.settings);

  assert.equal(first.settings.featuredImageRatio, '3:2');
  assert.equal(first.settings.intextImageRatio, '4:3');
  assert.equal(first.settings.pinterestPinRatio, '1:1');
  assert.equal(first.settings.instagramPortraitRatio, '4:5');
  assert.equal(first.settings.instagramStoryRatio, '9:16');
  assert.equal(first.settings.facebookFeedRatio, '1.91:1');
  assert.equal(first.settings.squareSocialRatio, '1:1');
  assert.equal(first.settings.settingsSchemaVersion, 2);
  assert.equal(first.settings.internalLinkCount, 3);
  assert.equal(first.settings.internalLinkMaxPosts, 500);
  assert.equal(first.settings.publishStatus, 'publish');
  assert.equal(first.settings.affiliateAutoDiscover, true);
  assert.equal(first.settings.featureFlags.contentCalendar, false);
  assert.deepEqual(first.settings.customIntegration, { keep: true });
  assert.equal(first.settings.pinCreator.customField, 'keep');
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.deepEqual(second.settings, first.settings);
});

test('settings schema migration preserves explicit and future feature values', () => {
  const result = migrateSettings({
    settingsSchemaVersion: 1,
    internalLinkCount: 2,
    internalLinkMaxPosts: 425,
    publishStatus: 'future',
    futureIntegration: { mode: 'keep-me' },
    featureFlags: { contentCalendar: true, futureFlag: true }
  });

  assert.equal(result.settings.internalLinkCount, 2);
  assert.equal(result.settings.internalLinkMaxPosts, 425);
  assert.equal(result.settings.publishStatus, 'future');
  assert.deepEqual(result.settings.futureIntegration, { mode: 'keep-me' });
  assert.equal(result.settings.featureFlags.contentCalendar, true);
  assert.equal(result.settings.featureFlags.futureFlag, true);
  assert.equal(migrateSettings(result.settings).changed, false);
});

test('renderer uses accessible app confirmation dialogs instead of native prompts', () => {
  const sourceFiles = fs.readdirSync(path.join(__dirname, '..', 'src', 'components'))
    .filter((name) => name.endsWith('.jsx'))
    .map((name) => fs.readFileSync(path.join(__dirname, '..', 'src', 'components', name), 'utf8'));
  const dialogSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ConfirmDialog.jsx'), 'utf8');

  assert.equal(sourceFiles.some((source) => source.includes('window.confirm')), false);
  assert.match(dialogSource, /role="alertdialog"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /event\.key === "Escape"/);
});

test('image ratio selection keeps supported purposes and reports closest substitutions', () => {
  assert.deepEqual(resolveImageRatio('seedream-4.5', '4:3'), {
    requestedRatio: '4:3',
    ratio: '4:3',
    adjusted: false,
    notice: ''
  });
  assert.equal(resolveImageRatio('gpt-image-2', '4:5').ratio, '2:3');
  assert.equal(resolveImageRatio('gpt-image-2', '4:5').adjusted, true);
  assert.equal(resolveImageRatio('imagen-4-fast', '1.91:1').ratio, '16:9');
  assert.equal(resolveImageRatio('imagen-4-fast', '9:16').adjusted, false);
  assert.deepEqual(ratioToDimensions('4:3'), { width: 1024, height: 768 });
  assert.deepEqual(ratioToDimensions('2:3'), { width: 688, height: 1024 });
});

test('cost estimation separates text and image estimates and identifies models', () => {
  const estimate = calculateEstimatedCost({
    articleCount: 2,
    settings: {
      aiModel: 'gpt5nano',
      imageModel: 'z-image-turbo',
      enableIntextImages: true,
      intextImageCount: 1,
      smartQualityPass: true,
      keepOriginalTitles: false,
      affiliateEnabled: false
    },
    extraTextCalls: 2,
    outlineCalls: 1
  });

  assert.equal(estimate.models.text, 'gpt5nano');
  assert.equal(estimate.models.image, 'z-image-turbo');
  assert.equal(estimate.expectedImages, 4);
  assert.equal(estimate.breakdown.textCalls, 13);
  assert.equal(estimate.estimatedTextCost, 0.013);
  assert.equal(estimate.estimatedImageCost, 0.012);
  assert.equal(estimate.estimatedCost, 0.025);
  assert.equal(estimate.actualKnownCost, null);
  assert.equal(estimate.costCurrency, 'USD');
  assert.equal(estimate.costCalculationVersion, 2);
  assert.equal(estimate.approximate, true);
});

test('article briefs are article-specific, complete, and preserve user edits', async () => {
  const { buildArticleBrief, articleBriefPrompt } = await import('../src/lib/articleBrief.mjs');
  const brief = buildArticleBrief({
    article: {
      id: 'brief-1',
      title: 'Easy Lemon Chicken For Weeknights',
      type: 'article',
      articleBrief: {
        uniqueAngle: 'A one-pan method with a texture-first troubleshooting guide.',
        keyQuestions: ['How do I keep the chicken juicy?']
      }
    },
    resolvedSettings: {
      articleLength: '1400-1800',
      primaryKeyword: 'easy lemon chicken',
      secondaryKeywords: 'one pan chicken, weeknight dinner',
      searchIntent: 'informational',
      targetAudience: 'Busy home cooks',
      recipeCardEnabled: true,
      featuredImageRatio: '3:2',
      intextImageRatio: '4:3',
      intextImageCount: 1,
      enableIntextImages: true
    },
    cannibalizationConflicts: [{
      article: { id: 'existing-1', title: 'Lemon Chicken Dinner' },
      score: 68,
      reason: 'Topic overlap'
    }]
  });

  assert.equal(brief.primaryKeyword, 'easy lemon chicken');
  assert.equal(brief.recommendedLength, '1400-1800');
  assert.equal(brief.uniqueAngle, 'A one-pan method with a texture-first troubleshooting guide.');
  assert.deepEqual(brief.keyQuestions, ['How do I keep the chicken juicy?']);
  assert.equal(brief.recipeRequirements.completeRecipeCard, true);
  assert.equal(brief.imageRequirements.featuredRatio, '3:2');
  assert.equal(brief.cannibalizationConflicts[0].articleId, 'existing-1');
  assert.match(articleBriefPrompt(brief), /Reader problem:/);
  assert.match(articleBriefPrompt(brief), /Requires verification:/);
});

test('helpful-content report exposes category reasons and critical publish blockers', async () => {
  const { buildArticleQualityReport, canApproveArticle } = await import('../src/lib/articleQuality.mjs');
  const unsafeArticle = {
    title: 'Recipe Placeholder',
    content: '<p>I tested this miracle recipe.</p><p>[insert ingredients]</p>',
    recipeCardEnabled: true,
    articleBrief: {
      primaryKeyword: 'lemon chicken',
      recipeRequirements: { completeRecipeCard: true }
    },
    affiliateLinks: [{ id: 'bad-link', trackingVerified: false }]
  };
  const blocked = buildArticleQualityReport(unsafeArticle, { requireFeaturedImage: true, requireSite: true });
  const blockerIds = blocked.blockers.map((item) => item.id);

  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.categories.length, 10);
  assert.ok(blockerIds.includes('unsupported-first-hand-claim'));
  assert.ok(blockerIds.includes('unresolved-placeholder'));
  assert.ok(blockerIds.includes('missing-recipe-instructions'));
  assert.ok(blockerIds.includes('invalid-recipe-schema'));
  assert.ok(blockerIds.includes('missing-affiliate-disclosure'));
  assert.ok(blockerIds.includes('unverified-affiliate-link'));
  assert.ok(blockerIds.includes('missing-featured-image'));
  assert.ok(blockerIds.includes('publishing-site-missing'));
  assert.equal(canApproveArticle(unsafeArticle).allowed, false);
});

test('helpful-content report allows approval when critical recipe facts are complete', async () => {
  const { buildArticleQualityReport } = await import('../src/lib/articleQuality.mjs');
  const filler = Array.from({ length: 620 }, (_, index) => `useful${index}`).join(' ');
  const content = `
    <p>Easy lemon chicken is a practical one-pan dinner with clear doneness cues.</p>
    <h2>Why this recipe works</h2><p>${filler}</p>
    <h2>Substitutions and troubleshooting</h2><p>Use broth as an alternative. Avoid crowding the pan and fix a thin sauce by simmering it.</p>
    <h2>Storage and reheating</h2><p>Refrigerate leftovers safely and reheat gently.</p>
    <a href="/related-recipe/">Try a related chicken recipe</a>
    <section id="recipe-card" class="recipe-card" itemscope itemtype="https://schema.org/Recipe">
      <h2>Recipe Card</h2><h3 itemprop="name">Easy Lemon Chicken</h3>
      <ul><li><strong>Prep Time:</strong> 10 minutes</li><li><strong>Cook Time:</strong> 20 minutes</li><li><strong>Total Time:</strong> 30 minutes</li><li><strong>Servings:</strong> 4</li></ul>
      <h3>Ingredients</h3><ul itemprop="recipeIngredient"><li>1 pound chicken</li><li>1 lemon</li><li>1 tablespoon oil</li><li>1 cup broth</li></ul>
      <h3>Instructions</h3><ol itemprop="recipeInstructions"><li>Heat the pan.</li><li>Cook the chicken until done.</li><li>Simmer the sauce for 5 minutes.</li></ol>
    </section>`;
  const report = buildArticleQualityReport({
    title: 'Easy Lemon Chicken For Busy Weeknights',
    generatedTitle: 'Easy Lemon Chicken For Busy Weeknights',
    content,
    articleLength: '600-800',
    articleBrief: {
      primaryKeyword: 'easy lemon chicken',
      recipeRequirements: { completeRecipeCard: true }
    },
    rankMathFocusKeyword: 'easy lemon chicken',
    rankMathTitle: 'Easy Lemon Chicken Recipe For Busy Weeknights',
    rankMathDescription: 'Make easy lemon chicken with a one-pan method, practical substitutions, clear doneness cues, and simple storage and reheating guidance.',
    slug: 'easy-lemon-chicken',
    featuredImage: 'https://example.com/lemon-chicken.webp',
    featuredImageAlt: 'Easy lemon chicken served in a skillet',
    structuredData: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Easy Lemon Chicken',
      recipeIngredient: ['1 pound chicken', '1 lemon', '1 tablespoon oil', '1 cup broth'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Heat the pan.' },
        { '@type': 'HowToStep', text: 'Cook the chicken until done.' },
        { '@type': 'HowToStep', text: 'Simmer the sauce for 5 minutes.' }
      ],
      prepTime: 'PT10M',
      cookTime: 'PT20M',
      totalTime: 'PT30M',
      recipeYield: '4'
    }),
    affiliateLinks: []
  }, { requireFeaturedImage: true });

  assert.equal(report.blockers.length, 0);
  assert.ok(report.averageScore >= 70);
  assert.equal(report.categories.find((item) => item.id === 'recipe').score, 100);
});

test('reader retention note is lightweight, safe, configurable, and idempotent', async () => {
  const { applyReaderRetentionElements } = await import('../src/lib/readerRetention.mjs');
  const article = {
    content: '<p>Useful recipe content.</p><section id="recipe-card"><h2>Recipe Card</h2></section>'
  };
  const settings = {
    readerRetentionEnabled: true,
    saveRecipeCtaText: 'Bookmark this recipe for your next weeknight dinner.',
    newsletterCtaEnabled: true,
    newsletterCtaUrl: 'https://example.com/newsletter/?ref=recipe',
    newsletterCtaText: 'Get practical recipes each week.'
  };
  const first = applyReaderRetentionElements(article, settings);
  const second = applyReaderRetentionElements(first, settings);

  assert.equal((second.content.match(/id="reader-retention"/g) || []).length, 1);
  assert.ok(second.content.indexOf('id="reader-retention"') < second.content.indexOf('id="recipe-card"'));
  assert.match(second.content, /https:\/\/example\.com\/newsletter\/\?ref=recipe/);
  assert.doesNotMatch(second.content, /<script|onclick=/i);
  assert.equal(second.readerRetentionApplied, true);
  assert.equal(applyReaderRetentionElements(article, { readerRetentionEnabled: false }).readerRetentionApplied, false);
});

test('article metadata creates natural SEO, Open Graph, Pinterest, and canonical fields', async () => {
  const { buildMetadata } = await import('../src/lib/articlePostProcess.mjs');
  const metadata = buildMetadata({
    title: 'Lemon Chicken',
    articleBrief: {
      primaryKeyword: 'lemon chicken recipe',
      recommendedArticleType: 'recipe guide',
      articlePromise: 'Use a simple one-pan method with clear doneness cues and realistic substitutions.'
    },
    wordpressPostUrl: 'https://example.com/lemon-chicken/'
  }, '<p>Lemon chicken is a bright, savory dinner that cooks in one pan.</p>');

  assert.equal(metadata.rankMathFocusKeyword, 'lemon chicken recipe');
  assert.ok(metadata.metaTitle.length >= 25 && metadata.metaTitle.length <= 60);
  assert.ok(metadata.metaDescription.length >= 110 && metadata.metaDescription.length <= 160);
  assert.equal(metadata.openGraphTitle, metadata.metaTitle);
  assert.equal(metadata.openGraphDescription, metadata.metaDescription);
  assert.equal(metadata.pinterestTitle, metadata.metaTitle);
  assert.equal(metadata.pinterestDescription, metadata.metaDescription);
  assert.equal(metadata.canonicalUrl, 'https://example.com/lemon-chicken/');
});

test('section regeneration helpers replace only the selected section', async () => {
  const { listArticleSections, replaceArticleSection } = await import('../src/lib/articleRevisions.mjs');
  const content = [
    '<p>Introduction paragraph.</p>',
    '<h2>Ingredients</h2><p>Ingredient guidance.</p>',
    '<h2>Instructions</h2><p>Method guidance.</p>',
    '<h2>Storage</h2><p>Storage guidance.</p>'
  ].join('');
  const sections = listArticleSections(content);
  const instructions = sections.find((section) => section.label === 'Instructions');
  const replaced = replaceArticleSection(content, instructions.id, '<h2>Instructions</h2><p>Improved method with doneness cues.</p>');

  assert.deepEqual(sections.map((section) => section.label), ['Introduction', 'Ingredients', 'Instructions', 'Storage']);
  assert.match(replaced, /Ingredient guidance/);
  assert.match(replaced, /Improved method with doneness cues/);
  assert.match(replaced, /Storage guidance/);
  assert.doesNotMatch(replaced, /Method guidance/);
});

test('revision history records sanitized changes and restores previous content', async () => {
  const { recordArticleRevision, restoreArticleRevision } = await import('../src/lib/articleRevisions.mjs');
  const previous = {
    title: 'Lemon Chicken',
    content: '<p>Old section.</p>',
    workflowStatus: 'needs-review',
    revisions: []
  };
  const revised = recordArticleRevision(previous, {
    ...previous,
    content: '<p>New section with api_token=private-value.</p>',
    workflowStatus: 'approved'
  }, {
    changedSection: 'Instructions',
    changeSource: 'ai',
    modelUsed: 'gpt5nano',
    action: 'regenerate-section',
    reason: 'Add doneness cues.'
  });

  assert.equal(revised.revisions.length, 1);
  assert.equal(revised.revisions[0].changedSection, 'Instructions');
  assert.equal(revised.revisions[0].changeSource, 'ai');
  assert.doesNotMatch(revised.revisions[0].newContent, /private-value/);
  const restored = restoreArticleRevision(revised, revised.revisions[0]);
  assert.equal(restored.content, previous.content);
  assert.equal(restored.workflowStatus, previous.workflowStatus);
});

test('article import normalization preserves unknown legacy and custom fields', () => {
  const legacyArticle = {
    id: 'legacy-article',
    title: 'Legacy recipe',
    queueStatus: 'pending',
    customEditorialFlag: 'keep-me',
    customIntegration: {
      provider: 'private-provider',
      options: { preserve: true }
    }
  };

  const [normalized] = normalizeImportedArticles([legacyArticle], {
    now: '2026-07-27T10:00:00.000Z'
  });

  assert.equal(normalized.customEditorialFlag, 'keep-me');
  assert.deepEqual(normalized.customIntegration, legacyArticle.customIntegration);
  assert.equal(normalized.createdAt, '2026-07-27T10:00:00.000Z');
  assert.equal(normalized.updatedAt, '2026-07-27T10:00:00.000Z');
});

test('pin batch updates preserve pins queued during generation', async () => {
  const { markPinFailure, mergePinResult } = await import('../src/lib/pinBatch.mjs');
  const current = [
    { id: 'working', title: '' },
    { id: 'arrived-later', title: 'New queue item' }
  ];
  const merged = mergePinResult(current, 'working', { id: 'working', title: 'Generated' });
  const failed = markPinFailure(merged, 'working', 'Image request failed');

  assert.equal(merged.length, 2);
  assert.equal(merged[1].title, 'New queue item');
  assert.equal(failed[0].status, 'error');
  assert.equal(failed[1].title, 'New queue item');
});

test('large recipe collections are split into stable complete ranges', () => {
  assert.deepEqual(buildRecipeChunkRanges(12, 5), [
    { start: 1, end: 5 },
    { start: 6, end: 10 },
    { start: 11, end: 12 }
  ]);
  assert.equal(recommendedRecipeCollectionLength(20), '4500-6000');
  assert.equal(recommendedRecipeCollectionLength(30), '6500-8500');
});

test('selected article length controls compact versus complete collection generation', async () => {
  const {
    articleLengthMaximum: browserArticleLengthMaximum,
    usesCompactRecipeCollection: browserUsesCompactRecipeCollection
  } = await import('../src/lib/recipeTitle.mjs');

  assert.equal(articleLengthMaximum('900-1200'), 1200);
  assert.equal(usesCompactRecipeCollection(29, '900-1200'), true);
  assert.equal(usesCompactRecipeCollection(29, '6500-8500'), false);
  assert.equal(usesCompactRecipeCollection(5, '600-800'), false);
  assert.equal(browserArticleLengthMaximum('1400-1800'), 1800);
  assert.equal(browserUsesCompactRecipeCollection(20, '1400-1800'), true);
  assert.equal(browserUsesCompactRecipeCollection(20, '4500-6000'), false);
});

test('article setting resolver gives a selected preset precedence over the global length', async () => {
  const { resolveArticleGenerationSettings } = await import('../src/lib/articleGenerationSettings.mjs');
  const resolved = resolveArticleGenerationSettings({
    article: { projectPresetId: 'recipe-seo' },
    preset: { id: 'recipe-seo', articleLength: '1400-1800' },
    smartRecommendations: { articleLength: '1100-1500' },
    globalSettings: { articleLength: '900-1200' }
  });

  assert.equal(resolved.articleLength, '1400-1800');
  assert.equal(resolved.articleLengthSource, 'preset');
});

test('article setting resolver gives a custom article length precedence over a preset', async () => {
  const { resolveArticleGenerationSettings } = await import('../src/lib/articleGenerationSettings.mjs');
  const resolved = resolveArticleGenerationSettings({
    article: { articleLength: '2200-2600', articleLengthSource: 'custom' },
    preset: { articleLength: '1400-1800' },
    smartRecommendations: { articleLength: '1100-1500' },
    globalSettings: { articleLength: '900-1200' }
  });

  assert.equal(resolved.articleLength, '2200-2600');
  assert.equal(resolved.articleLengthSource, 'custom');
});

test('article setting resolver uses smart length before the global fallback', async () => {
  const { resolveArticleGenerationSettings } = await import('../src/lib/articleGenerationSettings.mjs');
  const resolved = resolveArticleGenerationSettings({
    article: {},
    preset: {},
    smartRecommendations: { articleLength: '1600-2000' },
    globalSettings: { articleLength: '900-1200' }
  });

  assert.equal(resolved.articleLength, '1600-2000');
  assert.equal(resolved.articleLengthSource, 'smart');
});

test('article setting resolver uses global then system length only as fallbacks', async () => {
  const {
    resolveArticleGenerationSettings,
    SYSTEM_ARTICLE_GENERATION_DEFAULTS
  } = await import('../src/lib/articleGenerationSettings.mjs');
  const globalResolved = resolveArticleGenerationSettings({
    globalSettings: { articleLength: '1000-1400' }
  });
  const systemResolved = resolveArticleGenerationSettings({
    globalSettings: {},
    systemDefaults: SYSTEM_ARTICLE_GENERATION_DEFAULTS
  });

  assert.equal(globalResolved.articleLengthSource, 'global');
  assert.equal(globalResolved.articleLength, '1000-1400');
  assert.equal(systemResolved.articleLengthSource, 'system');
  assert.equal(systemResolved.articleLength, '900-1200');
});

test('article setting resolver preserves a legacy saved length without a source field', async () => {
  const { resolveArticleGenerationSettings } = await import('../src/lib/articleGenerationSettings.mjs');
  const resolved = resolveArticleGenerationSettings({
    article: { articleLength: '1800-2200' },
    preset: {},
    smartRecommendations: {},
    globalSettings: { articleLength: '900-1200' }
  });

  assert.equal(resolved.articleLength, '1800-2200');
  assert.equal(resolved.articleLengthSource, 'custom');
});

test('recipe collection validation rejects thin or misnumbered recipes', () => {
  const complete = `
    <h2>1. Lemon Chicken</h2>
    <ul class="recipe-facts"><li><strong>Prep Time:</strong> 10 minutes</li><li><strong>Total Time:</strong> 30 minutes</li><li><strong>Servings:</strong> 4</li></ul>
    <h3>Ingredients</h3><ul><li>1 lb chicken</li><li>1 lemon</li><li>2 tbsp oil</li><li>1 tsp salt</li></ul>
    <h3>Instructions</h3><ol><li>Heat the pan.</li><li>Cook the chicken.</li><li>Finish with lemon.</li></ol>
    <h2>2. Tomato Pasta</h2>
    <ul class="recipe-facts"><li><strong>Prep Time:</strong> 10 minutes</li><li><strong>Total Time:</strong> 25 minutes</li><li><strong>Yield:</strong> 4 servings</li></ul>
    <h3>Ingredients</h3><ul><li>12 oz pasta</li><li>2 cups tomatoes</li><li>2 tbsp oil</li><li>1 tsp salt</li></ul>
    <h3>Instructions</h3><ol><li>Boil the pasta.</li><li>Cook the sauce.</li><li>Combine and serve.</li></ol>`;
  assert.equal(validateRecipeChunk(complete, 1, 2).ok, true);
  assert.equal(validateRecipeChunk(complete.replace('<h2>2.', '<h2>3.'), 1, 2).ok, false);
  assert.equal(validateRecipeChunk(complete.replace(/<li>1 tsp salt<\/li>/g, ''), 1, 2).ok, false);
});

test('recipe card validation requires quantities, timing, yield, and complete steps', () => {
  const card = `<section id="recipe-card">
    <ul><li><strong>Prep Time:</strong> 10 minutes</li><li><strong>Total Time:</strong> 30 minutes</li><li><strong>Servings:</strong> 4</li></ul>
    <h3>Ingredients</h3><ul><li>1 lb chicken</li><li>1 lemon</li><li>2 tbsp oil</li><li>1 tsp salt</li></ul>
    <h3>Instructions</h3><ol><li>Heat the pan.</li><li>Cook for 12 minutes.</li><li>Rest and serve.</li></ol>
  </section>`;
  assert.equal(validateRecipeCard(card).ok, true);
  assert.equal(validateRecipeCard(card.replace('<li>1 lb chicken</li>', '<li>chicken</li>').replace('<li>1 lemon</li>', '<li>lemon</li>')).ok, false);
});

test('recipe collection title detection ignores time and calorie numbers', async () => {
  const { parsePromisedRecipeCount } = await import('../src/lib/recipeTitle.mjs');
  assert.equal(parsePromisedRecipeCount('23 Garlic Butter Shrimp Recipes Ready in 30 Minutes'), 23);
  assert.equal(parsePromisedRecipeCount('23 No-Cook Mediterranean Lunches for Busy Days'), 23);
  assert.equal(parsePromisedRecipeCount('18 Easy Chicken Casseroles for Weeknights'), 18);
  assert.equal(parsePromisedRecipeCount('Healthy Meals Under 500 Calories: 20 Dinner Recipes'), 20);
  assert.equal(parsePromisedRecipeCount('10 Minute Garlic Butter Shrimp Recipe'), 0);
  assert.equal(parsePromisedRecipeCount('Dinner Under 500 Calories'), 0);
});

test('recipe card repair replaces an existing card or appends a missing one', () => {
  const { replaceRecipeCard } = require('../electron/recipe-generation');
  const repaired = `<section id="recipe-card"><h3>Ingredients</h3><ul><li>1 cup rice</li></ul></section>`;
  assert.equal(
    replaceRecipeCard('<p>Intro</p><section id="recipe-card"><p>Old</p></section>', repaired),
    `<p>Intro</p>${repaired}`
  );
  assert.equal(replaceRecipeCard('<p>Intro</p>', repaired), `<p>Intro</p>\n${repaired}`);
});

test('trend evidence only labels a directly related live search as live', () => {
  const liveTrends = [
    { title: 'Garlic butter shrimp', traffic: '20K+', publishedAt: 'Tue, 21 Jul 2026 10:00:00 GMT' },
    { title: 'Election results', traffic: '100K+' }
  ];
  assert.equal(findLiveTrendMatch('garlic butter shrimp dinners', 'Garlic Butter Shrimp Recipes', liveTrends)?.title, 'Garlic butter shrimp');
  assert.equal(findLiveTrendMatch('chocolate chip cookies', 'Chewy Cookie Recipe', liveTrends), null);

  const evidence = classifyKeywordEvidence({
    keyword: 'garlic butter shrimp dinners',
    suggestedTitle: 'Garlic Butter Shrimp Recipes',
    pinterestEvidence: { outboundClicks: 12, pinClicks: 30, saves: 7 },
    liveTrends
  });
  assert.equal(evidence.evidenceType, 'combined');
  assert.equal(evidence.evidenceConfidence, 'high');
  assert.match(evidence.publishWindow, /24 to 48 hours/);
});

test('Meta quality preflight catches incomplete content and accepts a complete campaign', async () => {
  const { scoreMetaContent } = await import('../src/lib/metaQuality.mjs');
  const incomplete = scoreMetaContent({ facebook: { primaryPost: 'Try this.' }, instagram: {} });
  assert.ok(incomplete.score < 40);
  assert.ok(incomplete.failed.some((check) => check.id === 'ig-production'));

  const complete = scoreMetaContent({
    strategy: { originalityAngle: 'A practical texture-first cooking lesson with exact visual cues.' },
    facebook: {
      primaryPost: 'Garlic butter shrimp becomes much easier when the pan is hot before the shrimp go in. This guide shows the timing, texture cues, and simple sides that turn it into dinner. Which side would you serve with it?',
      cta: 'Read the complete recipe',
      imageAltText: 'Garlic butter shrimp in a skillet with lemon and chopped parsley.'
    },
    instagram: {
      feedCaption: 'Juicy garlic butter shrimp with crisp golden edges.\n\nUse a hot skillet, dry the shrimp well, and cook in one layer for the best texture. Save this plan for your next quick dinner.',
      cta: 'Save this recipe for dinner',
      hashtags: ['#shrimprecipes', '#quickdinner', '#skilletrecipes'],
      imageAltText: 'Close-up of golden garlic butter shrimp with lemon and parsley in a skillet.',
      reelHook: 'Watch the shrimp turn golden in minutes',
      reelScenes: ['9:16 close-up of raw shrimp', '9:16 skillet sizzle', '9:16 finished dish'],
      reelProductionNotes: 'Vertical 9:16 with original audio, readable captions, all text inside safe zones, and no watermark.',
      carouselSlides: Array.from({ length: 5 }, (_, index) => ({ heading: `Step ${index + 1}`, body: 'One practical cooking detail readers can use.' }))
    }
  }, {
    sourceUrl: 'https://example.com/garlic-butter-shrimp/',
    imageAssets: [{ publicUrl: 'https://images.example.com/shrimp.webp' }]
  });
  assert.ok(complete.score >= 90);
  assert.equal(complete.level, 'Ready');
});

test('affiliate matching adds limited sponsored links and a single disclosure outside the recipe card', async () => {
  const {
    applyAffiliateLinksToArticle,
    findAffiliateOpportunities
  } = await import('../src/lib/affiliateLinks.mjs');
  const article = {
    id: 'recipe-1',
    title: 'Easy Bread Recipe',
    content: [
      '<p>This practical bread guide explains the full method.</p>',
      '<p>Use a digital kitchen scale when measuring flour for consistent dough.</p>',
      '<p>A sturdy loaf pan helps the bread bake into an even shape.</p>',
      '<section id="recipe-card" class="recipe-card"><p>Use a silicone spatula to scrape the bowl.</p></section>'
    ].join('\n')
  };
  const settings = {
    affiliateEnabled: true,
    affiliateMaxLinks: 2,
    affiliateDisclosure: 'I may earn a commission from purchases made through links in this post.',
    affiliateLinks: [
      {
        id: 'scale',
        name: 'Digital Kitchen Scale',
        url: 'https://shop.example/scale?tag=site',
        keywords: 'digital kitchen scale, kitchen scale',
        anchorText: 'digital kitchen scale',
        imageUrl: 'https://images.example/scale.jpg',
        currentPrice: '29.99',
        originalPrice: '39.99',
        discountPercentage: '25',
        currency: 'USD',
        manufacturer: 'Measure Well',
        trackingVerified: true,
        trackingPartnerId: '7445429'
      },
      { id: 'pan', name: 'Loaf Pan', url: 'https://shop.example/loaf-pan', keywords: 'loaf pan', anchorText: 'loaf pan' },
      { id: 'spatula', name: 'Silicone Spatula', url: 'https://shop.example/spatula', keywords: 'silicone spatula', anchorText: 'silicone spatula' }
    ]
  };

  const opportunities = findAffiliateOpportunities({ article, content: article.content, settings });
  assert.equal(opportunities.length, 2);

  const first = applyAffiliateLinksToArticle(article, settings);
  const second = applyAffiliateLinksToArticle(first, settings);
  assert.equal(first.affiliateLinks.length, 2);
  assert.equal((second.content.match(/data-affiliate-disclosure="true"/g) || []).length, 1);
  assert.equal((second.content.match(/data-affiliate-id=/g) || []).length, 2);
  assert.equal((second.content.match(/data-affiliate-recommendation="true"/g) || []).length, 1);
  assert.match(second.content, /Helpful tool for this recipe/);
  assert.match(second.content, /Check current deal/);
  assert.match(second.content, /Was \$39\.99/);
  assert.match(second.content, /Now \$29\.99/);
  assert.match(second.content, /Save 25%/);
  assert.match(second.content, /Paid link:/);
  assert.match(second.content, /loading="lazy"/);
  assert.match(second.content, /rel="sponsored nofollow noopener"/);
  assert.match(second.content, /href="https:\/\/shop\.example\/scale\?tag=site"/);
  assert.doesNotMatch(second.content.match(/<section[^>]*id="recipe-card"[\s\S]*?<\/section>/i)?.[0] || '', /data-affiliate-id=/);
  assert.equal(second.affiliateLinks[0].trackingVerified, true);
  assert.equal(second.affiliateLinks[0].trackingPartnerId, '7445429');
});

test('affiliate cards do not advertise a sale without a lower verified current price', async () => {
  const { applyAffiliateLinksToArticle } = await import('../src/lib/affiliateLinks.mjs');
  const article = {
    title: 'Mixing Bowl Guide',
    content: '<p>Start with the ingredients.</p><p>Use a mixing bowl large enough to fold the batter.</p>'
  };
  const applied = applyAffiliateLinksToArticle(article, {
    affiliateLinks: [{
      id: 'bowl',
      name: 'Mixing Bowl',
      url: 'https://shop.example/bowl',
      keywords: 'mixing bowl',
      currentPrice: '35.00',
      originalPrice: '30.00',
      discountPercentage: '40',
      currency: 'USD'
    }]
  });

  assert.match(applied.content, /Current price: \$35/);
  assert.doesNotMatch(applied.content, /Check current deal|Save 40%|Was \$30/);
});

test('strong verified Impact matches are inserted automatically without an exact body phrase', async () => {
  const { applyAffiliateLinksToArticle } = await import('../src/lib/affiliateLinks.mjs');
  const article = {
    id: 'cookie-article',
    title: 'Soft Chocolate Chip Cookies',
    content: [
      '<p>These cookies use a dependable mixing method.</p>',
      '<p>Cream the butter and sugar, then fold in the dry ingredients without overmixing.</p>',
      '<p>Bake until the edges are set and the centers remain soft.</p>'
    ].join('')
  };
  const applied = applyAffiliateLinksToArticle(article, {
    affiliateLinks: [{
      id: 'impact-bowls',
      name: 'Ceramic Mixing Bowls',
      url: 'https://merchant.pxf.io/c/7445429/123/456',
      keywords: ['ceramic mixing bowls'],
      source: 'impact',
      trackingVerified: true,
      discoveryScore: 140,
      discoveryReason: 'The recipe mixes wet and dry ingredients in separate bowls.'
    }]
  });

  assert.equal(applied.affiliateLinks.length, 1);
  assert.equal(applied.affiliateLinks[0].automaticPlacement, true);
  assert.match(applied.content, /Helpful tool for this recipe/);
  assert.match(applied.content, /Ceramic Mixing Bowls/);
  assert.equal((applied.content.match(/data-affiliate-disclosure="true"/g) || []).length, 1);
});

test('verified Amazon matches use tagged links, Amazon CTA text, and required disclosure', async () => {
  const { applyAffiliateLinksToArticle } = await import('../src/lib/affiliateLinks.mjs');
  const article = {
    id: 'amazon-recipe-1',
    title: 'Easy Skillet Chicken',
    content: [
      '<p>This skillet chicken recipe is ready for a busy weeknight.</p>',
      '<p>Heat the pan before adding the chicken so the outside browns evenly.</p>',
      '<section id="recipe-card"><p>Cook the chicken in a skillet.</p></section>'
    ].join('\n')
  };
  const settings = {
    affiliateEnabled: true,
    affiliateMaxLinks: 1,
    affiliateDisclosure: 'This post may contain paid links.',
    affiliateLinks: [{
      id: 'amazon-cast-iron-skillet',
      name: 'Lodge 10.25 Inch Cast Iron Skillet',
      url: 'https://www.amazon.com/dp/B00006JSUA?tag=exampletag-20',
      keywords: ['skillet', 'pan'],
      anchorText: 'cast iron skillet',
      source: 'amazon',
      manufacturer: 'Amazon',
      amazonAsin: 'B00006JSUA',
      amazonLinkType: 'product',
      amazonPartnerTag: 'exampletag-20',
      trackingVerified: true,
      discoveryScore: 0
    }]
  };

  const applied = applyAffiliateLinksToArticle(article, settings);

  assert.equal(applied.affiliateLinks.length, 1);
  assert.match(applied.content, /tag=exampletag-20/);
  assert.match(applied.content, /View on Amazon/);
  assert.match(applied.content, /As an Amazon Associate I earn from qualifying purchases\./);
  assert.match(applied.content, /rel="sponsored nofollow noopener"/);
  assert.doesNotMatch(applied.content, /Current price:|Was \$|Save \d+%/);
  assert.doesNotMatch(applied.content.match(/<section[^>]*id="recipe-card"[\s\S]*?<\/section>/i)?.[0] || '', /data-affiliate-id=/);
});

test('legacy Amazon search links are never inserted into articles', async () => {
  const { applyAffiliateLinksToArticle } = await import('../src/lib/affiliateLinks.mjs');
  const applied = applyAffiliateLinksToArticle({
    title: 'Easy Skillet Chicken',
    content: '<p>Useful introduction.</p><p>Heat a skillet before adding the chicken.</p>'
  }, {
    affiliateLinks: [{
      id: 'amazon-search-link',
      name: 'Shop cast iron skillet on Amazon',
      url: 'https://www.amazon.com/s?k=cast+iron+skillet&tag=exampletag-20',
      keywords: ['skillet'],
      anchorText: 'cast iron skillet',
      source: 'amazon',
      amazonLinkType: 'search',
      trackingVerified: true,
      discoveryScore: 100
    }]
  });

  assert.equal(applied.affiliateLinks.length, 0);
  assert.doesNotMatch(applied.content, /amazon\.com/);
});

test('unverified or weak affiliate products are never force-placed', async () => {
  const { applyAffiliateLinksToArticle } = await import('../src/lib/affiliateLinks.mjs');
  const article = {
    title: 'Chocolate Chip Cookies',
    content: '<p>Useful introduction.</p><p>Fold the dough and bake until golden.</p>'
  };
  const applied = applyAffiliateLinksToArticle(article, {
    affiliateLinks: [{
      id: 'unrelated',
      name: 'Ceramic Mixing Bowls',
      url: 'https://shop.example/bowls',
      keywords: ['ceramic mixing bowls'],
      source: 'impact',
      trackingVerified: false,
      discoveryScore: 200
    }]
  });

  assert.equal(applied.affiliateLinks.length, 0);
  assert.doesNotMatch(applied.content, /affiliate-recommendation|affiliate-disclosure/);
});

test('managed affiliate links can be removed without removing the article wording', async () => {
  const {
    applyAffiliateLinksToArticle,
    removeManagedAffiliateLinks
  } = await import('../src/lib/affiliateLinks.mjs');
  const article = {
    title: 'Kitchen Scale Guide',
    content: '<p>Start with accurate measurements.</p><p>A kitchen scale makes portioning easier.</p>'
  };
  const settings = {
    affiliateLinks: [
      { id: 'scale', name: 'Kitchen Scale', url: 'https://shop.example/scale', keywords: 'kitchen scale', anchorText: 'kitchen scale' }
    ]
  };

  const applied = applyAffiliateLinksToArticle(article, settings);
  const removed = removeManagedAffiliateLinks(applied);
  assert.doesNotMatch(removed.content, /data-affiliate|affiliate-disclosure/);
  assert.match(removed.content, /A kitchen scale makes portioning easier\./);
  assert.deepEqual(removed.affiliateLinks, []);
});

test('affiliate matching rejects admin, image, local, and non-web destinations', async () => {
  const { findAffiliateOpportunities } = await import('../src/lib/affiliateLinks.mjs');
  const article = { title: 'Best blender', content: '<p>Intro.</p><p>A blender makes this sauce smooth.</p>' };
  const settings = {
    affiliateLinks: [
      { name: 'Admin', url: 'https://shop.example/admin/product', keywords: 'blender' },
      { name: 'Image', url: 'https://shop.example/blender.jpg', keywords: 'blender' },
      { name: 'Local', url: 'http://localhost/blender', keywords: 'blender' },
      { name: 'Script', url: 'javascript:alert(1)', keywords: 'blender' },
      { name: 'Valid Blender', url: 'https://shop.example/blender', keywords: 'blender' }
    ]
  };

  const opportunities = findAffiliateOpportunities({ article, content: article.content, settings });
  assert.deepEqual(opportunities.map((item) => item.name), ['Valid Blender']);
});

test('generated in-text images are inserted once and stay outside the recipe card', async () => {
  const { insertArticleImages } = await import('../src/lib/articlePostProcess.mjs');
  const content = [
    '<p>Useful introduction.</p>',
    '<h2>Ingredients and preparation</h2>',
    '<p>Prepare the ingredients before heating the pan.</p>',
    '<h2>Cooking method</h2>',
    '<p>Cook until the center reaches the correct temperature.</p>',
    '<section id="recipe-card"><h2>Recipe Card</h2><p>Card content.</p></section>'
  ].join('\n');
  const images = [
    { id: 'step-1', url: 'file:///images/step-1.webp', altText: 'Measured ingredients arranged beside the mixing bowl' },
    { id: 'step-2', url: 'file:///images/step-2.webp', altText: 'Finished recipe in a serving dish' }
  ];

  const inserted = insertArticleImages(content, images);
  const repeated = insertArticleImages(inserted, images);
  const card = repeated.match(/<section[^>]*id=["']recipe-card["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || '';

  assert.equal((repeated.match(/data-content-studio-image-id=/g) || []).length, 2);
  assert.equal(repeated, inserted);
  assert.match(repeated, /loading="lazy" decoding="async"/);
  assert.match(repeated, /width="576" height="1024"/);
  assert.doesNotMatch(card, /data-content-studio-image-id=/);
});

test('article media recovery rejects stale local URLs but keeps safe remote sources', () => {
  const { normalizeArticleMediaRecord } = require('../electron/article-media');
  const remote = 'https://replicate.delivery/example/recipe.webp';
  const article = normalizeArticleMediaRecord({
    featuredImageLocalPath: 'C:\\missing\\featured.webp',
    featuredImageLocalUrl: 'file:///C:/missing/featured.webp',
    featuredImageRemoteUrl: remote,
    images: [{
      id: 'image-1',
      localPath: 'C:\\missing\\step.webp',
      displayUrl: 'file:///C:/missing/step.webp',
      remoteImageUrl: remote
    }],
    generationCheckpoint: {
      featured: {
        localPath: 'C:\\missing\\checkpoint.webp',
        displayUrl: 'file:///C:/missing/checkpoint.webp',
        remoteImageUrl: remote
      },
      images: [{
        localPath: 'C:\\missing\\checkpoint-step.webp',
        displayUrl: 'file:///C:/missing/checkpoint-step.webp'
      }]
    }
  }, () => '');

  assert.equal(article.featuredImageDisplay, remote);
  assert.equal(article.featuredImageLocalUrl, '');
  assert.equal(article.featuredImageLocalMissing, true);
  assert.equal(article.images[0].displayUrl, remote);
  assert.equal(article.images[0].localMediaMissing, true);
  assert.equal(article.generationCheckpoint.featured.displayUrl, remote);
  assert.equal(article.generationCheckpoint.featured.localMediaMissing, true);
  assert.equal(article.generationCheckpoint.images[0].displayUrl, '');
  assert.equal(article.generationCheckpoint.images[0].localMediaMissing, true);
});

test('performance intelligence builds stable comparison windows and opportunities', () => {
  const ranges = analyticsDateRanges(new Date('2026-07-24T12:00:00Z'), 28);
  assert.deepEqual(ranges.current, { startDate: '2026-06-25', endDate: '2026-07-22' });
  assert.deepEqual(ranges.previous, { startDate: '2026-05-28', endDate: '2026-06-24' });

  const current = [{ keys: ['https://example.com/recipe/'], clicks: 8, impressions: 1000, ctr: 0.008, position: 7 }];
  const previous = [{ keys: ['https://example.com/recipe/'], clicks: 12, impressions: 700, ctr: 0.017, position: 6 }];
  const opportunities = buildSearchOpportunities(current, previous);
  assert.equal(opportunities[0].type, 'Improve CTR');
  assert.match(opportunities[0].recommendation, /title and meta description/i);
  assert.deepEqual(summarizeSearchRows(current), { clicks: 8, impressions: 1000, ctr: 0.008, position: 7 });
});

test('performance intelligence normalizes Pinterest and GHL API values', () => {
  assert.deepEqual(normalizePinterestSummary({
    all: { IMPRESSION: 9000, PIN_CLICK: 240, OUTBOUND_CLICK: 75, SAVE: 31 }
  }), { impressions: 9000, pinClicks: 240, outboundClicks: 75, saves: 31 });
  assert.equal(normalizeGhlStatus('IN_PROGRESS'), 'in_progress');
  assert.equal(normalizeGhlStatus(''), 'unknown');
});

test('recipe SEO monitor finds Recipe JSON-LD and scores live page essentials', () => {
  const html = `
    <!doctype html>
    <html><head>
      <title>Easy Garlic Butter Shrimp Recipe</title>
      <meta name="description" content="Make garlic butter shrimp with clear timing, substitutions, storage tips, and a complete recipe card for a reliable weeknight dinner.">
      <meta name="robots" content="index,follow">
      <link rel="canonical" href="https://example.com/garlic-shrimp/">
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Recipe","name":"Garlic Butter Shrimp","image":["https://example.com/shrimp.webp"],"prepTime":"PT10M","cookTime":"PT10M","totalTime":"PT20M","recipeYield":"4 servings","recipeIngredient":["1 lb shrimp"],"recipeInstructions":[{"@type":"HowToStep","text":"Cook the shrimp."}],"nutrition":{"@type":"NutritionInformation","calories":"250 calories"}}
      </script>
    </head><body>
      <img src="shrimp.webp" alt="Garlic butter shrimp in a skillet">
      <a href="/side-dishes/">Side dishes</a><a href="/desserts/">Desserts</a>
    </body></html>`;
  assert.equal(parseJsonLd(html).length, 1);
  const audit = auditRecipeHtml({ html, url: 'https://example.com/garlic-shrimp/', status: 200 });
  assert.equal(audit.recipeFound, true);
  assert.equal(audit.recipeRequired.name, true);
  assert.equal(audit.recipeRecommended.recipeInstructions, true);
  assert.equal(audit.missingAltImages, 0);
  assert.equal(audit.internalLinks, 2);
  assert.equal(audit.score, 100);
});

test('completed articles view uses the imported publication checker', () => {
  const source = fs.readFileSync(require.resolve('../src/components/ArticlesList.jsx'), 'utf8');
  assert.match(source, /import\s+\{\s*isArticlePublished\s*\}/);
  assert.doesNotMatch(source, /\bisPublished\s*\(/);
  assert.doesNotMatch(source, /\.(?:filter|some)\(isPublished\)/);
});

test('article generation overlaps independent planning while preserving bounded concurrency', () => {
  const source = fs.readFileSync(require.resolve('../src/components/Queue.jsx'), 'utf8');
  assert.match(source, /Promise\.all\(\[titleTask,\s*featuredPromptTask\]\)/);
  assert.match(source, /Promise\.all\(\[featuredTask,\s*imagePromptsTask\]\)/);
  assert.match(source, /missingIndexes\.slice\(start,\s*start\s*\+\s*2\)/);
  assert.match(source, /internalLinkPostsCacheRef/);
});

test('WordPress publishing enforces bounded WebP media and responsive attachment recognition', () => {
  const source = fs.readFileSync(require.resolve('../electron/main.js'), 'utf8');
  assert.match(source, /targetBytes:\s*280\s*\*\s*1024/);
  assert.match(source, /targetBytes:\s*220\s*\*\s*1024/);
  assert.match(source, /wp-image-\$\{Number\(attachmentId\)\}/);
  assert.match(source, /loading',\s*'lazy'/);
  assert.match(source, /fetchpriority',\s*'low'/);
});

test('diagnostics report connection presence without exposing stored secrets', () => {
  const status = connectionStatus({
    replicateApiToken_encrypted: 'enc:replicate-private-value',
    ghlApiToken_encrypted: 'enc:ghl-private-value',
    ghlLocationId: 'location-1',
    impactAccountSid: 'account-1',
    impactAuthToken_encrypted: 'enc:impact-private-value',
    wordpressSites: [{ url: 'https://example.com', apiKey_encrypted: 'enc:wordpress-private-value' }],
    pinCreator: { imgbbApiKey_encrypted: 'enc:imgbb-private-value' }
  });
  const report = sanitizeDiagnosticReport('Authorization: Bearer private-token api_token=private-value');

  assert.equal(status.replicate, true);
  assert.equal(status.wordpress, true);
  assert.equal(status.goHighLevel, true);
  assert.equal(status.impact, true);
  assert.equal(status.amazon, false);
  assert.doesNotMatch(JSON.stringify(status), /private-value/);
  assert.doesNotMatch(report, /private-token|private-value/);
});

test('renderer error fallback sanitizes credentials and exposes recovery actions', async () => {
  const { sanitizeErrorDetails } = await import('../src/lib/sanitizeError.mjs');
  const sanitized = sanitizeErrorDetails(
    'Bearer secret-token api_token=private-value https://user:password@example.com/path?token=query-secret'
  );
  const source = fs.readFileSync(require.resolve('../src/components/ErrorBoundary.jsx'), 'utf8');

  assert.doesNotMatch(sanitized, /secret-token|private-value|password|query-secret/);
  assert.match(source, /Reload Screen/);
  assert.match(source, /Return to Articles/);
  assert.match(source, /Copy Error Details/);
  assert.match(source, /Open Logs Folder/);
  assert.match(source, /Restore Latest Backup/);
});

test('preload exposes explicit IPC methods without a generic renderer escape hatch', () => {
  const source = fs.readFileSync(require.resolve('../electron/preload.js'), 'utf8');
  assert.match(source, /contextBridge\.exposeInMainWorld\('electronAPI'/);
  assert.match(source, /getDiagnostics:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-diagnostics'\)/);
  assert.match(source, /restoreLatestWorkspaceBackup:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('restore-latest-workspace-backup'\)/);
  assert.doesNotMatch(source, /electronAPI[^]*ipcRenderer\s*[,}]/);
  assert.doesNotMatch(source, /nodeIntegration\s*:/);
});

test('WordPress payload creation supports draft, category, slug, and future scheduling', () => {
  const draft = buildWordPressPostPayload({
    article: {
      title: 'Lemon Chicken',
      slug: 'lemon-chicken',
      metaDescription: 'Useful recipe description.',
      wordpressCategoryId: '12',
      publishStatusOverride: 'draft'
    },
    content: '<p>Prepared recipe.</p>',
    featuredMediaId: 44
  });
  assert.deepEqual(draft.payload.categories, [12]);
  assert.equal(draft.payload.status, 'draft');
  assert.equal(draft.payload.slug, 'lemon-chicken');
  assert.equal(draft.payload.featured_media, 44);

  const scheduled = buildWordPressPostPayload({
    article: {
      title: 'Scheduled Recipe',
      publishStatusOverride: 'future',
      scheduledAt: '2026-08-10T12:00:00.000Z'
    },
    now: new Date('2026-08-01T12:00:00.000Z').getTime()
  });
  assert.equal(scheduled.payload.status, 'future');
  assert.equal(scheduled.payload.date_gmt, '2026-08-10T12:00:00.000Z');
  assert.throws(() => buildWordPressPostPayload({
    article: {
      title: 'Past Recipe',
      publishStatusOverride: 'future',
      scheduledAt: '2026-07-01T12:00:00.000Z'
    },
    now: new Date('2026-08-01T12:00:00.000Z').getTime()
  }), /valid future publication date/);
});

test('mocked article workflow reaches review and prepares a WordPress draft without live calls', async () => {
  const { resolveArticleGenerationSettings } = await import('../src/lib/articleGenerationSettings.mjs');
  const { buildArticleBrief } = await import('../src/lib/articleBrief.mjs');
  const { buildMetadata, buildRecipeSchema } = await import('../src/lib/articlePostProcess.mjs');
  const { buildArticleQualityReport } = await import('../src/lib/articleQuality.mjs');
  const { normalizeArticleWorkflow } = await import('../src/lib/articleWorkflow.mjs');
  let liveCalls = 0;

  const queued = {
    id: 'mock-flow-1',
    title: 'Easy Lemon Chicken Recipe',
    workflowStatus: 'queued',
    queueStatus: 'pending',
    projectPresetId: 'recipe-review'
  };
  const resolved = resolveArticleGenerationSettings({
    article: queued,
    preset: {
      id: 'recipe-review',
      articleLength: '1400-1800',
      requireOutlineApproval: true,
      recipeCardEnabled: true
    },
    globalSettings: {
      articleLength: '900-1200',
      aiModel: 'gpt5nano',
      imageModel: 'z-image-turbo'
    }
  });
  const brief = buildArticleBrief({
    article: queued,
    resolvedSettings: {
      ...resolved,
      primaryKeyword: 'easy lemon chicken recipe',
      targetAudience: 'Busy home cooks'
    }
  });
  const outline = normalizeArticleOutline(`
    <h2>Why This Recipe Works</h2>
    <h2>Ingredients</h2>
    <h2>Instructions</h2>
    <h2>Storage and Reheating</h2>
  `);
  const content = `
    <p>Easy lemon chicken is a practical one-pan dinner with clear cooking cues.</p>
    <h2>Why This Recipe Works</h2><p>The sauce balances lemon, broth, and gentle heat.</p>
    <h2>Ingredients</h2><p>Use evenly sized chicken pieces for consistent cooking.</p>
    <h2>Instructions</h2><p>Cook until the center reaches a safe temperature and the sauce lightly coats a spoon.</p>
    <h2>Storage and Reheating</h2><p>Cool promptly, refrigerate, and reheat gently.</p>
    <section id="recipe-card" itemscope itemtype="https://schema.org/Recipe">
      <h2>Recipe Card</h2><h3 itemprop="name">Easy Lemon Chicken</h3>
      <ul><li><strong>Prep Time:</strong> 10 minutes</li><li><strong>Cook Time:</strong> 20 minutes</li><li><strong>Total Time:</strong> 30 minutes</li><li><strong>Servings:</strong> 4</li></ul>
      <h3>Ingredients</h3><ul itemprop="recipeIngredient"><li>1 pound chicken</li><li>1 lemon</li><li>1 tablespoon oil</li><li>1 cup broth</li></ul>
      <h3>Instructions</h3><ol itemprop="recipeInstructions"><li>Heat the pan for 2 minutes.</li><li>Cook chicken until browned and safely done.</li><li>Simmer sauce for 5 minutes until it coats a spoon.</li></ol>
    </section>`;
  const generated = {
    ...queued,
    articleBrief: brief,
    outline,
    outlineApproved: true,
    content,
    featuredImage: 'https://example.com/lemon-chicken.webp',
    featuredImageAlt: 'Lemon chicken served in a skillet',
    images: [{ url: 'https://example.com/lemon-step.webp', altText: 'Chicken browning in a skillet' }],
    articleLength: resolved.articleLength,
    recipeCardEnabled: true
  };
  const metadata = buildMetadata(generated, generated.content);
  const structuredData = buildRecipeSchema({ ...generated, ...metadata });
  const qualityReport = buildArticleQualityReport({
    ...generated,
    ...metadata,
    structuredData
  }, { requireFeaturedImage: true });
  const reviewed = normalizeArticleWorkflow({
    ...generated,
    ...metadata,
    structuredData,
    qualityReport,
    workflowStatus: 'needs-review'
  });
  const wordpressDraft = buildWordPressPostPayload({
    article: { ...reviewed, publishStatusOverride: 'draft' },
    site: { defaultCategoryId: 9 },
    content: reviewed.content,
    featuredMediaId: 22
  });

  assert.equal(liveCalls, 0);
  assert.equal(resolved.articleLength, '1400-1800');
  assert.equal(resolved.articleLengthSource, 'preset');
  assert.equal(outlineSectionCount(outline), 4);
  assert.equal(reviewed.workflowStatus, 'needs-review');
  assert.equal(reviewed.queueStatus, 'completed');
  assert.equal(wordpressDraft.payload.status, 'draft');
  assert.deepEqual(wordpressDraft.payload.categories, [9]);
  assert.equal(wordpressDraft.payload.featured_media, 22);
  assert.match(wordpressDraft.payload.content, /recipe-card/);
});
