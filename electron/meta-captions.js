const { parseRecipeCard } = require('./recipe-card-parser');
const { validateRecipeCard } = require('./recipe-generation');

const RECIPE_CTA = 'Want the full ingredient list and all the steps? Send us a message for the complete recipe.';

function withoutArticleLinks(value = '') {
  return String(value || '').replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, '$1')
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1').replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/[^\s<>]+/gi, '')
    .replace(/[^.!?\n]*(?:link in (?:the )?(?:bio|profile)|(?:visit|on|from) (?:our|the) (?:blog|website))[^.!?\n]*[.!?]?/gi, '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function recipePreview(article = {}) {
  if (!validateRecipeCard(article.content || '').ok) return '';
  const card = parseRecipeCard(article.content);
  // Only a preparation step is shown: never present an incomplete cooking method as the full recipe.
  const step = card.instructions.find((value) => /\b(?:wash|rinse|slice|chop|dice|combine|mix|whisk|toss)\b/i.test(value) && value.length <= 350 && !/\b(?:raw|chicken|turkey|duck)\b/i.test(value));
  const name = card.name ? `${card.name}\n` : '';
  return `${name}Recipe preview (not the full recipe):\n${card.ingredients.slice(0, 3).map((value) => `- ${value}`).join('\n')}${step ? `\nFirst prep tip: ${step}` : ''}`;
}

function recipeCaption(content, article = {}) {
  const preview = recipePreview(article);
  const clean = withoutArticleLinks(content).split(/Recipe preview \(not the full recipe\):/i)[0].trim();
  return `${clean.replaceAll(RECIPE_CTA, '').trim()}\n\n${preview ? `${preview}\n\n` : ''}${RECIPE_CTA}`.trim();
}

function enforceRecipeCaptions(content = {}, article = {}) {
  const facebook = { ...(content.facebook || {}) };
  const instagram = { ...(content.instagram || {}) };
  for (const field of ['shortPost', 'groupPost', 'reelCaption']) if (facebook[field]) facebook[field] = withoutArticleLinks(facebook[field]);
  for (const field of ['reelCaption', 'reelVoiceover']) if (instagram[field]) instagram[field] = withoutArticleLinks(instagram[field]);
  facebook.primaryPost = recipeCaption(facebook.primaryPost || facebook.pagePost, article);
  instagram.feedCaption = recipeCaption(instagram.feedCaption || instagram.caption, article);
  facebook.cta = RECIPE_CTA;
  instagram.cta = RECIPE_CTA;
  return { ...content, captionMode: 'recipe-preview', recipePreviewAvailable: Boolean(recipePreview(article)), facebook, instagram };
}

function metaRowsWithoutLinks(headers = [], rows = []) {
  const content = headers.findIndex((header) => /^content$/i.test(header));
  const link = headers.findIndex((header) => /^link\b/i.test(header));
  const comment = headers.findIndex((header) => /^followUpComment$/i.test(header));
  return rows.map((row) => {
    const copy = [...row];
    if (content >= 0) copy[content] = withoutArticleLinks(copy[content]);
    if (link >= 0) copy[link] = '';
    if (comment >= 0) copy[comment] = '';
    return copy;
  });
}

module.exports = { RECIPE_CTA, withoutArticleLinks, recipePreview, recipeCaption, enforceRecipeCaptions, metaRowsWithoutLinks };
