const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { imageCompatibilityError, makeDeliveryBatch, updateDeliveryOutcomes, suggestFailedRows, retryableRows, writeVerifiedFiles } = require('../electron/pinterest-delivery');
const { createPinterestExportService } = require('../electron/pinterest-export-service');
const { comparePinterestImageIdentity } = require('../electron/pinterest-overlay');

const hash = 'a'.repeat(64);
const makePin = (id = '1') => ({ id, imageQa: { sha256: hash, publicValidatedUrl: `https://media.example/${id}.jpg` } });
const row = (id = '1') => [`Soup ${id}`, `https://media.example/${id}.jpg`, 'Dinner', '', 'Recipe', `https://recipes.example/${id}`, '', 'soup'];
function batch(count = 3, account = 'Gourmet Gather') {
  const ids = Array.from({ length: count }, (_, i) => String(i + 1));
  return makeDeliveryBatch({ rows: ids.map(row), pins: ids.map(makePin), identities: ids.map(() => ({ sha256: hash })), account });
}
function harness(overrides = {}) {
  let batches = [];
  let writes = 0;
  const dependencies = {
    getPins: () => [makePin()], identity: async () => ({ sha256: hash }),
    compareIdentity: comparePinterestImageIdentity,
    validateMedia: async () => ({ valid: true, width: 1000, height: 1500, sha256: hash }),
    getBatches: () => batches,
    saveBatch: (value) => { batches = [structuredClone(value), ...batches.filter((item) => item.id !== value.id)]; },
    saveAccount: () => {}, pickPath: async () => 'C:/test/batch.csv',
    writeFiles: async (files, { onCommitted, beforeCommit }) => {
      await beforeCommit?.();
      writes++;
      const done = [];
      for (const file of files) { await file.verify(file.bytes); done.push(file.path); await onCommitted([...done]); }
    }, ...overrides
  };
  return { run: createPinterestExportService(dependencies), getBatches: () => batches, saveBatch: dependencies.saveBatch, writes: () => writes };
}
const request = () => ({ rows: [row()], pinIds: ['1'], account: 'Gourmet Gather' });

