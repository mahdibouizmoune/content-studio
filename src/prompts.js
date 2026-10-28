import { parsePromisedRecipeCount } from "./lib/recipeTitle.mjs";

export { parsePromisedRecipeCount };

// ============================================================================
// DEFAULT PROMPTS
// ============================================================================

export const DEFAULT_ARTICLE_PROMPT = `Write a people-first recipe blog article about "{title}".
Use the article size, search intent, audience, and SEO brief supplied by the app. Satisfy the reader's main task before adding supporting detail.

STRUCTURE:
1. Do not include an H1. Start with a short, specific introduction that identifies the dish, flavor and texture, practical benefit, and who it suits. Within the first 100 words, give the clearest answer, expected result, and one specific reason to keep reading. Avoid generic openings like "In today's world", "Food lovers rejoice", or "If you are looking for".

2. Add clear <h2> sections that fit the topic. Prioritize what a real cook needs: why it works, exact ingredients and their roles, step-by-step method, visual and temperature doneness cues, troubleshooting, safe substitutions, serving ideas, storage, reheating, and make-ahead notes.

3. Use <h3> subsections only where they help the reader scan. Headings must be natural, searchable, and useful.

4. Include an FAQ section with 3-5 questions only when they add information not already answered. Format questions as <h3> tags and answer directly.

5. End with a brief encouraging conclusion using an <h2> tag.

READER VALUE:
- Give the reader at least one genuinely useful decision aid specific to this recipe, such as how to choose an ingredient, adjust the method for a common pan or appliance, scale the yield, recognize a failure early, or rescue the result.
- Make the page sufficient to complete the recipe without returning to search for missing quantities, temperatures, timing, substitutions, storage, or reheating details.
- Distinguish required steps from optional variations. Explain why a critical step matters in one concise sentence.
- Include food-safety temperatures only when relevant and do not present unsafe shortcuts.
- Avoid repeating generic sections merely to increase length. Every paragraph must help the reader decide, prepare, cook, troubleshoot, serve, store, or adapt the recipe.

TONE & STYLE:
- Warm, practical, confident, and friend-to-friend.
- Sound like a careful recipe editor who understands the method and wants the reader to succeed.
- Do not claim personal testing, credentials, awards, reviews, or first-hand experience that was not supplied.
- Use active voice, short paragraphs, clear cooking cues, and sensory details.
- Keep most paragraphs to one clear idea. Use descriptive transition sentences so a reader can quickly choose what to read next without feeling pushed through a template.
- Explain doneness signs, texture, flavor, timing, substitutions, and common mistakes.
- Keep ingredient amounts, servings, prep time, cook time, total time, and instructions internally consistent. Every listed ingredient must be used in the method. Do not introduce undeclared ingredients in the steps.
- Use precise quantities, ingredient preparation states, pan or appliance settings, and temperatures where the recipe needs them. Give metric weights only when they come from the source recipe; never convert cups to grams by guessing.
- List ingredients in the order they are first used. Every instruction must name the relevant ingredient rather than relying on unclear phrases such as "add it."
- Give both realistic time ranges and observable visual, texture, aroma, or internal-temperature cues. Avoid vague directions such as "cook until done."
- When a recipe has components such as sauce, filling, topping, or dough, group the ingredients and instructions into matching components.
- Make prep assumptions explicit, including thawing, draining, room-temperature ingredients, preheating, resting, chilling, and cooling.
- Include the most likely failure point and how the reader can prevent or correct it.
- Separate facts from optional suggestions. Never invent nutrition values, ratings, health outcomes, or popularity claims.
- Use <strong> tags for genuinely important tips, not for random keywords.
- Avoid filler, fake personal stories, unsupported health claims, keyword stuffing, repeated conclusions, and over-the-top hype.
- Use the primary topic naturally in the opening and in one useful heading when it reads naturally. Use close variants elsewhere instead of repeating an exact phrase.

FORMATTING:
- Use proper HTML: <h2> for main sections, <h3> for subsections.
- Use lists when appropriate: <ul> with <li> for bullets, <ol> with <li> for numbered steps.
- Keep the article scannable for mobile readers.
- Use descriptive phrases for techniques, ingredients, and related dishes so useful internal links can be added naturally.
- NO Markdown, code fences, backticks, or explanatory preamble.
- No extraneous preamble before content starts.

QUALITY CHECK BEFORE OUTPUT:
- The article fully answers the title and matches its search intent.
- A reader can finish the recipe successfully without needing another page.
- The page contains recipe-specific value beyond a generic summary.
- Recipe card facts agree with the article body.
- Ingredients and instructions agree with each other.
- Headings are specific, useful, and free of em dashes.
- No private performance metrics, prompt instructions, unsupported claims, or invented experience appear in the article.

The finished article should be complete enough to cook from, distinct enough to deserve its own page, and visual enough to support Pinterest and social content.`;

