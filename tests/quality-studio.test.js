const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const axios = require('axios');
const sharp = require('sharp');
const { inspectRecipe, shoppingList, shoppingHtml, extractRecipeData } = require('../electron/recipe-quality');
const { createSpendLedger, installSpendInterceptors } = require('../electron/spend-ledger');
const { compareText, createTextChecker } = require('../electron/pin-text-check');
const { renderExactTemplate } = require('../electron/exact-pin-template');
const { createQualityWorkspace } = require('../electron/quality-workspace');
const { fetchRecipeEvents } = require('../electron/recipe-events');
const { sign, verify, validateJob, stable } = require('../worker/protocol.cjs');
const { isPublicAddress } = require('../worker/safe-address.cjs');
const { publishOnce } = require('../worker/publish.cjs');
const { createPinWorkspace, fingerprint } = require('../electron/pin-workspace');
const memory = initial => { let data = structuredClone(initial || {}); return { get: (k, fallback) => structuredClone(data[k] ?? fallback), set: (k, value) => { data[k] = structuredClone(value); } }; };
const card = '<section id="recipe-card"><h2>Lemon Rice</h2><p>Prep Time: 5 minutes; Cook Time: 15 minutes; Total Time: 20 minutes; Servings: 4</p><h3>Ingredients</h3><ul><li>1 cup rice</li><li>2 cups water</li><li>1 tbsp lemon juice</li></ul><h3>Instructions</h3><ol><li>Combine rice and water in a saucepan.</li><li>Simmer covered for 15 minutes until rice is tender.</li><li>Fluff the rice and stir in lemon juice until evenly coated.</li></ol></section>';
test('parsed recipe quantities, structural limitations and cautious ingredient usage checks', () => {
  const report = inspectRecipe({ id: 'a', title: 'Lemon Rice', content: card });
  assert.equal(report.recipe.ingredients[0].quantity, 1); assert.equal(report.recipe.servings, 4);
  assert.equal(report.recipe.time['Total Time'], 20); assert.match(report.limitation, /do not establish taste/);
  const suspect = inspectRecipe({ content: card.replace('1 cup rice', 'rice') });
  assert.ok(suspect.issues.some(i => /Confirm the amount/.test(i.message)));
  const mismatch = inspectRecipe({ content: card.replace('1 tbsp lemon juice', '1 tbsp cinnamon') });
  assert.ok(mismatch.issues.some(i => /where this ingredient/.test(i.message)));
});
test('shopping list combines compatible units only, scales ranges and escapes printable text', () => {
  const a = { id: 'a', title: '<script>bad</script>', content: card }, b = { id: 'b', title: 'Rice 2', content: card };
  const rows = shoppingList([a, b], 2);
  assert.equal(rows.find(r => r.description === 'rice').quantity, 4);
  const different = shoppingList([a, { ...b, content: card.replace('1 cup rice', '100 g rice') }]);
  assert.equal(different.filter(r => r.description === 'rice').length, 2);
  const html = shoppingHtml([a], 2); assert.ok(!html.includes('<script>')); assert.match(html, /&lt;script&gt;/);
  assert.throws(() => shoppingList([a], -1));
});
test('source recipe extraction parses JSON-LD graphs without treating embedded instructions as commands', () => {
  const [r] = extractRecipeData('<script type="application/ld+json">{"@graph":[{"@type":"Recipe","name":"Soup","recipeIngredient":["2 cups broth"],"recipeInstructions":[{"@type":"HowToSection","itemListElement":[{"text":"Heat broth."}]}]}]}</script>', 'https://example.com/soup');
  assert.deepEqual(r.ingredients, ['2 cups broth']); assert.deepEqual(r.instructions, ['Heat broth.']); assert.match(r.evidence, /not verified/);
  assert.deepEqual(extractRecipeData('<script type="application/ld+json">bad</script>'), []);
});
test('spending reserves before submission, blocks unknown exposure and reconciles actual receipts', () => {
  const ledger = createSpendLedger({ store: memory(), now: () => Date.parse('2026-10-17T10:00Z') });
  ledger.configure({ enabled: true, dailyUsd: 0.05 });
  const id = ledger.reserve({ model: 'image', input: { prompt: 'private prompt' }, estimateUsd: 0.03 });
  assert.throws(() => ledger.reserve({ model: 'image', estimateUsd: 0.03 }), /budget reached/);
  assert.ok(!JSON.stringify(ledger.get()).includes('private prompt'));
  ledger.update(id, { status: 'uncertain' }); assert.equal(ledger.summary().today.estimatedCommitted, 0.03);
  ledger.reconcile({ id, amount: 0.02, evidence: 'provider receipt' }); assert.equal(ledger.summary().today.reportedActual, 0.02);
  ledger.configure({ enabled: false, dailyUsd: 1 }); ledger.reserve({ model: 'unknown' });
  ledger.configure({ enabled: true, dailyUsd: 1 }); assert.throws(() => ledger.reserve({ model: 'known', estimateUsd: 0.01 }), /unknown charges/);
});
test('all shared Axios Replicate submits are recorded; ordinary relative routes and polling are not charged', async () => {
  let requests = 0;
  const client = axios.create({ adapter: async config => { requests++; return { config, data: { id: 'pred-1' }, status: 201, headers: {} }; } });
  const ledger = createSpendLedger({ store: memory() }); const dispose = installSpendInterceptors(client, ledger);
  await client.get('/relative'); await client.get('https://api.replicate.com/v1/predictions/pred-1');
  await client.post('https://api.replicate.com/v1/models/ideogram-ai/ideogram-v3-turbo/predictions', { input: { prompt: 'food' } });
  assert.equal(ledger.get().entries.length, 1); assert.equal(ledger.get().entries[0].predictionId, 'pred-1');
  ledger.configure({ enabled: true, dailyUsd: 0.03 });
  await assert.rejects(client.post('https://api.replicate.com/v1/models/ideogram-ai/ideogram-v3-turbo/predictions', {}), /budget reached/);
  assert.equal(requests, 3); dispose();
});
test('OCR marks low confidence, spelling errors, repeated or reordered words for review', () => {
  assert.equal(compareText('LEMON RICE', 'Lemon rice', 99).status, 'matched');
  assert.equal(compareText('LEMON RICE', 'Lemon rice', 40).status, 'uncertain');
  assert.equal(compareText('LEMON RICE', 'RICE LEMON', 99).status, 'needs-review');
  assert.equal(compareText('LEMON RICE', 'LEMON RICE RICE', 99).status, 'needs-review');
  assert.equal(compareText('LEMON RICE', 'LEMON RICE', NaN).status, 'uncertain');
});
test('Satori exact template renders nonblank portrait and local English OCR uses bundled data', { timeout: 120000 }, async () => {
  const bytes = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#527752' } }).jpeg().toBuffer();
  const output = await renderExactTemplate({ sharp, bytes, text: 'LEMON RICE', fontData: await fs.readFile(path.join(__dirname, '../electron/assets/fonts/Montserrat-Bold.ttf')) });
  await fs.mkdir(path.join(__dirname, '../artifacts'), { recursive: true });
  await fs.writeFile(path.join(__dirname, '../artifacts/exact-template-test.jpg'), output);
  const meta = await sharp(output).metadata(); assert.equal(meta.width, 1080); assert.equal(meta.height, 1920);
  const stats = await sharp(output).stats(); assert.ok(stats.channels.some(c => c.stdev > 20));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cs-ocr-'));
  try {
    const { createWorker } = require('tesseract.js'), { langPath } = require('@tesseract.js-data/eng');
    const checker = createTextChecker({ sharp, createWorker, langPath, cachePath: dir });
    const result = await checker.check(output, 'LEMON RICE'); assert.match(result.observed, /LEMON/i); assert.equal(result.status, 'matched');
    assert.deepEqual(await checker.check(output, 'LEMON RICE'), result);
    await assert.rejects(renderExactTemplate({ sharp, bytes, text: 'Rice', width: 99, height: 16 }), /supported portrait/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('quality actions persist reports/collections and do not generate paid repairs', async () => {
  const store = memory({ articles: [{ id: 'a', title: 'Lemon Rice', content: card }] }); let saved;
  const quality = createQualityWorkspace({ store, ledger: createSpendLedger({ store }), saveFile: async (name, bytes) => { saved = { name, bytes }; return { path: name }; }, releaseInfo: () => ({ verified: false }) });
  await quality.run('inspect-recipes', { ids: ['a'] }); assert.equal(store.get('qualityWorkspace').reports.a.articleId, 'a');
  const c = await quality.run('collection-save', { ids: ['a', 'deleted'], name: 'Dinner' }); assert.deepEqual(c.ids, ['a']);
  await quality.run('shopping-list', { ids: ['a'], multiplier: 2 }); assert.equal(saved.name, 'recipe-shopping-list.html'); assert.match(String(saved.bytes), /2 cup rice/);
  await assert.rejects(quality.run('unknown'), /Unknown quality action/);
});
test('local review fingerprints reject artwork changes while OCR is in flight', async () => {
  let bytes = Buffer.from('image1'); const store = memory({ pinCreatorPins: [{ id: 'p', localPath: 'pin.jpg' }] });
  const quality = createQualityWorkspace({ store, readMedia: async () => bytes });
  const result = await quality.run('visual-review', { id: 'p', approved: true });
  assert.equal(result.pin.imageQa.visualReview.imageSha256, createHash('sha256').update(bytes).digest('hex'));
  bytes = Buffer.from('changed'); await assert.rejects(quality.run('visual-review', { id: 'p', approved: true, sha256: result.pin.imageQa.reviewSha256 }), /Image changed/);
});
test('GA4 recipe reports retain real event counts/creative attribution and reject schema drift', async () => {
  let body;
  const options = { settings: { googleAnalyticsPropertyId: '1234', googleAnalyticsSiteUrl: 'https://example.com' }, token: 'token', request: async (_url, b) => { body = b; return { data: { dimensionHeaders: b.dimensions, metricHeaders: b.metrics, rows: [{ dimensionValues: [{ value: '/rice?utm_content=pin-p' }, { value: 'pin-p' }, { value: 'cs_recipe_print' }], metricValues: [{ value: '12' }] }], rowCount: 1 } }; } };
  const result = await fetchRecipeEvents(options); assert.equal(result.rows[0].count, 12); assert.equal(result.rows[0].creative, 'pin-p'); assert.match(result.unit, /not unique/); assert.equal(body.dateRanges[0].endDate, 'yesterday');
  await assert.rejects(fetchRecipeEvents({ ...options, request: async () => ({ data: {} }) }), /Incomplete/);
});
const job = () => ({ id: 'p-v1', draftId: 'p', version: 1, approval: { version: 1, fingerprint: 'signed' }, channel: 'remote', accountId: 'a', title: 'Lemon rice', description: 'Easy rice.', altText: 'Rice', boardId: '1234', destination: 'https://example.com/rice', mediaUrl: 'https://images.example.com/pin.jpg', mediaSha256: createHash('sha256').update('photo').digest('hex'), scheduledAt: new Date(Date.now() + 3600000).toISOString() });
test('worker signed immutable handoffs reject tampering, expiring media and unsafe IPs', () => {
  const secret = 's'.repeat(48), p = job(), signed = sign({ jobs: [p] }, secret);
  assert.deepEqual(verify(signed, secret).jobs[0], p); assert.throws(() => verify({ ...signed, body: signed.body.replace('Lemon', 'Fake') }, secret), /mismatch/);
  assert.equal(validateJob(p), validateJob(JSON.parse(stable(p))));
  assert.throws(() => validateJob({ ...p, mediaUrl: 'https://replicate.delivery/p.jpg' }), /durable/);
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fc00::1']) assert.equal(isPublicAddress(ip), false);
  assert.equal(isPublicAddress('8.8.8.8'), true);
});
test('worker claims once before create and does not replay ambiguous failures or altered artwork', async () => {
  let claimed = false, submits = 0, result;
  const deps = { now: () => Date.now() + 3601000, claim: async () => { if (claimed) return false; claimed = true; return true; }, finish: async (_id, r) => { result = r; }, token: 'secret', readImage: async () => Buffer.from('photo'), request: async url => { if (url.endsWith('/user_account')) return { ok: true, json: async () => ({ id: 'a' }) }; submits++; throw new Error('network timeout'); } };
  const p = { ...job(), accountId: 'pinterest:a' };
  await publishOnce(p, deps); await publishOnce(p, deps); assert.equal(submits, 1); assert.equal(result.status, 'uncertain');
  claimed = false; await publishOnce({ ...p, mediaSha256: '0'.repeat(64) }, deps); assert.equal(submits, 1); assert.equal(result.status, 'uncertain');
  claimed = false; await publishOnce({ ...p, accountId: 'wrong' }, deps); assert.equal(submits, 1); assert.equal(result.status, 'account-mismatch');
  claimed = false; await publishOnce({ ...p, scheduledAt: new Date(Date.now() - 7200000).toISOString() }, deps); assert.equal(submits, 1); assert.equal(result.status, 'missed');
});
test('remote ownership blocks local edits, review, scheduling, undo and clearing times', () => {
  const p = { id: 'p', state: 'remote_pending', version: 1, title: 'Rice', description: 'Rice', destination: 'https://example.com/rice', accountId: 'a', boardId: '123', assetId: 'img' }; p.approval = { version: 1, fingerprint: fingerprint(p) };
  const store = memory({ pinWorkspace: { drafts: [p], accounts: [{ id: 'a', boards: [{ id: '123' }] }], assets: [{ id: 'img' }], jobs: [], undo: [{ id: 'undo', drafts: [p] }] } });
  const w = createPinWorkspace({ store, provider: {} });
  assert.throws(() => w.writeDraft({ id: 'p', title: 'Changed' }), /cannot be edited/);
  assert.throws(() => w.review({ ids: ['p'], action: 'approve' }), /unresolved/);
  assert.throws(() => w.clearTimes({ ids: ['p'] }), /unresolved/);
  assert.throws(() => w.undo({ id: 'undo' }), /unresolved/);
  assert.throws(() => w.schedule({ ids: ['p'], accountId: 'a' }), /owned by another publisher/);
});
