const assert = require('node:assert/strict');
const path = require('node:path');

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const browser = await chromium.connectOverCDP(process.argv[2]);
  try {
    const page = browser.contexts()[0].pages()[0];
    page.setDefaultTimeout(60000);
    await page.waitForFunction(() => Boolean(window.electronAPI) && document.body.innerText.length > 100);
    const savedCount = await page.evaluate(async () => (await window.electronAPI.getArticles()).length);
    assert.equal(savedCount, 0, 'Run only with a fresh, isolated application profile.');
    await page.evaluate(async () => {
      const settings = await window.electronAPI.getSettings();
      await window.electronAPI.saveSettings({ ...settings, onboardingCompleted: true });
      for (const [index, title] of ['Lemon Herb Salmon', 'Creamy White Bean Soup', 'Fresh Garden Salad'].entries()) {
        await window.electronAPI.saveArticle({ id: `design-native-${index}`, title, generatedTitle: title, type: 'article', queueStatus: 'completed', content: '<p>Recipe preview for an isolated design test.</p>', createdAt: new Date().toISOString() });
      }
    });
    await page.reload();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('heading', { name: 'Articles', exact: true }).waitFor();
    await page.getByRole('button', { name: '3 completed articles', exact: true }).click();
    await page.getByRole('heading', { name: 'Completed Articles', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Lemon Herb Salmon', exact: true }).waitFor();
    const logo = page.getByRole('img', { name: 'Content Studio', exact: true });
    assert.ok(await logo.evaluate((image) => image.complete && image.naturalWidth > 0));
    await page.getByLabel('Find a workspace', { exact: true }).fill('Pinterest');
    assert.equal(await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button').count(), 2);
    await page.getByLabel('Find a workspace', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    await page.screenshot({ path: path.resolve('artifacts/native-workspace-articles.png') });
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Pinterest', exact: true }).click();
    await page.getByRole('heading', { name: 'Pin Creator', exact: true }).waitFor();
    await page.getByText('Pin style', { exact: true }).waitFor();
    assert.ok(await page.locator('.pin-appearance select').count() >= 3);
    await page.screenshot({ path: path.resolve('artifacts/native-workspace-pinterest.png') });
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Meta', exact: true }).click();
    await page.getByRole('heading', { name: 'Meta Studio', exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('class'), 'dark');
    await page.screenshot({ path: path.resolve('artifacts/native-workspace-settings-dark.png') });
    for (const [label, heading] of [['Trends', 'Trends Research'], ['Clusters', 'Content Cluster Planner'], ['Images', 'Image Library'], ['Video', 'Video Studio'], ['Recipe Money Maker', 'Recipe Money Maker'], ['Performance', 'Performance Intelligence'], ['Connections', 'Connections'], ['Job Center', 'Job Center'], ['Quality Studio', 'Quality Studio']]) {
      await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('heading', { name: heading, exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${label}: overflow`);
    }
    console.log('Packaged redesign passed: real saved articles, logo asset, navigation/search/collapse, Pinterest, Meta, Settings, dark theme and overflow checks. No publishing or paid APIs used.');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
