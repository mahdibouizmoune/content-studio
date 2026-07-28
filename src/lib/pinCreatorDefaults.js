export const DEFAULT_PIN_CUSTOM_STYLES = {
  "custom-ingredient-closeup": {
    name: "Ingredient Closeup Pin",
    prompt: [
      "Create a vertical 2:3 Pinterest food pin led by premium photorealistic, appetite-first editorial photography of the exact finished dish.",
      "Fill roughly 65-80% of the canvas with one complete hero serving or fork-ready bite. Use a tight 30-45 degree or overhead angle that clearly identifies the recipe, with one plate or bowl edge visible.",
      "Make the most desirable source-supported texture sharply visible, such as browned crisp edges, glossy sauce, a tender center, creamy layers, fresh garnish, or melted cheese. Use gentle steam only when the dish should be hot.",
      "Use bright diffused side-window light, natural shadows, true ingredient colors, realistic portions, and subtle home-cooked imperfections. Avoid plastic-looking food, excessive blur, dark restaurant lighting, or an overstyled table.",
      "Reserve clean space in the placement supplied by the app for exactly one bold 3-7 word headline on a simple high-contrast panel. Keep the headline off the best food detail and add no other text.",
      "Create click curiosity through a clear delicious result people can imagine making. Do not invent ingredients, garnish, timing, nutrition, or preparation claims."
    ].join("\n")
  },
  "custom-recipe-card": {
    name: "Recipe Card Traffic Pin",
    prompt: [
      "Create a vertical 2:3 Pinterest recipe traffic pin with one premium full-bleed photorealistic close-up of the exact finished dish.",
      "Fill roughly 65-80% of the canvas with a sharply focused hero serving. Use bright diffused side-window light, realistic texture, true food color, natural shadows, and a warm lightly styled home-kitchen setting.",
      "Reserve about one quarter of the canvas in the placement supplied by the app for a clean solid or softly translucent title panel. The panel must feel integrated with the photograph, not like a busy app card.",
      "Render exactly one 4-7 word keyword-led headline that names the dish. Add one short source-verified cue such as 30 Min or One Pan only when it is genuinely supported, and add no other text.",
      "Use strong mobile contrast, generous safe margins, and a calm visual hierarchy. Keep the appetite-first hero food dominant, recognizable, and unobstructed.",
      "No invented garnish, fake timing or health claims, multiple badges, tiny text, logos, decorative clutter, or plastic-looking food."
    ].join("\n")
  },
  "custom-weeknight-solution": {
    name: "Weeknight Solution Pin",
    prompt: [
      "Create a vertical 2:3 Pinterest pin that presents the exact recipe as an achievable weeknight meal.",
      "Show a tight photorealistic hero view of the complete plated serving or serving dish on a real home table, filling roughly 65-80% of the frame. Use a natural 30-45 degree or overhead angle and include one restrained dinner cue without adding unrelated ingredients.",
      "Use bright side-window light, true food color, realistic portions, crisp source-supported texture, and an approachable lived-in feeling without plastic shine or overprocessing.",
      "Reserve the placement supplied by the app for exactly one 4-7 word headline focused on a source-supported time, cleanup, make-ahead, or family benefit.",
      "Use a simple high-contrast text panel and generous mobile safe margins. Add no extra captions or badges.",
      "Avoid luxury restaurant styling, fake steam, invented ingredients, vague hype, unsupported budget or health claims, and crowded props."
    ].join("\n")
  },
  "custom-listicle-collage": {
    name: "Recipe Listicle Collage",
    prompt: [
      "Create a vertical 2:3 Pinterest collage pin for a recipe roundup or listicle.",
      "Use two or three premium photorealistic close-up food photographs from the exact source theme. Make one appetite-first image dominant and the others supporting, with consistent bright natural lighting, sharply visible texture, and simple dividers.",
      "Crop every dish tightly enough to feel immediately appetizing while keeping it recognizable. Use realistic portions and true ingredient colors. Do not repeat the same dish or invent food.",
      "Reserve a calm area in the placement supplied by the app for exactly one bold 3-7 word headline using the source list number and main keyword.",
      "Keep the layout spacious and readable at mobile size with no subtitle, badge, logo, or extra lettering. Avoid equal-size crowded grids and generic stock imagery."
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
    promptDefaultsVersion: 4
  };
}
