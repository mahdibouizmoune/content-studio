# 04 — SEO, GEO and Recipe Audit

Code paths: `electron/main.js` (generate-article ~5846, push-to-wordpress ~9511), `src/lib/articlePostProcess.mjs`, `articleQuality.mjs`, `internalLinks.js`, `electron/recipe-*.js`, `article-recipe-readiness.js`, `wordpress-*.js`, `post-publish-qa.js`.

## Fixed in this audit (with tests in `tests/audit-360.test.js`)

| # | Problem | Fix |
|---|---|---|
| 1 | Poultry safety regex matched "75 °C" inside "175°C", so an oven temperature passed the 165 F / 74 C thermometer gate | Word boundaries (`recipe-generation.js`) |
| 2 | `durationMinutes("1/2 hour")` = 120, `"1 1/2 hours"` = 120, `"1½ hours"` = null; wrong values fed validation and published `totalTime` | Fraction and Unicode-fraction parsing (`recipe-card-parser.js`, renderer `durationToIso`) |
| 3 | "Serves 4", "Yields 2 loaves" rejected as yields | Accepted prefixes extended |
| 4 | Complete collections published with an unsafe recipe 2–N | Readiness fails when `inspectRecipe` reports errors for `complete-recipes` |
| 5 | AI-repaired card published without prompt-leak re-check | Re-check after repair |
| 6 | Generated meta description always dropped its last word | Trim only when over 160 characters |
| 7 | Internal links inserted inside the recipe card (notes/description) | Card ranges excluded |
| 8 | Unknown WordPress status (e.g. "pending", "Draft") published publicly | Fails closed to `draft` |
| 9 | Bulk publish ignored critical quality blockers | Same gate as the editor |

## Open findings

| Severity | Finding | Evidence | Recommendation |
|---|---|---|---|
| High | Recipes are generated without a source recipe and become Recipe schema; nothing marks them "untested AI" | main.js 5855-6033; readiness `validatedRecipeSchema` | Require human review flag before schema, or a source recipe (roadmap R1) |
| Med | Roundups get one `Recipe` (recipe 1) and no `ItemList`; recipe 1's description is the article meta description | article-recipe-readiness.js `validatedRecipeSchema` | Emit `ItemList` + per-recipe `Recipe` matching visible text (Google R) |
| Med | Microdata `itemscope itemtype=Recipe` in card plus JSON-LD → duplicate, incomplete Recipe entity | articlePostProcess.mjs:42, 259; wordpress-content.js:19 | Strip microdata at publish once JSON-LD is validated |
| Med | Publish-time schema replaces renderer schema, dropping `author`, `datePublished`, `keywords`, `recipeCategory` and user edits | main.js ~9533 | Merge validated fields into the existing schema |
| Med | Featured-image failure still publishes; schema may keep a temporary replicate.delivery URL | main.js ~9580 | Force draft when featured media is deferred |
| Med | Canonical sticks to the first site/slug | articlePostProcess.mjs:419 | Derive from the current post link |
| Med | Open Graph values computed but never sent to Rank Math | main.js rankMathMetaFromArticle | Send `rank_math_facebook_*` (verify Rank Math field names first) |
| Low | Numbered H2s like "3 Common Mistakes" split a single recipe into fake recipes in `inspectRecipe` | recipe-generation.js:20 | Require recipe content under the heading |
| Low | Doneness cues: "Set aside" counts as a cue; "thick" matches "thickest" | recipe-generation.js:159 | Word boundaries |
| Low | Alt text repeats "recipe recipe"; prompt text used as alt fallback | articlePostProcess.mjs:160-182 | Describe the image, not the keyword |
| Low | No H1 stripping; user slugs not transliterated | main.js 5864, 9400 | Strip H1 in generated content; reuse `toAscii` |
| Low | Cannibalization check advisory and local-only | article-intake.mjs:21 | Compare against synced WordPress posts and block exact intent matches |

## GEO

Per Google (01-RESEARCH), there is no special AI-search markup. The useful work is already partly in place: direct-answer intros (`READER_RECIPE_GUIDANCE`), prompt-leak gates, unsupported-claim blockers. The highest GEO value is fixing structured-data accuracy (rows above) and labelling AI-generated recipes honestly.
