export const ARTICLE_WORKFLOW_SCHEMA_VERSION = 1;

export const ARTICLE_WORKFLOW_STATUSES = Object.freeze([
  "queued",
  "generating-outline",
  "awaiting-outline-approval",
  "generating-content",
  "generating-media",
  "processing-seo",
  "needs-review",
  "changes-requested",
  "approved",
  "publishing",
  "published",
  "failed",
  "cancelled"
]);

export const ARTICLE_WORKFLOW_TRANSITIONS = Object.freeze({
  queued: ["generating-outline", "generating-content", "cancelled"],
  "generating-outline": ["awaiting-outline-approval", "queued", "failed", "cancelled"],
  "awaiting-outline-approval": ["generating-outline", "generating-content", "cancelled"],
  "generating-content": ["generating-media", "processing-seo", "queued", "failed", "cancelled"],
  "generating-media": ["processing-seo", "queued", "failed", "cancelled"],
  "processing-seo": ["needs-review", "queued", "failed", "cancelled"],
  "needs-review": ["changes-requested", "approved", "publishing", "cancelled"],
  "changes-requested": ["needs-review", "approved", "cancelled"],
  approved: ["changes-requested", "publishing", "cancelled"],
  publishing: ["published", "approved", "needs-review", "failed"],
  published: ["needs-review"],
  failed: ["queued", "cancelled"],
  cancelled: ["queued"]
});

const legacyWorkflowMap = Object.freeze({
  "draft-generated": "needs-review",
  "cluster-planned": "queued",
  "ready-to-publish": "approved",
  draft: "needs-review",
  error: "failed",
  pending: "queued",
  generating: "generating-content",
  completed: "needs-review",
  "outline-review": "awaiting-outline-approval"
});

function hasPublicWordPressPublication(article = {}) {
  if (article.wordpressPostId && article.wordpressPostUrl && article.wordpressPublishStatus !== "draft") return true;
  return (article.publishHistory || []).some((entry) =>
    entry?.status === "publish" && Boolean(entry?.postUrl)
  );
}

function hasArticleContent(article = {}) {
  return String(article.content || "").replace(/<[^>]+>/g, " ").trim().length > 0;
}

export function deriveLegacyQueueStatus(workflowStatus) {
  if (workflowStatus === "queued") return "pending";
  if (["generating-outline", "generating-content", "generating-media", "processing-seo", "publishing"].includes(workflowStatus)) return "generating";
  if (workflowStatus === "awaiting-outline-approval") return "outline-review";
  if (["needs-review", "changes-requested", "approved", "published"].includes(workflowStatus)) return "completed";
  if (workflowStatus === "failed") return "error";
  if (workflowStatus === "cancelled") return "cancelled";
  return "pending";
}

export function workflowStatusForGenerationStep(step = "") {
  const normalized = String(step).toLowerCase();
  if (normalized.includes("outline")) return "generating-outline";
  if (normalized.includes("image") || normalized.includes("media") || normalized.includes("featured")) return "generating-media";
  if (normalized.includes("seo") || normalized.includes("metadata") || normalized.includes("affiliate") || normalized.includes("internal-link")) return "processing-seo";
  return "generating-content";
}

export function canTransitionArticleWorkflow(from, to) {
  if (from === to) return true;
  return ARTICLE_WORKFLOW_TRANSITIONS[from]?.includes(to) === true;
}

export function articleGenerationEntryAction(article = {}, resolvedSettings = {}) {
  const requiresApproval = resolvedSettings.requireOutlineApproval === true
    || article.requireOutlineApproval === true;
  if (!requiresApproval || article.outlineApproved === true) return "generate-content";
  return String(article.outline || "").trim()
    ? "await-outline-approval"
    : "generate-outline";
}

export function normalizeArticleWorkflow(article = {}) {
  const rawWorkflow = String(article.workflowStatus || "").trim();
  let workflowStatus = ARTICLE_WORKFLOW_STATUSES.includes(rawWorkflow)
    ? rawWorkflow
    : legacyWorkflowMap[rawWorkflow];

  if (!workflowStatus) {
    if (article.queueStatus === "outline-review") workflowStatus = "awaiting-outline-approval";
    else if (article.queueStatus === "generating") workflowStatus = workflowStatusForGenerationStep(article.generationStep);
    else if (article.queueStatus === "completed") workflowStatus = hasPublicWordPressPublication(article) ? "published" : "needs-review";
    else if (article.queueStatus === "error") workflowStatus = "failed";
    else if (article.queueStatus === "cancelled") workflowStatus = "cancelled";
    else workflowStatus = "queued";
  }

  if (workflowStatus === "published" && !hasPublicWordPressPublication(article)) {
    workflowStatus = hasArticleContent(article) ? "needs-review" : "queued";
  }
  if (["needs-review", "changes-requested", "approved"].includes(workflowStatus) && !hasArticleContent(article)) {
    workflowStatus = "queued";
  }

  return {
    ...article,
    workflowStatus,
    queueStatus: deriveLegacyQueueStatus(workflowStatus),
    workflowSchemaVersion: ARTICLE_WORKFLOW_SCHEMA_VERSION
  };
}

export async function recoverInterruptedArticles(articles = [], saveArticle, now = () => new Date().toISOString()) {
  if (typeof saveArticle !== "function") return Array.isArray(articles) ? articles : [];
  const recovered = [];

  for (const original of Array.isArray(articles) ? articles : []) {
    const normalized = normalizeArticleWorkflow(original);
    const isAwaitingApproval = normalized.workflowStatus === "awaiting-outline-approval";
    const isGenerating = [
      "generating-outline",
      "generating-content",
      "generating-media",
      "processing-seo",
      "publishing"
    ].includes(normalized.workflowStatus);

    if (!isGenerating && !isAwaitingApproval) {
      if (
        normalized.workflowStatus !== original.workflowStatus
        || normalized.queueStatus !== original.queueStatus
        || normalized.workflowSchemaVersion !== original.workflowSchemaVersion
      ) {
        recovered.push(await saveArticle(normalized));
      } else {
        recovered.push(original);
      }
      continue;
    }

    if (isAwaitingApproval) {
      const waiting = {
        ...normalized,
        requireOutlineApproval: true,
        outlineApproved: false
      };
      recovered.push(
        waiting.workflowStatus !== original.workflowStatus
        || waiting.queueStatus !== original.queueStatus
        || waiting.requireOutlineApproval !== original.requireOutlineApproval
        || waiting.outlineApproved !== original.outlineApproved
        || waiting.workflowSchemaVersion !== original.workflowSchemaVersion
          ? await saveArticle(waiting)
          : original
      );
      continue;
    }

    const timestamp = now();
    const outlineReadyForReview = normalized.workflowStatus === "generating-outline"
      && normalized.requireOutlineApproval === true
      && normalized.outlineApproved !== true
      && String(normalized.outline || "").trim();
    const workflowStatus = outlineReadyForReview ? "awaiting-outline-approval" : "queued";
    const next = {
      ...normalized,
      workflowStatus,
      queueStatus: deriveLegacyQueueStatus(workflowStatus),
      outlineApproved: normalized.requireOutlineApproval === true
        ? normalized.outlineApproved === true
        : true,
      errorMessage: "",
      recoveredAt: timestamp,
      generationRecoveryMessage: "Recovered from an interrupted generation step.",
      updatedAt: timestamp
    };
    recovered.push(await saveArticle(next));
  }

  return recovered;
}
