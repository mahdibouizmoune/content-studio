const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

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
