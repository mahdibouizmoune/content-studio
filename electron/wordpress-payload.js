function buildWordPressPostPayload({
  article = {},
  site = {},
  content = "",
  featuredMediaId = null,
  defaultStatus = "publish",
  now = Date.now()
} = {}) {
  const requestedStatus = String(article.publishStatusOverride || defaultStatus || "").trim().toLowerCase();
  // Fail closed: an unrecognised status must never make a post public.
  const status = ["publish", "draft", "future"].includes(requestedStatus) ? requestedStatus : "draft";
  const scheduledAt = status === "future" ? new Date(article.scheduledAt || "") : null;
  if (status === "future" && (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= now)) {
    throw new Error("Choose a valid future publication date and time before scheduling.");
  }

  const categoryId = Number(article.wordpressCategoryId || article.autoCategory?.id || site.defaultCategoryId || 0);
  const payload = {
    title: article.generatedTitle || article.title,
    content,
    status,
    featured_media: featuredMediaId,
    excerpt: article.excerpt || article.metaDescription || article.rankMathDescription || ""
  };
  if (categoryId) payload.categories = [categoryId];
  if (article.slug) payload.slug = article.slug;
  if (status === "future") payload.date_gmt = scheduledAt.toISOString();

  return { payload, status, categoryId };
}

module.exports = { buildWordPressPostPayload };
