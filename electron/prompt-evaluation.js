'use strict';
const { createHash } = require('node:crypto');
const { inspectRecipe } = require('./recipe-quality');
const EVALUATION_CASES = Object.freeze([
  ['poultry', 'Chicken dinner', 'Raw poultry needs thermometer guidance.'],
  ['fish', 'Fish dinner', 'Keep the named fish and preparation accurate.'],
  ['beans', 'Bean soup', 'State cooked versus dry beans and practical timing.'],
  ['pasta', 'Pasta dish', 'Include liquid amounts and doneness cues.'],
  ['baking', 'Baked dessert', 'Check yield, pan size and bake cues.'],
  ['no-cook', 'No-cook snack', 'Do not invent a cooking step.'],
  ['drink', 'Cold drink', 'Use numeric yield and measured ingredients.'],
  ['salad', 'Salad', 'Include dressing quantities and serving guidance.'],
  ['slow-cooker', 'Slow cooker', 'Include passive cooking time.'],
  ['fermentation', 'Fermented drink', 'Review equipment, hygiene and storage manually.'],
  ['vegetarian', 'Vegetarian main', 'Preserve dietary accuracy.'],
  ['breakfast', 'Breakfast', 'Check portion and preparation consistency.'],
  ['roundup', 'Complete recipe roundup', 'Review every recipe, not only the first.'],
  ['compact', 'Compact collection', 'Keep the primary recipe and idea list distinct.'],
  ['long-headline', 'Long recipe name', 'Inspect small-screen type and cropping.']
].map(([id, name, review]) => Object.freeze({ id, name, review })));
const hash = value => createHash('sha256').update(value || '').digest('hex');
function evaluateSavedOutputs(assignments, articles, pins, reportCache = new Map()) {
  return EVALUATION_CASES.map(testCase => {
    const assignment = assignments.find(a => a.caseId === testCase.id);
    const article = articles.find(a => a.id === assignment?.articleId);
    const pin = pins.find(p => p.id === assignment?.pinId);
    if (!article) return { ...testCase, status: 'unassigned' };
    const qa = pin?.imageQa || {};
    const sourceHash = hash(article.content);
    if (!reportCache.has(sourceHash)) { if (reportCache.size >= 2000) reportCache.clear(); reportCache.set(sourceHash, inspectRecipe(article)); }
    const report = reportCache.get(sourceHash);
    const sameSource = pin?.promptLabSourceHash === sourceHash;
    const checked = qa.sha256 && qa.visualReview?.imageSha256 === qa.sha256 && qa.visualReview?.status === 'reviewed';
    return { ...testCase, articleId: article.id, pinId: pin?.id || '', sourceHash, imageHash: qa.sha256 || '',
      recipeStatus: report.status, recipeIssues: report.issues.map(i => i.message),
      sourceCurrent: Boolean(sameSource), textStatus: qa.sha256 && qa.textCheck?.imageSha256 === qa.sha256 ? qa.textCheck.status : 'unchecked',
      visualStatus: checked ? 'human-reviewed' : 'unchecked',
      status: report.status === 'needs-repair' ? 'needs-repair' : !sameSource ? 'missing-or-stale-pin' : checked ? 'reviewed-not-cook-tested' : 'needs-visual-review' };
  });
}
module.exports = { EVALUATION_CASES, evaluateSavedOutputs };
