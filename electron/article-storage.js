const { randomUUID } = require('crypto');

function normalizeArticleIdentity(article = {}, options = {}) {
  if (!article || typeof article !== 'object' || Array.isArray(article)) {
    throw new Error('Each imported article must be a JSON object.');
  }

  const usedIds = options.usedIds instanceof Set ? options.usedIds : new Set();
  const createId = typeof options.createId === 'function' ? options.createId : randomUUID;
  const now = options.now || new Date().toISOString();
  let id = String(article.id || '').trim();

  if (!id || usedIds.has(id)) {
    do {
      id = String(createId());
    } while (!id || usedIds.has(id));
  }
  usedIds.add(id);

  return {
    ...article,
    id,
    createdAt: article.createdAt || now,
    updatedAt: article.updatedAt || now
  };
}

function normalizeImportedArticles(items = [], options = {}) {
  if (!Array.isArray(items)) throw new Error('Expected an array of articles.');
  const maxArticles = Math.max(1, Number(options.maxArticles || 5000));
  if (items.length > maxArticles) {
    throw new Error(`The import contains ${items.length} articles. The maximum is ${maxArticles}.`);
  }

  const usedIds = new Set();
  return items.map((article) => normalizeArticleIdentity(article, {
    ...options,
    usedIds
  }));
}

module.exports = {
  normalizeArticleIdentity,
  normalizeImportedArticles
};
