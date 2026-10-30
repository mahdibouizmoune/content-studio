'use strict';

function configuredWindowsPublisherNames(metadata = {}) {
  const configured = metadata?.build?.win?.publisherName || metadata?.windowsPublisherNames;
  return (Array.isArray(configured) ? configured : [configured])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function normalizeUpdateFeedUrl(value = '') {
  try {
    const parsed = new URL(String(value || '').trim());
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || !host || parsed.username || parsed.password) return '';
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return '';
    if (/^(?:10|127)\./.test(host)
      || /^192\.168\./.test(host)
      || /^169\.254\./.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

module.exports = { configuredWindowsPublisherNames, normalizeUpdateFeedUrl };
