export function manualCategoryForSite(article = {}, site = {}) {
  const url = String(site.url || "").replace(/\/+$/, "");
  const categories = article.wordpressCategoriesBySite || {};
  if (Object.hasOwn(categories, url)) return categories[url] || "";
  const owner = String(article.wordpressCategorySiteUrl || article.wordpressSiteUrl || "").replace(/\/+$/, "");
  return owner === url || (!owner && !article.wordpressPostId) ? article.wordpressCategoryId || "" : "";
}

function normalize(value = "") {
  return String(value).toLowerCase().replace(/<[^>]+>/g, " ").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value = "") {
  const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "your", "you", "are", "how", "best", "ideas", "idea", "article", "recipe", "recipes", "easy", "simple"]);
  return normalize(value).split(" ").filter((token) => token.length > 2 && !stop.has(token));
}

const categorySignals = [
  { match: /air fryer/i, category: /air fryer/i, boost: 45 },
  { match: /breakfast|brunch|pancake|waffle|egg|oats|smoothie/i, category: /breakfast|brunch/i, boost: 42 },
  { match: /dessert|cake|cookie|brownie|pie|chocolate|sweet|no bake/i, category: /dessert|cookie|chocolate/i, boost: 45 },
  { match: /soup|stew|chili|broth/i, category: /soup|stew/i, boost: 45 },
  { match: /salad|bowl/i, category: /salad|bowl/i, boost: 38 },
  { match: /healthy|protein|meal prep|clean eating|low calorie|wellness/i, category: /healthy|protein|meal prep|clean eating|wellness/i, boost: 42 },
  { match: /weeknight|30 minute|quick|dinner|family dinner/i, category: /weeknight|quick|dinner|meal/i, boost: 36 },
  { match: /one pot|one pan|sheet pan|skillet|casserole/i, category: /one pot|one pan|sheet pan|dinner/i, boost: 40 },
  { match: /holiday|christmas|thanksgiving|easter|party|potluck/i, category: /holiday|party|appetizer/i, boost: 38 },
  { match: /snack|appetizer|dip|finger food/i, category: /snack|appetizer/i, boost: 40 },
  { match: /mocktail|non alcoholic|drink|cocktail|sipper|lemonade/i, category: /mocktail|drink|cocktail|sipper/i, boost: 45 },
  { match: /fall|pumpkin|apple|cozy/i, category: /fall|cozy|soup|stew/i, boost: 30 },
  { match: /spring|summer|fresh/i, category: /spring|summer|salad|sipper/i, boost: 28 }
];

export function matchWordPressCategory(article, site) {
  const categories = site?.categories || [];
  if (!categories.length) return { category: null, confidence: 0, reason: "No synced categories" };

  const haystack = [
    article.generatedTitle,
    article.title,
    article.seoBrief?.targetKeyword,
    article.seoBrief?.secondaryKeywords,
    article.metaDescription,
    article.excerpt,
    (article.content || "").match(/<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/gi)?.join(" ")
  ].filter(Boolean).join(" ");
  const normalizedHaystack = normalize(haystack);
  const articleTokens = tokens(haystack);

  let best = null;
  for (const category of categories) {
    const categoryText = [category.name, category.slug, category.description].join(" ");
    const normalizedCategory = normalize(categoryText);
    const categoryTokens = tokens(categoryText);
    const directName = normalizedHaystack.includes(normalize(category.name));
    const overlap = categoryTokens.filter((token) => articleTokens.includes(token)).length;
    const phraseMatch = articleTokens.some((token, index) => index < articleTokens.length - 1 && normalizedCategory.includes(`${token} ${articleTokens[index + 1]}`));
    const signalBoost = categorySignals.reduce((score, signal) => {
      return score + (signal.match.test(haystack) && signal.category.test(categoryText) ? signal.boost : 0);
    }, 0);
    const genericPenalty = /uncategorized|general|blog|favorite products/i.test(category.name) ? 18 : 0;
    const score = (directName ? 80 : 0)
      + (phraseMatch ? 30 : 0)
      + overlap * 12
      + signalBoost
      + (category.count ? Math.min(8, Math.log10(category.count + 1) * 2) : 0)
      - genericPenalty;
    if (!best || score > best.score) best = { category, score, overlap, directName, phraseMatch, signalBoost };
  }

  if (!best || best.score <= 0) {
    const fallback = categories.find((cat) => String(cat.id) === String(site.defaultCategoryId)) || null;
    return { category: fallback, confidence: fallback ? 35 : 0, reason: fallback ? "Fallback category" : "No close category match" };
  }

  const confidence = Math.max(45, Math.min(98, Math.round(35 + best.score)));
  return {
    category: best.category,
    confidence,
    reason: best.directName ? "Direct category name match" : best.signalBoost ? "Recipe intent match" : best.phraseMatch ? "Phrase match" : `${best.overlap} keyword overlap${best.overlap === 1 ? "" : "s"}`
  };
}

export function categoryNeedsReview(match) {
  return !match?.category || match.confidence < 60;
}
