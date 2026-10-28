# 09 — Implementation Log

Branch: `claude/content-studio-360-audit` (from `codex/pinterest-workspace-upgrade` at `ec64946`). Rollback: `git revert <commit>` or switch back to `codex/pinterest-workspace-upgrade`.

## Earlier in this session (already in `ec64946`)

Pinterest board re-sync loop; reconnect sync state; disconnected-during-sync guard; Review Desk interrupted jobs; diagnostics newest-100 jobs; OAuth link through the safe opener; sanitize-html, follow-redirects, zod, body-parser, fast-uri updates; Electron 43.8.3 (certificate advisory, tzdata 2026d).

## This audit

| Change | Files | Test |
|---|---|---|
| Unknown WordPress status fails closed to `draft`; status normalised to lowercase | electron/wordpress-payload.js | audit-360: status test |
| Poultry 74/75 °C check no longer matches "175°C" | electron/recipe-generation.js | audit-360: 175 C test |
| Durations parse `1/2`, `1 1/2`, `½`; ISO output rounded minutes | electron/recipe-card-parser.js, src/lib/articlePostProcess.mjs | audit-360: fractions test |
| "Serves/Yields/Servings N" accepted as yield | electron/recipe-card-parser.js | audit-360: yield test |
| Complete recipe collections fail readiness when any recipe has an error | electron/article-recipe-readiness.js | audit-360: collection test |
| AI-repaired recipe card re-checked for prompt leaks before publish | electron/main.js (push-to-wordpress) | Not unit-testable (main process); covered by existing leak-rule tests |
| Meta description keeps its last word when under 160 chars | src/lib/articlePostProcess.mjs | audit-360: meta test |
| Internal links never inserted inside recipe cards | src/lib/internalLinks.js | audit-360: link test |
| Bulk publish enforces critical quality blockers (needs-review with reasons) | src/components/ArticlesList.jsx | UI path; covered by `buildArticleQualityReport` tests |
| GHL status refresh merges results instead of truncating receipts to 200 | electron/main.js | Not unit-testable (main process) |
| Paid video kept with provider URL when local download fails | electron/main.js, src/components/VideoStudio.jsx | Not unit-testable (needs provider) |
| Revenue CSV re-import updates rows (content-derived IDs) | electron/growth-workspace.js | audit-360: revenue test |
| Revenue CSV import errors shown; update-check errors no longer leave buttons stuck | src/components/GrowthWorkspace.jsx, Diagnostics.jsx | Screen sweep |
| Meta 4:5: whole Pin fitted over a blurred, dimmed copy instead of a centre crop; fingerprint `contain-blur:v3` rebuilds old assets | electron/meta-portrait.js, electron/main.js, electron/meta-auto-pack.js, src/components/MetaStudio.jsx | audit-360: pixel test (headline band at top, button band at bottom, dimmed side bands) |
| Pin text: timed-out or interrupted predictions are not resubmitted (one paid submission) | electron/main.js generatePinAIContent | audit-360: no-retry source test |
| Publish schema keeps author, datePublished, keywords, category, description from the editor; never carries ratings/nutrition; temporary replicate.delivery images excluded | electron/article-recipe-readiness.js | audit-360: schema merge test |
| Complete collections publish one Recipe per visible recipe (@graph) | electron/article-recipe-readiness.js | audit-360: collection schema test |
| Card microdata stripped at publish; JSON-LD is the single recipe entity | electron/article-recipe-readiness.js, main.js | audit-360: microdata test |
| AI-written recipes (generated or AI-repaired) publish without Recipe JSON-LD until "I Reviewed This Recipe"; a recipe edit invalidates the review | article-recipe-readiness.js, main.js (mark-recipe-reviewed IPC, publish), preload.js, ArticleEditor.jsx, src/lib/electron.js | audit-360: review hash test; real-app click test (panel shown, review stored, 0 page errors) |
| GHL upload blocks a second live post with the same caption body for the same platform and location within 14 days | electron/ghl-dedupe.js, main.js | audit-360: dedupe test |
| Home decor and fashion articles: no forced recipe card, recipe guidance, recipe editorial pass, paid card repair or recipe schema | article-recipe-readiness.js, main.js generate-article, Queue.jsx | audit-360: non-food test |
| Pin overlay: overflowing headlines re-wrap (up to 4 lines) and shrink to stay inside the Pin; characters a font lacks use Montserrat; emoji dropped; QA safe zone now checks horizontal bounds and glyphs | electron/pinterest-overlay.js | audit-360: overlay fit and glyph tests; visual preview |
| Meta: engagement-bait check covers keyword-comment, DM, "drop a ❤️", "share with someone who", double tap on every FB and IG field; bare domains stripped; accent-safe hashtags; distinct Instagram caption (quick facts + save cue) and a natural Facebook question | src/lib/metaQuality.mjs, electron/meta-captions.js, electron/meta-auto-pack.js | audit-360: three Meta tests |
| Featured image upload failure saves the post as a draft; updates without a new image keep the current featured image | electron/wordpress-payload.js, electron/main.js | audit-360: featured-image test |
| Version 1.6.3 | package.json, package-lock.json | — |
| SEO: canonical = current public permalink; Open Graph sent separately; generated H1 → H2; transliterated slugs; alt text names the dish once; stricter doneness cues; numbered tips not split into recipes; better topic overlap + exact published duplicates skipped at intake | rank-math-meta.js, main.js, recipe-generation.js, recipe-units.js, article-intake.mjs, articlePostProcess.mjs, AddToQueue.jsx | audit-360: 4 tests |
| Reliability: Pin save and screen load failures shown; Recipe Money Maker in backups + key removal + safe connection test; update Download / Restart-and-Install buttons; user-confirmed clearing of unknown WordPress receipts; Facebook/Instagram account isolation; Job Center routes | PinCreatorView, MetaStudio, ClusterPlanner, recipe-money-maker.js, workspace-backup-worker.js, Diagnostics.jsx, ArticleEditor.jsx, job-center.js, main.js | audit-360 + audit-fixes: 2 tests; real-app backup check |
| AI: achievable length check; array-aware JSON parsing; larger output limits; collection-part and two-call Pin cost estimates; fenced untrusted data; honest source labels; decor/fashion prompts without H1/fixed length; collections get brand voice and outline | main.js, prompts.js, cost-estimation.js, pinterestCost.mjs | audit-360: 3 tests |
| Video: unknown model / unsupported ratio / local start image rejected before any paid call; settings-based Pruna cost; cancel waits for the job | main.js, VideoStudio.jsx | audit-360: 1 test |
| Dead code removed: legacy Pin Creator window, RepurposeStudio, six unused IPC channels | electron/pin-creator/, RepurposeStudio.jsx, preload.js, main.js, electron.js | tests updated |
| Project skills + sweep script | .claude/skills/* | Sweep run from skill folder: 0 problems |

Each new unit test was confirmed to **fail on the original code** (source files stashed) and pass after the fix.

## Verification

| Check | Before audit | After |
|---|---|---|
| `npm run lint` | pass | pass |
| `npm test` | 418 pass | 426 pass, 0 fail |
| `npm run build` | pass | pass |
| `npm run test:ui` | 6 scripts pass | 6 scripts pass |
| Screen sweep (22 screens + tabs) | 0 problems | 0 problems |
| `npm audit --omit=dev` | 0 | 0 |

## Behaviour changes to be aware of

- Bulk publishing now skips articles with critical quality issues unless an override was recorded in the editor.
- Complete recipe collections with an unsafe or incomplete later recipe now stop at "Recipe needs review" instead of publishing.
- A CSV/batch row with status "Draft" (any case) or an unknown value now creates a draft instead of a public post.
- AI-written recipes publish without recipe rich-result data until reviewed in the editor; republish after review to add it.
- GoHighLevel refuses a second post with the same caption on the same platform within 14 days.
- A post whose featured image upload hits a temporary WordPress outage is saved as a draft.

## Unresolved

See 10-PRIORITIZED-ROADMAP.md. Nothing was published, uploaded, deleted, paid for, installed or pushed.
