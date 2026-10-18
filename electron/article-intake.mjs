const stopWords = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'best', 'by', 'for', 'from', 'how', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with', 'you', 'your']);

export function normalizeTopic(value = '') {
  return String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function topicTokens(value = '') {
  return [...new Set(normalizeTopic(value).split(' ').filter((token) => token.length > 2 && !stopWords.has(token)))];
}

export function detectCannibalization(title = '', articles = [], options = {}) {
  const normalized = normalizeTopic(title);
  const tokens = topicTokens(title);
  return articles.map((article) => {
    const score = Math.max(0, ...[article.title, article.generatedTitle].filter(Boolean).map((name) => {
      if (normalized && normalized === normalizeTopic(name)) return 100;
      const other = topicTokens(name);
      if (!tokens.length || !other.length) return 0;
      const overlap = tokens.filter((token) => other.includes(token)).length;
      return Math.round(overlap / Math.max(tokens.length, other.length) * 100);
    }));
    return { article, score, reason: score === 100 ? 'Exact title or topic match' : 'Topic overlap' };
  }).filter((match) => match.score >= (options.threshold ?? 62)).sort((a, b) => b.score - a.score).slice(0, 5);
}

export function cleanTitleFromInput(input = '') {
  const value = String(input).trim();
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return { title: value, sourceUrl: '' };
    const slug = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname);
    const title = slug.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { title: title || value, sourceUrl: url.href };
  } catch { return { title: value, sourceUrl: '' }; }
}

function sourceKey(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.href;
  } catch { return ''; }
}

export function filterArticleIntake(rows = [], articles = []) {
  const accepted = [];
  const skipped = [];
  const candidates = [...articles];
  for (const row of rows) {
    const parsed = cleanTitleFromInput(row.title);
    const sourceUrl = row.sourceUrl || parsed.sourceUrl;
    const key = sourceKey(sourceUrl);
    const sourceMatch = key && candidates.find((article) => [article.sourceUrl, article.wordpressPostUrl, article.wordpressDraftUrl].some((url) => sourceKey(url) === key));
    const match = detectCannibalization(parsed.title, candidates, { threshold: 62 })[0];
    if (!parsed.title || sourceMatch || match) {
      skipped.push({ id: row.id, title: parsed.title, reason: !parsed.title ? 'Missing title' : sourceMatch ? 'Duplicate source URL' : match.reason,
        matchedTitle: (sourceMatch || match?.article)?.generatedTitle || (sourceMatch || match?.article)?.title || '', score: sourceMatch ? 100 : match?.score || 0 });
      continue;
    }
    const next = { ...row, title: parsed.title, sourceUrl };
    accepted.push(next);
    candidates.push(next);
  }
  return { accepted, skipped };
}
