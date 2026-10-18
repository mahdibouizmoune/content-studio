const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const { ensureRecipeCard } = await import('../src/lib/articlePostProcess.mjs');
  const content = '<p>A creamy berry yogurt bowl with a fresh, chilled finish.</p><h2>Ingredient choices</h2><p>Use ripe, dry berries. Swap chopped peaches for a softer bite.</p><h2>Prevent a watery bowl</h2><p>Pat berries dry before folding them into yogurt.</p><h2>Make ahead and serving</h2><p>Keep toppings separate until serving for better texture.</p><section id="recipe-card"><h2>Recipe Card</h2><h3 itemprop="name">Berry Yogurt Bowl</h3><ul><li><strong>Prep Time:</strong> 10 minutes</li><li><strong>Cook Time:</strong> 0 minutes</li><li><strong>Total Time:</strong> 10 minutes</li><li><strong>Servings:</strong> 2</li></ul><h3>Ingredients</h3><ul itemprop="recipeIngredient"><li>1 cup plain yogurt</li><li>1 cup berries</li><li>1 tsp honey</li></ul><h3>Instructions</h3><ol itemprop="recipeInstructions"><li>Stir honey into yogurt until smooth.</li><li>Fold in dry berries until evenly combined.</li><li>Serve chilled.</li></ol></section>';
  const enhanced = ensureRecipeCard(ensureRecipeCard(content));
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  fs.mkdirSync(path.resolve(__dirname, '../artifacts'), { recursive: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    const sanitizer = fs.readFileSync(path.resolve(__dirname, '../src/lib/sanitizeHtml.js'), 'utf8');
    await page.addScriptTag({ type: 'module', content: `${sanitizer}\nwindow.csSanitize = sanitizeHtml;` });
    await page.waitForFunction(() => typeof window.csSanitize === 'function');
    const cleaned = await page.evaluate(() => window.csSanitize('<p>Recipe notes</p><svg><a id="target"><text>Click</text></a><set href="#target" attributeName="href" to="javascript:window.bad=true"/></svg><math><mi>x</mi></math><img src="https://recipe.example/photo.jpg" onerror="window.bad=true"><script>window.bad=true</script>'));
    assert.match(cleaned, /Recipe notes/); assert.match(cleaned, /photo.jpg/);
    assert.doesNotMatch(cleaned, /<svg|<math|<script|onerror|javascript:/i);
    for (const [name, width] of [['desktop', 1280], ['mobile', 390]]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#fff;font:17px/1.7 system-ui;color:#242424}main{max-width:760px;margin:auto;padding:24px 16px}h1{font-size:30px}h2{font-size:24px}a{color:#174e42}</style><main><h1>Berry Yogurt Bowl</h1>${enhanced}</main></html>`);
      assert.equal(await page.getByRole('link', { name: 'Jump to Recipe', exact: true }).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: path.resolve(__dirname, `../artifacts/recipe-reader-${name}.png`), fullPage: true });
      await page.getByRole('link', { name: 'Jump to Recipe', exact: true }).click();
      assert.equal(await page.evaluate(() => location.hash), '#recipe-card');
      assert.equal(await page.locator('script').count(), 0);
    }
    console.log('Recipe reader UI passed: active SVG/MathML and scripts removed from preview; one working recipe shortcut and no horizontal overflow on desktop/mobile.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
