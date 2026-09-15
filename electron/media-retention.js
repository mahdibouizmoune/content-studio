'use strict';

const MIN_MEDIA_RETENTION_DAYS = 7;
const MAX_MEDIA_RETENTION_DAYS = 365;

function normalizeMediaRetentionDays(value, fallback = MIN_MEDIA_RETENTION_DAYS) {
  const parsed = Number(value);
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.max(MIN_MEDIA_RETENTION_DAYS, Math.min(MAX_MEDIA_RETENTION_DAYS, Math.round(days)));
}

function mediaCleanupCandidates(files = [], referencedPaths = new Set(), olderThanDays = MIN_MEDIA_RETENTION_DAYS, now = Date.now()) {
  const cutoff = Number(now) - normalizeMediaRetentionDays(olderThanDays) * 24 * 60 * 60 * 1000;
  return (Array.isArray(files) ? files : []).filter((file) => {
    const key = String(file?.referenceKey || file?.path || '').toLowerCase();
    return Boolean(key)
      && Number(file?.mtimeMs || 0) < cutoff
      && !referencedPaths.has(key);
  });
}

module.exports = {
  MAX_MEDIA_RETENTION_DAYS,
  MIN_MEDIA_RETENTION_DAYS,
  mediaCleanupCandidates,
  normalizeMediaRetentionDays
};
