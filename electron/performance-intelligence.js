function isoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function analyticsDateRanges(now = new Date(), days = 28) {
  const safeDays = Math.max(7, Math.min(90, Number(days) || 28));
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - safeDays + 1);
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - safeDays + 1);
  return {
    current: { startDate: isoDate(start), endDate: isoDate(end) },
    previous: { startDate: isoDate(previousStart), endDate: isoDate(previousEnd) }
  };
}

function summarizeSearchRows(rows = []) {
  const normalized = Array.isArray(rows) ? rows : [];
  const clicks = normalized.reduce((sum, row) => sum + Number(row?.clicks || 0), 0);
  const impressions = normalized.reduce((sum, row) => sum + Number(row?.impressions || 0), 0);
  const weightedPosition = normalized.reduce(
    (sum, row) => sum + (Number(row?.position || 0) * Math.max(1, Number(row?.impressions || 0))),
    0
  );
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weightedPosition / impressions : 0
  };
}

function percentChange(current, previous) {
  const now = Number(current || 0);
  const before = Number(previous || 0);
  if (!before) return now ? 100 : 0;
  return ((now - before) / before) * 100;
}

function normalizeSearchRows(rows = [], dimension = 'page') {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    key: String(row?.keys?.[0] || ''),
    dimension,
    clicks: Number(row?.clicks || 0),
    impressions: Number(row?.impressions || 0),
    ctr: Number(row?.ctr || 0),
    position: Number(row?.position || 0)
  }));
}

function buildSearchOpportunities(currentPages = [], previousPages = []) {
  const previous = new Map(normalizeSearchRows(previousPages).map((row) => [row.key, row]));
  return normalizeSearchRows(currentPages)
    .map((row) => {
      const old = previous.get(row.key) || {};
      const clickChange = percentChange(row.clicks, old.clicks);
      let type = '';
      let priority = 0;
      let recommendation = '';
      if (row.impressions >= 100 && row.ctr < 0.02) {
        type = 'Improve CTR';
        priority = Math.min(100, Math.round(row.impressions / 20) + Math.round((0.02 - row.ctr) * 1000));
        recommendation = 'Strengthen the title and meta description around the exact search promise.';
      } else if (row.position >= 4 && row.position <= 20 && row.impressions >= 50) {
        type = 'Ranking opportunity';
        priority = Math.min(95, Math.round(row.impressions / 25) + Math.round(21 - row.position));
        recommendation = 'Refresh the recipe, answer missing reader questions, and add relevant internal links.';
      } else if (old.clicks > 5 && clickChange <= -25) {
        type = 'Traffic decline';
        priority = Math.min(90, Math.round(Math.abs(clickChange)));
        recommendation = 'Review freshness, search intent, competing pages, and recent title changes.';
      }
      return type ? { ...row, type, priority, clickChange, recommendation } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 25);
}

function normalizePinterestSummary(payload = {}) {
  const source = payload?.all || payload?.summary_metrics || payload?.data?.all || payload?.data || payload;
  const metric = (name) => Number(
    source?.[name]
    ?? source?.[name.toLowerCase()]
    ?? source?.[name.replace(/_/g, ' ')]
    ?? 0
  );
  return {
    impressions: metric('IMPRESSION'),
    pinClicks: metric('PIN_CLICK'),
    outboundClicks: metric('OUTBOUND_CLICK'),
    saves: metric('SAVE')
  };
}

function normalizeGhlStatus(value = '') {
  const status = String(value || '').trim().toLowerCase();
  if (['published', 'scheduled', 'failed', 'draft', 'in_review', 'in_progress', 'pending', 'notification_sent', 'deleted'].includes(status)) {
    return status;
  }
  return status || 'unknown';
}

module.exports = {
  analyticsDateRanges,
  buildSearchOpportunities,
  normalizeGhlStatus,
  normalizePinterestSummary,
  normalizeSearchRows,
  percentChange,
  summarizeSearchRows
};
