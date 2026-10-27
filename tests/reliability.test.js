const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const { cancelJobsByPrefixes } = require('../electron/job-control');
const {
  acknowledgePinQueueItems,
  dedupePinQueueItems,
  ensurePinQueueIds
} = require('../electron/pin-queue');
const { addUtmParams, isUtmEligibleDestination } = require('../electron/utm');
const {
  affiliateProviderOrder,
  affiliateProviderReadiness,
  normalizeAffiliateLibrary
} = require('../electron/affiliate-system');
const {
  PINTEREST_FOOD_GUARDRAIL_MARKER,
  enhancePinterestAiTextPrompt,
  enhancePinterestFoodPhotoPrompt,
  enhancePinterestImagePrompt,
  enhancePinterestOriginalJulyAiPrompt,
  enhancePinterestJuly25AiPrompt,
  enhancePinterestLegacyAiPrompt,
  enhancePinterestPromptLedAiPrompt,
  isLikelyBowlPrompt,
  isLikelyDrinkPrompt,
  isLikelyFoodPrompt,
  isPinterestAiLetteringPrompt,
  isPromptLedPinterestCreative,
  pinterestAiOverlayTreatment,
  pinterestAppetiteDirection,
  pinterestIngredientRealityRules,
  pinterestPhotographyDirection,
  removePreviousRequirements,
  stripTextProhibitions
} = require('../electron/pinterest-image-prompt');
const {
  buildOverlaySvg,
  comparePinterestImageIdentity,
  createPinterestOverlay,
  perceptualHash,
  perceptualHashDistance,
  polishPinterestOverlayText,
  shortOverlayText,
  wrapOverlayText
} = require('../electron/pinterest-overlay');
const {
  PINTEREST_CSV_HEADERS,
  assertPinterestCsvBytes,
  normalizePinterestKeywords,
  normalizePinterestPublishDate,
  pinterestCsvFilename,
  sanitizePinterestCsvValue,
  serializePinterestCsv,
  splitPinterestRows,
  validatePinterestRows
} = require('../electron/pinterest-export');
const { findMatchingWordPressSite, normalizedHostname } = require('../electron/pinterest-hosting');
const { buildPinSourceSnapshot } = require('../electron/pin-source');
const { extractCleanPinPrompt, fallbackPinPrompt, hasReasoningLeak } = require('../electron/pin-prompt-quality');
const { normalizeImportedArticles } = require('../electron/article-storage');
const { assertSafeRemoteRedirect, isPathInsideRoots, isSafeRemoteMediaUrl } = require('../electron/media-security');
const { mediaCleanupCandidates, normalizeMediaRetentionDays } = require('../electron/media-retention');
const { configuredWindowsPublisherNames, normalizeUpdateFeedUrl } = require('../electron/update-security');
const { mergePinStyles, migratePinStyles } = require('../electron/pin-style-settings');
const {
  articleLengthMaximum,
  buildRecipeChunkRanges,
  buildRecipeRetryPrompt,
  canonicalizeNumberedRecipeHeadings,
  extractNumberedH2s,
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
const { sanitizeWordPressArticleHtml } = require('../electron/wordpress-content');
const { connectionStatus, sanitizeDiagnosticReport, sanitizeProviderError } = require('../electron/diagnostics');
const { createWorkspaceStore } = require('../electron/workspace-store');
const { createJobCenter } = require('../electron/job-center');
const { buildPerformanceScheduleProfile, nextPerformanceSlots } = require('../electron/performance-scheduling');
const { postPublishChecks } = require('../electron/post-publish-qa');
const { chunkRows, numberedCsvPath } = require('../electron/ghl-export');
const { recoverMaskedTokenFailures, resolveRendererSecret } = require('../electron/credential-boundary');
const {
  extractPinterestSourceMetadata,
  fallbackPinterestClusterPlan,
  normalizePinterestClusterPlan
} = require('../electron/pinterest-clusters');
const { normalizeBatchImportRows } = require('../electron/article-import');
const {
  preferredMetaSource,
  syncAutomaticMetaProjects,
  upsertAutomaticMetaProject
} = require('../electron/meta-auto-pack');
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

test('Pinterest image prompts preserve ultra-realistic close-up food photography and polished overlay text', () => {
  const original = 'Garlic butter shrimp with the exact headline "Easy Shrimp Dinner" in a centered panel.';
  const enhanced = enhancePinterestImagePrompt(original);

  assert.match(enhanced, new RegExp(PINTEREST_FOOD_GUARDRAIL_MARKER));
  assert.match(enhanced, /unmistakably real, premium close-up editorial photograph/i);
  assert.match(enhanced, /72-86%/);
  assert.match(enhanced, /30-45 degree hero angle or close overhead angle/i);
  assert.match(enhanced, /large diffused side window and soft bounce fill/i);
  assert.match(enhanced, /real full-frame food-photography look with a natural 50-85mm perspective/i);
  assert.match(enhanced, /f\/4-f\/5\.6-like depth of field/i);
  assert.match(enhanced, /vertical 9:16 Pinterest composition/i);
  assert.match(enhanced, /only the one quoted headline/i);
  assert.match(enhanced, /premium bold display lettering/i);
  assert.match(enhanced, /strong contrasting outline/i);
  assert.doesNotMatch(enhanced, /frosted-glass ribbon/i);
  assert.match(enhanced, /Do not draw a banner/i);
  assert.ok(enhanced.startsWith(original));
  assert.equal(enhancePinterestImagePrompt(enhanced), enhanced);
});

test('Pinterest prompt enhancement replaces legacy rules without duplicating them', () => {
  const original = 'Chocolate cake with the exact headline "Easy Chocolate Cake".';
  const legacy = `${original}\n\nPINTEREST FOOD PHOTO REQUIREMENTS:\n- Old extreme macro instructions.`;
  const enhanced = enhancePinterestImagePrompt(legacy);

  assert.equal(removePreviousRequirements(legacy), original);
  assert.doesNotMatch(enhanced, /PINTEREST FOOD PHOTO REQUIREMENTS/);
  assert.equal(enhanced.split(PINTEREST_FOOD_GUARDRAIL_MARKER).length - 1, 1);
});

test('Pinterest prompt enhancement does not force recipe styling onto non-food subjects', () => {
  const enhanced = enhancePinterestImagePrompt('Bright modern kitchen organization with the exact headline "Calm Kitchen Ideas".');

  assert.equal(isLikelyFoodPrompt('Garlic butter shrimp recipe'), true);
  assert.equal(isLikelyFoodPrompt('Sparkling cherry lemonade'), true);
  assert.equal(isLikelyFoodPrompt('Modern entryway storage ideas'), false);
  assert.match(enhanced, /polished, believable editorial photograph/i);
  assert.doesNotMatch(enhanced, /exact finished recipe/i);
});

test('pin prompt quality allows normal titles containing actually and removes reasoning', () => {
  const valid = 'Photorealistic close-up of cottage cheese toast. Text Overlay: "Breakfasts That Actually Taste Good".';
  assert.equal(hasReasoningLeak(valid), false);
  assert.equal(extractCleanPinPrompt(valid), valid);

  const reasoned = `Let's craft the image prompt.\n\nFinal image prompt: Photorealistic close-up of cottage cheese toast with centered readable text.`;
  assert.match(extractCleanPinPrompt(reasoned), /^Photorealistic close-up/);
  const fallback = fallbackPinPrompt({ sourceTitle: 'Cottage Cheese Breakfast Ideas' }, 'middle');
  assert.match(fallback, /center band visually calm/i);
  assert.match(fallback, /Generate no text/i);
});

test('Pinterest clean-photo prompts remove model-generated overlay instructions', () => {
  const prompt = enhancePinterestFoodPhotoPrompt(
    'Close-up garlic shrimp. Text Overlay: "Easy Garlic Shrimp" on a frosted-glass ribbon.',
    'middle'
  );
  assert.match(prompt, /Generate only a clean/i);
  assert.match(prompt, /72-86%/);
  assert.match(prompt, /pores, crumbs, fibers/i);
  assert.match(prompt, /later exact title lettering/i);
  assert.doesNotMatch(prompt.split('PINTEREST CLEAN FOOD PHOTO REQUIREMENTS:')[0], /Text Overlay|frosted-glass/i);
});

test('Pinterest AI lettering prompts use exact clean mobile typography without a visible title bar', () => {
  const prompt = enhancePinterestAiTextPrompt(
    'Ultra-realistic close-up garlic butter shrimp. Generate no text, labels, panels, logos, or watermarks. Keep the center calm for a later local title overlay.',
    'middle',
    'Easy Garlic Shrimp',
    'bold retro groovy display lettering'
  );
  assert.match(prompt, /Render only this exact headline once: "Easy Garlic Shrimp"/);
  assert.match(prompt, /bold retro groovy display lettering/i);
  assert.match(prompt, /slightly above the visual center/i);
  assert.match(prompt, /warm-white letters with a thin charcoal keyline/i);
  assert.match(prompt, /small feathered darkening immediately beneath the letters/i);
  assert.match(prompt, /Never use script, mixed fonts, warped letters, or 3D effects/i);
  assert.match(prompt, /looks genuinely photographed/i);
  assert.match(prompt, /real full-frame food-photography look with a natural 50-85mm perspective/i);
  assert.match(prompt, /No visible rectangle, full-width bar, ribbon, frosted panel/i);
  assert.doesNotMatch(prompt, /use a full-width|place the text on a/i);
  assert.doesNotMatch(prompt.split('PINTEREST IMAGE AND LETTERING BRIEF:')[0], /Generate no text|later local title overlay/i);
  assert.equal(stripTextProhibitions('Close-up pasta. Generate no text or labels. Bright natural light.'), 'Close-up pasta. Bright natural light.');
  assert.equal(isPinterestAiLetteringPrompt(prompt), true);
  assert.equal(isPinterestAiLetteringPrompt('Clean close-up food photo'), false);
});

test('Pinterest ingredient realism preserves canned tuna instead of inventing raw fish cubes', () => {
  const rule = pinterestIngredientRealityRules('Classic poke bowl made with canned tuna and rice');
  assert.match(rule, /drained, fully cooked, opaque pale-beige tuna/i);
  assert.match(rule, /irregular tender flakes/i);
  assert.match(rule, /Never show raw salmon, sashimi, glossy orange cubes/i);
  assert.match(pinterestIngredientRealityRules('Roasted chicken dinner'), /natural ingredient scale/i);
});

test('Pinterest AI generation preserves the original Saturday food prompt while reuse stays separate', () => {
  const original = 'Closeup of garlic butter shrimp with bright natural light. Generate no text or labels. Keep a calm area for later local typography.';
  const prompt = enhancePinterestLegacyAiPrompt(original, 'middle', 'Easy Shrimp Dinner');

  assert.match(prompt, /^The text "Easy Shrimp Dinner" in the center middle\./);
  assert.match(prompt, /PINTEREST FOOD PHOTO REQUIREMENTS/);
  assert.match(prompt, /finished dish or one irresistible hero bite/i);
  assert.match(prompt, /filling about 65-80% of the image/i);
  assert.match(prompt, /bright diffused side-window light/i);
  assert.match(prompt, /clean negative space behind the requested text panel/i);
  assert.match(prompt, /PINTEREST AI TYPOGRAPHY/);
  assert.match(prompt, /large bold uppercase geometric sans-serif lettering/i);
  assert.match(prompt, /softly translucent full-width center band/i);
  assert.doesNotMatch(prompt, /Generate no text|later local typography/i);
  assert.doesNotMatch(prompt, /PINTEREST IMAGE AND LETTERING BRIEF/);
  assert.equal(prompt.split('PINTEREST FOOD PHOTO REQUIREMENTS').length - 1, 1);
  assert.match(pinterestAiOverlayTreatment('Sparkling cherry lemonade drink'), /rounded rectangle/i);
});

test('Original July AI prompt keeps the July 25 one-pass Ideogram requirements', () => {
  const prompt = enhancePinterestJuly25AiPrompt('Closeup of garlic butter shrimp. Text Overlay in the center: "GARLIC BUTTER SHRIMP" in bold readable font.');
  assert.match(prompt, /PINTEREST JULY 25 AI REQUIREMENTS/);
  assert.match(prompt, /photorealistic editorial food photography, not illustration or CGI/i);
  assert.match(prompt, /filling about 65-80% of the image/i);
  assert.match(prompt, /bright diffused side-window light/i);
  assert.match(prompt, /clean negative space behind the requested text panel/i);
  assert.match(prompt, /Text Overlay in the center: "GARLIC BUTTER SHRIMP"/);
  assert.equal(enhancePinterestJuly25AiPrompt(prompt), prompt);
});

test('Ingredient Closeup AI style uses one centered translucent panel and no stray labels', () => {
  const prompt = enhancePinterestOriginalJulyAiPrompt(
    'This Pinterest pin is viral. A bright professional close-up photograph of sparkling cherry lemonade with realistic ice, fruit, and natural window light. Text Overlay in the center: "Sparkling Cherry Lemonade". This Pinterest pin is bright and highly clickable.',
    'Sparkling Cherry Lemonade'
  );
  assert.match(prompt, /one full-bleed vertical 9:16 photograph/i);
  assert.match(prompt, /"SPARKLING CHERRY LEMONADE"/);
  assert.match(prompt, /exact center middle/i);
  assert.match(prompt, /compact softly translucent rounded rectangle/i);
  assert.match(prompt, /thin warm-white border/i);
  assert.doesNotMatch(prompt, /GET THE RECIPE/);
  assert.match(prompt, /It is the only visible wording/i);
  assert.match(prompt, /platform icon, corner badge, label, decorative symbol, extra letters/i);
  assert.doesNotMatch(prompt, /This Pinterest pin is viral|highly clickable|ORIGINAL JULY PIN REQUIREMENTS/i);
  assert.ok(prompt.split(/\s+/).length <= 185, `Expected a focused Ideogram prompt, received ${prompt.split(/\s+/).length} words`);
  assert.equal(enhancePinterestOriginalJulyAiPrompt(prompt, 'Sparkling Cherry Lemonade'), prompt);
});

test('Pinterest AI generation removes accidental collages and polishes awkward overlay copy', () => {
  const collagePrompt = 'A vertical close-up of sardine toast. Two smaller supporting shots show a skillet and melting butter, separated by dividers. Keep the center calm for overlay.';
  const prompt = enhancePinterestLegacyAiPrompt(collagePrompt, 'middle', 'Sardine Toast Canned Fish Taste', false);

  assert.match(prompt, /one single full-bleed vertical 9:16 photograph/i);
  assert.doesNotMatch(prompt, /two smaller supporting shots|separated by dividers/i);
  assert.match(prompt, /Never put the title in a white footer/i);
  assert.equal(polishPinterestOverlayText('Sardine Toast Canned Fish Taste'), 'Sardine Toast');
  assert.equal(polishPinterestOverlayText('Cold Pasta Salad Protein'), 'Cold Pasta Salad Protein');
  assert.equal(polishPinterestOverlayText('Sardine Toast with Lemon Caper Butter'), 'Sardine Toast');
  assert.equal(polishPinterestOverlayText('Classic Carrot Jell-O Salad with Pineapple and Marshmallows'), 'Classic Carrot Jell-O Salad');
  assert.equal(polishPinterestOverlayText('1. Classic Sesame Tuna Poke Bowl'), 'Classic Sesame Tuna Poke Bowl');
});

test('Pinterest prompt-led AI preserves the creative layout and adds one compact recipe CTA', () => {
  const creative = 'Create an ultra-realistic close-up cherry lemonade photograph. Integrate the headline "Sparkling Cherry Lemonade" in bold white geometric lettering inside a compact translucent cherry-red panel centered over the glass. Add a bottom button reading "GET THE RECIPE".';
  const prompt = enhancePinterestPromptLedAiPrompt(creative, false, 'Sparkling Cherry Lemonade');

  assert.equal(isPromptLedPinterestCreative(creative), true);
  assert.match(prompt, /Preserve the prompt's chosen typography, color, placement, and integrated text treatment/i);
  assert.match(prompt, /title bold, uppercase, geometric/i);
  assert.match(prompt, /transparent panel, center band, direct-text glow, or stacked-band treatment/i);
  assert.match(prompt, /no more than three centered lines/i);
  assert.match(prompt, /no more than 28% of the canvas height/i);
  assert.match(prompt, /Render exactly this headline once/i);
  assert.match(prompt, /"Sparkling Cherry Lemonade"/);
  assert.match(prompt, /Add one compact call-to-action button near the bottom center/i);
  assert.match(prompt, /34-44% of the canvas width/i);
  assert.match(prompt, /5-7% above the bottom edge/i);
  assert.match(prompt, /only two text elements allowed/i);
  assert.match(prompt, /"GET THE RECIPE"/);
  assert.match(prompt, /translucent cherry-red panel/i);
  assert.doesNotMatch(prompt, /softly translucent full-width center band sampled from/i);
  assert.throws(
    () => enhancePinterestPromptLedAiPrompt('Clean close-up shrimp photo. Generate no text or labels.'),
    /photo-only/i
  );
});

test('Pinterest realism prompts specialize drinks and bowls without local-overlay conflicts', () => {
  const drink = pinterestPhotographyDirection('Sparkling cherry lemonade mocktail');
  const bowl = pinterestPhotographyDirection('High protein chicken pasta salad bowl');
  const aiDrink = enhancePinterestAiTextPrompt(
    'Ultra-realistic sparkling cherry lemonade. Keep the top calm for a later local text overlay. Generate no text or labels.',
    'top',
    'Sparkling Cherry Lemonade',
    'bold clean sans serif'
  );

  assert.equal(isLikelyDrinkPrompt('Sparkling cherry lemonade mocktail'), true);
  assert.equal(isLikelyBowlPrompt('High protein chicken pasta salad bowl'), true);
  assert.match(drink, /glass fill 74-86%/i);
  assert.match(drink, /believable translucency, refraction, condensation/i);
  assert.match(bowl, /tight overhead or high three-quarter/i);
  assert.match(bowl, /part of the rim naturally cropped/i);
  assert.doesNotMatch(aiDrink.split('PINTEREST IMAGE AND LETTERING BRIEF:')[0], /later local text overlay|Generate no text/i);
  assert.match(aiDrink, /believable translucency, refraction, condensation/i);
  assert.match(aiDrink, /Render only this exact headline once/i);
  const sardineRules = pinterestIngredientRealityRules('Canned sardine toast with lemon and capers');
  assert.match(sardineRules, /cooked sardine fillets at believable scale/i);
  assert.match(sardineRules, /Avoid fish heads or eyes/i);
  assert.match(enhancePinterestFoodPhotoPrompt('Premium sardine toast recipe photo', 'top'), /cooked sardine fillets at believable scale/i);
});

test('Pinterest appetite direction adapts realistic texture to each recipe type', () => {
  assert.match(pinterestAppetiteDirection('Sparkling cherry lemonade mocktail'), /genuinely cold and freshly poured/i);
  assert.match(pinterestAppetiteDirection('Flaky peach hand pie'), /tender interior, distinct crumb, crisp baked edge, flaky layer/i);
  assert.match(pinterestAppetiteDirection('Creamy garlic pasta'), /believable sauce viscosity/i);
  assert.match(pinterestAppetiteDirection('Air fryer crispy chicken'), /crisp irregular edges and natural browning/i);
  assert.match(pinterestAppetiteDirection('Grilled salmon dinner'), /fully cooked as required, juicy but not raw/i);
  assert.match(enhancePinterestOriginalJulyAiPrompt(
    'Close-up creamy garlic pasta with browned edges and fresh parsley.',
    'Creamy Garlic Pasta'
  ), /believable sauce viscosity/i);
});

test('Pinterest local overlays preserve exact short copy and bundle supported fonts', () => {
  const fontsDir = path.join(__dirname, '..', 'electron', 'assets', 'fonts');
  assert.equal(shortOverlayText('Easy Garlic Butter Shrimp For Busy Weeknight Dinners'), 'Easy Garlic Butter Shrimp Busy Weeknight Dinners');
  assert.deepEqual(wrapOverlayText('Easy Garlic Butter Shrimp', 12, 3), ['Easy Garlic', 'Butter', 'Shrimp']);
  for (const file of [
    'Poppins-Bold.ttf',
    'Montserrat-Bold.ttf',
    'PlayfairDisplay-Bold.ttf',
    'DMSerifDisplay-Regular.ttf',
    'BebasNeue-Regular.ttf',
    'Shrikhand-Regular.ttf',
    'Sacramento-Regular.ttf',
    'CabinSketch-Bold.ttf'
  ]) {
    assert.equal(fs.existsSync(path.join(fontsDir, file)), true);
  }
  const overlay = buildOverlaySvg({ text: 'Easy Garlic Butter Shrimp', placement: 'middle', font: 'serif-sans', fontsDir });
  assert.match(overlay.input.toString(), /Garlic Butter Shrimp/);
  assert.match(overlay.input.toString(), /GET THE RECIPE/);
  assert.match(overlay.input.toString(), /fill="#fffdf7" stroke="#2f2144"/);
  assert.match(overlay.input.toString(), /stroke-width="12"/);
  assert.ok(overlay.fontSize >= 90);
  assert.equal(overlay.font, 'serif-sans');
  assert.equal(overlay.fontLabel, 'Playfair + Montserrat');
  assert.equal(overlay.lines.length, 2);
  const groovy = buildOverlaySvg({ text: 'Cozy Pasta Night', placement: 'middle', font: 'groovy', fontsDir });
  assert.equal(groovy.fontLabel, 'Shrikhand Groovy');
  const generated = buildOverlaySvg({
    text: 'Classic Pineapple Cheese Jell-O',
    placement: 'middle',
    font: 'serif-sans',
    fontsDir,
    variant: 'generated'
  });
  const generatedSvg = generated.input.toString();
  assert.equal(generated.font, 'poppins');
  assert.deepEqual(generated.lines, ['CLASSIC PINEAPPLE', 'CHEESE JELL-O']);
  assert.match(generatedSvg, /id="headlineShade"/);
  assert.doesNotMatch(generatedSvg, /panelShadow|rgba\(27,18,43,0\.64\)/);
  assert.match(generatedSvg, /GET THE RECIPE/);
  assert.equal(generated.placement, 'top');
  assert.equal(generated.backgroundTreatment, 'minimal-editorial');
  const magazine = buildOverlaySvg({
    text: 'Sardine Toast',
    placement: 'middle',
    font: 'poppins',
    fontsDir,
    variant: 'generated',
    pinStyle: 'custom-modern-recipe-magazine'
  });
  const magazineSvg = magazine.input.toString();
  assert.equal(magazine.font, 'food-editorial');
  assert.deepEqual(magazine.lines, ['SARDINE', 'TOAST']);
  assert.equal(magazine.placement, 'top');
  assert.equal(magazine.backgroundTreatment, 'modern-recipe-magazine');
  assert.match(magazineSvg, /fill="#fffaf2"/);
  assert.match(magazineSvg, /fill="#382149" stroke="#382149"/);
  assert.doesNotMatch(magazineSvg, /fill="url\(#headlineShade\)"/);
  const ingredientCloseup = buildOverlaySvg({
    text: 'Sparkling Cherry Lemonade Hot Days',
    placement: 'top',
    font: 'serif-sans',
    fontsDir,
    variant: 'generated',
    pinStyle: 'custom-ingredient-closeup'
  });
  const ingredientCloseupSvg = ingredientCloseup.input.toString();
  assert.equal(ingredientCloseup.font, 'poppins');
  assert.equal(ingredientCloseup.placement, 'middle');
  assert.equal(ingredientCloseup.backgroundTreatment, 'ingredient-closeup-glass');
  assert.match(ingredientCloseupSvg, /width="(?:5[6-9]\d|[6-8]\d\d)"[\s\S]*rx="34"/);
  assert.match(ingredientCloseupSvg, /fill="#21162f" fill-opacity="0\.58"/);
  assert.match(ingredientCloseupSvg, /GET THE RECIPE/);
  const originalJulyCenter = buildOverlaySvg({
    text: 'Sparkling Cherry Lemonade Hot Days',
    placement: 'top',
    font: 'serif-sans',
    fontsDir,
    variant: 'original-july',
    pinStyle: 'custom-july-original-ai',
    panelColor: 'rgb(90,38,42)'
  });
  const originalJulySvg = originalJulyCenter.input.toString();
  assert.equal(originalJulyCenter.font, 'poppins');
  assert.equal(originalJulyCenter.placement, 'middle');
  assert.equal(originalJulyCenter.backgroundTreatment, 'original-july-center-glass');
  assert.equal(originalJulyCenter.ctaText, '');
  assert.match(originalJulySvg, /fill="rgb\(90,38,42\)" fill-opacity="0\.56"/);
  assert.match(originalJulySvg, /stroke="#fffdf8" stroke-opacity="0\.88"/);
  assert.match(originalJulySvg, /SPARKLING CHERRY LEMONADE HOT DAYS/);
  assert.doesNotMatch(originalJulySvg, /GET THE RECIPE|UPORAL PILL/);
});

test('Pinterest overlay renderer creates a verified 1000 by 1500 WebP without Replicate', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-studio-pin-test-'));
  const outputPath = path.join(tempDir, 'pin.webp');
  try {
    const inputBuffer = await sharp({
      create: { width: 900, height: 1600, channels: 3, background: { r: 180, g: 70, b: 45 } }
    }).png().toBuffer();
    const qa = await createPinterestOverlay({
      sharp,
      inputBuffer,
      outputPath,
      overlayText: 'Garlic Butter Shrimp',
      placement: 'middle',
      font: 'serif-sans',
      fontsDir: path.join(__dirname, '..', 'electron', 'assets', 'fonts')
    });
    assert.equal(qa.dimensionsVerified, true);
    assert.equal(qa.overlayVerified, true);
    assert.equal(qa.safeZoneVerified, true);
    assert.equal(qa.nonBlankVerified, true);
    assert.equal(qa.ctaText, 'GET THE RECIPE');
    assert.equal(qa.ctaVerified, true);
    assert.equal(qa.backgroundTreatment, 'adaptive-outline-editorial-cta');
    assert.equal(fs.existsSync(outputPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Original July center overlay renders exact middle text without a CTA', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-studio-july-pin-'));
  const outputPath = path.join(tempDir, 'july-center.webp');
  try {
    const inputBuffer = await sharp({
      create: { width: 1000, height: 1500, channels: 3, background: { r: 177, g: 72, b: 58 } }
    }).png().toBuffer();
    const qa = await createPinterestOverlay({
      sharp,
      inputBuffer,
      outputPath,
      overlayText: 'Sparkling Cherry Lemonade',
      placement: 'top',
      font: 'serif-sans',
      fontsDir: path.join(__dirname, '..', 'electron', 'assets', 'fonts'),
      variant: 'original-july',
      pinStyle: 'custom-july-original-ai'
    });
    assert.equal(qa.dimensionsVerified, true);
    assert.equal(qa.overlayVerified, true);
    assert.equal(qa.safeZoneVerified, true);
    assert.equal(qa.placement, 'middle');
    assert.equal(qa.font, 'poppins');
    assert.equal(qa.backgroundTreatment, 'original-july-center-glass');
    assert.equal(qa.ctaText, '');
    assert.equal(qa.ctaVerified, true);
    assert.equal(fs.existsSync(outputPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Pinterest cost estimates include generation and make article image reuse free', async () => {
  const {
    estimatePinterestPackCost,
    pinterestImageUnitCost
  } = await import('../src/lib/pinterestCost.mjs');
  const generated = estimatePinterestPackCost({
    pinCount: 10,
    imageSourceMode: 'generate-new',
    imageModel: 'ideogram',
    aspectRatio: '2:3'
  });
  assert.equal(generated.imageCost, 0.3);
  assert.equal(generated.textCost, 0.02);
  assert.equal(generated.total, 0.32);

  const reused = estimatePinterestPackCost({
    pinCount: 10,
    imageSourceMode: 'reuse-article',
    imageModel: 'ideogram'
  });
  assert.equal(reused.imageCost, 0);
  assert.equal(reused.total, 0.02);
  assert.equal(pinterestImageUnitCost('pruna', '2:3'), 0.005);
  assert.equal(pinterestImageUnitCost('pruna', '1:1'), 0.01);
});

test('Pinterest generated images receive exact local lettering and CTA', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-studio-ai-pin-test-'));
  const outputPath = path.join(tempDir, 'ai-pin.webp');
  try {
    const inputBuffer = await sharp({
      create: { width: 768, height: 1152, channels: 3, background: { r: 55, g: 130, b: 85 } }
    }).png().toBuffer();
    const qa = await createPinterestOverlay({
      sharp,
      inputBuffer,
      outputPath,
      overlayText: 'Easy Garlic Shrimp',
      placement: 'middle',
      font: 'poppins',
      fontsDir: path.join(__dirname, '..', 'electron', 'assets', 'fonts'),
      variant: 'generated'
    });
    assert.equal(qa.dimensionsVerified, true);
    assert.equal(qa.overlayVerified, true);
    assert.equal(qa.safeZoneVerified, true);
    assert.equal(qa.ctaVerified, true);
    assert.equal(qa.ctaText, 'GET THE RECIPE');
    assert.equal(qa.font, 'poppins');
    assert.equal(qa.placement, 'top');
    assert.equal(qa.backgroundTreatment, 'minimal-editorial');
    assert.equal(fs.existsSync(outputPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Pinterest CSV round trip preserves eight UTF-8 fields without a BOM', () => {
  const rows = Array.from({ length: 3 }, (_, index) => [
    index === 0 ? 'Crème, "hello" ñ ç ’ – 🍋' : `Recipe ${index + 1}`,
    `https://i.ibb.co/pin-${index}.jpg?download=1&size=large`,
    '  Dîners &  Délices/Été  ', 'N/A',
    "Easy, fast, family-friendly dinner\r\nWith \"quotes\" & herbs\0now",
    ' https://example.com/recipe?a=1&amp;b=2#recipe ', '', '#été, piña colada'
  ]);
  const bytes = serializePinterestCsv(rows);
  assert.equal(bytes.subarray(0, 5).toString('hex'), '5469746c65');
  assert.notEqual(bytes.subarray(0, 3).toString('hex'), 'efbbbf');
  const text = new (require('node:util').TextDecoder)('utf-8', { fatal: true }).decode(bytes);
  assert.equal(text.split('\r\n')[0], PINTEREST_CSV_HEADERS.join(','));
  const records = require('csv-parse/sync').parse(bytes, { bom: false });
  assert.equal(records.length, 4);
  assert.ok(records.every((row) => row.length === 8));
  assert.equal(records[1][0], rows[0][0]);
  assert.equal(records[1][2], rows[0][2].trim());
  assert.equal(records[1][3], '');
  assert.equal(records[1][4], 'Easy, fast, family-friendly dinner With "quotes" & herbs now');
  assert.equal(records[1][5], 'https://example.com/recipe?a=1&b=2#recipe');
  assert.equal(records[1][6], '');
  assert.equal(records[1][7], '#\u00e9t\u00e9, pi\u00f1a colada');
  assert.deepEqual(records.slice(1), validatePinterestRows(rows).rows);
  assert.ok(records.slice(1).flat().every((cell) => !/[\r\n\0]/.test(cell)));
});

test('Pinterest sanitizer removes placeholders and controls while preserving Unicode', () => {
  for (const value of [null, undefined, NaN, {}, [], 'null', 'undefined', '[object Object]', 'NaN']) {
    assert.equal(sanitizePinterestCsvValue(value), '');
  }
  assert.equal(sanitizePinterestCsvValue('  sautéed jalapeño crème brûlée 🍋 ’ –  '), 'sautéed jalapeño crème brûlée 🍋 ’ –');
  assert.equal(sanitizePinterestCsvValue('A\r\nB\0C\tD\uFEFF'), 'A B C D');
  const rows = [['Title', 'https://i.ibb.co/pin.jpg', 'Recipes', null, undefined, null, undefined, null]];
  const values = require('csv-parse/sync').parse(serializePinterestCsv(rows))[1];
  assert.deepEqual(values.slice(3), ['', '', '', '', '']);
});

test('Pinterest title and description limits preserve whole Unicode graphemes', () => {
  for (const text of ['É'.repeat(600), '🍋'.repeat(600), 'e\u0301'.repeat(600), '👩‍🍳'.repeat(600), 'Recipe words '.repeat(100)]) {
    const row = validatePinterestRows([[text, 'https://i.ibb.co/a.jpg', 'Recipes', '', text, '', '', '']]).rows[0];
    assert.ok(row[0].length <= 100);
    assert.ok(row[4].length <= 500);
    assert.equal(row[0].isWellFormed(), true);
    assert.equal(row[4].isWellFormed(), true);
    assert.ok(text.startsWith(row[0]));
    assert.ok(text.startsWith(row[4]));
  }
});

test('Pinterest rejects local paths, private hosts, gallery pages and temporary media', () => {
  for (const media of ['localhost', 'http://localhost/p.jpg', 'https://foo.localhost/p.jpg', 'http://127.0.0.1/p.jpg', 'http://10.0.0.1/p.jpg', 'http://[::1]/p.jpg', 'blob:abc', 'data:image/png;base64,abc', '/uploads/p.jpg', 'C:\\images\\p.jpg', 'https://ibb.co/gallery', 'https://replicate.delivery/p.jpg', 'https://example.com/p.webp']) {
    const validation = validatePinterestRows([['Recipe', media, 'Recipes', '', '', '', '', '']]);
    assert.equal(validation.valid, false, media);
    assert.ok(validation.errors.some((error) => error.rowIndex === 1 && error.title === 'Recipe' && error.field === 'Media URL'));
    assert.throws(() => serializePinterestCsv([['Recipe', media, 'Recipes', '', '', '', '', '']]));
  }
  for (const media of ['https://i.ibb.co/p.jpg', 'http://example.com/p.png', 'https://example.com/p.jpeg?size=2&quality=90']) {
    assert.equal(validatePinterestRows([['Recipe', media, 'Recipes', '', '', '', '', '']]).valid, true, media);
  }
});

test('Pinterest destination links are optional, public, and retain raw query parameters', () => {
  for (const value of ['', 'http://example.com/?a=1&b=2', 'https://example.com/#recipe']) {
    assert.equal(validatePinterestRows([['Recipe', 'https://i.ibb.co/p.jpg', 'Recipes', '', '', value, '', '']]).valid, true);
  }
  for (const value of ['https://', 'file:///tmp/a', 'javascript:alert(1)', 'https://localhost/p', 'https://user:secret@example.com/p']) {
    assert.equal(validatePinterestRows([['Recipe', 'https://i.ibb.co/p.jpg', 'Recipes', '', '', value, '', '']]).valid, false);
  }
});

test('Pinterest dates preserve deliberate blanks and serialize explicit UTC or offsets', () => {
  const now = Date.parse('2026-09-14T12:00:00Z');
  for (const value of ['', ' ', null, undefined]) assert.equal(normalizePinterestPublishDate(value, { now }), '');
  assert.equal(normalizePinterestPublishDate('garbage', { now, selected: false }), '');
  assert.equal(normalizePinterestPublishDate('2026-09-15T14:00:00+01:00', { now }), '2026-09-15T13:00:00');
  assert.equal(normalizePinterestPublishDate(new Date('2026-09-15T13:00:00Z'), { now }), '2026-09-15T13:00:00');
  assert.equal(normalizePinterestPublishDate('2026-09-15T13:00:00', { now }), '2026-09-15T13:00:00');
  for (const value of ['9/14/2026', '14/09/2026', 'September 14, 2026', 'null', 'undefined', '2026-02-30T12:00:00', '2026-09-15T24:00:00', '2026-09-14T11:59:59Z', '2026-11-15T12:00:00', new Date(NaN)]) {
    assert.throws(() => normalizePinterestPublishDate(value, { now }), undefined, String(value));
  }
});

test('Pinterest preflight rejects expired schedules without changing them or scheduling blank rows', () => {
  const now = Date.parse('2026-09-14T12:00:00Z');
  const rows = ['', '2026-09-13T12:00:00', '2026-09-16T12:00:00', '2026-09-15T12:00:00'].map((date, i) => [
    `Recipe ${i}`, `https://i.ibb.co/p-${i}.jpg`, 'Recipes', '', '', '', date, ''
  ]);
  const validation = validatePinterestRows(rows, [], { now });
  assert.equal(validation.valid, false);
  assert.equal(validation.rowCount, 4);
  assert.deepEqual(validation.rows.map((row) => row[6]), rows.map((row) => row[6]));
  assert.equal(validation.errors[0].rowIndex, 2);
  assert.equal(validation.errors[0].field, 'Publish date');
  assert.throws(() => serializePinterestCsv(rows, { now }), /past/);
  const accepted = rows.filter((_, i) => i !== 1);
  assert.doesNotThrow(() => serializePinterestCsv(accepted, { now }));
});

test('Pinterest validates video thumbnail timestamps and leaves image thumbnails empty', () => {
  for (const thumbnail of ['62', '01:02', 'https://example.com/thumbnail.jpg']) {
    const rows = [['Video', 'https://example.com/p.mp4', 'Recipes', thumbnail, '', '', '', '']];
    assert.equal(validatePinterestRows(rows).valid, true);
  }
  assert.equal(validatePinterestRows([['Video', 'https://example.com/p.mp4', 'Recipes', '', '', '', '', '']]).valid, false);
});

test('Pinterest parser rejects BOM, altered headers, invalid UTF-8 and wrong row counts', () => {
  const bytes = serializePinterestCsv([['Recipe', 'https://i.ibb.co/a.jpg', 'Recipes', '', '', '', '', '']]);
  assert.throws(() => assertPinterestCsvBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]), 1), /BOM/);
  assert.throws(() => assertPinterestCsvBytes(Buffer.from(bytes.toString().replace('Title,', 'Titles,')), 1), /headers/);
  assert.throws(() => assertPinterestCsvBytes(Buffer.concat([bytes, Buffer.from([0xff])]), 1));
  assert.throws(() => assertPinterestCsvBytes(bytes, 2), /row count/);
  assert.equal(validatePinterestRows([['Recipe', 'https://i.ibb.co/a.jpg']]).valid, false);
});

test('Pinterest keeps complete batches, splits only above 200 rows, and uses clean filenames', () => {
  const rows = Array.from({ length: 45 }, (_, i) => [`Recipe ${i}`, `https://i.ibb.co/${i}.jpg`, 'Recipes', '', '', '', '', '']);
  assert.equal(require('csv-parse/sync').parse(serializePinterestCsv(rows)).length, 46);
  assert.deepEqual(splitPinterestRows(rows).map((part) => part.length), [45]);
  assert.deepEqual(splitPinterestRows(Array.from({ length: 250 })).map((part) => part.length), [200, 50]);
  assert.equal(pinterestCsvFilename(new Date('2026-09-14T12:34:56Z')), 'pinterest-bulk-upload-20260914-123456.csv');
  assert.equal(validatePinterestRows([]).valid, false);
});

test('Pinterest duplicate media is rejected and valid keyword content is preserved', () => {
  const row = ['Recipe', 'https://i.ibb.co/a.jpg', 'Recipes', '', '', '', '', '#dinner, café, meal prep'];
  assert.ok(validatePinterestRows([row, row]).errors.some((error) => error.rule === 'duplicate_media'));
  assert.equal(normalizePinterestKeywords(row[7]), '#dinner, caf\u00e9, meal prep');
});

test('Both Pinterest export buttons use the shared writer and legacy BOM downloads are removed', () => {
  const legacy = fs.readFileSync(path.join(__dirname, '..', 'electron', 'pin-creator', 'renderer.js'), 'utf8');
  const react = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'PinCreatorView.jsx'), 'utf8');
  assert.match(legacy, /window\.electronAPI\.exportPinterestCsv/);
  assert.doesNotMatch(legacy, /\\uFEFF|new Blob\(\[.*csvContent/);
  assert.match(react, /exportPinterestCsv\(\{ testOnly: true \}\)/);
});

test('Pinterest explicit schedule fitting keeps a requested batch inside 30 days', async () => {
  const { fitPinterestSchedule } = await import('../src/lib/pinterestCsv.mjs');
  const now = Date.parse('2026-09-14T12:00:00Z');
  const fitted = fitPinterestSchedule({ count: 32, start: new Date(now + 29 * 86400000), intervalMinutes: 1440, now });
  assert.equal(fitted.dates.length, 32);
  assert.ok(fitted.dates.every((date) => date.getTime() > now && date.getTime() <= now + 30 * 86400000));
});

test('Pinterest interest intelligence builds specific use cases and avoids generic boards', async () => {
  const {
    buildInterestProfile,
    interestAlignmentPreflight,
    rankBoardsByInterest
  } = await import('../src/lib/pinterestInterestIntelligence.mjs');
  const pin = {
    title: 'Quick High Protein Chicken Dinners for Busy Weeknights',
    description: 'These high protein chicken dinners are ready quickly and make weeknight cooking practical.',
    prompt: 'Ultra-realistic close-up of a finished chicken dinner with natural food texture.',
    url: 'https://gourmetgather.com/high-protein-chicken-dinners/',
    evidenceType: 'live_search',
    evidenceConfidence: 'high'
  };
  const profile = buildInterestProfile(pin);
  assert.equal(profile.dimensions.core, 'chicken');
  assert.deepEqual(profile.dimensions.goals, ['high protein', 'quick']);
  assert.match(profile.primary.label, /Quick High Protein Chicken Weeknight Dinners/);
  assert.equal(profile.lifecycle.stage, 'growing');
  assert.ok(profile.relatedTopics.length >= 5);
  const matches = rankBoardsByInterest(pin, ['Recipe Blog', 'High Protein Chicken Recipes', 'Dessert Ideas']);
  assert.equal(matches[0].board, 'High Protein Chicken Recipes');
  assert.ok(matches[0].confidence >= 80);
  const alignment = interestAlignmentPreflight(pin, matches[0].board, profile);
  assert.equal(alignment.score, 100);
  assert.deepEqual(alignment.issues, []);
});

test('Pinterest interest intelligence repairs incomplete legacy saved profiles', async () => {
  const { aggregatePinterestClusters, interestAlignmentPreflight, resolveInterestProfile } = await import('../src/lib/pinterestInterestIntelligence.mjs');
  const legacyPin = {
    title: 'Sardine Toast with Lemon and Herbs',
    description: 'A quick seafood lunch with crisp toast and bright lemon.',
    url: 'https://gourmetgather.com/sardine-toast/',
    interestProfile: {}
  };
  const repaired = resolveInterestProfile(legacyPin);
  assert.ok(repaired.primary.id);
  assert.ok(repaired.primary.label);
  assert.ok(repaired.lifecycle.stage);
  assert.ok(repaired.lifecycle.basis);
  assert.ok(repaired.relatedTopics.length >= 5);
  assert.doesNotThrow(() => interestAlignmentPreflight(legacyPin, 'Seafood Recipes', legacyPin.interestProfile));
  assert.doesNotThrow(() => aggregatePinterestClusters([legacyPin]));
});

test('Pinterest cluster scheduler interleaves use cases and aggregates habit metrics', async () => {
  const { aggregatePinterestClusters, buildInterestProfile, diversifyByInterest } = await import('../src/lib/pinterestInterestIntelligence.mjs');
  const chicken = buildInterestProfile({ title: 'Quick chicken dinners' });
  const dessert = buildInterestProfile({ title: 'Easy chocolate desserts' });
  const ordered = diversifyByInterest([
    { id: 'c1', title: 'Chicken one', interestProfile: chicken },
    { id: 'c2', title: 'Chicken two', interestProfile: chicken },
    { id: 'd1', title: 'Dessert one', interestProfile: dessert },
    { id: 'd2', title: 'Dessert two', interestProfile: dessert }
  ]);
  assert.deepEqual(ordered.map((item) => item.id), ['c1', 'd1', 'c2', 'd2']);
  const clusters = aggregatePinterestClusters([
    { title: 'Quick chicken dinners', impressions: 1000, saves: 30, outboundClicks: 20, pinClicks: 50 },
    { title: 'Weeknight chicken meals', impressions: 500, saves: 10, outboundClicks: 15, pinClicks: 25 },
    { title: 'Easy chocolate desserts', impressions: 800, saves: 50, outboundClicks: 10, pinClicks: 30 }
  ]);
  assert.ok(clusters.length >= 2);
  assert.ok(clusters.every((cluster) => Number.isFinite(cluster.habitScore)));
  assert.ok(clusters.some((cluster) => cluster.label.includes('Chicken')));
});

test('Pinterest source snapshots retain recipe facts and prefer article portrait media', () => {
  const snapshot = buildPinSourceSnapshot({
    id: 'article-1',
    generatedTitle: 'Garlic Butter Shrimp',
    structuredData: JSON.stringify({
      '@type': 'Recipe',
      name: 'Garlic Butter Shrimp',
      recipeIngredient: ['1 lb shrimp', '2 tbsp butter'],
      recipeInstructions: [{ '@type': 'HowToStep', text: 'Cook the shrimp until opaque.' }],
      totalTime: 'PT20M',
      recipeYield: '4 servings'
    }),
    images: [{ id: 'portrait', aspectRatio: '9:16', localPath: 'C:\\images\\shrimp.webp' }]
  });
  assert.equal(snapshot.recipe.name, 'Garlic Butter Shrimp');
  assert.equal(snapshot.recipe.totalTime, 'PT20M');
  assert.equal(snapshot.preferredPortraitImageId, 'portrait');
});

test('Pinterest CSV media only exposes a verified final hosted image', async () => {
  const { selectPinterestPublicImage } = await import('../src/lib/pinterestSource.mjs');
  const finalUrl = 'https://i.ibb.co/example/final-pin.webp';
  assert.equal(selectPinterestPublicImage({
    csvMediaUrl: finalUrl,
    hostedImageUrl: 'https://cdn.example.com/older-pin.webp',
    imageQa: {
      publicUrlVerified: true,
      publicDimensionsVerified: true,
      publicIdentityVerified: true,
      publicAssetKind: 'finished-pinterest-pin',
      publicWidth: 1000,
      publicHeight: 1500,
      publicValidatedUrl: finalUrl
    }
  }), finalUrl);
  const hostedUrl = 'https://cdn.example.com/final-pin.webp';
  assert.equal(selectPinterestPublicImage({
    remoteImageUrl: 'https://replicate.delivery/example/output.webp',
    hostedImageUrl: hostedUrl,
    imageQa: {
      publicUrlVerified: true,
      publicDimensionsVerified: true,
      publicIdentityVerified: true,
      publicAssetKind: 'finished-pinterest-pin',
      publicWidth: 1000,
      publicHeight: 1500,
      publicValidatedUrl: hostedUrl
    }
  }), hostedUrl);
  assert.equal(selectPinterestPublicImage({
    csvMediaUrl: 'https://cdn.example.com/replacement-landscape.webp',
    hostedImageUrl: hostedUrl,
    imageQa: {
      publicUrlVerified: true,
      publicDimensionsVerified: true,
      publicIdentityVerified: true,
      publicAssetKind: 'finished-pinterest-pin',
      publicWidth: 1000,
      publicHeight: 1500,
      publicValidatedUrl: hostedUrl
    }
  }), hostedUrl, 'a changed CSV URL must not inherit another image verification');
  assert.equal(selectPinterestPublicImage({
    csvMediaUrl: finalUrl,
    imageQa: {
      publicUrlVerified: true,
      publicDimensionsVerified: true,
      publicIdentityVerified: true,
      publicWidth: 1000,
      publicHeight: 1500,
      publicValidatedUrl: finalUrl
    }
  }), '', 'legacy verification without finished-Pin provenance must be refreshed');
  assert.equal(selectPinterestPublicImage({
    imageUrl: 'file:///C:/pins/local.webp',
    remoteImageUrl: 'https://replicate.delivery/example/output.webp'
  }), '');
  assert.equal(selectPinterestPublicImage({
    hostedImageUrl: 'https://cdn.example.com/unverified-size.webp',
    imageQa: {
      publicUrlVerified: true,
      publicDimensionsVerified: false,
      publicValidatedUrl: 'https://cdn.example.com/unverified-size.webp'
    }
  }), '');
});

test('Pinterest visual identity rejects a different image even at the correct size', () => {
  const exact = comparePinterestImageIdentity(
    { sha256: 'a'.repeat(64), perceptualHash: '0000000000000000' },
    { sha256: 'a'.repeat(64), perceptualHash: 'ffffffffffffffff' }
  );
  assert.equal(exact.matches, true);
  assert.equal(exact.exact, true);
  assert.equal(perceptualHashDistance('0000000000000000', '000000000000000f'), 4);
  assert.equal(comparePinterestImageIdentity(
    { perceptualHash: '0000000000000000' },
    { perceptualHash: '000000000000000f' }
  ).matches, true);
  assert.equal(comparePinterestImageIdentity(
    { perceptualHash: '0000000000000000' },
    { perceptualHash: 'ffffffffffffffff' }
  ).matches, false);
});

test('Pinterest visual identity tolerates WebP optimization but rejects another portrait', async () => {
  const original = await sharp({
    create: { width: 1000, height: 1500, channels: 3, background: { r: 245, g: 210, b: 120 } }
  })
    .composite([
      { input: Buffer.from('<svg width="700" height="900"><rect width="700" height="900" fill="#7a241f"/><circle cx="350" cy="450" r="260" fill="#f5efe1"/><path d="M100 750 L600 120" stroke="#213d2c" stroke-width="90"/></svg>'), left: 150, top: 250 }
    ])
    .webp({ quality: 92 })
    .toBuffer();
  const optimized = await sharp(original).webp({ quality: 72 }).toBuffer();
  const different = await sharp({
    create: { width: 1000, height: 1500, channels: 3, background: { r: 35, g: 60, b: 45 } }
  })
    .composite([
      { input: Buffer.from('<svg width="800" height="1000"><rect width="800" height="1000" fill="#f4efe5"/><path d="M40 100 L760 900" stroke="#642c25" stroke-width="120"/><path d="M760 100 L40 900" stroke="#d6a238" stroke-width="80"/></svg>'), left: 100, top: 200 }
    ])
    .webp({ quality: 92 })
    .toBuffer();
  const originalIdentity = {
    sha256: require('node:crypto').createHash('sha256').update(original).digest('hex'),
    perceptualHash: await perceptualHash(sharp, original)
  };
  const optimizedIdentity = {
    sha256: require('node:crypto').createHash('sha256').update(optimized).digest('hex'),
    perceptualHash: await perceptualHash(sharp, optimized)
  };
  const differentIdentity = {
    sha256: require('node:crypto').createHash('sha256').update(different).digest('hex'),
    perceptualHash: await perceptualHash(sharp, different)
  };
  assert.equal(comparePinterestImageIdentity(originalIdentity, optimizedIdentity).matches, true);
  assert.equal(comparePinterestImageIdentity(originalIdentity, differentIdentity).matches, false);
});

test('Pinterest hosting results cannot overwrite a newer generated Pin', async () => {
  const { mergePreparedPinHosting } = await import('../src/lib/pinBatch.mjs');
  const current = [{
    id: 'pin-1',
    localPath: 'C:\\pins\\new.webp',
    imageQa: { sha256: 'b'.repeat(64), dimensionsVerified: true },
    csvMediaUrl: ''
  }];
  const stale = [{
    id: 'pin-1',
    localPath: 'C:\\pins\\old.webp',
    imageQa: {
      sha256: 'a'.repeat(64),
      publicUrlVerified: true,
      publicDimensionsVerified: true,
      publicIdentityVerified: true,
      publicWidth: 1000,
      publicHeight: 1500,
      publicValidatedUrl: 'https://example.com/old.webp'
    },
    csvMediaUrl: 'https://example.com/old.webp'
  }];
  assert.deepEqual(mergePreparedPinHosting(current, stale), current);

  const matching = [{
    ...current[0],
    csvMediaUrl: 'https://example.com/new.webp',
    hostedImageUrl: 'https://example.com/new.webp',
    imageQa: {
      ...current[0].imageQa,
      publicUrlVerified: true,
      publicDimensionsVerified: true,
      publicIdentityVerified: true,
      publicWidth: 1000,
      publicHeight: 1500,
      publicValidatedUrl: 'https://example.com/new.webp'
    }
  }];
  assert.equal(mergePreparedPinHosting(current, matching)[0].csvMediaUrl, 'https://example.com/new.webp');
});

test('repaired Pinterest hosting keeps the finished-pin marker needed by CSV export', async () => {
  const { mergePreparedPinHosting } = await import('../src/lib/pinBatch.mjs');
  const current = [{ id: 'pin-1', localPath: 'same.webp', imageQa: { sha256: 'a'.repeat(64) } }];
  const prepared = [{
    id: 'pin-1',
    localPath: 'same.webp',
    csvMediaUrl: 'https://i.ibb.co/repaired-pin.jpg',
    hostedImageUrl: 'https://i.ibb.co/repaired-pin.jpg',
    imageQa: {
      sha256: 'a'.repeat(64),
      publicUrlVerified: true,
      publicDimensionsVerified: true,
      publicIdentityVerified: true,
      publicAssetKind: 'finished-pinterest-pin',
      publicWidth: 1000,
      publicHeight: 1500,
      publicValidatedUrl: 'https://i.ibb.co/repaired-pin.jpg'
    }
  }];
  const [merged] = mergePreparedPinHosting(current, prepared);
  assert.equal(merged.imageQa.publicAssetKind, 'finished-pinterest-pin');
  assert.equal(merged.csvMediaUrl, 'https://i.ibb.co/repaired-pin.jpg');
});

test('Pinterest CSV keeps row identity and rejects stale image verification', () => {
  const pinViewSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'PinCreatorView.jsx'), 'utf8');
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const legacyRendererSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'pin-creator', 'renderer.js'), 'utf8');
  assert.match(pinViewSource, /const \{ headers, rows, scheduledPins \} = useMemo/);
  assert.match(pinViewSource, /scheduledPins\.map\(\(pin, rowIndex\) =>/);
  assert.match(pinViewSource, /publicValidatedUrl: ""/);
  assert.doesNotMatch(pinViewSource, /csvMediaUrl:\s*result\.csvMediaUrl[^\n]*pin\.csvMediaUrl/);
  assert.match(mainSource, /comparePinterestImageIdentity\(expectedIdentity, validation(?:, 14)?\)/);
  assert.doesNotMatch(mainSource, /validationIsFresh/);
  assert.match(mainSource, /pin\.imageQa\?\.publicValidatedUrl !== mediaUrl/);
  assert.match(mainSource, /pin\.imageQa\?\.publicIdentityVerified !== true/);
  assert.match(mainSource, /hasPinterestDimensions\(\{ width: Number\(pin\.imageQa\?\.publicWidth/);
  const legacyPublicMediaBlock = legacyRendererSource.match(/function getPinPublicMediaUrl\(pin\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(legacyPublicMediaBlock, /publicIdentityVerified !== true/);
  assert.doesNotMatch(legacyPublicMediaBlock, /remoteImageUrl/);
});

test('Pinterest WordPress media fallback only selects the article domain', () => {
  const sites = [
    { url: 'gourmetgather.com', username: 'editor', apiKey_encrypted: 'encrypted-a' },
    { url: 'https://example.com', username: 'editor', apiKey_encrypted: 'encrypted-b' }
  ];
  assert.equal(normalizedHostname('https://www.GourmetGather.com/recipe/'), 'gourmetgather.com');
  assert.equal(normalizedHostname('gourmetgather.com'), 'gourmetgather.com');
  assert.equal(normalizedHostname('www.gourmetgather.com/recipe/'), 'gourmetgather.com');
  assert.equal(
    findMatchingWordPressSite(sites, 'https://www.gourmetgather.com/garlic-shrimp/')?.url,
    'gourmetgather.com'
  );
  assert.equal(findMatchingWordPressSite(sites, 'https://gourmetgather.com.evil.test/recipe/'), null);
  assert.equal(findMatchingWordPressSite([{ url: 'https://gourmetgather.com', username: 'editor' }], 'https://gourmetgather.com/recipe/'), null);
});

test('Pinterest automatic hosting prefers ImgBB before its WordPress fallback', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const hostingBlock = mainSource.match(/async function hostFinalPinterestImage[\s\S]*?\n}\n\nasync function ensureDurablePinImage/)?.[0] || '';
  const automaticBlock = hostingBlock.slice(hostingBlock.indexOf('const imgbbUrl'));
  const wordpressCall = automaticBlock.indexOf('uploadPinterestImageToWordPress');
  const imgbbCall = automaticBlock.indexOf('uploadLocalImageToImgBB');
  assert.ok(wordpressCall >= 0);
  assert.ok(imgbbCall >= 0);
  assert.ok(imgbbCall < wordpressCall);
});

test('ImgBB hosting serializes uploads and circuit-breaks rate limits', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const uploadStart = mainSource.indexOf('async function uploadLocalImageToImgBB');
  const uploadEnd = mainSource.indexOf('function normalizeImageUrl', uploadStart);
  const uploadBlock = uploadStart >= 0 && uploadEnd > uploadStart ? mainSource.slice(uploadStart, uploadEnd) : '';
  assert.match(mainSource, /let imgbbUploadQueue = Promise\.resolve\(\)/);
  assert.match(uploadBlock, /imgbbUploadQueue\.catch\(\(\) => \{\}\)\.then/);
  assert.match(uploadBlock, /withTransientRetries/);
  assert.match(uploadBlock, /attempts: 4/);
  assert.match(uploadBlock, /response\.status >= 500/);
  assert.match(uploadBlock, /imgbbRateLimited/);
  assert.match(uploadBlock, /15 \* 60 \* 1000/);
  assert.doesNotMatch(uploadBlock, /6 \* 60 \* 60 \* 1000/);
});

test('Pinterest hosting keeps generated center overlays and reused overlays on separate verified paths', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const hostingBlock = mainSource.match(/async function hostFinalPinterestImage[\s\S]*?\n}\n\nasync function ensureDurablePinImage/)?.[0] || '';
  const assetBlock = mainSource.match(/secureIpcHandle\('create-pinterest-pin-asset'[\s\S]*?\n}\)\);/)?.[0] || '';
  assert.match(hostingBlock, /sourceMode === 'reuse-article'/);
  assert.match(hostingBlock, /Reused-image Pins must use the matching WordPress Media Library/);
  assert.match(hostingBlock, /sourceMode === 'auto' \|\| sourceMode === 'generate-new'/);
  assert.match(hostingBlock, /!requirePinterestDimensions && \/\^https/);
  assert.match(mainSource, /requiredWidth: PIN_WIDTH/);
  assert.match(mainSource, /requiredHeight: PIN_HEIGHT/);
  assert.doesNotMatch(mainSource, /fallbackUrl: reuseArticleImage \? '' : pin\.remoteImageUrl/);
  assert.match(assetBlock, /const effectiveTextRenderMode = originalJulyCenter \? 'ai' : 'local'/);
  assert.match(assetBlock, /originalJulyCenter[\s\S]*createPinterestImageWithoutOverlay/);
  assert.match(assetBlock, /mode === 'generate-new'[\s\S]*createPinterestOverlay/);
  assert.match(assetBlock, /variant: 'generated'/);
  assert.match(assetBlock, /variant: 'reuse'/);
});

