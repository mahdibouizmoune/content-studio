const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'best', 'blog', 'easy', 'for',
  'from', 'good', 'great', 'have', 'how', 'ideas', 'into', 'make', 'more', 'most',
  'recipe', 'recipes', 'that', 'the', 'their', 'these', 'this', 'those', 'with',
  'your'
]);

const PRODUCT_CONCEPTS = [
  ['air fryer', ['air fryer']],
  ['blender', ['blender', 'blend']],
  ['cast iron skillet', ['cast iron skillet', 'cast-iron skillet']],
  ['chef knife', ['chef knife', "chef's knife", 'sharp knife']],
  ['citrus juicer', ['citrus juicer', 'lemon juicer', 'lime juicer']],
  ['cutting board', ['cutting board', 'chopping board']],
  ['dutch oven', ['dutch oven']],
  ['food processor', ['food processor']],
  ['immersion blender', ['immersion blender', 'stick blender']],
  ['instant pot', ['instant pot', 'pressure cooker']],
  ['kitchen scale', ['kitchen scale', 'food scale']],
  ['meat thermometer', ['meat thermometer', 'instant-read thermometer', 'food thermometer']],
  ['mixing bowls', ['mixing bowl', 'mixing bowls']],
  ['nonstick skillet', ['nonstick skillet', 'non-stick skillet']],
  ['skillet', ['skillet', 'frying pan', 'saute pan']],
  ['sheet pan', ['sheet pan', 'baking sheet']],
  ['slow cooker', ['slow cooker', 'crock pot', 'crockpot']],
  ['stand mixer', ['stand mixer']],
  ['waffle maker', ['waffle maker', 'waffle iron']]
];

function cleanText(value = '', maxLength = 10000) {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function tokens(value = '') {
  return [...new Set(cleanText(value).toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)))];
}

function includesPhrase(text, phrase) {
  return cleanText(text).toLowerCase().includes(String(phrase || '').toLowerCase());
}

function normalizeSearchPlan(plan = [], fallback = []) {
  const source = Array.isArray(plan) ? plan : [];
  const normalized = [];
  const seen = new Set();
  for (const item of [...source, ...fallback]) {
    const query = cleanText(typeof item === 'string' ? item : item?.query, 80);
    const key = query.toLowerCase();
    if (!query || query.split(/\s+/).length > 7 || seen.has(key)) continue;
    seen.add(key);
    const terms = Array.isArray(item?.articleTerms) ? item.articleTerms : [];
    normalized.push({
      query,
      reason: cleanText(item?.reason || '', 240),
      articleTerms: [...new Set([
        ...terms.map((term) => cleanText(term, 80)),
        query
      ].filter(Boolean))].slice(0, 12)
    });
    if (normalized.length >= 5) break;
  }
  return normalized;
}

function fallbackAffiliateQueries(article = {}) {
  const articleText = cleanText([
    article.generatedTitle,
    article.title,
    article.rankMathFocusKeyword,
    article.seoBrief?.targetKeyword,
    article.content
  ].filter(Boolean).join(' '));
  const found = [];
  for (const [query, phrases] of PRODUCT_CONCEPTS) {
    const matches = phrases.filter((phrase) => includesPhrase(articleText, phrase));
    if (!matches.length) continue;
    found.push({
      query,
      reason: `The article explicitly uses ${matches[0]}.`,
      articleTerms: matches
    });
  }
  return normalizeSearchPlan(found);
}

function parseAffiliateSearchPlan(raw = '', fallback = []) {
  const text = String(raw || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch {}
    }
  }
  return normalizeSearchPlan(parsed?.queries || parsed?.searchQueries || [], fallback);
}

