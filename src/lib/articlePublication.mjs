export function isArticlePublished(article = {}) {
  if (article.workflowStatus === "published") return true;
  return (article.publishHistory || []).some(
    (entry) => entry?.status === "publish" && Boolean(entry.postUrl)
  );
}