test('Pinterest generation verifies durable hosting immediately and uses a single-column workspace', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const pinViewSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'PinCreatorView.jsx'), 'utf8');
  const assetBlock = mainSource.match(/secureIpcHandle\('create-pinterest-pin-asset'[\s\S]*?\n}\)\);/)?.[0] || '';
  assert.match(assetBlock, /await hostFinalPinterestImage/);
  assert.match(assetBlock, /publicUrlVerified: durableHosted/);
  assert.match(assetBlock, /publicDimensionsVerified: durableHosted/);
  assert.match(assetBlock, /publicIdentityVerified: durableHosted/);
  assert.match(assetBlock, /csvMediaUrl: durableUrl/);
  assert.match(assetBlock, /hostingDeferred: !durableHosted/);
  assert.match(mainSource, /: \[pin\.csvMediaUrl, pin\.hostedImageUrl, pin\.imgurUrl\]/);
  assert.match(mainSource, /targetBytes: requirePinterestDimensions \? 0 : 420 \* 1024/);
  assert.match(mainSource, /targetBytes: options\.targetBytes \?\? 240 \* 1024/);
  assert.match(pinViewSource, /function generateImages[\s\S]*?\}, \{ concurrency: 2 \}\);/);
  assert.match(pinViewSource, /pin\.imageQa\?\.dimensionsVerified !== true/);
  assert.match(pinViewSource, /selectPinterestExportRows/);
  assert.match(pinViewSource, /Public hosting is pending and will retry automatically/);
  assert.match(mainSource, /hostingError: ''/);
  assert.doesNotMatch(pinViewSource, /xl:grid-cols-\[minmax\(0,1fr\)_360px\]/);
});

