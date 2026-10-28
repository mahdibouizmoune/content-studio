'use strict';

// Core Rank Math fields. The canonical is the post's current permalink unless the user set one
// on purpose, so a canonical saved for an earlier site or slug never sticks to a new post.
function rankMathMetaFromArticle(article = {}, { postLink = '' } = {}) {
  const focusKeyword = article.rankMathFocusKeyword || article.seoBrief?.targetKeyword || article.generatedTitle || article.title || '';
  const canonical = article.canonicalUrlManual === true ? article.canonicalUrl : postLink;
  const meta = {
    rank_math_title: article.rankMathTitle || article.metaTitle || article.generatedTitle || article.title || '',
    rank_math_description: article.rankMathDescription || article.metaDescription || article.excerpt || '',
    rank_math_focus_keyword: focusKeyword,
    rank_math_canonical_url: canonical || ''
  };
  Object.keys(meta).forEach((key) => !meta[key] && delete meta[key]);
  return meta;
}

// Open Graph fields are sent separately and best-effort: Rank Math does not document which keys
// its REST endpoint accepts, so a rejection must never undo the core SEO update.
function rankMathSocialMeta(article = {}, { imageUrl = '' } = {}) {
  const meta = {
    rank_math_facebook_title: article.openGraphTitle || '',
    rank_math_facebook_description: article.openGraphDescription || '',
    rank_math_facebook_image: /^https:\/\//.test(imageUrl) ? imageUrl : ''
  };
  Object.keys(meta).forEach((key) => !meta[key] && delete meta[key]);
  return meta;
}

module.exports = { rankMathMetaFromArticle, rankMathSocialMeta };
