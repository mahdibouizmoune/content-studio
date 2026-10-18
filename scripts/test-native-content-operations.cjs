const assert = require('node:assert/strict');
const path = require('node:path');

async function main() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const browser = await chromium.connectOverCDP(process.argv[2]);
  try {
    const page = browser.contexts()[0].pages()[0]; page.setDefaultTimeout(60000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => Boolean(window.electronAPI));
    const result = await page.evaluate(async () => {
      const api = window.electronAPI, articles = await api.getArticles();
      if (articles.length !== 3 || articles.some(a => !a.id.startsWith('design-native-'))) throw new Error('Run only after the isolated native design test.');
      const a = articles[0];
      const recipe = '<section id="recipe-card"><h2>Lemon Rice</h2><p>Prep Time: 5 minutes; Cook Time: 15 minutes; Total Time: 20 minutes; Servings: 4</p><h3>Ingredients</h3><ul><li>1 cup rice</li><li>2 cups water</li><li>1 tbsp lemon juice</li></ul><h3>Instructions</h3><ol><li>Combine rice and water in a saucepan.</li><li>Simmer for 15 minutes until rice is tender.</li><li>Stir in lemon juice until evenly combined.</li></ol></section>';
      await api.saveArticle({ ...a, content: recipe, wordpressPostUrl: 'https://recipe.example/rice', workflowStatus: 'approved' });
      const call = async (action, params) => { const r = await api.qualityWorkspace(`content:${action}`, params); if (!r.success) throw new Error(r.error); return r.result; };
      const opened = await call('recipe-open', { articleId: a.id });
      await call('recipe-save', { articleId: a.id, sourceHash: opened.sourceHash, recipes: opened.recipes.map(r => ({ ...r, name: 'Native Revised Rice' })) });
      const version = await call('style-save', { styleId: 'custom-july-original-ai', name: 'Native Light Candidate', prompt: 'Natural daylight and true recipe texture.' });
      await api.savePinCreatorPins([{ id: 'normal-native-pin', articleId: a.id, url: 'https://recipe.example/rice', title: 'Normal recipe Pin', status: 'loaded' }]);
      const { pin } = await call('benchmark-queue', { articleId: a.id, versionId: version.id });
      const saved = await api.getPinCreatorPins();
      await api.savePinCreatorPins(saved.pins.map(p => ({ ...p, promptImageSourceMode: 'generate-new', promptTextRenderMode: 'ai' })));
      const roundtrip = (await api.getPinCreatorPins()).pins.find(p => p.id === pin.id);
      const prompt = await api.generatePrompt(pin.url, [], 'custom-july-original-ai', `native-prompt-${pin.id}`, { promptLabVersionId: version.id, recipe: pin.sourceSnapshot.recipe, title: pin.title });
      return { articleId: a.id, version, roundtrip, prompt, snapshot: await call('snapshot') };
    });
    assert.equal(result.roundtrip.promptLabVersionId, result.version.id);
    assert.equal(result.roundtrip.promptLabPromptHash, result.version.promptHash);
    assert.equal(result.roundtrip.promptStyle, 'custom-july-original-ai');
    assert.equal(result.roundtrip.promptImageSourceMode, 'generate-new'); assert.equal(result.roundtrip.promptTextRenderMode, 'ai');
    assert.equal(result.prompt.success, true); assert.match(result.prompt.prompt, /Natural daylight/);
    assert.equal(result.snapshot.spending.length, 0);
    assert.equal(result.snapshot.pipeline.find(a => a.id === result.articleId).sourceState, 'source-changed');
    const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    await nav.getByRole('button', { name: 'Content Pipeline', exact: true }).click();
    await page.getByRole('heading', { name: 'Content Pipeline', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Recipes', exact: true }).click();
    await page.getByLabel('Saved article', { exact: true }).selectOption(result.articleId);
    await page.getByLabel('Recipe 1 name', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Recipe 1 name', { exact: true }).inputValue(), 'Native Revised Rice');
    await page.getByRole('tab', { name: 'Prompt Lab', exact: true }).click();
    await page.getByLabel('Benchmark version', { exact: true }).selectOption(result.version.id);
    await page.screenshot({ path: path.resolve('artifacts/native-content-prompt-lab-dark.png') });
    await nav.getByRole('button', { name: 'Pinterest', exact: true }).click();
    await page.getByRole('heading', { name: 'Pin Creator', exact: true }).waitFor();
    await nav.getByRole('button', { name: 'Content Pipeline', exact: true }).click();
    await page.getByRole('heading', { name: 'Content Pipeline', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Benchmark version', { exact: true }).inputValue(), result.version.id, 'The visited screen stays mounted.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.deepEqual(errors, []);
    console.log('Packaged Content Pipeline passed: real IPC, recipe revisions, preserved default style, immutable versions, benchmark metadata storage, local prompt generation with zero spending, screen persistence and dark layout.');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
