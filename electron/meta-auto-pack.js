const { createHash } = require('node:crypto');
const { enforceRecipeCaptions } = require('./meta-captions');

function metaSourceFingerprint(source = {}) {
  source = source || {};
  return createHash('sha256').update(JSON.stringify([source.kind || '', String(source.pinId || ''), source.localPath || '', source.publicUrl || '', source.sourceRevision || '', '1080x1350:pin-only:contain-blur:v3'])).digest('hex');
}

function text(value = '') {
  return String(value || '').replace(/\u2014/g, '-').replace(/\s+/g, ' ').trim();
}

function stripHtml(value = '') {
  return text(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'"));
}

function truncateWords(value = '', limit = 280) {
  const clean = text(value);
  if (clean.length <= limit) return clean;
  const shortened = clean.slice(0, limit + 1).replace(/\s+\S*$/, '').trim();
  return `${shortened || clean.slice(0, limit).trim()}.`;
}

function articleTitle(article = {}, pin = {}) {
  return text(pin.title || pin.sourceTitle || article.generatedTitle || article.title || 'Recipe idea');
}

function articleDescription(article = {}, pin = {}) {
  const preferred = text(pin.description || article.metaDescription || article.excerpt || article.seoDescription || '');
  if (preferred) return truncateWords(preferred, 300);
  return truncateWords(stripHtml(article.content || ''), 300)
    || 'Find the complete recipe, ingredients, and step-by-step instructions on the blog.';
}

// "Crème brûlée" becomes CremeBrulee, not Crmebrle: strip accents before dropping other symbols.
function asciiLetters(value = '') {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function hashtagToken(value = '') {
  const words = asciiLetters(text(value))
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 4);
  return words.length ? `#${words.map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join('')}` : '';
}

function metaHashtags(article = {}, pin = {}) {
  const pinTags = text(pin.csvKeywords || '')
    .split(',')
    .map((value) => asciiLetters(value.trim()).replace(/^#/, '').replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .map((value) => `#${value}`);
  const articleTags = [
    hashtagToken(article.targetKeyword || article.seoBrief?.targetKeyword || ''),
    hashtagToken(article.generatedTitle || article.title || ''),
    '#EasyRecipes',
    '#RecipeIdeas',
    '#HomeCooking'
  ].filter(Boolean);
  return [...new Set([...pinTags, ...articleTags])].slice(0, 8);
}

function instagramHook(title = '') {
  const hook = `${title}: worth saving for this week`;
  return hook.length <= 125 ? hook : title.slice(0, 125);
}

function recipeFacts(article = {}) {
  try {
    const card = require('./recipe-card-parser').parseRecipeCard(article.content || '');
    const fact = (value) => String(value || '').replace(/[;,.\s]+$/, '');
    const time = fact(card.facts['Total Time']);
    const servings = fact(card.facts.Servings || card.facts.Yield).replace(/^serves\s+/i, '');
    return [time && `Ready in ${time}`, servings && `Serves ${servings}`, card.ingredients.length && `${card.ingredients.length} ingredients`].filter(Boolean).join(' · ');
  } catch {
    return '';
  }
}

function automaticMetaContent(article = {}, pin = {}) {
  const title = articleTitle(article, pin);
  const description = articleDescription(article, pin);
  const hashtags = metaHashtags(article, pin);
  return enforceRecipeCaptions({
    campaignTitle: title,
    strategy: {
      contentPillar: 'Recipe discovery',
      audienceIntent: 'conversation',
      originalityAngle: 'Turn the completed recipe into useful platform-ready social copy.',
      recommendedFormat: 'Facebook feed and Instagram feed',
      whyNow: 'Completed article with reusable original media',
      evidenceConfidence: 'medium'
    },
    facebook: {
      primaryPost: `${title}\n\n${description}\n\nWhat would you serve it with?`,
      shortPost: `${title}\n\n${description}`,
      groupPost: `${title}\n\n${description}\n\nWould you add this recipe to your meal plan?`,
      reelCaption: `${title}. Get the complete recipe on the blog.`,
      linkHeadline: title,
      cta: 'View the complete recipe',
      hashtags: hashtags.slice(0, 2),
      imageAltText: title
    },
    instagram: {
      // Instagram gets its own shape (quick facts, save cue) instead of repeating the Facebook story.
      feedCaption: [instagramHook(title), recipeFacts(article), 'Save it for your next grocery list.'].filter(Boolean).join('\n\n'),
      reelCaption: `${title}\n\nSave this recipe idea for later.`,
      reelHook: title,
      reelScenes: [],
      reelVoiceover: description,
      reelProductionNotes: 'Reuse the saved article or Pinterest image. No new image generation is required.',
      carouselSlides: [],
      cta: 'Save this recipe and visit the link in the profile.',
      hashtags,
      imageAltText: title
    }
  }, article);
}

function sourceUrl(source = {}) {
  return text(source.publicUrl || source.remoteUrl || source.url || source.localUrl || source.localPath || '');
}

function sourceKey(source = {}) {
  return sourceUrl(source).toLowerCase().replace(/\/+$/, '') || text(source.id).toLowerCase();
}

function dedupeSources(sources = []) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = sourceKey(source);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function metaSourceScore(source = {}) {
  const kind = text(source.kind).toLowerCase();
  let score = kind === 'pin' ? 500 : kind === 'article-featured' ? 300 : 0;
  if (source.dimensionsVerified) score += 80;
  if (source.publicUrlVerified) score += 40;
  if (source.localPath || source.localUrl) score += 40;
  if (source.publicUrl || source.remoteUrl) score += 30;
  return score;
}

function preferredMetaSource(sources = []) {
  return (Array.isArray(sources) ? sources : [])
    .filter((source) => source?.kind === 'pin' && (source.localPath || sourceUrl(source)))
    .reduce((best, source) => (!best || metaSourceScore(source) > metaSourceScore(best) ? source : best), null);
}

function matchingPins(article = {}, pins = []) {
  const articleId = text(article.id);
  const urls = [article.wordpressPostUrl, article.sourceUrl]
    .map((value) => text(value).toLowerCase().replace(/\/+$/, ''))
    .filter(Boolean);
  return (Array.isArray(pins) ? pins : []).filter((pin) => (
    (articleId && text(pin.articleId) === articleId)
    || (pin.url && urls.includes(text(pin.url).toLowerCase().replace(/\/+$/, '')))
  ));
}


function pinSource(pin = {}) {
  const publicUrl = [
    pin.imageQa?.publicValidatedUrl,
    pin.hostedImageUrl,
    pin.csvMediaUrl,
    pin.imgurUrl,
    pin.remoteImageUrl,
    pin.imageUrl,
    pin.displayUrl
  ].find((value) => /^https:\/\//i.test(text(value))) || '';
  return {
    id: `pin:${text(pin.id) || sourceKey({ url: publicUrl })}`,
    kind: 'pin',
    label: 'Pinterest Generated Image',
    sourceRevision: pin.imageQa?.sha256 || pin.imageQa?.perceptualHash || '',
    pinId: text(pin.id),
    localPath: pin.localPath || '',
    localUrl: pin.localImageUrl || pin.displayUrl || '',
    url: pin.localImageUrl || pin.displayUrl || publicUrl,
    publicUrl,
    remoteUrl: pin.remoteImageUrl || publicUrl,
    pinterestTitle: pin.title || pin.sourceTitle || '',
    pinterestDescription: pin.description || '',
    pinterestKeywords: pin.csvKeywords || '',
    dimensionsVerified: pin.imageQa?.dimensionsVerified === true,
    publicUrlVerified: pin.imageQa?.publicUrlVerified === true
  };
}

function metaSourceLibrary(article = {}, pins = []) {
  return dedupeSources(matchingPins(article, pins).map(pinSource)
    .filter((source) => source.localPath || sourceUrl(source)));
}

function compatibleMetaAssets(assets = [], source = null) {
  const sourceKind = text(source?.kind).toLowerCase();
  const sourcePinId = text(source?.pinId);
  return (Array.isArray(assets) ? assets : [])
    .filter((asset) => (
      asset?.id === 'meta-social-portrait'
      && sourceKind === 'pin'
      && Number(asset.width || 0) === 1080
      && Number(asset.height || 0) === 1350
      && text(asset.sourceKind).toLowerCase() === sourceKind
      && (sourceKind !== 'pin' || text(asset.sourcePinId) === sourcePinId)
      && asset.sourceFingerprint === metaSourceFingerprint(source)
      && Boolean(asset.sourceSha256)
    ))
    .slice(0, 1);
}

function automaticMetaProject(article = {}, pins = [], existing = null, now = new Date().toISOString()) {
  const articlePins = matchingPins(article, pins);
  const primaryPin = articlePins[0] || {};
  const sourceLibrary = metaSourceLibrary(article, pins, existing?.sourceLibrary || []);
  const selectedSource = preferredMetaSource(sourceLibrary);
  return {
    ...(existing || {}),
    id: existing?.id || `meta-auto-${text(article.id) || Date.now()}`,
    articleId: text(article.id),
    articleTitle: articleTitle(article, primaryPin),
    sourceUrl: article.wordpressPostUrl || article.sourceUrl || existing?.sourceUrl || '',
    geo: existing?.geo || 'US',
    goal: existing?.goal || 'traffic',
    research: existing?.research || null,
    content: automaticMetaContent(article, primaryPin),
    imageAssets: compatibleMetaAssets(existing?.imageAssets, selectedSource),
    sourceLibrary,
    sourceContext: {
      pinId: primaryPin.id || '',
      title: articleTitle(article, primaryPin),
      description: articleDescription(article, primaryPin),
      keywords: primaryPin.csvKeywords || '',
      imageSourceId: selectedSource?.id || '',
      imageSourceLabel: selectedSource?.label || ''
    },
    selectedSource: selectedSource ? {
      id: selectedSource.id,
      kind: selectedSource.kind,
      label: selectedSource.label,
      pinId: selectedSource.pinId || ''
    } : null,
    autoCreated: true,
    userEdited: false,
    creditFree: true,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

function upsertAutomaticMetaProject(projects = [], article = {}, pins = [], now = new Date().toISOString()) {
  const existingProjects = Array.isArray(projects) ? projects : [];
  if (!article?.id || article.queueStatus !== 'completed' || !article.content) return existingProjects;
  const autoId = `meta-auto-${text(article.id)}`;
  const existing = existingProjects.find((project) => project.id === autoId)
    || existingProjects.find((project) => project.autoCreated === true && text(project.articleId) === text(article.id));
  if (existing?.userEdited) {
    const sourceLibrary = metaSourceLibrary(article, pins);
    const selectedSource = preferredMetaSource(sourceLibrary);
    const refreshed = {
      ...existing,
      imageAssets: compatibleMetaAssets(existing.imageAssets, selectedSource),
      sourceLibrary,
      selectedSource: selectedSource ? {
        id: selectedSource.id,
        kind: selectedSource.kind,
        label: selectedSource.label,
        pinId: selectedSource.pinId || ''
      } : null,
      sourceContext: {
        ...(existing.sourceContext || {}),
        imageSourceId: selectedSource?.id || '',
        imageSourceLabel: selectedSource?.label || ''
      },
      updatedAt: now
    };
    return [refreshed, ...existingProjects.filter((project) => project.id !== existing.id)];
  }
  const automatic = automaticMetaProject(article, pins, existing || null, now);
  return [automatic, ...existingProjects.filter((project) => project.id !== automatic.id)];
}

function syncAutomaticMetaProjects(projects = [], articles = [], pins = [], now = new Date().toISOString()) {
  return (Array.isArray(articles) ? articles : [])
    .filter((article) => article?.queueStatus === 'completed' && article.content)
    .reduce((current, article) => upsertAutomaticMetaProject(current, article, pins, now), Array.isArray(projects) ? projects : [])
    .slice(0, 500);
}

module.exports = {
  metaSourceFingerprint,
  articleDescription,
  automaticMetaContent,
  automaticMetaProject,
  matchingPins,
  metaSourceScore,
  metaSourceLibrary,
  preferredMetaSource,
  syncAutomaticMetaProjects,
  upsertAutomaticMetaProject
};
