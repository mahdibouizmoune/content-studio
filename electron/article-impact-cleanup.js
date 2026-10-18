'use strict';

const { isImpactTrackingUrl } = require('./impact-affiliate');

function removeArticleImpact(article = {}, library = []) {
  const links = [...(article.affiliateLinks || []), ...library];
  const ids = new Set(links.filter((item) => item.id && (item.source === 'impact' || isImpactTrackingUrl(item.url))).map((item) => String(item.id)));
  const impactAnchor = (tag) => {
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    const id = tag.match(/\bdata-affiliate-id=["']([^"']+)["']/i)?.[1] || '';
    return ids.has(id) || isImpactTrackingUrl(href.replace(/&amp;/gi, '&'));
  };
  let content = String(article.content || '').replace(/<aside\b[^>]*data-affiliate-recommendation=["']true["'][^>]*>[\s\S]*?<\/aside>/gi,
    (box) => [...box.matchAll(/<a\b[^>]*>/gi)].some(([tag]) => impactAnchor(tag)) ? '' : box);
  content = content.replace(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi, (all, tag, body) => impactAnchor(tag) ? body : all);
  const remaining = (article.affiliateLinks || []).filter((item) => item.source !== 'impact' && !ids.has(String(item.id)) && !isImpactTrackingUrl(item.url));
  if (!/data-affiliate-id=/i.test(content)) content = content.replace(/<p\b[^>]*data-affiliate-disclosure=["']true["'][^>]*>[\s\S]*?<\/p>\s*/gi, '');
  return { ...article, content, affiliateLinks: remaining, affiliateDisclosureApplied: /data-affiliate-id=/i.test(content) };
}

module.exports = { removeArticleImpact };
