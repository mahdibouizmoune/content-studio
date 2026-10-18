const { analyticsDateRanges } = require('./performance-intelligence');

function analyticsConfig(settings = {}) {
  const measurementId = String(settings.googleAnalyticsMeasurementId || '').trim().toUpperCase();
  const propertyId = String(settings.googleAnalyticsPropertyId || '').trim().replace(/^properties\//, '');
  let siteUrl = '';
  if (settings.googleAnalyticsSiteUrl) {
    let parsed;
    try { parsed = new URL(String(settings.googleAnalyticsSiteUrl).trim()); } catch { throw new Error('Enter the Analytics website as a public HTTPS address.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname.includes('.') || /^(localhost|127\.|0\.|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(parsed.hostname)) {
      throw new Error('Enter the Analytics website as a public HTTPS address.');
    }
    siteUrl = parsed.origin;
  }
  if (measurementId && !/^G-[A-Z0-9]{4,20}$/.test(measurementId)) throw new Error('Use the G- tracking ID only, not a script or HTML code.');
  if (propertyId && !/^\d{1,20}$/.test(propertyId)) throw new Error('GA4 property ID must be numeric; the G- tracking ID is different.');
  return { measurementId, propertyId, siteUrl };
}

function articleUrl(value, siteUrl) {
  try {
    const url = new URL(value, siteUrl);
    if (url.origin !== new URL(siteUrl).origin || url.username || url.password || url.pathname === '/' || decodeURIComponent(url.pathname) === '/(not set)') return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid|msclkid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.href;
  } catch { return ''; }
}

function aggregateReport(report, siteUrl) {
  const dimensions = (report.dimensionHeaders || []).map((header) => header.name);
  const metrics = (report.metricHeaders || []).map((header) => header.name);
  for (const field of ['landingPagePlusQueryString', 'sessionSourceMedium']) if (!dimensions.includes(field)) throw new Error(`Analytics report is missing ${field}.`);
  for (const field of ['sessions', 'engagedSessions', 'userEngagementDuration']) if (!metrics.includes(field)) throw new Error(`Analytics report is missing ${field}.`);
  const pages = new Map();
  for (const row of report.rows || []) {
    const dimension = (name) => row.dimensionValues?.[dimensions.indexOf(name)]?.value || '';
    const url = articleUrl(dimension('landingPagePlusQueryString'), siteUrl);
    if (!url) continue;
    const metric = (name) => Math.max(0, Number(row.metricValues?.[metrics.indexOf(name)]?.value) || 0);
    const page = pages.get(url) || { url, sessions: 0, engagedSessions: 0, engagementSeconds: 0, pinterestSessions: 0 };
    const sessions = metric('sessions');
    page.sessions += sessions;
    page.engagedSessions += metric('engagedSessions');
    page.engagementSeconds += metric('userEngagementDuration');
    const source = dimension('sessionSourceMedium').split(' / ')[0].toLowerCase();
    if (/^(?:www\.|m\.|l\.)?pinterest(?:\.(?:com|co\.uk|com\.au|co\.nz|[a-z]{2}))?$/.test(source) || source === 'pin.it') page.pinterestSessions += sessions;
    pages.set(url, page);
  }
  return pages;
}

function buildAnalyticsSnapshot({ current, previous, config, now = new Date() }) {
  const currentPages = aggregateReport(current, config.siteUrl);
  const previousPages = aggregateReport(previous, config.siteUrl);
  const pages = [...currentPages.values()].map((page) => {
    const before = previousPages.get(page.url)?.sessions || 0;
    return {
      ...page,
      previousSessions: before,
      growthPercent: before >= 30 ? Math.round((page.sessions - before) / before * 100) : null,
      engagementRate: page.sessions ? Math.min(1, page.engagedSessions / page.sessions) : 0,
      averageEngagementSeconds: page.sessions ? Math.round(page.engagementSeconds / page.sessions) : 0,
      confidence: page.sessions >= 100 ? 'high' : page.sessions >= 30 ? 'medium' : 'low'
    };
  }).sort((a, b) => b.engagedSessions - a.engagedSessions || b.sessions - a.sessions);
  return {
    ...config, fetchedAt: now.toISOString(), range: analyticsDateRanges(now, 28),
    timeZone: current.metadata?.timeZone || '',
    limited: [current, previous].some((report) => report.metadata?.subjectToThresholding || report.metadata?.dataLossFromOtherRow || report.metadata?.samplingMetadatas?.some((sample) => Number(sample.samplesReadCount) < Number(sample.samplingSpaceSize))),
    pages
  };
}

async function fetchAnalyticsSnapshot({ settings, token, request, now = new Date() }) {
  const config = analyticsConfig(settings);
  if (!config.propertyId || !config.siteUrl) throw new Error('Add the numeric GA4 property ID and website in Settings. A G- tracking ID alone cannot read reports.');
  if (!token) throw new Error('Connect Google in Settings to read Analytics reports.');
  const ranges = analyticsDateRanges(now, 28);
  const read = async (range) => {
    let report;
    const rows = [];
    for (let offset = 0; offset < 20000; offset += 5000) {
      const response = await request(`https://analyticsdata.googleapis.com/v1beta/properties/${config.propertyId}:runReport`, {
        dateRanges: [range],
        dimensions: [{ name: 'landingPagePlusQueryString' }, { name: 'sessionSourceMedium' }],
        metrics: [{ name: 'sessions' }, { name: 'engagedSessions' }, { name: 'userEngagementDuration' }],
        dimensionFilter: { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: new URL(config.siteUrl).hostname, caseSensitive: false } } },
        limit: 5000, offset, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
      }, { headers: { Authorization: `Bearer ${token}` }, timeout: 30000, maxRedirects: 0, maxContentLength: 8 * 1024 * 1024 });
      const data = response.data;
      if (!data || !Array.isArray(data.dimensionHeaders) || !Array.isArray(data.metricHeaders)) throw new Error('Google returned an incomplete Analytics report.');
      if (!report) report = data;
      else report.metadata = { ...report.metadata,
        subjectToThresholding: Boolean(report.metadata?.subjectToThresholding || data.metadata?.subjectToThresholding),
        dataLossFromOtherRow: Boolean(report.metadata?.dataLossFromOtherRow || data.metadata?.dataLossFromOtherRow),
        samplingMetadatas: [...(report.metadata?.samplingMetadatas || []), ...(data.metadata?.samplingMetadatas || [])] };
      rows.push(...(data.rows || []));
      if ((data.rows || []).length < 5000 || rows.length >= Number(data.rowCount)) return { ...report, rows };
    }
    throw new Error('Analytics report exceeds 20,000 rows. No partial report was saved. Use a separate property for this website.');
  };
  const current = await read(ranges.current);
  const previous = await read(ranges.previous);
  return buildAnalyticsSnapshot({ current, previous, config, now });
}

