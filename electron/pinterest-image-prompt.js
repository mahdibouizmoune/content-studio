const PINTEREST_FOOD_GUARDRAIL_MARKER = 'PINTEREST CREATIVE REQUIREMENTS V10';
const LEGACY_MARKERS = [
  'PINTEREST FOOD PHOTO REQUIREMENTS',
  'PINTEREST CREATIVE REQUIREMENTS V2',
  'PINTEREST CREATIVE REQUIREMENTS V3',
  'PINTEREST CREATIVE REQUIREMENTS V4',
  'PINTEREST CREATIVE REQUIREMENTS V5',
  'PINTEREST CREATIVE REQUIREMENTS V6',
  'PINTEREST CREATIVE REQUIREMENTS V7',
  'PINTEREST CREATIVE REQUIREMENTS V8',
  'PINTEREST CREATIVE REQUIREMENTS V9'
];

const JULY_25_AI_MARKER = 'PINTEREST JULY 25 AI REQUIREMENTS';

function removePreviousRequirements(prompt = '') {
  let cleaned = String(prompt || '').trim();
  for (const marker of [...LEGACY_MARKERS, PINTEREST_FOOD_GUARDRAIL_MARKER]) {
    const markerIndex = cleaned.indexOf(`\n\n${marker}:`);
    if (markerIndex >= 0) cleaned = cleaned.slice(0, markerIndex).trim();
  }
  return cleaned;
}

function isLikelyFoodPrompt(prompt = '') {
  return /\b(recipe|food|dish|meal|dinner|breakfast|dessert|salad|soup|stew|cake|cookie|chicken|beef|pork|shrimp|fish|seafood|sardine|tuna|salmon|pasta|rice|potato|bread|toast|sauce|skillet|bowl|plate|ingredients?|drink|beverage|mocktail|cocktail|lemonade|smoothie|latte)\b/i.test(prompt);
}

function isLikelyDrinkPrompt(prompt = '') {
  return /\b(drink|beverage|mocktail|cocktail|lemonade|limeade|soda|spritzer|smoothie|shake|latte|coffee|tea|juice|punch|sipper|margarita|martini)\b/i.test(prompt);
}

function isLikelyBowlPrompt(prompt = '') {
  return /\b(salad|pasta salad|grain bowl|rice bowl|buddha bowl|noodle bowl|smoothie bowl|soup|stew|chili)\b/i.test(prompt);
}

function isLikelyCollagePrompt(prompt = '') {
  return /\b(collage|split layout|two or three (?:food )?(?:photos|images)|multiple close-up)\b/i.test(prompt);
}

function pinterestPhotographyDirection(prompt = '') {
  if (isLikelyCollagePrompt(prompt)) {
    return `- Create two or three source-accurate close-up food-photo panels with one clearly dominant hero panel. Crop each dish tightly, keep every panel recognizable, and use consistent lighting and color treatment.
- Keep panel dividers simple and clean. Never repeat the same food, merge dishes together, or use a crowded equal-size grid.`;
  }
  if (isLikelyDrinkPrompt(prompt)) {
    return `- Show one real drink in accurate glassware from a close eye-level or slight three-quarter angle. Let the glass fill 74-86% of the frame, with the rim, liquid, ice, and source-supported garnish crisp and recognizable.
- Use believable translucency, refraction, condensation, bubbles, and dimensional ice. Side-light or backlight the glass for a natural glow, with no floating fruit, fused ice, bent glass, fake splash, or impossible reflections.`;
  }
  if (isLikelyBowlPrompt(prompt)) {
    return `- Use a tight overhead or high three-quarter composition with the bowl filling 74-86% of the canvas and part of the rim naturally cropped by the frame. Make the exact finished recipe instantly recognizable at thumbnail size.
- Keep the key ingredients distributed naturally, with crisp edges, believable moisture, true scale, and one tack-sharp focal area. Do not arrange ingredients into a synthetic pattern or repeat identical pieces.`;
  }
  return `- Use a tight 30-45 degree hero angle or close overhead angle chosen for the exact dish. Let the plated food or serving vessel fill 72-86% of the canvas, with a natural edge crop, useful breathing room, and one unmistakable focal point.
- Prioritize the source-supported appetite cue: crisp browned edges, a moist cut surface, glossy sauce, creamy layers, flaky crumb, char, or fresh crunch. Keep the important food detail tack-sharp and physically believable.`;
}

