function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function firstMatch(html, pattern) {
  const match = String(html || '').match(pattern);
  return decodeHtml(match?.[1] || '').trim();
}

function metaContent(html, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return firstMatch(
    html,
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>|<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i')
  ) || firstMatch(
    html,
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, 'i')
  );
}

function findRecipeNodes(value, results = []) {
  if (!value || typeof value !== 'object') return results;
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  if (types.some((type) => String(type || '').toLowerCase() === 'recipe')) results.push(value);
  Object.values(value).forEach((child) => {
    if (child && typeof child === 'object') findRecipeNodes(child, results);
  });
  return results;
}

function parseJsonLd(html = '') {
  const nodes = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]).replace(/^\uFEFF/, '').trim());
      findRecipeNodes(parsed, nodes);
    } catch {}
  }
  return nodes;
}

function auditRecipeHtml({ html = '', url = '', status = 200 } = {}) {
  const recipe = parseJsonLd(html)[0] || null;
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = metaContent(html, 'description');
  const canonical = firstMatch(html, /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i)
    || firstMatch(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["'][^>]*>/i);
  const robots = metaContent(html, 'robots');
  const images = [...String(html).matchAll(/<img\b([^>]*)>/gi)];
  const missingAltImages = images.filter((entry) => !/\balt\s*=\s*["'][^"']+["']/i.test(entry[1])).length;
  const internalLinks = [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((entry) => entry[1])
    .filter((href) => {
      try {
        return href.startsWith('/') || new URL(href, url).origin === new URL(url).origin;
      } catch {
        return false;
      }
    }).length;
  const required = {
    name: Boolean(recipe?.name),
    image: Boolean(recipe?.image)
  };
  const recommended = {
    recipeIngredient: Array.isArray(recipe?.recipeIngredient) && recipe.recipeIngredient.length > 0,
    recipeInstructions: Boolean(recipe?.recipeInstructions && (Array.isArray(recipe.recipeInstructions) ? recipe.recipeInstructions.length : true)),
    prepTime: Boolean(recipe?.prepTime),
    cookTime: Boolean(recipe?.cookTime),
    totalTime: Boolean(recipe?.totalTime),
    recipeYield: Boolean(recipe?.recipeYield),
    nutrition: Boolean(recipe?.nutrition)
  };
  const checks = [
    { id: 'http', label: 'Page returns HTTP 200', passed: Number(status) >= 200 && Number(status) < 300, weight: 14 },
    { id: 'title', label: 'SEO title is present', passed: title.length >= 20 && title.length <= 65, weight: 10 },
    { id: 'description', label: 'Meta description is present', passed: description.length >= 70 && description.length <= 180, weight: 10 },
    { id: 'canonical', label: 'Canonical URL is present', passed: Boolean(canonical), weight: 8 },
    { id: 'indexable', label: 'Page does not request noindex', passed: !/\bnoindex\b/i.test(robots), weight: 14 },
    { id: 'recipe', label: 'Recipe JSON-LD is present', passed: Boolean(recipe), weight: 14 },
    { id: 'recipe-required', label: 'Recipe name and image are present', passed: required.name && required.image, weight: 12 },
    { id: 'recipe-details', label: 'Recipe details are complete', passed: Object.values(recommended).filter(Boolean).length >= 6, weight: 10 },
    { id: 'alts', label: 'Images have alt text', passed: missingAltImages === 0, weight: 4 },
    { id: 'links', label: 'Page has internal links', passed: internalLinks >= 2, weight: 4 }
  ];
  const score = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
  return {
    url,
    auditedAt: new Date().toISOString(),
    status: Number(status || 0),
    score,
    grade: score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Needs work' : 'Critical',
    title,
    description,
    canonical,
    robots,
    recipeFound: Boolean(recipe),
    recipeRequired: required,
    recipeRecommended: recommended,
    missingAltImages,
    internalLinks,
    checks
  };
}

module.exports = {
  auditRecipeHtml,
  findRecipeNodes,
  parseJsonLd
};
