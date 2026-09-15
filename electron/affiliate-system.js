const { isImpactTrackingUrl } = require('./impact-affiliate');
const {
  extractAmazonAsin,
  isAmazonTaggedUrl,
  normalizeAmazonMarketplace,
  normalizeAmazonPartnerTag
} = require('./amazon-affiliate');

function hasStoredSecret(settings = {}, publicKey, encryptedKey) {
  return Boolean(String(settings[publicKey] || '').trim() || String(settings[encryptedKey] || '').trim());
}

function normalizeAffiliateLibrary(items = [], settings = {}) {
  const partnerTag = normalizeAmazonPartnerTag(settings.amazonPartnerTag || '');
  const marketplace = normalizeAmazonMarketplace(settings.amazonMarketplace || 'www.amazon.com');
  return (Array.isArray(items) ? items : []).map((input, index) => {
    const item = input && typeof input === 'object' ? { ...input } : {};
    const url = String(item.url || '').trim();
    const source = String(item.source || '').trim().toLowerCase();

    if ((source === 'impact' || !source) && isImpactTrackingUrl(url)) {
      return {
        ...item,
        id: String(item.id || `impact-${index + 1}`).slice(0, 100),
        source: 'impact',
        trackingVerified: true,
        trackingSource: String(item.trackingSource || 'verified_impact_tracking_domain').slice(0, 60)
      };
    }

    const asin = extractAmazonAsin(url || item.amazonAsin || '');
    const tagged = Boolean(partnerTag && isAmazonTaggedUrl(url, partnerTag));
    if ((source === 'amazon' || asin) && asin && tagged) {
      return {
        ...item,
        id: String(item.id || `amazon-${asin}`).slice(0, 100),
        source: 'amazon',
        amazonAsin: asin,
        amazonPartnerTag: partnerTag,
        amazonMarketplace: marketplace,
        amazonLinkType: 'product',
        trackingVerified: true,
        trackingSource: String(item.trackingSource || 'verified_amazon_product_link').slice(0, 60)
      };
    }

    return item;
  });
}

function affiliateProviderReadiness(settings = {}) {
  const library = normalizeAffiliateLibrary(settings.affiliateLinks, settings);
  const impactReady = Boolean(
    String(settings.impactAccountSid || '').trim()
    && hasStoredSecret(settings, 'impactAuthToken', 'impactAuthToken_encrypted')
  );
  const partnerTag = normalizeAmazonPartnerTag(settings.amazonPartnerTag || '');
  const amazonApiReady = Boolean(
    partnerTag
    && String(settings.amazonCredentialId || '').trim()
    && hasStoredSecret(settings, 'amazonCredentialSecret', 'amazonCredentialSecret_encrypted')
  );
  const exactAmazonProducts = library.filter((item) =>
    item?.enabled !== false
    && item?.source === 'amazon'
    && item?.trackingVerified === true
    && item?.amazonLinkType === 'product'
    && /^[A-Z0-9]{10}$/i.test(String(item.amazonAsin || ''))
  ).length;

  return {
    impact: impactReady,
    amazon: Boolean(partnerTag && (amazonApiReady || exactAmazonProducts > 0)),
    amazonApi: amazonApiReady,
    exactAmazonProducts
  };
}

function affiliateProviderOrder(settings = {}) {
  const selected = ['impact', 'amazon', 'both'].includes(settings.affiliateProvider)
    ? settings.affiliateProvider
    : 'impact';
  const readiness = affiliateProviderReadiness(settings);
  if (selected === 'both') {
    return ['impact', 'amazon'].filter((provider) => readiness[provider]);
  }
  if (readiness[selected]) return [selected];
  if (settings.affiliateProviderFallback === false) return [];
  const fallback = selected === 'impact' ? 'amazon' : 'impact';
  return readiness[fallback] ? [fallback] : [];
}

module.exports = {
  affiliateProviderOrder,
  affiliateProviderReadiness,
  normalizeAffiliateLibrary
};
