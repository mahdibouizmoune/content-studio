const { randomUUID } = require('crypto');

function normalizeQueueUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('content-studio://')) return raw.toLowerCase();
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    parsed.searchParams.sort?.();
    return parsed.href.replace(/\/+$/, '').toLowerCase();
  } catch {
    return raw.replace(/\/+$/, '').toLowerCase();
  }
}

function pinQueueItemKey(item = {}) {
  if (item.queueType === 'internal-link') return `url:${normalizeQueueUrl(item.url)}`;
  const articleId = item.articleId ? String(item.articleId).trim().toLowerCase() : '';
  if (articleId) return `article:${articleId}`;
  return `url:${normalizeQueueUrl(item.url)}`;
}

function ensurePinQueueIds(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    queueId: item.queueId ? String(item.queueId) : randomUUID()
  }));
}

function dedupePinQueueItems(items = []) {
  const map = new Map();
  for (const item of ensurePinQueueIds(items)) {
    if (!item?.url) continue;
    const key = pinQueueItemKey(item);
    if (!key || key === 'url:') continue;
    const existing = map.get(key) || {};
    map.set(key, {
      ...existing,
      ...item,
      queueId: item.queueId || existing.queueId || randomUUID(),
      url: String(item.url),
      articleId: item.articleId ? String(item.articleId) : existing.articleId || '',
      title: item.title ? String(item.title) : existing.title || '',
      excerpt: item.excerpt ? String(item.excerpt).slice(0, 1200) : existing.excerpt || '',
      targetKeyword: item.targetKeyword ? String(item.targetKeyword).slice(0, 180) : existing.targetKeyword || '',
      queueType: item.queueType ? String(item.queueType) : existing.queueType || '',
      smartPinStyle: item.smartPinStyle ? String(item.smartPinStyle) : existing.smartPinStyle || '',
      csvBoard: item.csvBoard ? String(item.csvBoard) : existing.csvBoard || '',
      interests: Array.isArray(item.interests) && item.interests.length ? item.interests : existing.interests || [],
      addedAt: item.addedAt || existing.addedAt || new Date().toISOString()
    });
  }
  return [...map.values()];
}

function acknowledgePinQueueItems(items = [], queueIds = []) {
  const acknowledged = new Set(
    (Array.isArray(queueIds) ? queueIds : [queueIds])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );
  if (!acknowledged.size) return dedupePinQueueItems(items);
  return dedupePinQueueItems(items).filter((item) => !acknowledged.has(String(item.queueId)));
}

module.exports = {
  acknowledgePinQueueItems,
  dedupePinQueueItems,
  ensurePinQueueIds,
  normalizeQueueUrl,
  pinQueueItemKey
};
