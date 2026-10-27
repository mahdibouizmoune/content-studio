import editorialRules from '../../electron/assets/editorial-rules.json' with { type: 'json' };

function stripHtml(value = "") {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value = "") {
  return stripHtml(value).split(/\s+/).filter(Boolean).length;
}

function issue(id, reason, fix, severity = "warning") {
  return { id, reason, fix, severity };
}

function scoreCategory(id, label, checks) {
  const normalized = checks.map((check) => ({ weight: 1, ...check }));
  const possible = normalized.reduce((sum, check) => sum + check.weight, 0);
  const earned = normalized.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  return {
    id,
    label,
    score: Math.round((earned / Math.max(1, possible)) * 100),
    issues: normalized.filter((check) => !check.ok).map((check) => check.issue)
  };
}

function recipeFacts(article, content) {
  const hasCard = /id=["']recipe-card["']/i.test(content);
  const hasIngredients = /<h3[^>]*>\s*ingredients\s*<\/h3>[\s\S]*?<li\b/i.test(content);
  const hasInstructions = /<h3[^>]*>\s*instructions\s*<\/h3>[\s\S]*?<(?:ol|ul)[^>]*>[\s\S]*?<li\b/i.test(content);
  const hasTiming = /prep time|cook time|total time/i.test(content);
  const hasYield = /servings|yield/i.test(content);
  let schema = null;
  try { schema = article.structuredData ? JSON.parse(article.structuredData) : null; } catch {}
  const schemaType = Array.isArray(schema?.["@type"]) ? schema["@type"] : [schema?.["@type"]];
  return {
    hasCard,
    hasIngredients,
    hasInstructions,
    hasTiming,
    hasYield,
    schema,
    validRecipeSchema: schemaType.includes("Recipe"),
    schemaIngredients: Array.isArray(schema?.recipeIngredient) ? schema.recipeIngredient.filter(Boolean) : [],
    schemaInstructions: Array.isArray(schema?.recipeInstructions) ? schema.recipeInstructions.filter(Boolean) : [],
    schemaHasTiming: Boolean(schema?.totalTime || (schema?.prepTime && schema?.cookTime)),
    schemaHasYield: Boolean(schema?.recipeYield),
    schemaHasImage: Boolean(Array.isArray(schema?.image) ? schema.image.length : schema?.image)
  };
}

export function buildArticleQualityReport(article = {}, options = {}) {
  const content = String(article.content || "");
  const text = stripHtml(content);
  const lower = text.toLowerCase();
  const title = String(article.generatedTitle || article.title || "").trim();
  const keyword = String(article.rankMathFocusKeyword || article.articleBrief?.primaryKeyword || article.seoBrief?.targetKeyword || "").trim();
  const keywordLower = keyword.toLowerCase();
  const intro = stripHtml(content.split(/<h2\b/i)[0] || "").toLowerCase();
  const headings = [...content.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)].map((match) => stripHtml(match[1]));
  const paragraphs = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => stripHtml(match[1]));
  const words = countWords(content);
  const metadataTitle = String(article.rankMathTitle || article.metaTitle || "").trim();
  const metadataDescription = String(article.rankMathDescription || article.metaDescription || "").trim();
  const slug = String(article.slug || "").trim();
  const links = [...content.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)].map((match) => match[1]);
  const siteOrigin = (() => {
    try {
      return new URL(options.site?.url || article.wordpressPostUrl || article.canonicalUrl || article.sourceUrl || "").origin;
    } catch {
      return "";
    }
  })();
  const linkedRecords = (Array.isArray(article.internalLinks) ? article.internalLinks : [])
    .map((item) => item?.url)
    .filter(Boolean);
  const isInternal = (url) => {
    if (String(url).startsWith('#')) return false;
    if (!siteOrigin) return String(url).startsWith('/') && !String(url).startsWith('//');
    try {
      return new URL(url, siteOrigin).origin === siteOrigin;
    } catch {
      return false;
    }
  };
  const contentInternalLinks = links.filter(isInternal).map(url => {
    try { const parsed = new URL(url, siteOrigin || 'https://local.invalid'); parsed.hash = ''; return parsed.href; }
    catch { return url; }
  });
  const internalLinks = [...new Set([...links, ...linkedRecords].filter(isInternal))];
  const duplicateLinks = contentInternalLinks.filter((url, index) => contentInternalLinks.indexOf(url) !== index);
  const affiliateLinks = Array.isArray(article.affiliateLinks) ? article.affiliateLinks : [];
  const disclosureReady = !affiliateLinks.length || article.affiliateDisclosureApplied === true || /affiliate|commission/i.test(content);
  const recipe = recipeFacts(article, content);
  const wantsRecipe = article.recipeCardEnabled !== false && (
    article.recipeCardEnabled === true || recipe.hasCard
    || article.articleBrief?.recipeRequirements?.completeRecipeCard === true
  );
  const unresolvedPlaceholders = /\[(?:insert|add|recipe name|ingredient|time|number|description|step)[^\]]*\]|\{\{[^}]+\}\}|\$\{[^}]+\}/i.test(content);
  const promptLeak = editorialRules.promptLeakPatterns.some(pattern => new RegExp(pattern, 'i').test(text));
  const firstHandClaim = /\b(?:i|we)\s+(?:tested|reviewed|tried|found in our tests|personally use)\b/i.test(text);
  const inventedRatingPattern = /\b\d(?:\.\d)?\s*(?:out of 5|stars?)\b/i.test(text) && !article.userProvidedRating;
  const roboticPhrases = (lower.match(/\b(?:in today's fast-paced world|delve into|culinary journey|food lovers rejoice|game-changer)\b/g) || []).length;
  const longParagraphs = paragraphs.filter((paragraph) => paragraph.split(/\s+/).length > 120).length;
  const repeatedParagraphs = paragraphs
    .map((paragraph) => paragraph.toLowerCase().replace(/\s+/g, " ").trim())
    .filter((paragraph, index, values) => paragraph.length > 80 && values.indexOf(paragraph) !== index);
  const targetMin = Number(String(article.articleLength || article.articleBrief?.recommendedLength || "900-1200").split("-")[0]) || 900;

  const categories = [
    scoreCategory("intent", "Search-intent match", [
      { ok: Boolean(keyword), weight: 2, issue: issue("missing-primary-keyword", "The article has no primary keyword.", "Add one clear primary keyword that matches the reader's query.", "critical") },
      { ok: !keywordLower || intro.includes(keywordLower) || intro.split(/\s+/).length >= 80, issue: issue("weak-early-answer", "The opening does not clearly connect to the primary topic.", "Answer the main question and establish the recipe or recommendation in the first paragraph.") },
      { ok: headings.length >= 3, issue: issue("weak-heading-coverage", "The article has too few useful sections.", "Add headings that follow the reader's decisions and likely questions.") }
    ]),
    scoreCategory("reader-value", "Reader value", [
      { ok: /why|works|benefit|best for|ideal for/i.test(content), issue: issue("missing-why", "The article does not explain why the method or recommendation works.", "Add a concise explanation tied to the actual ingredients, technique, or decision.") },
      { ok: /substitut|swap|alternative/i.test(content), issue: issue("missing-substitutions", "Useful substitutions are missing.", "Add realistic substitutions and explain how each changes the result.") },
      { ok: /mistake|avoid|troubleshoot|fix|rescue/i.test(content), issue: issue("missing-troubleshooting", "The reader is not warned about likely failure points.", "Add the most likely mistake, how to prevent it, and how to recover.") },
      { ok: !wantsRecipe || /storage|refrigerat|freez/i.test(content), issue: issue("missing-storage", "Storage guidance is missing.", "Add refrigerator duration, freezer suitability, and safe storage guidance.") },
      { ok: !wantsRecipe || /reheat|serve (?:cold|chilled|immediately)|best served|room temperature/i.test(content), issue: issue("missing-reheating", "Serving-temperature guidance is missing.", "Explain reheating when appropriate, or how to serve a cold dish and protect its texture.") }
    ]),
    scoreCategory("completeness", "Completeness", [
      { ok: words >= Math.max(600, Math.round(targetMin * 0.8)), weight: 3, issue: issue("thin-content", `The draft has ${words} words and is below its useful target.`, "Complete the missing reader tasks instead of padding the article.", "critical") },
      { ok: Boolean(article.articleBrief), issue: issue("missing-article-brief", "No saved article brief supports this draft.", "Create or review the article brief before approval.") },
      { ok: Boolean(article.outline) || article.requireOutlineApproval !== true, issue: issue("missing-outline", "The required outline is missing.", "Generate and review an outline before continuing.", "critical") }
    ]),
    scoreCategory("originality", "Originality", [
      { ok: roboticPhrases === 0, issue: issue("robotic-language", "The draft contains generic AI-style phrases.", "Replace generic phrasing with specific recipe or topic details.") },
      { ok: repeatedParagraphs.length === 0, issue: issue("repeated-paragraphs", "The draft repeats a paragraph or near-identical block.", "Remove repetition and use the space for distinct practical value.") },
      { ok: !/\bultimate guide\b/gi.test(title) || words >= 1400, issue: issue("generic-angle", "The title promises a broad guide without enough depth.", "Narrow the promise or add genuinely complete coverage.") }
    ]),
    scoreCategory("readability", "Readability", [
      { ok: longParagraphs === 0, issue: issue("long-paragraphs", `${longParagraphs} paragraph${longParagraphs === 1 ? " is" : "s are"} difficult to scan.`, "Split long paragraphs around one decision or action each.") },
      { ok: headings.every((heading) => !/\u2014/.test(heading)), issue: issue("heading-em-dash", "A heading contains an em dash.", "Use a colon, comma, or short separate heading.") },
      { ok: paragraphs.length >= 3, issue: issue("weak-paragraph-structure", "The draft lacks a readable paragraph structure.", "Use short paragraphs and lists where they improve scanning.") }
    ]),
    scoreCategory("seo", "SEO", [
      { ok: metadataTitle.length >= 25 && metadataTitle.length <= 65, issue: issue("seo-title-length", "The SEO title is missing or unclear.", "Write a clear, natural SEO title that is usually about 50 to 60 characters.", "critical") },
      { ok: metadataDescription.length >= 110 && metadataDescription.length <= 165, issue: issue("meta-description-length", "The meta description is missing or not a useful snippet length.", "Write a specific 140 to 160 character description that matches the article.", "critical") },
      { ok: Boolean(slug), issue: issue("missing-slug", "The article has no clean slug.", "Add a short, readable slug.", "critical") },
      { ok: !keywordLower || `${title} ${metadataTitle} ${intro}`.toLowerCase().includes(keywordLower), issue: issue("keyword-context", "The primary keyword is not used in an important natural location.", "Use the topic naturally in the title, opening, or a useful heading.") },
      { ok: (article.images || []).every((image) => Boolean(image.altText)) && (!article.featuredImage || Boolean(article.featuredImageAlt)), issue: issue("missing-alt-text", "One or more images are missing descriptive alt text.", "Describe the visible food or action without keyword stuffing.") }
    ]),
    scoreCategory("trust", "Trust and accuracy", [
      { ok: !firstHandClaim, weight: 2, issue: issue("unsupported-first-hand-claim", "The draft claims personal testing or experience that was not supplied.", "Remove the claim or attach user-provided evidence.", "critical") },
      { ok: !inventedRatingPattern, weight: 2, issue: issue("unsupported-rating", "The draft appears to include an unsupported rating.", "Remove ratings and review counts unless they are verified user data.", "critical") },
      { ok: !unresolvedPlaceholders, weight: 2, issue: issue("unresolved-placeholder", "The draft still contains placeholder text.", "Replace every placeholder with verified content.", "critical") },
      { ok: !promptLeak, weight: 2, issue: issue("prompt-leak", "Generation instructions appear in reader-facing copy.", "Remove the instruction text and review the opening and excerpt.", "critical") },
      { ok: !/\b(?:guaranteed|miracle|cure|detoxes|melts fat)\b/i.test(text), issue: issue("unsupported-claim", "The draft contains an exaggerated or potentially unsupported claim.", "Use cautious, factual language and flag claims that need sources.", "critical") }
    ]),
    scoreCategory("recipe", "Recipe validity", [
      { ok: !wantsRecipe || recipe.hasCard, weight: 2, issue: issue("missing-recipe-card", "A complete recipe card is required but missing.", "Add the recipe card at the end of the article.", "critical") },
      { ok: !wantsRecipe || recipe.hasIngredients, issue: issue("missing-recipe-ingredients", "Recipe ingredients are missing.", "Add exact measured ingredients in order of use.", "critical") },
      { ok: !wantsRecipe || recipe.hasInstructions, issue: issue("missing-recipe-instructions", "Recipe instructions are missing.", "Add complete ordered instructions with timing and doneness cues.", "critical") },
      { ok: !wantsRecipe || (recipe.hasTiming && recipe.hasYield), issue: issue("missing-recipe-facts", "Recipe timing or yield is missing.", "Add prep time, cook time, total time, and servings.", "critical") },
      { ok: !wantsRecipe || recipe.validRecipeSchema, issue: issue("invalid-recipe-schema", "Recipe structured data is missing or invalid.", "Repair the Recipe JSON-LD so it agrees with visible content.", "critical") },
      { ok: !wantsRecipe || (recipe.schemaIngredients.length > 0 && recipe.schemaInstructions.length >= 3), issue: issue("incomplete-recipe-schema", "Recipe schema is missing complete ingredients or instructions.", "Regenerate Recipe JSON-LD from the visible recipe card.", "critical") },
      { ok: !wantsRecipe || (recipe.schemaHasTiming && recipe.schemaHasYield), issue: issue("recipe-schema-facts", "Recipe schema is missing timing or yield.", "Add consistent timing and yield to both the visible card and Recipe JSON-LD.", "critical") },
      { ok: !wantsRecipe || recipe.schemaHasImage || !article.featuredImageRemoteUrl, issue: issue("recipe-schema-image", "Recipe schema is missing the public recipe image.", "Add the final public WordPress image URL to Recipe JSON-LD.") },
      { ok: !recipe.schema?.aggregateRating && !recipe.schema?.review, issue: issue("unsupported-recipe-rating", "Recipe schema contains ratings or reviews without verified user data.", "Remove fake aggregateRating and review fields.", "critical") },
      { ok: !recipe.schema?.video || Boolean(article.videoUrl || article.wordpressVideoUrl), issue: issue("unsupported-recipe-video", "Recipe schema references a video that is not attached to this article.", "Remove the video property or attach the real public video.", "critical") }
    ]),
    scoreCategory("internal-links", "Internal linking", [
      { ok: internalLinks.length > 0 || options.internalLinksOptional === true, issue: issue("missing-internal-links", "No helpful internal links are included.", "Add relevant links based on reader journey, technique, ingredients, or content cluster.") },
      { ok: duplicateLinks.length === 0, issue: issue("duplicate-internal-links", "The same destination is linked repeatedly.", "Keep one useful contextual link per destination.") }
    ]),
    scoreCategory("commercial", "Commercial balance", [
      { ok: disclosureReady, weight: 2, issue: issue("missing-affiliate-disclosure", "Affiliate links are present without a disclosure.", "Add a clear disclosure before the first affiliate recommendation.", "critical") },
      { ok: affiliateLinks.length <= Number(options.maxAffiliateLinks || 3), issue: issue("too-many-affiliate-links", "The article contains too many product recommendations.", "Keep only products that solve a problem discussed in the article.") },
      { ok: affiliateLinks.every((item) => item.trackingVerified !== false), issue: issue("unverified-affiliate-link", "An affiliate destination is not verified.", "Remove or replace the unverified recommendation.", "critical") }
    ])
  ];

  const allIssues = categories.flatMap((category) =>
    category.issues.map((entry) => ({ ...entry, categoryId: category.id, category: category.label }))
  );
  if (options.requireFeaturedImage && !(article.featuredImage || article.featuredImageLocalPath)) {
    allIssues.push({
      ...issue("missing-featured-image", "A featured image is required but missing.", "Generate or select a featured image.", "critical"),
      categoryId: "seo",
      category: "SEO"
    });
  }
  if (article.requireOutlineApproval === true && article.outlineApproved !== true) {
    allIssues.push({
      ...issue("outline-approval-pending", "Outline approval is still pending.", "Approve the outline before publication.", "critical"),
      categoryId: "completeness",
      category: "Completeness"
    });
  }
  if (options.requireSite && !options.site?.url) {
    allIssues.push({
      ...issue("publishing-site-missing", "No WordPress site is selected.", "Select a publishing site.", "critical"),
      categoryId: "seo",
      category: "SEO"
    });
  }

  const critical = allIssues.filter((entry) => entry.severity === "critical");
  const warning = allIssues.filter((entry) => entry.severity !== "critical");
  const averageScore = Math.round(categories.reduce((sum, category) => sum + category.score, 0) / categories.length);
  return {
    schemaVersion: 1,
    status: critical.length ? "blocked" : warning.length ? "needs-review" : "ready",
    averageScore,
    categories,
    blockers: critical,
    warnings: warning,
    wordCount: words,
    checkedAt: new Date().toISOString()
  };
}

export function canApproveArticle(article = {}, options = {}) {
  const report = buildArticleQualityReport(article, options);
  return { allowed: report.blockers.length === 0, report };
}
