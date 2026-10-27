const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWordPressPostPayload } = require('../electron/wordpress-payload');
const { validateRecipeCard } = require('../electron/recipe-generation');
const { durationMinutes, positiveYield } = require('../electron/recipe-card-parser');
const { createRecipeReadinessService } = require('../electron/article-recipe-readiness');
const { renderRecipes } = require('../electron/content-operations');

const rice = { name: 'Lemon Rice', facts: { 'Prep Time': '10 minutes', 'Cook Time': '20 minutes', 'Total Time': '30 minutes', Servings: '4' }, ingredients: ['1 cup rice', '2 cups water', '1 lemon, juiced', '1 tsp salt'], instructions: ['Rinse the rice until the water runs clear, about 1 minute.', 'Simmer rice in the water with salt for 18 minutes until the water is absorbed and grains are tender.', 'Stir in lemon juice and fluff until evenly coated, then serve.'] };
const rawChicken = { name: 'Chicken Bake', facts: { 'Prep Time': '10 minutes', 'Cook Time': '30 minutes', 'Total Time': '40 minutes', Servings: '4' }, ingredients: ['1 lb chicken breast', '1 tbsp olive oil', '1 tsp salt'], instructions: ['Heat the oven to 400 F and oil a tray with the olive oil for about 2 minutes.', 'Season the chicken with salt until evenly coated.', 'Bake 30 minutes until golden.'] };

test('an unrecognised WordPress status fails closed to draft instead of publishing', () => {
  const article = { title: 'Soup', publishStatusOverride: 'pending' };
  assert.equal(buildWordPressPostPayload({ article }).status, 'draft');
  assert.equal(buildWordPressPostPayload({ article: { title: 'Soup', publishStatusOverride: 'Draft' } }).status, 'draft');
  assert.equal(buildWordPressPostPayload({ article: { title: 'Soup' }, defaultStatus: null }).status, 'draft');
  assert.equal(buildWordPressPostPayload({ article: { title: 'Soup' } }).status, 'publish');
});

test('an oven temperature of 175 C is not mistaken for the 74/75 C poultry safety check', () => {
  const card = renderRecipes([{ ...rawChicken, instructions: [...rawChicken.instructions.slice(0, 2), 'Roast at 175°C for 30 minutes until a thermometer in the thickest part shows clear juices.'] }]);
  assert.ok(validateRecipeCard(card).issues.some((issue) => /Raw poultry/.test(issue)));
  const safe = renderRecipes([{ ...rawChicken, instructions: [...rawChicken.instructions.slice(0, 2), 'Bake 30 minutes until a thermometer in the thickest part reads 165 F.'] }]);
  assert.ok(!validateRecipeCard(safe).issues.some((issue) => /Raw poultry/.test(issue)));
});

test('recipe durations read fractions and Unicode fractions correctly', async () => {
  assert.equal(durationMinutes('1/2 hour'), 30);
  assert.equal(durationMinutes('1 1/2 hours'), 90);
  assert.equal(durationMinutes('1½ hours'), 90);
  assert.equal(durationMinutes('2 hours 15 minutes'), 135);
  assert.equal(durationMinutes('45 minutes'), 45);
  const { durationToIso } = await import('../src/lib/articlePostProcess.mjs');
  assert.equal(durationToIso('1 1/2 hours'), 'PT90M');
  assert.equal(durationToIso('1/2 hour'), 'PT30M');
  assert.equal(durationToIso('¾ hour'), 'PT45M');
  assert.equal(durationToIso('1 hour 10 minutes'), 'PT70M');
});

test('common yield wording is accepted as a positive yield', () => {
  for (const value of ['4', 'Serves 4', 'Makes 12 cookies', 'Yields 2 loaves', 'about 6']) assert.equal(positiveYield(value), true, value);
  assert.equal(positiveYield('to taste'), false);
});

test('generated meta descriptions keep their last word when already under 160 characters', async () => {
  const { buildMetadata } = await import('../src/lib/articlePostProcess.mjs');
  const meta = buildMetadata({ title: 'Garden Planner', articleBrief: {} }, '<p>Plan a small vegetable garden with spacing and watering guidance.</p>');
  assert.ok(meta.metaDescription.length <= 160);
  assert.match(meta.metaDescription, /clear next action\.?$|guidance\.?$/);
  const long = buildMetadata({ title: 'Garden Planner', articleBrief: {} }, `<p>${'Plan raised beds with careful spacing '.repeat(8)}today.</p>`);
  assert.ok(long.metaDescription.length <= 160);
  assert.doesNotMatch(long.metaDescription, /\s$/);
});

test('complete recipe collections cannot publish when a later recipe fails safety checks', async () => {
  const prepare = createRecipeReadinessService({ generateCard: async () => assert.fail('no paid repair for a valid primary card') });
  const content = renderRecipes([rice, rawChicken]);
  const collection = { depth: 'complete-recipes', itemCount: 2 };
  const blocked = await prepare({ id: 'a', title: '2 Easy Dinners', content, recipeCollection: collection }, { repair: false });
  assert.equal(blocked.success, false);
  assert.match(blocked.patch.recipeCardQualityWarning, /Recipe 2: Raw poultry/);
  const fixed = renderRecipes([rice, { ...rawChicken, instructions: [...rawChicken.instructions.slice(0, 2), 'Bake 30 minutes until a thermometer in the thickest part reads 165 F (74 C).'] }]);
  const passed = await prepare({ id: 'a', title: '2 Easy Dinners', content: fixed, recipeCollection: collection }, { repair: false });
  assert.equal(passed.success, true, passed.patch.recipeCardQualityWarning);
  // Single-recipe articles keep the existing primary-card behaviour.
  const single = await prepare({ id: 'b', title: 'Lemon Rice', content: renderRecipes([rice]) }, { repair: false });
  assert.equal(single.success, true);
});

test('internal links are never inserted inside the recipe card', async () => {
  const { applyInternalLinksToHtml } = await import('../src/lib/internalLinks.js');
  const html = '<p>Short intro.</p><section id="recipe-card"><h2>Chicken Soup</h2><p>Chicken soup with carrots, noodles and chicken broth for cozy soup nights.</p><div class="notes"><p>Chicken soup keeps for three days.</p></div></section><p>After the card.</p>';
  const result = applyInternalLinksToHtml(html, [{ url: 'https://example.com/chicken-noodle-soup', anchor: 'chicken noodle soup', title: 'Chicken Noodle Soup', categories: ['soup'] }]);
  const card = result.html.slice(result.html.indexOf('<section id="recipe-card">'), result.html.indexOf('</section>') + 10);
  assert.doesNotMatch(card, /<a\s/);
  assert.equal(result.applied.length, 1);
});

test('re-importing the same revenue report reuses row IDs instead of duplicating totals', () => {
  const { normalizeRevenueRows } = require('../electron/growth-workspace');
  const report = [{ Provider: 'Impact', Revenue: '$24.50', Date: '2026-10-01' }, { Provider: 'Impact', Revenue: '$24.50', Date: '2026-10-01' }, { Provider: 'Amazon', Revenue: '$3.10' }];
  const first = normalizeRevenueRows(report, 'october.csv').map(r => r.id);
  const again = normalizeRevenueRows(report, 'october-copy.csv').map(r => r.id);
  assert.deepEqual(first, again);
  assert.equal(new Set(first).size, 3, 'identical rows in one file stay separate');
});
