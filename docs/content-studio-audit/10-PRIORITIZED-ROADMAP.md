# 10 — Prioritized Roadmap

Impact/Effort: H/M/L. Confidence reflects code evidence (C = confirmed in code, R = research-backed, H = hypothesis). "Approval" = needs your decision or spend.

| Rank | Item | Impact | Effort | Conf. | Approval |
|---|---|---|---|---|---|
| 1 | ~~Meta 4:5 crop cuts Pin headlines and CTA~~ — done: fit over blurred copy | H | M | C | Approved and done |
| 2 | ~~Recipe-only rules and paid card repair applied to non-food listicles~~ — done (deterministic; generated output quality not measured) | H | M | C | Approved and done |
| 3 | ~~Mark AI-invented recipes as untested; require review before Recipe schema~~ — done: schema withheld until "I Reviewed This Recipe" | H | M | C+R | Approved and done |
| 4 | Roundups: ~~per-recipe `Recipe` schema; remove duplicate microdata~~ done. Remaining: `ItemList` carousel needs per-recipe anchors and the published URL | H | M | C+R | No |
| 5 | ~~Publish-time schema drops author/datePublished and user edits~~ — done: merged | M | L | C | Done |
| 6 | ~~Featured-image failure should publish as draft~~ — done; updates also keep the current featured image | M | L | C | Approved and done |
| 7 | ~~GHL logical dedupe~~ — done: same caption + platform + location within 14 days is blocked | M | M | C | Done |
| 8 | ~~Do not auto-resubmit timed-out Pin text predictions~~ — done | M | L | C | Done |
| 9 | ~~Long article lengths exceed max_tokens~~ — done: length check matches what one response can hold (no more three failed paid attempts) | M | M | C | Done |
| 10 | ~~Collection path should use approved outline, brand voice~~ — done (output quality unmeasured) | M | M | C | Done |
| 11 | ~~Overlay horizontal overflow + missing-glyph fallback, with QA bounds check~~ — done (text wider than the glass panel in compact styles is unchanged default behaviour) | M | M | C | Done |
| 12 | ~~Platform-distinct FB/IG captions~~ — done; the bulk path uses the same fixed templates, which now pass the checks | M | M | C+R | Done |
| 13 | ~~Broader engagement-bait and bare-domain link filters; accent-safe hashtags~~ — done | M | L | C+R | Done |
| 14 | ~~Pin save failures and initial-load failures shown to the user~~ — done | M | L | C | Done |
| 15 | ~~Canonical from current post link; send Open Graph to Rank Math~~ — done (Open Graph best-effort: Rank Math does not document accepted keys) | M | L | C | Done |
| 16 | ~~Back up Recipe Money Maker store; allow clearing the DeepSeek key~~ — done | M | L | C | Done |
| 17 | ~~Wire update download/install buttons~~ — done (click only; Windows updates still need a signed build) | M | L | C | Done |
| 18 | ~~Prompt conflicts: H1, fixed length, metric weights~~ — done; ending order and overlay-ribbon wording unchanged | M | L | C | Mostly done |
| 19 | ~~JSON truncation limits; array support in `safeJsonParse`~~ — done | M | L | C | Done |
| 20 | ~~Cost estimator: collection parts, two Pin calls~~ — done; repairs and retries are not predicted | M | L | C | Done |
| 21 | ~~Cannibalization against synced WordPress posts~~ — done: exact matches skipped at intake, better overlap scoring | M | M | C+R | Done |
| 22 | ~~Prompt-injection hygiene~~ — done for scraped page and article blocks and recipe labels | M | L | C | Done |
| 23 | ~~Remove dead code~~ — done | L | L | C | Done |
| 24 | Feature flags: migration v4 already ran for existing installs; label corrected ("on by default") | L | L | C | Done (label) |
| 25 | Measured 9:16 vs 2:3 Pin comparison using your analytics | M | M | R+H | Yes (data access) |

## Strategic (needs planning)

- Prompt evaluation harness with a fixed 15-case dataset and spend cap (07).
- Keyword opportunity score using Pinterest Trends growth fields (relative values only), GSC queries and existing coverage, with configurable weights and an explicit data-confidence column.
- Unified calendar joining article schedule, CSV rows and GHL posts.