function pinterestPhotorealismRules(prompt = '') {
  const detailRule = isLikelyDrinkPrompt(prompt)
    ? 'Preserve realistic glass edges, liquid translucency, ice volume, condensation, fruit skin, and tiny bubbles where source-appropriate.'
    : 'Preserve pores, crumbs, fibers, sauce viscosity, moisture, and small homemade irregularities.';
  return `${pinterestPhotographyDirection(prompt)}
- Use a real full-frame food-photography look with a natural 50-85mm perspective and f/4-f/5.6-like depth of field. Keep the hero bite and its surrounding texture sharp instead of blurring most of the dish. Light it with a large diffused side window and soft bounce fill for dimensional highlights, open natural shadows, and truthful color. ${detailRule}
- Make the food look freshly prepared and ready to eat, with restrained source-appropriate sheen and subtle handmade variation. Keep the background simple and props minimal. Avoid a wide table scene, generic stock styling, harsh HDR, crushed shadows, orange color casts, neon saturation, plastic texture, CGI, illustration, or artificial blur over the subject.`;
}

function pinterestAppetiteDirection(prompt = '') {
  const value = String(prompt || '');
  if (isLikelyDrinkPrompt(value)) {
    return '- Appetite cue: make the drink genuinely cold and freshly poured, with liquid depth, dimensional ice, fine condensation, natural fruit color, and source-appropriate bubbles.';
  }
  if (/\b(cake|cupcake|cookie|brownie|pie|tart|cheesecake|bread|muffin|roll|pastry|baked)\b/i.test(value)) {
    return '- Appetite cue: reveal a tender interior, distinct crumb, crisp baked edge, flaky layer, or creamy filling with one natural cut, broken edge, or plated slice.';
  }
  if (/\b(creamy|cheesy|pasta|mac and cheese|sauce|dip|casserole|risotto)\b/i.test(value)) {
    return '- Appetite cue: show believable sauce viscosity and an evenly coated hero bite, with recipe-supported creamy texture, browned edges, or natural melted cheese.';
  }
  if (/\b(chicken|beef|steak|pork|turkey|salmon|shrimp|fish|seafood|meatball)\b/i.test(value)) {
    const crispCue = /\b(crispy|crunchy|fried|air fryer|roasted|seared|grilled|toasted)\b/i.test(value)
      ? ' Add crisp irregular edges and natural browning supported by the cooking method.'
      : '';
    return `- Appetite cue: render the protein fully cooked as required, juicy but not raw, with natural fibers and believable browning.${crispCue}`;
  }
  if (/\b(crispy|crunchy|fried|air fryer|roasted|seared|grilled|toasted)\b/i.test(value)) {
    return '- Appetite cue: prioritize crisp irregular edges, natural browning, tiny toasted areas, and a moist interior where visible, never a greasy or lacquered surface.';
  }
  if (isLikelyBowlPrompt(value)) {
    return '- Appetite cue: show clear ingredient separation, fresh edges, believable moisture, natural tossing, and one inviting focal cluster, never a geometric pattern.';
  }
  return '- Appetite cue: emphasize one source-supported texture such as caramelized edges, a moist center, crisp freshness, flaky crumb, or natural sauce sheen.';
}

