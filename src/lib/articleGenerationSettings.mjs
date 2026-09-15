export const ARTICLE_LENGTH_SOURCES = Object.freeze([
  "custom",
  "preset",
  "smart",
  "global",
  "system"
]);

export const SYSTEM_ARTICLE_GENERATION_DEFAULTS = Object.freeze({
  articleLength: "900-1200",
  brandVoiceId: "",
  targetAudience: "",
  searchIntent: "informational",
  primaryKeyword: "",
  secondaryKeywords: "",
  contentType: "article",
  requireOutlineApproval: false,
  wordpressSiteId: "",
  wordpressCategoryId: "",
  publishStatus: "publish",
  aiModel: "gpt5nano",
  imageModel: "z-image-turbo",
  featuredImageRatio: "3:2",
  intextImageRatio: "9:16",
  pinterestPinRatio: "2:3",
  instagramPortraitRatio: "4:5",
  instagramStoryRatio: "9:16",
  facebookFeedRatio: "1.91:1",
  squareSocialRatio: "1:1",
  intextImageCount: 1,
  enableIntextImages: true,
  recipeCardEnabled: true,
  readerRetentionEnabled: true,
  readerRetentionAllArticles: false,
  saveRecipeCtaText: "Bookmark this page so the ingredients, instructions, and cooking notes are easy to find when you are ready to cook.",
  newsletterCtaEnabled: false,
  newsletterCtaUrl: "",
  newsletterCtaText: "Get practical recipe ideas and seasonal cooking inspiration.",
  enableInternalLinks: true,
  internalLinkCount: 3,
  affiliateEnabled: true,
  affiliateProvider: "impact",
  affiliateProviderFallback: true,
  affiliateMaxLinks: 3,
  callToAction: ""
});

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function firstValue(...values) {
  return values.find(hasValue);
}

function selectedProjectPreset(article, preset, globalSettings) {
  if (preset && typeof preset === "object") return preset;
  if (!article?.projectPresetId) return {};
  return globalSettings?.projectPresets?.find((item) => item.id === article.projectPresetId) || {};
}

function smartValue(smart, key, ...aliases) {
  return firstValue(
    smart?.[key],
    ...aliases.map((alias) => smart?.[alias]),
    smart?.seoBrief?.[key],
    ...aliases.map((alias) => smart?.seoBrief?.[alias])
  );
}

function articleValue(article, key, ...aliases) {
  return firstValue(
    article?.[key],
    ...aliases.map((alias) => article?.[alias]),
    article?.seoBrief?.[key],
    ...aliases.map((alias) => article?.seoBrief?.[alias])
  );
}

function presetValue(preset, key, ...aliases) {
  return firstValue(
    preset?.[key],
    ...aliases.map((alias) => preset?.[alias]),
    preset?.seoBrief?.[key],
    ...aliases.map((alias) => preset?.seoBrief?.[alias])
  );
}

function globalValue(settings, key, ...aliases) {
  return firstValue(
    settings?.[key],
    ...aliases.map((alias) => settings?.[alias]),
    settings?.seoBrief?.[key],
    ...aliases.map((alias) => settings?.seoBrief?.[alias])
  );
}

function resolveArticleLength(article, preset, smart, globalSettings, systemDefaults) {
  const source = ARTICLE_LENGTH_SOURCES.includes(article?.articleLengthSource)
    ? article.articleLengthSource
    : "";
  const savedLength = hasValue(article?.articleLength) ? article.articleLength : "";

  if (source === "custom" && savedLength) {
    return { articleLength: savedLength, articleLengthSource: "custom" };
  }
  if (hasValue(preset?.articleLength)) {
    return { articleLength: preset.articleLength, articleLengthSource: "preset" };
  }
  if (source === "preset" && savedLength) {
    return { articleLength: savedLength, articleLengthSource: "preset" };
  }
  if (hasValue(smart?.articleLength)) {
    return { articleLength: smart.articleLength, articleLengthSource: "smart" };
  }
  if (source === "smart" && savedLength) {
    return { articleLength: savedLength, articleLengthSource: "smart" };
  }

  // Legacy records had no source field. Keep their saved size when no preset or
  // current smart recommendation can explain it.
  if (!source && savedLength) {
    return { articleLength: savedLength, articleLengthSource: "custom" };
  }
  if (hasValue(globalSettings?.articleLength)) {
    return { articleLength: globalSettings.articleLength, articleLengthSource: "global" };
  }
  if (source === "global" && savedLength) {
    return { articleLength: savedLength, articleLengthSource: "global" };
  }
  return {
    articleLength: systemDefaults.articleLength || SYSTEM_ARTICLE_GENERATION_DEFAULTS.articleLength,
    articleLengthSource: "system"
  };
}

function resolveBoolean(article, preset, smart, globalSettings, systemDefaults, key) {
  return firstValue(
    article?.[key],
    preset?.[key],
    smart?.[key],
    globalSettings?.[key],
    systemDefaults?.[key]
  );
}

function resolveValue(article, preset, smart, globalSettings, systemDefaults, key, ...aliases) {
  return firstValue(
    articleValue(article, key, ...aliases),
    presetValue(preset, key, ...aliases),
    smartValue(smart, key, ...aliases),
    globalValue(globalSettings, key, ...aliases),
    systemDefaults?.[key],
    ...aliases.map((alias) => systemDefaults?.[alias])
  );
}

