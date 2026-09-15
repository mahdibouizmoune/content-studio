function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function publicUrl(...values) {
  return values.find((value) => /^https?:\/\//i.test(String(value || ""))) || "";
}

function recipeFromStructuredData(structuredData = "") {
  try {
    const parsed = typeof structuredData === "string" ? JSON.parse(structuredData) : structuredData;
    const graph = safeArray(parsed?.["@graph"]);
    return [parsed, ...graph].find((item) => item?.["@type"] === "Recipe") || {};
  } catch {
    return {};
  }
}

function normalizeInstruction(value) {
  return String(typeof value === "string" ? value : value?.text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeImage(image = {}, kind = "article-inline", index = 0) {
  return {
    id: image.id || `${kind}-${index}`,
    kind,
    localPath: image.localPath || "",
    localUrl: image.localUrl || image.localImageUrl || image.displayUrl || "",
    publicUrl: publicUrl(image.remoteImageUrl, image.publicUrl, image.url, image.displayUrl),
    aspectRatio: image.aspectRatio || image.ratio || "",
    altText: image.altText || image.alt || "",
    prompt: image.prompt || ""
  };
}

export function buildPinSourceSnapshot(article = {}) {
  const recipe = recipeFromStructuredData(article.structuredData);
  const featured = normalizeImage({
    id: "featured",
    localPath: article.featuredImageLocalPath,
    localUrl: article.featuredImageLocalUrl || article.featuredImageDisplay,
    remoteImageUrl: article.featuredImageRemoteUrl,
    url: article.featuredImage,
    aspectRatio: article.featuredImageAspectRatio || article.featuredImageRequestedAspectRatio,
    altText: article.featuredImageAlt,
    prompt: article.featuredImagePrompt
  }, "article-featured", 0);
  const images = safeArray(article.images).map((image, index) => normalizeImage(image, "article-inline", index));
  const allImages = [featured, ...images].filter((image) => image.localPath || image.localUrl || image.publicUrl);
  const portraitImage = allImages.find((image) => image.aspectRatio === "9:16")
    || allImages.find((image) => image.aspectRatio === "2:3")
    || allImages.find((image) => /portrait|vertical|9:16/i.test(`${image.prompt} ${image.altText}`))
    || null;

  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    articleId: String(article.id || ""),
    canonicalUrl: article.wordpressPostUrl || article.sourceUrl || "",
    title: article.generatedTitle || article.title || "",
    excerpt: article.excerpt || article.metaDescription || "",
    targetKeyword: article.rankMathFocusKeyword || article.seoBrief?.targetKeyword || "",
    secondaryKeywords: String(article.seoBrief?.secondaryKeywords || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12),
    recipe: {
      name: recipe.name || article.generatedTitle || article.title || "",
      ingredients: safeArray(recipe.recipeIngredient).map((item) => String(item)).slice(0, 30),
      instructions: safeArray(recipe.recipeInstructions).map(normalizeInstruction).filter(Boolean).slice(0, 18),
      prepTime: recipe.prepTime || "",
      cookTime: recipe.cookTime || "",
      totalTime: recipe.totalTime || "",
      yield: recipe.recipeYield || "",
      cuisine: recipe.recipeCuisine || "",
      category: recipe.recipeCategory || ""
    },
    images: allImages,
    preferredPortraitImageId: portraitImage?.id || ""
  };
}

export function stablePinContentId(pin = {}, prefix = "pin") {
  const stable = String(pin.id || pin.articleId || pin.url || "1")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return `${prefix}_${stable || "1"}`;
}

export function selectPinterestPublicImage(pin = {}) {
  if (pin.imageQa?.publicUrlVerified !== true
    || pin.imageQa?.publicDimensionsVerified !== true
    || pin.imageQa?.publicIdentityVerified !== true
    || pin.imageQa?.publicAssetKind !== "finished-pinterest-pin"
    || Number(pin.imageQa?.publicWidth || 0) !== 1000
    || Number(pin.imageQa?.publicHeight || 0) !== 1500) return "";
  const validatedUrl = String(pin.imageQa?.publicValidatedUrl || "");
  if (!validatedUrl) return "";
  const candidates = [
    pin.csvMediaUrl,
    pin.hostedImageUrl,
    pin.imgurUrl
  ].filter((url) => {
    if (!/^https:\/\//i.test(String(url || ""))) return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  });
  return candidates.find((url) => {
    if (url !== validatedUrl) return false;
    const host = new URL(url).hostname;
    return !/(\.|^)replicate\.delivery$|(\.|^)replicate\.com$/i.test(host);
  }) || "";
}
