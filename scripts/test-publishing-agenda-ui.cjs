const assert = require('node:assert/strict');
const path = require('node:path');
const { buildPublishingCalendar } = require('../electron/publishing-calendar');
async function main() {
  const { chromium } = require('playwright');
  const server = await require('./ui-test-server.cjs').createUiTestServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
  try {
    const deliveryCalendar = buildPublishingCalendar({ articles: [{ id: 'a', title: 'Lemon Rice', wordpressPostUrl: 'https://recipe.example/rice' }], pins: [{ id: 'p', articleId: 'a' }], batches: [{ id: 'b', fileStatus: 'ready', rows: [{ number: 1, pinId: 'p', cells: ['Lemon Rice', '', '', '', '', 'https://recipe.example/rice', '2026-11-01 10:00:00'] }], outcomes: {} }], ghl: [{ id: 'g', platform: 'instagram', scheduleDate: '2026-11-01T12:00:00Z', status: 'scheduled', verified: true, destinationUrl: 'https://recipe.example/rice' }] });
    for (const [name, width] of [['desktop', 1366], ['mobile', 390]]) {
      const page = await browser.newPage({ viewport: { width, height: 980 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.exposeFunction('agendaFixture', () => ({ calendarEntries: [], campaigns: [], updateQueue: [], revenueRecords: [], runHistory: [], deliveryCalendar }));
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/publishing-agenda-ui.html`);
      await page.getByRole('cell', { name: 'exported-unconfirmed', exact: true }).waitFor();
      await page.getByRole('cell', { name: '1 Nov 2026, 10:00', exact: true }).waitFor();
      await page.getByLabel('Agenda platform', { exact: true }).selectOption('instagram');
      assert.equal(await page.getByRole('cell', { name: 'exported-unconfirmed', exact: true }).count(), 0);
      await page.getByRole('cell', { name: 'GHL read-back verified', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false);
      await page.screenshot({ path: path.resolve(`artifacts/publishing-agenda-${name}.png`) });
      await page.getByRole('tab', { name: 'Planning Dates', exact: true }).click();
      await page.getByLabel('plannedDate for Lemon Rice', { exact: true }).waitFor();
      assert.deepEqual(errors, []); await page.close();
    }
    console.log('Publishing agenda passed: UTC timing, real receipts, unknown imports, filters and desktop/mobile layout.');
  } finally { await browser.close(); await server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
