import { recommendedCollectionLength } from "./recipeTitle.mjs";

const smartStopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "best", "by", "for", "from", "how", "in", "into", "is", "it", "make", "of", "on", "or", "that", "the", "this", "to", "with", "you", "your",
  "recipe", "recipes", "easy", "simple", "ideas", "idea"
]);

const INTENT_PROFILES = [
  {
    id: "air-fryer",
    label: "Air Fryer Recipe",
    match: /air fryer|air fried|crispy air/i,
    articleLength: "1400-1800",
    searchIntent: "informational",
    brandVoiceId: "voice-recipe-authority",
    pinStyle: "custom-ingredient-closeup",
    boards: [/air fryer/i, /quick/i, /easy dinner/i],
    keywords: ["air fryer recipe", "crispy air fryer", "quick air fryer dinner", "easy air fryer meal", "air fryer tips"],
    audience: "Home cooks who want crisp, reliable air fryer results with clear timing, temperature, and texture cues.",
    notes: [
      "Include temperature, timing, basket spacing, flipping or shaking cues, doneness signs, and reheating tips.",
      "Explain how to avoid soggy texture and how to adapt timing for different air fryer models.",
      "Use Pinterest angles around crisp texture, speed, and easy cleanup."
    ]
  },
  {
    id: "quick-weeknight",
    label: "Quick Weeknight Recipe",
    match: /weeknight|30 minute|quick|fast|easy dinner|busy|family dinner|one pan|one pot|sheet pan|skillet/i,
    articleLength: "1400-1800",
    searchIntent: "informational",
    brandVoiceId: "voice-recipe-friendly",
    pinStyle: "custom-weeknight-solution",
    boards: [/weeknight/i, /quick/i, /dinner/i, /one pot/i, /one pan/i, /easy recipe/i],
    keywords: ["easy weeknight dinner", "quick dinner recipe", "family dinner", "one pan meal", "meal prep"],
    audience: "Busy home cooks and families who want reliable dinners with practical prep, storage, and serving ideas.",
    notes: [
      "Lead with time saved, family usefulness, flavor payoff, and why the recipe works on a busy night.",
      "Include ingredient roles, shortcut options, substitutions, storage, reheating, serving ideas, and FAQ.",
      "Make the post easy to turn into Pinterest pins with clear benefit-led phrases and visual food details."
    ]
  },
  {
    id: "healthy-protein",
    label: "Healthy High-Protein Recipe",
    match: /healthy|protein|high protein|meal prep|clean eating|low calorie|low carb|wellness|eat well/i,
    articleLength: "1400-1800",
    searchIntent: "informational",
    brandVoiceId: "voice-recipe-authority",
    pinStyle: "custom-ingredient-closeup",
    boards: [/healthy/i, /protein/i, /meal prep/i, /clean eating/i, /wellness/i],
    keywords: ["healthy recipe", "high protein recipe", "meal prep", "clean eating", "healthy dinner"],
    audience: "Health-conscious home cooks who want practical recipes without unsupported diet claims.",
    notes: [
      "Keep health language realistic and avoid unsupported medical or weight-loss claims.",
      "Explain filling ingredients, smart swaps, make-ahead notes, storage, reheating, and balanced serving ideas.",
      "Use natural semantic terms around protein, vegetables, meal prep, and everyday wellness."
    ]
  },
  {
    id: "dessert-baking",
    label: "Dessert And Baking",
    match: /dessert|cake|cookie|brownie|pie|chocolate|sweet|no bake|cheesecake|muffin|cupcake/i,
    articleLength: "1400-1800",
    searchIntent: "informational",
    brandVoiceId: "voice-recipe-authority",
    pinStyle: "custom-ingredient-closeup",
    boards: [/dessert/i, /cookie/i, /chocolate/i, /baking/i],
    keywords: ["dessert recipe", "baking tips", "easy dessert", "sweet treat", "make ahead dessert"],
    audience: "Home bakers and dessert lovers who want dependable texture, timing, storage, and serving tips.",
    notes: [
      "Include texture cues, doneness signs, troubleshooting, storage, make-ahead notes, and serving ideas.",
      "Mention exact visual cues a reader can use while baking or chilling.",
      "Make the title and Pinterest copy specific to the dessert type, flavor, and occasion."
    ]
  },
  {
    id: "seasonal-occasion",
    label: "Seasonal Or Occasion Recipe",
    match: /holiday|thanksgiving|christmas|easter|fall|summer|spring|party|potluck|game day|bbq|cookout/i,
    articleLength: "1400-1800",
    searchIntent: "commercial",
    brandVoiceId: "voice-pinterest-click",
    pinStyle: "custom-recipe-card",
    boards: [/holiday/i, /fall/i, /spring/i, /summer/i, /party/i, /appetizer/i],
    keywords: ["holiday recipe", "party food", "potluck recipe", "seasonal recipe", "crowd pleasing"],
    audience: "Readers planning seasonal menus, parties, potlucks, and save-worthy food ideas.",
    notes: [
      "Call out the occasion, make-ahead value, serving size, transport tips, and crowd-pleasing angle.",
      "Add pairing ideas and planning notes so the article is useful beyond the basic recipe.",
      "Use seasonal terms naturally in headings, meta, Pinterest title, and description."
    ]
  },
  {
    id: "drink",
    label: "Drinks And Sippers",
    match: /mocktail|non alcoholic|drink|cocktail|sipper|lemonade|smoothie|iced|latte|beverage/i,
    articleLength: "900-1200",
    searchIntent: "commercial",
    brandVoiceId: "voice-pinterest-click",
    pinStyle: "custom-recipe-card",
    boards: [/mocktail/i, /drink/i, /cocktail/i, /sipper/i, /smoothie/i],
    keywords: ["drink recipe", "mocktail recipe", "non alcoholic drink", "party drink", "summer sipper"],
    audience: "Readers looking for visual drinks, party sippers, non-alcoholic options, and easy entertaining ideas.",
    notes: [
      "Explain flavor profile, garnish, glassware, batching, make-ahead tips, and non-alcoholic options where relevant.",
      "Make the Pinterest angle visual, refreshing, and occasion-specific.",
      "Avoid implying alcohol-free health benefits beyond reasonable ingredient descriptions."
    ]
  },
  {
    id: "listicle-roundup",
    label: "Recipe Roundup",
    match: /\b\d+\b|roundup|list|ideas|collection|best|cheap|cozy|saved over|under|for busy/i,
    articleLength: "1400-1800",
    searchIntent: "informational",
    brandVoiceId: "voice-pinterest-click",
    pinStyle: "custom-listicle-collage",
    boards: [/viral/i, /recipe ideas/i, /easy recipe/i, /quick/i, /dinner/i],
    keywords: ["recipe roundup", "easy recipe ideas", "save this recipe", "dinner ideas", "Pinterest recipes"],
    audience: "Pinterest and search visitors comparing multiple recipe ideas they can save for later.",
    notes: [
      "Make each list item distinct with a specific benefit, flavor, occasion, prep shortcut, or ingredient angle.",
      "Avoid repeating the same description pattern across items.",
      "Add a concise buying, prep, storage, or planning takeaway for each idea when useful."
    ]
  }
];

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value = "") {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 2 && !smartStopWords.has(token));
}

