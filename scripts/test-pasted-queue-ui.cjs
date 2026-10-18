const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fs = require('node:fs');
const { createUiTestServer } = require('./ui-test-server.cjs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  process.chdir(path.resolve(__dirname, '..'));
  fs.mkdirSync('artifacts', { recursive: true });
  const server = await createUiTestServer({ server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['tests/fixtures/article-intake-ui.html'] }, logLevel: 'error' });
  await server.listen();
  const port = server.httpServer.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/article-intake-ui.html`, { waitUntil: 'commit', timeout: 60000 });
    const titles = page.getByLabel('Titles', { exact: true });
    await titles.waitFor({ timeout: 90000 });
    await titles.fill('Apple Ginger Kombucha\nBlueberry Lemon Pancakes\nBlueberry Lemon Pancakes Breakfast\nRoasted Zucchini Lasagna\nHomemade Banana Syrup');
    await page.getByText('3 ready / 2 excluded', { exact: true }).waitFor();
    for (const [name, width] of [['desktop', 1400], ['mobile', 390]]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: path.resolve(`artifacts/article-intake-${name}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${name} has no overflow`);
    }
    await page.getByRole('button', { name: 'Add to Queue', exact: true }).click();
    await page.getByText('Added 2 articles. 3 duplicate or overlapping titles excluded.', { exact: true }).waitFor();
    const saved = await page.evaluate(() => window.intakeTestArticles.map((article) => article.title));
    assert.deepEqual(saved, ['Apple Ginger Kombucha', 'Homemade Banana Syrup', 'Blueberry Lemon Pancakes', 'Roasted Zucchini Lasagna']);
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Queue UI passed: exact and same-batch overlaps excluded, stale-screen duplicate excluded by backend, saved articles kept, desktop/mobile layout.');
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
