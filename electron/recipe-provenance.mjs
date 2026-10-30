export function isAiWrittenRecipe(article = {}) {
  return article.generationProvenance?.kind === 'ai'
    || Boolean(article.generationCheckpoint)
    || article.recipeCardRepairApplied === true
    // Completed recipes from earlier versions cleared their checkpoint but kept this flag.
    || Object.hasOwn(article, 'editorialQualityPassApplied');
}

export function generationMetadata(article = {}, checkpoint = article.generationCheckpoint || {}) {
  return {
    generationProvenance: article.generationProvenance?.kind === 'ai'
      ? article.generationProvenance
      : { kind: 'ai', recordedAt: new Date().toISOString() },
    ...(checkpoint.recipeCollection || article.recipeCollection
      ? { recipeCollection: checkpoint.recipeCollection || article.recipeCollection } : {})
  };
}
