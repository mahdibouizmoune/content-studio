---
name: recipe-publish-qa
description: Review or change Content Studio's recipe article generation, validation, schema or WordPress publishing gates. Use when editing electron/recipe-*.js, article-recipe-readiness.js, article-editorial.js, src/lib/articleQuality.mjs, articlePostProcess.mjs, or push-to-wordpress in main.js, or when asked whether a recipe article is safe to publish.
---

# Recipe publishing QA

## Where the gates live

| Gate | File |
|---|---|
| Primary card structure, poultry 165 F/74 C, timing, yield | `electron/recipe-generation.js` `validateRecipeCard` |
| Every recipe in a collection | `electron/recipe-quality.js` `inspectRecipe`; enforced for `depth: 'complete-recipes'` in `article-recipe-readiness.js` |
| Prompt-leak text | `electron/assets/editorial-rules.json`, checked before publish and after AI card repair |
| Editorial blockers (ratings, first-hand claims, placeholders) | `src/lib/articleQuality.mjs`; editor and bulk publish both require an override reason |
| WordPress status | `electron/wordpress-payload.js` — unknown status fails closed to `draft` |

## Non-negotiables (user requirements)

- Never fabricate testing, nutrition, ratings, reviews or credentials. Nutrition and `aggregateRating` stay unset unless the user supplies real data.
- Recipes must be complete where required; do not weaken a gate to make a test pass.
- Do not reintroduce automatic affiliate/Impact promotions.

## Google Recipe structured data (checked 2026-10-27, page updated 2026-09-08)

Source: https://developers.google.com/search/docs/appearance/structured-data/recipe
- Required: `name`, `image`. Recommended: `recipeIngredient`, `recipeInstructions` (HowToStep text only, no "Step 1" labels), `prepTime`+`cookTime` together or `totalTime` (ISO 8601), `recipeYield` (number of servings), `author`, `datePublished`, `description`.
- Collections: an `ItemList` of `ListItem` with integer `position` and a unique canonical `url` per recipe. Use separate `Recipe` objects per dish, not `HowToSection`.
- Structured data must match visible text.

## Procedure for a change

1. Write a failing test in `tests/` first (use `renderRecipes` from `electron/content-operations.js` to build cards).
2. Make the change; confirm the test fails without it and passes with it.
3. Run the `content-studio-verify` skill.

## Example

"Why did this roundup publish with raw chicken in recipe 7?" → check `recipeCollection.depth`, run `inspectRecipe` on the content, report each `Recipe N:` error.
