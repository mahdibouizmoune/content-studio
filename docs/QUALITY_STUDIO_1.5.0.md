# Content Studio 1.5.0: Quality, Cost and Release Upgrade

## Implemented

- Quality Studio: structural recipe checks, normalized measured ingredients, source Recipe JSON-LD evidence, saved recipe collections and printable combined shopping lists. Ingredient matching is advisory: synonyms and collective instructions are not reliably understood by a parser. Amounts combine only for the same description/unit; no guessed cup-to-gram conversions. Existing article recipe readiness now attaches the structural report without another paid call.
- Local English OCR using bundled Tesseract data. Results include expected/recognized text, confidence, missing/extra words and an artwork fingerprint. Low confidence, changed artwork, reordered or repeated words do not get a false pass. OCR does not establish food realism or culinary accuracy and never automatically regenerates an image.
- Explicit visual review tied to final image bytes. Pin Creator's former Quality badge is renamed Readiness because it measures metadata/export requirements. Its preview displays the whole image instead of cropping the taller format. The existing Ingredient Closeup default and one-pass AI prompt remain unchanged.
- Optional Satori/Sharp exact-text copy on a photograph explicitly confirmed to have no lettering. It creates a separate 1080 x 1920 managed asset, clears old hosting/export metadata, and leaves the original Pin untouched. Fonts are bundled with their notices.
- Persistent spending ledger covering shared Replicate prediction submissions, direct managed predictions, rewrites/reference generation and Recipe Money Maker's DeepSeek calls. Only hashes, model IDs and request/result references are logged, not prompts or API keys. Polling/cancellation is not charged as a new request. Ambiguous creates retain their reservation and are not replayed. The guard uses UTC daily reservations, not provider-enforced maximum billing. Model estimates are approximate, not invoices. Actual charges remain unknown until the user records a receipt; unknown exposure blocks further requests when the guard is enabled. Existing provider account limits still matter.
- TanStack virtualization for large Job Center lists and Quality Studio recipes/spending/events. Lists below 51 items retain normal rendering. Existing Pin pagination remains intact.
- Optional original WordPress Reader plugin ZIP: print, ingredient checkboxes, device-local save, shopping list, cook mode and native sharing where supported. It does not load remote scripts or add a tracking code. Optional GA4 events are off by default and pass only through the site's existing consent-configured gtag. Recipe interaction counts can be read by page and utm_content/sessionManualAdContent after authorized GA4 setup. The G- tracking code alone still cannot read reports. Counts are events, not unique visitors, measured CTR or guaranteed retention.
- Isolated WordPress Playground checks for real REST media failure/recovery, draft recipe preservation, repeat update behavior, unauthorized publishing and plugin privacy defaults. No live website credentials are used.
- Optional independently runnable pg-boss/PostgreSQL worker with signed immutable handoffs, explicit approval, exact public image-byte checks, account identity checks, persisted ownership before a create request, no ambiguous create retries and signed result reconciliation. Handed-off drafts cannot be edited, scheduled locally or unlocked by normal review controls. The server is NOT deployed/enabled automatically. It needs approved Pinterest API access, credentials and separate administrator setup; CSV remains the working route without a developer app. Late jobs are held rather than silently posted days later.
- Release provenance includes version, exact commit, version tag, lockfile hash, build time and clean/dirty status. Distribution builds require a clean matching tag. Unsigned local test builds are explicitly labelled and cannot be confused with signed releases. CI covers all PR bases and Windows/macOS/Linux checks; the separate signed release workflow uses a protected GitHub environment. Mac artifacts require signing/notarization assessment and Windows artifacts require a valid publisher signature.
- Recipe Money Maker now uses the central trusted IPC guard, refuses insecure new secret storage, does not accept an arbitrary logo path from the renderer, and ignores model-invented nutrition values.

## Setup Boundaries

Code-signing certificates are different from your Windows login PIN. Signing cannot be enabled without a publisher certificate/service; no certificate was invented or installed. The current working tree contains older uncommitted upgrades and the existing open PRs have different baselines. No blind merge, tag, automatic production release or GitHub visibility change was performed. Review/consolidate that source before creating a signed production tag. A local unsigned test package reports its unverified development status honestly.

The worker, WordPress plugin activation, server credentials and GA4 reporting access all require explicit setup. Nothing was posted, deleted on WordPress, deployed to a server or billed to an AI provider during these checks. WordPress Playground downloads public test runtimes; npm installs download dependencies. Real PostgreSQL/Pinterest publishing and Mac notarization cannot be exercised without those environments/credentials.

## Licensing

No Postiz or Mealie application code was copied. Libraries are used through their public APIs: parse-ingredient (MIT), TanStack Virtual (MIT), Tesseract.js (Apache-2.0), Satori (MPL-2.0), Sharp (Apache-2.0), pg-boss/pg (MIT). Satori remains unmodified with its upstream source/license available at https://github.com/vercel/satori . WordPress Playground is GPL-2.0-or-later and is used only as a separate development test runner, not bundled into the desktop product. Existing bundled font license files remain included.

## References

- https://github.com/jakeboone02/parse-ingredient
- https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md
- https://github.com/vercel/satori
- https://tanstack.com/virtual/latest/docs/introduction
- https://developer.wordpress.org/playground/handbook/guides/e2e-testing-with-playwright/
- https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- https://github.com/timgit/pg-boss
- https://developers.pinterest.com/docs/api/v5/pins-create/

Validation results and any packaging limitations are recorded in the task close-out. Production dependency advisory scan: zero reported vulnerabilities at implementation time; this is not a guarantee against future advisories. Development build tools have separate outstanding upstream advisories and are not shipped as runtime dependencies.

## Verified Build

- 367 automated tests passed; lint and production renderer build passed.
- Desktop and phone UI tests passed for batch recipe checks, collections/shopping export, local OCR states, spending settings, event/worker availability and lists containing 1,000 jobs. Reader controls were exercised with analytics off.
- WordPress 6.8 / PHP 8.3 disposable staging produced a verified PHP assertion receipt for all six real REST/privacy checks. Windows Playground emitted harmless file-unlock warnings during temporary-site cleanup; assertions completed successfully.
- The protected packaged Windows app passed offline Tesseract OCR using its bundled language files, Satori/Sharp 1080 x 1920 rendering, original-image preservation, parsed recipe reports, spending policy persistence, no-provider-call checks and real navigation to the new screens.
- Archive inspection confirmed matching 1.5.0 provenance/lockfile hash, current worker code, bundled language models and Satori license, and no WordPress development runner, source maps or Git directory.
- Installer: `release-quality-studio-final/Content Studio UNSIGNED TEST Setup 1.5.0.exe`.
- Installer SHA-256: `ADF35BBBB97BC4731E3885B19351AEE61CAA4FD6459A82C8C8A09ED161BE9A42`.
- This is an unsigned local test installer, not a certified production release. The manifest correctly identifies uncommitted development source based on commit `84b0bad786720cbbf0056021cbcb651587fd27ed`.
- Optional worker dependency loading, syntax, signing/approval lifecycle, ownership races and create-once failure behavior were tested locally. Real PostgreSQL dispatch and live Pinterest publication were not run; Mac packaging/notarization and authorized GA4 live reports were not run.
