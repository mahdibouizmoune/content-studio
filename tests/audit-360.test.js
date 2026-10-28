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

test('Meta 4:5 images fit the whole Pin over a blurred copy so headline and button are never cut', async () => {
  const sharp = require('sharp');
  const { renderMetaPortrait } = require('../electron/meta-portrait');
  const band = (top, height, background) => ({ input: { create: { width: 1080, height, channels: 3, background } }, top, left: 0 });
  // A 1080 x 1920 Pin: red headline band at the very top, blue button band at the very bottom.
  const pin = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: { r: 0, g: 200, b: 0 } } })
    .composite([band(0, 120, { r: 220, g: 0, b: 0 }), band(1800, 120, { r: 0, g: 0, b: 220 })]).png().toBuffer();
  const output = await renderMetaPortrait(sharp, pin, { width: 1080, height: 1350 });
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1080); assert.equal(info.height, 1350);
  const pixel = (x, y) => { const i = (y * info.width + x) * info.channels; return { r: data[i], g: data[i + 1], b: data[i + 2] }; };
  assert.ok(pixel(540, 20).r > 150 && pixel(540, 20).g < 80, 'headline band survives at the top');
  assert.ok(pixel(540, 1330).b > 150 && pixel(540, 1330).g < 80, 'button band survives at the bottom');
  assert.ok(pixel(540, 675).g > 150, 'subject stays centred');
  // The full Pin is scaled to ~759 px wide; the side bands are the softened, dimmed copy.
  assert.ok(pixel(60, 675).g < 190, 'side bands are the dimmed background copy');
});

test('timed-out Pin text predictions are never resubmitted automatically', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const start = source.indexOf('async function generatePinAIContent');
  const block = source.slice(start, source.indexOf('function parsePinStyle', start));
  assert.ok(start > 0 && block.length > 0);
  assert.doesNotMatch(block, /retrying|attempt < retries|for \(let attempt/);
});

test('publish-time recipe schema keeps editor fields and never carries ratings or nutrition', () => {
  const { validatedRecipeSchema } = require('../electron/article-recipe-readiness');
  const content = renderRecipes([rice]);
  const previous = { '@context': 'https://schema.org', '@type': 'Recipe', name: 'Old', description: 'Bright lemon rice for weeknights.', author: { '@type': 'Person', name: 'Sam' }, datePublished: '2026-10-01', keywords: 'lemon rice', recipeCategory: 'Side dish', aggregateRating: { ratingValue: 5 }, nutrition: { calories: '100' } };
  const schema = JSON.parse(validatedRecipeSchema({ title: 'Lemon Rice', structuredData: JSON.stringify(previous), featuredImageRemoteUrl: 'https://example.com/rice.jpg' }, content));
  assert.equal(schema.name, 'Lemon Rice');
  assert.deepEqual(schema.author, previous.author);
  assert.equal(schema.datePublished, '2026-10-01');
  assert.equal(schema.recipeCategory, 'Side dish');
  assert.equal(schema.description, previous.description);
  assert.equal(schema.aggregateRating, undefined); assert.equal(schema.nutrition, undefined);
  assert.equal(schema.totalTime, 'PT30M'); assert.deepEqual(schema.image, ['https://example.com/rice.jpg']);
  assert.equal(schema.recipeIngredient.length, 4);
  // Temporary provider URLs are not durable recipe images.
  assert.equal(JSON.parse(validatedRecipeSchema({ title: 'Lemon Rice', featuredImageRemoteUrl: 'https://replicate.delivery/x.jpg' }, content)).image, undefined);
});

test('complete recipe collections publish one Recipe per visible recipe', () => {
  const { validatedRecipeSchema } = require('../electron/article-recipe-readiness');
  const safeChicken = { ...rawChicken, instructions: [...rawChicken.instructions.slice(0, 2), 'Bake 30 minutes until a thermometer in the thickest part reads 165 F (74 C).'] };
  const schema = JSON.parse(validatedRecipeSchema({ title: '2 Easy Dinners', recipeCollection: { depth: 'complete-recipes', itemCount: 2 }, featuredImageRemoteUrl: 'https://example.com/hero.jpg' }, renderRecipes([rice, safeChicken])));
  assert.equal(schema['@graph'].length, 2);
  assert.deepEqual(schema['@graph'].map((r) => r['@type']), ['Recipe', 'Recipe']);
  assert.match(schema['@graph'][1].name, /Chicken Bake/);
  assert.equal(schema['@graph'][1].recipeIngredient.length, 3);
  assert.doesNotMatch(JSON.stringify(schema), /PTnullM|PTNaNM/);
});

