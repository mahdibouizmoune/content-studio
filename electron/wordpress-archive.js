'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { parseDocument } = require('htmlparser2');
const { selectAll } = require('css-select');
const { textContent } = require('domutils');
const sanitizeHtml = require('sanitize-html');
const { extractRecipeData } = require('./recipe-quality');
const { canonicalArticle } = require('./pin-scheduler');
const sha = value => createHash('sha256').update(String(value)).digest('hex');
function cleanPost(post, site) {
  const url = new URL(post.link);
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== new URL(site.url).origin || !Number.isSafeInteger(post.id) || post.id < 1 || post.status !== 'publish') throw new Error('Archive returned an invalid published post identity.');
  const raw = String(post.content?.rendered || '');
  if (raw.length > 200000) throw new Error('A source post exceeds the 200 KB archive limit. No partial page was saved.');
  const title = textContent(parseDocument(String(post.title?.rendered || ''))).trim().slice(0, 300);
  if (!title) throw new Error('A source post has no title.');
  const content = sanitizeHtml(raw, { allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'section'], allowedAttributes: { '*': ['id', 'class'], a: ['href', 'title'], img: ['src', 'alt', 'width', 'height', 'loading'] }, allowedSchemes: ['http', 'https'], allowProtocolRelative: false });
  const images = selectAll('img[src]', parseDocument(content)).flatMap(n => {
    try { const u = new URL(n.attribs.src, url); return u.protocol === 'https:' && !u.username && !u.password ? [{ url: u.href, alt: n.attribs.alt || '' }] : []; } catch { return []; }
  }).slice(0, 30);
  let featuredImageUrl = '';
  try {
    const featured = post._embedded?.['wp:featuredmedia']?.[0], u = new URL(featured?.source_url);
    if (u.protocol === 'https:' && !u.username && !u.password) {
      featuredImageUrl = u.href;
      if (!images.some(image => image.url === u.href)) images.unshift({ url: u.href, alt: String(featured.alt_text || '').slice(0, 500) });
    }
  } catch { /* Missing featured media is explicit, not guessed from a gallery. */ }
  const modifiedAt = `${String(post.modified_gmt || '').replace(/Z$/, '')}Z`;
  if (!Number.isFinite(Date.parse(modifiedAt))) throw new Error('Archive post is missing its UTC revision time.');
  const key = `${site.id}:${post.id}`;
  return { key, siteId: site.id, siteUrl: site.url, postId: post.id, title, url: canonicalArticle(url.href), modifiedAt, content, contentHash: sha(content), images, featuredImageUrl, recipes: extractRecipeData(raw, url.href), fetchedAt: new Date().toISOString() };
}
function createWordPressArchive({ store, readArchive }) {
  const get = () => ({ posts: [], ...store.get('contentOperations.archive', {}) });
  const sites = () => (store.get('settings', {}).wordpressSites || []).map(s => ({ id: s.id || s.url, url: s.url, name: s.name || s.url }));
  let busy = false;
  return { run: async (action, p = {}) => {
    const d = get();
    if (action === 'snapshot') return { sites: sites(), posts: d.posts.map(({ content, ...post }) => ({ ...post, contentLength: content.length })), lastRead: d.lastRead || null };
    if (action === 'sync') {
      if (busy) throw new Error('An archive page is already loading.');
      const site = sites().find(s => s.id === p.siteId), page = Number(p.page || 1);
      if (!site || !Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error('Choose a configured WordPress site and valid page.');
      if (!readArchive) throw new Error('Archive reading is unavailable in this build.');
      const after = p.modifiedAfter ? new Date(p.modifiedAfter).toISOString() : '';
      busy = true;
      try {
        const result = await readArchive({ siteId: site.id, page, modifiedAfter: after });
        if (!Array.isArray(result.posts) || result.posts.length > 25) throw new Error('WordPress returned an unexpected archive page.');
        const incoming = result.posts.map(post => cleanPost(post, site));
        const latest = get(), map = new Map(latest.posts.map(post => [post.key, post]));
        for (const post of incoming) map.set(post.key, post);
        if (map.size > 300) throw new Error('Archive has 300 cached references. Remove old references before loading more. Existing articles are unchanged.');
        const value = { ...latest, posts: [...map.values()], lastRead: { siteId: site.id, page, modifiedAfter: after, totalPages: Number(result.totalPages) || 1, readAt: new Date().toISOString() } };
        store.set('contentOperations.archive', value); return { count: incoming.length, totalPages: value.lastRead.totalPages };
      } finally { busy = false; }
    }
    if (action === 'import') {
      const post = d.posts.find(post => post.key === p.key);
      if (!post) throw new Error('Choose a cached published post.');
      const articles = store.get('articles', []);
      const duplicate = articles.find(a => (a.wordpressPostId === post.postId && a.wordpressCategorySiteUrl === post.siteUrl) || [a.wordpressPostUrl, a.sourceUrl].some(value => { try { return canonicalArticle(value) === post.url; } catch { return false; } }));
      if (duplicate) return { duplicate: true, articleId: duplicate.id };
      const article = { id: randomUUID(), title: post.title, generatedTitle: post.title, content: post.content, sourceUrl: post.url, wordpressPostUrl: post.url, wordpressPostId: post.postId, wordpressPublishStatus: 'publish', wordpressCategorySiteUrl: post.siteUrl, workflowStatus: 'published', queueStatus: 'completed', sourceRevision: post.modifiedAt, archiveSourceHash: post.contentHash, importedSourceRecipes: post.recipes, recipeCardEnabled: true, featuredImageRemoteUrl: post.featuredImageUrl, images: post.images.map(image => ({ url: image.url, altText: image.alt })), createdAt: new Date().toISOString() };
      store.set('articles', [...articles, article]); return { articleId: article.id, duplicate: false };
    }
    if (action === 'remove') { store.set('contentOperations.archive', { ...d, posts: d.posts.filter(post => post.key !== p.key) }); return {}; }
    throw new Error('Unknown archive operation.');
  } };
}
module.exports = { createWordPressArchive, cleanPost };
