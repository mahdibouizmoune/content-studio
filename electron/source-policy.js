'use strict';
function assertArticleSource(value) {
  const url = new URL(value);
  if (/(?:^|\.)pinterest\.[a-z.]+$/i.test(url.hostname) || /(?:^|\.)(?:pin\.it|pinimg\.com)$/i.test(url.hostname)) {
    throw new Error('Pinterest page extraction is disabled. Paste the original recipe website URL or use your authorized Pinterest connection.');
  }
  return value;
}
function assertArticleRedirect(options = {}) {
  const url = options.href || `${options.protocol || 'https:'}//${options.hostname || options.host}${options.path || options.pathname || '/'}`;
  assertArticleSource(url);
}
module.exports = { assertArticleSource, assertArticleRedirect };
