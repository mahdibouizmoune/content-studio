const IMAGE_HOST_PATTERNS = [
  /(^|\.)ibb\.co$/i,
  /(^|\.)imgbb\.com$/i,
  /(^|\.)replicate\.delivery$/i,
  /(^|\.)cloudinary\.com$/i
];

const IMAGE_PATH_PATTERN = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)(\?.*)?$/i;
const ADMIN_PATH_PATTERN = /\/(wp-admin|wp-login\.php|admin|dashboard)(\/|$)/i;

function slugifyUtmValue(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.slice(0, 120) || 'content';
}

function normalizePlatform(platform = '') {
  const source = slugifyUtmValue(platform || 'social');
  if (source === 'ig') return 'instagram';
  if (source === 'fb') return 'facebook';
  if (source.includes('mailchimp')) return 'mailchimp';
  if (source.includes('google')) return 'google';
  if (source.includes('facebook')) return 'facebook';
  if (source.includes('instagram')) return 'instagram';
  return source;
}

function utmMediumFor(platform = '', trafficType = '') {
  const source = normalizePlatform(platform);
  const type = slugifyUtmValue(trafficType || '');
  if (type.includes('paid_social') || (type.includes('paid') && type.includes('social')) || type.includes('social_ad')) return 'paid_social';
  if (type.includes('cpc') || type.includes('paid_search') || type.includes('google_ad')) return 'cpc';
  if (type.includes('email') || type.includes('newsletter') || source === 'mailchimp' || source === 'email') return 'email';
  if (type.includes('referral') || type.includes('partner')) return 'referral';
  if (source === 'google') return 'cpc';
  return 'social';
}

function isUtmEligibleDestination(url = '') {
  const text = String(url || '').trim();
  if (!text) return false;
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
    if (IMAGE_HOST_PATTERNS.some((pattern) => pattern.test(host))) return false;
    if (IMAGE_PATH_PATTERN.test(parsed.pathname)) return false;
    if (ADMIN_PATH_PATTERN.test(parsed.pathname)) return false;
    if (host.startsWith('api.') || parsed.pathname.includes('/wp-json/')) return false;
    return true;
  } catch {
    return false;
  }
}

function addUtmParams(url, platform, campaignTitle, contentId, trafficType = 'organic_social') {
  const original = String(url || '').trim();
  if (!isUtmEligibleDestination(original)) return original;
  const parsed = new URL(original);
  const source = normalizePlatform(platform);
  const campaign = slugifyUtmValue(campaignTitle || parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname);
  const content = slugifyUtmValue(contentId || 'link_1');
  parsed.searchParams.set('utm_source', source);
  parsed.searchParams.set('utm_medium', utmMediumFor(source, trafficType));
  parsed.searchParams.set('utm_campaign', campaign);
  parsed.searchParams.set('utm_content', content);
  return parsed.href;
}

module.exports = {
  addUtmParams,
  isUtmEligibleDestination,
  slugifyUtmValue,
  utmMediumFor
};
