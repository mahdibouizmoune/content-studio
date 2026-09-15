import { stripHtml, sanitizeTitleText } from "./articlePostProcess.mjs";

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "best", "but", "by", "can", "easy", "for", "from", "how", "in", "into", "is", "it", "make", "of", "on", "or", "recipe", "recipes", "that", "the", "this", "to", "with", "you", "your"
]);

function normalizeUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function normalizeText(value = "") {
  return stripHtml(value)
    .toLowerCase()
    .replace(/&amp;/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value = "") {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function overlapScore(sourceTokens, targetTokens) {
  if (!sourceTokens.length || !targetTokens.length) return 0;
  const target = new Set(targetTokens);
  return unique(sourceTokens).reduce((sum, token) => sum + (target.has(token) ? 1 : 0), 0);
}

function sameHost(url, siteUrl) {
  try {
    return new URL(url).origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function resolveArticleSite(article, settings) {
  const sites = settings.wordpressSites || [];
  if (!sites.length) return null;
  const preset = (settings.projectPresets || []).find((item) => item.id && item.id === article.projectPresetId);
  const siteId = article.wordpressSiteId || preset?.wordpressSiteId || settings.defaultWordPressSiteId || "";
  return sites.find((site) => siteId && (site.id === siteId || site.url === siteId)) || sites[0];
}

export function buildInternalLinkSuggestions({ article, content, site, settings }) {
  if (!site?.url) return [];
  const count = Math.max(0, Number(settings.internalLinkCount ?? 3));
  if (!count) return [];

  const currentUrls = [
    article.wordpressPostUrl,
    article.sourceUrl,
    article.canonicalUrl
  ].map(normalizeUrl);
  const articleTokens = tokens([
    article.generatedTitle || article.title,
    article.seoBrief?.targetKeyword,
    article.seoBrief?.secondaryKeywords,
    article.category,
    stripHtml(content).slice(0, 4000)
  ].filter(Boolean).join(" "));
  const articleCategory = String(article.category || article.autoCategory?.category?.name || "").toLowerCase();
  const posts = Array.isArray(site.internalLinkPosts) ? site.internalLinkPosts : [];

  return posts
    .filter((post) => post?.url && post?.title)
    .filter((post) => sameHost(post.url, site.url))
    .filter((post) => !currentUrls.includes(normalizeUrl(post.url)))
    .map((post) => {
      const postTokens = tokens([post.title, post.slug, post.excerpt, (post.categories || []).join(" ")].join(" "));
      const categoryMatch = articleCategory && (post.categories || []).some((category) => String(category).toLowerCase().includes(articleCategory));
      const score = overlapScore(articleTokens, postTokens) * 10
        + overlapScore(tokens(article.seoBrief?.targetKeyword || article.title), postTokens) * 18
        + (categoryMatch ? 25 : 0)
        + Math.min(10, postTokens.length);
      return {
        id: post.id,
        url: post.url,
        title: sanitizeTitleText(post.title),
        anchor: sanitizeTitleText(post.title).replace(/\s+/g, " ").trim(),
        categories: post.categories || [],
        score,
        reason: categoryMatch ? "category and keyword match" : "keyword match"
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((item, index, items) => items.findIndex((other) => normalizeUrl(other.url) === normalizeUrl(item.url)) === index)
    .slice(0, count);
}

function hasLink(html = "", url = "") {
  const target = normalizeUrl(url);
  return [...String(html || "").matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)]
    .some((match) => normalizeUrl(match[1]) === target);
}

function linkSentence(suggestion, index) {
  const templates = [
    "You may also like {link}.",
    "For another helpful recipe idea, see {link}.",
    "If you are planning more meals, try {link}.",
    "For a related kitchen idea, check out {link}."
  ];
  let safeUrl = "";
  try { safeUrl = new URL(suggestion.url).href; } catch { return ""; }
  const link = `<a href="${escapeHtml(safeUrl)}">${escapeHtml(suggestion.anchor)}</a>`;
  return templates[index % templates.length].replace("{link}", link);
}

export function applyInternalLinksToHtml(html = "", suggestions = []) {
  let next = String(html || "");
  const candidates = suggestions.filter((suggestion) => suggestion?.url && suggestion?.anchor && !hasLink(next, suggestion.url));
  if (!candidates.length) return { html: next, applied: [] };

  const applied = [];
  const usedParagraphs = new Set();

  candidates.forEach((suggestion, index) => {
    const currentParagraphs = [...next.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gi)]
      .filter((match) => !/<a\s/i.test(match[0]) && !/jump-to-recipe|recipe-card/i.test(match[0]));
    const suggestionTokens = tokens([suggestion.title, suggestion.anchor, (suggestion.categories || []).join(" ")].join(" "));
    const selected = currentParagraphs
      .map((match, paragraphIndex) => ({
        match,
        key: normalizeText(match[0]).slice(0, 220),
        score: overlapScore(tokens(match[0]), suggestionTokens) * 20
          + (paragraphIndex > 0 ? 4 : 0)
          - (paragraphIndex < 2 ? 2 : 0)
      }))
      .filter((item) => !usedParagraphs.has(item.key))
      .sort((a, b) => b.score - a.score)[0];
    const paragraph = selected?.match;
    const sentence = `<p>${linkSentence(suggestion, index)}</p>`;
    if (paragraph?.index !== undefined) {
      const insertAt = paragraph.index + paragraph[0].length;
      next = `${next.slice(0, insertAt)}\n${sentence}\n${next.slice(insertAt)}`;
      usedParagraphs.add(selected.key);
    } else {
      next = `${next}\n${sentence}`;
    }
    applied.push(suggestion);
  });

  return { html: next, applied };
}

export function countInternalLinks(html = "", siteUrl = "") {
  const siteOrigin = (() => {
    try {
      return new URL(siteUrl).origin;
    } catch {
      return "";
    }
  })();
  return [...String(html || "").matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)]
    .filter((match) => {
      const href = match[1] || "";
      if (href.startsWith("/")) return true;
      try {
        return siteOrigin && new URL(href).origin === siteOrigin;
      } catch {
        return false;
      }
    }).length;
}
