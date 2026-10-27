const path = require('node:path');
const { mapBounded } = require('./bounded-work');
const { stringify } = require('csv-stringify/sync');
const { PINTEREST_CSV_HEADERS } = require('./pinterest-export');
const { canonicalBoardMatch } = require('./pinterest-board-rules.js');
const { validatePinterestRows, serializePinterestCsv, assertPinterestCsvBytes, splitPinterestRows, mediaExtension } = require('./pinterest-export');
const { accountScopesOverlap, deliveryContentKey, assertFinalAsset, digest, makeDeliveryBatch, retryableRows, writeVerifiedFiles } = require('./pinterest-delivery');

function createPinterestExportService(deps) {
  let busy = false;
  return async function exportCsv({ rows = [], boardNames = [], pinIds = [], account = '', retryBatchId = '', mediaHost = 'auto', redownloadExisting = false, skipRows = [] } = {}) {
    if (busy) return { success: false, error: 'A Pinterest export is already running.' };
    busy = true;
    let batch;
    function saveProgress(next) {
      const current = deps.getBatches().find(item => item.id === next.id);
      batch = { ...next, ...(current ? { revision: current.revision, outcomes: current.outcomes, events: current.events } : {}) };
      deps.saveBatch(batch);
    }
    try {
      const options = { allowTemporary: mediaHost === 'replicate' };
      let validation = validatePinterestRows(rows, Array.isArray(boardNames) ? boardNames : [], options);
      if (validation.errors.some((error) => !error.rowIndex)) return { success: false, validation };
      const rowIssues = new Map();
      for (const issue of [...validation.errors, ...(Array.isArray(skipRows) ? skipRows : [])]) {
        const number = Number(issue.rowIndex || issue.row);
        if (Number.isInteger(number) && number > 0 && number <= validation.rows.length) {
          rowIssues.set(number, [...(rowIssues.get(number) || []), String(issue.message || issue.reason || 'Invalid Pin')]);
        }
      }
      if (typeof account !== 'string' || account.length > 160) throw new Error('Pinterest account label must be at most 160 characters.');
      const saved = deps.getPins();
      const pins = validation.rows.map((row, index) => {
        const matches = saved.filter((pin) => pinIds.length ? String(pin.id) === String(pinIds[index]) : pin.imageQa?.publicValidatedUrl === row[1]);
        if (matches.length !== 1) {
          rowIssues.set(index + 1, [...(rowIssues.get(index + 1) || []), 'No unique saved Pin matches this row']);
          return null;
        }
        return matches[0];
      });
      const seenPins = new Set();
      pins.forEach((pin, index) => {
        if (!pin || rowIssues.has(index + 1)) return;
        if (seenPins.has(pin.id)) rowIssues.set(index + 1, ['A saved Pin appears more than once in this export']);
        else seenPins.add(pin.id);
      });
      const identities = [];
      const mediaChecks = [];
      const linkChecks = [];
      const rejected = [];
      const acceptedIndexes = [];
      const linkPromises = new Map();
      const checkedRows = await mapBounded(validation.rows, 4, async (_row, index) => {
        const row = validation.rows[index];
        if (rowIssues.has(index + 1)) return { rejected: { row: index + 1, cells: row, reason: [...new Set(rowIssues.get(index + 1))].join('; ') } };
        const pin = pins[index];
        try {
        const expected = await deps.identity(pin);
        let check;
        for (let attempt = 0; attempt < 3; attempt++) {
          check = await deps.validateMedia(row[1], options);
          if (check.valid || (check.status && check.status < 500 && check.status !== 429)) break;
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 500));
        }
        try {
          if (mediaExtension(row[1]) === '.mp4') {
            if (!check.valid || pin.imageQa?.publicValidatedUrl !== row[1]) throw new Error(check.error || 'Video URL is not verified.');
          } else assertFinalAsset(row, pin, check, expected, deps.compareIdentity, options.allowTemporary);
        } catch (error) {
          return { rejected: { row: index + 1, cells: row, reason: error.message }, media: { row: index + 1, title: row[0], mediaUrl: row[1], ...check } };
        }
        if (!linkPromises.has(row[5])) linkPromises.set(row[5], deps.validateLink ? Promise.resolve(deps.validateLink(row[5])) : Promise.resolve({ valid: true, networkChecked: false }));
        const linkCheck = await linkPromises.get(row[5]);
        if (!linkCheck.valid) {
          return { rejected: { row: index + 1, cells: row, reason: linkCheck.error || 'Destination is unavailable.' }, link: { row: index + 1, ...linkCheck } };
        }
        return { index, expected, link: { row: index + 1, ...linkCheck }, media: { row: index + 1, title: row[0], mediaUrl: row[1], ...check } };
        } catch (error) {
          return { rejected: { row: index + 1, cells: row, reason: error.message || 'Pin verification failed' } };
        }
      });
      for (const checked of checkedRows) {
        if (checked.link) linkChecks.push(checked.link);
        if (checked.media) mediaChecks.push(checked.media);
        if (checked.rejected) rejected.push(checked.rejected);
        else { acceptedIndexes.push(checked.index); identities.push(checked.expected); }
      }
      const originalRowCount = validation.rows.length;
      const acceptedRows = acceptedIndexes.map((index) => validation.rows[index]);
      const acceptedPins = acceptedIndexes.map((index) => pins[index]);
      pins.splice(0, pins.length, ...acceptedPins);
      if (!acceptedRows.length) {
        const destination = await deps.pickPath();
        if (!destination) return { success: false, canceled: true };
        const parsed = path.parse(destination);
        const rejectedPath = path.join(parsed.dir, `${parsed.name}-REJECTED.csv`);
        const bytes = Buffer.from(stringify([ [...PINTEREST_CSV_HEADERS, 'Reason'], ...rejected.map((item) => [...item.cells, item.reason]) ], { record_delimiter: '\r\n' }));
        const reportPath = path.join(parsed.dir, `${parsed.name}.validation.json`);
        const report = { schemaVersion: 3, pinterestImportStatus: 'not-exported', pinterestAcceptedRows: null,
          validationScope: 'Local and public URL checks only; not Pinterest acceptance',
          summary: { inputRows: originalRowCount, rowsWritten: 0, rowsRejected: rejected.length }, rejected, mediaChecks, linkChecks };
        await (deps.writeFiles || writeVerifiedFiles)([
          { path: rejectedPath, bytes, verify: (written) => { if (!written.equals(bytes)) throw new Error('Rejected report changed.'); } },
          { path: reportPath, bytes: Buffer.from(JSON.stringify(report, null, 2)), verify: (written) => JSON.parse(written) }
        ], { onCommitted: async () => {} });
        return { success: false, error: `No valid Pins remain: ${rejected[0]?.reason || 'verification failed'}. Review ${rejectedPath}`, rejectedCount: rejected.length, rejectedPath, reportPath };
      }
      validation = validatePinterestRows(acceptedRows, boardNames, options);
      function keepAcceptedRows(keep, sourceRows = validation.rows) {
        const nextPins = keep.map((index) => pins[index]);
        const nextIdentities = keep.map((index) => identities[index]);
        const nextIndexes = keep.map((index) => acceptedIndexes[index]);
        validation = validatePinterestRows(keep.map((index) => sourceRows[index]), boardNames, options);
        pins.splice(0, pins.length, ...nextPins);
        identities.splice(0, identities.length, ...nextIdentities);
        acceptedIndexes.splice(0, acceptedIndexes.length, ...nextIndexes);
      }
      async function recheckAcceptedRows() {
        const fresh = validatePinterestRows(validation.rows, boardNames, options);
        const checks = await mapBounded(fresh.rows, 4, async (row, index) => {
          try {
            const issues = fresh.errors.filter((error) => error.rowIndex === index + 1);
            if (issues.length) throw new Error(issues.map((error) => error.message).join('; '));
            const current = deps.getPins().find((pin) => String(pin.id) === String(pins[index].id));
            if (!current || current.imageQa?.publicValidatedUrl !== row[1]) throw new Error('A saved Pin changed during export.');
            const identity = await deps.identity(current);
            if (identity.sha256 !== identities[index].sha256 || identity.perceptualHash !== identities[index].perceptualHash) throw new Error('A finished image changed during export.');
            return { index };
          } catch (error) {
            return { rejected: { row: acceptedIndexes[index] + 1, cells: row, reason: error.message } };
          }
        });
        rejected.push(...checks.flatMap((check) => check.rejected ? [check.rejected] : []));
        const keep = checks.filter((check) => !check.rejected).map((check) => check.index);
        if (!keep.length) throw new Error(`No valid Pins remain: ${checks[0]?.rejected?.reason || 'verification failed'}`);
        keepAcceptedRows(keep, fresh.rows);
      }
      await recheckAcceptedRows();
      batch = makeDeliveryBatch({ rows: validation.rows, pins, identities, account, parentBatchId: retryBatchId });
      // Recheck after asynchronous downloads/dialogs: receipt outcomes may have changed.
      const previous = deps.getBatches();
      if (retryBatchId) {
        const parent = previous.find((item) => item.id === retryBatchId && item.accountKey === batch.accountKey);
        if (!parent) throw new Error('Retry batch does not belong to this Pinterest account.');
        const allowed = retryableRows(parent, previous);
        if (batch.rows.length > allowed.length || batch.rows.some((row) => !allowed.some((item) => item.pinId === row.pinId && item.identity.sha256 === row.identity.sha256))) {
          throw new Error('Failed rows or image identities changed. Reload the batch before retrying.');
        }
      }
      let duplicateRows = batch.rows.flatMap((row) => {
        const matches = previous.filter((item) => accountScopesOverlap(item, batch) && item.fileStatus !== 'failed')
          .flatMap((item) => item.rows
            .filter((old) => deliveryContentKey(old) === deliveryContentKey(row) && (item.outcomes[old.number]?.status || 'pending') !== 'failed')
            .map(() => ({ batchId: item.id })));
        return matches.length ? [{ rowNumber: row.number, matches }] : [];
      });
      if (!retryBatchId && !redownloadExisting && duplicateRows.length && duplicateRows.length < batch.rows.length) {
        const duplicates = new Set(duplicateRows.map((row) => row.rowNumber - 1));
        for (const index of duplicates) rejected.push({
          row: acceptedIndexes[index] + 1, cells: validation.rows[index],
          reason: 'This Pin already has a confirmed or unresolved previous export; skipped to prevent duplicates'
        });
        keepAcceptedRows(validation.rows.map((_, index) => index).filter((index) => !duplicates.has(index)));
        batch = { ...batch, rows: makeDeliveryBatch({ rows: validation.rows, pins, identities, account }).rows };
        duplicateRows = [];
      }
      const redownloadOnly = !retryBatchId && redownloadExisting && duplicateRows.length === batch.rows.length;
      function assertDeliveryState() {
        const latest = deps.getBatches().filter(item => item.id !== batch.id);
        if (retryBatchId) {
          const parent = latest.find(item => item.id === retryBatchId && item.accountKey === batch.accountKey);
          const allowed = parent ? retryableRows(parent, latest) : [];
          if (batch.rows.some(row => !allowed.some(item => item.pinId === row.pinId && item.identity.sha256 === row.identity.sha256))) throw new Error('Import results changed during export. Reload batch history before retrying.');
        } else if (!redownloadOnly && batch.rows.some(row => latest.some(item => accountScopesOverlap(item, batch) && item.fileStatus !== 'failed' && item.rows.some(old => deliveryContentKey(old) === deliveryContentKey(row) && (item.outcomes?.[old.number]?.status || 'pending') !== 'failed')))) {
          throw new Error('A previous export changed during download. Review batch history to prevent duplicate Pins.');
        }
      }
      if (duplicateRows.length && !redownloadOnly) {
        const first = duplicateRows[0];
        const allRowsCovered = duplicateRows.length === batch.rows.length;
        const message = `Row ${first.rowNumber}: this Pin has a confirmed or unresolved previous export. Record its result in batch history first.`;
        return {
          success: false,
          error: message,
          duplicateDownloadAvailable: !retryBatchId && allRowsCovered,
          existingBatchIds: [...new Set(duplicateRows.flatMap((item) => item.matches.map((match) => match.batchId)))],
          validation: { valid: false, errors: [{ field: 'Export', message }], warnings: [] }
        };
      }
      if (redownloadExisting && !redownloadOnly) throw new Error('No complete previous export matches these rows. Prepare a fresh export instead.');
      const destination = await deps.pickPath();
      if (!destination) return { success: false, canceled: true };
      await recheckAcceptedRows();
      batch = { ...batch, rows: makeDeliveryBatch({ rows: validation.rows, pins, identities, account, parentBatchId: retryBatchId }).rows };
      batch.rows = batch.rows.map((row, index) => ({ ...row, sourceRow: acceptedIndexes[index] + 1 }));
      batch.selectedRowCount = rows.length;
      batch.rejectedRows = rejected.map(item => ({ sourceRow: item.row, title: item.cells?.[0] || '', reason: item.reason }));
      batch.scheduleContract = { owner: 'pinterest-csv-import', timeBasis: 'UTC', selectedDatesPreserved: true };
      assertDeliveryState();
      const parsed = path.parse(destination);
      const chunks = splitPinterestRows(validation.rows, 200);
      const files = chunks.map((chunk, index) => {
        const filename = path.join(parsed.dir, `${parsed.name}${chunks.length > 1 ? `-part${index + 1}` : ''}.csv`);
        const bytes = serializePinterestCsv(chunk, options);
        return { path: filename, bytes, verify: (written) => assertPinterestCsvBytes(written, chunk.length, { ...options, expectedRecords: chunk }) };
      });
      batch.files = files.map((file) => ({ path: file.path, sha256: digest(file.bytes) }));
      if (!redownloadOnly) saveProgress(batch);
      const reportPath = path.join(parsed.dir, `${parsed.name}.validation.json`);
      const rejectedPath = rejected.length ? path.join(parsed.dir, `${parsed.name}-REJECTED.csv`) : '';
      if (rejectedPath) {
        const bytes = Buffer.from(stringify([[...PINTEREST_CSV_HEADERS, 'Reason'], ...rejected.map((item) => [...item.cells, item.reason])], { record_delimiter: '\r\n' }));
        files.push({ path: rejectedPath, bytes, verify: (written) => { if (!written.equals(bytes)) throw new Error('Rejected report changed.'); } });
      }
      const existingBatchIds = [...new Set(duplicateRows.flatMap((item) => item.matches.map((match) => match.batchId)))];
      const report = { schemaVersion: 3, batchId: redownloadOnly ? existingBatchIds[0] || '' : batch.id, account: batch.account, generatedAt: batch.createdAt, mediaHost,
        validationScope: 'Local CSV checks and public media/destination network verification; not Pinterest acceptance',
        pinterestImportStatus: redownloadOnly ? 'copy-of-existing-export' : 'unconfirmed', pinterestAcceptedRows: null, rowCount: validation.rows.length,
        redownloadOf: redownloadOnly ? existingBatchIds : [],
        summary: { inputRows: originalRowCount, rowsWritten: validation.rows.length, rowsRejected: rejected.length },
        rejected, linkChecks,
        rowChecks: validation.rows.map((row, index) => ({ sourceRow: acceptedIndexes[index] + 1, encoding: 'utf-8', boardCanonical: boardNames.includes(row[2]), boardFallback: canonicalBoardMatch({ title: row[0], description: row[4] }, boardNames).fallback, scheduledUtc: row[6], titleLength: row[0].length, descriptionLength: row[4].length, keywordCount: row[7] ? row[7].split(',').length : 0 })),
        files: batch.files, valid: true, scheduleAudit: validation.scheduleAudit, mediaChecks,
        errors: [], warnings: validation.warnings };
      files.push({ path: reportPath, bytes: Buffer.from(JSON.stringify(report, null, 2)), verify: (bytes) => JSON.parse(bytes) });
      await (deps.writeFiles || writeVerifiedFiles)(files, { beforeCommit: async () => {
        for (let index = 0; index < pins.length; index++) {
          const current = deps.getPins().find(pin => String(pin.id) === String(pins[index].id));
          if (!current || current.imageQa?.publicValidatedUrl !== validation.rows[index][1]) throw new Error('A saved Pin changed before files were committed.');
          const identity = await deps.identity(current);
          if (identity.sha256 !== identities[index].sha256 || identity.perceptualHash !== identities[index].perceptualHash) throw new Error('A finished image changed before files were committed.');
        }
        assertDeliveryState();
      }, onCommitted: async (committedFiles) => {
        if (!redownloadOnly) {
          batch = { ...batch, committedFiles };
          saveProgress(batch);
        }
      } });
      if (!redownloadOnly) {
        batch = { ...batch, fileStatus: 'ready' };
        saveProgress(batch);
        deps.saveAccount(account.trim());
      }
      return { success: true, redownloaded: redownloadOnly, batchId: redownloadOnly ? existingBatchIds[0] || '' : batch.id, pinIds: pins.map((pin) => pin.id), filePaths: batch.files.map((file) => file.path), reportPath, rowCount: validation.rows.length, rejectedCount: rejected.length, rejectedPath, validation };
    } catch (error) {
      if (batch && deps.getBatches().some((item) => item.id === batch.id)) {
        batch = { ...batch, fileStatus: (error.committedFiles || batch.committedFiles || []).length ? 'partial' : 'failed', error: error.message };
        saveProgress(batch);
      }
      return { success: false, error: error.message, validation: { valid: false, errors: [{ field: 'Export', message: error.message }], warnings: [] } };
    } finally { busy = false; }
  };
}

module.exports = { createPinterestExportService };
