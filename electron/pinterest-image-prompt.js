const PINTEREST_FOOD_GUARDRAIL_MARKER = 'PINTEREST FOOD PHOTO REQUIREMENTS';

function enhancePinterestImagePrompt(prompt = '') {
  const base = String(prompt || '').trim();
  if (!base || base.includes(PINTEREST_FOOD_GUARDRAIL_MARKER)) return base;

  return `${base}

${PINTEREST_FOOD_GUARDRAIL_MARKER}:
- Use photorealistic editorial food photography, not illustration or CGI.
- Make the finished dish or one irresistible hero bite the clear focal point, filling about 65-80% of the image. For a collage, make every panel a tight food close-up.
- Choose a tight 30-45 degree view or tight overhead view that best reveals this specific dish. Keep the main food sharply focused with controlled shallow depth of field.
- Reveal honest, appetizing texture that fits the recipe: browned edges, glossy sauce, tender interior, creamy layers, crisp crumbs, fresh garnish, or gentle steam only when factually appropriate.
- Use bright diffused side-window light, natural shadows, true ingredient colors, realistic portions, and subtle home-cooked imperfections. Keep one plate or bowl edge visible so the food remains recognizable.
- Preserve clean negative space behind the requested text panel without covering the hero bite. Keep all important food and text safely inside a vertical 2:3 mobile crop.
- Show only ingredients and garnishes supported by the source prompt. No invented toppings, raw-looking cooked food, plastic texture, warped utensils, duplicate food, hands, faces, packaging, logos, watermarks, or extra text.
- Create appetite and click curiosity through a clear cooking result and visible texture, never through misleading claims or visual exaggeration.`;
}

module.exports = {
  PINTEREST_FOOD_GUARDRAIL_MARKER,
  enhancePinterestImagePrompt
};
