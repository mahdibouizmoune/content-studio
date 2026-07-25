'use strict';

const STOP_WORDS = new Set(['and', 'the', 'with', 'for', 'from', 'recipe', 'recipes', 'easy', 'best', 'how', 'ideas']);

function tokens(value = '') {
  return [...new Set(String(value).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)))];
}

function findLiveTrendMatch(keyword = '', suggestedTitle = '', liveTrends = []) {
  const target = new Set(tokens(`${keyword} ${suggestedTitle}`));
  if (!target.size) return null;
  let best = null;
  for (const trend of liveTrends || []) {
    const trendTokens = tokens(trend?.title || '');
    const overlap = trendTokens.filter((word) => target.has(word)).length;
    const required = trendTokens.length <= 2 ? 1 : 2;
    const similarity = overlap / Math.max(1, Math.min(target.size, trendTokens.length));
    if (overlap >= required && similarity >= 0.45 && (!best || similarity > best.similarity)) {
      best = { title: trend.title, traffic: trend.traffic || '', publishedAt: trend.publishedAt || '', similarity };
    }
  }
  return best ? { ...best, similarity: Number(best.similarity.toFixed(2)) } : null;
}

function classifyKeywordEvidence({ keyword = '', suggestedTitle = '', pinterestEvidence = {}, liveTrends = [], importedAt = '', seasonalTiming = '' } = {}) {
  const live = findLiveTrendMatch(keyword, suggestedTitle, liveTrends);
  const pinterest = Number(pinterestEvidence.outboundClicks || 0) > 0
    || Number(pinterestEvidence.pinClicks || 0) > 0
    || Number(pinterestEvidence.saves || 0) > 0;
  const evidenceType = live && pinterest ? 'combined' : live ? 'live_search' : pinterest ? 'pinterest_performance' : /season/i.test(seasonalTiming) ? 'seasonal_inference' : 'evergreen_inference';
  const evidenceConfidence = live && pinterest ? 'high' : live || pinterest ? 'medium' : 'low';
  const evidenceLabel = {
    combined: 'Live search + Pinterest',
    live_search: 'Live search surge',
    pinterest_performance: 'Pinterest performance',
    seasonal_inference: 'Seasonal inference',
    evergreen_inference: 'Evergreen inference'
  }[evidenceType];
  const freshnessLabel = live
    ? `Live feed${live.publishedAt ? ` / ${live.publishedAt}` : ''}`
    : pinterest && importedAt
      ? `Pinterest CSV / ${new Date(importedAt).toLocaleDateString('en-US')}`
      : 'Not backed by live volume';
  const publishWindow = live ? 'Publish within 24 to 48 hours' : /season/i.test(seasonalTiming) ? String(seasonalTiming) : 'Evergreen schedule';
  return { evidenceType, evidenceConfidence, evidenceLabel, freshnessLabel, publishWindow, matchedLiveTrend: live };
}

module.exports = { classifyKeywordEvidence, findLiveTrendMatch };
