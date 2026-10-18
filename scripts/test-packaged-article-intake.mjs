import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'http://127.0.0.1:9238';
let page;
for (let attempt = 0; attempt < 60; attempt++) {
  try { page = (await fetch(`${endpoint}/json`).then((response) => response.json())).find((item) => item.type === 'page' && /Content Studio|index\.html/i.test(`${item.title} ${item.url}`)); } catch {}
  if (page?.webSocketDebuggerUrl) break;
  await new Promise((resolve) => setTimeout(resolve, 300));
}
assert.ok(page?.webSocketDebuggerUrl, 'Packaged app page');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
});
function send(method, params) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
try {
  const result = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    if (!window.electronAPI) throw new Error('Missing app bridge');
    const existing = await window.electronAPI.getArticles();
    if (existing.length) throw new Error('This test requires an EMPTY isolated test profile');
    const articles = [
      { id: 'audit-one', title: 'Blueberry Lemon Pancakes' },
      { id: 'audit-copy', title: 'Blueberry Lemon Pancakes Breakfast' },
      { id: 'audit-two', title: 'Roasted Zucchini Lasagna' }
    ];
    const first = await window.electronAPI.queueArticles({ articles });
    const second = await window.electronAPI.queueArticles({ articles });
    const saved = await window.electronAPI.getArticles();
    const card = '<section id="recipe-card"><p>Prep Time: 10 minutes; Cook Time: 0 minutes; Total Time: 1 day; Servings: about 8</p><h3>Ingredients</h3><ul><li>4 cups kombucha</li><li>1 cup apple juice</li><li>1 tsp ginger</li></ul><h3>Instructions</h3><ol><li>Mix until combined.</li><li>Chill for 1 day until cold.</li><li>Serve in glasses.</li></ol></section>';
    const recipe = await window.electronAPI.prepareArticleRecipe({ article: { title: 'Apple drink', content: card }, repair: false });
    const coldCard = '<section id="recipe-card"><p>Prep Time: 10 minutes; Cook Time: 0 minutes; Total Time: 10 minutes; Servings: 4</p><h3>Ingredients</h3><ul><li>One cup apple cider</li><li>Two tablespoons syrup</li><li>1 cup sparkling water</li></ul><h3>Instructions</h3><ol><li>Whisk cider and syrup into a smooth mixture.</li><li>Add sparkling water and serve chilled.</li><li>Divide between four glasses.</li></ol></section>';
    const cold = await window.electronAPI.prepareArticleRecipe({ article: { title: 'Cold drink', content: coldCard }, repair: false });
    const unsafe = await window.electronAPI.prepareArticleRecipe({ article: { title: 'Raw chicken', content: coldCard.replace('One cup apple cider', '1 lb raw chicken') }, repair: false });
    return { added: first.addedCount, skipped: first.skipped.length, repeatAdded: second.addedCount, savedCount: saved.length, queued: saved.every((article) => article.queueStatus === 'pending'), recipeOk: recipe.success, duration: JSON.parse(recipe.patch.structuredData).totalTime, coldOk: cold.success, unsafeBlocked: !unsafe.success && unsafe.issues.some((issue) => issue.includes('165 F')) };
  })()` });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  assert.deepEqual(result.result.value, { added: 2, skipped: 1, repeatAdded: 0, savedCount: 2, queued: true, recipeOk: true, duration: 'PT1440M', coldOk: true, unsafeBlocked: true });
  console.log('Packaged app passed: trusted queue intake, saved and intra-batch deduplication, cold recipe recovery, raw-poultry guard, native recipe validation, and day-based schema. No live provider calls.');
} finally { socket.close(); }
