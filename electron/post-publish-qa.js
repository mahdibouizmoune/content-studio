function text(value) {
  return String(value || '');
}

function hasTemporaryMedia(html = '') {
  return /replicate\.delivery|replicate\.com\/api|localhost|127\.0\.0\.1|file:\/\//i.test(text(html));
}

function canonicalUrl(html = '') {
  return text(html).match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]
    || text(html).match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
    || '';
}

function postPublishChecks({ html = '', status = 0, url = '', recipeAudit = {} } = {}) {
  const source = text(html);
  const canonical = canonicalUrl(source);
  const checks = [
    { id: 'http', label: 'Public page responds successfully', ok: status >= 200 && status < 400 },
    { id: 'canonical', label: 'Canonical URL points to this article', ok: Boolean(canonical) && canonical.replace(/\/$/, '') === text(url).replace(/\/$/, '') },
    { id: 'title', label: 'Page title is present', ok: /<title>[^<]{8,}<\/title>/i.test(source) },
    { id: 'description', label: 'Meta description is present', ok: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{50,}/i.test(source) || /<meta[^>]+content=["'][^"']{50,}["'][^>]+name=["']description["']/i.test(source) },
    { id: 'recipe', label: 'Recipe schema is visible', ok: recipeAudit.hasRecipeSchema === true || /["']@type["']\s*:\s*["']Recipe["']/i.test(source) },
    { id: 'image', label: 'Article contains a public image', ok: /<img[^>]+src=["']https?:\/\//i.test(source) },
    { id: 'internal-links', label: 'Article contains internal links', ok: (source.match(/<a\s[^>]*href=/gi) || []).length >= 2 },
    { id: 'durable-media', label: 'Article uses durable media URLs', ok: !hasTemporaryMedia(source) }
  ];
  const passed = checks.filter((check) => check.ok).length;
  return {
    url: text(url),
    status,
    canonical,
    checks,
    score: Math.round((passed / checks.length) * 100),
    passed,
    total: checks.length,
    healthy: passed === checks.length,
    checkedAt: new Date().toISOString()
  };
}

module.exports = { canonicalUrl, hasTemporaryMedia, postPublishChecks };
