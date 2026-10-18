'use strict';

const WEEK = 7 * 86400000;

function eligibleWordPressPins(records, batches, now = Date.now()) {
  return records.filter((record) => {
    const uploaded = Date.parse(record.uploadedAt);
    if (record.kind !== 'finished-pinterest-pin' || !Number.isInteger(record.mediaId) || record.mediaId <= 0 || !Number.isFinite(uploaded) || now < uploaded + WEEK) return false;
    return !batches.some((batch) => !batch || (batch.fileStatus !== 'failed' && (!Array.isArray(batch.rows) || batch.rows.some((row) => {
      if (!Array.isArray(row?.cells)) return true;
      if (row.cells[1] !== record.url) return false;
      const outcome = batch.outcomes?.[row.number];
      if (!outcome || !['failed', 'confirmed'].includes(outcome.status)) return true;
      if (outcome.status === 'failed') return false;
      const date = row.cells[6] || '';
      const scheduled = date ? Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(date) ? date : `${date}Z`) : 0;
      const reported = Date.parse(outcome.reportedAt);
      if (!Number.isFinite(scheduled) || !Number.isFinite(reported)) return true;
      return now < Math.max(scheduled, reported) + WEEK;
    }))));
  });
}

async function cleanupWordPressPins({ records, batches, now, inspect, isReferenced, remove, save }) {
  const results = [];
  for (const record of eligibleWordPressPins(records, batches, now)) {
    try {
      const media = await inspect(record);
      if (!media) { await save(record); results.push({ mediaId: record.mediaId, alreadyMissing: true }); continue; }
      if (media.id !== record.mediaId || media.source_url !== record.url || Number(media.post || 0) > 0) continue;
      if (await isReferenced(record, media)) continue;
      await remove(record);
      await save(record);
      results.push({ mediaId: record.mediaId, deleted: true });
    } catch (error) { results.push({ mediaId: record.mediaId, error: error.message }); }
  }
  return results;
}

module.exports = { eligibleWordPressPins, cleanupWordPressPins };