test('Pinterest defaults to the merged Ingredient Closeup one-pass style and retires redundant profiles', () => {
  const pinViewSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'PinCreatorView.jsx'), 'utf8');
  const pinDefaultsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'pinCreatorDefaults.js'), 'utf8');
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'Settings.jsx'), 'utf8');
  assert.match(pinViewSource, /const \[textPlacement, setTextPlacement\] = useState\("middle"\)/);
  assert.match(pinViewSource, /useState\("generate-new"\)/);
  assert.match(pinViewSource, /const \[selectedStyle, setSelectedStyle\] = useState\("custom-july-original-ai"\)/);
  assert.match(pinViewSource, /const effectiveTextRenderMode = usesIngredientCloseupAiStyle \? "ai" : "local"/);
  assert.match(pinViewSource, /useState\("ideogram"\)/);
  assert.match(pinViewSource, /Ideogram Integrated \| Ingredient Closeup/);
  assert.match(pinViewSource, /Local Exact Text/);
  assert.match(pinViewSource, /Middle \| Fixed for this style/);
  assert.match(pinViewSource, /no CTA, subtitle, number, or extra wording/i);
  assert.match(pinViewSource, /\["generate-new", "Generate New Food Photo"\][\s\S]*\["reuse-article", "Reuse Article Portrait"\]/);
  assert.match(pinViewSource, /\["custom-july-original-ai", "Ingredient Closeup Pin \(Default\)"\][\s\S]*\["custom-modern-recipe-magazine", "Modern Recipe Magazine"\][\s\S]*\["custom-minimal-editorial", "Minimal Editorial"\]/);
  assert.doesNotMatch(pinViewSource, /\["custom-(?:ingredient-closeup|recipe-card|weeknight-solution|listicle-collage)",/);
  assert.match(pinViewSource, /const styleWithPlacement = `\$\{selectedStyle\}::placement:\$\{textPlacement\}`/);
  assert.doesNotMatch(pinViewSource, /pin\.smartPinStyle \|\| selectedStyle/);
  assert.doesNotMatch(pinViewSource, /<Field label="Overlay text">/);
  assert.match(pinViewSource, /Ideogram Turbo \| Fixed for Ingredient Closeup \| about \$0\.03/);
  assert.match(pinViewSource, /Ideogram Balanced \| More detail \| about \$0\.06/);
  assert.match(pinViewSource, /Ideogram Quality \| Best detail \| about \$0\.09/);
  assert.match(pinViewSource, /md:grid-cols-\[minmax\(220px,280px\)_minmax\(0,1fr\)\]/);
  assert.match(pinViewSource, /2xl:grid-cols-\[minmax\(260px,340px\)_minmax\(0,1fr\)\]/);
  assert.match(pinViewSource, /soft-card w-full min-w-0 max-w-full overflow-hidden/);
  assert.match(pinViewSource, /overflow-x-hidden animate-fade-in/);
  assert.match(pinViewSource, />Clear All<\/Button>/);
  assert.doesNotMatch(pinViewSource, /Estimated Full Pack Cost/);
  assert.match(pinViewSource, /AI Integrated Center Text/);
  assert.match(pinDefaultsSource, /Create one complete vertical 9:16 recipe Pin with an ultra-realistic, full-bleed close-up/);
  assert.match(pinDefaultsSource, /real full-frame food-photography look/);
  assert.match(pinDefaultsSource, /Avoid fake steam, excessive glaze, oily pools, plastic perfection, neon saturation/);
  assert.doesNotMatch(pinDefaultsSource, /custom-july-original-ai[\s\S]{0,1000}Generate no text/);
  assert.doesNotMatch(pinDefaultsSource, /"custom-(?:ingredient-closeup|recipe-card|weeknight-solution|listicle-collage)":/);
  assert.match(settingsSource, /promptDefaultsVersion: PIN_PROMPT_DEFAULTS_VERSION/);
});

