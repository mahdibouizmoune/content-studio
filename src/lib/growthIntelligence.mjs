function dateValue(...values) {
  const value = values.find(Boolean);
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function buildCalendarRows(articles = [], entries = []) {
  const entryMap = new Map((entries || []).map((entry) => [String(entry.articleId), entry]));
  return (articles || []).map((article) => {
    const saved = entryMap.get(String(article.id)) || {};
    return {
      id: saved.id || `calendar-${article.id}`,
      articleId: article.id,
      title: article.generatedTitle || article.title || "Untitled article",
      siteId: article.wordpressSiteId || "",
      campaignId: saved.campaignId || article.campaignId || "",
      status: article.workflowStatus || article.queueStatus || "planned",
      contentType: article.type || "article",
      plannedDate: dateValue(saved.plannedDate, article.plannedAt, article.createdAt),
      generationDate: dateValue(article.generationCompletedAt, article.queueStatus === "completed" ? article.updatedAt : ""),
      reviewDate: dateValue(saved.reviewDate, article.reviewedAt, article.qualityReviewedAt),
      publicationDate: dateValue(article.wordpressPublishedAt, article.publishedAt, article.publishHistory?.at(-1)?.publishedAt),
      pinterestSchedule: dateValue(saved.pinterestSchedule, article.pinterestScheduledAt),
      facebookSchedule: dateValue(saved.facebookSchedule, article.facebookScheduledAt),
      instagramSchedule: dateValue(saved.instagramSchedule, article.instagramScheduledAt),
      newsletterDate: dateValue(saved.newsletterDate),
      seasonalDeadline: dateValue(saved.seasonalDeadline)
    };
  });
}

function daysSince(value, now) {
  const timestamp = new Date(value || 0).getTime();
  return timestamp ? Math.floor((now.getTime() - timestamp) / 86400000) : null;
}

function recommendation(article, type, priority, evidence, action) {
  return {
    id: `update-${article.id}-${type}`,
    articleId: article.id,
    title: article.generatedTitle || article.title,
    type,
    priority,
    evidence,
    action,
    status: "recommended",
    detectedAt: new Date().toISOString()
  };
}

export function buildContentUpdateRecommendations(articles = [], performance = {}, now = new Date()) {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const results = [];
  for (const article of articles || []) {
    const age = daysSince(article.wordpressPublishedAt || article.publishedAt || article.updatedAt, now);
    const quality = article.qualityReport || {};
    const checks = article.seoChecks || [];
    const page = (performance.google?.pages || []).find((item) => item.articleId === article.id || item.page === article.wordpressPostUrl);
    const pin = (performance.pinterest?.topPins || []).find((item) => item.articleId === article.id || item.url === article.wordpressPostUrl);
    if (page?.previousClicks > page?.clicks * 1.25) {
      results.push(recommendation(article, "Search-ranking decline", "high", `Clicks fell from ${page.previousClicks} to ${page.clicks} in the compared window.`, "Review search intent, freshness, title, and sections that lost visibility."));
    }
    if (page?.impressions >= 500 && Number(page.ctr || 0) < 0.02) {
      results.push(recommendation(article, "High impressions and low CTR", "high", `${page.impressions} impressions with ${(Number(page.ctr || 0) * 100).toFixed(1)}% CTR.`, "Improve the title and meta description without changing the page promise."));
    }
    if (pin?.previousOutboundClicks > pin?.outboundClicks * 1.25) {
      results.push(recommendation(article, "Pinterest decline", "medium", `Outbound clicks fell from ${pin.previousOutboundClicks} to ${pin.outboundClicks}.`, "Create a fresh visual and title variation for the same destination."));
    }
    if (age !== null && age >= 365) {
      results.push(recommendation(article, "Outdated article", "medium", `The article has not been updated for ${age} days.`, "Recheck facts, ingredients, links, screenshots, and seasonal references."));
    }
    if (checks.some((check) => check.id === "recipe-schema" && check.pass === false) || quality.blockers?.some((item) => /schema/i.test(item.message || item))) {
      results.push(recommendation(article, "Invalid schema", "high", "The saved SEO or quality report contains a failed recipe schema check.", "Repair Recipe JSON-LD and validate required properties before republishing."));
    }
    if ((article.affiliateLinks || []).some((link) => link.valid === false || link.inStock === false)) {
      const unavailable = (article.affiliateLinks || []).filter((link) => link.valid === false || link.inStock === false).length;
      results.push(recommendation(article, "Affiliate link issue", "high", `${unavailable} affiliate recommendation${unavailable === 1 ? "" : "s"} are invalid or unavailable.`, "Remove or replace only the affected verified product links."));
    }
    if (Number(article.internalLinksInserted || 0) < 1 && !/href=/i.test(article.content || "")) {
      results.push(recommendation(article, "Missing internal links", "medium", "No inserted internal links were recorded and no article links were found.", "Add relevant links to supporting articles and the cluster pillar."));
    }
    if ((quality.categories || []).some((category) => category.id === "depth" && category.score < 65)) {
      results.push(recommendation(article, "Thin sections", "medium", "The latest helpful-content report scored content depth below 65.", "Expand only sections that lack practical steps, evidence, or troubleshooting."));
    }
    const oldYear = String(article.content || "").match(/\b(20[0-2][0-9])\b/g)?.find((year) => Number(year) < now.getFullYear() - 1);
    if (oldYear) results.push(recommendation(article, "Old year reference", "low", `The article still references ${oldYear}.`, "Confirm whether the year is historical or should be updated."));
    if ((article.images || []).some((image) => !String(image.alt || image.altText || "").trim()) || (article.featuredImage && !article.featuredImageAlt)) {
      results.push(recommendation(article, "Missing alt text", "medium", "At least one saved article image has no alt text.", "Add concise, contextual alt text without keyword stuffing."));
    }
    if (article.seasonalDeadline && new Date(article.seasonalDeadline) < now && age !== null && age > 180) {
      results.push(recommendation(article, "Decaying seasonal content", "medium", `The seasonal deadline passed and the article is ${age} days old.`, "Plan the refresh before the next seasonal search window."));
    }
  }
  return results.sort((left, right) => priorityOrder[left.priority] - priorityOrder[right.priority]);
}

export function deriveRunHistory(articles = []) {
  return (articles || []).map((article) => ({
    id: `run-${article.id}`,
    runId: `run-${article.id}`,
    batchId: article.batchId || "",
    articleId: article.id,
    title: article.generatedTitle || article.title,
    startedAt: article.generationStartedAt || article.createdAt || "",
    endedAt: ["completed", "error", "cancelled"].includes(article.queueStatus) ? article.updatedAt || "" : "",
    models: {
      text: article.aiModel || article.generationSettings?.aiModel || "",
      image: article.imageModel || article.generationSettings?.imageModel || ""
    },
    promptVersions: article.promptVersions || {},
    steps: article.generationCheckpoint ? [article.generationCheckpoint.stage].filter(Boolean) : [],
    retries: Number(article.retryCount || 0),
    errors: article.errorMessage ? [article.errorMessage] : [],
    estimatedCost: article.estimatedCost ?? null,
    actualCost: article.actualKnownCost ?? null,
    imagesGenerated: Number(article.images?.length || 0) + (article.featuredImage ? 1 : 0),
    affiliateLinksInserted: Number(article.affiliateLinksInserted || article.managedAffiliateLinks?.length || 0),
    internalLinksInserted: Number(article.internalLinksInserted || 0),
    qualityResults: article.qualityReport || null,
    wordpressResult: article.wordpressPostUrl ? { url: article.wordpressPostUrl, id: article.wordpressPostId } : null,
    pinterestResult: article.pinCreatorSentAt ? { sentAt: article.pinCreatorSentAt } : null,
    status: article.queueStatus || "unknown",
    safeRetryStep: article.queueStatus === "error" ? article.generationStep || article.generationCheckpoint?.stage || "generation" : ""
  }));
}