test('recipe microdata is stripped so JSON-LD is the single recipe entity', () => {
  const { stripRecipeMicrodata } = require('../electron/article-recipe-readiness');
  const html = '<section id="recipe-card" class="recipe-card" itemscope itemtype="https://schema.org/Recipe"><h2 itemprop="name">Rice</h2><ul itemprop="recipeIngredient"><li>1 cup rice</li></ul></section>';
  assert.equal(stripRecipeMicrodata(html), '<section id="recipe-card" class="recipe-card"><h2>Rice</h2><ul><li>1 cup rice</li></ul></section>');
});

test('AI-written recipes need a review matching the current recipe before recipe data is published', () => {
  const { recipeReviewHash, recipeSchemaNeedsReview } = require('../electron/article-recipe-readiness');
  const content = renderRecipes([rice]);
  const generated = { content, generationCheckpoint: { content } };
  assert.equal(recipeSchemaNeedsReview(generated), true);
  const reviewed = { ...generated, recipeReview: { hash: recipeReviewHash(content) } };
  assert.equal(recipeSchemaNeedsReview(reviewed), false);
  const edited = renderRecipes([{ ...rice, ingredients: ['2 cups rice', ...rice.ingredients.slice(1)] }]);
  assert.equal(recipeSchemaNeedsReview({ ...reviewed, content: edited }), true, 'editing the recipe requires a new review');
  assert.equal(recipeSchemaNeedsReview({ content }), false, 'hand-written or imported recipes are not held');
});

test('GHL blocks a second post with the same caption on the same platform within 14 days', () => {
  const { findLogicalGhlDuplicate } = require('../electron/ghl-dedupe');
  const caption = 'Bright, garlicky lemon rice that is ready in 30 minutes. #LemonRice #EasyDinner';
  const receipts = [{ platform: 'Facebook', locationId: 'loc', caption, scheduleDate: '2026-10-28T09:00:00Z', status: 'scheduled', postId: 'p1' }];
  const again = { platform: 'facebook', locationId: 'loc', caption: `${caption} #WeeknightMeals`, scheduleDate: '2026-10-30T18:00:00Z' };
  assert.equal(findLogicalGhlDuplicate(receipts, again)?.postId, 'p1');
  assert.equal(findLogicalGhlDuplicate(receipts, { ...again, platform: 'Instagram' }), null);
  assert.equal(findLogicalGhlDuplicate(receipts, { ...again, scheduleDate: '2026-12-01T09:00:00Z' }), null);
  assert.equal(findLogicalGhlDuplicate([{ ...receipts[0], status: 'failed' }], again), null);
  assert.equal(findLogicalGhlDuplicate(receipts, { ...again, caption: 'A completely different caption about roasted carrots and honey.' }), null);
});

test('non-food listicles skip recipe cards, repair and recipe data', async () => {
  const { isNonFoodArticle } = require('../electron/article-recipe-readiness');
  assert.equal(isNonFoodArticle({ category: 'homedecor' }), true);
  assert.equal(isNonFoodArticle({}, { articleType: 'listicle', listicleCategory: 'fashion' }), true);
  assert.equal(isNonFoodArticle({}, { articleType: 'article', listicleCategory: 'homedecor' }), false, 'a single recipe article is not reclassified by the global listicle setting');
  assert.equal(isNonFoodArticle({ category: 'food' }), false);
  const prepare = createRecipeReadinessService({ generateCard: async () => assert.fail('no paid recipe repair for decor') });
  const result = await prepare({ id: 'd', category: 'homedecor', title: '12 Cozy Fall Porch Ideas', content: `<h2>1. Pumpkins</h2><p>${'Stack pumpkins by the door. '.repeat(10)}</p>` });
  assert.equal(result.success, true); assert.equal(result.skipped, 'non-food');
  assert.equal(result.patch.recipeCardEnabled, false); assert.equal(result.patch.structuredData, '');
});

