function cleanText(value = "", limit = 250000) {
  return String(value || "")
    .replace(/((?:api|auth|access|secret|private)[ _-]?(?:key|token|password)\s*[:=]\s*)[^\s<"']+/gi, "$1[redacted]")
    .slice(0, limit);
}

function safeJsonValue(value, limit = 50000) {
  try {
    return JSON.parse(cleanText(JSON.stringify(value ?? null), limit));
  } catch {
    return null;
  }
}

function safeSnapshot(article = {}) {
  return {
    generatedTitle: cleanText(article.generatedTitle || "", 500),
    title: cleanText(article.title || "", 500),
    content: cleanText(article.content || ""),
    rankMathTitle: cleanText(article.rankMathTitle || article.metaTitle || "", 500),
    rankMathDescription: cleanText(article.rankMathDescription || article.metaDescription || "", 1000),
    rankMathFocusKeyword: cleanText(article.rankMathFocusKeyword || "", 300),
    slug: cleanText(article.slug || "", 300),
    structuredData: cleanText(article.structuredData || "", 50000),
    featuredImageAlt: cleanText(article.featuredImageAlt || "", 500),
    workflowStatus: cleanText(article.workflowStatus || "", 100),
    articleBrief: safeJsonValue(article.articleBrief)
  };
}

function normalizeHeading(value = "") {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function listArticleSections(content = "") {
  const html = String(content || "");
  const headings = [...html.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)];
  const sections = [];
  if (!headings.length) {
    return html.trim()
      ? [{ id: "article", label: "Full article", html, start: 0, end: html.length }]
      : [];
  }
  if (headings[0].index > 0 && html.slice(0, headings[0].index).trim()) {
    sections.push({
      id: "introduction",
      label: "Introduction",
      html: html.slice(0, headings[0].index).trim(),
      start: 0,
      end: headings[0].index
    });
  }
  headings.forEach((heading, index) => {
    const start = heading.index;
    const end = headings[index + 1]?.index ?? html.length;
    sections.push({
      id: `section-${index + 1}`,
      label: normalizeHeading(heading[0]) || `Section ${index + 1}`,
      html: html.slice(start, end).trim(),
      start,
      end
    });
  });
  return sections;
}

export function replaceArticleSection(content = "", sectionId = "", replacement = "") {
  const html = String(content || "");
  const section = listArticleSections(html).find((item) => item.id === sectionId);
  if (!section) return html;
  return `${html.slice(0, section.start)}${String(replacement || "").trim()}${html.slice(section.end)}`;
}

export function recordArticleRevision(previousArticle = {}, nextArticle = {}, meta = {}) {
  const scope = meta.scope || "article";
  const previousContent = scope === "section"
    ? cleanText(meta.previousContent || "")
    : JSON.stringify(safeSnapshot(previousArticle));
  const newContent = scope === "section"
    ? cleanText(meta.newContent || "")
    : JSON.stringify(safeSnapshot(nextArticle));
  if (previousContent === newContent) return nextArticle;
  const revision = {
    id: `revision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    changedSection: cleanText(meta.changedSection || (scope === "section" ? "section" : "article"), 300),
    sectionId: cleanText(meta.sectionId || "", 100),
    scope,
    previousContent,
    newContent,
    changeSource: cleanText(meta.changeSource || "user", 100),
    modelUsed: cleanText(meta.modelUsed || "", 200),
    action: cleanText(meta.action || "edit", 100),
    reason: cleanText(meta.reason || "", 1000)
  };
  return {
    ...nextArticle,
    revisions: [revision, ...(nextArticle.revisions || previousArticle.revisions || [])].slice(0, 40),
    revisionCount: Number(previousArticle.revisionCount || previousArticle.revisions?.length || 0) + 1
  };
}

export function restoreArticleRevision(article = {}, revision = {}) {
  if (revision.scope === "section" && revision.sectionId) {
    return {
      ...article,
      content: replaceArticleSection(article.content || "", revision.sectionId, revision.previousContent || "")
    };
  }
  try {
    const snapshot = JSON.parse(revision.previousContent || "{}");
    return { ...article, ...snapshot };
  } catch {
    return article;
  }
}
