import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), sharp = require('sharp');
const endpoint = process.argv[2];
let page;
for (let i = 0; i < 60; i++) {
  try { page = (await fetch(`${endpoint}/json`).then(r => r.json())).find(p => p.type === 'page' && /Content Studio|index\.html/.test(`${p.title} ${p.url}`)); } catch {}
  if (page?.webSocketDebuggerUrl) break;
  await new Promise(r => setTimeout(r, 300));
}
assert.ok(page?.webSocketDebuggerUrl, 'Native app page is missing.');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0; const pending = new Map();
socket.addEventListener('message', event => { const m = JSON.parse(event.data), p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
function send(method, params) { const id = ++sequence; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error('Native quality request timed out.')); }, 180000); pending.set(id, { resolve, reject, timer }); }); }
try {
  const bytes = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#527752' } }).jpeg().toBuffer();
  const result = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const api = window.electronAPI;
    const before = await api.qualityWorkspace('snapshot');
    if (!before.success) throw new Error(before.error);
    if (before.result.articles.length || before.result.pins.length) throw new Error('Use an empty isolated app profile.');
    const imported = await api.pinWorkspace('importAsset', { dataBase64: '${bytes.toString('base64')}', filename: 'test-clean-photo.jpg' });
    if (!imported.success) throw new Error(imported.error);
    const a = imported.result;
    const p = { id: 'native-quality-photo', title: 'Lemon Rice', description: 'A useful rice recipe.', url: 'https://example.com/rice', localPath: a.localPath, imageUrl: a.displayUrl, displayUrl: a.displayUrl, status: 'completed', imageSourceMode: 'reuse-article', imageQa: { sha256: a.sha256, dimensionsVerified: true, width: a.width, height: a.height } };
    await api.savePinCreatorPins([p]);
    const exact = await api.qualityWorkspace('exact-template', { id: p.id, text: 'LEMON RICE', placement: 'middle', cleanPhotoConfirmed: true });
    if (!exact.success) throw new Error(exact.error);
    const check = await api.qualityWorkspace('check-text', { id: exact.result.pin.id, expected: 'LEMON RICE' });
    if (!check.success) throw new Error(check.error);
    const policy = await api.qualityWorkspace('spending-configure', { enabled: true, dailyUsd: 1, quotes: { 'version:abc': 0.02 } });
    if (!policy.success) throw new Error(policy.error);
    const article = { id: 'native-quality-recipe', title: 'Lemon Rice', status: 'completed', content: '<section id="recipe-card"><h2>Lemon Rice</h2><p>Prep Time: 5 minutes; Cook Time: 15 minutes; Total Time: 20 minutes; Servings: 4</p><h3>Ingredients</h3><ul><li>1 cup rice</li><li>2 cups water</li><li>1 tbsp lemon juice</li></ul><h3>Instructions</h3><ol><li>Combine rice and water in a saucepan.</li><li>Simmer for 15 minutes until rice is tender.</li><li>Stir in lemon juice until evenly combined.</li></ol></section>' };
    await api.saveArticle(article); const recipes = await api.qualityWorkspace('inspect-recipes', { ids: [article.id] });
    const unknown = await api.qualityWorkspace('unknown'); const after = await api.qualityWorkspace('snapshot');
    return { exact: exact.result.pin.imageQa.width === 1080 && exact.result.pin.imageQa.height === 1920,
      ocr: check.result.pin.imageQa.textCheck.status, observed: check.result.pin.imageQa.textCheck.observed.trim(),
      originalPreserved: after.result.pins.some(x => x.id === p.id), recipes: recipes.success, parsed: after.result.reports[article.id].recipe.ingredients.length,
      noCharges: after.result.spending.entries.length === 0, guarded: !unknown.success, version: after.result.release.installedVersion, unverified: after.result.release.verified === false };
  })()` });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  assert.deepEqual(result.result.value, { exact: true, ocr: 'matched', observed: 'LEMON RICE', originalPreserved: true, recipes: true, parsed: 3, noCharges: true, guarded: true, version: '1.5.0', unverified: true });
  console.log('Packaged Quality Studio passed: Satori/Sharp portrait, bundled offline OCR, original preservation, parsed recipes, persistent policy, no provider calls and honest release identity.');
} finally { for (const p of pending.values()) clearTimeout(p.timer); socket.close(); }
