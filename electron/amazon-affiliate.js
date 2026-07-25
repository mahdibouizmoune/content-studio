const MARKETPLACES = {
  'www.amazon.com': { label: 'United States', region: 'NA', currency: 'USD' },
  'www.amazon.ca': { label: 'Canada', region: 'NA', currency: 'CAD' },
  'www.amazon.com.mx': { label: 'Mexico', region: 'NA', currency: 'MXN' },
  'www.amazon.com.br': { label: 'Brazil', region: 'NA', currency: 'BRL' },
  'www.amazon.co.uk': { label: 'United Kingdom', region: 'EU', currency: 'GBP' },
  'www.amazon.de': { label: 'Germany', region: 'EU', currency: 'EUR' },
  'www.amazon.fr': { label: 'France', region: 'EU', currency: 'EUR' },
  'www.amazon.it': { label: 'Italy', region: 'EU', currency: 'EUR' },
  'www.amazon.es': { label: 'Spain', region: 'EU', currency: 'EUR' },
  'www.amazon.nl': { label: 'Netherlands', region: 'EU', currency: 'EUR' },
  'www.amazon.com.be': { label: 'Belgium', region: 'EU', currency: 'EUR' },
  'www.amazon.ie': { label: 'Ireland', region: 'EU', currency: 'EUR' },
  'www.amazon.pl': { label: 'Poland', region: 'EU', currency: 'PLN' },
  'www.amazon.se': { label: 'Sweden', region: 'EU', currency: 'SEK' },
  'www.amazon.com.tr': { label: 'Turkey', region: 'EU', currency: 'TRY' },
  'www.amazon.in': { label: 'India', region: 'EU', currency: 'INR' },
  'www.amazon.ae': { label: 'United Arab Emirates', region: 'EU', currency: 'AED' },
  'www.amazon.sa': { label: 'Saudi Arabia', region: 'EU', currency: 'SAR' },
  'www.amazon.eg': { label: 'Egypt', region: 'EU', currency: 'EGP' },
  'www.amazon.co.jp': { label: 'Japan', region: 'FE', currency: 'JPY' },
  'www.amazon.com.au': { label: 'Australia', region: 'FE', currency: 'AUD' },
  'www.amazon.sg': { label: 'Singapore', region: 'FE', currency: 'SGD' }
};

