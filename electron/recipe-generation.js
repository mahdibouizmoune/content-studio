const { parseRecipeCard, durationMinutes, positiveYield } = require('./recipe-card-parser');

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function buildRecipeChunkRanges(itemCount, chunkSize = 5) {
  const count = clampInteger(itemCount, 1, 50, 5);
  const size = clampInteger(chunkSize, 2, 8, 5);
  const ranges = [];
  for (let start = 1; start <= count; start += size) {
    ranges.push({ start, end: Math.min(count, start + size - 1) });
  }
  return ranges;
}

function numberedRecipeHeadingMatches(html = '') {
  const pattern = /<h2\b([^>]*)>\s*(?:<strong\b[^>]*>\s*)?(?:(?:recipe|idea|option)\s*)?#?\s*(\d+)\s*(?:[.):#]\s*|\s+-\s+|\s+)([\s\S]*?)(?:\s*<\/strong>)?\s*<\/h2>/gi;
  return [...String(html).matchAll(pattern)];
}

function extractNumberedH2s(html = '') {
  return numberedRecipeHeadingMatches(html)
    .map((match) => ({
      number: Number(match[2]),
      title: String(match[3]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    }));
}

function extractRecipeSections(html = '') {
  const source = String(html);
  const headings = numberedRecipeHeadingMatches(source);
  return headings.map((heading, index) => {
    const start = heading.index;
    const end = headings[index + 1]?.index ?? source.length;
    return {
      number: Number(heading[2]),
      title: String(heading[3]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      html: source.slice(start, end)
    };
  });
}

function canonicalizeNumberedRecipeHeadings(html = '') {
  return String(html).replace(
    /<h2\b([^>]*)>\s*(?:<strong\b[^>]*>\s*)?(?:(?:recipe|idea|option)\s*)?#?\s*(\d+)\s*(?:[.):#]\s*|\s+-\s+|\s+)([\s\S]*?)(?:\s*<\/strong>)?\s*<\/h2>/gi,
    (_match, attributes, number, title) => `<h2${attributes}>${Number(number)}. ${String(title).trim()}</h2>`
  );
}

function buildRecipeRetryPrompt(prompt = '', validationIssue = '') {
  const issue = String(validationIssue || '').replace(/\s+/g, ' ').trim();
  if (!issue) return String(prompt || '');
  return `${String(prompt || '').trim()}\n\nCORRECTION REQUIRED AFTER VALIDATION:\n${issue}\nReturn the entire requested HTML again, corrected. Preserve every required section and item. Do not explain the correction.`;
}

function listItemsAfterHeading(section = '', heading = '') {
  const headingPattern = new RegExp(
    `<h3\\b[^>]*>\\s*${heading}\\s*:?\\s*<\\/h3>([\\s\\S]*?)(?=<h[23]\\b|$)`,
    'i'
  );
  const block = String(section).match(headingPattern)?.[1] || '';
  return [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => String(match[1]).replace(/<[^>]+>/g, ' ').replace(/&(?:deg|#176|#x0*b0);/gi, '\u00b0').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function validateRecipeChunk(html = '', expectedStart = 1, expectedEnd = 1) {
  const expectedNumbers = [];
  for (let number = expectedStart; number <= expectedEnd; number += 1) expectedNumbers.push(number);
  const sections = extractRecipeSections(html);
  const numbers = sections.map((section) => section.number);
  const issues = [];

  if (numbers.join(',') !== expectedNumbers.join(',')) {
    issues.push(`Expected numbered recipes ${expectedNumbers.join(', ')}, received ${numbers.join(', ') || 'none'}`);
  }

  for (const section of sections) {
    const ingredients = listItemsAfterHeading(section.html, 'Ingredients');
    const instructions = listItemsAfterHeading(section.html, 'Instructions');
    if (!ingredients.length) issues.push(`Recipe ${section.number} needs measured ingredients`);
    if (instructions.length < 3) issues.push(`Recipe ${section.number} needs at least 3 actionable steps`);
    if (!/Prep Time:/i.test(section.html) || !/Total Time:/i.test(section.html) || !/(Servings|Yield):/i.test(section.html)) {
      issues.push(`Recipe ${section.number} is missing prep time, total time, or yield`);
    }
    const checked = validateRecipeCard(`<section id="recipe-card">${section.html}</section>`);
    issues.push(...checked.issues.map((issue) => `Recipe ${section.number}: ${issue}`));
  }

  return { ok: issues.length === 0, issues, sections };
}

function recommendedRecipeCollectionLength(itemCount) {
  const count = clampInteger(itemCount, 3, 50, 5);
  if (count <= 5) return '2200-2800';
  if (count <= 10) return '3000-4000';
  if (count <= 20) return '4500-6000';
  if (count <= 30) return '6500-8500';
  return '8500-12000';
}

function articleLengthMaximum(articleLength = '900-1200') {
  const values = String(articleLength)
    .match(/\d+/g)
    ?.map(Number)
    .filter(Number.isFinite) || [];
  return values.length ? Math.max(...values) : 1200;
}

function usesCompactRecipeCollection(itemCount = 0, articleLength = '900-1200') {
  const count = Math.max(0, Number(itemCount || 0));
  if (count < 6) return false;
  const fullRecipeMinimum = 500 + (count * 170);
  return articleLengthMaximum(articleLength) < fullRecipeMinimum;
}

function validateCompactRecipeCollection(html, itemCount, minimumWords) {
  const numbers = extractNumberedH2s(html).map((heading) => heading.number);
  const expected = Array.from({ length: itemCount }, (_, index) => index + 1);
  const wordCount = String(html).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const structuralIssues = [];
  if (numbers.join(',') !== expected.join(',')) {
    structuralIssues.push(`Expected numbered ideas 1 through ${itemCount}, received ${numbers.join(', ') || 'none'}`);
  }
  if (wordCount < minimumWords) structuralIssues.push(`Compact collection is too short at ${wordCount} words`);
  const issues = [...structuralIssues, ...validateRecipeCard(html).issues];
  return { ok: issues.length === 0, issues, structuralIssues };
}

function validateRecipeCardLegacy(html = '') {
  const card = parseRecipeCard(html);
  const { ingredients, instructions } = card;
  const measuredIngredients = ingredients.filter((ingredient) => (
    /(?:\b\d+(?:[./]\d+)?\b|¼|½|¾|⅓|⅔|⅛|⅜|⅝|⅞|\b(?:pinch|dash|to taste)\b)/i.test(ingredient)
  ));
  const issues = [];
  if (!card.html) issues.push('Recipe card is missing');
  if (card.count > 1) issues.push('Use one primary recipe card, not duplicate recipe-card IDs');
  if (!ingredients.length) issues.push('Recipe card needs measured ingredients');
  if (instructions.length < 3) issues.push('Recipe card needs at least 3 instructions');
  if (ingredients.length && measuredIngredients.length < Math.ceil(ingredients.length * 0.7)) {
    issues.push('Most recipe card ingredients need explicit quantities');
  }
  if (!card.facts['Prep Time'] || !card.facts['Total Time'] || !(card.facts.Servings || card.facts.Yield)) {
    issues.push('Recipe card is missing prep time, total time, or yield');
  }
  return { ok: issues.length === 0, issues, ingredients, instructions };
}

function validateRecipeCard(html = '') {
  const legacy = validateRecipeCardLegacy(html);
  const measuredIngredients = legacy.ingredients.filter((ingredient) => (
    /(?:\b\d+(?:\s+\d+\/\d+|[./]\d+)?\b|\u00bc|\u00bd|\u00be|\u2153|\u2154|\u215b|\u215c|\u215d|\u215e|\b(?:pinch|dash|to taste)\b|^(?:one|two|three|four|five|six|seven|eight|nine|ten|half|quarter)\b)/i.test(ingredient)
  ));
  const instructionCues = legacy.instructions.filter((step) => (
    /(?:\b\d+(?:\s*[-\u2013]\s*\d+)?\s*(?:seconds?|minutes?|mins?|hours?|hrs?|days?|weeks?)\b|\b\d{2,3}\s*(?:\u00b0|degrees?)\s*[cf]\b|until|golden|browned|tender|crisp|thick|set|opaque|bubbling|fragrant|combined|evenly (?:mixed|coated|distributed)|fully (?:coated|incorporated)|smooth|frothy|foamy|dissolved|chilled|coats? (?:a )?spoon|internal temperature)/i.test(step)
  ));
  const issues = legacy.issues
    .filter((item) => item !== 'Most recipe card ingredients need explicit quantities')
    .filter((item) => item !== 'Recipe card is missing prep time, total time, or yield');
  if (legacy.ingredients.length && measuredIngredients.length < Math.ceil(legacy.ingredients.length * 0.7)) {
    issues.push('Most recipe card ingredients need explicit quantities');
  }
  const card = parseRecipeCard(html);
  if (!card.facts['Prep Time'] || !card.facts['Cook Time'] || !card.facts['Total Time'] || !(card.facts.Servings || card.facts.Yield)) {
    issues.push('Recipe card is missing prep time, cook time, total time, or yield');
  }
  if (legacy.instructions.length && instructionCues.length < Math.min(2, legacy.instructions.length)) {
    issues.push('Recipe instructions need timing, temperature, texture, or doneness cues');
  }
  const prep = durationMinutes(card.facts['Prep Time']);
  const cook = durationMinutes(card.facts['Cook Time']);
  const total = durationMinutes(card.facts['Total Time']);
  if (prep === null || cook === null || total === null) issues.push('Recipe times need numeric values and second, minute, hour, day, or week units');
  else if (total < Math.max(prep, cook) || total <= 0) issues.push('Recipe total time contradicts prep or cook time');
  if (!positiveYield(card.facts.Servings || card.facts.Yield)) issues.push('Recipe yield must be a positive number');
  const poultry = legacy.ingredients.filter((item) => /\b(?:chicken|turkey|duck|poultry)\b/i.test(item)
    && !/\b(?:stock|broth|deli|vegan|plant-based)\b/i.test(item));
  // "Smoked" alone does not establish that poultry is fully cooked.
  const prepared = /\b(?:cooked|pre-cooked|precooked|rotisserie|canned|leftover|roasted)\b/i;
  const rawPoultry = poultry.some((item) => /\braw\b/i.test(item) || !prepared.test(item));
  const reheatedPoultry = poultry.length && !rawPoultry && cook > 0
    && legacy.instructions.some((step) => /\b(?:reheat|heat|bake|roast|simmer|cook|microwave|saute)\b/i.test(step));
  const safePoultry = legacy.instructions.some((step) => /(?:\b165\s*(?:\u00b0|degrees?)?\s*F|\b(?:73\.9|74|75)\s*(?:\u00b0|degrees?)?\s*C)/i.test(step)
    && /thermometer|internal|thickest/i.test(step));
  if (rawPoultry && !safePoultry) issues.push('Raw poultry needs a thermometer-verified internal temperature of 165 F (74 C)');
  else if (reheatedPoultry && !safePoultry) issues.push('Reheated poultry needs a thermometer-verified internal temperature of 165 F (74 C)');
  return {
    ok: issues.length === 0,
    issues,
    ingredients: legacy.ingredients,
    instructions: legacy.instructions,
    measuredIngredients,
    instructionCues
  };
}

function replaceRecipeCard(html = '', recipeCard = '') {
  const source = String(html);
  const card = parseRecipeCard(recipeCard).html;
  if (!card) return source;
  const current = parseRecipeCard(source);
  if (current.html) return `${source.slice(0, current.start)}${card}${source.slice(current.end)}`;
  return `${source.trim()}\n${card}`.trim();
}

module.exports = {
  articleLengthMaximum,
  buildRecipeChunkRanges,
  buildRecipeRetryPrompt,
  canonicalizeNumberedRecipeHeadings,
  extractNumberedH2s,
  extractRecipeSections,
  listItemsAfterHeading,
  recommendedRecipeCollectionLength,
  replaceRecipeCard,
  validateRecipeChunk,
  validateCompactRecipeCollection,
  validateRecipeCard,
  usesCompactRecipeCollection
};
