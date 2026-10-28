'use strict';
const { parseDocument } = require('htmlparser2');
const { selectAll } = require('css-select');
const { getOuterHTML, textContent } = require('domutils');
const { extractRecipeSections } = require('./recipe-generation');
function recipeUnits(html = '') {
  const source = String(html);
  // Numbered headings only count as recipes when they carry ingredients; "3 Common Mistakes" does not.
  const numbered = extractRecipeSections(source).filter((section) => /ingredients/i.test(section.html));
  if (numbered.length > 1) return numbered.map(s => ({ name: s.title, html: `<section id="recipe-card">${s.html}</section>` }));
  const doc = parseDocument(source, { decodeEntities: true });
  const candidates = selectAll('[id="recipe-card"], [id^="recipe-card-"], .recipe-card', doc);
  const cards = candidates.filter(c => !candidates.some(other => other !== c && contains(c, other)));
  return cards.map(card => {
    const name = textContent(selectAll('[itemprop="name"],h2,h3', card)[0] || { children: [] }).trim();
    card.attribs.id = 'recipe-card';
    return { name, html: getOuterHTML(card) };
  });
}
function contains(parent, node) { for (let p = node.parent; p; p = p.parent) if (p === parent) return true; return false; }
module.exports = { recipeUnits };