function cleanText(value, maxLength = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeAmazonMarketplace(value = '') {
  const raw = cleanText(value, 120).toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  return MARKETPLACES[raw] ? raw : 'www.amazon.com';
}

function amazonMarketplaceInfo(value = '') {
  const marketplace = normalizeAmazonMarketplace(value);
  return { marketplace, ...MARKETPLACES[marketplace] };
}

function normalizeAmazonPartnerTag(value = '') {
  const tag = cleanText(value, 100);
  return /^[a-z0-9][a-z0-9_-]{1,78}[a-z0-9]$/i.test(tag) ? tag : '';
}

function safeAmazonUrl(value = '') {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:') return '';
    const host = parsed.hostname.toLowerCase();
    const isMarketplace = Object.keys(MARKETPLACES).some((marketplace) =>
      host === marketplace || host === marketplace.replace(/^www\./, '')
    );
    return isMarketplace ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function buildAmazonSearchUrl(query, partnerTag, marketplace = 'www.amazon.com') {
  const tag = normalizeAmazonPartnerTag(partnerTag);
  const market = normalizeAmazonMarketplace(marketplace);
  const keyword = cleanText(query, 100);
  if (!tag || !keyword) return '';
  const url = new URL(`https://${market}/s`);
  url.searchParams.set('k', keyword);
  url.searchParams.set('tag', tag);
  return url.toString();
}

function extractAmazonAsin(value = '') {
  const raw = cleanText(value, 2000);
  if (/^[A-Z0-9]{10}$/i.test(raw)) return raw.toUpperCase();
  const url = safeAmazonUrl(raw);
  if (!url) return '';
  const parsed = new URL(url);
  const pathMatch = parsed.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  const queryAsin = parsed.searchParams.get('asin') || '';
  return String(pathMatch?.[1] || (/^[A-Z0-9]{10}$/i.test(queryAsin) ? queryAsin : '')).toUpperCase();
}

function buildAmazonProductUrl(value, partnerTag, marketplace = 'www.amazon.com') {
  const asin = extractAmazonAsin(value);
  const tag = normalizeAmazonPartnerTag(partnerTag);
  if (!asin) throw new Error('Enter a direct Amazon product URL or a valid 10-character ASIN.');
  if (!tag) throw new Error('Add a valid Amazon Associates tracking ID.');
  const suppliedUrl = safeAmazonUrl(value);
  const market = suppliedUrl
    ? normalizeAmazonMarketplace(new URL(suppliedUrl).hostname)
    : normalizeAmazonMarketplace(marketplace);
  const url = new URL(`https://${market}/dp/${asin}`);
  url.searchParams.set('tag', tag);
  return url.toString();
}

function isAmazonTaggedUrl(value = '', expectedTag = '') {
  const url = safeAmazonUrl(value);
  if (!url) return false;
  const tag = normalizeAmazonPartnerTag(new URL(url).searchParams.get('tag'));
  const expected = normalizeAmazonPartnerTag(expectedTag);
  return Boolean(tag && (!expected || tag.toLowerCase() === expected.toLowerCase()));
}

function extractAmazonItems(payload = {}) {
  const candidates = [
    payload?.searchResult?.items,
    payload?.itemsResult?.items,
    payload?.SearchResult?.Items,
    payload?.ItemsResult?.Items,
    payload?.items
  ];
  return candidates.find(Array.isArray) || [];
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || '';
}

function normalizeAmazonProduct(item = {}, index = 0) {
  const title = cleanText(firstValue(
    item?.itemInfo?.title?.displayValue,
    item?.ItemInfo?.Title?.DisplayValue,
    item?.title,
    item?.name
  ), 220);
  const imageUrl = cleanText(firstValue(
    item?.images?.primary?.large?.url,
    item?.images?.primary?.medium?.url,
    item?.Images?.Primary?.Large?.URL,
    item?.Images?.Primary?.Medium?.URL
  ), 2000);
  const listing = firstValue(item?.offersV2?.listings?.[0], item?.OffersV2?.Listings?.[0]) || {};
  const price = firstValue(listing?.price?.money, listing?.Price?.Money) || {};
  const savingBasis = firstValue(listing?.price?.savingBasis?.money, listing?.Price?.SavingBasis?.Money) || {};
  const savings = firstValue(listing?.price?.savings, listing?.Price?.Savings) || {};
  const browseNodes = firstValue(item?.browseNodeInfo?.browseNodes, item?.BrowseNodeInfo?.BrowseNodes) || [];
  const category = cleanText(browseNodes?.[0]?.contextFreeName || browseNodes?.[0]?.displayName || '', 240);
  const manufacturer = cleanText(firstValue(
    item?.itemInfo?.byLineInfo?.brand?.displayValue,
    item?.itemInfo?.byLineInfo?.manufacturer?.displayValue,
    item?.ItemInfo?.ByLineInfo?.Brand?.DisplayValue
  ), 160);
  const detailPageUrl = safeAmazonUrl(firstValue(item?.detailPageURL, item?.DetailPageURL, item?.url));

  return {
    id: cleanText(firstValue(item?.asin, item?.ASIN, `amazon-${index + 1}`), 100),
    asin: cleanText(firstValue(item?.asin, item?.ASIN), 40),
    name: title || 'Amazon product',
    url: detailPageUrl,
    imageUrl: /^https:\/\/(?:m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)\//i.test(imageUrl) ? imageUrl : '',
    manufacturer,
    category,
    currentPrice: cleanText(firstValue(price?.amount, price?.displayAmount), 50),
    originalPrice: cleanText(firstValue(savingBasis?.amount, savingBasis?.displayAmount), 50),
    discountPercentage: cleanText(firstValue(savings?.percentage, savings?.Percentage), 20),
    currency: cleanText(firstValue(price?.currency, price?.Currency), 12),
    priceUpdatedAt: new Date().toISOString()
  };
}

function amazonKeywords(product = {}, extraTerms = []) {
  return [...new Set([
    product.name,
    product.manufacturer,
    product.category,
    ...extraTerms
  ].map((value) => cleanText(value, 100)).filter((value) => value.length >= 3))].slice(0, 50);
}

function buildAmazonAffiliateItem(product = {}, options = {}) {
  const partnerTag = normalizeAmazonPartnerTag(options.partnerTag);
  const url = safeAmazonUrl(product.url);
  if (!partnerTag || !isAmazonTaggedUrl(url, partnerTag)) {
    throw new Error('Amazon did not return a link tagged to this Associates tracking ID.');
  }
  const asin = cleanText(product.asin, 40);
  return {
    id: `amazon-${asin || cleanText(options.query, 80).replace(/[^a-z0-9]+/gi, '-')}`,
    name: cleanText(product.name || `Shop ${options.query} on Amazon`, 160),
    url,
    keywords: amazonKeywords(product, options.matchTerms || []),
    anchorText: cleanText(product.name || options.query, 160),
    enabled: true,
    source: 'amazon',
    imageUrl: cleanText(product.imageUrl, 2000),
    manufacturer: cleanText(product.manufacturer || 'Amazon', 160),
    amazonAsin: asin,
    amazonPartnerTag: partnerTag,
    amazonMarketplace: normalizeAmazonMarketplace(options.marketplace),
    amazonLinkType: asin ? 'product' : 'search',
    trackingVerified: true,
    trackingSource: cleanText(options.trackingSource || (asin ? 'amazon_creators_api' : 'amazon_tagged_search'), 60),
    discoveryScore: Math.max(0, Number(options.discoveryScore || 100)),
    discoveryReason: cleanText(options.discoveryReason, 300),
    priceUpdatedAt: cleanText(product.priceUpdatedAt, 60)
  };
}

function buildAmazonManualAffiliate(product = {}, options = {}) {
  const asin = extractAmazonAsin(product.urlOrAsin || product.url || product.asin);
  const url = buildAmazonProductUrl(
    product.urlOrAsin || product.url || asin,
    options.partnerTag,
    options.marketplace
  );
  const name = cleanText(product.name, 160);
  if (name.length < 3) throw new Error('Enter the exact product name.');
  const keywords = Array.isArray(product.keywords)
    ? product.keywords
    : String(product.keywords || '').split(/[,\n]/);
  const cleanKeywords = keywords.map((keyword) => cleanText(keyword, 100)).filter((keyword) => keyword.length >= 3);
  if (!cleanKeywords.length) throw new Error('Add at least one match term, such as cast iron skillet or food scale.');
  return buildAmazonAffiliateItem({
    asin,
    name,
    url,
    manufacturer: 'Amazon'
  }, {
    ...options,
    matchTerms: cleanKeywords,
    query: cleanKeywords[0],
    discoveryScore: 0,
    discoveryReason: 'Exact Amazon product saved by the publisher.',
    trackingSource: 'amazon_manual_product'
  });
}

function buildAmazonSearchAffiliate(query, options = {}) {
  const marketplace = normalizeAmazonMarketplace(options.marketplace);
  const url = buildAmazonSearchUrl(query, options.partnerTag, marketplace);
  return buildAmazonAffiliateItem({
    id: cleanText(query, 80).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''),
    name: `Shop ${cleanText(query, 100)} on Amazon`,
    url,
    manufacturer: 'Amazon'
  }, {
    ...options,
    marketplace,
    query
  });
}

function amazonTokenEndpoint(version = '2.1', marketplace = 'www.amazon.com') {
  if (String(version).startsWith('3')) return 'https://api.amazon.com/auth/o2/token';
  const region = amazonMarketplaceInfo(marketplace).region;
  const awsRegion = region === 'NA' ? 'us-east-1' : region === 'FE' ? 'us-west-2' : 'eu-west-1';
  return `https://creatorsapi.auth.${awsRegion}.amazoncognito.com/oauth2/token`;
}

module.exports = {
  MARKETPLACES,
  amazonMarketplaceInfo,
  amazonTokenEndpoint,
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
  normalizeAmazonProduct,
  safeAmazonUrl
};