function pinterestIngredientRealityRules(prompt = '') {
  const value = String(prompt || '');
  if (/\bcanned tuna\b/i.test(value)) {
    return '- The source specifies canned tuna. Render drained, fully cooked, opaque pale-beige tuna as irregular tender flakes and small natural chunks with visible fibers. Never show raw salmon, sashimi, glossy orange cubes, uniform geometric pieces, or seared ahi tuna.';
  }
  if (/\bcanned (?:salmon|chicken)\b/i.test(value)) {
    return '- Preserve the visibly cooked canned texture as irregular opaque flakes and small tender pieces. Never render raw glossy cubes, sashimi texture, or perfectly uniform pieces.';
  }
  if (/\b(?:canned|tinned)?\s*sardines?\b/i.test(value)) {
    return '- Render cooked sardine fillets at believable scale, naturally arranged as one intentional serving with moist flaky flesh and restrained silver skin. Avoid fish heads or eyes, raw-looking flesh, oversized whole fish, repeated identical fillets, excessive oil pools, metallic plastic shine, or a bait-like presentation. Use only source-supported toast, lemon, herbs, capers, sauce, or garnish.';
  }
  return '- Preserve natural ingredient scale, irregular cuts, tiny surface imperfections, and believable cooked texture. Avoid perfectly repeated shapes, waxy highlights, excessive glaze, plastic-smooth surfaces, synthetic symmetry, and ingredients that look raw when the finished recipe requires them cooked.';
}

function enhancePinterestImagePrompt(prompt = '') {
  const original = String(prompt || '').trim();
  if (!original) return original;
  if (original.includes(PINTEREST_FOOD_GUARDRAIL_MARKER)) return original;
  const base = removePreviousRequirements(original);
  const subjectRules = isLikelyFoodPrompt(base)
    ? `- Create an unmistakably real, premium close-up editorial photograph of the exact finished recipe, never an illustration, 3D render, CGI scene, or synthetic stock image.
${pinterestPhotorealismRules(base)}
${pinterestAppetiteDirection(base)}
${pinterestIngredientRealityRules(base)}
- Show only ingredients, garnishes, cookware, and textures supported by the source. No invented toppings, raw-looking cooked food, duplicated food, distorted plates or utensils, excessive steam, or impossible cheese pulls.`
    : `- Create a polished, believable editorial photograph of the exact source subject. Keep one clear focal point, natural light, realistic materials, and enough intentional breathing room in the requested text area.
- Avoid generic stock imagery, distorted objects, duplicated details, unrelated props, artificial CGI texture, or unsupported visual claims.`;

  return `${base}

${PINTEREST_FOOD_GUARDRAIL_MARKER}:
- Use a high-resolution vertical 2:3 Pinterest composition designed to remain clear at mobile thumbnail size.
${subjectRules}
- Render only the one quoted headline requested in the prompt. Keep it to 3-7 words in premium bold display lettering with clean kerning, balanced line breaks, high contrast, and generous safe margins. Spell every word exactly as quoted. Do not add a subtitle, badge, logo, watermark, URL, or extra lettering.
- Set the headline directly over the photograph with a strong contrasting outline and restrained natural shadow. Do not draw a banner, ribbon, translucent strip, frosted panel, opaque box, or decorative frame behind it.
- Keep the result premium, appetite-first, source-accurate, and visually specific. Preserve the most desirable food detail around the requested lettering. Do not use clickbait, misleading transformations, dark muddy lighting, heavy filters, or a crowded template.`;
}

function enhancePinterestJuly25AiPrompt(prompt = '') {
  const original = String(prompt || '').trim();
  if (!original) return original;
  if (original.includes(JULY_25_AI_MARKER)) return original;
  const base = removePreviousRequirements(original);

  return `${base}

${JULY_25_AI_MARKER}:
- Use photorealistic editorial food photography, not illustration or CGI.
- Make the finished dish or one irresistible hero bite the clear focal point, filling about 65-80% of the image. For a collage, make every panel a tight food close-up.
- Choose a tight 30-45 degree view or tight overhead view that best reveals this specific dish. Keep the main food sharply focused with controlled shallow depth of field.
- Reveal honest, appetizing texture that fits the recipe: browned edges, glossy sauce, tender interior, creamy layers, crisp crumbs, fresh garnish, or gentle steam only when factually appropriate.
- Use bright diffused side-window light, natural shadows, true ingredient colors, realistic portions, and subtle home-cooked imperfections. Keep one plate or bowl edge visible so the food remains recognizable.
- Preserve clean negative space behind the requested text panel without covering the hero bite. Keep all important food and text safely inside a vertical 2:3 mobile crop.
- Show only ingredients and garnishes supported by the source prompt. No invented toppings, raw-looking cooked food, plastic texture, warped utensils, duplicate food, hands, faces, packaging, logos, watermarks, or extra text.
- Create appetite and click curiosity through a clear cooking result and visible texture, never through misleading claims or visual exaggeration.`;
}

