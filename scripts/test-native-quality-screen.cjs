const assert = require('node:assert/strict');
const path = require('node:path');
async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const browser = await chromium.connectOverCDP(process.argv[2]);
  try {
    const page = browser.contexts()[0].pages().find(p => /index\.html|content-studio/i.test(p.url())) || browser.contexts()[0].pages()[0];
    page.setDefaultTimeout(60000);
    await page.waitForFunction(() => document.readyState === 'complete' && document.body.innerText.length > 100);
    const initial = await page.locator('body').innerText();
    console.log('Initial native screen:', initial.slice(0, 1200));
    await page.getByRole('button', { name: 'Quality Studio', exact: true }).click();
    await page.getByRole('heading', { name: 'Quality Studio', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Spending', exact: true }).click();
    await page.getByLabel('Daily USD limit (UTC)', { exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Release & Worker', exact: true }).click();
    await page.getByText('Unverified development build', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.screenshot({ path: path.resolve('artifacts/native-quality-studio.png') });
    console.log('Packaged Quality Studio navigation, spending form, honest release state and layout passed.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
