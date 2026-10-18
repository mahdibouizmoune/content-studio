const { createHash, randomUUID } = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');

const MAX_PIN_IMAGE_BYTES = 20000000;
const OUTCOMES = new Set(['pending', 'confirmed', 'failed', 'review']);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const accountKey = (value) => String(value || '').normalize('NFKC').trim().toLowerCase();
const accountScopesOverlap = (left, right) => !left.accountKey || !right.accountKey || left.accountKey === right.accountKey;
const deliveryContentKey = (row) => digest(JSON.stringify([String(row.pinId), row.identity.sha256 || row.identity.perceptualHash, row.cells[2]]));

function imageCompatibilityError(metadata, contentType, bytes, url = '') {
  if (bytes > MAX_PIN_IMAGE_BYTES) return 'Finished Pin exceeds the 20 MB image limit.';
  const expectedMime = { jpeg: 'image/jpeg', png: 'image/png' }[metadata.format];
  if (!expectedMime) return 'Finished CSV images must be decoded JPEG or PNG files. Rehost as JPEG.';
  if (String(contentType).split(';')[0].trim().toLowerCase() !== expectedMime) return 'Image MIME type does not match its decoded format. Rehost this Pin.';
  if (url) {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    const allowed = metadata.format === 'jpeg' ? ['.jpg', '.jpeg'] : ['.png'];
    if (!allowed.includes(extension)) return 'Image filename extension does not match its decoded format. Rehost this Pin.';
  }
  return '';
}

function hasPinterestDimensions(check = {}, allowOriginalRatio = false) {
  return (check.width === 1000 && check.height === 1500)
    || (check.width === 1080 && check.height === 1920)
    || (allowOriginalRatio && check.width >= 600 && check.height >= 900 && [2 / 3, 9 / 16].some((ratio) => Math.abs(check.width / check.height - ratio) < 0.005));
}

function assertFinalAsset(row, pin, check, expected, compareIdentity, allowOriginalRatio = false) {
  if (!pin?.id || pin.imageQa?.publicValidatedUrl !== row[1]) throw new Error('No saved, verified finished Pin matches this Media URL. Prepare the CSV again.');
  if (!check?.valid || !hasPinterestDimensions(check, allowOriginalRatio)) throw new Error(check?.error || 'Finished Pin dimensions are invalid.');
  if (!compareIdentity(expected, check, 14).matches) throw new Error('The hosted image changed or does not match the saved finished Pin. Rehost before export.');
}

function makeDeliveryBatch({ rows, pins, identities, account, parentBatchId = '', now = new Date().toISOString() }) {
  account = account ?? '';
  if (typeof account !== 'string' || account.length > 160) throw new Error('Pinterest account label must be at most 160 characters.');
  if (rows.length !== pins.length || rows.length !== identities.length) throw new Error('Export row identity mapping is incomplete.');
  return {
    id: randomUUID(), account: String(account).trim(), accountKey: accountKey(account), createdAt: now,
    parentBatchId, revision: 0, fileStatus: 'preparing', files: [], outcomes: {}, events: [],
    rows: rows.map((cells, index) => {
      const identity = identities[index];
      const assetHash = identity.sha256 || identity.perceptualHash;
      if (!assetHash) throw new Error('Missing saved image identity.');
      return { number: index + 1, pinId: String(pins[index].id), cells: [...cells], identity: { ...identity },
        deliveryKey: digest(JSON.stringify([accountKey(account), String(pins[index].id), assetHash, cells[2]])) };
    })
  };
}

