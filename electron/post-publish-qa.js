const { parseDocument } = require('htmlparser2');
const { selectAll, selectOne } = require('css-select');
const { textContent, removeElement } = require('domutils');
const rules = require('./assets/editorial-rules.json');
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
  const document = parseDocument(source);
  const scope = selectOne('article', document) || selectOne('main', document) || document;
  for (const node of selectAll('nav,header,footer,script,style', scope)) removeElement(node);
  const visible = textContent(scope).replace(/\s+/g, ' ');
  const internal = new Set(selectAll('a[href]', scope).flatMap(node => {
    try {
      const target = new URL(node.attribs.href, url), current = new URL(url);
      return target.origin === current.origin && target.pathname.replace(/\/$/, '') !== current.pathname.replace(/\/$/, '') ? [target.origin + target.pathname] : [];
    } catch { return []; }
  }));
  const checks = [
    { id: 'http', label: 'Public page responds successfully', ok: status >= 200 && status < 400 },
    { id: 'canonical', label: 'Canonical URL points to this article', ok: Boolean(canonical) && canonical.replace(/\/$/, '') === text(url).replace(/\/$/, '') },
    { id: 'title', label: 'Page title is present', ok: /<title>[^<]{8,}<\/title>/i.test(source) },
    { id: 'description', label: 'Meta description is present', ok: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{50,}/i.test(source) || /<meta[^>]+content=["'][^"']{50,}["'][^>]+name=["']description["']/i.test(source) },
    { id: 'recipe', label: 'Recipe schema is visible', ok: recipeAudit.hasRecipeSchema === true || /["']@type["']\s*:\s*["']Recipe["']/i.test(source) },
    { id: 'image', label: 'Article contains a public image', ok: /<img[^>]+src=["']https?:\/\//i.test(source) },
    { id: 'internal-links', label: 'Article contains contextual internal links', ok: internal.size >= 1 },
    { id: 'reader-copy', label: 'Reader copy contains no generation instructions', ok: !rules.promptLeakPatterns.some(pattern => new RegExp(pattern, 'i').test(visible)) },
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