test('Meta reuses one Pinterest-first 4:5 image without a new image model call', () => {
  const sidebarSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'Sidebar.jsx'), 'utf8');
  const metaSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'MetaStudio.jsx'), 'utf8');
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.match(sidebarSource, /\{ id: "meta-studio", label: "Meta"/);
  assert.match(metaSource, /Pinterest Image for Meta/);
  assert.match(metaSource, /Create 4:5 Meta Image/);
  assert.match(metaSource, /sourceAsset: selectedSource/);
  assert.match(metaSource, /sourceContext: sourceContext/);
  assert.match(metaSource, /Selected automatically/);
  assert.match(metaSource, /Download GHL CSV/);
  assert.match(metaSource, /Create and Download GHL CSV/);
  assert.match(metaSource, /hasPlatformMetaAssets/);
  assert.match(metaSource, /Facebook and Instagram share that same image/);
  assert.match(metaSource, /Push to GHL/);
  assert.match(metaSource, /buildReadyGhlRows/);
  assert.match(metaSource, /createRepurposeImageVariants/);
  assert.match(metaSource, /prepareRepurposeGhlRows/);
  assert.match(mainSource, /sourceAsset = null/);
  assert.match(mainSource, /const wantedFormats = \[metaPortraitFormat\]/);
  assert.match(mainSource, /id: 'meta-social-portrait'/);
  assert.match(mainSource, /userEdited: systemPrepared \? previous\?\.userEdited === true : true/);
  const resizeStart = mainSource.indexOf('async function createRepurposeImageVariants');
  const resizeEnd = mainSource.indexOf("secureIpcHandle('create-repurpose-image-variants'", resizeStart);
  const resizeBlock = resizeStart >= 0 && resizeEnd > resizeStart
    ? mainSource.slice(resizeStart, resizeEnd)
    : '';
  assert.match(resizeBlock, /\.resize\(format\.width, format\.height/);
  assert.match(resizeBlock, /sourceAsset.kind !== 'pin'/);
  assert.match(resizeBlock, /requiredWidth: format\.width, requiredHeight: format\.height/);
  assert.match(resizeBlock, /fit: 'cover', position: 'centre'/);
  assert.doesNotMatch(resizeBlock, /articleImageSource/);
  assert.doesNotMatch(resizeBlock, /generatePinterestBaseImage|replicateRequest/);
});

