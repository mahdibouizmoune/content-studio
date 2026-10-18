const { parseDocument } = require('htmlparser2');

function descendants(node) {
  const result = [];
  const stack = [...(node.children || [])].reverse();
  while (stack.length) {
    const child = stack.pop();
    result.push(child);
    for (let index = (child.children || []).length - 1; index >= 0; index--) stack.push(child.children[index]);
  }
  return result;
}

function text(node) {
  const parts = [];
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (['script', 'style'].includes(current.name)) continue;
    if (current.type === 'text') parts.push(current.data || '');
    for (let index = (current.children || []).length - 1; index >= 0; index--) stack.push(current.children[index]);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function parseRecipeCard(html = '') {
  const source = String(html);
  const document = parseDocument(source, { decodeEntities: true, withStartIndices: true, withEndIndices: true });
  const cards = descendants(document).filter((node) => node.attribs?.id === 'recipe-card');
  const card = cards[0];
  const nodes = card ? descendants(card) : [];
  const list = (heading) => {
    const start = nodes.findIndex((node) => /^h[2-4]$/.test(node.name || '') && heading.test(text(node).replace(/:\s*$/, '')));
    if (start < 0) return [];
    const end = nodes.findIndex((node, index) => index > start && /^h[2-4]$/.test(node.name || ''));
    return nodes.slice(start + 1, end < 0 ? undefined : end).filter((node) => node.name === 'li' && node.parent?.name !== 'li').map(text).filter(Boolean);
  };
  const plain = card ? text(card) : '';
  const facts = {};
  for (const label of ['Prep Time', 'Cook Time', 'Total Time', 'Servings', 'Yield']) {
    facts[label] = plain.match(new RegExp(`${label}\\s*:\\s*(.*?)(?=Prep Time\\s*:|Cook Time\\s*:|Total Time\\s*:|Servings\\s*:|Yield\\s*:|Ingredients|Instructions|Directions|Method|$)`, 'i'))?.[1]?.trim() || '';
  }
  return {
    name: text(nodes.find((node) => node.attribs?.itemprop?.split(/\s+/).includes('name')) || { children: [] }),
    html: card ? source.slice(card.startIndex, card.endIndex + 1) : '',
    start: card?.startIndex, end: card ? card.endIndex + 1 : undefined, count: cards.length,
    ingredients: list(/^ingredients$/i), instructions: list(/^(instructions|directions|method)$/i), facts, plain
  };
}

function durationMinutes(value = '') {
  const values = [...String(value).matchAll(/(\d+(?:\.\d+)?)(?:\s*[-\u2013]\s*(\d+(?:\.\d+)?))?\s*(weeks?|days?|hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi)];
  if (!values.length || /^\s*-/.test(String(value))) return null;
  return values.reduce((sum, match) => sum + Number(match[2] || match[1]) * (/^w/i.test(match[3]) ? 10080 : /^d/i.test(match[3]) ? 1440 : /^h/i.test(match[3]) ? 60 : /^s/i.test(match[3]) ? 1 / 60 : 1), 0);
}

function positiveYield(value = '') {
  const match = String(value).match(/^(?:(?:about|approximately|approx\.?|makes)\s+)?(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?/i);
  return Boolean(match && Number(match[1]) > 0 && (!match[2] || Number(match[2]) > 0));
}

module.exports = { parseRecipeCard, durationMinutes, positiveYield };
