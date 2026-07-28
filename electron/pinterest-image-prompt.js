const PINTEREST_FOOD_GUARDRAIL_MARKER = 'PINTEREST CREATIVE REQUIREMENTS V4';
const LEGACY_MARKERS = [
  'PINTEREST FOOD PHOTO REQUIREMENTS',
  'PINTEREST CREATIVE REQUIREMENTS V2',
  'PINTEREST CREATIVE REQUIREMENTS V3'
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
    ? `- Use premium photorealistic editorial food photography of the exact finished recipe, not illustration or CGI. Make the finished dish or one irresistible hero serving the clear focal point, filling about 65-80% of the frame while keeping enough plate or bowl edge visible for instant recognition.
- Choose a tight 30-45 degree view or tight overhead view that best reveals this specific dish. Keep the hero food sharply focused with controlled shallow depth of field and show its most desirable truthful texture, such as browned edges, glossy sauce, tender interior, creamy layers, crisp crumbs, or melted cheese.
- Use bright diffused side-window light, natural shadows, true ingredient colors, realistic portions, and subtle home-cooked imperfections. The result should look freshly photographed by a skilled food photographer, not glossy plastic, overprocessed, or like generic stock imagery.
- Show only ingredients, garnishes, cookware, and textures supported by the source. No invented toppings, raw-looking cooked food, duplicated food, distorted plates or utensils, excessive steam, or impossible cheese pulls.`
    : `- Create a polished, believable editorial photograph of the exact source subject. Keep one clear focal point, natural light, realistic materials, and enough intentional breathing room in the requested text area.
- Avoid generic stock imagery, distorted objects, duplicated details, unrelated props, artificial CGI texture, or unsupported visual claims.`;

  return `${base}

${PINTEREST_FOOD_GUARDRAIL_MARKER}:
- Use a high-resolution vertical 2:3 Pinterest composition designed to remain clear at mobile thumbnail size.
${subjectRules}
- Render only the one quoted headline requested in the prompt. Keep it to 3-7 words in an easy-to-read bold typeface, with high contrast and generous safe margins. Do not add a subtitle, badge, logo, watermark, URL, or extra lettering.
- Keep the result premium, appetite-first, source-accurate, and visually specific. Preserve clean negative space behind the requested text panel without covering the most desirable food detail. Do not use clickbait, misleading transformations, dark muddy lighting, heavy filters, or a crowded template.`;
}

module.exports = {
  PINTEREST_FOOD_GUARDRAIL_MARKER,
  isLikelyFoodPrompt,
  removePreviousRequirements,
  enhancePinterestImagePrompt
};
