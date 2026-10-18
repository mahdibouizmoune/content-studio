'use strict';
const { analyticsConfig } = require('./google-analytics');
const EVENTS = ['cs_recipe_view', 'cs_recipe_print', 'cs_recipe_save', 'cs_shopping_list'];
async function fetchRecipeEvents({ settings, token, request, now = new Date() }) {
  const config = analyticsConfig(settings);
  if (!config.propertyId || !config.siteUrl || !token) throw new Error('Connect Google and save the numeric GA4 property ID and website in Settings.');
  const rows = []; let limited = false;
  for (let offset = 0; offset < 20000; offset += 5000) {
    const { data } = await request(`https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`, {
      dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
      dimensions: [{ name: 'pagePathPlusQueryString' }, { name: 'sessionManualAdContent' }, { name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { andGroup: { expressions: [
        { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: new URL(config.siteUrl).hostname } } },
        { filter: { fieldName: 'eventName', inListFilter: { values: EVENTS } } }
      ] } }, limit: 5000, offset,
      orderBys: [{ dimension: { dimensionName: 'pagePathPlusQueryString' } }, { dimension: { dimensionName: 'sessionManualAdContent' } }, { dimension: { dimensionName: 'eventName' } }]
    }, { headers: { Authorization: `Bearer ${token}` }, timeout: 30000, maxRedirects: 0, maxContentLength: 8 * 1024 * 1024 });
    const names = data?.dimensionHeaders?.map(h => h.name) || [], metrics = data?.metricHeaders?.map(h => h.name) || [];
    if (!['pagePathPlusQueryString', 'sessionManualAdContent', 'eventName'].every(n => names.includes(n)) || !metrics.includes('eventCount')) throw new Error('Incomplete recipe event report; no partial data was saved.');
    limited ||= Boolean(data.metadata?.subjectToThresholding || data.metadata?.dataLossFromOtherRow || data.metadata?.samplingMetadatas?.length);
    for (const row of data.rows || []) {
      const dim = n => row.dimensionValues?.[names.indexOf(n)]?.value || '';
      const event = dim('eventName'); if (!EVENTS.includes(event)) continue;
      const raw = dim('pagePathPlusQueryString'); let url;
      try { url = new URL(raw, config.siteUrl); } catch { limited = true; continue; }
      if (url.origin !== config.siteUrl) continue;
      const count = Number(row.metricValues?.[metrics.indexOf('eventCount')]?.value);
      if (!Number.isFinite(count) || count < 0) throw new Error('Invalid Analytics event count. No partial report saved.');
      rows.push({ path: url.pathname, creative: dim('sessionManualAdContent'), event, count });
    }
    if ((data.rows || []).length < 5000 || offset + (data.rows || []).length >= Number(data.rowCount)) return { ...config, rows, limited, fetchedAt: now.toISOString(), window: 'Previous 28 days; excludes today', unit: 'event occurrences, not unique visitors or CTR' };
  }
  throw new Error('Recipe event report exceeds 20,000 rows. No partial data saved.');
}
module.exports = { EVENTS, fetchRecipeEvents };