export const LISTICLE_DEFAULT_PROMPT = `Write a conversational, SEO-focused listicle article about: "{title}".
Use the article size and SEO brief supplied by the app.

CRITICAL: Create EXACTLY {itemCount} numbered sections - no more, no less.

Do not include an H1. Start with 2 or 3 separate <p> intro paragraphs: hook, why it matters, and what the reader will get.

Create EXACTLY {itemCount} numbered <h2> sections with specific, useful names. Each section needs a short intro, practical details, optional <h3> subsections, optional lists, and a closing tip.

End with a brief conclusion (2-3 sentences).

TONE: Conversational, useful, active voice, short paragraphs, mobile-friendly, <strong> only on key takeaways. NO markdown, NO code fences.`;

export const LISTICLE_FOOD_PROMPT = `Write a conversational, helpful food and recipe listicle about: "{title}".
Use the article size and SEO brief supplied by the app.

CRITICAL: Create EXACTLY {itemCount} numbered recipe sections - no more, no less.

STRUCTURE:
1. Do not include an H1. Write 2 or 3 separate <p> intro paragraphs: hook, why these recipes are useful, and what the reader can expect.
2. Create EXACTLY {itemCount} numbered <h2> recipe sections with clear recipe names.
3. For each recipe, include realistic prep, cook, total time and yield, a short useful intro, <h3>Ingredients</h3> with exact measured ingredients in order of use, <h3>Instructions</h3> with an actionable <ol>, and success notes about doneness, storage, swaps, or timing.
4. Add a brief encouraging conclusion.

QUALITY RULES:
- Make every recipe meaningfully different and satisfy the number and promise in the title.
- Keep ingredients and instructions internally consistent for every recipe.
- Make every recipe fully cookable without sending the reader to another page.
- State pan size, appliance setting, temperature, ingredient preparation, and metric weights where precision affects the result.
- Do not invent ratings, nutrition, popularity, personal testing, or health claims.
- Use precise doneness cues and realistic timing where useful.
- Give each recipe at least one distinct decision aid, shortcut, rescue tip, ingredient-selection cue, make-ahead note, or serving context that is specific to that dish.
- Make every recipe complete enough to cook without opening another page.
- Use natural topic language and close variants. Do not repeat an exact keyword mechanically.
- No filler, repeated templates, markdown, code fences, or em dashes in headings.

TONE: Practical recipe editor, clear cooking cues, active voice, short paragraphs, and reader-first detail.`;

export const LISTICLE_HOMEDECOR_PROMPT = `Write a conversational, friendly home decor article showcasing: "{title}".
CRITICAL: Present EXACTLY {itemCount} completely different room designs.

STRUCTURE:
1. No <h1>: the page title is the H1. Start directly with the intro.
2. Three separate <p> intro paragraphs.
3. EXACTLY {itemCount} numbered <h2> design sections, each naming a specific complete design concept.
4. EACH section: mood-setting intro + specific details (colors, furniture, textiles, decor) + optional <h3> subsections (Color Palette / Key Pieces / Styling Tips) + optional <ul> lists + closing vibe note.
5. Brief encouraging conclusion.

TONE: Conversational, like a house tour with a friend with impeccable taste, active voice, short paragraphs, occasional humor, <strong> on key design terms. NO markdown. NO em dashes.`;

