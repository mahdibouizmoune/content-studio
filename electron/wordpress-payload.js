function buildWordPressPostPayload({
  article = {},
  site = {},
  content = "",
  featuredMediaId = null,
  defaultStatus = "publish",
  featuredImageDeferred = false,
  now = Date.now()
} = {}) {
  const requestedStatus = String(article.publishStatusOverride || defaultStatus || "").trim().toLowerCase();
  // Fail closed: an unrecognised status must never make a post public, and a post whose
  // featured image could not be uploaded waits as a draft instead of going live without it.
  const status = featuredImageDeferred ? "draft" : ["publish", "draft", "future"].includes(requestedStatus) ? requestedStatus : "draft";
  const scheduledAt = status === "future" ? new Date(article.scheduledAt || "") : null;
  if (status === "future" && (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= now)) {
    throw new Error("Choose a valid future publication date and time before scheduling.");
  }

  const categoryId = Number(article.wordpressCategoryId || article.autoCategory?.id || site.defaultCategoryId || 0);
  const payload = {
    title: article.generatedTitle || article.title,
    content,
    status,
    excerpt: article.excerpt || article.metaDescription || article.rankMathDescription || ""
  };
  // Without a new upload, leave featured_media out so an update keeps the post's current image.
  if (featuredMediaId) payload.featured_media = featuredMediaId;
  if (categoryId) payload.categories = [categoryId];
  if (article.slug) payload.slug = article.slug;
  if (status === "future") payload.date_gmt = scheduledAt.toISOString();

  return { payload, status, categoryId };
}

module.exports = { buildWordPressPostPayload };
