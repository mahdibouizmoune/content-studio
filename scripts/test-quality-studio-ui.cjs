const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createQualityWorkspace } = require('../electron/quality-workspace');
const { createSpendLedger } = require('../electron/spend-ledger');
async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const { createUiTestServer } = require('./ui-test-server.cjs');
  console.log('Starting local quality screen test server.');
  const server = await createUiTestServer({ server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['tests/fixtures/quality-studio-ui.html'] }, logLevel: 'error' }); await server.listen();
  console.log('Launching local test browser.');
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  const card = '<section id="recipe-card"><h2>Lemon Rice</h2><p>Prep Time: 5 minutes; Cook Time: 15 minutes; Total Time: 20 minutes; Servings: 4</p><h3>Ingredients</h3><ul><li>1 cup rice</li><li>2 cups water</li><li>1 tbsp lemon juice</li></ul><h3>Instructions</h3><ol><li>Combine rice and water in a saucepan.</li><li>Simmer for 15 minutes until rice is tender.</li><li>Stir in lemon juice until evenly combined.</li></ol></section>';
  try {
    await fs.mkdir(path.resolve('artifacts'), { recursive: true });
    for (const [name, width] of [['desktop', 1366], ['mobile', 390]]) {
      const page = await browser.newPage({ viewport: { width, height: 980 } }); const errors = [];
      page.setDefaultTimeout(60000);
      console.log(`${name}: test page created.`);
      page.on('pageerror', e => errors.push(e.message));
      let stored = { articles: Array.from({ length: 120 }, (_, i) => ({ id: `a${i}`, title: `Lemon Rice ${i}`, content: card })), pinCreatorPins: [{ id: 'p', title: 'Lemon Rice', localPath: 'pin.jpg', imageQa: { sha256: 'known' }, displayUrl: '/artifacts/exact-template-test.jpg' }] };
      const store = { get: (k, fallback) => structuredClone(stored[k] ?? fallback), set: (k, v) => { stored[k] = structuredClone(v); } };
      const service = createQualityWorkspace({ store, ledger: createSpendLedger({ store }), releaseInfo: () => ({ installedVersion: '1.5.0', verified: false }), saveFile: async (name, bytes) => { assert.ok(bytes.length); return { path: name }; } });
      await page.addInitScript(() => { window.electronAPI = {}; });
      await page.exposeFunction('qualityFixtureCall', async (action, params) => {
        if (action === 'jobs') return { success: true, jobs: Array.from({ length: 1000 }, (_, i) => ({ id: `j${i}`, label: `Job ${i}`, status: 'completed' })) };
        if (action === 'check-text') { stored.pinCreatorPins[0].imageQa.textCheck = { status: 'matched', imageSha256: 'known', expected: params.expected, observed: params.expected, confidence: 98, missing: [], extra: [] }; return { success: true, result: {} }; }
        try { return { success: true, result: await service.run(action, params) }; } catch (e) { return { success: false, error: e.message }; }
      });
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/quality-studio-ui.html`, { waitUntil: 'commit', timeout: 60000 });
      console.log(`${name}: page loaded.`);
      try { await page.getByRole('heading', { name: 'Quality Studio', exact: true }).waitFor(); }
      catch (error) { console.error('Page exceptions:', errors); console.error(await page.locator('body').innerText()); await page.screenshot({ path: path.resolve(`artifacts/quality-failure-${name}.png`) }); throw error; }
      assert.ok(await page.getByRole('region', { name: 'Saved recipe articles' }).locator('article').count() < 35);
      assert.ok(await page.getByRole('region', { name: 'Background jobs' }).locator('article').count() < 35);
      await page.getByRole('button', { name: 'Select All', exact: true }).click();
      await page.getByRole('button', { name: 'Check Selected (120)', exact: true }).click();
      console.log(`${name}: recipe batch checked.`);
      await page.getByText('structure-checked · 3 ingredients · 3 steps').first().waitFor();
      await page.getByLabel('Collection name', { exact: true }).fill('Weeknight Recipes'); await page.getByRole('button', { name: 'Save Collection', exact: true }).click();
      await page.getByRole('button', { name: 'Weeknight Recipes (120)', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Download Shopping List', exact: true }).click(); await page.getByText('Saved: recipe-shopping-list.html', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Images', exact: true }).click(); await page.getByLabel('Saved Pin', { exact: true }).selectOption('p');
      await page.getByLabel('Exact visible text', { exact: true }).fill('LEMON RICE'); await page.getByRole('button', { name: 'Check Text Locally', exact: true }).click();
      await page.getByText('Text: matched · Visual review: Unchecked', { exact: true }).waitFor();
      const image = page.getByRole('img', { name: 'Lemon Rice', exact: true }); assert.ok(await image.evaluate(img => img.complete && img.naturalWidth > 0));
      await page.screenshot({ path: path.resolve(`artifacts/quality-images-${name}.png`), fullPage: false });
      await page.getByRole('tab', { name: 'Spending', exact: true }).click(); await page.getByLabel('Daily USD limit (UTC)', { exact: true }).fill('2'); await page.getByRole('button', { name: 'Save Spending Guard', exact: true }).click(); await page.getByText('Done.', { exact: true }).waitFor();
      assert.equal(store.get('generationSpending').policy.dailyUsd, 2);
      await page.getByRole('tab', { name: 'Reader Events', exact: true }).click(); await page.getByRole('button', { name: 'Refresh GA4 Recipe Events', exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Release & Worker', exact: true }).click(); await page.getByText('Unverified development build', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false); assert.deepEqual(errors, []);
      await page.screenshot({ path: path.resolve(`artifacts/quality-release-${name}.png`), fullPage: false });
      await page.close(); console.log(`${name}: recipe checks, shopping list, local text review, spending, events, worker states and virtualized 1000 jobs passed.`);
    }
    const reader = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await reader.route('https://recipe.example.test/**', route => route.fulfill({ contentType: 'text/html', body: `<html><body>${card}</body></html>` }));
    await reader.goto('https://recipe.example.test/rice?utm_content=pin-p');
    await reader.addStyleTag({ path: path.resolve('electron/assets/reader-plugin/reader.css') });
    await reader.addScriptTag({ content: "window.csReaderSettings={postId:'p',events:false};window.csTestEvents=[];window.gtag=(...args)=>window.csTestEvents.push(args);" });
    await reader.addScriptTag({ path: path.resolve('electron/assets/reader-plugin/reader.js') });
    await reader.getByRole('button', { name: 'Save Recipe', exact: true }).click(); await reader.getByRole('button', { name: 'Saved on This Device', exact: true }).waitFor();
    await reader.getByRole('button', { name: 'Shopping List', exact: true }).click(); assert.match(await reader.getByRole('textbox', { name: 'Shopping list', exact: true }).inputValue(), /1 cup rice/);
    await reader.getByRole('button', { name: 'Cook Mode', exact: true }).click(); assert.equal(await reader.getByRole('button', { name: 'Cook Mode', exact: true }).getAttribute('aria-pressed'), 'true');
    await reader.getByRole('checkbox', { name: 'Step 1 complete', exact: true }).check();
    await reader.getByText(/1 of \d+ steps checked/).waitFor();
    await reader.getByLabel('Timer minutes', { exact: true }).fill('1');
    await reader.getByRole('button', { name: 'Start Timer', exact: true }).click();
    assert.equal(await reader.getByLabel('Timer minutes', { exact: true }).isDisabled(), true);
    await reader.getByRole('button', { name: 'Cancel Timer', exact: true }).click();
    await reader.getByText('Timer cancelled.', { exact: true }).waitFor();
    assert.deepEqual(await reader.evaluate(() => window.csTestEvents), []); await reader.screenshot({ path: path.resolve('artifacts/reader-controls-mobile.png') }); await reader.close();
  } finally { await browser.close(); await server.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
