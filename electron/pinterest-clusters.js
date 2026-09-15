const DEFAULT_MAX_CLUSTERS = 6;
const MIN_CLUSTERS = 3;
const MAX_CLUSTERS = 10;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'best', 'by', 'for', 'from', 'how', 'in', 'is', 'it',
  'of', 'on', 'or', 'pinterest', 'pin', 'recipe', 'recipes', 'that', 'the', 'this', 'to', 'with', 'your'
]);

function cleanText(value = '', limit = 500) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u2014|\u00e2\u20ac\u201d/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function tagAttributes(tag = '') {
  const attributes = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = pattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function metaValues(html = '') {
  const values = new Map();
  for (const tag of String(html || '').match(/<meta\b[^>]*>/gi) || []) {
    const attributes = tagAttributes(tag);
    const key = String(attributes.property || attributes.name || '').toLowerCase();
    if (key && attributes.content && !values.has(key)) values.set(key, attributes.content);
  }
  return values;
}

function linkValues(html = '') {
  const values = new Map();
  for (const tag of String(html || '').match(/<link\b[^>]*>/gi) || []) {
    const attributes = tagAttributes(tag);
    const key = String(attributes.rel || '').toLowerCase();
    if (key && attributes.href && !values.has(key)) values.set(key, attributes.href);
  }
  return values;
}

function safeAbsoluteUrl(value = '', baseUrl = '') {
  try {
    const parsed = new URL(String(value || ''), baseUrl || undefined);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function topicFromUrl(value = '') {
  try {
    const parsed = new URL(value);
    const part = parsed.pathname.split('/').filter(Boolean).reverse().find((item) => !/^pin$|^\d+$/.test(item)) || '';
    return decodeURIComponent(part).replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return '';
  }
}

function embeddedPinterestDestination(html = '', baseUrl = '') {
  const decoded = decodeHtml(String(html || ''))
    .replace(/\\u002f/gi, '/')
    .replace(/\\u003a/gi, ':')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/');
  const candidates = [];
  const pattern = /"(?:link|destination_url|destinationUrl|source_url)"\s*:\s*"([^"]+)"/gi;
  let match;
  while ((match = pattern.exec(decoded)) && candidates.length < 30) {
    const candidate = safeAbsoluteUrl(match[1], baseUrl);
    if (candidate) candidates.push(candidate);
  }
  return candidates.find((candidate) => {
    try {
      const hostname = new URL(candidate).hostname.toLowerCase();
      return !/(^|\.)(?:pinterest\.[a-z.]+|pin\.it|pinimg\.com)$/i.test(hostname);
    } catch {
      return false;
    }
  }) || '';
}

function extractPinterestSourceMetadata(html = '', requestedUrl = '', status = 0) {
  const metas = metaValues(html);
  const links = linkValues(html);
  const titleTag = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const canonicalUrl = safeAbsoluteUrl(links.get('canonical') || metas.get('og:url') || requestedUrl, requestedUrl) || requestedUrl;
  let destinationUrl = safeAbsoluteUrl(
    metas.get('pinterestapp:source') || metas.get('pin:url') || metas.get('og:see_also') || canonicalUrl,
    canonicalUrl
  ) || canonicalUrl;
  const hostname = (() => {
    try { return new URL(canonicalUrl).hostname.toLowerCase(); } catch { return ''; }
  })();
  const isPinterestSource = /(^|\.)pinterest\./i.test(hostname) || /(^|\.)pin\.it$/i.test(hostname);
  if (isPinterestSource) {
    try {
      const destinationHost = new URL(destinationUrl).hostname.toLowerCase();
      if (/(^|\.)pinterest\./i.test(destinationHost) || /(^|\.)pin\.it$/i.test(destinationHost)) {
        destinationUrl = embeddedPinterestDestination(html, canonicalUrl) || destinationUrl;
      }
    } catch {}
  }
  const rawTitle = metas.get('og:title') || metas.get('twitter:title') || titleTag || topicFromUrl(canonicalUrl);
  const title = cleanText(decodeHtml(rawTitle).replace(/\s*[|-]\s*Pinterest\s*$/i, ''), 220);
  const description = cleanText(decodeHtml(
    metas.get('og:description') || metas.get('twitter:description') || metas.get('description') || ''
  ), 1200);
  const imageUrl = safeAbsoluteUrl(metas.get('og:image:secure_url') || metas.get('og:image') || metas.get('twitter:image') || '', canonicalUrl);
  return {
    requestedUrl,
    canonicalUrl,
    destinationUrl,
    title: title || topicFromUrl(canonicalUrl) || 'Pinterest content idea',
    description,
    imageUrl,
    siteName: cleanText(metas.get('og:site_name') || hostname.replace(/^www\./, ''), 120),
    sourceType: isPinterestSource ? 'pinterest-pin' : 'destination-page',
    status: Number(status || 0)
  };
}

function slug(value = '') {
  return cleanText(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function words(value = '') {
  return cleanText(value, 1000).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function unique(values = [], limit = 20) {
  return [...new Set((Array.isArray(values) ? values : [values]).map((value) => cleanText(value, 180)).filter(Boolean))].slice(0, limit);
}

function clampClusterCount(value) {
  return Math.max(MIN_CLUSTERS, Math.min(MAX_CLUSTERS, Number(value) || DEFAULT_MAX_CLUSTERS));
}

function bestBoard(label = '', keywords = [], boardNames = []) {
  const target = new Set(words([label, ...(keywords || [])].join(' ')));
  let best = { board: '', score: 0 };
  for (const candidate of unique(boardNames, 300)) {
    const boardWords = words(candidate);
    const overlap = boardWords.filter((word) => target.has(word)).length;
    const specificity = boardWords.length > 1 ? 8 : 0;
    const score = overlap * 28 + specificity;
    if (score > best.score) best = { board: candidate, score };
  }
  return { board: best.board, confidence: Math.max(0, Math.min(100, best.score)) };
}

function fallbackClusterSeeds(topic = '') {
  return [
    { suffix: '', role: 'core-depth', lifecycle: 'established', intent: 'Complete recipe and practical cooking help' },
    { suffix: 'Quick and Easy', role: 'core-depth', lifecycle: 'growing', intent: 'Fast solution for busy cooks' },
    { suffix: 'Meal Prep', role: 'adjacent-discovery', lifecycle: 'growing', intent: 'Make-ahead planning, storage, and reheating' },
    { suffix: 'Healthy High Protein', role: 'adjacent-discovery', lifecycle: 'emerging', intent: 'Nutrition-aware meal planning without unsupported claims' },
    { suffix: 'Budget Family Dinner', role: 'adjacent-discovery', lifecycle: 'established', intent: 'Affordable family-friendly cooking' },
    { suffix: 'Seasonal Entertaining', role: 'seasonal-opportunity', lifecycle: 'emerging', intent: 'Timely gatherings, holidays, and seasonal planning' },
    { suffix: 'Air Fryer', role: 'frontier-test', lifecycle: 'emerging', intent: 'Appliance-specific discovery angle' },
    { suffix: 'One Pan', role: 'frontier-test', lifecycle: 'growing', intent: 'Low-cleanup cooking workflow' }
  ].map((item) => ({ ...item, label: cleanText(`${item.suffix} ${topic}`.trim(), 90) }));
}

function fallbackPinIdeas(topic, clusterLabel) {
  const compact = cleanText(clusterLabel || topic, 90);
  return [
    {
      title: cleanText(`${compact}: A Recipe Worth Saving`, 95),
      overlayText: cleanText(compact, 52),
      hook: 'Lead with the exact useful outcome and a clear save-worthy reason.',
      visualDirection: 'Use one bright vertical close-up of the finished recipe with a strong mobile focal point.'
    },
    {
      title: cleanText(`${compact} For Your Next Meal Plan`, 95),
      overlayText: cleanText(`${compact} Made Easy`, 52),
      hook: 'Position the recipe as a practical idea the reader can use soon.',
      visualDirection: 'Show the most recognizable texture or ingredient detail with clean readable hierarchy.'
    }
  ];
}

function fallbackPinterestClusterPlan(context = {}) {
  const source = context.source || {};
  const topic = cleanText(context.topic || source.title || topicFromUrl(source.canonicalUrl || source.requestedUrl), 120) || 'Recipe Ideas';
  const maxClusters = clampClusterCount(context.maxClusters);
  const clusters = fallbackClusterSeeds(topic).slice(0, Math.min(maxClusters, 6)).map((seed, index) => {
    const keywords = unique([seed.label.toLowerCase(), topic.toLowerCase(), `${topic} ideas`, `${topic} recipe`, seed.intent.toLowerCase()], 8);
    const match = bestBoard(seed.label, keywords, context.boardNames);
    return {
      id: `${slug(seed.label) || 'cluster'}-${index + 1}`,
      label: seed.label,
      role: seed.role,
      lifecycle: seed.lifecycle,
      audienceIntent: seed.intent,
      rationale: index === 0
        ? 'Build depth around the exact source use case before expanding into adjacent discovery angles.'
        : 'Adds a distinct planning use case without repeating the same promise or keyword framing.',
      keywords,
      board: match.board,
      boardConfidence: match.confidence,
      pinIdeas: fallbackPinIdeas(topic, seed.label)
    };
  });
  return {
    id: `pinterest-cluster-${Date.now()}`,
    createdAt: new Date().toISOString(),
    source,
    topic,
    primaryUseCase: clusters[0]?.label || topic,
    summary: 'Start with the exact source use case, add coherent depth, then test a small number of adjacent interests. Rotate clusters instead of publishing many near-identical Pins together.',
    strategyNotes: [
      'Keep every Pin aligned across image, title, description, destination, and board.',
      'Publish distinct use cases rather than cosmetic duplicates.',
      'Interleave established, growing, and adjacent clusters to preserve feed variety.',
      'Use account analytics as evidence and treat unsupported trend ideas as tests.'
    ],
    clusters,
    sourceLabel: 'Deterministic Pinterest cluster planner'
  };
}

function normalizePinIdea(value = {}, topic = '', label = '') {
  if (typeof value === 'string') value = { title: value };
  const fallback = fallbackPinIdeas(topic, label)[0];
  return {
    title: cleanText(value.title || fallback.title, 95),
    overlayText: cleanText(value.overlayText || fallback.overlayText, 52),
    hook: cleanText(value.hook || fallback.hook, 240),
    visualDirection: cleanText(value.visualDirection || fallback.visualDirection, 360)
  };
}

function normalizePinterestClusterPlan(value = {}, context = {}) {
  const fallback = fallbackPinterestClusterPlan(context);
  const source = { ...fallback.source, ...(context.source || {}) };
  const topic = cleanText(value.topic || fallback.topic, 120);
  const allowedRoles = new Set(['core-depth', 'adjacent-discovery', 'seasonal-opportunity', 'frontier-test']);
  const allowedLifecycle = new Set(['emerging', 'growing', 'established', 'fading']);
  const maxClusters = clampClusterCount(context.maxClusters);
  const rawClusters = Array.isArray(value.clusters) ? value.clusters : [];
  const normalized = rawClusters.slice(0, maxClusters).map((item, index) => {
    const label = cleanText(item.label || fallback.clusters[index]?.label || `${topic} ${index + 1}`, 90);
    const keywords = unique(item.keywords?.length ? item.keywords : fallback.clusters[index]?.keywords || [topic, label], 10);
    const exactBoard = unique(context.boardNames, 300).find((board) => board.toLowerCase() === cleanText(item.board, 180).toLowerCase());
    const match = exactBoard ? { board: exactBoard, confidence: Math.max(55, Number(item.boardConfidence) || 75) } : bestBoard(label, keywords, context.boardNames);
    const rawIdeas = Array.isArray(item.pinIdeas) ? item.pinIdeas : [];
    return {
      id: cleanText(item.id || `${slug(label) || 'cluster'}-${index + 1}`, 140),
      label,
      role: allowedRoles.has(item.role) ? item.role : fallback.clusters[index]?.role || 'adjacent-discovery',
      lifecycle: allowedLifecycle.has(item.lifecycle) ? item.lifecycle : fallback.clusters[index]?.lifecycle || 'established',
      audienceIntent: cleanText(item.audienceIntent || fallback.clusters[index]?.audienceIntent, 260),
      rationale: cleanText(item.rationale || fallback.clusters[index]?.rationale, 420),
      keywords,
      board: match.board,
      boardConfidence: Math.max(0, Math.min(100, Number(match.confidence) || 0)),
      pinIdeas: (rawIdeas.length ? rawIdeas : fallbackPinIdeas(topic, label)).slice(0, 3).map((idea) => normalizePinIdea(idea, topic, label))
    };
  }).filter((cluster, index, rows) => cluster.label && rows.findIndex((item) => slug(item.label) === slug(cluster.label)) === index);
  const clusters = normalized.length >= MIN_CLUSTERS ? normalized : fallback.clusters;
  return {
    id: cleanText(value.id || fallback.id, 160),
    createdAt: value.createdAt || fallback.createdAt,
    source,
    topic,
    primaryUseCase: cleanText(value.primaryUseCase || clusters[0]?.label || topic, 100),
    summary: cleanText(value.summary || fallback.summary, 700),
    strategyNotes: unique(value.strategyNotes?.length ? value.strategyNotes : fallback.strategyNotes, 8),
    clusters,
    sourceLabel: cleanText(value.sourceLabel || fallback.sourceLabel, 160)
  };
}

module.exports = {
  MAX_CLUSTERS,
  MIN_CLUSTERS,
  bestBoard,
  clampClusterCount,
  extractPinterestSourceMetadata,
  fallbackPinterestClusterPlan,
  normalizePinterestClusterPlan
};
