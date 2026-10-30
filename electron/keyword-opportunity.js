'use strict';
const DEFAULT_OPPORTUNITY_WEIGHTS = Object.freeze({ pinterest: 35, search: 35, coverage: 20, seasonal: 10 });
const words = value => new Set(String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []);
function match(left, right) {
  const a = words(left), b = words(right); if (!a.size || !b.size) return 0;
  return [...a].filter(w => b.has(w)).length / Math.max(a.size, b.size);
}
function seasonalOpportunity(keyword, geo = 'US', now = new Date()) {
  const south = geo === 'AU';
  const season = /\b(?:fall|autumn|pumpkin)\b/i.test(keyword) ? ['Autumn', south ? 3 : 9] : /\b(?:summer|lemonade|picnic)\b/i.test(keyword) ? ['Summer', south ? 12 : 6] : /\b(?:winter|christmas)\b/i.test(keyword) ? ['Winter', south ? 6 : 12] : /\b(?:spring)\b/i.test(keyword) ? ['Spring', south ? 9 : 3] : null;
  if (!season) return null;
  const year = now.getUTCFullYear();
  let start = Date.UTC(year, season[1] - 1, 1), end = Date.UTC(year, season[1] + 2, 1);
  if (now.getTime() >= end) { start = Date.UTC(year + 1, season[1] - 1, 1); end = Date.UTC(year + 1, season[1] + 2, 1); }
  // December seasons can span the year boundary.
  const previousStart = Date.UTC(year - 1, season[1] - 1, 1), previousEnd = Date.UTC(year - 1, season[1] + 2, 1);
  if (now.getTime() < previousEnd) { start = previousStart; end = previousEnd; }
  const leadDays = Math.ceil((start - now.getTime()) / 86400000);
  return { label: season[0], start: new Date(start).toISOString().slice(0, 10), end: new Date(end).toISOString().slice(0, 10), leadDays, priority: leadDays <= 60 && now.getTime() < end ? 100 : 0, evidence: 'Calendar inference, not measured search demand' };
}
function rankKeywordOpportunities(items, { pinterest = [], queries = [], titles = [], geo = 'US', now = new Date(), pinterestAt = '', searchAt = '', weights = {} } = {}) {
  const safeWeights = Object.fromEntries(Object.entries(DEFAULT_OPPORTUNITY_WEIGHTS).map(([key, fallback]) => [key, weights[key] === undefined ? fallback : Number(weights[key])]));
  if (Object.values(safeWeights).some(n => !Number.isFinite(n) || n < 0 || n > 100) || !Object.values(safeWeights).some(n => n > 0)) throw new Error('Opportunity weights must be 0 to 100 with at least one positive weight.');
  const fresh = at => Number.isFinite(Date.parse(at)) && now.getTime() - Date.parse(at) >= 0 && now.getTime() - Date.parse(at) <= 45 * 86400000;
  return items.map(item => {
    const keyword = String(item.keyword || ''), pin = pinterest.find(row => match(keyword, row.keyword) >= 0.6);
    const query = queries.find(row => match(keyword, row.key || row.query) >= 0.8);
    const pinScore = pin && fresh(pinterestAt) ? Math.min(100, Math.log1p(Math.max(0, Number(pin.outboundClicks) || 0) * 4 + Math.max(0, Number(pin.saves) || 0)) * 12) : null;
    const searchScore = query && fresh(searchAt) ? Math.min(100, Math.log1p(Math.max(0, Number(query.impressions) || 0)) * 10) : null;
    const overlap = Math.max(0, ...titles.map(title => match(keyword, title)));
    const seasonal = seasonalOpportunity(keyword, geo, now);
    const factors = { pinterest: pinScore, search: searchScore, coverage: Math.round((1 - overlap) * 100), seasonal: seasonal?.priority ?? null };
    const denominator = Object.keys(factors).filter(k => factors[k] !== null).reduce((n, k) => n + safeWeights[k], 0);
    const measuredSources = Number(pinScore !== null) + Number(searchScore !== null);
    const cap = measuredSources === 2 ? 100 : measuredSources === 1 ? 85 : 45;
    const score = denominator ? Object.keys(factors).reduce((n, k) => n + (factors[k] ?? 0) * safeWeights[k], 0) / denominator : 0;
    return { ...item, opportunityScore: Math.min(cap, Math.round(score)), evidenceConfidence: measuredSources === 2 ? 'high' : measuredSources ? 'medium' : 'low',
      opportunityFactors: factors, opportunityWeights: safeWeights, seasonalOpportunity: seasonal, coverageOverlap: Math.round(overlap * 100),
      evidenceLabel: measuredSources === 2 ? 'Pinterest + Search Console' : pinScore !== null ? 'Pinterest performance' : searchScore !== null ? 'Search Console queries' : 'Unmeasured opportunity',
      scoreLimitation: 'Relative prioritization, not search volume or a traffic forecast. Missing or stale sources are not zero demand.' };
  });
}
module.exports = { DEFAULT_OPPORTUNITY_WEIGHTS, rankKeywordOpportunities, seasonalOpportunity };
