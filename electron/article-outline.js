function normalizeArticleOutline(value = '') {
  const raw = Array.isArray(value) ? value.join('') : String(value || '');
  return raw
    .replace(/```(?:html|markdown|md)?/gi, '')
    .replace(/```/g, '')
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, '')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, heading) => `\n## ${heading.replace(/<[^>]+>/g, ' ').trim()}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, heading) => `\n### ${heading.replace(/<[^>]+>/g, ' ').trim()}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, item) => `\n- ${item.replace(/<[^>]+>/g, ' ').trim()}`)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u2014/g, '-')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function outlineSectionCount(outline = '') {
  return (String(outline).match(/^##\s+\S.+$/gm) || []).length;
}

function appendOutlineSection(outline = '', title = 'New section') {
  return [String(outline).trim(), `## ${String(title || 'New section').trim()}\n- Add the key reader value for this section.`]
    .filter(Boolean)
    .join('\n\n');
}

function removeLastOutlineSection(outline = '') {
  const text = String(outline).trim();
  const matches = [...text.matchAll(/^##\s+\S.+$/gm)];
  if (!matches.length) return text;
  return text.slice(0, matches[matches.length - 1].index).trim();
}

module.exports = {
  appendOutlineSection,
  normalizeArticleOutline,
  outlineSectionCount,
  removeLastOutlineSection
};