test('Meta prepares all selected articles as one persistent GHL batch', () => {
  const metaSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'MetaStudio.jsx'), 'utf8');
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.js'), 'utf8');
  assert.match(metaSource, /All Articles to GHL/);
  assert.match(metaSource, /Create and Download All/);
  assert.match(metaSource, /Prepare All for Editing/);
  assert.match(metaSource, /prepareMetaBulkGhlRows/);
  assert.match(metaSource, /onMetaBulkProgress/);
  assert.match(metaSource, /completedArticles\.map\(\(item\) =>/);
  assert.match(mainSource, /async function prepareMetaBulkGhlRows\(articleIds = \[\]\)/);
  assert.match(mainSource, /store\.set\('metaBulkGhlDraft', draft\)/);
  assert.match(mainSource, /buildGhlSocialRows\(preparedPacks\)/);
  assert.match(mainSource, /emitProgress\('meta-bulk-progress'/);
  assert.match(preloadSource, /getMetaBulkGhlDraft/);
  assert.match(preloadSource, /prepareMetaBulkGhlRows/);
  assert.match(preloadSource, /onMetaBulkProgress/);
});

test('Meta uses one vertical column and Pinterest CSV preparation stays responsive', () => {
  const metaSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'MetaStudio.jsx'), 'utf8');
  const pinViewSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'PinCreatorView.jsx'), 'utf8');
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.match(metaSource, /Every Facebook and Instagram post is listed below in one vertical workflow/);
  assert.match(metaSource, /Facebook Posts/);
  assert.match(metaSource, /Instagram Posts/);
  assert.doesNotMatch(metaSource, /activePlatform/);
  assert.match(pinViewSource, /setCsvOpen\(true\);[\s\S]*setCsvHosting\(true\)/);
  assert.match(pinViewSource, /visiblePins\.map/);
  assert.match(pinViewSource, /Show 20 More Pins/);
  assert.match(mainSource, /Math\.min\(4, inputPins\.length\)/);
  assert.match(mainSource, /Rejected stale or mismatched media URL/);
  assert.match(pinViewSource, /mergePreparedPinHosting\(pinsRef\.current, hosting\?\.pins \|\| \[\]\)/);
});

test('Pinterest CSV editor keeps exact interval scheduling beside smart scheduling', () => {
  const pinViewSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'PinCreatorView.jsx'), 'utf8');
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.match(pinViewSource, /function applyPinterestTime\(\{ fromNow = false \} = \{\}\)/);
  assert.match(pinViewSource, /Start From Now/);
  assert.match(pinViewSource, /index \* intervalHours \* 60 \* 60 \* 1000/);
  assert.match(pinViewSource, /onClick=\{applyPinterestTime\}[\s\S]*>Apply Time<\/Button>/);
  assert.match(pinViewSource, /onClick=\{applyPinterestSchedule\}[\s\S]*>Smart Schedule<\/Button>/);
  assert.match(pinViewSource, /function autoFixPinterestCsv\(\)/);
  assert.match(pinViewSource, /Check and Auto Fix CSV/);
  assert.match(pinViewSource, /Auto Fix Errors/);
  assert.match(pinViewSource, /rows: validation\?\.rows \|\| rows/);
  assert.match(mainSource, /csvPublishImmediately: pin\.csvPublishImmediately === true/);
});

test('Pinterest AI lettering preflight groups review and remembers unchanged images', () => {
  const pinViewSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'PinCreatorView.jsx'), 'utf8');
  assert.match(pinViewSource, /function aiLetteringReviewKey\(pin = \{\}\)/);
  assert.match(pinViewSource, /function hasCurrentAiLetteringReview\(pin = \{\}\)/);
  assert.match(pinViewSource, /Review \$\{pendingAiTextReview\.length\} AI-lettered image/);
  assert.match(pinViewSource, /aiLetteringReviewedFor: aiLetteringReviewKey\(pin\)/);
  assert.match(pinViewSource, /Reviewed and Export/);
  assert.doesNotMatch(pinViewSource, /Row \$\{index \+ 1\} uses AI lettering/);
});

test('completed articles receive a credit-free Meta draft and Pinterest enrichment', () => {
  const article = {
    id: 'article-meta-1',
    title: 'Easy Garlic Chicken',
    generatedTitle: 'Easy Garlic Chicken for Weeknight Dinners',
    queueStatus: 'completed',
    content: '<p>Juicy garlic chicken with a simple pan sauce and clear step-by-step instructions.</p>',
    metaDescription: 'Make juicy garlic chicken with a quick pan sauce for an easy weeknight dinner.',
    featuredImageLocalPath: 'C:\\media\\garlic-chicken.webp',
    images: [{
      id: 'portrait',
      localPath: 'C:\\media\\garlic-chicken-portrait.webp',
      remoteImageUrl: 'https://example.com/garlic-chicken-portrait.webp'
    }]
  };

  const first = upsertAutomaticMetaProject([], article, [], '2026-07-28T12:00:00.000Z');
  assert.equal(first.length, 1);
  assert.equal(first[0].id, 'meta-auto-article-meta-1');
  assert.equal(first[0].autoCreated, true);
  assert.equal(first[0].creditFree, true);
  assert.match(first[0].content.facebook.primaryPost, /quick pan sauce/i);
  assert.match(first[0].content.instagram.feedCaption, /Send us a message for the complete recipe/i);
  assert.doesNotMatch(first[0].content.instagram.feedCaption, /https?:|link in (?:the )?profile/i);
  assert.equal(first[0].sourceLibrary.length, 0);
  assert.equal(preferredMetaSource(first[0].sourceLibrary), null);

  const noDuplicate = upsertAutomaticMetaProject(first, article, [], '2026-07-28T12:01:00.000Z');
  assert.equal(noDuplicate.length, 1);

  const pin = {
    id: 'pin-1',
    articleId: article.id,
    title: 'Garlic Chicken Dinner Everyone Saves',
    description: 'A close-up garlic chicken dinner with a fast, flavorful pan sauce.',
    imageUrl: 'https://i.ibb.co/example/garlic-chicken-pin.webp',
    csvKeywords: 'garlic chicken, easy dinner'
  };
  const enriched = syncAutomaticMetaProjects(noDuplicate, [article], [pin], '2026-07-28T12:02:00.000Z');
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0].sourceLibrary.length, 1);
  assert.equal(enriched[0].sourceLibrary[0].kind, 'pin');
  assert.equal(enriched[0].selectedSource.kind, 'pin');
  assert.equal(enriched[0].selectedSource.pinId, pin.id);
  assert.equal(enriched[0].sourceContext.title, pin.title);
  assert.match(enriched[0].content.facebook.primaryPost, /Everyone Saves/i);

  const edited = [{
    ...enriched[0],
    userEdited: true,
    content: { custom: 'keep me' },
    imageAssets: [
      { id: 'instagram-portrait', platform: 'Instagram', sourceKind: 'pin', publicUrl: pin.imageUrl },
      { id: 'facebook-feed', platform: 'Facebook', sourceKind: 'article-inline', publicUrl: article.images[0].remoteImageUrl }
    ]
  }];
  const protectedDraft = syncAutomaticMetaProjects(edited, [article], [pin], '2026-07-28T12:03:00.000Z');
  assert.deepEqual(protectedDraft[0].content, { custom: 'keep me' });
  assert.equal(protectedDraft[0].sourceLibrary.length, 1);
  assert.equal(protectedDraft[0].sourceLibrary[0].kind, 'pin');
  assert.equal(protectedDraft[0].imageAssets.length, 0);
});

