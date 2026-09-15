function resolveRendererSecret(candidate, fallback, placeholder) {
  const value = String(candidate || '').trim();
  if (value && value !== placeholder && !value.startsWith('enc:')) return value;
  return String(fallback || '').trim();
}

function recoverMaskedTokenFailures(articles = []) {
  let recovered = 0;
  const nextArticles = (Array.isArray(articles) ? articles : []).map((article) => {
    const message = String(article?.errorMessage || article?.error || '');
    if (article?.queueStatus !== 'error' || !/Replicate 401:.*valid authentication token/i.test(message)) return article;
    recovered += 1;
    return {
      ...article,
      queueStatus: 'pending',
      workflowStatus: 'queued',
      errorMessage: '',
      error: '',
      retryCount: 0,
      recoveredAt: new Date().toISOString(),
      recoveryNote: 'Returned to queue after the secure-token resolver was repaired.'
    };
  });
  return { articles: nextArticles, recovered };
}

module.exports = { recoverMaskedTokenFailures, resolveRendererSecret };