export function resolveArticleGenerationSettings({
  article = {},
  preset,
  smartRecommendations = {},
  globalSettings = {},
  systemDefaults = SYSTEM_ARTICLE_GENERATION_DEFAULTS
} = {}) {
  const selectedPreset = selectedProjectPreset(article, preset, globalSettings);
  const length = resolveArticleLength(
    article,
    selectedPreset,
    smartRecommendations,
    globalSettings,
    systemDefaults
  );
  const targetAudience = resolveValue(
    article,
    selectedPreset,
    smartRecommendations,
    globalSettings,
    systemDefaults,
    "targetAudience",
    "audience",
    "defaultAudience"
  );
  const primaryKeyword = resolveValue(
    article,
    selectedPreset,
    smartRecommendations,
    globalSettings,
    systemDefaults,
    "primaryKeyword",
    "targetKeyword"
  );
  const searchIntent = resolveValue(
    article,
    selectedPreset,
    smartRecommendations,
    globalSettings,
    systemDefaults,
    "searchIntent",
    "defaultSearchIntent"
  );
  const secondaryKeywords = resolveValue(
    article,
    selectedPreset,
    smartRecommendations,
    globalSettings,
    systemDefaults,
    "secondaryKeywords"
  );
  const contentType = resolveValue(
    article,
    selectedPreset,
    smartRecommendations,
    globalSettings,
    systemDefaults,
    "contentType",
    "type"
  );
  const requireOutlineApproval = resolveBoolean(
    article,
    selectedPreset,
    smartRecommendations,
    globalSettings,
    systemDefaults,
    "requireOutlineApproval"
  );
  const seoBrief = {
    ...(globalSettings.seoBrief || {}),
    ...(smartRecommendations.seoBrief || {}),
    ...(selectedPreset.seoBrief || {}),
    ...(article.seoBrief || {}),
    targetKeyword: primaryKeyword || "",
    primaryKeyword: primaryKeyword || "",
    secondaryKeywords: secondaryKeywords || "",
    searchIntent: searchIntent || systemDefaults.searchIntent,
    audience: targetAudience || ""
  };
  const customPrompts = {
    ...(globalSettings.customPrompts || globalSettings.promptTemplates || {}),
    ...(smartRecommendations.customPrompts || smartRecommendations.promptTemplates || {}),
    ...(selectedPreset.customPrompts || selectedPreset.promptTemplates || {}),
    ...(article.customPrompts || article.promptTemplates || {})
  };

  return {
    ...globalSettings,
    ...length,
    projectPresetId: article.projectPresetId || selectedPreset.id || "",
    brandVoiceId: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "brandVoiceId"),
    targetAudience: targetAudience || "",
    audience: targetAudience || "",
    searchIntent: searchIntent || systemDefaults.searchIntent,
    primaryKeyword: primaryKeyword || "",
    targetKeyword: primaryKeyword || "",
    secondaryKeywords: secondaryKeywords || "",
    contentType: contentType || systemDefaults.contentType,
    requireOutlineApproval: requireOutlineApproval === true,
    outlineApproved: requireOutlineApproval === true ? article.outlineApproved === true : true,
    wordpressSiteId: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "wordpressSiteId"),
    wordpressCategoryId: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "wordpressCategoryId"),
    publishStatus: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "publishStatus", "publicationPreference"),
    aiModel: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "aiModel", "textModel"),
    textModel: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "textModel", "aiModel"),
    imageModel: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "imageModel"),
    featuredImageRatio: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "featuredImageRatio"),
    intextImageRatio: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "intextImageRatio"),
    pinterestPinRatio: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "pinterestPinRatio"),
    instagramPortraitRatio: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "instagramPortraitRatio"),
    instagramStoryRatio: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "instagramStoryRatio"),
    facebookFeedRatio: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "facebookFeedRatio"),
    squareSocialRatio: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "squareSocialRatio"),
    intextImageCount: Number(resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "intextImageCount")),
    enableIntextImages: resolveBoolean(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "enableIntextImages") !== false,
    recipeCardEnabled: resolveBoolean(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "recipeCardEnabled") !== false,
    readerRetentionEnabled: resolveBoolean(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "readerRetentionEnabled") !== false,
    readerRetentionAllArticles: resolveBoolean(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "readerRetentionAllArticles") === true,
    saveRecipeCtaText: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "saveRecipeCtaText"),
    newsletterCtaEnabled: resolveBoolean(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "newsletterCtaEnabled") === true,
    newsletterCtaUrl: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "newsletterCtaUrl"),
    newsletterCtaText: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "newsletterCtaText"),
    enableInternalLinks: resolveBoolean(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "enableInternalLinks") !== false,
    internalLinkCount: Number(resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "internalLinkCount")),
    internalLinkMaxPosts: Number(resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "internalLinkMaxPosts") || 500),
    affiliateEnabled: resolveBoolean(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "affiliateEnabled") !== false,
    affiliateProvider: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "affiliateProvider"),
    affiliateProviderFallback: resolveBoolean(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "affiliateProviderFallback") !== false,
    affiliateMaxLinks: Number(resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "affiliateMaxLinks")),
    customPrompts,
    seoBrief,
    callToAction: resolveValue(article, selectedPreset, smartRecommendations, globalSettings, systemDefaults, "callToAction", "cta"),
    selectedProjectPreset: selectedPreset
  };
}
