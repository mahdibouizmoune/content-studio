function cleanText(value, maxLength = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function safePublicUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function isImpactTrackingUrl(value) {
  const url = safePublicUrl(value);
  if (!url) return false;
  const host = new URL(url).hostname.toLowerCase();
  const impactTrackingDomains = [
    'pxf.io',
    'sjv.io',
    'jdoqocy.com',
    'tkqlhce.com',
    'anrdoezrs.net',
    'dpbolvw.net',
    'kqzyfj.com'
  ];
  return impactTrackingDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function impactTrackingInfo(value) {
  const url = safePublicUrl(value);
  if (!url || !isImpactTrackingUrl(url)) return { verified: false, partnerId: '' };
  const parsed = new URL(url);
  const partnerMatch = parsed.pathname.match(/^\/c\/([^/]+)/i);
  return {
    verified: true,
    partnerId: cleanText(partnerMatch?.[1] || '', 100)
  };
}

function firstValue(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') {
      return source[key];
    }
  }
  return '';
}

function extractImpactItems(payload) {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.Items,
    payload?.items,
    payload?.Records,
    payload?.records,
    payload?.CatalogItems,
    payload?.catalogItems,
    payload?._embedded?.items,
    payload?._embedded?.Items
  ];
  const list = candidates.find(Array.isArray);
  if (list) return list;
  if (payload && typeof payload === 'object' && (
    payload.CatalogItemId || payload.catalogItemId || payload.CampaignId || payload.campaignId
  )) return [payload];
  return [];
}

function normalizeImpactProduct(item = {}, index = 0) {
  const campaignId = cleanText(firstValue(item, ['CampaignId', 'campaignId', 'ProgramId', 'programId']), 100);
  const catalogId = cleanText(firstValue(item, ['CatalogId', 'catalogId']), 100);
  const catalogItemId = cleanText(firstValue(item, ['CatalogItemId', 'catalogItemId', 'ItemId', 'itemId', 'Id', 'id']), 160);
  const name = cleanText(firstValue(item, ['Name', 'name', 'Title', 'title']), 220);
  const url = safePublicUrl(firstValue(item, ['Url', 'URL', 'url', 'ProductUrl', 'productUrl', 'LandingPageUrl']));
  const imageUrl = safePublicUrl(firstValue(item, ['ImageUrl', 'ImageURL', 'imageUrl', 'ImageUri', 'imageUri']));
  const labelsValue = firstValue(item, ['Labels', 'labels', 'Tags', 'tags']);
  const labels = (Array.isArray(labelsValue) ? labelsValue : String(labelsValue || '').split(/[;,|]/))
    .map((label) => cleanText(label, 80))
    .filter(Boolean)
    .slice(0, 20);

  return {
    id: catalogItemId || `${campaignId || catalogId || 'impact'}-${index + 1}`,
    catalogItemId,
    catalogId,
    campaignId,
    campaignName: cleanText(firstValue(item, ['CampaignName', 'campaignName', 'ProgramName', 'programName']), 180),
    name: name || 'Impact product',
    description: cleanText(firstValue(item, ['Description', 'description']), 1000),
    url,
    imageUrl,
    currentPrice: cleanText(firstValue(item, ['CurrentPrice', 'currentPrice', 'Price', 'price']), 50),
    originalPrice: cleanText(firstValue(item, ['OriginalPrice', 'originalPrice', 'ListPrice', 'listPrice', 'RegularPrice', 'regularPrice']), 50),
    discountPercentage: cleanText(firstValue(item, ['DiscountPercentage', 'discountPercentage', 'DiscountPercent', 'discountPercent']), 20),
    currency: cleanText(firstValue(item, ['Currency', 'currency', 'CurrencyCode', 'currencyCode']), 12),
    stockAvailability: cleanText(firstValue(item, ['StockAvailability', 'stockAvailability', 'Availability', 'availability']), 80),
    category: cleanText(firstValue(item, ['Category', 'category', 'CategoryPath', 'categoryPath']), 240),
    manufacturer: cleanText(firstValue(item, ['Manufacturer', 'manufacturer', 'Brand', 'brand']), 160),
    labels
  };
}

function buildImpactKeywords(product = {}) {
  const phrases = [
    product.name,
    product.manufacturer,
    product.category,
    ...(Array.isArray(product.labels) ? product.labels : [])
  ];
  const seen = new Set();
  const result = [];

  for (const phrase of phrases) {
    const cleaned = cleanText(phrase, 160);
    if (!cleaned) continue;
    const parts = [cleaned, ...cleaned.split(/[>\/|,;:]+/)];
    for (const part of parts) {
      const keyword = cleanText(part, 100);
      const key = keyword.toLowerCase();
      if (keyword.length < 3 || seen.has(key)) continue;
      seen.add(key);
      result.push(keyword);
      if (result.length >= 20) return result;
    }
  }
  return result;
}

function affiliateDisplayName(value = '') {
  const full = cleanText(value, 160);
  if (full.length <= 100) return full;
  const firstPhrase = cleanText(full.split(/\s+[|-]\s+|,/)[0], 100);
  return firstPhrase.split(/\s+/).length >= 3 ? firstPhrase : `${full.slice(0, 97).trim()}...`;
}

function buildImpactAffiliateItem(product = {}, trackingUrl = '', tracking = {}) {
  const url = safePublicUrl(trackingUrl);
  if (!url) throw new Error('Impact did not return a valid tracking URL.');
  const name = affiliateDisplayName(product.name) || 'Impact product';
  const trackingInfo = impactTrackingInfo(url);
  return {
    id: `impact-${cleanText(product.catalogItemId || product.id || Date.now(), 120)}`,
    name,
    url,
    keywords: buildImpactKeywords(product),
    anchorText: name,
    enabled: true,
    source: 'impact',
    impactCampaignId: cleanText(product.campaignId, 100),
    impactCampaignName: cleanText(product.campaignName, 180),
    impactCatalogId: cleanText(product.catalogId, 100),
    impactCatalogItemId: cleanText(product.catalogItemId || product.id, 160),
    imageUrl: safePublicUrl(product.imageUrl),
    currentPrice: cleanText(product.currentPrice, 50),
    originalPrice: cleanText(product.originalPrice, 50),
    discountPercentage: cleanText(product.discountPercentage, 20),
    currency: cleanText(product.currency, 12),
    stockAvailability: cleanText(product.stockAvailability, 80),
    manufacturer: cleanText(product.manufacturer, 160),
    productDescription: cleanText(product.description, 1000),
    trackingVerified: tracking.generatedByImpactApi === true || trackingInfo.verified,
    trackingPartnerId: cleanText(tracking.partnerId || trackingInfo.partnerId, 100),
    trackingSubId: cleanText(tracking.subId, 100),
    trackingSharedId: cleanText(tracking.sharedId, 100),
    trackingCreatedAt: cleanText(tracking.createdAt, 60),
    trackingSource: cleanText(tracking.source || (trackingInfo.verified ? 'impact_tracking_url' : ''), 60)
  };
}

module.exports = {
  affiliateDisplayName,
  buildImpactAffiliateItem,
  buildImpactKeywords,
  extractImpactItems,
  impactTrackingInfo,
  isImpactTrackingUrl,
  normalizeImpactProduct,
  safePublicUrl
};
