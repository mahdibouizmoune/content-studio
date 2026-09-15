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
    .map((match) => String(match[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
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
    if (ingredients.length < 4) issues.push(`Recipe ${section.number} needs at least 4 measured ingredients`);
    if (instructions.length < 3) issues.push(`Recipe ${section.number} needs at least 3 actionable steps`);
    if (!/Prep Time:/i.test(section.html) || !/Total Time:/i.test(section.html) || !/(Servings|Yield):/i.test(section.html)) {
      issues.push(`Recipe ${section.number} is missing prep time, total time, or yield`);
    }
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

function validateRecipeCardLegacy(html = '') {
  const card = String(html).match(/<section[^>]*id=["']recipe-card["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || '';
  const ingredients = listItemsAfterHeading(card, 'Ingredients');
  const instructions = listItemsAfterHeading(card, 'Instructions');
  const measuredIngredients = ingredients.filter((ingredient) => (
    /(?:\b\d+(?:[./]\d+)?\b|¼|½|¾|⅓|⅔|⅛|⅜|⅝|⅞|\b(?:pinch|dash|to taste)\b)/i.test(ingredient)
  ));
  const issues = [];
  if (!card) issues.push('Recipe card is missing');
  if (ingredients.length < 4) issues.push('Recipe card needs at least 4 ingredients');
  if (instructions.length < 3) issues.push('Recipe card needs at least 3 instructions');
  if (ingredients.length && measuredIngredients.length < Math.ceil(ingredients.length * 0.7)) {
    issues.push('Most recipe card ingredients need explicit quantities');
  }
  if (!/Prep Time:/i.test(card) || !/Total Time:/i.test(card) || !/(Servings|Yield):/i.test(card)) {
    issues.push('Recipe card is missing prep time, total time, or yield');
  }
  return { ok: issues.length === 0, issues, ingredients, instructions };
}

function validateRecipeCard(html = '') {
  const legacy = validateRecipeCardLegacy(html);
  const measuredIngredients = legacy.ingredients.filter((ingredient) => (
    /(?:\b\d+(?:\s+\d+\/\d+|[./]\d+)?\b|\u00bc|\u00bd|\u00be|\u2153|\u2154|\u215b|\u215c|\u215d|\u215e|\b(?:pinch|dash|to taste)\b)/i.test(ingredient)
  ));
  const instructionCues = legacy.instructions.filter((step) => (
    /(?:\b\d+(?:\s*-\s*\d+)?\s*(?:seconds?|minutes?|mins?|hours?|hrs?)\b|\b\d{2,3}\s*(?:\u00b0|degrees?)\s*[cf]\b|until|golden|browned|tender|crisp|thick|set|opaque|bubbling|fragrant|coats? (?:a )?spoon|internal temperature)/i.test(step)
  ));
  const issues = legacy.issues
    .filter((item) => item !== 'Most recipe card ingredients need explicit quantities')
    .filter((item) => item !== 'Recipe card is missing prep time, total time, or yield');
  if (legacy.ingredients.length && measuredIngredients.length < Math.ceil(legacy.ingredients.length * 0.7)) {
    issues.push('Most recipe card ingredients need explicit quantities');
  }
  const card = String(html).match(/<section[^>]*id=["']recipe-card["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || '';
  if (!/Prep Time:/i.test(card) || !/Cook Time:/i.test(card) || !/Total Time:/i.test(card) || !/(Servings|Yield):/i.test(card)) {
    issues.push('Recipe card is missing prep time, cook time, total time, or yield');
  }
  if (legacy.instructions.length && instructionCues.length < Math.min(2, legacy.instructions.length)) {
    issues.push('Recipe instructions need timing, temperature, texture, or doneness cues');
  }
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
  const card = String(recipeCard).match(/<section[^>]*id=["']recipe-card["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || '';
  if (!card) return source;
  if (/<section[^>]*id=["']recipe-card["'][^>]*>[\s\S]*?<\/section>/i.test(source)) {
    return source.replace(/<section[^>]*id=["']recipe-card["'][^>]*>[\s\S]*?<\/section>/i, card);
  }
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
  validateRecipeCard,
  usesCompactRecipeCollection
};
