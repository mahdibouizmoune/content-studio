# Content Studio 1.6.5

Includes the 1.6.4 data-preservation, recipe-review, collection-validation,
account-scoped GHL duplicate protection and image-aware Recipe schema fixes.

## Added And Fixed

- Roundups receive unique, repeatable visible section anchors and all-in-one
  ItemList data using the real WordPress permalink. Each listed recipe must
  have its own eligible photo; human review requirements remain unchanged.
  New posts are created once, then the same post is updated with its confirmed
  permalink. Lost update responses reconcile by revision or remain unknown.
- Prompt Lab has a fixed 15-case evaluation set, immutable candidate queues,
  explicit unassigned cases, local result exports and an estimated per-run
  reservation cap. Setup buys no generations. Unknown prices block paid test
  requests. Actual provider charges can differ from estimates.
- Keyword opportunity ranking uses fresh saved Pinterest performance and
  Search Console query evidence, coverage overlap and configurable weights.
  Missing/stale evidence stays unavailable; unmeasured scores are capped.
  Seasonal windows are explicitly calendar inferences, not volume forecasts.
- Calendar now joins local Pin plans, exact CSV row dates, WordPress receipts
  and GHL receipts. Exported, failed, confirmed and unresolved results remain
  distinct. Query-based WordPress post identities and UTC times are preserved.
- Content Pipeline Readiness separates setup from recorded verification and
  does not expose secrets or submit remote writes.
- Production release command requires signing credentials and an approved
  HTTPS feed. Build provenance carries public publisher/feed metadata through
  packaging; unsigned test builds cannot install automatic updates. CI uploads
  update manifests alongside signed artifacts, but does not deploy the feed.
- MAC-HANDOFF.md now documents the current source and correctly labelled local
  Mac build commands. No source credentials or profile data are shared.

## Verification

- 496 tests passed, no failures or skips.
- Lint and production renderer build passed.
- Seven desktop/mobile browser suites passed.
- Isolated native app sweep: 22 screens, no renderer errors.
- Six disposable WordPress staging assertions passed.
- npm production dependency audit: zero known vulnerabilities at check time.

No paid generation, live-site publication, live-media cleanup, or real Pinterest
import was performed. No Mac installer was built on Windows. Signing
certificates, feed deployment, platform access and actual Pinterest/GHL import
results still require external setup/evidence. Automated checks do not prove
cooking safety, CTR, search eligibility, or reader retention.

## Release Setup

Use the existing production-release GitHub environment, reviewed matching
version tag, and a clean checkout. Set the environment variables/repository
variables CONTENT_STUDIO_WINDOWS_PUBLISHER and CONTENT_STUDIO_UPDATE_URL;
provide signing/notarization secrets only through the secret store documented
in .github/workflows/release.yml. Run npm run dist:signed. Host the verified
artifacts and generated update manifests at the approved HTTPS feed. This
repository does not contain a certificate, private key or account credentials.

## Primary References

- https://developers.google.com/search/docs/appearance/structured-data/recipe
- https://developers.google.com/search/docs/appearance/structured-data/carousel
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- https://www.electron.build/v26/docs/features/code-signing/code-signing-win/
