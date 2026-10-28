const COST_CALCULATION_VERSION = 2;

const COST_ESTIMATES = Object.freeze({
  text: Object.freeze({
    gpt5nano: 0.001,
    gpt5mini: 0.004,
    gpt41mini: 0.003,
    chatgpt: 0.015,
    claude: 0.018,
    gemini: 0.005,
    deepseek: 0.003,
    qwen3: 0.002,
    llama4scout: 0.002
  }),
  image: Object.freeze({
    'z-image-turbo': 0.003,
    'flux-schnell': 0.003,
    'seedream-4.5': 0.04,
    'qwen-image': 0.02,
    'flux-pro-2': 0.04,
    'recraft-v4': 0.04,
    'gpt-image-2': 0.04,
    'imagen-4-fast': 0.02,
    'imagen-4-ultra': 0.06
  })
});

function calculateEstimatedCost({
  articleCount,
  settings = {},
  extraTextCalls = 0,
  outlineCalls = 0
} = {}) {
  const count = Math.max(0, Math.min(10000, Number(articleCount || 0)));
  if (!Number.isFinite(count)) throw new Error('Article count is invalid.');
  const textModel = settings.aiModel || 'gpt5nano';
  const imageModel = settings.imageModel || 'z-image-turbo';
  const textUnitCost = COST_ESTIMATES.text[textModel] ?? 0.005;
  const imageUnitCost = COST_ESTIMATES.image[imageModel] ?? 0.02;
  const intextImages = settings.enableIntextImages
    ? Math.max(0, Math.min(12, Number(settings.intextImageCount ?? 1)))
    : 0;
  const affiliatePlanningCalls = settings.affiliateEnabled !== false
    && settings.affiliateAutoDiscover !== false
    && (settings.impactAccountSid || settings.amazonPartnerTag)
    ? 1
    : 0;
  // A complete recipe collection is written as an intro, one call per five recipes and an ending
  // instead of one article call; repairs and retries can add more and are not predicted here.
  const itemCount = Number(settings.listicleItemCount || 0);
  const collectionCalls = settings.articleType === 'listicle' && settings.listicleCategory === 'food' && itemCount >= 6
    ? Math.ceil(itemCount / 5) + 1
    : 0;
  const textCallsPerArticle = 2 + collectionCalls
    + (settings.smartQualityPass === false ? 0 : 1)
    + (settings.keepOriginalTitles ? 0 : 1)
    + intextImages
    + affiliatePlanningCalls;
  const imageCallsPerArticle = 1 + intextImages;
  const extraCalls = Math.max(0, Number(extraTextCalls || 0));
  const outlines = Math.max(0, Number(outlineCalls || 0));
  const totalTextCalls = (textCallsPerArticle * count) + extraCalls + outlines;
  const totalImageCalls = imageCallsPerArticle * count;
  const estimatedTextCost = totalTextCalls * textUnitCost;
  const estimatedImageCost = totalImageCalls * imageUnitCost;
  const estimatedCost = estimatedTextCost + estimatedImageCost;

  return {
    perArticle: Number((((textCallsPerArticle * textUnitCost) + (imageCallsPerArticle * imageUnitCost))).toFixed(4)),
    total: Number(estimatedCost.toFixed(4)),
    estimatedCost: Number(estimatedCost.toFixed(4)),
    estimatedTextCost: Number(estimatedTextCost.toFixed(4)),
    estimatedImageCost: Number(estimatedImageCost.toFixed(4)),
    actualKnownCost: null,
    costCurrency: 'USD',
    currency: 'USD',
    costCalculationVersion: COST_CALCULATION_VERSION,
    approximate: true,
    models: {
      text: textModel,
      image: imageModel
    },
    expectedImages: totalImageCalls,
    breakdown: {
      textCalls: totalTextCalls,
      textCallsPerArticle,
      imageCalls: totalImageCalls,
      imageCallsPerArticle,
      extraTextCalls: extraCalls,
      outlineCalls: outlines,
      textUnitCost,
      imageUnitCost,
      intextImagesPerArticle: intextImages
    }
  };
}

module.exports = {
  COST_CALCULATION_VERSION,
  COST_ESTIMATES,
  calculateEstimatedCost
};
