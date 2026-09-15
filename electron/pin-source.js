'use strict';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function publicUrl(...values) {
  return values.find((value) => /^https?:\/\//i.test(String(value || ''))) || '';
}

function recipeFromStructuredData(structuredData = '') {
  try {
    const parsed = typeof structuredData === 'string' ? JSON.parse(structuredData) : structuredData;
    const graph = safeArray(parsed?.['@graph']);
    return [parsed, ...graph].find((item) => item?.['@type'] === 'Recipe') || {};
  } catch {
    return {};
  }
}

function normalizeInstruction(value) {
  return String(typeof value === 'string' ? value : value?.text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeImage(image = {}, kind = 'article-inline', index = 0) {
  return {
    id: String(image.id || `${kind}-${index}`),
    kind,
    localPath: String(image.localPath || ''),
    localUrl: String(image.localUrl || image.localImageUrl || image.displayUrl || ''),
    publicUrl: publicUrl(image.remoteImageUrl, image.publicUrl, image.url, image.displayUrl),
    aspectRatio: String(image.aspectRatio || image.ratio || ''),
    altText: String(image.altText || image.alt || '').slice(0, 500),
    prompt: String(image.prompt || '').slice(0, 1600)
  };
}

function buildPinSourceSnapshot(article = {}) {
  const recipe = recipeFromStructuredData(article.structuredData);
  const featured = normalizeImage({
    id: 'featured',
    localPath: article.featuredImageLocalPath,
    localUrl: article.featuredImageLocalUrl || article.featuredImageDisplay,
    remoteImageUrl: article.featuredImageRemoteUrl,
    url: article.featuredImage,
    aspectRatio: article.featuredImageAspectRatio || article.featuredImageRequestedAspectRatio,
    altText: article.featuredImageAlt,
    prompt: article.featuredImagePrompt
  }, 'article-featured', 0);
  const images = safeArray(article.images).map((image, index) => normalizeImage(image, 'article-inline', index));
  const allImages = [featured, ...images].filter((image) => image.localPath || image.localUrl || image.publicUrl);
  const portraitImage = allImages.find((image) => image.aspectRatio === '9:16')
    || allImages.find((image) => image.aspectRatio === '2:3')
    || allImages.find((image) => /portrait|vertical|9:16/i.test(`${image.prompt} ${image.altText}`))
    || null;
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    articleId: String(article.id || ''),
    canonicalUrl: article.wordpressPostUrl || article.sourceUrl || '',
    title: article.generatedTitle || article.title || '',
    excerpt: article.excerpt || article.metaDescription || '',
    targetKeyword: article.rankMathFocusKeyword || article.seoBrief?.targetKeyword || '',
    secondaryKeywords: String(article.seoBrief?.secondaryKeywords || '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12),
    recipe: {
      name: recipe.name || article.generatedTitle || article.title || '',
      ingredients: safeArray(recipe.recipeIngredient).map((item) => String(item)).slice(0, 30),
      instructions: safeArray(recipe.recipeInstructions).map(normalizeInstruction).filter(Boolean).slice(0, 18),
      prepTime: recipe.prepTime || '',
      cookTime: recipe.cookTime || '',
      totalTime: recipe.totalTime || '',
      yield: recipe.recipeYield || '',
      cuisine: recipe.recipeCuisine || '',
      category: recipe.recipeCategory || ''
    },
    images: allImages,
    preferredPortraitImageId: portraitImage?.id || ''
  };
}

function sanitizePinSourceSnapshot(snapshot = {}) {
  return {
    version: 1,
    capturedAt: String(snapshot.capturedAt || ''),
    articleId: String(snapshot.articleId || ''),
    canonicalUrl: String(snapshot.canonicalUrl || ''),
    title: String(snapshot.title || '').slice(0, 300),
    excerpt: String(snapshot.excerpt || '').slice(0, 1600),
    targetKeyword: String(snapshot.targetKeyword || '').slice(0, 180),
    secondaryKeywords: safeArray(snapshot.secondaryKeywords).map(String).filter(Boolean).slice(0, 12),
    recipe: {
      name: String(snapshot.recipe?.name || '').slice(0, 300),
      ingredients: safeArray(snapshot.recipe?.ingredients).map(String).filter(Boolean).slice(0, 30),
      instructions: safeArray(snapshot.recipe?.instructions).map(String).filter(Boolean).slice(0, 18),
      prepTime: String(snapshot.recipe?.prepTime || ''),
      cookTime: String(snapshot.recipe?.cookTime || ''),
      totalTime: String(snapshot.recipe?.totalTime || ''),
      yield: String(snapshot.recipe?.yield || ''),
      cuisine: String(snapshot.recipe?.cuisine || ''),
      category: String(snapshot.recipe?.category || '')
    },
    images: safeArray(snapshot.images).map(normalizeImage).slice(0, 12),
    preferredPortraitImageId: String(snapshot.preferredPortraitImageId || '')
  };
}

module.exports = { buildPinSourceSnapshot, sanitizePinSourceSnapshot };
