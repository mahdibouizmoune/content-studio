const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const recipes = require('../electron/recipe-generation');
const { READER_RECIPE_GUIDANCE, assessEditorialGaps } = require('../electron/article-editorial');
const { createRecipeReadinessService } = require('../electron/article-recipe-readiness');

function card(ingredients, instructions, cook = '0 minutes') {
  return `<section id="recipe-card"><p>Prep Time: 10 minutes; Cook Time: ${cook}; Total Time: 30 minutes; Servings: 4</p><h3>Ingredients</h3><ul>${ingredients.map((item) => `<li>${item}</li>`).join('')}</ul><h3>Instructions</h3><ol>${instructions.map((step) => `<li>${step}</li>`).join('')}</ol></section>`;
}
const drink = card(['One cup apple cider', 'Two tablespoons syrup', '1 cup sparkling water'], [
  'Whisk cider and syrup into a smooth mixture.', 'Add sparkling water and serve chilled.', 'Divide between four glasses.'
]);

test('drinks and assembly recipes accept accurate cold texture cues and written quantities', () => {
  assert.deepEqual(recipes.validateRecipeCard(drink).issues, []);
  const board = card(['1 cup hummus', '2 cups grapes', '1 cup cheese'], [
    'Spread hummus in a smooth layer on a plate.', 'Arrange grapes and cheese evenly distributed around the hummus.', 'Serve on a board.'
  ]);
  assert.equal(recipes.validateRecipeCard(board).ok, true);
  const vague = card(['cider', 'syrup', 'water'], ['Mix ingredients.', 'Pour into glasses.', 'Serve.']);
  assert.ok(recipes.validateRecipeCard(vague).issues.includes('Most recipe card ingredients need explicit quantities'));
  assert.ok(recipes.validateRecipeCard(vague).issues.includes('Recipe instructions need timing, temperature, texture, or doneness cues'));
});

test('cooked poultry is distinguished from raw poultry without weakening safe reheating', () => {
  const steps = ['Mix chicken and dressing into a smooth coating.', 'Fold in vegetables evenly coated with dressing.', 'Serve chilled.'];
  const cold = card(['2 cups leftover roast chicken', '1 cup vegetables', '2 tbsp dressing'], steps);
  assert.equal(recipes.validateRecipeCard(cold).ok, true);
  const raw = card(['1 lb raw chicken', '1 cup vegetables', '2 tbsp oil'], steps, '20 minutes');
  assert.match(recipes.validateRecipeCard(raw).issues.join('; '), /Raw poultry.*165 F/);
  const smoked = raw.replace('raw chicken', 'smoked chicken');
  assert.match(recipes.validateRecipeCard(smoked).issues.join('; '), /Raw poultry.*165 F/);
  const reheated = card(['2 cups leftover roast chicken', '1 cup vegetables', '2 tbsp oil'], [
    'Simmer chicken with vegetables for 10 minutes.', 'Stir the oil in until evenly combined.', 'Serve warm.'
  ], '20 minutes');
  assert.match(recipes.validateRecipeCard(reheated).issues.join('; '), /Reheated poultry.*165 F/);
  assert.equal(recipes.validateRecipeCard(reheated.replace('Serve warm.', 'Check the thickest part with a food thermometer for an internal temperature of 165 F before serving.')).ok, true);
  assert.equal(recipes.validateRecipeCard(drink.replace('One cup apple cider', '1 cup chicken stock')).ok, true);
});

function roundup(recipe = drink, count = 8) {
  return Array.from({ length: count }, (_, index) => `<h2>${index + 1}. Apple drink ${index + 1}</h2><p>${'Choose fresh fruit and chill the cider before mixing for a refreshing seasonal drink. '.repeat(6)}</p>`).join('') + recipe;
}

function generationHarness(outputs) {
  const source = fs.readFileSync(require.resolve('../electron/main.js'), 'utf8');
  const start = source.indexOf("secureIpcHandle('generate-article',");
  const end = source.indexOf('async function prepareArticleRecipe', start);
  const calls = [];
  let handler;
  const context = vm.createContext({
    ...recipes, READER_RECIPE_GUIDANCE, assessEditorialGaps,
    AbortController, Map, Promise, Error, setTimeout, activeJobs: new Map(),
    secureIpcHandle: (_channel, fn) => { handler = fn; },
    resolveReplicateApiToken: () => 'test-token', relevantPinterestSignals: () => [], getAIModelUrl: () => 'test-url',
    stripHtml: (html) => html.replace(/<[^>]+>/g, ' '), log: { warn() {} },
    replicateRequest: async (_url, body) => { calls.push(body); return { data: { id: String(calls.length) } }; },
    pollReplicate: async (id) => outputs[Math.min(Number(id) - 1, outputs.length - 1)]
  });
  vm.runInContext(source.slice(start, end), context);
  return { calls, run: () => handler({}, { title: '8 Apple Drinks', settings: { articleLength: '900-1200', articleType: 'listicle', listicleCategory: 'food', listicleItemCount: 8 } }) };
}

