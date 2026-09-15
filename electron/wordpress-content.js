const sanitizeHtml = require('sanitize-html');

const ARTICLE_TAGS = [
  'article', 'section', 'header', 'footer', 'main', 'aside',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span',
  'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'cite', 'q', 'pre', 'code',
  'figure', 'figcaption', 'picture', 'source', 'img',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'details', 'summary', 'time', 'br', 'hr', 'a'
];

const SAFE_STYLE_VALUE = /^(?!.*(?:url\s*\(|expression\s*\(|@import|javascript:|behavior\s*:))[#(),.%\-\w\s'"/]+$/i;

const ARTICLE_ALLOWED_ATTRIBUTES = {
  '*': [
    'class', 'id', 'title', 'style', 'role', 'aria-*', 'data-*',
    'itemprop', 'itemscope', 'itemtype', 'content', 'datetime'
  ],
  a: ['href', 'target', 'rel', 'download'],
  img: ['src', 'srcset', 'sizes', 'alt', 'width', 'height', 'loading', 'decoding', 'fetchpriority'],
  source: ['src', 'srcset', 'sizes', 'type', 'media', 'width', 'height'],
  th: ['scope', 'colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
  ol: ['start', 'reversed', 'type'],
  li: ['value']
};

const ARTICLE_ALLOWED_STYLES = {
  '*': {
    margin: [SAFE_STYLE_VALUE],
    'margin-top': [SAFE_STYLE_VALUE],
    'margin-right': [SAFE_STYLE_VALUE],
    'margin-bottom': [SAFE_STYLE_VALUE],
    'margin-left': [SAFE_STYLE_VALUE],
    padding: [SAFE_STYLE_VALUE],
    'padding-top': [SAFE_STYLE_VALUE],
    'padding-right': [SAFE_STYLE_VALUE],
    'padding-bottom': [SAFE_STYLE_VALUE],
    'padding-left': [SAFE_STYLE_VALUE],
    border: [SAFE_STYLE_VALUE],
    'border-top': [SAFE_STYLE_VALUE],
    'border-right': [SAFE_STYLE_VALUE],
    'border-bottom': [SAFE_STYLE_VALUE],
    'border-left': [SAFE_STYLE_VALUE],
    'border-radius': [SAFE_STYLE_VALUE],
    background: [SAFE_STYLE_VALUE],
    'background-color': [SAFE_STYLE_VALUE],
    color: [SAFE_STYLE_VALUE],
    display: [SAFE_STYLE_VALUE],
    gap: [SAFE_STYLE_VALUE],
    'grid-template-columns': [SAFE_STYLE_VALUE],
    'font-family': [SAFE_STYLE_VALUE],
    'font-size': [SAFE_STYLE_VALUE],
    'font-style': [SAFE_STYLE_VALUE],
    'font-weight': [SAFE_STYLE_VALUE],
    'letter-spacing': [SAFE_STYLE_VALUE],
    'line-height': [SAFE_STYLE_VALUE],
    'list-style': [SAFE_STYLE_VALUE],
    'list-style-type': [SAFE_STYLE_VALUE],
    'text-align': [SAFE_STYLE_VALUE],
    'text-decoration': [SAFE_STYLE_VALUE],
    'text-transform': [SAFE_STYLE_VALUE],
    'white-space': [SAFE_STYLE_VALUE],
    'box-shadow': [SAFE_STYLE_VALUE],
    width: [SAFE_STYLE_VALUE],
    'max-width': [SAFE_STYLE_VALUE],
    height: [SAFE_STYLE_VALUE]
  }
};

function sanitizeWordPressArticleHtml(html = '') {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ARTICLE_TAGS,
    allowedAttributes: ARTICLE_ALLOWED_ATTRIBUTES,
    allowedStyles: ARTICLE_ALLOWED_STYLES,
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowedSchemesByTag: {
      img: ['https'],
      source: ['https'],
      a: ['https', 'http', 'mailto', 'tel']
    },
    allowProtocolRelative: false,
    allowVulnerableTags: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
    parser: {
      lowerCaseAttributeNames: true,
      lowerCaseTags: true
    },
    transformTags: {
      a: (tagName, attributes) => {
        const href = String(attributes.href || '').trim();
        if (href.startsWith('#') || href.startsWith('/')) attributes.href = href;
        if (attributes.target === '_blank') {
          const rel = new Set(String(attributes.rel || '').split(/\s+/).filter(Boolean));
          rel.add('noopener');
          rel.add('noreferrer');
          attributes.rel = [...rel].join(' ');
        }
        return { tagName, attribs: attributes };
      }
    }
  });
}

module.exports = {
  ARTICLE_ALLOWED_ATTRIBUTES,
  ARTICLE_TAGS,
  sanitizeWordPressArticleHtml
};
