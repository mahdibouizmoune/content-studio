export function isArticlePublished(article = {}) {
  if (
    article.workflowStatus === "published"
    && article.wordpressPostId
    && article.wordpressPostUrl
    && article.wordpressPublishStatus !== "draft"
  ) return true;
  return (article.publishHistory || []).some(
    (entry) => entry?.status === "publish" && Boolean(entry.postUrl)
  );
}
