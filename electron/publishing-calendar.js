'use strict';
const { canonicalArticle } = require('./pin-scheduler');
function utcDate(value, csv = false) {
  let input = String(value || '').trim();
  if (csv && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(input)) input = input.replace(' ', 'T') + 'Z';
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(input)) return '';
  const time = Date.parse(input); return Number.isFinite(time) ? new Date(time).toISOString() : '';
}
function urlKey(value) { try { return canonicalArticle(value); } catch { return ''; } }
function buildPublishingCalendar({ articles = [], pins = [], batches = [], ghl = [], wordpress = [] }) {
  const articleMap = new Map(articles.map(a => [String(a.id), a]));
  const pinMap = new Map(pins.map(p => [String(p.id), p]));
  function owner(id, url) {
    if (id && articleMap.has(String(id))) return articleMap.get(String(id));
    const key = urlKey(url), matches = key ? articles.filter(a => [a.wordpressPostUrl, a.sourceUrl].some(u => urlKey(u) === key)) : [];
    return matches.length === 1 ? matches[0] : null;
  }
  const events = [];
  function add(event, article) {
    events.push({ ...event, articleId: article?.id || '', title: article?.generatedTitle || article?.title || event.title || 'Unlinked content', siteId: article?.wordpressSiteId || '', date: utcDate(event.date, event.source === 'pinterest-csv') });
  }
  for (const receipt of wordpress) add({ id: `wp:${receipt.identity || receipt.postId}`, platform: 'WordPress', source: 'wordpress-receipt', title: receipt.slug, status: receipt.status || 'unknown', date: receipt.scheduledAt || receipt.createdAt, evidence: receipt.status === 'unknown' ? 'Unresolved publication' : 'WordPress response recorded', remoteId: String(receipt.postId || '') }, owner(receipt.articleId, receipt.postUrl));
  for (const batch of batches.filter(b => b.fileStatus !== 'failed')) {
    for (const row of batch.rows || []) {
      const pin = pinMap.get(String(row.pinId)), outcome = batch.outcomes?.[row.number]?.status || 'pending';
      add({ id: `csv:${batch.id}:${row.number}`, platform: 'Pinterest', source: 'pinterest-csv', title: row.cells?.[0], status: outcome !== 'pending' ? outcome : batch.fileStatus === 'preparing' ? 'export-in-progress' : batch.fileStatus === 'partial' ? 'partial-export-unconfirmed' : 'exported-unconfirmed', date: row.cells?.[6], evidence: outcome === 'confirmed' ? 'User-reported Pinterest import result' : outcome === 'failed' ? 'Reported failed import' : 'CSV export is not an import confirmation', remoteId: '' }, owner(pin?.articleId || pin?.sourceSnapshot?.articleId, row.cells?.[5]));
    }
  }
  const exportedPins = new Set(batches.filter(b => b.fileStatus !== 'failed').flatMap(b => (b.rows || []).map(row => String(row.pinId))));
  for (const pin of pins.filter(p => p.csvPublishDate && !exportedPins.has(String(p.id)))) add({ id: `pin:${pin.id}`, platform: 'Pinterest', source: 'pin-draft', title: pin.title, status: 'planned-not-exported', date: pin.csvPublishDate, evidence: 'Local Pin schedule only', remoteId: '' }, owner(pin.articleId, pin.url));
  for (const receipt of ghl) add({ id: `ghl:${receipt.id || receipt.idempotencyKey}`, platform: receipt.platform || 'Meta', source: 'ghl-receipt', title: receipt.caption?.slice(0, 100), status: receipt.status || 'unknown', date: receipt.scheduleDate, evidence: receipt.verified ? 'GHL read-back verified' : 'Unverified GHL result', remoteId: String(receipt.postId || '') }, owner(receipt.articleId, receipt.destinationUrl));
  return events.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.id.localeCompare(b.id));
}
module.exports = { buildPublishingCalendar, utcDate };
