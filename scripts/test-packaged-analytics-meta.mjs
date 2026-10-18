import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'http://127.0.0.1:9238';
const targets = await fetch(`${endpoint}/json`).then((response) => response.json());
const page = targets.find((item) => item.type === 'page' && /Content Studio|index\.html/i.test(`${item.title} ${item.url}`));
assert.ok(page?.webSocketDebuggerUrl);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const item = pending.get(message.id);
  if (!item) return;
  pending.delete(message.id);
  if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
});
function send(method, params) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
try {
  const result = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const api = window.electronAPI;
    const settings = await api.getSettings();
    await api.saveSettings({ ...settings, googleAnalyticsMeasurementId: 'G-TESTCODE123', googleAnalyticsPropertyId: '', googleAnalyticsSiteUrl: '' });
    const saved = await api.getSettings();
    const workspace = await api.getGoogleAnalyticsWorkspace();
    const refresh = await api.refreshGoogleAnalytics();
    let invalidRejected = false;
    try { await api.saveSettings({ ...saved, googleAnalyticsPropertyId: 'G-WRONGCODE' }); } catch { invalidRejected = true; }
    const card = '<section id="recipe-card"><h2 itemprop="name">Chickpea Salad</h2><p>Prep Time: 10 minutes; Cook Time: 0 minutes; Total Time: 10 minutes; Servings: 4</p><h3>Ingredients</h3><ul><li>2 cups cooked chickpeas</li><li>1 tbsp lemon juice</li><li>1 tbsp olive oil</li></ul><h3>Instructions</h3><ol><li>Whisk oil and juice until evenly combined.</li><li>Toss chickpeas until evenly coated.</li><li>Serve chilled.</li></ol></section>';
    const draft = await api.getMetaCaptionDraft({ article: { title: 'Chickpea Salad', content: card }, source: { pinterestDescription: 'Fresh lunch https://food.example/salad' } });
    return { trackingSaved: saved.googleAnalyticsMeasurementId, configured: workspace.configured, noFakeData: workspace.snapshot === null && workspace.recommendations.length === 0, missingAccessClear: !refresh.success && /property ID/.test(refresh.error), invalidRejected,
      draftReady: draft.success, realIngredient: draft.content.facebook.primaryPost.includes('2 cups cooked chickpeas'), noLinks: !/https?:|link in (?:the )?profile/i.test(draft.content.facebook.primaryPost + draft.content.instagram.feedCaption), recipeRequest: draft.content.instagram.feedCaption.includes('Send us a message') };
  })()` });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  assert.deepEqual(result.result.value, { trackingSaved: 'G-TESTCODE123', configured: false, noFakeData: true, missingAccessClear: true, invalidRejected: true, draftReady: true, realIngredient: true, noLinks: true, recipeRequest: true });
  console.log('Packaged Analytics/Meta passed: tracking-only setup, no fake reports or API calls, numeric property validation, source-checked recipe preview and link-free captions.');
} finally { socket.close(); }