export const LISTICLE_FASHION_PROMPT = `Write a conversational, friendly fashion outfit listicle about: "{title}".
CRITICAL: Create EXACTLY {itemCount} numbered outfit sections.

STRUCTURE:
1. No <h1>: the page title is the H1. Start directly with the intro.
2. Three separate <p> intro paragraphs.
3. EXACTLY {itemCount} numbered <h2> outfit sections with creative names.
4. EACH outfit: intro paragraph + <h3>Outfit Pieces:</h3> with <ul> + <h3>Styling Tips:</h3> + closing occasion/variation tip.
5. Brief encouraging conclusion.

IMPORTANT CONTENT RESTRICTIONS:
- NEVER use the word 'nude' or 'naked'. Use alternatives: beige, tan, cream, camel, sand, neutral, skin-tone, natural.
- Keep all content family-friendly.

TONE: Conversational, fashion-forward friend, active voice, short paragraphs, occasional humor, <strong> on key style terms. NO markdown. NO em dashes.`;

export const DEFAULT_IMAGE_PROMPT = `Based on this article about "{title}", create {count} specific image prompts for realistic recipe and food blog photography.

Article excerpt:
{content}

CRITICAL REQUIREMENTS:
- Each prompt should focus on one clear food subject or cooking moment
- Prefer closeup, three-quarter overhead, or hands-in-frame shots
- Under 14 words each
- Specific to this article topic
- No text, labels, logos, fake packaging, or clutter
- Natural light, appetizing texture, real ingredients, editorial food photography

Good: "closeup of creamy chicken pasta in white bowl", "hands drizzling glaze over lemon cake"
Bad: "many different dinner recipes on a table", "busy kitchen scene with text labels"

Format as a numbered list:
1. [prompt]
2. [prompt]
etc.`;

export const DEFAULT_LISTICLE_IMAGE_PROMPT = `Based on this article about "{title}", create a single detailed image generation prompt for this section:

Heading: {heading}
Content: {sectionContent}

The image MUST feature the specific dish, ingredient, room, outfit, or idea from the section. Generate ONE realistic, high-quality photo prompt with composition, lighting, and texture. No text on images.

Return only the image prompt, nothing else.`;

export const DEFAULT_FEATURED_IMAGE_INSTRUCTION = `You are an expert at creating image generation prompts for featured recipe blog images.

Based on this article titled "{title}", create ONE detailed image generation prompt for the featured/hero image.

Article content (first 1500 chars):
{content}

Requirements:
- Capture the finished dish or main food idea clearly
- Match the recipe's actual ingredients, cooking method, texture, and serving style
- Compose it as a landscape-friendly blog hero and thumbnail image
- Include composition, lens angle, natural lighting, background, texture, realistic portions, and restrained styling
- Keep the main dish unobstructed and recognizable at mobile thumbnail size
- Avoid text overlays, logos, labels, extra hands unless useful, and unrealistic food
- Concise but detailed (1-2 sentences)

Return ONLY the image prompt. No explanations. Avoid text overlays.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseItemCountFromTitle(title) {
  const patterns = [/^(\d+)\s/i, /top\s+(\d+)/i, /best\s+(\d+)/i, /(\d+)\s+best/i, /(\d+)\s+essential/i, /(\d+)\s+must/i];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) {
      const n = parseInt(m[1]);
      if (n >= 3 && n <= 50) return n;
    }
  }
  return 5;
}

export function buildListiclePrompt(title, category, itemCount, settings) {
  const map = {
    default: settings.listicleDefaultPrompt || LISTICLE_DEFAULT_PROMPT,
    food: settings.listicleFoodPrompt || LISTICLE_FOOD_PROMPT,
    homedecor: settings.listicleHomeDecorPrompt || LISTICLE_HOMEDECOR_PROMPT,
    fashion: settings.listicleFashionPrompt || LISTICLE_FASHION_PROMPT
  };
  return (map[category] || map.default).replace(/{title}/g, title).replace(/{itemCount}/g, itemCount);
}