function analyticsWorkspace(snapshot, settings, articles = [], now = new Date()) {
  const config = analyticsConfig(settings);
  if (!snapshot || snapshot.propertyId !== config.propertyId || snapshot.siteUrl !== config.siteUrl) return { configured: Boolean(config.propertyId && config.siteUrl), snapshot: null, recommendations: [] };
  const stale = now.getTime() - new Date(snapshot.fetchedAt).getTime() > 7 * 86400000 || !Number.isFinite(Date.parse(snapshot.fetchedAt));
  const recommendations = (Array.isArray(articles) ? articles : []).flatMap((article) => {
    const url = articleUrl(article.wordpressPostUrl || article.sourceUrl || '', config.siteUrl);
    const page = snapshot.pages.find((entry) => entry.url === url);
    if (!page || !page.sessions) return [];
    return [{ ...page, articleId: article.id, title: article.generatedTitle || article.title, topic: article.targetKeyword || article.seoBrief?.targetKeyword || article.generatedTitle || article.title,
      reason: stale ? 'Older report; refresh before planning.' : page.sessions < 30 ? 'Small sample; test before expanding.' : `${page.engagedSessions} engaged sessions. Expand related cooking needs without duplicating this recipe.` }];
  });
  const unique = [...new Map(recommendations.map((entry) => [entry.url, entry])).values()];
  unique.sort((a, b) => (a.confidence === 'low') - (b.confidence === 'low') || b.engagedSessions - a.engagedSessions || b.sessions - a.sessions);
  return { configured: true, stale, limited: snapshot.limited, snapshot: { fetchedAt: snapshot.fetchedAt, range: snapshot.range, timeZone: snapshot.timeZone, articleCount: unique.length }, recommendations: unique.slice(0, 30) };
}

function websiteEvidence(workspace, topic = '') {
  if (workspace.stale || workspace.limited) return [];
  const stop = new Set(['recipe', 'recipes', 'easy', 'with', 'from', 'your', 'this', 'that', 'quick', 'minutes', 'best']);
  const tokens = new Set(String(topic).toLowerCase().match(/[a-z]{4,}/g)?.filter((word) => !stop.has(word)) || []);
  return (workspace.recommendations || []).filter((entry) => entry.sessions >= 30 && [...tokens].filter((word) => new RegExp(`\\b${word}\\b`, 'i').test(`${entry.title} ${entry.topic}`)).length >= 2).slice(0, 8);
}

module.exports = { analyticsConfig, articleUrl, aggregateReport, buildAnalyticsSnapshot, fetchAnalyticsSnapshot, analyticsWorkspace, websiteEvidence };
