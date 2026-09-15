const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  process.chdir(path.resolve(__dirname, '..'));
  fs.mkdirSync('artifacts', { recursive: true });
  const reservation = net.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/fixtures/pinterest-delivery-vite.config.mjs', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { windowsHide: true, stdio: 'pipe' });
  let browser;
  let page;
  let serverOutput = '';
  server.stdout.on('data', (data) => { serverOutput = (serverOutput + data).slice(-8000); });
  server.stderr.on('data', (data) => { serverOutput = (serverOutput + data).slice(-8000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (server.exitCode !== null) throw new Error('Test server exited.');
      try { ready = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'test server ready');
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
    page.on('requestfailed', (request) => console.error(request.url(), request.failure()));
    await page.goto(`http://127.0.0.1:${port}/tests/fixtures/pinterest-delivery-ui.html`, { waitUntil: 'commit', timeout: 60000 });
    await page.getByLabel('Row 2 outcome', { exact: true }).waitFor({ timeout: 90000 });
    await page.getByLabel('Pinterest email or import receipt').fill('Receipt fixture');
    await page.getByRole('button', { name: 'Match Error Rows' }).click();
    await page.getByText('1 error rows matched.', { exact: false }).waitFor();
    assert.equal(await page.getByLabel('Row 2 outcome', { exact: true }).inputValue(), 'failed');
    assert.equal(await page.getByLabel('Row 1 outcome', { exact: true }).inputValue(), 'pending');
    await page.getByRole('button', { name: 'Save Results' }).click();
    await page.getByText('Reported import results saved.').waitFor();
    await page.getByRole('button', { name: 'Retry Failed Only' }).click();
    assert.equal(await page.locator('body').getAttribute('data-retry'), 'test-batch');
    for (const [name, width] of [['desktop', 1400], ['mobile', 390]]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: path.resolve(`artifacts/pinterest-delivery-${name}.png`), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${name} has no page overflow`);
    }
    assert.deepEqual(errors, []);
    console.log('History UI passed: receipt review, saved outcomes, failed-only action, desktop/mobile layout.');
  } catch (error) {
    console.error(serverOutput);
    if (page) console.error(await page.locator('body').innerText({ timeout: 3000 }).catch(() => 'Page unavailable'));
    throw error;
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
