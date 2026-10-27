import { parsePromisedRecipeCount } from "./recipeTitle.mjs";
import { toAscii } from "./ascii.mjs";
import { articleBriefPrompt } from "./articleBrief.mjs";

export const ARTICLE_SIZE_OPTIONS = [
  { value: "600-800", label: "Short", detail: "600-800 words" },
  { value: "900-1200", label: "Standard", detail: "900-1200 words" },
  { value: "1400-1800", label: "Long", detail: "1400-1800 words" },
  { value: "2200-2800", label: "Deep Dive", detail: "2200-2800 words" },
  { value: "3000-4000", label: "Recipe Collection", detail: "3000-4000 words" },
  { value: "4500-6000", label: "Large Collection", detail: "4500-6000 words" },
  { value: "6500-8500", label: "Extensive Collection", detail: "6500-8500 words" },
  { value: "8500-12000", label: "Extra Large Collection", detail: "8500-12000 words" }
];

const noEmDashInstruction = [
  "",
  "ARTICLE SIZE:",
  "Write this article at {articleLength} words.",
  "",
  "TITLE AND HEADING STYLE:",
  "Do not use em dashes in any title, H1, H2, H3, H4, H5, or H6. Use a comma, colon, or hyphen instead."
].join("\n");

export function stripHtml(html = "") {
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const recipeCardInstruction = [
  "",
  "RECIPE CARD:",
  "At the very end of the article, add a complete, reader-friendly recipe card using this exact structure:",
  "<section id=\"recipe-card\" class=\"recipe-card\" itemscope itemtype=\"https://schema.org/Recipe\">",
  "<h2>Recipe Card</h2>",
  "<h3 itemprop=\"name\">[Recipe Name]</h3>",
  "<p itemprop=\"description\">[Brief recipe summary]</p>",
  "<ul>",
  "<li><strong>Prep Time:</strong> [time]</li>",
  "<li><strong>Cook Time:</strong> [time]</li>",
  "<li><strong>Total Time:</strong> [time]</li>",
  "<li><strong>Servings:</strong> [number]</li>",
  "</ul>",
  "<h3>Ingredients</h3>",
  "<ul itemprop=\"recipeIngredient\"><li>[ingredient]</li></ul>",
  "<h3>Instructions</h3>",
  "<ol itemprop=\"recipeInstructions\"><li>[step]</li></ol>",
  "<h3>Notes</h3>",
  "<p>[useful notes]</p>",
  "</section>",
  "",
  "Use explicit quantities for every ingredient. Include Prep Time, Cook Time, Total Time, and Servings or Yield.",
  "Write at least 3 complete instructions. At least 2 steps must include a timing, temperature, texture, aroma, or observable doneness cue.",
  "Keep every ingredient, quantity, time, yield, temperature, and instruction consistent with the article body.",
  "",
  "If the topic includes multiple recipes, make the card for the first or primary recipe in the article."
].join("\n");

export function preparePrompt(basePrompt, settings) {
  const articleLength = settings.articleLength || "900-1200";
  let prompt = `${basePrompt}\n${noEmDashInstruction.replace("{articleLength}", articleLength)}`;
  const brief = settings.seoBrief || {};
  if (brief.targetKeyword || brief.secondaryKeywords || brief.searchIntent || brief.audience || brief.competitorNotes) {
    prompt += [
      "",
      "SEO BRIEF:",
      brief.targetKeyword ? `Primary keyword: ${brief.targetKeyword}` : "",
      brief.secondaryKeywords ? `Secondary keywords: ${brief.secondaryKeywords}` : "",
      brief.searchIntent ? `Search intent: ${brief.searchIntent}` : "",
      brief.audience ? `Audience: ${brief.audience}` : "",
      brief.readerTask ? `Primary reader task: ${brief.readerTask}` : "",
      brief.contentDifferentiator ? `Original value to provide: ${brief.contentDifferentiator}` : "",
      brief.requiredTopics ? `Important topic coverage: ${brief.requiredTopics}` : "",
      brief.competitorNotes ? `Competitor notes and angles to cover: ${brief.competitorNotes}` : "",
      "Use the primary keyword naturally near the beginning and in a useful heading only when it reads naturally. Use close variants elsewhere instead of repeating the exact phrase.",
      "Treat competitor notes and private performance evidence as planning input only. Never mention them in the published article.",
      "Include an FAQ section only when it answers useful questions not already covered."
    ].filter(Boolean).join("\n");
  }
  const fullBrief = articleBriefPrompt(settings.articleBrief);
  if (fullBrief) prompt += `\n\n${fullBrief}`;
  if (settings.brandVoice?.content) {
    prompt += [
      "",
      "BRAND VOICE:",
      settings.brandVoice.content,
      "Follow this voice consistently without mentioning these instructions."
    ].join("\n");
  }
  if (settings.outline) {
    prompt += [
      "",
      "APPROVED OUTLINE:",
      settings.outline,
      "Follow this outline closely unless a small improvement is clearly needed."
    ].join("\n");
  }
  prompt += `\n${recipeCardInstruction}`;
  prompt += [
    "",
    "SEO METADATA:",
    "After writing the article HTML, do not include metadata in the article body. The app will generate metadata separately."
  ].join("\n");
  return prompt;
}

export function buildOutlinePrompt(article, settings) {
  const brief = article.seoBrief || {};
  const voice = settings.brandVoices?.find((item) => item.id === article.brandVoiceId);
  return [
    `Create a practical SEO outline for an article titled "${article.title}".`,
    `Article type: ${article.type || "article"}.`,
    `Target size: ${article.articleLength || settings.articleLength || "900-1200"} words.`,
    brief.targetKeyword ? `Primary keyword: ${brief.targetKeyword}` : "",
    brief.secondaryKeywords ? `Secondary keywords: ${brief.secondaryKeywords}` : "",
    brief.searchIntent ? `Search intent: ${brief.searchIntent}` : "",
    brief.audience ? `Audience: ${brief.audience}` : "",
    brief.competitorNotes ? `Competitor notes: ${brief.competitorNotes}` : "",
    voice?.content ? `Brand voice: ${voice.content}` : "",
    articleBriefPrompt(article.articleBrief),
    "",
    "Return HTML only:",
    "<h1>[working title]</h1>",
    "<h2>[section]</h2><ul><li>[coverage notes]</li></ul>",
    "Include 5-8 H2 sections, useful H3 subsections, FAQ ideas, image ideas, and notes for search intent.",
    "Do not use em dashes in titles or headings."
  ].filter(Boolean).join("\n");
}

export function sanitizeTitleText(value = "") {
  return String(value).replace(/\u2014/g, "-").replace(/\s+-\s+/g, " - ").trim();
}

export function slugify(value = "") {
  return toAscii(sanitizeTitleText(value))
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildSeoImageFilename(article = {}, image = {}, index = 0, kind = "image") {
  const keyword = article.rankMathFocusKeyword || article.seoBrief?.targetKeyword || article.generatedTitle || article.title || "recipe";
  const detail = image.altText || image.prompt || image.expected || kind;
  const base = slugify([keyword, kind, index > 0 ? index + 1 : "", detail].filter(Boolean).join(" "));
  return `${base || "recipe-image"}.webp`;
}

export function buildSeoImageAlt(article = {}, image = {}, _index = 0, kind = "image") {
  const title = sanitizeTitleText(article.generatedTitle || article.title || "recipe");
  const keyword = sanitizeTitleText(article.rankMathFocusKeyword || article.seoBrief?.targetKeyword || title);
  const promptText = stripHtml(image.prompt || "").replace(/\s+/g, " ").trim();
  const context = kind === "featured"
    ? `Finished ${keyword} recipe for ${title}`
    : `${keyword} recipe step or serving idea from ${title}`;
  const usefulDetail = promptText
    .replace(/\b(high-quality|photo|image|realistic|professional|vertical|pinterest-friendly)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
  return sanitizeTitleText([context, usefulDetail].filter(Boolean).join(" - ")).slice(0, 160);
}

export function insertArticleImages(content = "", images = []) {
  let html = String(content || "");
  const usableImages = (Array.isArray(images) ? images : [])
    .map((image, index) => ({
      ...image,
      managedId: String(image?.id || `image-${index + 1}`),
      source: image?.displayUrl || image?.localUrl || image?.url || image?.remoteImageUrl || "",
      alt: image?.altText || image?.prompt || `Article image ${index + 1}`
    }))
    .filter((image) => image.source);

  if (!html || !usableImages.length) return html;

  const existingIds = new Set(
    [...html.matchAll(/data-content-studio-image-id=["']([^"']+)["']/gi)]
      .map((match) => match[1])
  );
  const pendingImages = usableImages.filter((image) => !existingIds.has(image.managedId));
  if (!pendingImages.length) return html;

  const recipeCardIndex = html.search(/<section\b[^>]*id=["']recipe-card["']/i);
  const insertionLimit = recipeCardIndex >= 0 ? recipeCardIndex : html.length;
  const articleBody = html.slice(0, insertionLimit);
  const headingMatches = [...articleBody.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)]
    .filter((match) => !/recipe card|frequently asked|faq|conclusion/i.test(stripHtml(match[0])));

  const insertionPoints = headingMatches.map((match) => {
    const headingEnd = match.index + match[0].length;
    const following = articleBody.slice(headingEnd);
    const paragraph = following.match(/^\s*<p\b[^>]*>[\s\S]*?<\/p>/i);
    return headingEnd + (paragraph?.[0]?.length || 0);
  });

  if (!insertionPoints.length) {
    const firstParagraph = articleBody.match(/<p\b[^>]*>[\s\S]*?<\/p>/i);
    insertionPoints.push(firstParagraph ? firstParagraph.index + firstParagraph[0].length : insertionLimit);
  }

  const additions = pendingImages.map((image, index) => {
    const positionIndex = Math.min(
      insertionPoints.length - 1,
      Math.floor(((index + 1) * insertionPoints.length) / (pendingImages.length + 1))
    );
    const figure = [
      "",
      `<figure class="article-image" data-content-studio-image-id="${escapeHtml(image.managedId)}">`,
      `<img src="${escapeHtml(image.source)}" alt="${escapeHtml(image.alt)}" width="576" height="1024" loading="lazy" decoding="async">`,
      "</figure>"
    ].join("\n");
    return { position: insertionPoints[positionIndex], figure };
  });

  for (const addition of additions.sort((a, b) => b.position - a.position)) {
    html = `${html.slice(0, addition.position)}${addition.figure}${html.slice(addition.position)}`;
  }
  return html;
}

export function sanitizeHeadingEmDashes(html = "") {
  return String(html).replace(/<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, inner) => {
    return `<${tag}${attrs}>${sanitizeTitleText(inner)}</${tag}>`;
  });
}

function removeJumpLinks(html = "") {
  return String(html)
    .replace(/<nav\b[^>]*class=["']cs-recipe-navigation["'][^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<div[^>]*class=["'][^"']*cs-jump-to-recipe-wrap[^"']*["'][^>]*>\s*<a[^>]+href=["']#recipe-card["'][\s\S]*?<\/a>\s*<\/div>/gi, "")
    .replace(/<p[^>]*>\s*<a[^>]+href=["']#recipe-card["'][\s\S]*?<\/a>\s*<\/p>/gi, "")
    .replace(/<a[^>]+href=["']#recipe-card["'][\s\S]*?<\/a>/gi, "");
}


function enhanceRecipeCard(html = "") {
  const addStyle = (attrs = "", style = "") => (
    /style=/i.test(attrs) ? attrs : `${attrs} style="${style}"`
  );
  return String(html).replace(
    /<section([^>]*id=["']recipe-card["'][^>]*)>([\s\S]*?)<\/section>/i,
    (match, attrs, inner) => {
      let nextAttrs = attrs;
      const isFallback = /data-recipe-fallback=["']true["']|recipe-card-fallback/i.test(nextAttrs);
      if (!/class=/i.test(nextAttrs)) nextAttrs += ' class="recipe-card"';
      if (!/aria-label=/i.test(nextAttrs)) nextAttrs += ' aria-label="Recipe card"';
      if (!isFallback && !/itemscope/i.test(nextAttrs)) nextAttrs += " itemscope";
      if (!isFallback && !/itemtype=/i.test(nextAttrs)) nextAttrs += ' itemtype="https://schema.org/Recipe"';
      nextAttrs = addStyle(
        nextAttrs,
        "margin:32px 0;padding:clamp(20px,4vw,30px);border:1px solid #ddd6fe;border-top:5px solid #7c3aed;border-radius:8px;background:#ffffff;color:#1f2937;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 24px rgba(31,41,55,.07);"
      );
      const body = inner
        .replace(/<h2([^>]*)>/i, (tag, headingAttrs) => `<h2${addStyle(headingAttrs, "margin:0 0 8px;color:#4c1d95;font-size:clamp(24px,4vw,32px);line-height:1.2;")}>`)
        .replace(/<ul([^>]*)>/i, (tag, listAttrs) => `<ul${addStyle(listAttrs, "display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px 18px;margin:18px 0;padding:14px 18px 14px 34px;border:1px solid #ede9fe;border-radius:7px;background:#faf9ff;")}>`)
        .replace(/<h3([^>]*)>/gi, (tag, headingAttrs) => `<h3${addStyle(headingAttrs, "margin:24px 0 10px;color:#111827;font-size:20px;line-height:1.3;")}>`)
        .replace(/<(ol|ul)([^>]*itemprop=["'](?:recipeInstructions|recipeIngredient)["'][^>]*)>/gi, (tag, name, listAttrs) => (
          `<${name}${addStyle(listAttrs, "margin:8px 0 0;padding-left:24px;line-height:1.65;")}>`
        ));
      return `<section${nextAttrs}>${body}</section>`;
    }
  );
}

export function ensureRecipeCard(html = "") {
  let next = removeJumpLinks(String(html));
  if (!/id=["']recipe-card["']/i.test(next)) {
    return next;
  }
  next = enhanceRecipeCard(next);
  const navigation = '<nav class="cs-recipe-navigation" aria-label="Recipe shortcuts" style="margin:16px 0;display:flex;flex-wrap:wrap;gap:12px;"><a href="#recipe-card" style="font-weight:700;text-decoration:underline;">Jump to Recipe</a></nav>';
  if (/class=["']cs-recipe-navigation["']/i.test(next)) return next;
  const opening = next.match(/<p\b[^>]*>[\s\S]*?<\/p>/i);
  const cardStart = next.search(/<section\b[^>]*id=["']recipe-card["']/i);
  if (!opening || (cardStart >= 0 && opening.index >= cardStart)) return navigation + next;
  const position = opening.index + opening[0].length;
  return next.slice(0, position) + navigation + next.slice(position);
}

function extractRecipeCard(html = "") {
  const match = String(html).match(/<section[^>]*id=["']recipe-card["'][^>]*>([\s\S]*?)<\/section>/i);
  return match?.[1] || "";
}

function extractListItems(html = "", headingText = "") {
  const headingPattern = new RegExp(`<h[23][^>]*>\\s*${headingText}\\s*:?\\s*<\\/h[23]>([\\s\\S]*?)(?=<h[23]|<\\/section>|$)`, "i");
  const section = (html.match(headingPattern) || [])[1] || "";
  return [...section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => stripHtml(match[1])).filter(Boolean);
}

function extractRecipeValue(card = "", text = "", label = "") {
  const listMatch = String(card).match(new RegExp(`<li[^>]*>\\s*<strong>\\s*${label}:?\\s*<\\/strong>\\s*([^<]+)`, "i"));
  if (listMatch?.[1]) return stripHtml(listMatch[1]).trim();
  const textMatch = text.match(new RegExp(`${label}:\\s*(.*?)(?=\\s*(Prep Time|Cook Time|Total Time|Servings|Ingredients|Instructions|Notes|$))`, "i"));
  return textMatch?.[1]?.trim() || "";
}

const UNICODE_FRACTIONS = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };

export function durationToIso(value = "") {
  // "1 1/2 hours", "1/2 hour" and "1½ hours" become decimals before unit matching.
  const text = String(value).toLowerCase()
    .replace(/(\d+)?\s*([¼½¾⅓⅔])/g, (_, whole, fraction) => String(Number(whole || 0) + UNICODE_FRACTIONS[fraction]))
    .replace(/(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)/g, (match, whole, numerator, denominator) => Number(denominator) ? String(Number(whole || 0) + Number(numerator) / Number(denominator)) : match);
  const hours = Number((text.match(/(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h)\b/) || [])[1] || 0);
  const minutes = Number((text.match(/(\d+(?:\.\d+)?)\s*(minutes|minute|mins|min|m)\b/) || [])[1] || 0);
  const days = Number((text.match(/(\d+(?:\.\d+)?)\s*(days|day)\b/) || [])[1] || 0);
  const weeks = Number((text.match(/(\d+(?:\.\d+)?)\s*(weeks|week)\b/) || [])[1] || 0);
  const totalMinutes = Math.round(minutes + hours * 60 + days * 1440 + weeks * 10080);
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0 || (!totalMinutes && !/\b0\s*(minutes?|mins?|hours?|hrs?)\b/i.test(text))) return undefined;
  return `PT${totalMinutes}M`;
}

export function buildRecipeSchema(article) {
  if (!article.recipeCardEnabled && !/id=["']recipe-card["']/i.test(article.content || "")) return "";
  if (/<section[^>]*id=["']recipe-card["'][^>]*(?:data-recipe-fallback=["']true["']|recipe-card-fallback)/i.test(article.content || "")) return "";
  const card = extractRecipeCard(article.content || "");
  const text = stripHtml(card);
  if (!text) return "";
  const itemPropName = card.match(/<([a-z0-9]+)[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/\1>/i)?.[2];
  const headingNames = [...card.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter((value) => value && !/^(recipe card|recipe summary|ingredients|instructions|notes)$/i.test(value));
  const name = stripHtml(itemPropName || headingNames[0] || article.generatedTitle || article.title);
  const ingredients = extractListItems(card, "Ingredients");
  const instructions = extractListItems(card, "Instructions");
  const prepTime = extractRecipeValue(card, text, "Prep Time");
  const cookTime = extractRecipeValue(card, text, "Cook Time");
  const totalTime = extractRecipeValue(card, text, "Total Time");
  const servings = extractRecipeValue(card, text, "Servings") || extractRecipeValue(card, text, "Yield");
  const publicImage = article.featuredImageRemoteUrl || (/^https?:\/\//i.test(article.featuredImage || "") ? article.featuredImage : "");
  const keywordValues = [
    article.rankMathFocusKeyword,
    article.seoBrief?.targetKeyword,
    ...(article.tags || []),
    ...(String(article.seoBrief?.secondaryKeywords || "").split(","))
  ].map((value) => String(value || "").trim()).filter(Boolean);
  const recipeCategory = article.autoCategory?.name || article.wordpressCategoryName || article.categoryName || "";
  const schema = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: name || article.generatedTitle || article.title,
    description: (article.metaDescription || text).slice(0, 280),
    image: publicImage ? [publicImage] : undefined,
    author: article.authorName ? { "@type": "Person", name: article.authorName } : undefined,
    datePublished: article.createdAt ? new Date(article.createdAt).toISOString().slice(0, 10) : undefined,
    keywords: keywordValues.length ? [...new Set(keywordValues)].slice(0, 12).join(", ") : undefined,
    recipeCategory: recipeCategory || undefined,
    recipeYield: servings || undefined,
    prepTime: durationToIso(prepTime),
    cookTime: durationToIso(cookTime),
    totalTime: durationToIso(totalTime),
    recipeIngredient: ingredients.length ? ingredients : undefined,
    recipeInstructions: instructions.length
      ? instructions.map((step) => ({ "@type": "HowToStep", text: step.replace(/^step\s+\d+\s*[:.)-]?\s*/i, "").trim() }))
      : undefined
  };
  Object.keys(schema).forEach((key) => schema[key] === undefined && delete schema[key]);
  return JSON.stringify(schema, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function appendRecipeSchemaToContent(content = "", structuredData = "") {
  if (!structuredData) return content;
  if (/application\/ld\+json/i.test(content)) return content;
  return `${content}\n<script type="application/ld+json">\n${structuredData}\n</script>`;
}

export function buildMetadata(article, content) {
  const title = sanitizeTitleText(article.generatedTitle || article.title || "");
  const text = stripHtml(content);
  const brief = article.seoBrief || {};
  const articleBrief = article.articleBrief || {};
  const titleFallback = title.length < 25 && /recipe/i.test(`${title} ${articleBrief.recommendedArticleType || ""}`)
    ? `${title} Recipe And Practical Tips`
    : title;
  const metaTitle = article.metaTitle || (titleFallback.length > 60 ? `${titleFallback.slice(0, 57).trim()}...` : titleFallback);
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || text.slice(0, 155);
  const descriptionParts = [
    sanitizeTitleText(firstSentence),
    articleBrief.articlePromise,
    /recipe/i.test(`${articleBrief.recommendedArticleType || ""} ${title}`)
      ? "Find clear ingredients, steps, substitutions, storage, and reheating guidance."
      : "Find practical steps, examples, and a clear next action."
  ].map((item) => sanitizeTitleText(stripHtml(item || ""))).filter(Boolean);
  let generatedDescription = descriptionParts[0] || title;
  for (const part of descriptionParts.slice(1)) {
    if (generatedDescription.length >= 120) break;
    generatedDescription = `${generatedDescription.replace(/[.!?]*$/, ".")} ${part}`;
  }
  // Only trim a partial last word when the text actually exceeds the 160-character limit.
  const fittedDescription = generatedDescription.length > 160 ? generatedDescription.slice(0, 161).replace(/\s+\S*$/, "") : generatedDescription;
  const metaDescription = article.metaDescription || fittedDescription.replace(/[,:;]$/, "") || title;
  const focusKeyword = article.rankMathFocusKeyword || articleBrief.primaryKeyword || brief.targetKeyword || title;
  const tags = [focusKeyword, ...(brief.secondaryKeywords || "").split(",")]
    .map((item) => item?.trim())
    .filter(Boolean)
    .slice(0, 8);
  return {
    metaTitle,
    metaDescription,
    rankMathTitle: article.rankMathTitle || metaTitle,
    rankMathDescription: article.rankMathDescription || metaDescription,
    rankMathFocusKeyword: focusKeyword,
    slug: article.slug || slugify(title),
    excerpt: metaDescription,
    tags,
    openGraphTitle: article.openGraphTitle || metaTitle,
    openGraphDescription: article.openGraphDescription || metaDescription,
    pinterestTitle: article.pinterestTitle || metaTitle,
    pinterestDescription: article.pinterestDescription || metaDescription,
    canonicalUrl: article.canonicalUrl || article.wordpressPostUrl || ""
  };
}

export function scoreArticle(article, content) {
  const text = stripHtml(content).toLowerCase();
  const brief = article.seoBrief || {};
  const keyword = (article.rankMathFocusKeyword || brief.targetKeyword || article.title || "").toLowerCase().trim();
  const title = (article.generatedTitle || article.title || "").toLowerCase();
  const metaTitle = (article.rankMathTitle || article.metaTitle || "").toLowerCase();
  const metaDescription = (article.rankMathDescription || article.metaDescription || "").toLowerCase();
  const slug = (article.slug || "").toLowerCase();
  const h2Text = [...String(content || "").matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => stripHtml(m[1]).toLowerCase()).join(" ");
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const targetMinWords = Number(String(article.articleLength || "600-800").split("-")[0]) || 600;
  const internalLinks = [...String(content || "").matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)].filter((match) => /^\/|https?:\/\//i.test(match[1])).length;
  const allImages = [article.featuredImageAlt, ...(article.images || []).map((img) => img.altText)];
  const hasRecipeCard = /id=["']recipe-card["']/i.test(content || "");
  const recipeCard = extractRecipeCard(content || "");
  const cardIngredients = extractListItems(recipeCard, "Ingredients");
  const cardInstructions = extractListItems(recipeCard, "Instructions");
  const measuredIngredients = cardIngredients.filter((ingredient) => /(?:\b\d+(?:[./]\d+)?\b|¼|½|¾|⅓|⅔|⅛|⅜|⅝|⅞|\b(?:pinch|dash|to taste)\b)/i.test(ingredient));
  const instructionCues = cardInstructions.filter((step) => /(?:\b\d+\s*(?:minutes?|mins?|hours?|hrs?|°[cf]|degrees?|seconds?)\b|until|golden|browned|tender|crisp|thick|set|opaque|bubbling|fragrant|internal temperature)/i.test(step));
  const promisedListCount = parsePromisedRecipeCount(article.title || "");
  const numberedRecipeSections = [...String(content || "").matchAll(/<h2\b[^>]*>\s*(\d+)\s*[.)-]/gi)].map((match) => Number(match[1]));
  const listicleCountComplete = !promisedListCount
    || (numberedRecipeSections.length === promisedListCount
      && numberedRecipeSections.every((number, index) => number === index + 1));
  const recipeComplete = !hasRecipeCard || (
    cardIngredients.length > 0
    && cardInstructions.length >= 3
    && measuredIngredients.length >= Math.ceil(cardIngredients.length * 0.7)
    && instructionCues.length >= Math.min(2, cardInstructions.length)
    && Boolean(extractRecipeValue(recipeCard, stripHtml(recipeCard), "Total Time") || (extractRecipeValue(recipeCard, stripHtml(recipeCard), "Prep Time") && extractRecipeValue(recipeCard, stripHtml(recipeCard), "Cook Time")))
    && Boolean(extractRecipeValue(recipeCard, stripHtml(recipeCard), "Servings") || extractRecipeValue(recipeCard, stripHtml(recipeCard), "Yield"))
  );
  let schemaHasImage = !hasRecipeCard;
  try { schemaHasImage = schemaHasImage || Boolean(JSON.parse(article.structuredData || "{}").image?.length); } catch {}
  const checks = [
    { id: "keywordTitle", label: "Focus keyword appears in article title", ok: keyword ? title.includes(keyword) : true, weight: 12 },
    { id: "keywordMetaTitle", label: "Focus keyword appears in Rank Math SEO title", ok: keyword ? metaTitle.includes(keyword) : true, weight: 10 },
    { id: "keywordMetaDescription", label: "Focus keyword appears in meta description", ok: keyword ? metaDescription.includes(keyword) : true, weight: 10 },
    { id: "keywordIntro", label: "Focus keyword appears in article body", ok: keyword ? text.includes(keyword) : true, weight: 10 },
    { id: "keywordHeading", label: "Focus keyword appears in a heading", ok: keyword ? h2Text.includes(keyword) : true, weight: 10 },
    { id: "slug", label: "Slug contains focus keyword words", ok: keyword ? keyword.split(/\s+/).some((word) => word.length > 3 && slug.includes(word)) : true, weight: 8 },
    { id: "titleLength", label: "Article title is concise and descriptive", ok: (article.generatedTitle || article.title || "").length >= 25 && (article.generatedTitle || article.title || "").length <= 70, weight: 5 },
    { id: "metaLength", label: "Meta description has a useful snippet length", ok: (article.rankMathDescription || article.metaDescription || "").length >= 110 && (article.rankMathDescription || article.metaDescription || "").length <= 165, weight: 5 },
    { id: "wordCount", label: "Article meets its useful target depth", ok: wordCount >= Math.max(600, Math.round(targetMinWords * 0.8)), weight: 10 },
    { id: "listicleCount", label: "Recipe collection delivers every item promised in the title", ok: listicleCountComplete, weight: promisedListCount ? 10 : 0 },
    { id: "faq", label: "FAQ or equivalent reader questions included", ok: /faq|frequently asked|common questions/i.test(content || ""), weight: 4 },
    { id: "images", label: "Images generated", ok: ((article.images || []).length + (article.featuredImage ? 1 : 0)) > 0, weight: 10 },
    { id: "altText", label: "Image alt text present", ok: allImages.some(Boolean), weight: 7 },
    { id: "recipeCard", label: "Recipe card has measured ingredients, actionable steps, timing, yield, and doneness cues", ok: recipeComplete, weight: 10 },
    { id: "recipeSchema", label: "Recipe schema is ready when recipe card exists", ok: !hasRecipeCard || Boolean(article.structuredData), weight: 8 },
    { id: "schemaImage", label: "Recipe schema includes a crawlable image", ok: schemaHasImage, weight: 5 },
    { id: "headingStyle", label: "Headings avoid em dashes", ok: !/\u2014/.test(h2Text), weight: 3 },
    { id: "internalLinks", label: "Internal or useful links included", ok: internalLinks > 0, weight: 5 }
  ];
  const earned = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  const possible = checks.reduce((sum, check) => sum + check.weight, 0);
  return { score: Math.round((earned / Math.max(1, possible)) * 100), checks };
}

export function qaArticleImages(article) {
  const images = [
    {
      id: "featured",
      label: "Featured image",
      url: article.featuredImageDisplay || article.featuredImageLocalUrl || article.featuredImage,
      localPath: article.featuredImageLocalPath,
      altText: article.featuredImageAlt,
      seoFileName: article.featuredImageSeoFileName,
      prompt: article.featuredImagePrompt,
      expected: "3:2 hero image"
    },
    ...(article.images || []).map((image, index) => ({
      id: `image-${index}`,
      label: `In-text image ${index + 1}`,
      url: image.displayUrl || image.localUrl || image.url,
      localPath: image.localPath,
      altText: image.altText,
      seoFileName: image.seoFileName,
      prompt: image.prompt,
      expected: "vertical Pinterest-friendly image"
    }))
  ];

  const checks = [];
  images.forEach((image) => {
    checks.push({ id: `${image.id}-exists`, label: `${image.label} exists`, ok: Boolean(image.url || image.localPath), severity: "critical" });
    checks.push({ id: `${image.id}-alt`, label: `${image.label} has descriptive alt text`, ok: Boolean(image.altText && image.altText.length >= 20), severity: "warning" });
    checks.push({ id: `${image.id}-filename`, label: `${image.label} has an SEO WebP filename`, ok: Boolean(image.seoFileName && /^[a-z0-9-]+\.webp$/i.test(image.seoFileName)), severity: "warning" });
    checks.push({ id: `${image.id}-prompt`, label: `${image.label} has a useful generation prompt`, ok: Boolean(image.prompt && image.prompt.length >= 30), severity: "warning" });
    checks.push({ id: `${image.id}-text`, label: `${image.label} prompt avoids unreadable text overlays`, ok: !/text overlay|words on image|typography|headline/i.test(image.prompt || ""), severity: "warning" });
  });

  const criticalIssues = checks.filter((check) => !check.ok && check.severity === "critical").length;
  const warningIssues = checks.filter((check) => !check.ok && check.severity !== "critical").length;
  const score = images.length ? Math.max(0, 100 - criticalIssues * 35 - warningIssues * 8) : 0;
  return { score, checks, criticalIssues, warningIssues };
}

export function buildRankMathMeta(article) {
  const focusKeyword = article.rankMathFocusKeyword || article.seoBrief?.targetKeyword || article.generatedTitle || article.title || "";
  return {
    rank_math_title: article.rankMathTitle || article.metaTitle || article.generatedTitle || article.title || "",
    rank_math_description: article.rankMathDescription || article.metaDescription || article.excerpt || "",
    rank_math_focus_keyword: focusKeyword,
    rank_math_canonical_url: article.canonicalUrl || ""
  };
}

export function finalizeArticleContent(html, title, settings) {
  let next = sanitizeHeadingEmDashes(html);
  if (settings.recipeCardEnabled) {
    next = ensureRecipeCard(next, title);
  }
  return next;
}
