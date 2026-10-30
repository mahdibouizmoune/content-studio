'use strict';

const WINDOW_MS = 14 * 86400000;
const INACTIVE = new Set(['failed', 'deleted']);

// Compare the caption body, not the exact payload: rescheduling or re-hosting the image changes
// the payload fingerprint but still produces the same post for readers.
function captionKey(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 200);
}

function findLogicalGhlDuplicate(receipts = [], { platform = '', locationId = '', caption = '', scheduleDate = '', targetAccountIds = [] } = {}) {
  const key = captionKey(caption);
  if (key.length < 20) return null;
  const at = Date.parse(scheduleDate);
  return (Array.isArray(receipts) ? receipts : []).find((receipt) => {
    if (INACTIVE.has(String(receipt.status || '').toLowerCase())) return false;
    if (String(receipt.platform || '').toLowerCase() !== String(platform || '').toLowerCase()) return false;
    if (receipt.locationId && locationId && receipt.locationId !== locationId) return false;
    const previousAccounts = Array.isArray(receipt.targetAccountIds) ? receipt.targetAccountIds.map(String) : [];
    const nextAccounts = Array.isArray(targetAccountIds) ? targetAccountIds.map(String) : [];
    // Unknown legacy targets remain conservative; disjoint known targets are not duplicates.
    if (previousAccounts.length && nextAccounts.length && !previousAccounts.some(id => nextAccounts.includes(id))) return false;
    const previous = Date.parse(receipt.scheduleDate || receipt.createdAt || '');
    if (Number.isFinite(at) && Number.isFinite(previous) && Math.abs(at - previous) > WINDOW_MS) return false;
    return captionKey(receipt.caption) === key;
  }) || null;
}

module.exports = { captionKey, findLogicalGhlDuplicate };