test('Meta uses one cropped Pinterest-first 4:5 image for both platform rows', () => {
  const metaSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'MetaStudio.jsx'), 'utf8');
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.match(metaSource, /finished Pinterest Pin is selected first/);
  assert.match(metaSource, /sharedMetaPortrait: true/);
  assert.match(mainSource, /id: 'meta-social-portrait'/);
  assert.match(mainSource, /label: 'Meta Portrait 4:5'/);
  assert.match(mainSource, /position: 'centre'/);
  assert.match(mainSource, /asset\.id === metaPortraitFormat\.id/);
});

test('Pinterest image generation uses focused Ingredient Closeup AI while other profiles keep exact local type', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const legacyRendererSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'pin-creator', 'renderer.js'), 'utf8');

  assert.match(mainSource, /generatePinImage\(prompt, aspectRatio = '9:16'/);
  assert.match(mainSource, /pinAspectRatio = '9:16'/);
  const pinterestModelBlock = mainSource.match(/function pinterestModelRequest[\s\S]*?async function generatePinterestBaseImage/)?.[0] || '';
  assert.doesNotMatch(pinterestModelBlock, /magic_prompt_option: 'Auto'/);
  assert.match(pinterestModelBlock, /magic_prompt_option: 'Off'/);
  assert.match(mainSource, /ideogramLetteringModels = new Set\(\['ideogram', 'ideogram-balanced', 'ideogram-quality'\]\)/);
  assert.match(mainSource, /ideogram-ai\/ideogram-v3-balanced/);
  assert.match(mainSource, /ideogram-ai\/ideogram-v3-quality/);
  assert.match(mainSource, /ideogramLetteringModels\.has\(model\) \? model : 'ideogram'/);
  assert.match(mainSource, /enhancePinterestPromptLedAiPrompt\([\s\S]*polishPinterestOverlayText\(_overlayText\)/);
  assert.match(mainSource, /Choose exactly one integrated headline treatment/);
  assert.match(mainSource, /Montserrat ExtraBold or Poppins ExtraBold/);
  assert.match(mainSource, /softly translucent full-width center band sampled from the food colors/);
  assert.match(mainSource, /Fill about 72-88% of the frame/);
  assert.match(mainSource, /overlay must occupy no more than 28% of the image height/);
  assert.match(mainSource, /polishPinterestOverlayText\(overlayText \|\| safeSnapshot\.recipe\?\.name, safeSnapshot\.recipe\?\.name \|\| overlayText\)/);
  assert.match(mainSource, /enhancePinterestOriginalJulyAiPrompt\(prompt, _overlayText\)/);
  assert.match(mainSource, /compact softly translucent rounded panel/);
  assert.match(mainSource, /const originalJulyCenter = mode === 'generate-new' && pinStyle === 'custom-july-original-ai'/);
  assert.match(mainSource, /placement: 'middle'/);
  assert.match(mainSource, /request\.model = 'ideogram-ai\/ideogram-v3-turbo'/);
  assert.match(mainSource, /magic_prompt_option: 'Off'/);
  assert.match(mainSource, /const effectiveTextRenderMode = originalJulyCenter \? 'ai' : 'local'/);
  assert.match(mainSource, /originalJulyCenter[\s\S]*createPinterestImageWithoutOverlay/);
  assert.match(mainSource, /variant: 'generated'/);
  assert.match(mainSource, /font: effectiveFont,[\s\S]*variant: 'reuse'/);
  assert.match(mainSource, /aiCtaRequested: false/);
  assert.match(mainSource, /ctaText: qa\.ctaText/);
  assert.match(mainSource.match(/secureIpcHandle\('create-pinterest-pin-asset'[\s\S]*?\n}\)\);/)?.[0] || '', /variant: 'generated'/);
  assert.doesNotMatch(mainSource, /enhancePinterestLegacyAiPrompt\([\s\S]*polishPinterestOverlayText\(overlayText\)/);
  assert.match(mainSource, /style_type: 'Realistic'/);
  assert.match(mainSource, /runManagedReplicatePrediction/);
  assert.doesNotMatch(mainSource, /falling back to Pruna\/Z-Image/);
  assert.match(legacyRendererSource, /2:3 - Standard Pinterest \(Recommended\)/);
  assert.doesNotMatch(legacyRendererSource, /9:16 - Standard Pinterest \(Recommended\)/);
});

test('Pinterest predictions persist IDs and cancel remote work before retry', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const pinViewSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'PinCreatorView.jsx'), 'utf8');

  assert.match(mainSource, /pinPredictionJobs/);
  assert.match(mainSource, /pinPredictionHistory/);
  assert.match(mainSource, /Cancel-After/);
  assert.match(mainSource, /await cancelReplicatePrediction\(cancelUrl, apiToken\)/);
  assert.match(mainSource, /create-pinterest-pin-asset/);
  assert.match(mainSource, /ensureDurablePinImage/);
  assert.match(pinViewSource, /reuse-article/);
  assert.match(pinViewSource, /same final image/);
});

test('Pinterest SEO generation prioritizes visible keywords and verified trend evidence', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const pinViewSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'PinCreatorView.jsx'), 'utf8');

  assert.match(mainSource, /first 40 characters useful and keyword-specific/i);
  assert.match(mainSource, /relevantSavedPinterestResearch/);
  assert.match(mainSource, /Pinterest Predicts 2026: Cabbage Crush/);
  assert.match(mainSource, /Never force a trend, year, health promise, time claim, or ingredient/i);
  assert.match(mainSource, /description at 500 characters or fewer/i);
  assert.match(mainSource, /selected board, and primary interest cluster without keyword stuffing/i);
  assert.match(pinViewSource, /Title length", ok: title\.length >= 50 && title\.length <= 100/);
  assert.match(pinViewSource, /Description depth", ok: description\.length >= 300 && description\.length <= 500/);
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
  assert.equal(mergePinStyles(defaults, { ...customized, retired: { prompt: 'remove me' } }, ['retired']).retired, undefined);
  assert.equal(migratePinStyles(defaults, { ...customized, retired: { prompt: 'remove me' } }, 1, 2, ['retired']).retired, undefined);
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
  assert.equal(first.settings.intextImageRatio, '9:16');
  assert.equal(first.settings.pinterestPinRatio, '9:16');
  assert.equal(first.settings.instagramPortraitRatio, '4:5');
  assert.equal(first.settings.instagramStoryRatio, '9:16');
  assert.equal(first.settings.facebookFeedRatio, '1.91:1');
  assert.equal(first.settings.squareSocialRatio, '1:1');
  assert.equal(first.settings.settingsSchemaVersion, 6);
  assert.equal(first.settings.automaticMediaCleanupEnabled, true);
  assert.equal(first.settings.mediaRetentionDays, 7);
  assert.equal(first.settings.internalLinkCount, 3);
  assert.equal(first.settings.internalLinkMaxPosts, 500);
  assert.equal(first.settings.publishStatus, 'publish');
  assert.equal(first.settings.affiliateAutoDiscover, true);
  assert.equal(first.settings.featureFlags.contentCalendar, true);
  assert.deepEqual(first.settings.customIntegration, { keep: true });
  assert.equal(first.settings.pinCreator.customField, 'keep');
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.deepEqual(second.settings, first.settings);
});

test('settings migration changes only the old in-article landscape default to portrait', () => {
  const oldDefault = migrateSettings({ settingsSchemaVersion: 2, featuredImageRatio: '3:2', intextImageRatio: '4:3' });
  const customPortrait = migrateSettings({ settingsSchemaVersion: 2, featuredImageRatio: '3:2', intextImageRatio: '2:3' });

  assert.equal(oldDefault.settings.featuredImageRatio, '3:2');
  assert.equal(oldDefault.settings.intextImageRatio, '9:16');
  assert.equal(oldDefault.settings.settingsSchemaVersion, 6);
  assert.equal(customPortrait.settings.intextImageRatio, '2:3');
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

test('automatic media retention defaults to seven days and preserves custom values', () => {
  const oldDefault = migrateSettings({ settingsSchemaVersion: 4, mediaRetentionDays: 30 });
  const custom = migrateSettings({ settingsSchemaVersion: 4, mediaRetentionDays: 14, automaticMediaCleanupEnabled: false });
  assert.equal(oldDefault.settings.mediaRetentionDays, 7);
  assert.equal(oldDefault.settings.automaticMediaCleanupEnabled, true);
  assert.equal(custom.settings.mediaRetentionDays, 14);
  assert.equal(custom.settings.automaticMediaCleanupEnabled, false);
  assert.equal(normalizeMediaRetentionDays(1), 7);
  assert.equal(normalizeMediaRetentionDays(999), 365);
});

test('automatic media cleanup selects only old unreferenced managed candidates', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 7, 15, 12);
  const files = [
    { path: 'C:\\managed\\old-unused.webp', referenceKey: 'c:\\managed\\old-unused.webp', mtimeMs: now - 8 * day },
    { path: 'C:\\managed\\old-used.webp', referenceKey: 'c:\\managed\\old-used.webp', mtimeMs: now - 20 * day },
    { path: 'C:\\managed\\recent.webp', referenceKey: 'c:\\managed\\recent.webp', mtimeMs: now - 2 * day }
  ];
  const referenced = new Set(['c:\\managed\\old-used.webp']);
  assert.deepEqual(
    mediaCleanupCandidates(files, referenced, 7, now).map((file) => file.path),
    ['C:\\managed\\old-unused.webp']
  );
});

