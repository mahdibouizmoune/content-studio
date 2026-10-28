const ENGAGEMENT_BAIT = [
  /comment\s+(yes|below|your answer)/i,
  /tag\s+(a friend|someone)/i,
  /like\s+and\s+share/i,
  /share\s+this\s+(post|now)/i,
  /type\s+(yes|amen)/i,
  /follow\s+for\s+follow/i,
  // Keyword-comment schemes ("Comment RECIPE below"); the keyword is uppercase, so no /i flag here.
  /\b[Cc]omment\s+["'‘“]?[A-Z]{2,}\b/,
  /\b(?:dm|message)\s+(?:us|me)\s+["'‘“]?[A-Z]{2,}/i,
  /\bdrop\s+an?\s+(?:\S*\p{Extended_Pictographic}|heart|emoji|like)/iu,
  /share\s+(?:this\s+)?with\s+(?:someone|a friend|friends)\s+who/i,
  /double[\s-]tap/i,
  /smash\s+(?:that|the)\s+like/i
];

function cleanText(value) {
  return String(value || "").trim();
}

function wordTokens(value) {
  return new Set(cleanText(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 3));
}

function similarity(left, right) {
  const a = wordTokens(left);
  const b = wordTokens(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((word) => b.has(word)).length;
  return overlap / Math.max(1, Math.min(a.size, b.size));
}

function hasEngagementBait(value) {
  return ENGAGEMENT_BAIT.some((pattern) => pattern.test(cleanText(value)));
}

function isPublicDestination(value) {
  try {
    const url = new URL(cleanText(value));
    return /^https?:$/.test(url.protocol) && !/^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function scoreMetaContent(content = {}, { sourceUrl = "", imageAssets = [] } = {}) {
  const facebook = content.facebook || {};
  const instagram = content.instagram || {};
  const strategy = content.strategy || {};
  const fbPost = cleanText(facebook.primaryPost);
  const igCaption = cleanText(instagram.feedCaption);
  const hashtags = Array.isArray(instagram.hashtags) ? instagram.hashtags.filter(Boolean) : [];
  const slides = Array.isArray(instagram.carouselSlides) ? instagram.carouselSlides.filter((slide) => cleanText(slide?.heading) || cleanText(slide?.body)) : [];
  const scenes = Array.isArray(instagram.reelScenes) ? instagram.reelScenes.filter(Boolean) : [];
  const productionNotes = cleanText(instagram.reelProductionNotes);
  const feedOnly = /facebook feed and instagram feed/i.test(strategy.recommendedFormat || '');
  const recipeCaptionMode = content.captionMode === 'recipe-preview';

  const checks = [
    { id: "public-link", platform: "global", label: recipeCaptionMode ? "Captions have no article links" : "Public destination URL is ready", passed: recipeCaptionMode ? !/https?:\/\//i.test(`${fbPost} ${igCaption}`) : isPublicDestination(sourceUrl), weight: 5 },
    { id: "original-angle", platform: "global", label: "Originality angle is defined", passed: cleanText(strategy.originalityAngle).length >= 20, weight: 5 },
    { id: "asset", platform: "global", label: "A reusable image is attached", passed: imageAssets.some((asset) => asset?.fileUrl || asset?.publicUrl || asset?.imgbbUrl || asset?.remoteImageUrl), weight: 5 },
    { id: "fb-depth", platform: "facebook", label: "Facebook post has useful context", passed: fbPost.length >= 120 && fbPost.length <= 1800, weight: 7 },
    { id: "fb-question", platform: "facebook", label: "Facebook post invites a natural discussion", passed: fbPost.includes("?"), weight: 4 },
    { id: "fb-cta", platform: "facebook", label: "Facebook has a clear next step", passed: cleanText(facebook.cta).length >= 8, weight: 5 },
    { id: "fb-alt", platform: "facebook", label: "Facebook image alt text is descriptive", passed: cleanText(facebook.imageAltText).length >= 20, weight: 5 },
    { id: "fb-bait", platform: "facebook", label: "Facebook copy avoids engagement bait", passed: ![fbPost, facebook.shortPost, facebook.groupPost, facebook.reelCaption, facebook.cta].some(hasEngagementBait), weight: 7 },
    { id: "ig-bait", platform: "instagram", label: "Instagram copy avoids engagement bait", passed: ![igCaption, instagram.reelCaption, instagram.reelHook, instagram.cta].some(hasEngagementBait), weight: 7 },
    { id: "ig-hook", platform: "instagram", label: "Instagram opens with a concise hook", passed: cleanText(igCaption.split(/\r?\n/)[0]).length >= 20 && cleanText(igCaption.split(/\r?\n/)[0]).length <= 125, weight: 7 },
    { id: "ig-depth", platform: "instagram", label: "Instagram caption delivers useful detail", passed: igCaption.length >= 100 && igCaption.length <= 2200, weight: 6 },
    { id: "ig-cta", platform: "instagram", label: "Instagram has one clear CTA", passed: cleanText(instagram.cta).length >= 8, weight: 5 },
    { id: "ig-tags", platform: "instagram", label: "Instagram uses 3 to 8 specific hashtags", passed: hashtags.length >= 3 && hashtags.length <= 8, weight: 4 },
    { id: "ig-no-url", platform: "instagram", label: "Instagram caption has no raw URL", passed: !/https?:\/\//i.test(igCaption), weight: 5 },
    { id: "ig-alt", platform: "instagram", label: "Instagram image alt text is descriptive", passed: cleanText(instagram.imageAltText).length >= 20, weight: 5 },
    { id: "ig-carousel", platform: "instagram", label: "Carousel contains 5 to 8 useful slides", passed: slides.length >= 5 && slides.length <= 8 && slides.every((slide) => cleanText(slide.heading).length >= 3 && cleanText(slide.body).length >= 12), weight: 6 },
    { id: "ig-reel", platform: "instagram", label: "Reel has a hook and 3 to 6 scenes", passed: cleanText(instagram.reelHook).length >= 10 && scenes.length >= 3 && scenes.length <= 6, weight: 7 },
    { id: "ig-production", platform: "instagram", label: "Reel plan covers 9:16, audio, captions, and safe zones", passed: /9:16/.test(productionNotes) && /audio|sound/i.test(productionNotes) && /caption/i.test(productionNotes) && /safe zone/i.test(productionNotes), weight: 7 },
    { id: "platform-distinct", platform: "global", label: "Facebook and Instagram copy are distinct", passed: similarity(fbPost, igCaption) < 0.82, weight: 5 }
  ].filter((check) => !feedOnly || !['ig-carousel', 'ig-reel', 'ig-production'].includes(check.id));

  const scoreFor = (platform) => {
    const scoped = checks.filter((check) => check.platform === platform || check.platform === "global");
    const total = scoped.reduce((sum, check) => sum + check.weight, 0);
    const passed = scoped.filter((check) => check.passed).reduce((sum, check) => sum + check.weight, 0);
    return Math.round((passed / Math.max(1, total)) * 100);
  };
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const passedWeight = checks.filter((check) => check.passed).reduce((sum, check) => sum + check.weight, 0);
  const score = Math.round((passedWeight / Math.max(1, totalWeight)) * 100);

  return {
    score,
    facebookScore: scoreFor("facebook"),
    instagramScore: scoreFor("instagram"),
    level: score >= 85 ? "Ready" : score >= 70 ? "Review" : "Needs work",
    checks,
    failed: checks.filter((check) => !check.passed)
  };
}
