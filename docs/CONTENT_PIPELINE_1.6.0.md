# Content Pipeline 1.6.0

## Added

- Content Pipeline connects saved articles, every recipe card, related Pinterest Pins, Meta drafts, and CSV import outcomes. Explicit source checkpoints flag changed recipes and changed artwork. Checkpoints are not publishing approval.
- Recipe Workbench edits structured recipe names, timing, servings, ingredient lines, and instructions. Saves preserve surrounding article notes, keep 20 prior revisions, reject stale edits, clear stale structured data, and require review. Loading an older revision does not save or publish it automatically.
- Prompt Lab freezes the original style as a locked baseline and saves immutable candidate versions. Benchmark Pins remain separate from the normal article Pin. Queueing a test and building its prompt do not call a paid model. Image generation still requires the existing explicit generation action and spending guard.
- Benchmark records bind the candidate version, source recipe fingerprint, and actual finished image fingerprint. Structural checks, local text checks, and human visual review are reported separately; realism is never invented from a numeric score.
- Observational Pin comparisons match real remote Pin IDs to imported Pinterest analytics. Missing, duplicate, invalid, or changed-artwork data cannot become a winner. A comparison needs at least 1,000 measured impressions per variant and still does not establish causation.
- Per-article generation costs use request attribution where available and allow manual evidence-backed attribution for older requests. Reserved/reconciled costs remain distinct from provider-reported actual charges and unknown charges. Current approved article and visually reviewed Pin denominators are explicit.
- Weekly printable HTML recipe packs include up to seven articles, all complete recipes, original cooking times and servings, destination recipe links, and a combined shopping list. The multiplier changes the shopping list, not cooking times or recipe instructions. Output is escaped, static, printable, and blocks scripts and external resources.

## Fixed

- Performance-hour analysis and daily scheduling limits now use the same explicit account timezone, including DST. Weak hour samples fall back to ordinary suggested windows rather than becoming best-time claims. The legacy scheduling handler rejects incomplete slot results. Daily-count lookup no longer repeatedly converts every earlier slot.
- Recipe quality inspection and shopping lists cover every recipe in numbered collections and separate cards, rather than only the first recipe.
- Large creation screens mount on first visit and remain mounted afterward, preserving in-flight work. The new pipeline editor also remains mounted and refreshes connected records on return without discarding the local recipe draft.
- CSV receipt text and unsaved outcome selections are retained per batch, saved with a short debounce, and flushed when leaving the field, switching batches, or leaving the page. Native email import supports bounded `.eml`, `.txt`, and HTML files, including encoded MIME bodies, without loading external content.
- Failed-only CSV recovery previews only reported failures. Unknown outcomes are not silently marked successful or automatically retried.
- Saved Pin records retain prompt style/mode and benchmark lineage fields. Normal duplicate handling no longer merges a benchmark with the original article Pin or another benchmark.
- Identical completed generation requests can reuse the same Pin's verified local image bytes at the required dimensions. Explicit Regenerate Image bypasses reuse. This is not cross-article copying, and hosting/export verification remains separate.

## Preserved

- Ingredient Closeup / early July remains the primary Pin style. Existing style settings, portrait dimensions, hosting choices, CSV workflow, WordPress posts, and Meta source rules were not replaced.
- New operations use the current workspace database and backup system. No additional AI subscription, server, or deployment is required for the local features.
- The email parser is `postal-mime` 4.0.11 (MIT-0); no code from AGPL social-publishing applications was copied.

## Verification and Boundaries

- Completed: 383 automated tests, lint, production frontend/Windows build, and production dependency audit (zero known vulnerabilities). Finished-build navigation passed on desktop, tablet, and mobile. Native packaged navigation and Content Pipeline tests passed separately.
- The development-server full navigation run timed out without a rendering exception; the same suite passed against the finished build. This distinction is retained in the installer verification notes.
- Automated tests cover recipe collections, source-change protection, immutable prompt versions, actual-image lineage, metrics evidence, cost attribution, pack escaping, MIME parsing, timezone/DST boundaries, and separate benchmark identities.
- Desktop/mobile fixture checks exercise the real operations service, recipe revision restore, prompt queueing without new spending, measured comparisons, costs, recipe-pack downloads, receipt batch switching/refresh/reload, and failed-only recovery.
- Existing Pinterest timing and Quality Studio/reader checks are included in regression testing. The packaged build is checked separately with a fresh, isolated profile.
- No real posts were published, no paid AI predictions were submitted, no user workspace data was changed, and no server was deployed during these checks. Live Pinterest import acceptance and external host availability remain outside local test coverage.
- Recipe structure checks do not prove a recipe was kitchen-tested, nutritionally verified, or safe in every situation. Human review remains required.
- The Windows installer is an unsigned test build, not a publisher-signed production release. Windows may show a publisher warning. It is not installed automatically.