test('automatic media cleanup is scheduled and remains limited to managed storage', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.match(mainSource, /scheduleAutomaticMediaCleanup\(\);/);
  assert.match(mainSource, /scheduleAutomaticMediaCleanup\(24 \* 60 \* 60 \* 1000\)/);
  assert.match(mainSource, /isPathInsideRoots\(file\.path, \[imagesDir, videosDir, repurposeImagesDir\]\)/);
  assert.match(mainSource, /collectReferencedMediaPaths\(\)/);
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
  assert.equal(systemResolved.featuredImageRatio, '3:2');
  assert.equal(systemResolved.intextImageRatio, '9:16');
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
    <ul class="recipe-facts"><li><strong>Prep Time:</strong> 10 minutes</li><li><strong>Cook Time:</strong> 20 minutes</li><li><strong>Total Time:</strong> 30 minutes</li><li><strong>Servings:</strong> 4</li></ul>
    <h3>Ingredients</h3><ul><li>1 lb chicken</li><li>1 lemon</li><li>2 tbsp oil</li><li>1 tsp salt</li></ul>
    <h3>Instructions</h3><ol><li>Heat the pan until oil shimmers.</li><li>Cook chicken for 20 minutes until browned and the internal temperature reaches 165 F on a thermometer.</li><li>Finish with lemon.</li></ol>
    <h2>2. Tomato Pasta</h2>
    <ul class="recipe-facts"><li><strong>Prep Time:</strong> 10 minutes</li><li><strong>Cook Time:</strong> 15 minutes</li><li><strong>Total Time:</strong> 25 minutes</li><li><strong>Yield:</strong> 4 servings</li></ul>
    <h3>Ingredients</h3><ul><li>12 oz pasta</li><li>2 cups tomatoes</li><li>2 tbsp oil</li><li>1 tsp salt</li></ul>
    <h3>Instructions</h3><ol><li>Boil the pasta for 10 minutes until tender.</li><li>Cook sauce until bubbling.</li><li>Combine and serve.</li></ol>`;
  assert.equal(validateRecipeChunk(complete, 1, 2).ok, true);
  assert.equal(validateRecipeChunk(complete.replace('<h2>2.', '<h2>3.'), 1, 2).ok, false);
  assert.equal(validateRecipeChunk(complete.replace(/<li>1 tsp salt<\/li>/g, ''), 1, 2).ok, true);
  assert.equal(validateRecipeChunk(complete.replace(/<h3>Ingredients<\/h3><ul>[\s\S]*?<\/ul>/g, '<h3>Ingredients</h3><ul></ul>'), 1, 2).ok, false);
});

test('recipe collection headings accept common model variants without matching time headings', () => {
  const variants = [
    '<h2>Recipe 1: Lemon Chicken</h2>',
    '<h2><strong>#2 Garlic Soup</strong></h2>',
    '<h2>3) Tomato Pasta</h2>',
    '<h2>4 - Herb Rice</h2>',
    '<h2>5 Crispy Potatoes</h2>',
    '<h2>30-Minute Dinner Tips</h2>'
  ].join('\n');
  assert.deepEqual(extractNumberedH2s(variants).map((heading) => heading.number), [1, 2, 3, 4, 5]);
  const normalized = canonicalizeNumberedRecipeHeadings(variants);
  assert.match(normalized, /<h2>1\. Lemon Chicken<\/h2>/);
  assert.match(normalized, /<h2>2\. Garlic Soup<\/h2>/);
  assert.match(normalized, /<h2>3\. Tomato Pasta<\/h2>/);
  assert.match(normalized, /<h2>4\. Herb Rice<\/h2>/);
  assert.match(normalized, /<h2>5\. Crispy Potatoes<\/h2>/);
  assert.match(normalized, /<h2>30-Minute Dinner Tips<\/h2>/);
});

test('recipe collection retries include actionable validator feedback', () => {
  const retry = buildRecipeRetryPrompt('Write seven recipes.', 'Recipe 2 needs timing and doneness cues');
  assert.match(retry, /Write seven recipes\./);
  assert.match(retry, /Recipe 2 needs timing and doneness cues/);
  assert.match(retry, /Return the entire requested HTML again, corrected/);
});

test('recipe card validation requires quantities, timing, yield, and complete steps', () => {
  const card = `<section id="recipe-card">
    <ul><li><strong>Prep Time:</strong> 10 minutes</li><li><strong>Cook Time:</strong> 20 minutes</li><li><strong>Total Time:</strong> 30 minutes</li><li><strong>Servings:</strong> 4</li></ul>
    <h3>Ingredients</h3><ul><li>1 lb chicken</li><li>1 lemon</li><li>2 tbsp oil</li><li>1 tsp salt</li></ul>
    <h3>Instructions</h3><ol><li>Heat the pan until the oil shimmers.</li><li>Cook for 12 minutes until browned and the internal temperature reaches 165 F on a thermometer.</li><li>Rest and serve.</li></ol>
  </section>`;
  assert.equal(validateRecipeCard(card).ok, true);
  assert.equal(validateRecipeCard(card.replace('<li>1 lb chicken</li>', '<li>chicken</li>').replace('<li>1 lemon</li>', '<li>lemon</li>')).ok, false);
  assert.equal(validateRecipeCard(card.replace('until the oil shimmers', 'briefly').replace('until browned', 'throughout')).ok, false);
});

test('recipe card enhancement is responsive, lightweight, and script free', async () => {
  const { ensureRecipeCard } = await import('../src/lib/articlePostProcess.mjs');
  const content = `<p>Useful recipe.</p><section id="recipe-card">
    <h2>Recipe Card</h2><h3>Skillet Chicken</h3>
    <ul><li><strong>Prep Time:</strong> 10 minutes</li><li><strong>Cook Time:</strong> 20 minutes</li><li><strong>Total Time:</strong> 30 minutes</li><li><strong>Servings:</strong> 4</li></ul>
    <h3>Ingredients</h3><ul itemprop="recipeIngredient"><li>1 pound chicken</li></ul>
    <h3>Instructions</h3><ol itemprop="recipeInstructions"><li>Cook for 20 minutes until browned.</li></ol>
  </section>`;
  const enhanced = ensureRecipeCard(content, 'Skillet Chicken');
  assert.match(enhanced, /border-top:5px solid #7c3aed/);
  assert.match(enhanced, /grid-template-columns:repeat\(auto-fit/);
  assert.match(enhanced, /aria-label="Recipe card"/);
  assert.doesNotMatch(enhanced, /<script|javascript:|onclick=/i);
});

test('explicitly unverified affiliate links are never inserted even with an exact text match', async () => {
  const { applyAffiliateLinksToArticle } = await import('../src/lib/affiliateLinks.mjs');
  const applied = applyAffiliateLinksToArticle({
    title: 'Best Blender Sauce',
    content: '<p>Useful introduction.</p><p>Use a countertop blender to make the sauce smooth.</p>'
  }, {
    affiliateLinks: [{
      id: 'bad-blender',
      name: 'Countertop Blender',
      url: 'https://merchant.example/blender',
      keywords: ['countertop blender', 'blender'],
      source: 'impact',
      trackingVerified: false,
      discoveryScore: 200
    }]
  });
  assert.equal(applied.affiliateLinks.length, 0);
  assert.doesNotMatch(applied.content, /merchant\.example|affiliate-disclosure/);
});

test('internal links are placed after the most relevant article paragraph', async () => {
  const { applyInternalLinksToHtml } = await import('../src/lib/internalLinks.js');
  const content = [
    '<p>This weeknight dinner has a simple method.</p>',
    '<p>Store leftovers in the refrigerator and reheat them gently.</p>',
    '<p>Serve the chicken with roasted potatoes and a crisp salad.</p>'
  ].join('');
  const linked = applyInternalLinksToHtml(content, [{
    url: 'https://example.com/crispy-roasted-potatoes/',
    title: 'Crispy Roasted Potatoes',
    anchor: 'Crispy Roasted Potatoes',
    categories: ['Side Dishes']
  }]);
  assert.ok(linked.html.indexOf('crispy-roasted-potatoes') > linked.html.indexOf('Serve the chicken'));
  assert.equal(linked.applied.length, 1);
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

test('Impact recommendations are not inserted into reader articles', async () => {
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

  assert.equal(applied.affiliateLinks.length, 0);
  assert.doesNotMatch(applied.content, /Helpful tool for this recipe|data-affiliate-disclosure/);
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

test('affiliate library repairs verified Impact tracking links without trusting ordinary destinations', () => {
  const repaired = normalizeAffiliateLibrary([
    {
      id: 'legacy-impact',
      name: 'Mixing bowls',
      url: 'https://merchant.pxf.io/c/7445429/3859433/51140',
      source: 'impact',
      trackingVerified: false
    },
    {
      id: 'ordinary-link',
      name: 'Ordinary destination',
      url: 'https://merchant.example/products/bowl',
      source: 'impact',
      trackingVerified: false
    }
  ]);

  assert.equal(repaired[0].trackingVerified, true);
  assert.equal(repaired[0].trackingSource, 'verified_impact_tracking_domain');
  assert.equal(repaired[1].trackingVerified, false);
});

test('affiliate library recognizes exact tagged Amazon products but not search pages', () => {
  const normalized = normalizeAffiliateLibrary([
    {
      name: 'Cast iron skillet',
      url: 'https://www.amazon.com/dp/B00006JSUA?tag=exampletag-20',
      source: 'amazon',
      trackingVerified: false
    },
    {
      name: 'Amazon skillet search',
      url: 'https://www.amazon.com/s?k=skillet&tag=exampletag-20',
      source: 'amazon',
      trackingVerified: true,
      amazonLinkType: 'search'
    }
  ], {
    amazonPartnerTag: 'exampletag-20',
    amazonMarketplace: 'www.amazon.com'
  });

  assert.equal(normalized[0].trackingVerified, true);
  assert.equal(normalized[0].amazonAsin, 'B00006JSUA');
  assert.equal(normalized[0].amazonLinkType, 'product');
  assert.equal(normalized[1].amazonLinkType, 'search');
  assert.equal(normalized[1].amazonAsin, undefined);
});

test('affiliate provider fallback uses a connected verified provider when selection is not ready', () => {
  const settings = {
    affiliateProvider: 'amazon',
    affiliateProviderFallback: true,
    amazonPartnerTag: 'exampletag-20',
    impactAccountSid: 'account-123',
    impactAuthToken_encrypted: 'enc:stored-token',
    affiliateLinks: [{
      name: 'Legacy Amazon search',
      url: 'https://www.amazon.com/s?k=skillet&tag=exampletag-20',
      source: 'amazon',
      amazonLinkType: 'search',
      trackingVerified: true
    }]
  };

  assert.deepEqual(affiliateProviderReadiness(settings), {
    impact: true,
    amazon: false,
    amazonApi: false,
    exactAmazonProducts: 0
  });
  assert.deepEqual(affiliateProviderOrder(settings), ['impact']);
  assert.deepEqual(affiliateProviderOrder({ ...settings, affiliateProviderFallback: false }), []);
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
  assert.match(source, /checkpointParallelTasks\(\{ generatedTitle: titleTask, featuredImagePrompt: featuredPromptTask \}/);
  assert.match(source, /checkpointParallelTasks\(\{ featured: featuredTask, imagePrompts: imagePromptsTask \}/);
  assert.match(source, /missingIndexes\.slice\(start,\s*start\s*\+\s*2\)/);
  assert.match(source, /internalLinkPostsCacheRef/);
});

test('WordPress publishing enforces bounded WebP media and responsive attachment recognition', () => {
  const source = fs.readFileSync(require.resolve('../electron/main.js'), 'utf8');
  assert.match(source, /parsed\.protocol !== 'https:'/);
  assert.match(source, /function safePublicLookup/);
  assert.match(source, /function wordpressRequestConfig/);
  assert.match(source, /Blocked a WordPress redirect to a different host/);
  assert.match(source, /axios\.get\(`\$\{url\}\/wp-json\/`, wordpressRequestConfig\(url/);
  assert.match(source, /axios\.post\(postEndpoint, payload, wordpressRequestConfig\(url/);
  assert.match(source, /targetBytes:\s*280\s*\*\s*1024/);
  assert.match(source, /targetBytes:\s*220\s*\*\s*1024/);
  assert.match(source, /wp-image-\$\{Number\(attachmentId\)\}/);
  assert.match(source, /loading',\s*'lazy'/);
  assert.match(source, /fetchpriority',\s*'low'/);
});

test('all user-controlled remote media downloads use public DNS resolution and byte limits', () => {
  const source = fs.readFileSync(require.resolve('../electron/main.js'), 'utf8');
  const sections = [
    source.slice(source.indexOf('async function downloadImage'), source.indexOf('function videoExtFromUrlOrType')),
    source.slice(source.indexOf('async function downloadVideo'), source.indexOf('function videoRecordWithDisplay')),
    source.slice(source.indexOf('async function imageSourceBuffer'), source.indexOf('const repurposeImageFormats'))
  ];

  for (const section of sections) {
    assert.match(section, /httpAgent:\s*safePublicHttpAgent/);
    assert.match(section, /httpsAgent:\s*safePublicHttpsAgent/);
    assert.match(section, /beforeRedirect:\s*assertSafeRemoteRedirect/);
    assert.match(section, /maxContentLength:\s*\d+\s*\*\s*1024\s*\*\s*1024/);
    assert.match(section, /maxBodyLength:\s*\d+\s*\*\s*1024\s*\*\s*1024/);
  }
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
  assert.match(source, /View Error Details/);
  assert.match(source, /reportRendererError/);
});

test('article preview sanitizer blocks active content and dangerous CSS', () => {
  const sanitizerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'sanitizeHtml.js'), 'utf8');
  assert.match(sanitizerSource, /"form", "input", "button", "textarea", "select"/);
  assert.match(sanitizerSource, /"srcdoc", "formaction", "action", "method"/);
  assert.match(sanitizerSource, /normalized\.startsWith\("javascript:"\)/);
  assert.match(sanitizerSource, /position\\s\*:\\s\*\(\?:fixed\|absolute\|sticky\)/);
  assert.match(sanitizerSource, /z-index\\s\*:/);
  assert.match(sanitizerSource, /noopener noreferrer/);
});

test('WordPress publishing sanitizer keeps recipe markup and removes active content', () => {
  const sanitized = sanitizeWordPressArticleHtml(`
    <section id="recipe-card" class="recipe-card" data-recipe="true" itemscope itemtype="https://schema.org/Recipe" style="margin:32px 0;background:#fff;position:fixed;background-image:url(javascript:alert(1))">
      <h2 itemprop="name">Lemon Soup</h2>
      <a href=javascript:alert(1) onclick="steal()">Bad link</a>
      <a href="/recipes/">Recipes</a>
      <img src="https://example.com/lemon.webp" alt="Lemon soup" onerror="steal()">
      <iframe src="https://evil.example/embed"></iframe>
      <object data="https://evil.example/file"></object>
      <form action="https://evil.example"><input name="password"></form>
      <script>alert(1)</script>
    </section>
  `);
  assert.match(sanitized, /id="recipe-card"/);
  assert.match(sanitized, /data-recipe="true"/);
  assert.match(sanitized, /itemtype="https:\/\/schema\.org\/Recipe"/);
  assert.match(sanitized, /margin:32px 0/);
  assert.match(sanitized, /href="\/recipes\/"/);
  assert.match(sanitized, /src="https:\/\/example\.com\/lemon\.webp"/);
  assert.doesNotMatch(sanitized, /javascript:|onclick|onerror|position:fixed|background-image|iframe|object|form|input|script/i);
});

test('remote publishing records idempotency receipts before renderer acknowledgement', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.match(mainSource, /function saveWordPressPublishReceipt/);
  assert.match(mainSource, /findWordPressPostByIdentity/);
  assert.match(mainSource, /idempotencyKey: `\$\{publicationIdentity}:featured`/);
  assert.ok(mainSource.indexOf('saveWordPressPublishReceipt({') < mainSource.indexOf('updateRankMathMeta(url, auth, postData.id'));
  assert.match(mainSource, /function ghlUploadFingerprint/);
  assert.match(mainSource, /priorGhlReceipt\(idempotencyKey\)/);
  assert.match(mainSource, /Remote outcome is unknown, so automatic retry is blocked to prevent duplicates/);
});

test('saved credentials have an explicit encrypted-storage removal path', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.js'), 'utf8');
  const settingsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'Settings.jsx'), 'utf8');
  assert.match(mainSource, /secureIpcHandle\('clear-stored-credential'/);
  assert.match(mainSource, /delete copy\.apiKey_encrypted/);
  assert.match(preloadSource, /clearStoredCredential/);
  assert.match(settingsSource, /Remove Credential/);
});

test('preload exposes explicit IPC methods without a generic renderer escape hatch', () => {
  const source = fs.readFileSync(require.resolve('../electron/preload.js'), 'utf8');
  assert.match(source, /contextBridge\.exposeInMainWorld\('electronAPI'/);
  assert.match(source, /getDiagnostics:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-diagnostics'\)/);
  assert.match(source, /restoreLatestWorkspaceBackup:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('restore-latest-workspace-backup'\)/);
  assert.doesNotMatch(source, /electronAPI[^]*ipcRenderer\s*[,}]/);
  assert.doesNotMatch(source, /nodeIntegration\s*:/);
});

test('all application IPC handlers verify a trusted top-level renderer', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const directHandles = mainSource.match(/ipcMain\.handle\(/g) || [];
  const secureHandles = mainSource.match(/secureIpcHandle\(/g) || [];
  assert.equal(directHandles.length, 1);
  assert.ok(secureHandles.length > 90);
  assert.match(mainSource, /frame !== event\?\.sender\?\.mainFrame/);
  assert.match(mainSource, /isTrustedAppNavigation\(frame\.url\)/);
  assert.match(mainSource, /Blocked IPC call from an untrusted renderer/);
  assert.match(mainSource, /function trustedDevServerUrl\(\)[\s\S]*?if \(app\.isPackaged\) return ''/);
  assert.match(mainSource, /loopback && \['http:', 'https:'\]\.includes\(parsed\.protocol\)/);
  assert.doesNotMatch(mainSource, /mainWindow\.loadURL\(process\.env\.VITE_DEV_SERVER_URL\)/);
  assert.match(mainSource, /devTools: !app\.isPackaged/);
  assert.match(mainSource, /navigateOnDragDrop: false/);
});

test('packaged renderer and managed media use a constrained secure custom protocol', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.match(mainSource, /protocol\.registerSchemesAsPrivileged/);
  assert.match(mainSource, /scheme: APP_PROTOCOL/);
  assert.match(mainSource, /secure: true/);
  assert.match(mainSource, /protocol\.handle\(APP_PROTOCOL/);
  assert.match(mainSource, /resolveAllowedMediaPath\(requestedPath\)/);
  assert.match(mainSource, /fsp\.realpath\(path\.resolve\(filePath\)\)/);
  assert.match(mainSource, /mainWindow\.loadURL\(`\$\{APP_PROTOCOL_ORIGIN\}\/index\.html`\)/);
  assert.doesNotMatch(mainSource, /mainWindow\.loadFile\(/);
  assert.doesNotMatch(mainSource, /img-src[^;]*file:/);
  assert.doesNotMatch(mainSource, /media-src[^;]*file:/);
});

test('release packaging enables tamper resistance and omits source maps', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const viteSource = fs.readFileSync(path.join(__dirname, '..', 'vite.config.js'), 'utf8');
  const afterPackSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'after-pack.js'), 'utf8');
  assert.equal(packageJson.build.asar, true);
  assert.equal(packageJson.build.electronFuses.runAsNode, false);
  assert.equal(packageJson.build.electronFuses.enableNodeOptionsEnvironmentVariable, false);
  assert.equal(packageJson.build.electronFuses.enableNodeCliInspectArguments, false);
  assert.equal(packageJson.build.electronFuses.grantFileProtocolExtraPrivileges, false);
  assert.equal(packageJson.build.electronFuses.enableEmbeddedAsarIntegrityValidation, true);
  assert.equal(packageJson.build.electronFuses.onlyLoadAppFromAsar, true);
  assert.equal(packageJson.build.electronFuses.loadBrowserProcessSpecificV8Snapshot, false);
  assert.match(viteSource, /sourcemap:\s*false/);
  assert.ok(afterPackSource.indexOf('await obfuscateAppAsar(context)') < afterPackSource.indexOf("context.electronPlatformName !== 'win32'"));
  assert.match(afterPackSource, /updateWindowsAsarIntegrity/);
  assert.match(afterPackSource, /updateMacAsarIntegrity/);
  assert.match(afterPackSource, /createHash\('sha256'\)\.update\(headerString\)/);
  assert.match(afterPackSource, /filePath\.endsWith\('\.map'\)/);
});

test('automatic updates require a public HTTPS feed and a configured Windows publisher', () => {
  assert.equal(normalizeUpdateFeedUrl('https://updates.example.com/content-studio/'), 'https://updates.example.com/content-studio');
  assert.equal(normalizeUpdateFeedUrl('https://updates.example.com/content-studio/?token=secret#latest'), 'https://updates.example.com/content-studio');
  assert.equal(normalizeUpdateFeedUrl('http://updates.example.com/content-studio'), '');
  assert.equal(normalizeUpdateFeedUrl('https://user:secret@updates.example.com/content-studio'), '');
  assert.equal(normalizeUpdateFeedUrl('https://localhost/content-studio'), '');
  assert.equal(normalizeUpdateFeedUrl('https://192.168.1.20/content-studio'), '');
  assert.deepEqual(configuredWindowsPublisherNames({ build: { win: {} } }), []);
  assert.deepEqual(configuredWindowsPublisherNames({ build: { win: { publisherName: ['Content Studio LLC', 'Backup Publisher'] } } }), [
    'Content Studio LLC',
    'Backup Publisher'
  ]);
});

test('legacy plaintext credentials migrate to encrypted storage before the window opens', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.match(mainSource, /function migrateLegacyPlaintextSecrets\(\)/);
  assert.match(mainSource, /migrateSecret\(next, 'impactAuthToken', 'impactAuthToken_encrypted'\)/);
  assert.match(mainSource, /migrateSecret\(next\.pinCreator, 'imgbbApiKey', 'imgbbApiKey_encrypted'\)/);
  assert.match(mainSource, /migrateSecret\(migrated, 'apiKey', 'apiKey_encrypted'\)/);
  const startupBlock = mainSource.match(/app\.whenReady\(\)\.then\(\(\) => \{[\s\S]*?\n}\);/)?.[0] || '';
  assert.ok(startupBlock.indexOf('migrateLegacyPlaintextSecrets();') < startupBlock.indexOf('createWindow();'));
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

test('workspace SQLite migration separates large workspace data from settings', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'content-studio-workspace-'));
  let state = { settings: { theme: 'dark' }, articles: [{ id: 'article-1', title: 'Soup' }] };
  const listeners = new Set();
  const settingsStore = {
    get(key, fallback) { return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : fallback; },
    set(key, value) { state = { ...state, [key]: value }; listeners.forEach((listener) => listener()); },
    delete(key) { const next = { ...state }; delete next[key]; state = next; },
    has(key) { return Object.prototype.hasOwnProperty.call(state, key); },
    onDidAnyChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get store() { return state; },
    set store(value) { state = value; }
  };
  const workspace = createWorkspaceStore(settingsStore, directory);
  assert.equal(settingsStore.has('articles'), false);
  assert.equal(workspace.get('articles.0.title'), 'Soup');
  workspace.set('articles.0.queueStatus', 'completed');
  assert.equal(workspace.get('articles.0.queueStatus'), 'completed');
  assert.equal(workspace.get('settings', {}).theme, 'dark');
  workspace.database.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('job center recovers interrupted work and never stores credentials', () => {
  let jobs = [];
  const memoryStore = {
    get() { return jobs; },
    set(_key, value) { jobs = value; }
  };
  const center = createJobCenter({ store: memoryStore });
  center.start('native-pin-1', { payload: { articleId: 'a1', apiToken: 'secret-value' } });
  assert.equal(center.list()[0].status, 'running');
  assert.equal(center.list()[0].payload.apiToken, undefined);
  center.recoverInterrupted();
  assert.equal(center.list()[0].status, 'interrupted');
  assert.match(center.list()[0].error, /retry/i);
});

test('performance scheduling learns strong posting hours and keeps minimum spacing', () => {
  const rows = [
    { publishedAt: '2026-07-01T18:00:00', outboundClicks: 20, impressions: 1000 },
    { publishedAt: '2026-07-02T18:00:00', outboundClicks: 18, impressions: 900 },
    { publishedAt: '2026-07-01T21:00:00', outboundClicks: 12, impressions: 800 },
    { publishedAt: '2026-07-02T21:00:00', outboundClicks: 11, impressions: 700 }
  ];
  const profile = buildPerformanceScheduleProfile([...rows, ...rows, ...rows]);
  const slots = nextPerformanceSlots(4, { start: new Date('2026-08-01T08:00:00'), intervalHours: 2, preferredHours: profile.preferredHours, pinsPerDay: 4 });
  assert.equal(profile.mode, 'account-data');
  assert.deepEqual(profile.preferredHours.slice(0, 2), [18, 21]);
  assert.equal(slots.length, 4);
  assert.ok(slots.every((slot, index) => index === 0 || slot - slots[index - 1] >= 2 * 60 * 60 * 1000));
  const boundedSlots = nextPerformanceSlots(32, {
    start: new Date('2026-08-29T08:00:00Z'),
    intervalHours: 24,
    preferredHours: [9],
    pinsPerDay: 1,
    maximumDate: new Date('2026-08-31T23:59:59Z')
  });
  assert.ok(boundedSlots.length < 32);
  assert.ok(boundedSlots.every((slot) => slot <= new Date('2026-08-31T23:59:59Z')));
});

test('post-publish QA checks public SEO, recipe schema, links, and durable media', () => {
  const url = 'https://example.com/lemon-soup/';
  const html = `<html><head><title>Fresh Lemon Soup Recipe</title><meta name="description" content="A practical lemon soup recipe with measured ingredients, timing, serving advice, and storage tips for home cooks."><link rel="canonical" href="${url}"></head><body><img src="https://example.com/media/soup.webp" alt="Lemon soup"><a href="/recipes/">Recipes</a><a href="/tips/">Tips</a><script type="application/ld+json">{"@type":"Recipe"}</script></body></html>`;
  const audit = postPublishChecks({ html, status: 200, url, recipeAudit: { hasRecipeSchema: true } });
  assert.equal(audit.healthy, true);
  assert.equal(audit.score, 100);
});

test('GoHighLevel CSV exports split at the documented 90 row limit', () => {
  const rows = Array.from({ length: 181 }, (_, index) => [`row-${index}`]);
  const chunks = chunkRows(rows);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [90, 90, 1]);
  assert.match(numberedCsvPath('posts.csv', 1, 3), /part-02-of-03\.csv$/);
});

test('provider error logging removes secrets from messages and responses', () => {
  const error = new Error('Authorization: Bearer top-secret-token');
  error.response = { status: 401, data: { api_key: 'raw-key', message: 'token=hidden-value' } };
  const sanitized = sanitizeProviderError(error);
  const report = JSON.stringify(sanitized);
  assert.doesNotMatch(report, /top-secret-token|raw-key|hidden-value/);
  assert.match(report, /redacted/);
});

test('masked renderer credentials always resolve to the encrypted main-process secret', () => {
  const placeholder = '__CONTENT_STUDIO_SECRET_CONFIGURED__';
  assert.equal(resolveRendererSecret(placeholder, 'decrypted-token', placeholder), 'decrypted-token');
  assert.equal(resolveRendererSecret('', 'decrypted-token', placeholder), 'decrypted-token');
  assert.equal(resolveRendererSecret('fresh-token', 'decrypted-token', placeholder), 'fresh-token');

  const mainSource = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  assert.doesNotMatch(mainSource, /const apiToken = settings\??\.replicateApiToken/);
  assert.match(mainSource, /resolveReplicateApiToken\(settings\)/);
});

test('masked token recovery does not depend on the damaged credential still decrypting', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  const recoverySource = mainSource.slice(
    mainSource.indexOf('function recoverMaskedTokenArticleFailures()'),
    mainSource.indexOf('function initializePinReplicate()')
  );
  assert.doesNotMatch(recoverySource, /getDecryptedReplicateToken/);
  assert.match(recoverySource, /recoverMaskedTokenFailures/);
});

test('settings only reports an encrypted credential as configured after successful decryption', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
  const helperSource = mainSource.slice(
    mainSource.indexOf('function publicSecretValue('),
    mainSource.indexOf('function migrateLegacyPlaintextSecrets()')
  );
  assert.match(helperSource, /decryptSecret/);
  assert.match(helperSource, /!isSecretPlaceholder/);
});

test('masked-token 401 article failures return to the queue without losing article data', () => {
  const source = [{
    id: 'article-1',
    title: 'Keep this title',
    queueStatus: 'error',
    workflowStatus: 'failed',
    contentBrief: { audience: 'home cooks' },
    errorMessage: "Error invoking remote method 'generate-article': Error: Replicate 401: You did not pass a valid authentication token."
  }];
  const result = recoverMaskedTokenFailures(source);
  assert.equal(result.recovered, 1);
  assert.equal(result.articles[0].queueStatus, 'pending');
  assert.equal(result.articles[0].workflowStatus, 'queued');
  assert.equal(result.articles[0].title, 'Keep this title');
  assert.deepEqual(result.articles[0].contentBrief, source[0].contentBrief);
  assert.equal(result.articles[0].errorMessage, '');
});

test('Pinterest cluster source metadata supports Pinterest and destination URLs', () => {
  const html = `<!doctype html><html><head>
    <meta content="Fresh Lemon Chicken Recipe" property="og:title">
    <meta name="description" content="A bright skillet dinner with practical cooking tips.">
    <meta property="og:image" content="https://cdn.example.com/lemon-chicken.jpg">
    <meta property="pinterestapp:source" content="https://example.com/lemon-chicken/">
    <link href="https://www.pinterest.com/pin/123456/" rel="canonical">
  </head></html>`;
  const source = extractPinterestSourceMetadata(html, 'https://www.pinterest.com/pin/123456/', 200);
  assert.equal(source.title, 'Fresh Lemon Chicken Recipe');
  assert.equal(source.sourceType, 'pinterest-pin');
  assert.equal(source.destinationUrl, 'https://example.com/lemon-chicken/');
  assert.equal(source.imageUrl, 'https://cdn.example.com/lemon-chicken.jpg');

  const embedded = extractPinterestSourceMetadata(
    '<link rel="canonical" href="https://www.pinterest.com/pin/789/"><script>{"destination_url":"https:\\/\\/example.com\\/taco-bowls\\/"}</script>',
    'https://www.pinterest.com/pin/789/',
    200
  );
  assert.equal(embedded.destinationUrl, 'https://example.com/taco-bowls/');
});

test('Pinterest cluster plans keep coherent variants and only use allowed boards', () => {
  const context = {
    source: { title: 'Garlic Chicken Dinner', canonicalUrl: 'https://example.com/garlic-chicken/' },
    topic: 'Garlic Chicken Dinner',
    maxClusters: 5,
    boardNames: ['Easy Weeknight Dinners', 'Healthy Recipes', 'Dessert Ideas']
  };
  const fallback = fallbackPinterestClusterPlan(context);
  assert.ok(fallback.clusters.length >= 3 && fallback.clusters.length <= 5);
  assert.ok(fallback.clusters.every((cluster) => !cluster.board || context.boardNames.includes(cluster.board)));

  const normalized = normalizePinterestClusterPlan({
    topic: 'Garlic Chicken Dinner',
    clusters: [
      { label: 'Quick Garlic Chicken', role: 'core-depth', lifecycle: 'growing', board: 'Not A Real Board', keywords: ['quick garlic chicken'], pinIdeas: ['Quick Garlic Chicken Tonight'] },
      { label: 'Meal Prep Garlic Chicken', role: 'adjacent-discovery', lifecycle: 'established', board: 'Healthy Recipes', keywords: ['meal prep chicken'] },
      { label: 'Budget Garlic Chicken', role: 'frontier-test', lifecycle: 'emerging', board: 'Easy Weeknight Dinners', keywords: ['budget chicken dinner'] }
    ]
  }, context);
  assert.equal(normalized.clusters.length, 3);
  assert.ok(normalized.clusters.every((cluster) => !cluster.board || context.boardNames.includes(cluster.board)));
  assert.ok(normalized.clusters.every((cluster) => cluster.pinIdeas[0].title.length <= 95));
});

test('Pin queue preserves separate interest clusters for the same destination URL', () => {
  const items = dedupePinQueueItems([
    { url: 'https://example.com/lemon-chicken/', queueType: 'interest-cluster', clusterVariantId: 'quick', title: 'Quick Lemon Chicken' },
    { url: 'https://example.com/lemon-chicken/', queueType: 'interest-cluster', clusterVariantId: 'meal-prep', title: 'Meal Prep Lemon Chicken' },
    { url: 'https://example.com/lemon-chicken/', queueType: 'interest-cluster', clusterVariantId: 'quick', title: 'Updated Quick Lemon Chicken' }
  ]);
  assert.equal(items.length, 2);
  assert.ok(items.some((item) => item.clusterVariantId === 'quick' && item.title === 'Updated Quick Lemon Chicken'));
  assert.ok(items.some((item) => item.clusterVariantId === 'meal-prep'));
});
