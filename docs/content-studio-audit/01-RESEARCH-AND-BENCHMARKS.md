# 01 — Research and Benchmarks

Research date: 2026-10-27. Evidence levels: **R** official requirement, **O** official recommendation, **P** practitioner/vendor report, **U** unverified.

## Google Search

| Finding | Level | Source (page date) |
|---|---|---|
| AI Overviews / AI Mode need no special markup, files or schema; page must be indexed and snippet-eligible. Controls: `nosnippet`, `data-nosnippet`, `max-snippet`, `noindex`. Traffic is reported under Search Console "Web". | R/O | developers.google.com/search/docs/appearance/ai-features (2025-12-10) |
| Structured data must match visible text. | O | same |
| Recipe rich results require `name` and `image`; recommended `recipeIngredient`, `recipeInstructions` (HowToStep text only), `prepTime`+`cookTime` or `totalTime` (ISO 8601), `recipeYield` (servings number), `author`, `datePublished`, `description`, `video`. `nutrition.calories` requires `recipeYield`. | R/O | developers.google.com/search/docs/appearance/structured-data/recipe (2026-09-08) |
| Collections: `ItemList` with `ListItem` (integer `position`, unique canonical `url`); separate `Recipe` per dish. | R (for carousel) | same |
| Scaled content abuse covers mass AI pages without user value and scraped/synonym-swapped content. No standalone AI ban. | R | developers.google.com/search/docs/essentials/spam-policies (2026-08-28) |
| No preferred word count; changing dates without substantive change is a warning sign; disclose automation where readers would wonder; never fabricate authors/credentials. | O | developers.google.com/search/docs/fundamentals/creating-helpful-content (2026-10-05) |

**GEO conclusion:** Google states there is no separate GEO technique. "GEO" work for this app = accurate, original, crawlable text plus structured data matching the page. Claims about special AI files (e.g. llms.txt) for Google are **not supported** by the source.

## Pinterest

| Finding | Level | Source |
|---|---|---|
| Standard Pin 2:3 (1000x1500); "larger aspect ratios may get cut off in people's feeds"; title 100 chars (≈40 shown); description 800 chars; key message top, visual middle, details bottom; refresh creative for seasonal moments (no fixed cadence). | O | business.pinterest.com/creative-best-practices (no date shown) |
| Bulk create: business account, up to 200 images/videos, desktop only; no alt-text column in the CSV. | O / P | create.pinterest.com bulk page; Pinterest staff reply on community.pinterest.biz |
| CSV "500-char description" and "within 14 days" rules | U (vendors only) | pinbulk.pages.dev (commercial) |
| Rate limits: Trial 1,000 req/day/app (`org_write` 300/day); Standard `org_write` 100/min, `trends_read` 60/min, `org_analytics` 60/min; `x-ratelimit-*` headers; limits may change without notice. | R | developers.pinterest.com/docs/reference/rate-limits (no date) |
| Trends API: `GET /v5/trends/keywords/{region}/top/{trend_type}`, ≤50 results, `pct_growth_wow/mom/yoy` capped ±10000%, `time_series` weekly, normalised 0-100 (relative, **not volume**), today only; for agencies/enterprise/partners. | R | developers.pinterest.com/docs/analytics-and-reports/trends (no date) |

**Contradiction flagged:** Pinterest recommends 2:3; the app's approved default is 9:16 (1080x1920). The default is a user requirement and was **not changed**. The existing optional 2:3 copy/feed preview is the evidence-aligned path; a measured comparison using the user's own analytics is recommended (roadmap).

## Meta / Instagram

| Finding | Level | Source |
|---|---|---|
| Caption max 2,200 chars, 30 hashtags, 20 @mentions; images JPEG ≤8 MB, aspect 4:5 to 1.91:1, width 320–1,440 px; carousels ≤20 items; Reels 3 s–15 min, 9:16 recommended. | R | developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media |
| API publishing limit: the same guide states both 100 and 50 posts per rolling 24 h; check `content_publishing_limit`. Containers expire after 24 h; poll `status_code` once a minute for ≤5 minutes; media must be public at publish time. | R (conflicting) | developers.facebook.com/docs/instagram-platform/content-publishing |

## Competitor benchmarking

Not performed in depth. Capabilities commonly offered by Pinterest schedulers (Tailwind-style smart scheduling, board lists), SEO suites (keyword volume), and social suites (unified calendar, approvals) are noted in the roadmap only where the app lacks an equivalent. No proprietary implementations were copied.

## Not researched (limitations)

Pinterest Rich Pins and website claiming pages, Meta original-content/engagement-bait policy pages, Google image SEO and Core Web Vitals pages, and GA4 attribution docs were not fetched in this session.
