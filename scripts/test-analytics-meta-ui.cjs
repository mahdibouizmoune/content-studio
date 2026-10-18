const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { createUiTestServer } = require('./ui-test-server.cjs');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const server = await createUiTestServer({ server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['tests/fixtures/analytics-meta-ui.html'] }, logLevel: 'error' });
  await server.listen();
  const port = server.httpServer.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    fs.mkdirSync('artifacts', { recursive: true });
    for (const [name, width, height] of [['desktop', 1400, 1000], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(`http://127.0.0.1:${port}/tests/fixtures/analytics-meta-ui.html`, { waitUntil: 'commit', timeout: 60000 });
      await page.getByRole('heading', { name: 'Best Performing Articles' }).waitFor({ timeout: 90000 });
      await page.getByRole('button', { name: 'Research Topic' }).click();
      assert.equal(await page.getByPlaceholder('high protein chicken dinners').inputValue(), 'lemon chickpea salad');
      await page.screenshot({ path: path.resolve(`artifacts/analytics-trends-${name}.png`), fullPage: true });
      await page.getByRole('button', { name: 'clusters', exact: true }).click();
      await page.getByRole('button', { name: 'Plan Clusters' }).click();
      assert.equal(await page.locator('input').evaluateAll((inputs) => inputs.some((input) => input.value === 'https://food.example/salad')), true);
      await page.screenshot({ path: path.resolve(`artifacts/analytics-clusters-${name}.png`), fullPage: true });
      await page.getByRole('button', { name: 'settings', exact: true }).click();
      await page.getByRole('heading', { name: 'Google Analytics 4' }).waitFor();
      await page.getByText('Identification only. It does not grant access or install tracking on your website.', { exact: true }).waitFor();
      await page.getByPlaceholder('G-XXXXXXXXXX').fill('G-NEWCODE123');
      assert.equal(await page.getByPlaceholder('123456789').inputValue(), '123456');
      await page.screenshot({ path: path.resolve(`artifacts/analytics-settings-${name}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true, `${name}: no page overflow`);
    }
    assert.deepEqual(errors, []);
    console.log('Analytics screens passed: real performance fixture, topic and cluster selection, tracking/property separation, desktop and mobile layouts.');
  } finally { await browser?.close(); await server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
