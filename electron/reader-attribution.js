'use strict';
const { analyticsConfig, articleUrl } = require('./google-analytics');
const UNKNOWN = new Set(['', '(not set)', '(data not available)']);
function readerAttribution({ settings = {}, analytics, events, batches = [], now = Date.now() }) {
  let config;
  try { config = analyticsConfig(settings); } catch { return { available: false, rows: [], gaps: ['Analytics settings need review.'] }; }
  const valid = report => report?.propertyId === config.propertyId && report.siteUrl === config.siteUrl && config.propertyId;
  const a = valid(analytics) ? analytics : null, e = valid(events) ? events : null;
  const map = new Map(), matches = new Map(), gaps = [];
  const keyFor = (url, creative) => `${url}|${creative}`;
  for (const batch of batches) for (const row of batch.rows || []) {
    try {
      const url = new URL(row.cells[5]), creative = url.searchParams.get('utm_content');
      if (!creative) continue;
      const key = keyFor(articleUrl(url.href, config.siteUrl), creative), ids = matches.get(key) || new Set(); ids.add(row.pinId); matches.set(key, ids);
    } catch { /* Missing tracking remains unattributed. */ }
  }
  const group = (url, creative) => {
    const key = keyFor(url, creative), r = map.get(key) || { url, creative: UNKNOWN.has(creative) ? '' : creative, sessions: null, engagedSessions: null, events: {}, pinId: null, attribution: 'unmatched' };
    const ids = matches.get(key);
    if (ids?.size === 1 && r.creative) { r.pinId = [...ids][0]; r.attribution = 'csv-creative-match'; }
    else if (ids?.size > 1) r.attribution = 'ambiguous';
    map.set(key, r); return r;
  };
  for (const row of a?.creatives || []) {
    const r = group(row.url, row.creative); r.sessions = (r.sessions || 0) + row.sessions; r.engagedSessions = (r.engagedSessions || 0) + row.engagedSessions;
  }
  let unknownSourceEvents = 0;
  for (const row of e?.rows || []) {
    if (row.channel !== 'pinterest') { if (!row.channel || row.channel === 'unknown') unknownSourceEvents += row.count; continue; }
    const url = articleUrl(row.pageUrl || row.path, config.siteUrl); if (!url) continue;
    const r = group(url, row.creative); r.events[row.event] = (r.events[row.event] || 0) + row.count;
  }
  if (!a) gaps.push('Website sessions are not connected for this property.');
  else if (!a.creatives) gaps.push('Refresh Analytics to read creative-level sessions.');
  if (!e) gaps.push('Recipe events are not connected for this property.');
  if (a?.limited || e?.limited) gaps.push('Google sampling or privacy thresholds limit this report.');
  if ([a, e].filter(Boolean).some(r => !Number.isFinite(Date.parse(r.fetchedAt)) || now - Date.parse(r.fetchedAt) > 7 * 86400000)) gaps.push('Some evidence is older than seven days.');
  if (unknownSourceEvents) gaps.push(`${unknownSourceEvents} event occurrences have unknown traffic source and are excluded.`);
  if ([...map.values()].some(r => !r.creative)) gaps.push('Some Pinterest activity has no creative tracking ID.');
  if (a && e && a.fetchedAt?.slice(0, 10) !== e.fetchedAt?.slice(0, 10)) gaps.push('Session and event snapshots were refreshed on different days; periods may differ.');
  return { available: Boolean(a || e), rows: [...map.values()], gaps, unit: 'Pinterest sessions and event occurrences, not unique cooks or click-to-session conversion rates.', limitation: 'Consent choices, tracking loss and reporting thresholds can hide activity. No missing conversions are estimated.' };
}
module.exports = { readerAttribution };
