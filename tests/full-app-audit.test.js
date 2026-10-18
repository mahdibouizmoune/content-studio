const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { WorkspaceDatabase, createWorkspaceStore } = require('../electron/workspace-store');
const { buildPerformanceScheduleProfile } = require('../electron/performance-scheduling');

test('workspace replacement notifies observers only once with fully committed data', () => {
  const db = new WorkspaceDatabase(':memory:');
  try {
    db.set('articles', [{ id: 'old' }]);
    const observed = []; db.onChange(() => observed.push(db.entries()));
    const replacement = { articles: [{ id: 'new' }], pinCreatorPins: [{ id: 'p' }] };
    db.replace(replacement);
    assert.deepEqual(observed, [replacement]);
  } finally { db.close(); }
});

test('failed workspace replacement rolls back without notifying partial data', () => {
  const db = new WorkspaceDatabase(':memory:');
  try {
    db.set('articles', [{ id: 'original' }]);
    let notifications = 0; db.onChange(() => { notifications++; });
    assert.throws(() => db.replace({ articles: [{ id: 'replacement' }], invalid: 1n }));
    assert.deepEqual(db.get('articles'), [{ id: 'original' }]); assert.equal(notifications, 0);
    db.set('articles', [{ id: 'after-rollback' }]); assert.equal(notifications, 1);
  } finally { db.close(); }
});

test('nested workspace edits and deletion preserve arrays and all untouched records', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-audit-store-'));
  const workspace = createWorkspaceStore({ has: () => false, get: (_key, fallback) => fallback }, directory);
  try {
    workspace.set('articles', [{ id: 'a', queueStatus: 'pending' }, { id: 'b', queueStatus: 'completed' }]);
    workspace.set('articles.0.queueStatus', 'completed');
    assert.deepEqual(workspace.get('articles'), [{ id: 'a', queueStatus: 'completed' }, { id: 'b', queueStatus: 'completed' }]);
    workspace.delete('articles.0.queueStatus');
    assert.deepEqual(workspace.get('articles'), [{ id: 'a' }, { id: 'b', queueStatus: 'completed' }]);
    workspace.set('qualityWorkspace.collections.0.ids', ['a']);
    assert.deepEqual(workspace.get('qualityWorkspace.collections'), [{ ids: ['a'] }]);
    for (const key of ['qualityWorkspace.__proto__.x', 'qualityWorkspace.constructor.prototype.x', '__proto__.x']) {
      assert.throws(() => workspace.set(key, true), /Unsafe workspace key/);
      assert.throws(() => workspace.get(key), /Unsafe workspace key/);
      assert.throws(() => workspace.delete(key), /Unsafe workspace key/);
    }
    assert.equal(workspace.get('qualityWorkspace.toString', 'missing'), 'missing');
  } finally { workspace.database.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('repeated analytics rows for one Pin cannot impersonate multiple scheduling samples', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: i < 5 ? 'one-pin' : 'second-pin', publishedAt: i < 5 ? '2026-10-01T09:00:00Z' : '2026-10-01T18:00:00Z', impressions: 2000, outboundClicks: 100 }));
  assert.equal(buildPerformanceScheduleProfile(rows).mode, 'recommended-window');
  assert.equal(buildPerformanceScheduleProfile(rows.map((r, i) => ({ ...r, id: String(i) }))).mode, 'account-data');
});

test('restore rolls back both workspace and settings on failure and emits only complete successes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-audit-restore-'));
  let settings = { settings: { theme: 'dark' } }, failNext = false;
  const events = new Set();
  const settingsStore = {
    has: () => false, get: (_key, fallback) => fallback,
    onDidAnyChange: listener => { events.add(listener); return () => events.delete(listener); },
    get store() { return structuredClone(settings); },
    set store(next) { settings = structuredClone(next); for (const event of events) event(); if (failNext) { failNext = false; throw new Error('Simulated settings write failure'); } }
  };
  const workspace = createWorkspaceStore(settingsStore, directory);
  try {
    workspace.set('articles', [{ id: 'old' }]);
    const observed = []; workspace.onDidAnyChange(() => observed.push(workspace.store));
    failNext = true;
    assert.throws(() => { workspace.store = { settings: { theme: 'light' }, articles: [{ id: 'new' }] }; }, /Simulated/);
    assert.deepEqual(workspace.store, { settings: { theme: 'dark' }, articles: [{ id: 'old' }] }); assert.equal(observed.length, 0);
    const replacement = { settings: { theme: 'light' }, articles: [{ id: 'new' }] };
    workspace.store = replacement; assert.deepEqual(observed, [replacement]);
  } finally { workspace.database.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
