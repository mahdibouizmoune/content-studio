function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safePublicUrl(value = "") {
  try {
    const parsed = new URL(String(value || "").trim());
    return /^https?:$/.test(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

export function applyReaderRetentionElements(article = {}, settings = {}) {
  let content = String(article.content || "");
  content = content.replace(/\s*<aside[^>]*id=["']reader-retention["'][^>]*>[\s\S]*?<\/aside>\s*/gi, "\n");
  if (settings.readerRetentionEnabled === false) return { ...article, content, readerRetentionApplied: false };
  if (!/id=["']recipe-card["']/i.test(content) && settings.readerRetentionAllArticles !== true) {
    return { ...article, content, readerRetentionApplied: false };
  }

  const saveText = String(
    settings.saveRecipeCtaText
    || "Bookmark this page so the ingredients, instructions, and cooking notes are easy to find when you are ready to cook."
  ).trim();
  const newsletterUrl = settings.newsletterCtaEnabled === true
    ? safePublicUrl(settings.newsletterCtaUrl)
    : "";
  const newsletterText = String(
    settings.newsletterCtaText
    || "Get practical recipe ideas and seasonal cooking inspiration."
  ).trim();
  const parts = [
    '<aside id="reader-retention" class="reader-retention-note" aria-label="Save this recipe">',
    "<strong>Save this recipe for later</strong>",
    saveText ? `<p>${escapeHtml(saveText)}</p>` : "",
    newsletterUrl ? `<p><a href="${escapeHtml(newsletterUrl)}" rel="nofollow">${escapeHtml(newsletterText)}</a></p>` : "",
    "</aside>"
  ].filter(Boolean).join("");
  const cardIndex = content.search(/<section[^>]*id=["']recipe-card["']/i);
  const nextContent = cardIndex >= 0
    ? `${content.slice(0, cardIndex).trim()}\n${parts}\n${content.slice(cardIndex).trim()}`
    : `${content.trim()}\n${parts}`;
  return {
    ...article,
    content: nextContent,
    readerRetentionApplied: true,
    readerRetentionAppliedAt: new Date().toISOString()
  };
}

