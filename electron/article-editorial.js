const { parseDocument } = require('htmlparser2');
const { validateRecipeCard } = require('./recipe-generation');

const READER_RECIPE_GUIDANCE = `READER-FIRST RECIPE EDITORIAL STANDARD:
Deliver the exact dish or number of ideas promised, not a keyword-stuffed headline. Open in 2 short paragraphs with flavor, texture, realistic effort and who the dish suits. Never delay the answer with a personal story or generic introduction.
Explain WHY the technique works using the actual ingredients. Specify ingredient preparation state, pan dimensions or capacity, heat, timing and observable result cues. Use a thermometer where needed for food safety. Keep quantities, yield, temperatures and all time totals consistent between prose and card, including chilling or marinating.
The recipe card must give numeric ingredient quantities (including optional garnishes and ice where practical), positive numeric yield and numeric Prep Time, Cook Time and Total Time with units. Use Cook Time: 0 minutes for no-cook dishes. At least TWO method steps must include a useful timing or observable result cue: for drinks or assembly recipes use dissolved, smooth, frothy, chilled, evenly coated or evenly distributed where accurate, not invented cooking. Raw poultry must reach 165 F (74 C), checked with a food thermometer in the thickest part. Identify previously cooked poultry clearly; reheated poultry also needs a thermometer-verified 165 F (74 C), while cold ready-to-eat poultry must stay refrigerated.
Add concise, recipe-specific sections for ingredient choices and substitutions (amount, effect and limitations), the most likely failure and its prevention/rescue, serving pairings, and make-ahead/storage. Say when a substitution or freezer method is uncertain; never call it tested unless evidence was supplied. For a cold dish, discuss serving and texture rather than inventing reheating directions. Use conservative, dish-appropriate storage guidance; fermentation, preservation and allergies require particular care, not guarantees.
Give useful weights where available, but do not invent precise cup-to-gram conversions. Never invent nutrition, ratings, author credentials, testing, popularity, health benefits or citations. Use only relevant source-backed claims. Do not copy a competitor's prose.
Keep paragraphs short and focused. FAQ is optional and must resolve a new cooking question. End with a relevant invitation to share the recipe or describe their result, not a sales pitch. Do not create nonfunctional print/share buttons, fabricated links or scripts. The app adds recipe navigation. Depth is determined by useful cooking decisions, not repetition to fill a word count.`;

function assessEditorialGaps(content = '') {
  const document = parseDocument(String(content), { decodeEntities: true });
  const paragraphs = [];
  const headings = [];
  const stack = [document];
  const text = (node) => {
    const parts = [], pending = [node];
    while (pending.length) {
      const current = pending.pop();
      if (['script', 'style'].includes(current.name)) continue;
      if (current.type === 'text') parts.push(current.data || '');
      pending.push(...[...(current.children || [])].reverse());
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };
  while (stack.length) {
    const node = stack.pop();
    if (node.name === 'p') paragraphs.push(text(node));
    if (/^h[23]$/.test(node.name || '')) headings.push(text(node));
    stack.push(...[...(node.children || [])].reverse());
  }
  const plain = text(document);
  const issues = [];
  if (headings.length < 3) issues.push('Add useful cooking sections');
  if (!/substitut|swap|alternative|replacement/i.test(plain)) issues.push('Explain a useful substitution and its limits');
  if (!/troubleshoot|avoid|mistake|rescue|too (?:dry|wet|thick|thin)|overcook|undercook/i.test(plain)) issues.push('Explain a likely failure and prevention or rescue');
  if (!/storage|store|refrigerat|freez|make.ahead|best (?:eaten|served)|serve immediately/i.test(plain)) issues.push('Explain dish-appropriate storage or immediate serving');
  if (paragraphs.some((value) => value.split(/\s+/).length > 120)) issues.push('Split long paragraphs');
  if (paragraphs.some((value, index) => value.length > 80 && paragraphs.indexOf(value) !== index)) issues.push('Remove repeated paragraphs');
  if (/\b(?:i|we) (?:tested|personally tried)|\b(?:miracle|detoxes|melts fat)\b/i.test(plain)) issues.push('Remove unsupported experience or health claims');
  return { needsRevision: issues.length > 0, issues, recipeReady: validateRecipeCard(content).ok };
}

module.exports = { READER_RECIPE_GUIDANCE, assessEditorialGaps };
