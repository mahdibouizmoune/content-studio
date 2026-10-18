const assert = require('node:assert/strict');
const path = require('node:path');
const { schedulePinterestPins } = require('../electron/pinterest-schedule');
const { validatePinterestRows } = require('../electron/pinterest-export');

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const { createUiTestServer } = require('./ui-test-server.cjs');
  const server = await createUiTestServer({ server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['tests/fixtures/pinterest-schedule-ui.html'] }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  try {
    for (const [name, width, timezoneId] of [['desktop', 1400, 'America/New_York'], ['mobile', 390, 'Pacific/Auckland']]) {
      const future = new Date(Date.now() + 4 * 86400000).toISOString();
      let saved = Array.from({ length: 2 }, (_, i) => ({ id: String(i), title: `Lemon Soup ${i + 1}`, description: 'Fresh lemon soup recipe.', url: `https://example.com/recipe-${i}`, status: 'completed', csvBoard: 'Recipes',
        csvPublishDate: i === 0 ? future : '', displayUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGQAAAABJRU5ErkJggg==',
        csvMediaUrl: `https://example.com/pin-${i}.jpg`, imageQa: { publicUrlVerified: true, publicDimensionsVerified: true, publicIdentityVerified: true, publicAssetKind: 'finished-pinterest-pin', publicWidth: 1080, publicHeight: 1920, publicValidatedUrl: `https://example.com/pin-${i}.jpg` } }));
      let prepared = 0;
      const errors = [];
      const page = await browser.newPage({ viewport: { width, height: 1000 }, timezoneId });
      page.setDefaultTimeout(60000);
      page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
      await page.exposeFunction('csvFixtureCall', async (action, params) => {
        if (action === 'getPinCreatorPins') return { pins: saved };
        if (action === 'getPinQueue') return { items: [] };
        if (action === 'savePinCreatorPins') { saved = structuredClone(params); return { success: true }; }
        if (action === 'getPinterestDelivery') return { batches: [] };
        if (action === 'preparePinterestExport') {
          prepared++;
          for (const pin of params.pins) if (pin.csvPublishDate) assert.match(pin.csvPublishDate, /Z$/);
          return { success: true, pins: schedulePinterestPins(params.pins, params.schedule), errors: [], warnings: [] };
        }
        if (action === 'validatePinterestExport') return validatePinterestRows(params.rows, params.boardNames);
        throw new Error(`Unexpected fixture action: ${action}`);
      });
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/pinterest-schedule-ui.html`, { waitUntil: 'commit', timeout: 60000 });
      try { await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Edit Pinterest CSV') && !button.disabled)); }
      catch (error) { console.error('CSV fixture startup:', await page.locator('body').innerText()); await page.screenshot({ path: path.resolve(`artifacts/pinterest-startup-failure-${name}.png`) }); throw error; }
      await page.getByRole('button', { name: 'Edit Pinterest CSV', exact: true }).click({ force: true });
      console.log(`${name}: opened editor`);
      await page.getByLabel('CSV start time', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('CSV interval hours', { exact: true }).inputValue(), '1.5');
      assert.equal(await page.getByLabel('CSV interval hours', { exact: true }).evaluate(el => el.validity.valid), true);
      await page.waitForFunction(() => document.body.innerText.includes('Prepared and saved'));
      console.log(`${name}: prepared dates`);
      assert.ok(prepared > 0);
      const startMs = await page.getByLabel('CSV start time', { exact: true }).evaluate((el) => new Date(el.value).getTime());
      assert.ok(startMs - Date.now() >= 9 * 60000 && startMs - Date.now() <= 11 * 60000, 'saved four-day date is not used as default start');
      assert.equal(saved[0].csvPublishDate, future, 'existing deliberate row stays unchanged');
      assert.ok(Date.parse(saved[1].csvPublishDate) - Date.now() < 11 * 60000);
      const selected = await page.evaluate(() => { const d = new Date(Date.now() + 86400000); d.setSeconds(0, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; });
      await page.getByLabel('CSV start time', { exact: true }).fill(selected);
      await page.getByRole('button', { name: 'Apply Time', exact: true }).click();
      await page.waitForFunction(() => document.body.innerText.includes('Scheduled all 2 rows'));
      console.log(`${name}: applied manual start`);
      assert.ok(saved.every((pin) => pin.csvScheduleOrigin === 'manual'));
      assert.equal(new Date(saved[1].csvPublishDate.replace(' ', 'T')).getTime() - new Date(saved[0].csvPublishDate.replace(' ', 'T')).getTime(), 90 * 60000);
      assert.equal(await page.getByLabel('CSV start time', { exact: true }).inputValue(), selected);
      await page.getByLabel('CSV interval hours', { exact: true }).fill('2');
      await page.getByRole('button', { name: 'Start From Now', exact: true }).click();
      await page.waitForFunction(() => document.body.innerText.includes('2 hours between posts'));
      console.log(`${name}: reset near now`);
      assert.ok(saved.every((pin) => pin.csvScheduleOrigin === 'automatic'));
      await page.getByRole('button', { name: 'Check and Auto Fix', exact: true }).click();
      try { await page.waitForFunction(() => document.body.innerText.includes('Auto Fix completed')); }
      catch (error) { console.error(await page.locator('body').innerText()); throw error; }
      const dates = saved.map((pin) => pin.csvPublishDate);
      const times = await page.evaluate((values) => values.map((value) => new Date(value.replace(' ', 'T')).getTime()), dates);
      assert.ok(times[0] - Date.now() >= 9 * 60000 && times[0] - Date.now() <= 11 * 60000);
      assert.equal(times[1] - times[0], 2 * 3600000);
      assert.ok((await page.getByLabel('CSV schedule range', { exact: true }).innerText()).includes('UTC'));
      await page.getByRole('heading', { name: 'Pinterest CSV Editor', exact: true }).scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false);
      await page.screenshot({ path: path.resolve(`artifacts/pinterest-schedule-${name}.png`), fullPage: false });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('CSV UI passed: 90-minute default, saved dates, manual start, reset, UTC conversion, editable two-hour spacing and desktop/mobile layout.');
  } finally { await browser.close(); await server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
