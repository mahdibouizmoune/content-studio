'use strict';
const { parseDocument } = require('htmlparser2');
const { selectAll } = require('css-select');
const { textContent } = require('domutils');
function htmlReceipt(html = '') {
  const doc = parseDocument(String(html), { decodeEntities: true });
  return selectAll('tr', doc).map(row => selectAll('th,td', row).map(cell => textContent(cell).replace(/\s+/g, ' ').trim()).join('\t')).filter(Boolean).join('\n');
}
async function readReceipt(bytes, filename) {
  if (bytes.length > 2 * 1024 * 1024) throw new Error('Receipt exceeds 2 MB.');
  let text;
  if (/\.eml$/i.test(filename)) {
    const PostalMime = require('postal-mime');
    const email = await PostalMime.parse(bytes);
    text = [email.text || '', htmlReceipt(email.html || '')].filter(Boolean).join('\n');
  } else if (/\.html?$/i.test(filename)) text = htmlReceipt(bytes.toString('utf8'));
  else text = bytes.toString('utf8');
  if (text.length > 100000) throw new Error('Receipt text exceeds 100,000 characters.');
  return text;
}
module.exports = { htmlReceipt, readReceipt };