function scoreImpactProduct(product = {}, planItem = {}, article = {}) {
  const availability = cleanText(product.stockAvailability).toLowerCase();
  if (/out\s*of\s*stock|outofstock|unavailable/.test(availability)) {
    return { score: -100, matchTerms: [], reason: 'Out of stock' };
  }

  const articleText = cleanText([
    article.generatedTitle,
    article.title,
    article.rankMathFocusKeyword,
    article.seoBrief?.targetKeyword,
    article.seoBrief?.secondaryKeywords,
    article.content
  ].filter(Boolean).join(' '), 35000).toLowerCase();
  const productName = cleanText(product.name, 240).toLowerCase();
  const productContext = cleanText([
    product.name,
    product.category,
    product.manufacturer,
    ...(Array.isArray(product.labels) ? product.labels : [])
  ].filter(Boolean).join(' '), 1200).toLowerCase();
  const query = cleanText(planItem.query, 80).toLowerCase();
  const queryTokens = tokens(query);
  const productTokens = tokens(productContext);
  const queryMatches = queryTokens.filter((token) => productTokens.includes(token));
  const articleProductMatches = productTokens.filter((token) => articleText.includes(token));
  const explicitTerms = (planItem.articleTerms || [])
    .map((term) => cleanText(term, 80).toLowerCase())
    .filter((term) => term && articleText.includes(term));

  let score = 0;
  if (query && productName.includes(query)) score += 110;
  if (query && productName.startsWith(query)) score += 20;
  if (query && productContext.includes(query)) score += 75;
  score += Math.round((queryMatches.length / Math.max(1, queryTokens.length)) * 70);
  score += Math.min(40, explicitTerms.length * 20);
  score += Math.min(30, articleProductMatches.length * 5);
  if (/instock|in stock|limitedavailability|limited availability/.test(availability)) score += 8;
  if (product.imageUrl) score += 5;
  if (product.currentPrice) score += 5;
  const currentPrice = Number(String(product.currentPrice || '').replace(/[^0-9.]/g, ''));
  const originalPrice = Number(String(product.originalPrice || '').replace(/[^0-9.]/g, ''));
  if (Number.isFinite(currentPrice) && Number.isFinite(originalPrice) && originalPrice > currentPrice) score += 4;
  const nameWordCount = productName.split(/\s+/).filter(Boolean).length;
  if (nameWordCount >= 2 && nameWordCount <= 14) score += 10;
  if (nameWordCount > 24) score -= 15;
  if (productName.length > 120) score -= 20;
  if (!queryMatches.length || queryMatches.length < Math.ceil(queryTokens.length * 0.75)) score -= 120;

  const usefulProductTerms = productTokens
    .filter((token) => articleText.includes(token))
    .filter((token) => token.length >= 4)
    .slice(0, 8);
  const matchTerms = [...new Set([...explicitTerms, query, ...usefulProductTerms].filter(Boolean))].slice(0, 16);
  return {
    score,
    matchTerms,
    reason: cleanText(planItem.reason || `Matched ${query}`, 240)
  };
}

function rankImpactProducts(candidates = [], article = {}, maxResults = 12) {
  const ranked = candidates
    .map((candidate) => ({
      ...candidate.product,
      discoveryQuery: candidate.planItem.query,
      ...scoreImpactProduct(candidate.product, candidate.planItem, article)
    }))
    .filter((product) => product.score >= 55 && product.matchTerms.length)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const unique = [];
  const seenItems = new Set();
  const seenNames = new Set();
  for (const product of ranked) {
    const itemKey = String(product.catalogItemId || product.id || '').toLowerCase();
    const nameKey = cleanText(product.name, 200).toLowerCase();
    if ((itemKey && seenItems.has(itemKey)) || (nameKey && seenNames.has(nameKey))) continue;
    if (itemKey) seenItems.add(itemKey);
    if (nameKey) seenNames.add(nameKey);
    unique.push(product);
    if (unique.length >= maxResults) break;
  }
  return unique;
}

module.exports = {
  fallbackAffiliateQueries,
  normalizeSearchPlan,
  parseAffiliateSearchPlan,
  rankImpactProducts,
  scoreImpactProduct
};
