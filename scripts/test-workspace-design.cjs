const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const { createServer, preview } = await import('vite');
  const built = process.env.CONTENT_STUDIO_TEST_BUILT === '1';
  const server = built
    ? await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' })
    : await createServer({ cacheDir: '.codex-tools/vite-workspace-ui', optimizeDeps: { entries: ['index.html'] }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  if (!built) await server.listen();
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const articleTitles = ['Lemon Herb Salmon with Roasted Vegetables', 'Creamy White Bean Soup', 'Crispy Parmesan Potatoes', 'Fresh Summer Mason Jar Salad'];
  try {
    await fs.mkdir(path.resolve('artifacts'), { recursive: true });
    for (const [name, width] of [['desktop', 1440], ['tablet', 900], ['mobile', 390]]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      page.setDefaultTimeout(60000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', m => { if (m.type() === 'error') console.error('Browser:', m.text()); });
      await page.addInitScript(({ articleTitles }) => {
        localStorage.setItem('theme', 'light');
        localStorage.removeItem('studio-sidebar-collapsed');
        localStorage.setItem('content-studio-dev-store', JSON.stringify({
          settings: { onboardingCompleted: true, listicleCategory: 'food', wordpressSites: [], featureFlags: { contentCalendar: true, contentUpdateQueue: true, revenueAttribution: true, runHistory: true, modelRegistry: true } },
          articles: articleTitles.map((title, index) => ({ id: `design-${index}`, title, generatedTitle: title, type: 'article', queueStatus: 'completed', createdAt: '2026-10-01T12:00:00Z', content: '<p>A practical recipe with clear ingredients, cooking cues, and make-ahead notes for busy home cooks.</p>' })).concat([{ id: 'pending', title: 'Roasted Pumpkin Soup', type: 'article', queueStatus: 'pending' }, { id: 'error', title: 'Apple Cinnamon Muffins', type: 'article', queueStatus: 'error', error: 'Example recipe needs review.' }])
        }));
      }, { articleTitles });
      await page.goto(base, { waitUntil: 'commit' });
      try { await page.getByRole('heading', { name: 'Articles', exact: true }).waitFor({ timeout: 120000 }); }
      catch (error) { console.error('Page exceptions:', errors); console.error(await page.locator('body').innerText()); await page.screenshot({ path: path.resolve(`artifacts/workspace-load-failure-${name}.png`) }); throw error; }
      await page.getByRole('button', { name: 'Add Titles', exact: true }).waitFor();
      await page.screenshot({ path: path.resolve(`artifacts/workspace-format-${name}.png`) });
      await page.getByRole('button', { name: '4 completed articles', exact: true }).click();
      await page.getByRole('heading', { name: 'Completed Articles', exact: true }).waitFor();
      await page.getByLabel('Search articles', { exact: true }).fill('Salmon');
      assert.equal(await page.getByRole('heading', { name: articleTitles[0], exact: true }).count(), 1);
      assert.equal(await page.getByRole('heading', { name: articleTitles[1], exact: true }).count(), 0);
      await page.getByLabel('Search articles', { exact: true }).fill('');
      await page.screenshot({ path: path.resolve(`artifacts/workspace-articles-${name}.png`) });
      await page.getByRole('button', { name: 'Grid view', exact: true }).click();
      await page.getByRole('button', { name: 'List view', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${name}: article overflow`);
      if (width >= 768) {
        const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
        await page.getByLabel('Find a workspace', { exact: true }).fill('Pinterest');
        assert.equal(await nav.getByRole('button').count(), 2);
        await page.getByLabel('Find a workspace', { exact: true }).fill('');
        await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
        assert.equal(await page.locator('.studio-sidebar').evaluate((node) => Math.round(node.getBoundingClientRect().width)), 68);
        await nav.getByRole('button', { name: 'Pinterest', exact: true }).click();
        await page.getByRole('heading', { name: 'Pin Creator', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
      } else {
        await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Distribute', exact: true }).click();
        await page.locator('#mobile-workspaces').getByRole('button', { name: 'Pinterest', exact: true }).click();
        await page.getByRole('heading', { name: 'Pin Creator', exact: true }).waitFor();
      }
      await page.screenshot({ path: path.resolve(`artifacts/workspace-pinterest-${name}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${name}: Pinterest overflow`);
      async function navigate(label, mobileGroup) {
        if (width >= 768) await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: label, exact: true }).click();
        else {
          await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: mobileGroup, exact: true }).click();
          await page.locator('#mobile-workspaces').getByRole('button', { name: label, exact: true }).click();
        }
      }
      await navigate('Meta', 'Distribute');
      await page.getByRole('heading', { name: 'Meta Studio', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${name}: Meta overflow`);
      await page.screenshot({ path: path.resolve(`artifacts/workspace-meta-${name}.png`) });
      await navigate('Settings', 'More');
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
      assert.equal(await page.locator('html').getAttribute('class'), 'dark');
      await page.screenshot({ path: path.resolve(`artifacts/workspace-settings-dark-${name}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${name}: settings overflow`);
      await navigate('Articles', 'Create');
      await page.getByRole('heading', { name: 'Articles', exact: true }).waitFor();
      assert.equal(await page.getByLabel('Search articles', { exact: true }).inputValue(), '');
      await page.screenshot({ path: path.resolve(`artifacts/workspace-articles-dark-${name}.png`) });
      assert.deepEqual(errors, [], `${name}: render exceptions`);
      await page.close();
      console.log(`${name}: navigation, filtering, collapse, persistent workflow state, themes and responsive views passed`);
    }
  } finally {
    await browser.close();
    if (built) await new Promise(resolve => server.httpServer.close(resolve));
    else await server.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
