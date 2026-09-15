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
    writeFiles: async (files, { onCommitted }) => {
      writes++;
      const done = [];
      for (const file of files) { await file.verify(file.bytes); done.push(file.path); await onCommitted([...done]); }
    }, ...overrides
  };
  return { run: createPinterestExportService(dependencies), getBatches: () => batches, saveBatch: dependencies.saveBatch, writes: () => writes };
}
const request = () => ({ rows: [row()], pinIds: ['1'], account: 'Gourmet Gather' });

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

test('final exporter rejects changed same-size images without writing files', async () => {
  const service = harness({ validateMedia: async () => ({ valid: true, width: 1000, height: 1500, sha256: 'b'.repeat(64) }) });
  const result = await service.run(request());
  assert.equal(result.success, false);
  assert.match(result.error, /does not match/);
  assert.equal(service.writes(), 0);
});

test('final exporter fails closed for a missing saved Pin or a mismatched URL', async () => {
  for (const getPins of [() => [], () => [{ ...makePin(), imageQa: { publicValidatedUrl: 'https://other.example/a.jpg' } }]]) {
    const service = harness({ getPins });
    assert.equal((await service.run(request())).success, false);
    assert.equal(service.writes(), 0);
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
  assert.equal((await service.run(request())).success, false);
  assert.equal(service.writes(), 1);
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
