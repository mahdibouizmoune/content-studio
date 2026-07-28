function hasReasoningLeak(value = '') {
  const text = String(value || '').trim();
  if (text.length > 1400) return true;
  return [
    /<think>|<analysis>/i,
    /(?:^|\n)\s*(?:analysis|reasoning)\s*:/i,
    /(?:^|\n)\s*(?:let's|let me|we need to|we'll|okay,?\s+(?:so|first|now)|i need to)\b/i,
    /(?:^|\n)\s*final(?: answer| image prompt| pin prompt)?\s*\.\s*$/i
  ].some((pattern) => pattern.test(text));
}

function extractCleanPinPrompt(value = '') {
  let text = String(value || '')
    .replace(/```(?:text|prompt)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  if (!text) return '';

  const finalMatches = [...text.matchAll(/(?:^|\n)\s*final(?: answer| image prompt| pin prompt)?\s*:?\s*([\s\S]+)$/gi)];
  if (finalMatches.length) text = finalMatches[finalMatches.length - 1][1].trim();

  if (hasReasoningLeak(text)) {
    const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    const candidate = [...paragraphs].reverse().find((part) => (
      part.length >= 20
      && part.length <= 1400
      && /photo|photograph|image|pin design|close-up|overhead|text overlay|typography/i.test(part)
      && !hasReasoningLeak(part)
    ));
    text = candidate || '';
  }

  return text && text.length >= 20 && text.length <= 1400 && !hasReasoningLeak(text) ? text : '';
}

function fallbackPinPrompt(context = {}, placement = 'middle') {
  const topic = String(context.sourceTitle || context.title || context.targetKeyword || 'easy recipe')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const overlay = topic.replace(/^\d+\s+/, '').slice(0, 60) || 'Easy Recipe Idea';
  const position = ['top', 'bottom'].includes(placement) ? placement : 'middle';
  return `Vertical 2:3 editorial food photograph of ${topic}, shown as a complete recognizable homemade serving at a natural three-quarter angle. Soft side-window light, honest appetizing texture, true ingredient colors, and a clean lived-in kitchen surface. Reserve clear space in the ${position} for the exact headline "${overlay}" in bold high-contrast type with generous mobile-safe margins. No extra text, logos, packaging, unrelated ingredients, or artificial stock-photo styling.`;
}

module.exports = { extractCleanPinPrompt, fallbackPinPrompt, hasReasoningLeak };
