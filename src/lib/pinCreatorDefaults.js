export const DEFAULT_PIN_CUSTOM_STYLES = {
  "custom-ingredient-closeup": {
    name: "Ingredient Closeup Pin",
    prompt: [
      "Create a vertical 2:3 Pinterest food pin led by a photorealistic, appetite-first close-up of the finished dish or one fork-ready hero bite.",
      "Fill roughly 65-80% of the canvas with the food. Use a tight 30-45 degree or overhead food-photography angle that shows the recipe clearly, with one plate or bowl edge still visible.",
      "Make the most desirable truthful texture sharply visible, such as browned crisp edges, glossy sauce, a tender center, creamy layers, fresh garnish, or melted cheese. Use gentle steam only when the food should be hot.",
      "Use bright diffused side-window light, natural shadows, true ingredient colors, realistic portions, and subtle home-cooked imperfections. Avoid plastic-looking food, extreme blur, dark restaurant lighting, or an overstyled table.",
      "Add one bold 3-7 word keyword-led text panel in the placement supplied by the app. Keep it off the hero bite, readable at mobile thumbnail size, and supported by the source.",
      "Create click curiosity by showing a clear delicious result people can imagine making, not through vague hype, invented ingredients, fake time or health claims, logos, tiny text, or clutter."
    ].join("\n")
  },
  "custom-recipe-card": {
    name: "Recipe Card Traffic Pin",
    prompt: [
      "Create a vertical 2:3 Pinterest traffic pin for a recipe blog post.",
      "Use a photorealistic tight close-up of the finished dish as the dominant background. Fill roughly 65-80% of the canvas with a sharply focused hero serving and show accurate appetizing texture.",
      "Use bright diffused side-window light, natural shadows, true food color, realistic portions, and a lightly styled home-kitchen setting with enough clean negative space.",
      "Add one clean recipe-card panel in the placement supplied by the app with strong contrast and generous mobile safe margins.",
      "Use a 4-7 word keyword-led overlay that names the dish and gives one accurate reason to save or click.",
      "Use one verified recipe cue only when supported by the source, such as 30 Min, One Pan, Make Ahead, or Family Dinner.",
      "Keep the hero bite unobstructed and the card secondary. No invented garnish, plastic-looking food, unsupported nutrition claims, fake times, logos, tiny text, edge text, or clutter."
    ].join("\n")
  },
  "custom-weeknight-solution": {
    name: "Weeknight Solution Pin",
    prompt: [
      "Create a vertical 2:3 Pinterest pin for a practical weeknight recipe or meal idea.",
      "Use a photorealistic close-up of the finished dish or plated serving, filling roughly 65-80% of the frame with crisp, saucy, creamy, or tender texture clearly visible as appropriate.",
      "Use bright natural side light, realistic portions, true ingredient colors, and a simple home dinner or meal-prep context without distracting props.",
      "Use a 4-7 word headline in the placement supplied by the app, focused on an accurate time, cleanup, make-ahead, family, or ingredient benefit.",
      "Keep the food sharply focused, approachable, and dominant. Use strong mobile contrast and generous safe margins.",
      "Avoid luxury restaurant styling, fake steam, invented ingredients, vague clickbait, unsupported budget or health claims, tiny text, edge text, and clutter."
    ].join("\n")
  },
  "custom-listicle-collage": {
    name: "Recipe Listicle Collage",
    prompt: [
      "Create a vertical 2:3 Pinterest collage pin for a recipe roundup or listicle.",
      "Use 3 clean photorealistic close-up food panels with consistent bright natural lighting, clearly different relevant dishes, sharply visible texture, and simple dividers.",
      "Crop each dish tightly enough to feel appetizing while keeping it recognizable. Use realistic portions, true ingredient colors, and no repeated or invented food.",
      "Add one bold overlay in the placement supplied by the app using the exact list number and main keyword from the source.",
      "Keep the headline to 3-7 words and readable at mobile size. Avoid repeated images, fake list numbers, edge text, and crowded layouts."
    ].join("\n")
  }
};

export const DEFAULT_PIN_TITLE_DESC_PROMPT = [
  "You are a Pinterest SEO writer for a recipe blog. Write one Pinterest title and one Pinterest description for this blog post:",
  "${url}",
  "",
  "Use the supplied source context, destination page topic, recipe name, ingredients, cooking method, reader benefit, and search intent.",
  "${interestsNote}",
  "",
  "TITLE RULES:",
  "- Return one accurate title under 100 characters.",
  "- Put the main searchable recipe keyword near the front.",
  "- Add one concrete differentiator supported by the source, such as method, flavor, occasion, time, or texture.",
  "- Use natural Title Case and plain text.",
  "- Do not use emojis, clickbait, hashtags, quotation marks, unsupported claims, or em dashes.",
  "",
  "DESCRIPTION RULES:",
  "- Return one description between 220 and 500 characters.",
  "- Write 2-3 natural sentences for a person deciding whether to save or visit the recipe.",
  "- Mention the main keyword in the first sentence.",
  "- Include 2-4 closely related phrases only when they accurately describe this recipe.",
  "- Mention a useful outcome, cooking cue, occasion, or source-supported benefit, then end with a natural save or visit CTA.",
  "- Use plain text only. No Markdown bold, hashtags, emojis, keyword lists, keyword stuffing, generic filler, invented metrics, or em dashes.",
  "",
  "OUTPUT FORMAT:",
  "Title: [title]",
  "Description: [description]"
].join("\n");

export function mergePinCustomStyles(customStyles = {}) {
  const safeCustomStyles = customStyles && typeof customStyles === "object" && !Array.isArray(customStyles)
    ? Object.fromEntries(Object.entries(customStyles).filter(([, style]) => style && typeof style === "object" && !Array.isArray(style)))
    : {};
  return { ...DEFAULT_PIN_CUSTOM_STYLES, ...safeCustomStyles };
}

export function normalizePinCreatorDefaults(pinCreator = {}) {
  return {
    ...pinCreator,
    customStyles: mergePinCustomStyles(pinCreator.customStyles),
    titleDescPrompt: pinCreator.titleDescPrompt || DEFAULT_PIN_TITLE_DESC_PROMPT,
    promptDefaultsVersion: 2
  };
}
