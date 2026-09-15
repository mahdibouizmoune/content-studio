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
  const position = ['top', 'bottom'].includes(placement) ? placement : 'middle';
  const reserved = position === 'middle' ? 'center band' : `${position} third`;
  return `Real premium vertical 2:3 food-blog photograph of ${topic}, never AI art, CGI, illustration, or generic stock imagery. Fill 72-86% of the frame with one appetite-first close-up hero serving using the most truthful angle for the recipe, leaving useful breathing room around the subject, with tack-sharp pores, fibers, crumbs, browned edges, moisture, or sauce texture. Use bright directional side-window light, soft white fill, controlled highlights, vivid but natural color, and an f/4-like depth of field that keeps the hero sharp while only the distant background falls off. Keep the ${reserved} visually calm for a later local title overlay while continuing recognizable food texture through the area. Generate no text, letters, numbers, labels, panels, logos, packaging, watermarks, unrelated ingredients, duplicated food, distorted utensils, plastic shine, harsh HDR, muddy shadows, or excessive blur.`;
}

module.exports = { extractCleanPinPrompt, fallbackPinPrompt, hasReasoningLeak };
