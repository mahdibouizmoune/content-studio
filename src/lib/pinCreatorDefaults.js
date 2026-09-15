export const PIN_PROMPT_DEFAULTS_VERSION = 15;

export const RETIRED_PIN_STYLE_IDS = [
  "custom-ingredient-closeup",
  "custom-recipe-card",
  "custom-weeknight-solution",
  "custom-listicle-collage"
];

export const DEFAULT_PIN_CUSTOM_STYLES = {
  "custom-july-original-ai": {
    name: "Ingredient Closeup Pin",
    prompt: [
      "Create one complete vertical 2:3 recipe Pin with an ultra-realistic, full-bleed close-up of the exact freshly finished dish or drink. Make one generous hero serving and its most delicious source-supported texture instantly recognizable at phone size.",
      "Use a real full-frame food-photography look, natural close perspective, large diffused side-window light, soft bounce fill, truthful white balance, controlled highlights, and open natural shadows. Preserve believable crumbs, fibers, browning, moisture, sauce viscosity, condensation, or fresh crunch supported by the recipe, with subtle handmade irregularity.",
      "Render the supplied short recipe headline exactly once in the center, in large bold uppercase white sans-serif lettering inside a compact translucent rounded panel colored from the food.",
      "Keep the food visible around and through the panel. Add no other words, number, subtitle, CTA, footer, collage, URL, logo, icon, badge, label, packaging, or watermark. Avoid fake steam, excessive glaze, oily pools, plastic perfection, neon saturation, invented garnish, duplicated food, CGI, and illustration."
    ].join("\n")
  },
  "custom-modern-recipe-magazine": {
    name: "Modern Recipe Magazine",
    prompt: [
      "Create a premium vertical 2:3 editorial food photograph of the exact finished recipe, like a modern cooking magazine cover photographed with a real camera.",
      "Show one generous hero serving from the most flattering close overhead, 30-45 degree, or eye-level angle. Let it fill 72-86% of the frame and leave a calm upper quarter for the app's editorial masthead.",
      "Use a real full-frame camera look, large diffused side-window light, soft bounce fill, accurate white balance, controlled highlights, and open natural shadows. Keep the hero bite and surrounding food sharp, with recipe-supported browned edges, natural sauce viscosity, moist crumb, creamy layers, fresh crunch, or condensation.",
      "Use only one or two source-relevant props. Generate no text, labels, panels, logos, or watermarks. Avoid fake steam, excessive gloss, invented garnish, duplicate food, distorted utensils, plastic texture, harsh HDR, muddy shadows, heavy orange casts, neon saturation, CGI, and illustration."
    ].join("\n")
  },
  "custom-minimal-editorial": {
    name: "Minimal Editorial",
    prompt: [
      "Create a refined vertical 2:3 food-editorial photograph of the exact finished recipe with one unmistakable hero subject and clean visual restraint.",
      "Crop close enough for appetite and mobile recognition, but preserve purposeful breathing room in the upper quarter for direct local typography. Use a simple neutral surface and no more than one source-relevant prop.",
      "Use large soft directional daylight, realistic contrast, truthful ingredient color, open natural shadows, crisp focal texture, and gentle background falloff without blurring the important food. Preserve a freshly prepared look and small handmade irregularities.",
      "Generate no text, panels, ribbons, labels, buttons, logos, or watermarks. Avoid fake steam, excess glaze, invented ingredients, excessive garnish, duplicate food, synthetic symmetry, plastic shine, harsh HDR, dark restaurant lighting, neon saturation, CGI, and illustration."
    ].join("\n")
  }
};

export const DEFAULT_PIN_TITLE_DESC_PROMPT = [
  "You are a Pinterest search and conversion editor for a trusted recipe blog. Write one Pinterest title and one Pinterest description for this blog post:",
  "${url}",
  "",
  "Use the supplied source context, destination page topic, recipe name, ingredients, cooking method, reader benefit, board context, and verified search evidence.",
  "${interestsNote}",
  "",
  "TITLE RULES:",
  "- Return one accurate title between 50 and 100 characters.",
  "- Put the exact main searchable recipe phrase naturally within the first 40 characters whenever possible.",
  "- Add one concrete source-supported differentiator such as method, main flavor, texture, occasion, verified time, or meal use.",
  "- Align the wording with the selected board and primary Pinterest use case without repeating the board name mechanically.",
  "- Prefer specific search language a cook would use over vague words such as amazing, ultimate, best, or viral.",
  "- Use a verified trend or seasonal phrase only when the supplied evidence directly matches this recipe. Otherwise use evergreen search intent.",
  "- Use natural Title Case and plain text.",
  "- Do not use emojis, clickbait, hashtags, quotation marks, unsupported claims, or em dashes.",
  "",
  "DESCRIPTION RULES:",
  "- Return one description between 300 and 500 characters in 2-3 natural sentences.",
  "- Make the first 100 characters useful on their own: identify the exact recipe and its strongest verified benefit or use case.",
  "- Weave in 2-4 accurate related phrases from ingredients, method, flavor, texture, occasion, and board context without repeating the main keyword.",
  "- Explain what the dish is, why a cook would save it, and one source-supported cooking, serving, storage, or occasion detail.",
  "- End with a natural action such as save this recipe for later or visit for the complete ingredients and instructions.",
  "- Use current trend evidence only when directly relevant. Never force a trend, year, health promise, time claim, or ingredient that the source does not support.",
  "- Keep it evergreen. Do not include a URL, price, temporary promotion, first-person aside, or wording that will age quickly.",
  "- Use plain text only. No Markdown bold, hashtags, emojis, keyword lists, keyword stuffing, generic filler, invented metrics, or em dashes.",
  "",
  "OUTPUT FORMAT:",
  "Title: [title]",
  "Description: [description]",
  "Overlay: [one exact 3-7 word keyword-led phrase naming the dish]"
].join("\n");

export function mergePinCustomStyles(customStyles = {}) {
  const retiredStyles = new Set(RETIRED_PIN_STYLE_IDS);
  const safeCustomStyles = customStyles && typeof customStyles === "object" && !Array.isArray(customStyles)
    ? Object.fromEntries(Object.entries(customStyles).filter(([id, style]) => (
      !retiredStyles.has(id) && style && typeof style === "object" && !Array.isArray(style)
    )))
    : {};
  return { ...DEFAULT_PIN_CUSTOM_STYLES, ...safeCustomStyles };
}

export function normalizePinCreatorDefaults(pinCreator = {}) {
  return {
    ...pinCreator,
    customStyles: mergePinCustomStyles(pinCreator.customStyles),
    titleDescPrompt: pinCreator.titleDescPrompt || DEFAULT_PIN_TITLE_DESC_PROMPT,
    promptDefaultsVersion: PIN_PROMPT_DEFAULTS_VERSION
  };
}
