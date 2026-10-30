'use strict';
const { parseDocument } = require('htmlparser2');
const { selectAll } = require('css-select');
const { textContent } = require('domutils');
const { extractRecipeSections } = require('./recipe-generation');

// Add anchors without reserializing the article or changing existing reader links.
function anchorRecipeRoundup(content = '') {
  const source = String(content);
  const doc = parseDocument(source, { withStartIndices: true, withEndIndices: true });
  const numbered = extractRecipeSections(source).filter(s => /ingredients/i.test(s.html));
  const cards = selectAll('[id="recipe-card"], [id^="recipe-card-"], .recipe-card', doc);
  const targets = numbered.length > 1
    ? numbered.map(s => selectAll('h2', doc).find(node => node.startIndex === source.indexOf(s.html)))
    : cards.filter(node => !cards.some(other => other !== node && isInside(other, node)));
  if (targets.length < 2 || targets.some(node => !node)) return { content: source, anchors: [] };
  const used = new Set(selectAll('[id]', doc).map(node => node.attribs.id));
  const inserts = [], anchors = [];
  for (const [index, node] of targets.entries()) {
    let previous = node.prev;
    while (previous?.type === 'text' && !previous.data.trim()) previous = previous.prev;
    const existing = previous?.type === 'tag' && previous.name === 'span' && /^cs-recipe-/.test(previous.attribs?.id || '') ? previous.attribs.id : '';
    let id = existing || `cs-recipe-${index + 1}`;
    if (!existing) {
      for (let suffix = 2; used.has(id); suffix++) id = `cs-recipe-${index + 1}-${suffix}`;
      inserts.push({ at: node.startIndex, value: `<span id="${id}"></span>` });
    }
    used.add(id); anchors.push({ id, name: textContent(node).trim().slice(0, 160) });
  }
  let output = source;
  for (const insertion of inserts.reverse()) output = output.slice(0, insertion.at) + insertion.value + output.slice(insertion.at);
  return { content: output, anchors };
}
function isInside(node, parent) { for (let p = node.parent; p; p = p.parent) if (p === parent) return true; return false; }
function roundupSchema(recipes, anchors, pageUrl) {
  let page;
  try {
    page = new URL(pageUrl); if (page.protocol !== 'https:' || page.username || page.password) return null;
    page.hash = '';
    for (const key of [...page.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key)) page.searchParams.delete(key);
  } catch { return null; }
  if (recipes.length < 2 || anchors.length !== recipes.length) return null;
  return { '@type': 'ItemList', itemListElement: recipes.map((recipe, index) => ({
    '@type': 'ListItem', position: index + 1,
    item: { ...recipe, url: `${page.href}#${anchors[index].id}`, '@id': `${page.href}#${anchors[index].id}` }
  })) };
}
function replaceRoundupSchema(content, structuredData) {
  const schema = JSON.parse(structuredData);
  if (!schema['@graph']?.some(node => node['@type'] === 'ItemList')) return null;
  const doc = parseDocument(content, { withStartIndices: true, withEndIndices: true });
  const changes = [];
  for (const script of selectAll('script[type="application/ld+json"]', doc)) {
    try {
      const data = JSON.parse(textContent(script));
      const nodes = data['@graph'] || [data];
      if (!nodes.some(node => ['Recipe', 'ItemList'].includes(node?.['@type']))) continue;
      const remaining = nodes.filter(node => !['Recipe', 'ItemList'].includes(node?.['@type']));
      changes.push({ start: script.startIndex, end: script.endIndex + 1, value: remaining.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': remaining }).replace(/</g, '\\u003c')}</script>` : '' });
    } catch { /* Unrelated invalid markup is not rewritten here. */ }
  }
  let output = content;
  for (const change of changes.reverse()) output = output.slice(0, change.start) + change.value + output.slice(change.end);
  return output.replace(/\n?<!-- content-studio-revision:[a-f0-9]{64} -->/g, '') + `\n<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
}
module.exports = { anchorRecipeRoundup, roundupSchema, replaceRoundupSchema };