function enhancePinterestOriginalJulyAiPrompt(prompt = '', overlayText = '') {
  const original = String(prompt || '').trim();
  if (/Render exactly this headline once:/i.test(original) && /compact softly translucent rounded rectangle/i.test(original)) return original;
  const headline = String(overlayText || '')
    .replace(/["'`\u201c\u201d]/g, '')
    .replace(/^\s*\d+\s*[.)-]?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  if (!original || !headline) return original;

  const withoutManagedSections = removePreviousRequirements(original)
    .split(/\n\n(?:FINAL IDEOGRAM DELIVERY RULES|PINTEREST AI TYPOGRAPHY|PINTEREST IMAGE AND LETTERING BRIEF|PINTEREST AI LETTERING REQUIREMENTS):/i)[0]
    .trim();
  const photoDirection = withoutManagedSections
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !/\b(?:text overlay|headline|typography|lettering|font|title panel|call[- ]to[- ]action|cta|get the recipe)\b/i.test(sentence))
    .filter((sentence) => !/\b(?:this pinterest pin is viral|highly clickable|classic early july|original july pin|early july pin|july pin style)\b/i.test(sentence))
    .filter((sentence) => !/^\s*(?:rules|style guidelines|creative direction|source data)\s*:?\s*$/i.test(sentence))
    .join(' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/This Pinterest pin is viral\.\s*/gi, '')
    .replace(/This Pinterest pin is [^.]{1,40} and highly clickable\.\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
  const subject = (photoDirection || 'A bright professional close-up photograph of the exact finished recipe with natural window light, realistic color, and an uncluttered background')
    .split(/\s+/)
    .slice(0, 70)
    .join(' ')
    .replace(/[.;:,\s]+$/, '');

  return `${subject}. Create one full-bleed vertical 2:3 photograph with one finished dish, drink, jar, bowl, or serving as the unmistakable close-up hero.

Render exactly this headline once: "${headline.toUpperCase()}". It is the only visible wording. Place it in the exact center middle in 2-4 balanced lines of large bold uppercase white modern sans-serif type inside a compact softly translucent rounded rectangle sampled from the food, with a thin warm-white border.

Photograph it from a natural close perspective with large diffused side light, soft fill, truthful color, open shadows, realistic proportions, and sharp hero texture. ${pinterestAppetiteDirection(withoutManagedSections)} Keep the recipe visible around and through the panel.

Show only source-supported ingredients and garnish. No collage, footer, subtitle, CTA, number, URL, logo, watermark, platform icon, corner badge, label, decorative symbol, extra letters, invented ingredient, fake steam, excessive glaze, plastic texture, neon saturation, CGI, or illustration.`;
}

function pinterestAiOverlayTreatment(prompt = '') {
  if (isLikelyDrinkPrompt(prompt)) {
    return 'a compact softly translucent rounded rectangle sampled from the drink colors, with a thin warm-white border and enough transparency to keep the glass and fruit visible';
  }
  return 'a softly translucent full-width center band sampled from the food colors, with feathered edges and enough transparency to keep the ingredients visible';
}

function stripPinterestCollageDirections(prompt = '') {
  return String(prompt || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !/\b(?:collage|grid|split[- ]screen|inset|secondary panels?|supporting shots?|smaller shots?|sub-images?|dividers?|step-by-step images?)\b/i.test(sentence))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function enhancePinterestLegacyAiPrompt(prompt = '', placement = 'middle', overlayText = '', allowCollage = false) {
  const rawBase = removePreviousRequirements(String(prompt || '').trim());
  const textSafeBase = stripTextProhibitions(rawBase)
    .replace(/\b(?:reserve|keep)\s+(?:a|the)\s+(?:calm|clean)\s+(?:area|band|space)\s+for\s+(?:later\s+)?(?:local\s+)?(?:text|typography|lettering|overlay)[^.]*\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const base = allowCollage ? textSafeBase : stripPinterestCollageDirections(textSafeBase);
  const marker = 'PINTEREST FOOD PHOTO REQUIREMENTS';
  const headline = String(overlayText || '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  if (!base || !headline) return base;
  const position = placement === 'top' ? 'top third' : placement === 'bottom' ? 'bottom third' : 'center middle';
  const treatment = pinterestAiOverlayTreatment(base);

  return `The text "${headline}" in the ${position}.

${allowCollage
    ? 'Create one cohesive vertical Pinterest collage with one dominant hero image and simple supporting panels.'
    : 'Create one single full-bleed vertical 2:3 photograph. No collage, grid, split layout, inset, footer image, secondary panel, or step image.'}

${base}

${marker}:
- Use photorealistic editorial food photography, not illustration or CGI.
- Make the finished dish or one irresistible hero bite the clear focal point, filling about 65-80% of the image.${allowCollage ? ' Keep every supporting panel a tight, consistent food close-up.' : ''}
- Choose a tight 30-45 degree view or tight overhead view that best reveals this specific dish. Keep the main food sharply focused with controlled shallow depth of field.
- Reveal honest, appetizing texture that fits the recipe: browned edges, glossy sauce, tender interior, creamy layers, crisp crumbs, fresh garnish, or gentle steam only when factually appropriate.
- Use bright diffused side-window light, natural shadows, true ingredient colors, realistic portions, and subtle home-cooked imperfections. Keep one plate or bowl edge visible so the food remains recognizable.
- Preserve clean negative space behind the requested text panel without covering the hero bite. Keep all important food and text safely inside a vertical 2:3 mobile crop.
- Show only ingredients and garnishes supported by the source prompt. No invented toppings, raw-looking cooked food, plastic texture, warped utensils, duplicate food, hands, faces, packaging, logos, watermarks, or extra text.
- Create appetite and click curiosity through a clear cooking result and visible texture, never through misleading claims or visual exaggeration.

PINTEREST AI TYPOGRAPHY:
- Render exactly this text once and spell every character correctly: "${headline}". Do not add a subtitle, CTA, logo, watermark, URL, label, or any other words.
- Set the title in large bold uppercase geometric sans-serif lettering, centered in 2-4 balanced lines and readable on a phone thumbnail.
- Place the title only in the ${position}. Use warm-white letters, a subtle charcoal shadow, clean kerning, and comfortable safe margins.
- Put ${treatment} immediately behind the title. Keep it polished and photographic, not a website button, poster, or heavy opaque box.
- Never put the title in a white footer, bottom caption strip, separate card, or gap between image panels.
- Keep the finished food or drink dominant and clearly visible around and through the title treatment.`;
}

function isPromptLedPinterestCreative(prompt = '') {
  const value = String(prompt || '');
  return /(?:headline|text overlay|title text|typography|lettering)/i.test(value)
    && /["\u201c][^"\u201d]{3,100}["\u201d]/.test(value);
}

function enhancePinterestPromptLedAiPrompt(prompt = '', allowCollage = false, overlayText = '') {
  const rawBase = removePreviousRequirements(String(prompt || '').trim());
  const textSafeBase = stripTextProhibitions(rawBase)
    .replace(/\b(?:reserve|keep)\s+(?:a|the)\s+(?:calm|clean)\s+(?:area|band|space)\s+for\s+(?:later\s+)?(?:local\s+)?(?:text|typography|lettering|overlay)[^.]*\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  let base = allowCollage ? textSafeBase : stripPinterestCollageDirections(textSafeBase);
  if (!isPromptLedPinterestCreative(base)) {
    throw new Error('This saved image prompt is photo-only. Regenerate the Pinterest prompt so Ideogram can design the complete Pin.');
  }
  const headline = String(overlayText || '')
    .replace(/["'`\u201c\u201d]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  if (headline) {
    let headlineReplaced = false;
    base = base.replace(/["\u201c][^"\u201d]{3,100}["\u201d]/g, (match) => {
      if (/get\s+(?:the\s+)?recipe/i.test(match)) return '"GET THE RECIPE"';
      if (!headlineReplaced) {
        headlineReplaced = true;
        return `"${headline}"`;
      }
      return match;
    });
  }

  return `${base}

FINAL IDEOGRAM DELIVERY RULES:
- Create one polished vertical 2:3 Pinterest Pin as a single finished composition.${allowCollage ? ' Preserve the deliberately requested collage structure.' : ' Use one full-bleed food photograph, not a collage, grid, inset, split layout, or footer image.'}
- Preserve the prompt's chosen typography, color, placement, and integrated text treatment. Do not replace them with a generic template or a plain white caption strip.${headline ? ` Render exactly this headline once: "${headline}". Do not rewrite it or add words.` : ''}
- Keep the title bold, uppercase, geometric, and readable at phone-thumbnail size. Use no more than three centered lines, about 62-74% of the canvas width, and no more than 28% of the canvas height. Preserve the chosen transparent panel, center band, direct-text glow, or stacked-band treatment and keep the food visible beneath it. Never substitute thin serif lettering or a generic pale strip.
- Add one compact call-to-action button near the bottom center containing exactly "GET THE RECIPE" in bold uppercase warm-white geometric sans-serif lettering. Make the button 34-44% of the canvas width and 6-8% of its height, with generous inner padding, softly rounded corners, a saturated color sampled from the food or a deep charcoal tone, a thin warm-white keyline, and a restrained natural shadow. Keep it 5-7% above the bottom edge inside the safe zone. It must look polished and eye-catching without covering the food.
- Make the exact finished food or drink photorealistic, close, bright, source-accurate, and immediately appetizing at phone-thumbnail size. Preserve believable texture, natural light, true ingredient color, and realistic proportions.
${pinterestPhotorealismRules(base)}
${pinterestAppetiteDirection(base)}
${pinterestIngredientRealityRules(base)}
- Render the quoted headline once and the CTA once with correct spelling and strong mobile readability. These are the only two text elements allowed. Do not add a subtitle, URL, logo, watermark, footer caption, icon, arrow, decorative label, or any other words.
- Keep the food dominant and keep the complete headline and CTA safely inside the canvas.`;
}

function stripOverlayDirections(prompt = '') {
  return String(prompt || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !/\b(text overlay|headline|typography|font|lettering|frosted-glass|ribbon|title strip|title panel)\b/i.test(sentence))
    .join(' ')
    .replace(/"[^"]{2,100}"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTextProhibitions(prompt = '') {
  return String(prompt || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => !/\b(?:generate|render|show|include|add|create|use)\s+(?:absolutely\s+)?no\s+(?:text|letters?|lettering|words?|typography|labels?|titles?|captions?)/i.test(sentence))
    .filter((sentence) => !/\b(?:no|without)\s+(?:text|letters?|lettering|words?|typography|labels?|titles?|captions?)\b/i.test(sentence))
    .filter((sentence) => !/\b(?:later|after(?:ward)?)\s+(?:exact\s+)?local\s+(?:(?:text|title|typography|lettering)\s+)?overlay\b/i.test(sentence))
    .filter((sentence) => !/\bapp adds exact typography\b/i.test(sentence))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function enhancePinterestFoodPhotoPrompt(prompt = '', placement = 'middle') {
  const base = stripOverlayDirections(removePreviousRequirements(prompt));
  const reservedArea = placement === 'top'
    ? 'Keep the top third visually calm enough for a later title overlay while the hero food remains dominant below it.'
    : placement === 'bottom'
      ? 'Keep the bottom third visually calm enough for a later title overlay while the hero food remains dominant above it.'
      : 'Keep the center band visually calm but still filled with recognizable food texture so later exact title lettering will feel integrated.';
  return `${base}

PINTEREST CLEAN FOOD PHOTO REQUIREMENTS:
- Generate only a clean, high-resolution vertical food photograph. Do not render any text, letters, numbers, logos, labels, badges, ribbons, panels, borders, or watermarks.
- The image must pass as a real premium food-blog photograph at first glance. Show the exact finished recipe in one full-bleed, appetite-first scene.
${pinterestPhotorealismRules(base)}
${pinterestAppetiteDirection(base)}
${pinterestIngredientRealityRules(base)}
- Show only ingredients, garnishes, cookware, and textures supported by the source. Avoid plastic food, excessive blur, dark restaurant lighting, impossible cheese pulls, duplicated food, distorted utensils, unrelated props, and generic stock-photo styling.
- ${reservedArea}
- The final image will receive exact typography locally after generation, so preserve strong visual hierarchy and do not attempt to draw text.`;
}

function enhancePinterestAiTextPrompt(prompt = '', placement = 'middle', overlayText = '', fontStyle = '') {
  const base = stripTextProhibitions(stripOverlayDirections(removePreviousRequirements(prompt)));
  const headline = String(overlayText || '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  const placementInstruction = placement === 'top'
    ? 'Place the headline in the upper quarter, centered horizontally, with generous top and side margins. Keep the hero subject strongest below it.'
    : placement === 'bottom'
      ? 'Place the headline in the lower quarter, centered horizontally, with generous bottom and side margins. Keep the hero subject strongest above it.'
      : 'Place the headline slightly above the visual center, centered horizontally, without covering the most appetizing detail.';
  const lettering = String(fontStyle || 'bold modern geometric sans-serif lettering').trim();
  const layoutInstruction = isLikelyCollagePrompt(base)
    ? 'Use the requested two or three photo collage with one dominant hero panel and consistent realistic photography.'
    : 'Use one full-bleed scene with one clear hero subject. Do not use a collage or split layout.';
  return `Create a premium vertical Pinterest food photograph that looks genuinely photographed, not illustrated or AI-generated.

${base}

PINTEREST IMAGE AND LETTERING BRIEF:
- Create one high-resolution vertical 2:3 image of the exact finished recipe. Make it full-bleed, close, bright, natural, and instantly appetizing on a phone screen. ${layoutInstruction}
${pinterestPhotorealismRules(base)}
- Render only this exact headline once: "${headline}". Copy every character exactly. Do not add punctuation or any other words.
- Set it in ${lettering}, using one font and 2-4 balanced lines. Use clean kerning, tight readable line spacing, and large mobile-readable letters. Never use script, mixed fonts, warped letters, or 3D effects.
- ${placementInstruction} Keep the headline within 68-76% of the canvas width and leave comfortable margins.
- Use warm-white letters with a thin charcoal keyline and a short soft shadow. On a very light area, reverse to charcoal letters with a thin warm-white keyline. Add only a small feathered darkening immediately beneath the letters so its edges disappear into the photo.
- Keep the recipe image dominant. No visible rectangle, full-width bar, ribbon, frosted panel, badge, border, logo, watermark, URL, subtitle, CTA, decorative marks, or extra words.`;
}

function isPinterestAiLetteringPrompt(prompt = '') {
  return /PINTEREST (?:AI LETTERING REQUIREMENTS|IMAGE AND LETTERING BRIEF):/.test(String(prompt || ''));
}

module.exports = {
  PINTEREST_FOOD_GUARDRAIL_MARKER,
  isLikelyFoodPrompt,
  pinterestAiOverlayTreatment,
  stripPinterestCollageDirections,
  isLikelyDrinkPrompt,
  isLikelyBowlPrompt,
  isLikelyCollagePrompt,
  pinterestPhotographyDirection,
  pinterestPhotorealismRules,
  pinterestAppetiteDirection,
  pinterestIngredientRealityRules,
  removePreviousRequirements,
  JULY_25_AI_MARKER,
  enhancePinterestOriginalJulyAiPrompt,
  enhancePinterestJuly25AiPrompt,
  enhancePinterestLegacyAiPrompt,
  enhancePinterestPromptLedAiPrompt,
  enhancePinterestAiTextPrompt,
  enhancePinterestImagePrompt,
  enhancePinterestFoodPhotoPrompt,
  isPinterestAiLetteringPrompt,
  isPromptLedPinterestCreative,
  stripTextProhibitions,
  stripOverlayDirections
};
