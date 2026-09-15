const path = require('node:path');
const { validatePinterestRows, serializePinterestCsv, assertPinterestCsvBytes, splitPinterestRows, mediaExtension } = require('./pinterest-export');
const { accountScopesOverlap, deliveryContentKey, assertFinalAsset, digest, makeDeliveryBatch, retryableRows, writeVerifiedFiles } = require('./pinterest-delivery');

function createPinterestExportService(deps) {
  let busy = false;
  return async function exportCsv({ rows = [], boardNames = [], pinIds = [], account = '', retryBatchId = '' } = {}) {
    if (busy) return { success: false, error: 'A Pinterest export is already running.' };
    busy = true;
    let batch;
    try {
      let validation = validatePinterestRows(rows, Array.isArray(boardNames) ? boardNames : []);
      if (!validation.valid) return { success: false, validation };
      if (typeof account !== 'string' || account.length > 160) throw new Error('Pinterest account label must be at most 160 characters.');
      const saved = deps.getPins();
      const pins = validation.rows.map((row, index) => {
        const matches = saved.filter((pin) => pinIds.length ? String(pin.id) === String(pinIds[index]) : pin.imageQa?.publicValidatedUrl === row[1]);
        if (matches.length !== 1) throw new Error(`Row ${index + 1}: no unique saved Pin matches this export. Reopen the Pinterest CSV editor.`);
        return matches[0];
      });
      if (new Set(pins.map((pin) => pin.id)).size !== pins.length) throw new Error('A saved Pin appears more than once in this export.');
      const identities = [];
      const mediaChecks = [];
      for (let index = 0; index < validation.rows.length; index++) {
        const row = validation.rows[index];
        const pin = pins[index];
        const expected = await deps.identity(pin);
        const check = await deps.validateMedia(row[1]);
        try {
          if (mediaExtension(row[1]) === '.mp4') {
            if (!check.valid || pin.imageQa?.publicValidatedUrl !== row[1]) throw new Error(check.error || 'Video URL is not verified.');
          } else assertFinalAsset(row, pin, check, expected, deps.compareIdentity);
        } catch (error) { throw new Error(`Row ${index + 1}: ${error.message}`); }
        identities.push(expected);
        mediaChecks.push({ row: index + 1, title: row[0], mediaUrl: row[1], ...check });
      }
      const destination = await deps.pickPath();
      if (!destination) return { success: false, canceled: true };
      validation = validatePinterestRows(validation.rows, boardNames);
      if (!validation.valid) return { success: false, validation };
      for (let index = 0; index < pins.length; index++) {
        const current = deps.getPins().find((pin) => String(pin.id) === String(pins[index].id));
        if (!current || current.imageQa?.publicValidatedUrl !== validation.rows[index][1]) throw new Error('A saved Pin changed during export. Prepare the CSV again.');
        const currentIdentity = await deps.identity(current);
        if (currentIdentity.sha256 !== identities[index].sha256 || currentIdentity.perceptualHash !== identities[index].perceptualHash) throw new Error('A finished image changed during export. Prepare the CSV again.');
      }
      batch = makeDeliveryBatch({ rows: validation.rows, pins, identities, account, parentBatchId: retryBatchId });
      // Recheck after asynchronous downloads/dialogs: receipt outcomes may have changed.
      const previous = deps.getBatches();
      if (retryBatchId) {
        const parent = previous.find((item) => item.id === retryBatchId && item.accountKey === batch.accountKey);
        if (!parent) throw new Error('Retry batch does not belong to this Pinterest account.');
        const allowed = retryableRows(parent, previous);
        if (allowed.length !== batch.rows.length || batch.rows.some((row) => !allowed.some((item) => item.pinId === row.pinId && item.identity.sha256 === row.identity.sha256))) {
          throw new Error('Failed rows or image identities changed. Reload the batch before retrying.');
        }
      }
      for (const row of batch.rows) {
        const previousRows = previous.filter((item) => accountScopesOverlap(item, batch) && item.fileStatus !== 'failed')
          .flatMap((item) => item.rows.filter((old) => deliveryContentKey(old) === deliveryContentKey(row)).map((old) => item.outcomes[old.number]?.status || 'pending'));
        if (previousRows.some((status) => status !== 'failed')) throw new Error(`Row ${row.number}: this Pin has a confirmed or unresolved previous export. Record its result in batch history first.`);
      }
      const parsed = path.parse(destination);
      const chunks = splitPinterestRows(validation.rows, 200);
      const files = chunks.map((chunk, index) => {
        const filename = path.join(parsed.dir, `${parsed.name}${chunks.length > 1 ? `-part${index + 1}` : ''}.csv`);
        const bytes = serializePinterestCsv(chunk);
        return { path: filename, bytes, verify: (written) => assertPinterestCsvBytes(written, chunk.length, { expectedRecords: chunk }) };
      });
      batch.files = files.map((file) => ({ path: file.path, sha256: digest(file.bytes) }));
      deps.saveBatch(batch);
      const reportPath = path.join(parsed.dir, `${parsed.name}.validation.json`);
      const report = { schemaVersion: 3, batchId: batch.id, account: batch.account, generatedAt: batch.createdAt,
        validationScope: 'Local CSV and saved finished-image verification; not Pinterest acceptance',
        pinterestImportStatus: 'unconfirmed', pinterestAcceptedRows: null, rowCount: rows.length,
        files: batch.files, valid: true, scheduleAudit: validation.scheduleAudit, mediaChecks,
        errors: [], warnings: validation.warnings };
      files.push({ path: reportPath, bytes: Buffer.from(JSON.stringify(report, null, 2)), verify: (bytes) => JSON.parse(bytes) });
      await (deps.writeFiles || writeVerifiedFiles)(files, { onCommitted: async (committedFiles) => {
        batch = { ...batch, committedFiles };
        deps.saveBatch(batch);
      } });
      batch = { ...batch, fileStatus: 'ready' };
      deps.saveBatch(batch);
      deps.saveAccount(account.trim());
      return { success: true, batchId: batch.id, filePaths: batch.files.map((file) => file.path), reportPath, rowCount: rows.length, validation };
    } catch (error) {
      if (batch && deps.getBatches().some((item) => item.id === batch.id)) {
        batch = { ...batch, fileStatus: (error.committedFiles || batch.committedFiles || []).length ? 'partial' : 'failed', error: error.message };
        deps.saveBatch(batch);
      }
      return { success: false, error: error.message, validation: { valid: false, errors: [{ field: 'Export', message: error.message }], warnings: [] } };
    } finally { busy = false; }
  };
}

module.exports = { createPinterestExportService };
