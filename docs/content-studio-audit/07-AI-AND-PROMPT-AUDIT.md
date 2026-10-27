# 07 — AI and Prompt Audit

Read-only inventory of 22 prompt paths (Replicate text/image/video models, DeepSeek API for Recipe Money Maker). **No paid calls were made**, so no before/after output-quality comparison exists; every quality claim below is based on code, not measured outputs.

## Model routing today

- Text: `getAIModelUrl(settings.aiModel)` (main.js:633-643); defaults differ per handler (`gpt5nano` or `chatgpt` = GPT-5); unknown ids fall through to GPT-5.
- Pin Creator text: GPT-4.1-mini (or DeepSeek V3) — here `chatgpt` means GPT-4.1-mini, unlike everywhere else (main.js:837 vs 642). "Auto fallback" does not fall back (main.js:879).
- Article images: backend default `seedream-4.5` (~$0.04) while UI/cost estimate default `z-image-turbo` (~$0.003) (main.js:8733 vs App.jsx:216).

## Defects by priority

| Sev | Defect | Evidence | Fix |
|---|---|---|---|
| High | Non-food listicles (decor, fashion) get forced recipe cards, recipe guidance and paid card repair | main.js:5847-5856; article-recipe-readiness.js:56 | Enable recipe rules only for food categories |
| High | Recipes invented without a source recipe, then emitted as schema | main.js:5855-6033 | Source recipe or "untested AI" review flag |
| Med | Long lengths (6,500–12,000 words) exceed `max_tokens` 6,500 → the length check always fails → 3 paid regenerations, then error | main.js:5859, 6135 | Chunk long articles or remove those length options |
| Med | Collection path ignores the approved outline, brand voice and SEO brief (paid outline wasted) | main.js:5882-6120 | Pass outline/voice into chunk prompts |
| Med | Editorial pass regenerates the whole article for any regex gap | main.js:6144 | Targeted section patches |
| Med | Pin `callChatGPT` re-submits after timeout although the prediction was cancelled — double charge risk | main.js:770-772, 847-851 | Do not auto-retry timeouts |
| Med | Keyword research (3,800 tok), clusters (3,200), repurpose pack (2,200) likely truncate JSON | main.js 6698, 6516, 7311 | Raise limits, cap array sizes, schema-validate |
| Med | `safeJsonParse` extracts only `{...}`; workspace rewrite expects an array | main.js:2135, ~10049 | Support arrays |
| Med | Scraped page JSON and article text interpolated into prompts without data delimiters; scraped recipe fields labelled "Verified" | main.js 6519, 931-935, 4979 | Delimited data blocks; label provenance honestly |
| Med | Instruction conflicts: H1 + "1500 words" in decor/fashion prompts vs "no H1" + length setting; three different ending sections; metric-weight demand vs "do not invent conversions"; ribbon overlay vs "no text panel" | prompts.js:21,38,109-126; article-editorial.js:21-22; main.js:1036, 4652 | Single consistent rule set |
| Low | Per-section image prompts: one GPT-5-default call per H2 with no `max_tokens` | main.js:6328 | Batch + limit |
| Low | Cost estimator omits chunks, repairs, retries; Pin text priced at one call instead of two | cost-estimation.js:46-51; pinterestCost.mjs:31 | Count actual calls |

## Proposed evaluation method (not run — needs your approval for spend)

1. Fixed dataset: 12 keywords (4 single recipes, 4 roundups, 2 drinks/no-cook, 2 non-food), plus 3 past failures.
2. Run current vs revised prompts on the same model and seed where supported; cap spend with the existing daily budget guard.
3. Score deterministically (recipe validator, leak rules, schema match, length, link policy) and blind-review a sample for usefulness.
4. Route cheap models (`gpt5nano`) only where deterministic scores match the stronger model.