test('actual compact generation preserves useful text and targets recipe-only repair', async () => {
  const broken = roundup(drink.replace('One cup apple cider', 'apple cider').replace('Two tablespoons syrup', 'syrup'));
  const harness = generationHarness([broken]);
  const generated = await harness.run();
  assert.equal(harness.calls.length, 1, 'Do not buy another whole article for a card problem');
  assert.equal(generated.content, broken);
  assert.equal(generated.collectionQualityWarning, '');
  assert.equal(generated.qualityPassApplied, false);
  let repairs = 0;
  const prepare = createRecipeReadinessService({ generateCard: async (prompt) => {
    repairs++;
    assert.match(prompt, /Repair the primary recipe card/);
    return drink;
  } });
  const ready = await prepare({ title: '8 Apple Drinks', content: generated.content });
  assert.equal(ready.success, true);
  assert.equal(repairs, 1);
  assert.ok(ready.patch.content.startsWith(broken.slice(0, broken.indexOf('<section'))));
  assert.match(harness.calls[0].input.prompt, /Raw poultry must reach 165 F/);
});

test('structural failures retain the draft but cannot silently proceed as a complete collection', async () => {
  const incomplete = roundup(drink, 3);
  const harness = generationHarness([incomplete]);
  const result = await harness.run();
  assert.equal(harness.calls.length, 2);
  assert.equal(result.content, incomplete);
  assert.match(result.collectionQualityWarning, /Expected numbered ideas 1 through 8/);
  const queue = fs.readFileSync(require.resolve('../src/components/Queue.jsx'), 'utf8');
  assert.ok(queue.indexOf('if (checkpoint.collectionQualityWarning) throw') < queue.indexOf('const recipeReady ='));
  assert.match(queue, /repair: resumingSavedDraft \|\| !checkpoint.recipeCardQualityWarning/);
  const prepare = createRecipeReadinessService({ generateCard: async () => { throw new Error('Do not buy a card repair for missing ideas'); } });
  const checked = await prepare({ title: '8 Apple drinks', content: result.content, generationCheckpoint: { recipeCollection: result.recipeCollection } });
  assert.equal(checked.success, false, 'The publisher must also reject missing promised ideas');
  assert.match(checked.patch.recipeCardQualityWarning, /Expected numbered ideas 1 through 8/);
  const corrected = await prepare({ title: '8 Apple drinks', content: roundup(), generationCheckpoint: { recipeCollection: result.recipeCollection, collectionQualityWarning: result.collectionQualityWarning } }, { repair: false });
  assert.equal(corrected.success, true, 'Recheck edited content instead of trusting stale warnings');
});

test('saved article text and successful media remain available when a later step fails', async () => {
  const { checkpointArticleDraft } = await import('../src/lib/generationCheckpoint.mjs');
  const saved = checkpointArticleDraft({ id: '1', content: '', featuredImage: 'existing-photo' }, { content: drink, generatedTitle: 'Apple drink', stage: 'recipe-validation' });
  assert.equal(saved.content, drink);
  assert.equal(saved.featuredImage, 'existing-photo');
  assert.equal(saved.generationCheckpoint.content, drink);
  assert.equal(checkpointArticleDraft(saved, { stage: 'paused' }).content, drink);
});

test('an uncertain paid repair timeout is not resubmitted within the same repair run', async () => {
  let calls = 0;
  const prepare = createRecipeReadinessService({ generateCard: async () => {
    calls++;
    const error = new Error('Prediction timed out');
    error.noRetry = true;
    throw error;
  } });
  const content = roundup('<section id="recipe-card"><p>Incomplete recipe</p></section>');
  const result = await prepare({ title: 'Apple drinks', content });
  assert.equal(calls, 1);
  assert.equal(result.success, false);
  assert.equal(result.patch.content, content);
});

test('image-prompt text predictions have enough time to complete without buying replacements', () => {
  const main = fs.readFileSync(require.resolve('../electron/main.js'), 'utf8');
  const source = main.slice(main.indexOf("secureIpcHandle('generate-image-prompts',"), main.indexOf("secureIpcHandle('get-trend-workspace'"));
  assert.doesNotMatch(source, /maxAttempts: 20/);
  assert.equal((source.match(/maxAttempts: 60, intervalMs: 2500/g) || []).length, 2);
});
