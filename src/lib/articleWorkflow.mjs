export async function recoverInterruptedArticles(articles = [], saveArticle, now = () => new Date().toISOString()) {
  if (typeof saveArticle !== "function") return Array.isArray(articles) ? articles : [];
  return Promise.all((Array.isArray(articles) ? articles : []).map(async (article) => {
    if (!["generating", "outline-review"].includes(article?.queueStatus)) return article;
    const timestamp = now();
    return saveArticle({
      ...article,
      queueStatus: "pending",
      requireOutlineApproval: false,
      outlineApproved: true,
      errorMessage: "",
      recoveredAt: timestamp,
      updatedAt: timestamp
    });
  }));
}
