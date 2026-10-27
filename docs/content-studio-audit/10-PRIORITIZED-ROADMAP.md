# 10 — Prioritized Roadmap

Impact/Effort: H/M/L. Confidence reflects code evidence (C = confirmed in code, R = research-backed, H = hypothesis). "Approval" = needs your decision or spend.

| Rank | Item | Impact | Effort | Conf. | Approval |
|---|---|---|---|---|---|
| 1 | Meta 4:5 crop cuts Pin headlines and CTA — choose letterbox or geometry-aware crop | H | M | C | Yes (visual change) |
| 2 | Recipe-only rules and paid card repair applied to non-food listicles | H | M | C | Yes (needs paid test) |
| 3 | Mark AI-invented recipes as untested; require review before Recipe schema | H | M | C+R | Yes (workflow) |
| 4 | Roundups: `ItemList` + per-recipe `Recipe` schema; remove duplicate microdata | H | M | C+R | No |
| 5 | Publish-time schema drops author/datePublished and user edits — merge instead | M | L | C | No |
| 6 | Featured-image failure should publish as draft | M | L | C | Yes (behaviour) |
| 7 | GHL logical dedupe key (article + platform + location) | M | M | C | No |
| 8 | Do not auto-resubmit timed-out Pin text predictions (double-charge risk) | M | L | C | No |
| 9 | Long article lengths exceed max_tokens → chunk or remove options | M | M | C | Yes (paid test) |
| 10 | Collection path should use approved outline, brand voice, SEO brief | M | M | C | Yes (paid test) |
| 11 | Overlay horizontal overflow + missing-glyph fallback, with QA bounds check | M | M | C | No |
| 12 | Platform-distinct FB/IG captions and quality gate in bulk Meta path | M | M | C+R | No |
| 13 | Broader engagement-bait and bare-domain link filters; accent-safe hashtags | M | L | C+R | No |
| 14 | Pin save failures and initial-load failures shown to the user | M | L | C | No |
| 15 | Canonical from current post link; send Open Graph to Rank Math | M | L | C | No |
| 16 | Back up Recipe Money Maker store; allow clearing the DeepSeek key | M | L | C | No |
| 17 | Wire update download/install buttons (user-initiated only) | M | L | C | Yes |
| 18 | Prompt instruction conflicts (H1, length, endings, metric weights, overlay ribbon) | M | L | C | Yes (paid test) |
| 19 | JSON truncation limits; array support in `safeJsonParse` | M | L | C | No |
| 20 | Accurate cost estimator (chunks, repairs, retries, two Pin calls) | M | L | C | No |
| 21 | Blocking cannibalization check against synced WordPress posts | M | M | C+R | No |
| 22 | Prompt-injection hygiene: delimited data blocks, honest provenance labels | M | L | C | No |
| 23 | Remove dead code (RepurposeStudio, legacy pin-creator renderer, unused preload methods) | L | L | C | Yes (API surface) |
| 24 | Feature-flag migration respects user opt-outs | L | L | C | No |
| 25 | Measured 9:16 vs 2:3 Pin comparison using your analytics | M | M | R+H | Yes (data access) |

## Strategic (needs planning)

- Prompt evaluation harness with a fixed 15-case dataset and spend cap (07).
- Keyword opportunity score using Pinterest Trends growth fields (relative values only), GSC queries and existing coverage, with configurable weights and an explicit data-confidence column.
- Unified calendar joining article schedule, CSV rows and GHL posts.
