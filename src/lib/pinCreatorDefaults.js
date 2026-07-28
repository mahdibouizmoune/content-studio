export const DEFAULT_PIN_CUSTOM_STYLES = {
  "custom-ingredient-closeup": {
    name: "Ingredient Closeup Pin",
    prompt: [
      "Create a vertical 2:3 Pinterest food pin led by ultra-realistic, premium appetite-first editorial photography of the exact finished dish.",
      "Fill roughly 70-82% of the canvas with one close-up hero serving or fork-ready bite. Use a tight 30-45 degree or overhead angle that clearly identifies the recipe, with enough plate or bowl edge visible for recognition.",
      "Make the most desirable source-supported texture tack-sharp, such as browned crisp edges, glossy sauce, a tender center, creamy layers, fresh garnish, or melted cheese. Show natural micro-texture and use gentle steam only when the dish should be hot.",
      "Use bright diffused side-window light, natural shadows, true ingredient colors, realistic portions, and subtle home-cooked imperfections. Avoid plastic-looking food, excessive blur, dark restaurant lighting, or an overstyled table.",
      "Place exactly one bold 3-7 word headline in the app-supplied placement on a full-width translucent frosted-glass ribbon. Use a premium geometric sans-serif, clean kerning, balanced line breaks, generous padding, and high contrast while keeping the recipe visible beneath it.",
      "Create click curiosity through a clear delicious result people can imagine making. Do not invent ingredients, garnish, timing, nutrition, or preparation claims."
    ].join("\n")
  },
  "custom-recipe-card": {
    name: "Recipe Card Traffic Pin",
    prompt: [
      "Create a vertical 2:3 Pinterest recipe traffic pin with one ultra-realistic premium full-bleed close-up of the exact finished dish.",
      "Fill roughly 70-82% of the canvas with a tack-sharp hero serving. Use bright diffused side-window light, realistic micro-texture, true food color, natural shadows, and a warm lightly styled home-kitchen setting.",
      "Reserve the app-supplied placement for a refined full-width frosted-glass title ribbon. Keep it translucent enough that the recipe remains visible beneath it and avoid any solid opaque card.",
      "Render exactly one 4-7 word keyword-led headline that names the dish. Add one short source-verified cue such as 30 Min or One Pan only when it is genuinely supported, and add no other text.",
      "Use strong mobile contrast, generous safe margins, and a calm visual hierarchy. Keep the appetite-first hero food dominant, recognizable, and unobstructed.",
      "No invented garnish, fake timing or health claims, multiple badges, tiny text, logos, decorative clutter, or plastic-looking food."
    ].join("\n")
  },
  "custom-weeknight-solution": {
    name: "Weeknight Solution Pin",
    prompt: [
      "Create a vertical 2:3 Pinterest pin that presents the exact recipe as an achievable weeknight meal.",
      "Show an ultra-realistic tight hero view of the complete plated serving or serving dish on a real home table, filling roughly 70-82% of the frame. Use a natural 30-45 degree or overhead angle and include one restrained dinner cue without adding unrelated ingredients.",
      "Use bright side-window light, true food color, realistic portions, crisp source-supported texture, and an approachable lived-in feeling without plastic shine or overprocessing.",
      "Reserve the placement supplied by the app for exactly one 4-7 word headline focused on a source-supported time, cleanup, make-ahead, or family benefit.",
      "Use a full-width translucent frosted-glass ribbon, premium bold geometric sans-serif, generous mobile safe margins, and balanced line breaks. Keep the food visible beneath it and add no extra captions or badges.",
      "Avoid luxury restaurant styling, fake steam, invented ingredients, vague hype, unsupported budget or health claims, and crowded props."
    ].join("\n")
  },
  "custom-listicle-collage": {
    name: "Recipe Listicle Collage",
    prompt: [
      "Create a vertical 2:3 Pinterest collage pin for a recipe roundup or listicle.",
      "Use two or three ultra-realistic premium close-up food photographs from the exact source theme. Make one appetite-first image dominant and the others supporting, with consistent bright natural lighting, tack-sharp texture, and simple dividers.",
      "Crop every dish tightly enough to feel immediately appetizing while keeping it recognizable. Use realistic portions and true ingredient colors. Do not repeat the same dish or invent food.",
      "Place exactly one bold 3-7 word headline using the source list number and main keyword on a full-width translucent frosted-glass ribbon in the app-supplied placement.",
      "Keep the layout spacious and readable at mobile size with no subtitle, badge, logo, or extra lettering. Avoid equal-size crowded grids and generic stock imagery."
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
  "- Return one accurate title between 45 and 95 characters.",
  "- Put the exact main searchable recipe phrase naturally within the first 40 characters whenever possible.",
  "- Add one concrete source-supported differentiator such as method, flavor, texture, occasion, time, or meal use.",
  "- Prefer specific search language a cook would use over vague words such as amazing, ultimate, best, or viral.",
  "- Use a verified trend or seasonal phrase only when the supplied evidence directly matches this recipe. Otherwise use evergreen search intent.",
  "- Use natural Title Case and plain text.",
  "- Do not use emojis, clickbait, hashtags, quotation marks, unsupported claims, or em dashes.",
  "",
  "DESCRIPTION RULES:",
  "- Return one description between 250 and 450 characters in 2-3 natural sentences.",
  "- Put the main recipe phrase in the first sentence, then weave in 2-3 accurate related phrases without repeating the same wording.",
  "- Explain what the dish is, what makes this version useful or desirable, and one source-supported cooking, texture, serving, or occasion detail.",
  "- End with a natural action such as save this recipe or visit for the full ingredients and instructions.",
  "- Use current trend evidence only when directly relevant. Never force a trend, year, health promise, time claim, or ingredient that the source does not support.",
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
    promptDefaultsVersion: 5
  };
}
