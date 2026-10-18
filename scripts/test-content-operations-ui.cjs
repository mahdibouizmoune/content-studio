const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createContentOperations, renderRecipes, hash } = require('../electron/content-operations');
const { createSpendLedger } = require('../electron/spend-ledger');
const { suggestFailedRows } = require('../electron/pinterest-delivery');

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const { createUiTestServer } = require('./ui-test-server.cjs');
  const server = await createUiTestServer({ server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['tests/fixtures/content-operations-ui.html'] }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  const recipe = { name: 'Lemon Rice', facts: { 'Prep Time': '5 minutes', 'Cook Time': '15 minutes', 'Total Time': '20 minutes', Servings: '4' }, ingredients: ['1 cup rice', '2 cups water', '1 tbsp lemon juice'], instructions: ['Combine rice and water in a saucepan.', 'Simmer for 15 minutes until rice is tender.', 'Stir in lemon juice until evenly combined.'] };
  try {
    await fs.mkdir(path.resolve('artifacts'), { recursive: true });
    for (const [name, width] of [['desktop', 1366], ['mobile', 390]]) {
      console.log(`${name}: Content Pipeline test starting.`);
      const state = { articles: Array.from({ length: 120 }, (_, i) => ({ id: `a${i}`, title: `Lemon Rice ${i}`, content: renderRecipes([recipe]), wordpressPostUrl: `https://recipe.example/rice-${i}`, workflowStatus: 'approved' })), settings: { pinCreator: { customStyles: { july: { name: 'Ingredient Closeup', prompt: 'Original close-up recipe photograph.' } } } }, pinCreatorPins: ['p1', 'p2'].map(id => ({ id, title: `Lemon Rice ${id}`, articleId: 'a0', url: 'https://recipe.example/rice-0', localPath: 'pin.jpg', imageQa: { sha256: hash(Buffer.from('artwork')) } })), trendResearch: { pinterestAnalytics: { importedAt: new Date().toISOString(), rows: [{ id: '111', impressions: 2000, outboundClicks: 100 }, { id: '222', impressions: 2000, outboundClicks: 50 }] } } };
      const store = { get: (k, f) => structuredClone(k.split('.').reduce((o, key) => o?.[key], state) ?? f), set: (k, v) => { const keys = k.split('.'); let o = state; for (const key of keys.slice(0, -1)) o = o[key] ||= {}; o[keys.at(-1)] = structuredClone(v); } };
      const ledger = createSpendLedger({ store }); ledger.reserve({ model: 'image', estimateUsd: 0.03, input: {}, context: { articleId: 'a0' } });
      let download;
      const service = createContentOperations({ store, ledger, readMedia: async () => Buffer.from('artwork'), saveFile: async (name, bytes) => { download = bytes.toString(); return { path: name }; } });
      const batches = ['b1', 'b2'].map(id => ({ id, createdAt: new Date().toISOString(), rows: [{ number: 1, cells: ['Lemon Rice', '', 'Dinner'] }, { number: 2, cells: ['Other Rice', '', 'Dinner'] }], outcomes: {}, fileStatus: 'saved', revision: 1 }));
      const receiptDrafts = {};
      const page = await browser.newPage({ viewport: { width, height: 980 }, reducedMotion: 'reduce' }); const errors = [];
      page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') console.error('Browser:', m.text()); });
      page.on('requestfailed', r => console.error('Request failed:', r.url(), r.failure()?.errorText));
      await page.addInitScript(() => { window.electronAPI = {}; });
      await page.exposeFunction('contentFixtureCall', async (action, p) => { try { return { success: true, result: await service.run(action.replace('content:', ''), p) }; } catch (e) { return { success: false, error: e.message }; } });
      await page.exposeFunction('deliveryFixtureCall', async (action, p) => {
        if (action === 'getPinterestDelivery') return { batches, drafts: receiptDrafts };
        if (action === 'savePinterestReceiptDraft') { receiptDrafts[p.batchId] = p; return { success: true }; }
        if (action === 'importPinterestReceipt') return { text: "Upload didn't work\tLemon Rice\tDinner" };
        if (action === 'suggestPinterestResults') return suggestFailedRows(batches.find(b => b.id === p.batchId), p.text);
        if (action === 'savePinterestResults') { const b = batches.find(b => b.id === p.batchId); for (const u of p.updates) b.outcomes[u.number] = { status: u.status }; b.revision++; return b; }
        return {};
      });
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/content-operations-ui.html`, { waitUntil: 'commit', timeout: 60000 });
      try { await page.getByRole('heading', { name: 'Content Pipeline', exact: true }).waitFor(); }
      catch (error) { console.error('Page errors:', errors); console.error(await page.locator('body').innerText()); await page.screenshot({ path: path.resolve(`artifacts/content-failure-${name}.png`) }); throw error; }
      assert.ok(await page.getByRole('region', { name: 'Connected articles' }).locator('article').count() < 35);
      await page.getByLabel('Find content', { exact: true }).fill('Lemon Rice 0');
      await page.getByRole('button', { name: 'Record Checkpoint', exact: true }).click();
      await page.getByText('Source matches checkpoint', { exact: false }).waitFor();
      await page.screenshot({ path: path.resolve(`artifacts/content-pipeline-${name}.png`) });
      await page.getByRole('button', { name: 'Recipe', exact: true }).click();
      await page.getByLabel('Recipe 1 name', { exact: true }).fill('Lemon Rice Revised');
      await page.getByRole('button', { name: 'Save Recipe Draft', exact: true }).click();
      await page.getByText('Local recipe draft saved and marked for review. Published posts were not changed.', { exact: true }).waitFor();
      assert.equal(state.articles[0].workflowStatus, 'needs-review');
      await page.getByLabel('Load previous recipe draft', { exact: true }).selectOption('0');
      assert.equal(await page.getByLabel('Recipe 1 name', { exact: true }).inputValue(), 'Lemon Rice');
      await page.getByRole('tab', { name: 'Prompt Lab', exact: true }).click();
      await page.getByLabel('Base Pin style', { exact: true }).selectOption('july');
      await page.getByLabel('Candidate name', { exact: true }).fill('Natural Light Candidate');
      await page.getByLabel('Candidate prompt', { exact: true }).fill('A natural daylight close-up with true food texture.');
      await page.getByRole('button', { name: 'Save Immutable Candidate', exact: true }).click();
      await page.getByText('Saved.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Queue Test Pin', exact: true }).click();
      await page.getByRole('button', { name: 'Open Pin Creator', exact: true }).click();
      assert.equal(await page.evaluate(() => window.testNavigation), 'pin-creator');
      assert.equal(ledger.get().entries.length, 1); assert.equal(state.pinCreatorPins.length, 3);
      await page.getByRole('tab', { name: 'Experiments', exact: true }).click();
      await page.getByLabel('Experiment name', { exact: true }).fill('Center Headline Comparison');
      for (const [i, id, remote] of [[1, 'p1', '111'], [2, 'p2', '222']]) { await page.getByLabel(`Variant ${i}`, { exact: true }).selectOption(id); await page.getByLabel(`Pinterest Pin ID ${i}`, { exact: true }).fill(remote); }
      await page.getByRole('button', { name: 'Save Comparison', exact: true }).click();
      await page.getByText('Center Headline Comparison · observational-comparison', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Costs', exact: true }).click();
      await page.getByText('1 requests have no actual-charge receipt.', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Recipe Packs', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Lemon Rice 0 · 1 recipes', exact: true }).check();
      await page.getByRole('button', { name: 'Download Weekly Recipe Pack', exact: true }).click();
      await page.getByText('Saved: weekly-recipe-pack.html', { exact: true }).waitFor(); assert.match(download, /Lemon Rice Revised/); assert.match(download, /Combined Shopping List/);
      const delivery = page.getByTestId('delivery');
      await delivery.getByLabel('Pinterest email or import receipt', { exact: true }).fill('Receipt draft one');
      await delivery.getByLabel('Row 1 outcome', { exact: true }).selectOption('failed');
      await delivery.getByLabel('Export batch', { exact: true }).selectOption('b2');
      await delivery.getByLabel('Pinterest email or import receipt', { exact: true }).fill('Receipt draft two');
      await delivery.getByLabel('Export batch', { exact: true }).selectOption('b1');
      assert.equal(await delivery.getByLabel('Pinterest email or import receipt', { exact: true }).inputValue(), 'Receipt draft one');
      await delivery.getByRole('button', { name: 'Refresh', exact: true }).click();
      assert.equal(await delivery.getByLabel('Row 1 outcome', { exact: true }).inputValue(), 'failed');
      await delivery.getByRole('button', { name: 'Import Result Email', exact: true }).click();
      await delivery.getByRole('button', { name: 'Match Error Rows', exact: true }).click();
      await delivery.getByText('1 error rows matched.', { exact: false }).waitFor();
      await delivery.getByRole('button', { name: 'Save Results', exact: true }).click();
      await delivery.getByText('Reported import results saved.', { exact: true }).waitFor();
      await delivery.getByRole('button', { name: 'Retry Failed Only', exact: true }).click(); assert.equal(await page.evaluate(() => window.testRetry), 'b1');
      assert.equal(batches[0].outcomes[2], undefined);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false);
      assert.deepEqual(errors, []); await page.screenshot({ path: path.resolve(`artifacts/content-receipts-${name}.png`) });
      await page.reload({ waitUntil: 'commit' }); await delivery.getByLabel('Export batch', { exact: true }).waitFor();
      await delivery.getByLabel('Export batch', { exact: true }).selectOption('b2');
      assert.equal(await delivery.getByLabel('Pinterest email or import receipt', { exact: true }).inputValue(), 'Receipt draft two');
      await page.close(); console.log(`${name}: pipeline, recipe revisions, paid-call-free prompt queue, experiment metrics, costs, pack download, receipt refresh/switch/reload and failed-only recovery passed.`);
    }
  } finally { await browser.close(); await server.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
