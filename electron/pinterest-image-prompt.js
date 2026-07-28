const PINTEREST_FOOD_GUARDRAIL_MARKER = 'PINTEREST CREATIVE REQUIREMENTS V3';
const LEGACY_MARKERS = [
  'PINTEREST FOOD PHOTO REQUIREMENTS',
  'PINTEREST CREATIVE REQUIREMENTS V2'
];

function removePreviousRequirements(prompt = '') {
  let cleaned = String(prompt || '').trim();
  for (const marker of [...LEGACY_MARKERS, PINTEREST_FOOD_GUARDRAIL_MARKER]) {
    const markerIndex = cleaned.indexOf(`\n\n${marker}:`);
    if (markerIndex >= 0) cleaned = cleaned.slice(0, markerIndex).trim();
  }
  return cleaned;
}

function isLikelyFoodPrompt(prompt = '') {
  return /\b(recipe|food|dish|meal|dinner|breakfast|dessert|salad|soup|stew|cake|cookie|chicken|beef|pork|shrimp|pasta|rice|potato|bread|sauce|skillet|bowl|plate|ingredients?)\b/i.test(prompt);
}

function enhancePinterestImagePrompt(prompt = '') {
  const original = String(prompt || '').trim();
  if (!original) return original;
  if (original.includes(PINTEREST_FOOD_GUARDRAIL_MARKER)) return original;
  const base = removePreviousRequirements(original);
  const subjectRules = isLikelyFoodPrompt(base)
    ? `- Create a believable editorial food photograph of the exact finished recipe. Show a complete, recognizable serving rather than an extreme macro crop. Let the food occupy about 55-70% of the canvas and leave intentional breathing room in the requested text area.
- Use soft directional window light, natural shadows, true ingredient colors, realistic portions, and appetizing but honest texture. Keep the styling warm and homemade, with small natural imperfections instead of a glossy plastic or stock-photo look.
- Show only ingredients, garnishes, cookware, and textures supported by the source. No invented toppings, raw-looking cooked food, duplicated food, distorted plates or utensils, excessive steam, or impossible cheese pulls.`
    : `- Create a polished, believable editorial photograph of the exact source subject. Keep one clear focal point, natural light, realistic materials, and enough intentional breathing room in the requested text area.
- Avoid generic stock imagery, distorted objects, duplicated details, unrelated props, artificial CGI texture, or unsupported visual claims.`;

  return `${base}

${PINTEREST_FOOD_GUARDRAIL_MARKER}:
- Use a high-resolution vertical 2:3 Pinterest composition designed to remain clear at mobile thumbnail size.
${subjectRules}
- Render only the one quoted headline requested in the prompt. Keep it to 3-7 words in an easy-to-read bold typeface, with high contrast and generous safe margins. Do not add a subtitle, badge, logo, watermark, URL, or extra lettering.
- Keep the result clean, inviting, source-accurate, and visually specific. Do not use clickbait, misleading transformations, dark muddy lighting, heavy filters, or a crowded template.`;
}

module.exports = {
  PINTEREST_FOOD_GUARDRAIL_MARKER,
  isLikelyFoodPrompt,
  removePreviousRequirements,
  enhancePinterestImagePrompt
};
