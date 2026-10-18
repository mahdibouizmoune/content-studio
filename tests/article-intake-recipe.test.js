const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecipeCard } = require('../electron/recipe-generation');
const { durationMinutes, parseRecipeCard } = require('../electron/recipe-card-parser');
const { createRecipeReadinessService } = require('../electron/article-recipe-readiness');

const card = '<section id="recipe-card"><h2>Recipe Card</h2><p>Prep Time: 10 minutes; Cook Time: 0 minutes; Total Time: 1 day; Servings: about 8 servings</p><h3><strong>Ingredients</strong></h3><ul><li>4 cups kombucha</li><li>1 cup apple juice</li><li>1 tsp ginger</li></ul><h3>Instructions</h3><ol><li>Mix ingredients until evenly combined.</li><li>Chill for 1 day until cold.</li><li>Serve in glasses.</li></ol></section>';

test('pasted intake excludes exact, generated-title, source-URL, and intra-batch overlaps without deleting saved articles', async () => {
  const { filterArticleIntake } = await import('../electron/article-intake.mjs');
  const saved = [{ id: 'saved', title: 'Apple Ginger Kombucha', generatedTitle: 'Autumn Fermented Apple Drink', sourceUrl: 'https://example.com/kombucha/' }];
  const before = structuredClone(saved);
  const result = filterArticleIntake([
    { id: '1', title: 'APPLE GINGER KOMBUCHA!!!' },
    { id: '2', title: 'Autumn Fermented Apple Drink' },
    { id: '3', title: 'Fresh drink', sourceUrl: 'https://example.com/kombucha/?utm_source=pinterest#recipe' },
    { id: '4', title: 'Blueberry Lemon Pancakes' },
    { id: '5', title: 'Blueberry Lemon Pancakes Breakfast' },
    { id: '6', title: 'Roasted Zucchini Lasagna' }
  ], saved);
  assert.deepEqual(result.accepted.map((row) => row.id), ['4', '6']);
  assert.deepEqual(result.skipped.map((row) => row.id), ['1', '2', '3', '5']);
  assert.deepEqual(saved, before);
});

test('topic scoring does not inflate repeated words or lose Unicode titles', async () => {
  const { filterArticleIntake, detectCannibalization } = await import('../electron/article-intake.mjs');
  assert.equal(detectCannibalization('chicken chicken chicken', [{ title: 'chicken apple ginger rice soup' }]).length, 0);
  const result = filterArticleIntake([{ title: 'Crème Brûlée' }, { title: 'Creme Brulee' }, { title: '抹茶蛋糕' }, { title: '抹茶蛋糕' }]);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.skipped.length, 2);
});

test('URL intake extracts a usable title and retains recipe-specific query parameters', async () => {
  const { filterArticleIntake } = await import('../electron/article-intake.mjs');
  const result = filterArticleIntake([{ title: 'https://example.com/blueberry-lemon-pancakes' }]);
  assert.equal(result.accepted[0].title, 'blueberry lemon pancakes');
  const distinct = filterArticleIntake([{ title: 'Vanilla Cheesecake', sourceUrl: 'https://example.com/recipes?id=2' }], [{ title: 'Green Bean Soup', sourceUrl: 'https://example.com/recipes?id=1' }]);
  assert.equal(distinct.accepted.length, 1);
});

test('recipe validation accepts real day-based timing and approximate positive yields', () => {
  assert.equal(validateRecipeCard(card).ok, true);
  assert.equal(durationMinutes('1 day 2 hours 15 minutes'), 1575);
  assert.equal(durationMinutes('2-3 days'), 4320);
  assert.equal(durationMinutes('-5 minutes'), null);
  assert.equal(validateRecipeCard(card.replace('about 8', 'about 0')).ok, false);
  assert.equal(validateRecipeCard(card.replace('1 day', '0 minutes')).ok, false);
});

test('HTML parsing accepts nested recipe sections and headings without swallowing trailing article content', () => {
  const nested = card.replace('<h3><strong>Ingredients', '<section><h3><strong>Ingredients').replace('</ul><h3>Instructions', '</ul></section><h3>Instructions');
  const parsed = parseRecipeCard(`${nested}<p>Article conclusion</p>`);
  assert.equal(validateRecipeCard(nested).ok, true);
  assert.equal(parsed.ingredients.length, 3);
  assert.ok(!parsed.html.includes('Article conclusion'));
  assert.equal(validateRecipeCard(`${card}${card}`).ok, false);
});

test('valid saved recipes skip paid repair and receive matching schema', async () => {
  const prepare = createRecipeReadinessService({ generateCard: async () => { throw new Error('Unexpected paid repair'); } });
  const result = await prepare({ title: 'Apple Ginger Drink', content: card, recipeCardQualityWarning: 'Stale warning' });
  assert.equal(result.success, true);
  assert.equal(result.repaired, false);
  assert.equal(result.patch.content, card);
  assert.equal(result.patch.recipeCardQualityWarning, '');
  assert.equal(JSON.parse(result.patch.structuredData).totalTime, 'PT1440M');
});

test('a validated repair replaces only the card and retries incomplete responses at most twice', async () => {
  let attempts = 0;
  const original = `<p>Useful article opening remains unchanged.</p>${card.replace('about 8', 'unknown')}<p>Conclusion remains unchanged.</p>`;
  const prepare = createRecipeReadinessService({ generateCard: async (prompt) => { assert.match(prompt, /positive numeric/); return ++attempts === 1 ? '<section id="recipe-card">Incomplete</section>' : card; } });
  const result = await prepare({ title: 'Apple Ginger Drink', content: original });
  assert.equal(result.success, true);
  assert.equal(result.repaired, true);
  assert.equal(attempts, 2);
  assert.ok(result.patch.content.startsWith('<p>Useful article opening remains unchanged.</p>'));
  assert.ok(result.patch.content.endsWith('<p>Conclusion remains unchanged.</p>'));
});

test('failed repairs retain the original draft and safety checks, rather than pretending it is publishable', async () => {
  let attempts = 0;
  const content = card.replace('<li>4 cups kombucha</li>', '<li>1 lb raw chicken</li>');
  const prepare = createRecipeReadinessService({ generateCard: async () => { attempts++; return content; } });
  const result = await prepare({ title: 'Chicken Recipe', content });
  assert.equal(result.success, false);
  assert.equal(attempts, 2);
  assert.equal(result.patch.content, content);
  assert.match(result.patch.recipeCardQualityWarning, /thermometer/);
});

test('cancellation prevents a late recipe response from replacing saved content', async () => {
  const controller = new AbortController();
  const prepare = createRecipeReadinessService({ generateCard: async () => { controller.abort(); return card; } });
  await assert.rejects(prepare({ title: 'Drink', content: card.replace('about 8', 'unknown') }, { signal: controller.signal }), /Cancelled/);
});
