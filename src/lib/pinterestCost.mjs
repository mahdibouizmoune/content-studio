export const PINTEREST_IMAGE_COSTS = Object.freeze({
  ideogram: { label: "Ideogram Turbo", cost: 0.03, verified: true, quotedAt: '2026-10-19', source: 'https://replicate.com/ideogram-ai/ideogram-v3-turbo/api' },
  "ideogram-balanced": { label: "Ideogram Balanced", cost: 0.06, verified: true },
  "ideogram-quality": { label: "Ideogram Quality", cost: 0.09, verified: true },
  pruna: { label: "Z-Image Turbo", cost: 0.005, squareCost: 0.01, verified: true },
  seedream45: { label: "Seedream 4.5", cost: 0.04, verified: false },
  imagen: { label: "Imagen 4 Fast", cost: 0.02, verified: true },
  flux2max: { label: "FLUX 2 Max", cost: 0.04, verified: false },
  recraftv4: { label: "Recraft V4", cost: 0.04, verified: false },
  gptimage2low: { label: "GPT Image 2 Low", cost: 0.02, verified: false },
  gptimage2med: { label: "GPT Image 2 Medium", cost: 0.04, verified: false }
});

export function pinterestImageUnitCost(model = "ideogram", aspectRatio = "2:3") {
  const pricing = PINTEREST_IMAGE_COSTS[model] || PINTEREST_IMAGE_COSTS.ideogram;
  return aspectRatio === "1:1" && Number.isFinite(pricing.squareCost)
    ? pricing.squareCost
    : pricing.cost;
}

export function estimatePinterestPackCost({
  pinCount = 1,
  imageSourceMode = "generate-new",
  imageModel = "ideogram",
  aspectRatio = "2:3"
} = {}) {
  const count = Math.max(0, Math.min(1000, Math.round(Number(pinCount) || 0)));
  const pricing = PINTEREST_IMAGE_COSTS[imageModel] || PINTEREST_IMAGE_COSTS.ideogram;
  const imageUnitCost = imageSourceMode === "reuse-article"
    ? 0
    : pinterestImageUnitCost(imageModel, aspectRatio);
  // Each Pin makes two GPT-4.1 Mini calls (image prompt, then title/description), ~$0.003 each.
  const textCallsPerPin = 2;
  const textUnitCost = 0.003 * textCallsPerPin;
  const imageCost = imageUnitCost * count;
  const textCost = Number((textUnitCost * count).toFixed(6));
  const total = imageCost + textCost;

  return {
    pinCount: count,
    modelLabel: pricing.label,
    pricingVerified: Boolean(pricing.verified && pricing.quotedAt && pricing.source),
    priceQuotedAt: pricing.quotedAt || null,
    priceSource: pricing.source || null,
    imageUnitCost,
    textUnitCost,
    textCallsPerPin,
    imageCost,
    textCost,
    localOverlayCost: 0,
    total,
    perPin: count ? total / count : 0
  };
}