test('long Pin headlines are re-wrapped to stay inside the image and QA checks horizontal bounds', () => {
  const path = require('node:path');
  const { buildOverlaySvg } = require('../electron/pinterest-overlay');
  const fontsDir = path.join(__dirname, '..', 'electron', 'assets', 'fonts');
  const text = "Grandma's Creamy Parmesan Spinach Stuffed Shells Casserole With Garlic Bread Crumbs";
  for (const pinStyle of ['ingredient-closeup', 'custom-july-original-ai', 'modern-recipe-magazine', '']) {
    const overlay = buildOverlaySvg({ text, placement: 'middle', font: 'serif-sans', fontsDir, pinStyle, variant: pinStyle ? 'generated' : 'reuse' });
    assert.equal(overlay.textWithinBounds, true, pinStyle);
    assert.ok(overlay.maxLineWidth <= 1080 - 120, `${pinStyle}: ${overlay.maxLineWidth}`);
    assert.equal(overlay.lines.join(' ').replace(/\s+/g, ' ').toLowerCase(), text.replace(/[*_`#"]/g, '').toLowerCase().slice(0, 100), 'no words dropped');
  }
  // Normal headlines keep the established layout.
  const normal = buildOverlaySvg({ text: 'Easy Garlic Butter Shrimp', placement: 'middle', font: 'serif-sans', fontsDir });
  assert.equal(normal.textWithinBounds, true);
  assert.ok(normal.lines.length <= 3);
});

test('Pin headlines never draw missing-glyph boxes: unsupported letters fall back and emoji are dropped', () => {
  const path = require('node:path');
  const opentype = require('opentype.js');
  const { buildOverlaySvg } = require('../electron/pinterest-overlay');
  const fontsDir = path.join(__dirname, '..', 'electron', 'assets', 'fonts');
  for (const font of ['serif-sans', 'groovy', 'poppins', 'food-editorial']) {
    const overlay = buildOverlaySvg({ text: 'Crème Brûlée Déjà Vu 🍮 Treat', placement: 'middle', font, fontsDir });
    assert.deepEqual(overlay.missingGlyphs, [], font);
    assert.doesNotMatch(overlay.lines.join(' '), /\u{1F36E}/u, font);
    assert.match(overlay.lines.join(' ').toLowerCase(), /crème brûlée/, font);
  }
  assert.ok(opentype.loadSync(path.join(fontsDir, 'Montserrat-Bold.ttf')).charToGlyphIndex('é') > 0, 'fallback font covers accents');
});

test('Meta checks catch more engagement bait on every Facebook and Instagram field', async () => {
  const { scoreMetaContent } = await import('../src/lib/metaQuality.mjs');
  const base = { facebook: { primaryPost: 'A calm weeknight dinner idea with lemon, garlic and rice that comes together in thirty minutes for the whole family. What would you serve with it?', cta: 'Send us a message for the recipe' }, instagram: { feedCaption: 'Thirty-minute lemon rice for busy nights and easy lunches\n\nBright, simple and ready fast.', cta: 'Save it for later' } };
  const check = (content, id) => scoreMetaContent(content).checks.find((c) => c.id === id).passed;
  assert.equal(check(base, 'fb-bait'), true); assert.equal(check(base, 'ig-bait'), true);
  for (const bait of ['Comment RECIPE below and we will send it', "DM us 'PASTA' for the recipe", 'Drop a ❤️ if you love rice', 'Share with someone who needs dinner ideas', 'Double tap if you agree']) {
    assert.equal(check({ ...base, facebook: { ...base.facebook, shortPost: bait } }, 'fb-bait'), false, bait);
    assert.equal(check({ ...base, instagram: { ...base.instagram, reelCaption: bait } }, 'ig-bait'), false, bait);
  }
});

test('Meta link stripping removes bare domains but keeps ordinary text', () => {
  const { withoutArticleLinks } = require('../electron/meta-captions');
  const cleaned = withoutArticleLinks('Get it at myblog.com/pasta or www.gourmetgather.com today. Use 3.5 cups stock, e.g. homemade.');
  assert.doesNotMatch(cleaned, /myblog\.com|gourmetgather\.com|www\./);
  assert.match(cleaned, /3\.5 cups stock, e\.g\. homemade\./);
});

test('automatic Meta copy is platform-distinct, asks a natural question and keeps accents in hashtags', async () => {
  const { scoreMetaContent } = await import('../src/lib/metaQuality.mjs');
  const { automaticMetaContent } = require('../electron/meta-auto-pack');
  const article = { title: 'Crème Brûlée Rice Pudding', metaDescription: 'A creamy baked rice pudding with a crackly caramel top, made with pantry staples and ready for a cozy dessert night.', content: renderRecipes([rice]) };
  const content = automaticMetaContent(article, {});
  const result = scoreMetaContent(content, { imageAssets: [{ publicUrl: 'https://images.example/p.jpg' }] });
  assert.equal(result.checks.find((c) => c.id === 'platform-distinct').passed, true);
  assert.equal(result.checks.find((c) => c.id === 'fb-question').passed, true);
  assert.ok(content.instagram.hashtags.includes('#CremeBruleeRicePudding'), content.instagram.hashtags.join(' '));
  assert.ok(content.instagram.hashtags.every((tag) => /^#[A-Za-z0-9]+$/.test(tag)));
});

test('a post whose featured image failed to upload is saved as a draft and keeps its existing image', () => {
  const now = Date.parse('2026-10-28T09:00:00Z');
  const deferred = buildWordPressPostPayload({ article: { title: 'Soup', publishStatusOverride: 'future', scheduledAt: '2026-11-01T09:00:00Z' }, featuredMediaId: null, featuredImageDeferred: true, now });
  assert.equal(deferred.status, 'draft');
  assert.equal(deferred.payload.date_gmt, undefined);
  assert.equal('featured_media' in deferred.payload, false, 'an update must not clear the current featured image');
  const normal = buildWordPressPostPayload({ article: { title: 'Soup' }, featuredMediaId: 12, now });
  assert.equal(normal.status, 'publish'); assert.equal(normal.payload.featured_media, 12);
});

test('Rank Math canonical follows the current public permalink and Open Graph fields are separate', () => {
  const { rankMathMetaFromArticle, rankMathSocialMeta } = require('../electron/rank-math-meta');
  const stale = { title: 'Soup', canonicalUrl: 'https://old-site.example/soup/', openGraphTitle: 'Soup night', openGraphDescription: 'Warm soup.' };
  assert.equal(rankMathMetaFromArticle(stale, { postLink: 'https://new.example/soup/' }).rank_math_canonical_url, 'https://new.example/soup/');
  assert.equal(rankMathMetaFromArticle(stale, {}).rank_math_canonical_url, undefined, 'drafts leave the canonical to Rank Math');
  assert.equal(rankMathMetaFromArticle({ ...stale, canonicalUrlManual: true }, { postLink: 'https://new.example/soup/' }).rank_math_canonical_url, stale.canonicalUrl);
  assert.deepEqual(rankMathSocialMeta(stale, { imageUrl: 'https://new.example/soup.jpg' }), { rank_math_facebook_title: 'Soup night', rank_math_facebook_description: 'Warm soup.', rank_math_facebook_image: 'https://new.example/soup.jpg' });
});

test('generated H1s become H2s, user slugs are transliterated and image alt text names the dish once', async () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const vm = require('node:vm');
  const slugStart = source.indexOf('function wordpressArticleSlug');
  const context = vm.createContext({ toAscii: require('../electron/ascii.js').toAscii });
  vm.runInContext(source.slice(slugStart, source.indexOf('\n}\n', slugStart) + 2), context);
  assert.equal(context.wordpressArticleSlug({ slug: 'Crème-Brûlée Pudding' }), 'creme-brulee-pudding');
  const cleanStart = source.indexOf('  function cleanArticleOutput');
  vm.runInContext(source.slice(cleanStart, source.indexOf('\n  }\n', cleanStart) + 4), context);
  assert.equal(context.cleanArticleOutput('<h1 class="t">Lemon Rice</h1><p>Hi</p>'), '<h2 class="t">Lemon Rice</h2><p>Hi</p>');
  const { buildSeoImageAlt } = await import('../src/lib/articlePostProcess.mjs');
  const alt = buildSeoImageAlt({ title: 'Easy Chicken Soup Recipe', seoBrief: { targetKeyword: 'easy chicken soup' } }, {}, 0, 'featured');
  assert.doesNotMatch(alt, /recipe recipe/i);
  assert.equal((alt.match(/chicken soup/gi) || []).length, 1);
});

test('doneness cues need real cues and numbered tips are not mistaken for recipes', () => {
  const { validateRecipeCard } = require('../electron/recipe-generation');
  const { recipeUnits } = require('../electron/recipe-units');
  const weak = renderRecipes([{ ...rice, instructions: ['Mix the rice and lemon together.', 'Set aside.', 'Serve in the thickest bowls you have.'] }]);
  assert.ok(validateRecipeCard(weak).issues.some((issue) => /cue|doneness|timing/i.test(issue)), validateRecipeCard(weak).issues.join('; '));
  const single = `<h2>3 Common Mistakes</h2><p>Do not overcook.</p><h2>5 Ways to Serve</h2><p>With salad.</p>${renderRecipes([rice])}`;
  assert.equal(recipeUnits(single).length, 1);
});

test('topic overlap catches a short title inside a longer one without flagging different dishes', async () => {
  const { detectCannibalization } = await import('../electron/article-intake.mjs');
  assert.ok(detectCannibalization('Easy Chicken Soup', [{ title: 'Easy Creamy Chicken Soup Recipe For Busy Weeknights' }]).length > 0);
  assert.equal(detectCannibalization('Easy Beef Stew', [{ title: 'Easy Chicken Soup' }]).length, 0);
  assert.equal(detectCannibalization('chicken chicken chicken', [{ title: 'chicken apple ginger rice soup' }]).length, 0);
});

test('Job Center opens cluster, research, quality and Recipe Money Maker jobs on their own screens', () => {
  const { createJobCenter } = require('../electron/job-center');
  const data = new Map();
  const jobs = createJobCenter({ store: { get: (k, f) => data.get(k) ?? f, set: (k, v) => data.set(k, v) } });
  const workspace = (id) => jobs.start(id).workspace;
  assert.equal(workspace('pinterest-clusters-1'), 'cluster-planner');
  assert.equal(workspace('keyword-research-1'), 'trends');
  assert.equal(workspace('rmm-generate-1'), 'recipe-money-maker');
  assert.equal(workspace('article:1:generate'), 'articles');
  assert.equal(workspace('pin-asset-1'), 'pin-creator');
});

test('AI JSON parsing accepts arrays wrapped in prose and reports cut-off JSON clearly', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const vm = require('node:vm');
  const start = source.indexOf('function safeJsonParse(');
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, source.indexOf('\nfunction arrayValue(', start)), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.safeJsonParse('Here you go:\n[{"id":"a","title":"Soup"}]\nDone.'))), [{ id: 'a', title: 'Soup' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(context.safeJsonParse('```json\n{"a":1}\n```'))), { a: 1 });
  assert.throws(() => context.safeJsonParse('{"clusters": [{"name": "Soup"'), /did not return JSON|incomplete/);
  assert.throws(() => context.safeJsonParse('{"clusters": [1, 2'), /incomplete|did not return/);
});

test('cost estimates count collection parts and both Pin text calls', async () => {
  const { calculateEstimatedCost } = require('../electron/cost-estimation');
  const single = calculateEstimatedCost({ articleCount: 1, settings: { aiModel: 'gpt5nano', affiliateEnabled: false } });
  const collection = calculateEstimatedCost({ articleCount: 1, settings: { aiModel: 'gpt5nano', affiliateEnabled: false, articleType: 'listicle', listicleCategory: 'food', listicleItemCount: 15 } });
  assert.equal(collection.breakdown.textCallsPerArticle - single.breakdown.textCallsPerArticle, 4, '15 recipes: three parts plus intro and ending');
  const { estimatePinterestPackCost } = await import('../src/lib/pinterestCost.mjs');
  const pins = estimatePinterestPackCost({ pinCount: 10, imageSourceMode: 'reuse-article', imageModel: 'ideogram' });
  assert.equal(pins.textCallsPerPin, 2);
  assert.equal(pins.textCost, 0.06);
});

test('page and article text sent to the AI is marked as data, and decor prompts no longer ask for an H1', async () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  assert.doesNotMatch(source, /`Verified (?:ingredients|recipe name|recipe facts):/);
  assert.match(source, /<<<SOURCE\n\$\{JSON\.stringify\(source\)\}\nSOURCE>>>/);
  assert.match(source, /<<<ARTICLE\n\$\{articleText\}\nARTICLE>>>/);
  const prompts = await import('../src/prompts.js');
  for (const prompt of [prompts.LISTICLE_HOMEDECOR_PROMPT, prompts.LISTICLE_FASHION_PROMPT]) {
    assert.doesNotMatch(prompt, /1\. <h1>|approximately 1500 words/);
  }
});

test('video requests reject unknown models, unsupported ratios and local start images before any paid call', async () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'electron', 'main.js'), 'utf8');
  const vm = require('node:vm');
  const start = source.indexOf('const VIDEO_MODEL_RATIOS');
  let handler;
  const context = vm.createContext({ secureIpcHandle: (_channel, fn) => { handler = fn; }, resolveReplicateApiToken: () => 'token', VIDEO_MODEL_CONFIGS: { 'pruna-p-video': {} }, AbortController, activeJobs: new Map(), replicateRequest: async () => assert.fail('no paid request') });
  vm.runInContext(source.slice(start, source.indexOf('const controller = new AbortController();', start)) + '});', context);
  const run = (params) => handler({}, { prompt: 'A slow pour of honey over pancakes', ...params });
  assert.match((await run({ model: 'made-up' })).error, /Unknown video model/);
  assert.match((await run({ model: 'pruna-p-video', aspectRatio: '3:4' })).error, /accepts 1:1, 16:9, 9:16/);
  assert.match((await run({ model: 'pruna-p-video', aspectRatio: '9:16', image: 'C:/pics/pancakes.jpg' })).error, /public https/);
});