test('the last precommit guard preserves an existing file and removes staged partials', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cs-audit-csv-'));
  try {
    const target = path.join(directory, 'pins.csv'); await fs.writeFile(target, 'original');
    await assert.rejects(writeVerifiedFiles([{ path: target, bytes: Buffer.from('replacement') }], { beforeCommit: async () => { throw new Error('Receipt changed'); } }), /Receipt changed/);
    assert.equal(await fs.readFile(target, 'utf8'), 'original');
    assert.deepEqual(await fs.readdir(directory), ['pins.csv']);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('retry eligibility is rechecked after the save dialog, before writing another CSV', async () => {
  let service, changed = false;
  service = harness({ pickPath: async () => {
    if (changed) {
      const original = service.getBatches().find(item => !item.parentBatchId);
      service.saveBatch(updateDeliveryOutcomes(original, { revision: original.revision, updates: [{ number: 1, status: 'confirmed' }] }));
    }
    return 'C:/test/batch.csv';
  } });
  await service.run(request());
  const original = updateDeliveryOutcomes(service.getBatches()[0], { revision: 0, updates: [{ number: 1, status: 'failed' }] });
  service.saveBatch(original); changed = true;
  const retry = await service.run({ ...request(), retryBatchId: original.id });
  assert.equal(retry.success, false); assert.match(retry.error, /results changed/); assert.equal(service.writes(), 1);
});

test('result changes while files are staged prevent committing a retry', async () => {
  let service, changeDuringStage = false;
  service = harness({ writeFiles: async (_files, { beforeCommit }) => {
    if (changeDuringStage) {
      const original = service.getBatches().find(item => !item.parentBatchId);
      service.saveBatch(updateDeliveryOutcomes(original, { revision: original.revision, updates: [{ number: 1, status: 'confirmed' }] }));
    }
    await beforeCommit();
  } });
  await service.run(request());
  const original = updateDeliveryOutcomes(service.getBatches()[0], { revision: 0, updates: [{ number: 1, status: 'failed' }] });
  service.saveBatch(original); changeDuringStage = true;
  const retry = await service.run({ ...request(), retryBatchId: original.id });
  assert.equal(retry.success, false); assert.match(retry.error, /results changed/);
  assert.equal(service.getBatches().find(item => item.parentBatchId)?.fileStatus, 'failed');
});

test('file progress never overwrites receipt outcomes reported during the download', async () => {
  let service;
  service = harness({ writeFiles: async (files, { beforeCommit, onCommitted }) => {
    await beforeCommit();
    const current = service.getBatches()[0];
    service.saveBatch(updateDeliveryOutcomes(current, { revision: current.revision, updates: [{ number: 1, status: 'confirmed' }] }));
    await onCommitted(files.map(file => file.path));
  } });
  assert.equal((await service.run(request())).success, true);
  assert.equal(service.getBatches()[0].outcomes[1].status, 'confirmed');
  assert.equal(service.getBatches()[0].revision, 1);
});

for (const failure of ['media', 'link']) {
  test(`${failure} failures produce a rejected file without marking failed Pins exported`, async () => {
    let written;
    const service = harness({
      getPins: () => ['1', '2'].map(makePin),
      validateMedia: async (url) => failure === 'media' && url.endsWith('/2.jpg')
        ? { valid: false, status: 200, contentType: 'image/webp', error: 'JPEG URL returned WebP' }
        : { valid: true, status: 200, contentType: 'image/jpeg', width: 1000, height: 1500, sha256: hash },
      validateLink: async (url) => ({ valid: !(failure === 'link' && url.endsWith('/2')), status: url.endsWith('/2') ? 404 : 200, networkChecked: true, error: 'Destination returned HTTP 404' }),
      writeFiles: async (files) => { written = files; }
    });
    const result = await service.run({ ...request(), rows: ['1', '2'].map(row), pinIds: ['1', '2'] });
    assert.equal(result.success, true);
    assert.equal(result.rowCount, 1);
    assert.equal(result.rejectedCount, 1);
    assert.deepEqual(result.pinIds, ['1']);
    assert.equal(service.getBatches()[0].rows.length, 1);
    const rejected = written.find((file) => file.path.endsWith('-REJECTED.csv'));
    assert.ok(rejected);
    assert.match(rejected.bytes.toString(), /Soup 2/);
    const report = JSON.parse(written.find((file) => file.path.endsWith('.json')).bytes);
    assert.equal(report.summary.rowsRejected, 1);
    assert.equal(report.pinterestAcceptedRows, null);
  });
}

test('all rejected rows write reports only, without creating a delivery batch', async () => {
  let files;
  const service = harness({ validateLink: async () => ({ valid: false, status: 404, error: 'Missing page' }), writeFiles: async (value) => { files = value; } });
  const result = await service.run(request());
  assert.equal(result.success, false);
  assert.deepEqual(service.getBatches(), []);
  assert.equal(files.length, 2);
  assert.ok(files.every((file) => /(?:-REJECTED.csv|validation.json)$/.test(file.path)));
});

test('blank optional account exports all twenty Pins in one standard CSV', async () => {
  const ids = Array.from({ length: 20 }, (_, index) => String(index + 1));
  const service = harness({ getPins: () => ids.map(makePin) });
  const result = await service.run({ rows: ids.map(row), pinIds: ids });
  assert.equal(result.success, true);
  assert.equal(result.rowCount, 20);
  assert.equal(result.filePaths.length, 1);
  assert.equal(service.getBatches()[0].account, '');
});

test('blank and whitespace account labels cannot bypass previous exports', async () => {
  for (const accounts of [['', ''], ['  ', 'Gourmet Gather'], ['Gourmet Gather', '']]) {
    const service = harness();
    assert.equal((await service.run({ ...request(), account: accounts[0] })).success, true);
    const retry = await service.run({ ...request(), account: accounts[1] });
    assert.equal(retry.success, false);
    assert.match(retry.error, /previous export/);
    assert.equal(service.writes(), 1);
  }
});

test('failed-only retry works for unassigned batches without including unresolved rows', async () => {
  const service = harness({ getPins: () => ['1', '2'].map(makePin) });
  await service.run({ rows: ['1', '2'].map(row), pinIds: ['1', '2'], account: '' });
  const original = updateDeliveryOutcomes(service.getBatches()[0], { revision: 0, updates: [{ number: 2, status: 'failed' }] });
  service.saveBatch(original);
  assert.deepEqual(retryableRows(original, service.getBatches()).map((item) => item.pinId), ['2']);
  assert.equal((await service.run({ rows: [row('2')], pinIds: ['2'], account: '', retryBatchId: original.id })).success, true);
});

test('unassigned pending exports block failed-only retries across named scopes', () => {
  const original = updateDeliveryOutcomes(batch(1), { revision: 0, updates: [{ number: 1, status: 'failed' }] });
  const unassigned = batch(1, '');
  assert.deepEqual(retryableRows(original, [original, unassigned]), []);
});

test('optional account still rejects invalid values and excessive labels', async () => {
  for (const account of [{}, 'x'.repeat(161)]) {
    const service = harness();
    assert.equal((await service.run({ ...request(), account })).success, false);
    assert.equal(service.writes(), 0);
  }
});

test('twenty Pins produce one CSV containing all twenty rows', async () => {
  const ids = Array.from({ length: 20 }, (_, index) => String(index + 1));
  const service = harness({ getPins: () => ids.map(makePin) });
  const result = await service.run({ ...request(), rows: ids.map(row), pinIds: ids });
  assert.equal(result.success, true);
  assert.equal(result.rowCount, 20);
  assert.equal(result.filePaths.length, 1);
  assert.equal(service.getBatches()[0].rows.length, 20);
});

for (const failure of ['fields', 'image', 'network', 'preflight', 'save-dialog']) {
  test(`one ${failure} failure exports the other nineteen Pins unchanged`, async () => {
    const ids = Array.from({ length: 20 }, (_, index) => String(index + 1));
    const pins = ids.map(makePin);
    const input = ids.map(row);
    input.forEach((cells, index) => { cells[6] = new Date(Date.now() + (index + 2) * 3600000).toISOString().slice(0, 19); });
    if (failure === 'fields') input[7][1] = '';
    const before = structuredClone(pins);
    let changed = false;
    let files;
    const service = harness({
      getPins: () => pins,
      identity: async (pin) => {
        if (failure === 'network' && pin.id === '8') throw new Error('Connection failed');
        return { sha256: changed && pin.id === '8' ? 'b'.repeat(64) : hash };
      },
      validateMedia: async (url) => ({ valid: true, width: 1000, height: 1500, sha256: failure === 'image' && url.endsWith('/8.jpg') ? 'b'.repeat(64) : hash }),
      pickPath: async () => { changed = failure === 'save-dialog'; return 'C:/test/batch.csv'; },
      writeFiles: async (value) => { files = value; for (const file of value) await file.verify(file.bytes); }
    });
    const result = await service.run({ rows: input, pinIds: ids, skipRows: failure === 'preflight' ? [{ row: 8, reason: 'Hosting failed' }] : [] });
    assert.equal(result.success, true, result.error);
    assert.equal(result.rowCount, 19);
    assert.equal(result.rejectedCount, 1);
    assert.deepEqual(result.pinIds, ids.filter((id) => id !== '8'));
    assert.deepEqual(pins, before);
    assert.deepEqual(service.getBatches()[0].rows.map((item) => item.cells[6]), input.filter((_, index) => index !== 7).map((cells) => cells[6]));
    const report = JSON.parse(files.find((file) => file.path.endsWith('.json')).bytes);
    assert.equal(report.summary.inputRows, 20);
    assert.equal(report.rejected[0].row, 8);
    assert.ok(files.some((file) => file.path.endsWith('-REJECTED.csv')));
  });
}

test('a date expiring in the save dialog skips only that row', async () => {
  const clock = Date.now;
  const now = clock();
  let time = now;
  Date.now = () => time;
  try {
    const input = ['1', '2'].map(row);
    input[0][6] = new Date(now + 3600000).toISOString().slice(0, 19);
    input[1][6] = new Date(now + 7200000).toISOString().slice(0, 19);
    const service = harness({ getPins: () => ['1', '2'].map(makePin), pickPath: async () => { time = now + 5400000; return 'C:/test/batch.csv'; } });
    const result = await service.run({ rows: input, pinIds: ['1', '2'] });
    assert.equal(result.success, true, result.error);
    assert.deepEqual(result.pinIds, ['2']);
    assert.equal(result.rejectedCount, 1);
    assert.equal(service.getBatches()[0].rows[0].cells[6], input[1][6]);
  } finally { Date.now = clock; }
});

test('mixed previous exports are skipped without blocking fresh Pins', async () => {
  const ids = ['1', '2', '3'];
  const service = harness({ getPins: () => ids.map(makePin) });
  assert.equal((await service.run(request())).success, true);
  const result = await service.run({ ...request(), rows: ids.map(row), pinIds: ids });
  assert.equal(result.success, true, result.error);
  assert.deepEqual(result.pinIds, ['2', '3']);
  assert.equal(result.rejectedCount, 1);
  assert.equal(service.getBatches().length, 2);
});

test('a failed-only retry can skip an invalid row without retrying unresolved Pins', async () => {
  const ids = ['1', '2', '3'];
  const service = harness({ getPins: () => ids.map(makePin) });
  await service.run({ ...request(), rows: ids.map(row), pinIds: ids });
  const parent = updateDeliveryOutcomes(service.getBatches()[0], { revision: 0, updates: [{ number: 1, status: 'failed' }, { number: 2, status: 'failed' }] });
  service.saveBatch(parent);
  const bad = row('2'); bad[1] = '';
  const result = await service.run({ ...request(), rows: [row('1'), bad], pinIds: ['1', '2'], retryBatchId: parent.id });
  assert.equal(result.success, true, result.error);
  assert.deepEqual(result.pinIds, ['1']);
  assert.equal(result.rejectedCount, 1);
});

test('failed-only export records a new attempt without confirmed or unresolved rows', async () => {
  const service = harness({ getPins: () => ['1', '2', '3'].map(makePin) });
  await service.run({ ...request(), rows: ['1', '2', '3'].map(row), pinIds: ['1', '2', '3'] });
  const original = updateDeliveryOutcomes(service.getBatches()[0], { revision: 0, updates: [{ number: 1, status: 'confirmed' }, { number: 2, status: 'failed' }] });
  service.saveBatch(original);
  const retry = { ...request(), rows: [row('2')], pinIds: ['2'], retryBatchId: original.id };
  assert.equal((await service.run({ ...retry, account: 'Different account' })).success, false);
  assert.equal((await service.run(retry)).success, true);
  const latest = service.getBatches()[0];
  assert.equal(latest.parentBatchId, original.id);
  assert.deepEqual(latest.rows.map((item) => item.pinId), ['2']);
  assert.deepEqual(latest.outcomes, {});
  assert.equal((await service.run(retry)).success, false);
});

test('concurrent exports cannot create two outstanding attempts', async () => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const service = harness({ pickPath: async () => { await waiting; return 'C:/test/batch.csv'; } });
  const first = service.run(request());
  const second = await service.run(request());
  release();
  assert.match(second.error, /already running/);
  assert.equal((await first).success, true);
  assert.equal(service.writes(), 1);
});

test('a changed saved image while the dialog is open prevents export', async () => {
  let currentHash = hash;
  const service = harness({ identity: async () => ({ sha256: currentHash }), pickPath: async () => { currentHash = 'b'.repeat(64); return 'C:/test/batch.csv'; } });
  const result = await service.run(request());
  assert.match(result.error, /image changed/);
  assert.equal(service.writes(), 0);
});

test('canceling the save dialog creates no delivery attempt', async () => {
  const service = harness({ pickPath: async () => null });
  assert.equal((await service.run(request())).canceled, true);
  assert.equal(service.writes(), 0);
  assert.deepEqual(service.getBatches(), []);
});

test('receipt suggestions do not downgrade previously confirmed rows', () => {
  const confirmed = updateDeliveryOutcomes(batch(), { revision: 0, updates: [{ number: 2, status: 'confirmed' }] });
  assert.deepEqual(suggestFailedRows(confirmed, "| Upload didn't work | Soup 2 | Dinner |").updates, []);
});

test('final exporter writes rejection reports, never an upload CSV, for changed same-size images', async () => {
  const service = harness({ validateMedia: async () => ({ valid: true, width: 1000, height: 1500, sha256: 'b'.repeat(64) }) });
  const result = await service.run(request());
  assert.equal(result.success, false);
  assert.match(result.error, /does not match/);
  assert.equal(service.writes(), 1);
  assert.deepEqual(service.getBatches(), []);
});

test('final exporter fails closed for a missing saved Pin or a mismatched URL', async () => {
  for (const getPins of [() => [], () => [{ ...makePin(), imageQa: { publicValidatedUrl: 'https://other.example/a.jpg' } }]]) {
    const service = harness({ getPins });
    assert.equal((await service.run(request())).success, false);
    assert.equal(service.writes(), 1);
    assert.deepEqual(service.getBatches(), []);
  }
});

test('export manifests remain unconfirmed, account-bound and complete after file commit', async () => {
  const service = harness();
  const result = await service.run(request());
  assert.equal(result.success, true);
  const [saved] = service.getBatches();
  assert.equal(saved.fileStatus, 'ready');
  assert.equal(saved.accountKey, 'gourmet gather');
  assert.deepEqual(saved.rows[0].cells, row());
  assert.deepEqual(saved.outcomes, {});
  assert.equal(saved.committedFiles.length, 2);
  assert.equal(saved.files[0].sha256.length, 64);
});

test('repeated export is blocked while a previous result is unresolved', async () => {
  const service = harness();
  assert.equal((await service.run(request())).success, true);
  const blocked = await service.run(request());
  assert.equal(blocked.success, false);
  assert.equal(blocked.duplicateDownloadAvailable, true);
  assert.equal(service.writes(), 1);
});

test('an existing export can be downloaded again without creating another delivery attempt', async () => {
  const service = harness();
  const first = await service.run(request());
  const copy = await service.run({ ...request(), redownloadExisting: true });
  assert.equal(first.success, true);
  assert.equal(copy.success, true);
  assert.equal(copy.redownloaded, true);
  assert.equal(copy.batchId, first.batchId);
  assert.equal(service.writes(), 2);
  assert.equal(service.getBatches().length, 1);
});

test('a different account is not blocked by another account export', async () => {
  const service = harness();
  await service.run(request());
  assert.equal((await service.run({ ...request(), account: 'Everyday Recipe Finds' })).success, true);
});

test('failed-only retry excludes confirmed and unknown rows, including another pending attempt', () => {
  let first = batch();
  first = updateDeliveryOutcomes(first, { revision: 0, updates: [{ number: 1, status: 'confirmed' }, { number: 2, status: 'failed' }] });
  assert.deepEqual(retryableRows(first, [first]).map((r) => r.number), [2]);
  const second = { ...batch(), rows: [first.rows[1]] };
  assert.deepEqual(retryableRows(first, [first, second]), []);
  second.fileStatus = 'failed';
  assert.deepEqual(retryableRows(first, [first, second]).map((r) => r.number), [2]);
});

test('confirmed outcomes on any attempt prevent retry of the same delivery', () => {
  const first = updateDeliveryOutcomes(batch(), { revision: 0, updates: [{ number: 1, status: 'failed' }] });
  const second = { ...first, id: 'later', outcomes: { 1: { status: 'confirmed' } } };
  assert.deepEqual(retryableRows(first, [first, second]), []);
});

test('receipt parser proposes only exact error rows and never infers success', () => {
  const value = batch();
  const result = suggestFailedRows(value, "| Upload didn't work | Soup 2 | Dinner |\n0 rows uploaded successfully, problem with 3 rows.");
  assert.deepEqual(result.updates.map((u) => [u.number, u.status]), [[2, 'failed']]);
  assert.equal(result.unmatched, 2);
  const duplicate = { ...value, rows: [value.rows[1], { ...value.rows[1], number: 4 }] };
  assert.equal(suggestFailedRows(duplicate, "| Upload didn't work | Soup 2 | Dinner |").updates.length, 0);
});

test('result edits are revision-checked and cannot mutate manifest cells', () => {
  const value = batch();
  const updated = updateDeliveryOutcomes(value, { revision: 0, updates: [{ number: 2, status: 'failed' }], evidence: 'User receipt' });
  assert.deepEqual(updated.rows, value.rows);
  assert.deepEqual(value.outcomes, {});
  assert.equal(updated.events.length, 1);
  assert.throws(() => updateDeliveryOutcomes(updated, { revision: 0, updates: [] }), /changed/);
  assert.throws(() => updateDeliveryOutcomes(value, { revision: 0, updates: [{ number: 8, status: 'failed' }] }), /Invalid/);
});

test('image checks enforce decoded JPEG/PNG MIME consistency and a 20 MB cap', () => {
  assert.equal(imageCompatibilityError({ format: 'jpeg' }, 'image/jpeg', 20000000), '');
  assert.match(imageCompatibilityError({ format: 'jpeg' }, 'image/jpeg', 20000001), /20 MB/);
  assert.match(imageCompatibilityError({ format: 'webp' }, 'image/webp', 100), /JPEG or PNG/);
  assert.match(imageCompatibilityError({ format: 'png' }, 'image/jpeg', 100), /MIME/);
  assert.match(imageCompatibilityError({ format: 'png' }, 'image/png', 100, 'https://media.example/pin.jpg'), /extension/);
  assert.equal(imageCompatibilityError({ format: 'jpeg' }, 'image/jpeg', 100, 'https://media.example/pin.JPG'), '');
});

test('atomic export keeps existing files when staging fails and removes temporary files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pinterest-atomic-'));
  try {
    const target = path.join(dir, 'export.csv');
    await fs.writeFile(target, 'old');
    await assert.rejects(writeVerifiedFiles([{ path: target, bytes: Buffer.from('new'), verify: () => { throw new Error('invalid staged CSV'); } }]), /invalid/);
    assert.equal(await fs.readFile(target, 'utf8'), 'old');
    assert.deepEqual(await fs.readdir(dir), ['export.csv']);
    await writeVerifiedFiles([{ path: target, bytes: Buffer.from('new') }]);
    assert.equal(await fs.readFile(target, 'utf8'), 'new');
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(dir, { recursive: true });
  }
});

test('partial commits report exact completed files', async () => {
  const storage = new Map();
  const io = { open: async (name) => ({ writeFile: async (bytes) => storage.set(name, bytes), sync: async () => {}, close: async () => {} }),
    readFile: async (name) => storage.get(name), unlink: async (name) => storage.delete(name),
    rename: async (from, to) => { if (to.endsWith('second.csv')) throw new Error('disk failure'); storage.set(to, storage.get(from)); storage.delete(from); } };
  await assert.rejects(writeVerifiedFiles([{ path: '/test/first.csv', bytes: Buffer.from('first') }, { path: '/test/second.csv', bytes: Buffer.from('second') }], { io }),
    (error) => { assert.deepEqual(error.committedFiles, ['/test/first.csv']); return true; });
  assert.deepEqual([...storage.keys()], ['/test/first.csv']);
});