function unique(items = []) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

export function inferSmartIntent(input = {}) {
  const haystack = [
    input.title,
    input.generatedTitle,
    input.category,
    input.type,
    input.sourceTitle,
    input.url,
    input.seoBrief?.targetKeyword,
    input.seoBrief?.secondaryKeywords,
    input.metaDescription,
    input.excerpt,
    input.content
  ].filter(Boolean).join(" ");
  const normalized = normalize(haystack);
  const scored = INTENT_PROFILES.map((profile) => {
    let score = profile.match.test(haystack) ? 50 : 0;
    for (const keyword of profile.keywords) {
      if (normalized.includes(normalize(keyword))) score += 12;
    }
    if (input.type === "listicle" && profile.id === "listicle-roundup") score += 35;
    return { ...profile, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best?.score > 0 ? best : INTENT_PROFILES.find((profile) => profile.id === "quick-weeknight");
}

export function smartKeywordRoot(title = "") {
  const root = tokens(title).slice(0, 5).join(" ");
  return root || normalize(title) || "recipe idea";
}

export function buildSmartSeoBrief({ title = "", mode = "article", settings = {}, preset = {}, manual = {} } = {}) {
  const profile = inferSmartIntent({ title, type: mode, seoBrief: manual });
  const keywordRoot = manual.targetKeyword || smartKeywordRoot(title);
  const secondary = unique([
    preset.secondaryKeywords,
    manual.secondaryKeywords,
    ...profile.keywords,
    `${keywordRoot} recipe`,
    `easy ${keywordRoot}`,
    `how to make ${keywordRoot}`,
    "storage tips",
    "substitutions",
    "serving ideas"
  ]).join(", ");
  const smartNotes = [
    `Smart intent: ${profile.label}.`,
    ...profile.notes,
    `Primary reader task: Help ${profile.audience.charAt(0).toLowerCase()}${profile.audience.slice(1)} complete the recipe successfully without needing another page.`,
    "Lead with the direct answer, then add practical depth. Do not pad the article to reach a word count.",
    "Create original value through exact cooking cues, ingredient roles, troubleshooting, realistic substitutions, storage, reheating, and serving context.",
    "Include at least one recipe-specific decision aid: ingredient selection, scaling, pan or appliance adjustment, early failure warning, or rescue technique.",
    "Make every paragraph earn its place by helping the reader decide, prepare, cook, troubleshoot, serve, store, or adapt the recipe.",
    "Use the primary topic naturally near the opening and in one useful heading when appropriate, then use close variants rather than repeating the exact phrase.",
    "Never claim the recipe was personally tested, reviewed, award-winning, viral, or medically beneficial unless the source material explicitly proves it.",
    "Keep quantities, yield, timing, temperatures, ingredients, method, and recipe schema internally consistent.",
    "Use clear H2/H3 structure, concise paragraphs, FAQ where useful, and internal-link-friendly anchor phrases.",
    "Support recipe rich results with recipe name, useful description, prep time, cook time, total time, servings, ingredients, ordered steps, notes, and realistic image context.",
    "For Pinterest, identify one concrete visual promise and one practical benefit instead of generic recipe wording.",
    "Do not mention private Pinterest analytics, SEO instructions, competitor notes, or prompt rules in the published article."
  ].join("\n");
  return {
    targetKeyword: keywordRoot,
    secondaryKeywords: secondary,
    searchIntent: preset.searchIntent || manual.searchIntent || profile.searchIntent || settings.defaultSearchIntent || "informational",
    audience: preset.audience || manual.audience || settings.defaultAudience || profile.audience,
    readerTask: manual.readerTask || `Cook or choose ${keywordRoot} confidently with clear ingredients, method, doneness cues, and storage guidance.`,
    contentDifferentiator: manual.contentDifferentiator || `Practical ${profile.label.toLowerCase()} guidance with consistent recipe details, troubleshooting, and visual cues.`,
    requiredTopics: unique([keywordRoot, ...profile.keywords, "ingredients", "instructions", "doneness cues", "substitutions", "storage", "reheating"]).join(", "),
    competitorNotes: unique([preset.competitorNotes, manual.competitorNotes, smartNotes]).join("\n\n")
  };
}

export function buildSmartArticleDefaults({ title = "", mode = "article", settings = {}, preset = {}, manual = {} } = {}) {
  const profile = inferSmartIntent({ title, type: mode, seoBrief: manual });
  const seoBrief = buildSmartSeoBrief({ title, mode, settings, preset, manual });
  const recommendedArticleLength = recommendedCollectionLength(title, mode) || profile.articleLength || "900-1200";
  return {
    smartIntentId: profile.id,
    smartIntentLabel: profile.label,
    smartPinStyle: profile.pinStyle,
    articleLength: manual.articleLength || preset.articleLength || recommendedArticleLength || settings.articleLength,
    recommendedArticleLength,
    brandVoiceId: manual.brandVoiceId || preset.brandVoiceId || profile.brandVoiceId || "",
    recipeCardEnabled: preset.recipeCardEnabled ?? settings.recipeCardEnabled ?? true,
    category: mode === "listicle" ? "food" : "default",
    seoBrief
  };
}

export function buildSmartGenerationSettings(article = {}, settings = {}) {
  const profile = inferSmartIntent(article);
  const existingBrief = article.seoBrief || {};
  const smartBrief = buildSmartSeoBrief({
    title: article.generatedTitle || article.title,
    mode: article.type || "article",
    settings,
    preset: {},
    manual: existingBrief
  });
  return {
    articleLength: recommendedCollectionLength(article.title, article.type) || profile.articleLength || "900-1200",
    brandVoiceId: profile.brandVoiceId || "",
    recipeCardEnabled: settings.recipeCardEnabled ?? true,
    seoBrief: {
      ...smartBrief,
      ...existingBrief,
      secondaryKeywords: unique([smartBrief.secondaryKeywords, existingBrief.secondaryKeywords]).join(", "),
      competitorNotes: unique([smartBrief.competitorNotes, existingBrief.competitorNotes]).join("\n\n")
    },
    smartIntent: profile
  };
}

export function smartPinSignals(pin = {}, board = "") {
  const profile = inferSmartIntent(pin);
  const titleRoot = smartKeywordRoot(pin.title || pin.sourceTitle || pin.url);
  return {
    profile,
    styleId: profile.pinStyle,
    boardPatterns: profile.boards,
    keywords: unique([
      ...(pin.interests || []),
      board,
      titleRoot,
      ...profile.keywords,
      "recipe inspiration",
      "easy recipe ideas",
      "save this recipe"
    ]).slice(0, 28)
  };
}

export function scoreSmartBoard(pin = {}, board = "") {
  const signals = smartPinSignals(pin, board);
  return signals.boardPatterns.reduce((score, pattern) => score + (pattern.test(board) ? 50 : 0), 0);
}