function updateDeliveryOutcomes(batch, { revision, updates, evidence = '' }) {
  if (batch.revision !== revision) throw new Error('This batch changed. Reload it before saving results.');
  if (!Array.isArray(updates) || updates.length > batch.rows.length) throw new Error('Invalid result rows.');
  if (typeof evidence !== 'string' || evidence.length > 100000) throw new Error('Receipt text must be at most 100,000 characters.');
  const numbers = new Set(batch.rows.map((row) => row.number));
  const seen = new Set();
  const outcomes = { ...batch.outcomes };
  const now = new Date().toISOString();
  for (const update of updates) {
    if (!numbers.has(update.number) || seen.has(update.number) || !OUTCOMES.has(update.status)) throw new Error('Invalid or duplicate outcome row.');
    seen.add(update.number);
    outcomes[update.number] = { status: update.status, note: String(update.note || '').slice(0, 1000), reportedAt: now, source: 'user-reported' };
  }
  return { ...batch, revision: batch.revision + 1, outcomes,
    events: [...batch.events, { at: now, updates: updates.map((u) => ({ number: u.number, status: u.status })), evidence: evidence.trim() }] };
}

function suggestFailedRows(batch, text) {
  if (typeof text !== 'string' || text.length > 100000) throw new Error('Receipt text must be at most 100,000 characters.');
  const normalize = (value) => String(value).normalize('NFKC').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const lines = text.split(/\r?\n/).filter((line) => /upload didn['\u2019]t work|failed|error/i.test(line));
  const updates = [];
  let ambiguous = 0;
  for (const line of lines) {
    const fields = line.split(/\t|\|/).map(normalize).filter(Boolean);
    const matches = batch.rows.filter((row) => fields.includes(normalize(row.cells[0])) && fields.includes(normalize(row.cells[2])));
    if (matches.length > 1) { ambiguous++; continue; }
    if (matches.length === 1 && batch.outcomes[matches[0].number]?.status !== 'confirmed' && !updates.some((u) => u.number === matches[0].number)) {
      updates.push({ number: matches[0].number, status: 'failed', note: 'Matched an error row in the pasted receipt.' });
    }
  }
  return { updates, ambiguous, unmatched: batch.rows.length - updates.length };
}

function retryableRows(batch, batches) {
  const confirmed = new Set();
  const outstanding = new Set();
  for (const item of batches.filter((value) => accountScopesOverlap(value, batch))) {
    for (const row of item.rows) {
      const status = item.outcomes[row.number]?.status || 'pending';
      if (status === 'confirmed') confirmed.add(deliveryContentKey(row));
      if (item.id !== batch.id && !['failed'].includes(item.fileStatus) && ['pending', 'review'].includes(status)) outstanding.add(deliveryContentKey(row));
    }
  }
  return batch.rows.filter((row) => batch.outcomes[row.number]?.status === 'failed' && !confirmed.has(deliveryContentKey(row)) && !outstanding.has(deliveryContentKey(row)));
}

async function writeVerifiedFiles(files, { io = fs, onCommitted = async () => {}, beforeCommit = async () => {} } = {}) {
  const staged = [];
  const committed = [];
  try {
    // Stage every output before replacing any completed export.
    for (const file of files) {
      const temporary = path.join(path.dirname(file.path), `.${path.basename(file.path)}.${randomUUID()}.partial`);
      const handle = await io.open(temporary, 'wx');
      staged.push({ ...file, temporary });
      try { await handle.writeFile(file.bytes); await handle.sync(); } finally { await handle.close(); }
      const written = await io.readFile(temporary);
      if (!Buffer.from(file.bytes).equals(written)) throw new Error('File bytes changed while writing.');
      await file.verify?.(written);
    }
    await beforeCommit();
    for (const file of staged) {
      await io.rename(file.temporary, file.path);
      committed.push(file.path);
      await onCommitted([...committed]);
    }
    return committed;
  } catch (error) {
    error.committedFiles = [...committed];
    throw error;
  } finally {
    for (const file of staged) { try { await io.unlink(file.temporary); } catch {} }
  }
}

module.exports = { MAX_PIN_IMAGE_BYTES, hasPinterestDimensions, accountKey, accountScopesOverlap, deliveryContentKey, assertFinalAsset, digest, imageCompatibilityError, makeDeliveryBatch, retryableRows, suggestFailedRows, updateDeliveryOutcomes, writeVerifiedFiles };
