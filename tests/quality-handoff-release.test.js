const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createQualityWorkspace } = require('../electron/quality-workspace');
const { fingerprint } = require('../electron/pin-workspace');
const { verify, sign } = require('../worker/protocol.cjs');
const { buildProvenance } = require('../scripts/release-provenance.cjs');
function fixture({ beforeWrite, canceled = false } = {}) {
  const bytes = Buffer.from('approved reviewed image'), sha = createHash('sha256').update(bytes).digest('hex'), secret = 'worker-key-'.repeat(6);
  const p = { id: 'p', state: 'approved', version: 1, accountId: 'pinterest:owner', boardId: '123', assetId: 'a', title: 'Rice', description: 'Lemon rice.', altText: 'Rice', destination: 'https://example.com/rice', aiDisclosure: true };
  p.approval = { version: 1, fingerprint: fingerprint(p), actor: 'Owner' };
  let state = { qualityWorkerSigningSecret: secret, pinWorkspace: { drafts: [p], assets: [{ id: 'a', localPath: 'p.jpg', sha256: sha, provenance: 'ai' }], jobs: [] } }, output;
  const store = { get: (k, fallback) => structuredClone(state[k] ?? fallback), set: (k, value) => { state[k] = structuredClone(value); } };
  const service = createQualityWorkspace({ store, encrypt: x => x, decrypt: x => x, readMedia: async () => bytes, readPublicImage: async () => bytes,
    saveFile: async (_name, data, _filters, hooks) => { if (canceled) return { canceled: true }; beforeWrite?.(store); hooks.beforeWrite(); output = JSON.parse(String(data)); return { path: 'batch.json' }; },
    readReceipt: async () => sign({ type: 'receipt', rows: [{ id: 'p-v1', state: 'published', result: { remoteId: 'published-123' }, updated_at: new Date().toISOString() }] }, secret) });
  const params = { ids: ['p'], mediaUrls: { p: 'https://images.example.com/rice.jpg' }, times: { p: new Date(Date.now() + 3600000).toISOString() } };
  return { store, service, params, secret, output: () => output };
}
test('signed remote handoff locks only currently approved unchanged drafts and reconciles signed outcomes', async () => {
  const f = fixture(); await f.service.run('worker-bundle', f.params);
  assert.equal(f.store.get('pinWorkspace').drafts[0].state, 'remote_pending');
  const batch = verify(f.output(), f.secret); assert.equal(batch.jobs[0].title, 'Rice'); assert.ok(!JSON.stringify(batch).includes(f.secret));
  await assert.rejects(f.service.run('worker-bundle', f.params), /fresh approval/);
  await f.service.run('worker-receipt'); const pin = f.store.get('pinWorkspace').drafts[0]; assert.equal(pin.state, 'published'); assert.equal(pin.remoteId, 'published-123');
});
test('cancelled handoff leaves ownership local and edits during file dialog invalidate handoff', async () => {
  const canceled = fixture({ canceled: true }); await canceled.service.run('worker-bundle', canceled.params); assert.equal(canceled.store.get('pinWorkspace').drafts[0].state, 'approved');
  const edited = fixture({ beforeWrite: store => { const d = store.get('pinWorkspace'); d.drafts[0].title = 'Changed while saving'; store.set('pinWorkspace', d); } });
  await assert.rejects(edited.service.run('worker-bundle', edited.params), /Draft changed/); assert.equal(edited.output(), undefined);
});
test('remote handoff blocks races with newly scheduled local jobs', async () => {
  const f = fixture({ beforeWrite: store => { const d = store.get('pinWorkspace'); d.jobs.push({ draftId: 'p', status: 'scheduled' }); store.set('pinWorkspace', d); } });
  await assert.rejects(f.service.run('worker-bundle', f.params), /Draft changed/); assert.equal(f.output(), undefined);
});
test('recipe reports are marked outdated when saved article content changes', async () => {
  let data = { articles: [{ id: 'a', content: 'first' }] }; const store = { get: (k, fallback) => structuredClone(data[k] ?? fallback), set: (k, v) => { data[k] = structuredClone(v); } };
  const service = createQualityWorkspace({ store, ledger: { summary: () => ({}) }, releaseInfo: () => ({}) });
  await service.run('inspect-recipes', { ids: ['a'] }); data.articles[0].content = 'changed';
  assert.equal((await service.run('snapshot')).reports.a.status, 'outdated');
});
test('invalid optional Analytics settings do not disable recipes, spending or local image checks', async () => {
  const store = { get: (key, fallback) => key === 'settings' ? { googleAnalyticsPropertyId: 'G-WRONG' } : fallback };
  const service = createQualityWorkspace({ store, ledger: { summary: () => ({}) }, releaseInfo: () => ({}) });
  const snapshot = await service.run('snapshot'); assert.equal(snapshot.events, null); assert.match(snapshot.analyticsError, /numeric/); assert.deepEqual(snapshot.articles, []);
});
test('release manifest rejects dirty or untagged source and ties verified output to a clean matching tag', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cs-release-test-'));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: 'pipe' });
  try {
    await fs.mkdir(path.join(root, 'electron/assets'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), '{"version":"1.5.0"}'); await fs.writeFile(path.join(root, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(root, '.gitignore'), 'electron/assets/release-provenance.json\n');
    git(['init']); git(['add', '.']); git(['-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid', 'commit', '-m', 'Fixture']);
    assert.throws(() => buildProvenance({ root, allowDevelopment: false }), /Release blocked/);
    git(['tag', 'v1.5.0']); const manifest = buildProvenance({ root, allowDevelopment: false }); assert.equal(manifest.verified, true); assert.equal(manifest.tag, 'v1.5.0'); assert.match(manifest.commit, /^[a-f0-9]{40}$/);
    await fs.writeFile(path.join(root, 'unreviewed.js'), 'unsafe source'); assert.throws(() => buildProvenance({ root, allowDevelopment: false }), /Release blocked/);
    assert.equal(buildProvenance({ root, allowDevelopment: true }).verified, false);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
