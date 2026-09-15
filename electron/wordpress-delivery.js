const { createHash } = require('node:crypto');

function siteContains(siteUrl, postUrl) {
  try {
    const site = new URL(siteUrl);
    const post = new URL(postUrl);
    const base = site.pathname.replace(/\/+$/, '');
    return site.origin === post.origin && (!base || post.pathname === base || post.pathname.startsWith(base + '/'));
  } catch { return false; }
}

function scopedPostId(siteUrl, article, receipt) {
  if (receipt?.siteUrl === siteUrl && receipt.postId) return Number(receipt.postId);
  const owner = article.wordpressSiteUrl;
  if (owner ? owner === siteUrl : siteContains(siteUrl, article.wordpressPostUrl || article.wordpressDraftUrl)) return Number(article.wordpressPostId || 0);
  return 0;
}

function payloadRevision(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function revisionMarker(revision) { return `<!-- content-studio-revision:${revision} -->`; }

function matchesRevision(post, revision, payload) {
  const content = String(post?.content?.raw || post?.content?.rendered || '');
  return Boolean(post?.id && content.includes(revisionMarker(revision)) && post.status === payload.status);
}

module.exports = { matchesRevision, payloadRevision, revisionMarker, scopedPostId, siteContains };
