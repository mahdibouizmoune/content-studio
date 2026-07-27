const foodTerms = /\b(recipe|recipes|chicken|beef|pork|fish|shrimp|pasta|rice|soup|stew|salad|cake|cookie|bread|breakfast|dinner|lunch|dessert|drink|mocktail|air fryer|slow cooker|instant pot)\b/i;

function list(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(/[\n,|]/).map((item) => item.trim()).filter(Boolean);
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function compactTitle(title = "") {
  return String(title || "").replace(/\s+/g, " ").trim();
}

function inferredQuestions(keyword, isRecipe, isCollection) {
  if (isCollection) {
    return [
      `Which ${keyword} ideas best match different occasions or time limits?`,
      "What makes each option meaningfully different?",
      "Which options can be made ahead or stored?",
      "What substitutions or shortcuts are realistic?"
    ];
  }
  if (isRecipe) {
    return [
      `How do you make ${keyword} successfully?`,
      "Which ingredients matter most and what can be substituted?",
      "What visual or temperature cues show it is done?",
      "How should leftovers be stored and reheated?",
      "What common mistake is most likely and how can it be fixed?"
    ];
  }
  return [
    `What does the reader need to know about ${keyword}?`,
    "Which option or approach fits the reader's situation?",
    "What common mistakes should the reader avoid?",
    "What practical next step can the reader take?"
  ];
}

function inferredHeadings(isRecipe, isCollection) {
  if (isCollection) {
    return [
      "How to choose from this collection",
      "Recipe ideas and practical details",
      "Make-ahead, storage, and serving guidance",
      "Common questions"
    ];
  }
  if (isRecipe) {
    return [
      "Why this recipe works",
      "Ingredients and useful substitutions",
      "Step-by-step instructions",
      "Doneness cues and common mistakes",
      "Storage, reheating, and make-ahead tips",
      "Serving ideas",
      "Common questions"
    ];
  }
  return [
    "Direct answer and key takeaway",
    "How to choose or begin",
    "Step-by-step guidance",
    "Common mistakes",
    "Practical examples",
    "Common questions"
  ];
}

export function buildArticleBrief({
  article = {},
  resolvedSettings = {},
  cannibalizationConflicts = []
} = {}) {
  const seoBrief = resolvedSettings.seoBrief || article.seoBrief || {};
  const title = compactTitle(article.generatedTitle || article.title);
  const primaryKeyword = compactTitle(
    resolvedSettings.primaryKeyword
    || seoBrief.targetKeyword
    || article.rankMathFocusKeyword
    || title
  );
  const secondaryKeywords = unique([
    ...list(resolvedSettings.secondaryKeywords || seoBrief.secondaryKeywords),
    ...list(article.tags)
  ]).slice(0, 15);
  const articleType = resolvedSettings.contentType || article.type || "article";
  const isCollection = articleType === "listicle" || /^\s*\d+\b/.test(title);
  const isRecipe = foodTerms.test(`${title} ${primaryKeyword}`) || article.category === "food";
  const targetAudience = compactTitle(
    resolvedSettings.targetAudience
    || resolvedSettings.audience
    || seoBrief.audience
    || "Readers who want practical, trustworthy guidance they can use immediately"
  );
  const searchIntent = resolvedSettings.searchIntent || seoBrief.searchIntent || "informational";
  const recommendedLength = resolvedSettings.articleLength || article.articleLength || "900-1200";
  const existing = article.articleBrief || {};

  const generated = {
    schemaVersion: 1,
    workingTitle: title,
    primaryKeyword,
    secondaryKeywords,
    searchIntent,
    targetAudience,
    readerProblem: seoBrief.readerTask
      || (isRecipe
        ? `The reader needs complete, consistent instructions for making ${primaryKeyword} without searching another page for missing details.`
        : `The reader needs a clear answer and practical next steps for ${primaryKeyword}.`),
    articlePromise: isRecipe
      ? `Deliver a complete, realistic recipe with ingredient roles, exact method, doneness cues, troubleshooting, substitutions, storage, reheating, and serving guidance.`
      : `Answer the main question early, explain the useful choices, and provide actionable guidance without filler.`,
    uniqueAngle: seoBrief.contentDifferentiator
      || `Specific, practical guidance organized around the reader's decisions and likely failure points.`,
    recommendedArticleType: isCollection ? "recipe collection" : isRecipe ? "recipe guide" : articleType,
    recommendedLength,
    keyQuestions: inferredQuestions(primaryKeyword, isRecipe, isCollection),
    importantEntities: unique([primaryKeyword, ...secondaryKeywords]).slice(0, 15),
    suggestedHeadings: inferredHeadings(isRecipe, isCollection),
    internalLinkOpportunities: unique([
      ...(article.internalLinks || []).map((item) => item.title || item.anchor),
      isRecipe ? "Related recipe collection" : "",
      isRecipe ? "Technique or ingredient guide" : "",
      isRecipe ? "Serving or side-dish guide" : ""
    ]).slice(0, 8),
    affiliateOpportunities: isRecipe
      ? ["Only a verified tool or ingredient that solves a problem discussed in the article"]
      : ["Only a verified product that directly supports the reader's task"],
    recipeRequirements: {
      required: isRecipe && !isCollection,
      completeRecipeCard: resolvedSettings.recipeCardEnabled !== false && isRecipe,
      consistentIngredientsAndInstructions: isRecipe,
      timingYieldAndDonenessCues: isRecipe,
      noInventedNutritionOrRatings: isRecipe
    },
    imageRequirements: {
      featuredRatio: resolvedSettings.featuredImageRatio || "3:2",
      inTextRatio: resolvedSettings.intextImageRatio || "4:3",
      inTextCount: resolvedSettings.enableIntextImages === false ? 0 : Number(resolvedSettings.intextImageCount ?? 1),
      descriptiveAltText: true,
      noTextOverlay: true
    },
    recommendedCta: resolvedSettings.callToAction
      || (isRecipe ? "Invite the reader to save the recipe and explore one genuinely related recipe." : "Offer one useful next step."),
    verificationNeeds: unique([
      isRecipe ? "Verify ingredient quantities, timing, temperatures, yield, and safety guidance agree throughout the article." : "",
      "Review factual claims, product details, prices, availability, and first-hand claims before publication.",
      "Label calculated nutrition or other estimates clearly when included."
    ]),
    cannibalizationConflicts: (cannibalizationConflicts || []).map((match) => ({
      articleId: match.article?.id || match.articleId || "",
      title: match.article?.generatedTitle || match.article?.title || match.title || "",
      score: Number(match.score || 0),
      reason: match.reason || "Topic overlap"
    })),
    source: "smart-brief",
    inheritedFromCampaign: false,
    updatedAt: new Date().toISOString()
  };

  return {
    ...generated,
    ...existing,
    secondaryKeywords: existing.secondaryKeywords?.length ? list(existing.secondaryKeywords) : generated.secondaryKeywords,
    keyQuestions: existing.keyQuestions?.length ? list(existing.keyQuestions) : generated.keyQuestions,
    importantEntities: existing.importantEntities?.length ? list(existing.importantEntities) : generated.importantEntities,
    suggestedHeadings: existing.suggestedHeadings?.length ? list(existing.suggestedHeadings) : generated.suggestedHeadings,
    internalLinkOpportunities: existing.internalLinkOpportunities?.length ? list(existing.internalLinkOpportunities) : generated.internalLinkOpportunities,
    affiliateOpportunities: existing.affiliateOpportunities?.length ? list(existing.affiliateOpportunities) : generated.affiliateOpportunities,
    verificationNeeds: existing.verificationNeeds?.length ? list(existing.verificationNeeds) : generated.verificationNeeds,
    cannibalizationConflicts: existing.cannibalizationConflicts?.length
      ? existing.cannibalizationConflicts
      : generated.cannibalizationConflicts
  };
}

export function articleBriefPrompt(brief = {}) {
  if (!brief?.primaryKeyword && !brief?.readerProblem) return "";
  return [
    "ARTICLE BRIEF:",
    brief.primaryKeyword ? `Primary keyword: ${brief.primaryKeyword}` : "",
    brief.secondaryKeywords?.length ? `Secondary keywords: ${list(brief.secondaryKeywords).join(", ")}` : "",
    brief.searchIntent ? `Search intent: ${brief.searchIntent}` : "",
    brief.targetAudience ? `Target audience: ${brief.targetAudience}` : "",
    brief.readerProblem ? `Reader problem: ${brief.readerProblem}` : "",
    brief.articlePromise ? `Article promise: ${brief.articlePromise}` : "",
    brief.uniqueAngle ? `Unique angle: ${brief.uniqueAngle}` : "",
    brief.recommendedArticleType ? `Recommended type: ${brief.recommendedArticleType}` : "",
    brief.recommendedLength ? `Recommended length: ${brief.recommendedLength}` : "",
    brief.keyQuestions?.length ? `Questions to answer: ${list(brief.keyQuestions).join(" | ")}` : "",
    brief.importantEntities?.length ? `Important entities and concepts: ${list(brief.importantEntities).join(", ")}` : "",
    brief.suggestedHeadings?.length ? `Suggested coverage: ${list(brief.suggestedHeadings).join(" | ")}` : "",
    brief.recommendedCta ? `Recommended CTA: ${brief.recommendedCta}` : "",
    brief.verificationNeeds?.length ? `Requires verification: ${list(brief.verificationNeeds).join(" | ")}` : "",
    "Use this brief as planning guidance. Do not mention the brief, SEO instructions, or verification notes in the published article."
  ].filter(Boolean).join("\n");
}

