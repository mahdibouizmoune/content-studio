'use strict';

function normalizedHostname(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    const normalized = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed.replace(/^\/\//, '')}`;
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function findMatchingWordPressSite(sites = [], destinationUrl = '') {
  const destinationHost = normalizedHostname(destinationUrl);
  if (!destinationHost) return null;
  const location = (value) => new URL(/^https?:\/\//i.test(String(value).trim()) ? String(value).trim() : `https://${String(value).trim().replace(/^\/\//, '')}`);
  const destination = location(destinationUrl);
  return (Array.isArray(sites) ? sites : []).filter((site) => (
    normalizedHostname(site?.url) === destinationHost
    && String(site?.username || '').trim()
    && (String(site?.apiKey_encrypted || '').trim() || String(site?.apiKey || '').trim())
  )).filter((site) => {
    const base = location(site.url);
    const prefix = base.pathname.replace(/\/+$/, '');
    return base.port === destination.port
      && (destination.pathname === prefix || destination.pathname.startsWith(`${prefix}/`));
  }).sort((a, b) => location(b.url).pathname.length - location(a.url).pathname.length)[0] || null;
}

function resolvePinterestExportHost(requested = 'auto', sites = [], destinationUrl = '') {
  if (['wordpress', 'imgbb', 'replicate', 'resilient'].includes(requested)) return requested;
  return findMatchingWordPressSite(sites, destinationUrl) ? 'wordpress' : 'auto';
}

module.exports = {
  findMatchingWordPressSite,
  normalizedHostname,
  resolvePinterestExportHost
};
