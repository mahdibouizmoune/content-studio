# Content Studio 1.2.93: audit fixes

Date: September 14, 2026.

## Changes

- WordPress post IDs and manual category overrides are scoped to the destination
  site. The publisher fetches and checks the article identity marker before
  updating an existing post. Failed lookup requests cannot become new posts.
- Rejected updates remain failures. Interrupted responses are reconciled only
  against the exact submitted revision and publication status. A saved receipt
  alone is never proof of a successful update. Incomplete responses are rejected.
- Publication intent is saved before submitting the post. An unresolved create
  blocks blind retries. Concurrent publication of the same article/site is blocked.
- The returned WordPress status reflects the actual remote status. A draft is
  not automatically queued as a published article for Pinterest or public QA.
- Settings recovery no longer replaces existing authoritative SQLite roots with
  older settings snapshots, including when the database root is intentionally empty.
- Meta 1080 x 1350 crops record source identity, revision, byte hash, and crop
  parameters. Regenerated Pins invalidate stale crops. The bulk workflow recreates
  them; manual export rejects outdated assets. Replacement at the same URL/path
  is checked by hashing the current source bytes before export.
- GHL retry keys use the original input schedule, not an automatically shifted
  future time. Intent is stored before the remote request; final receipts replace
  that intent. Uncertain outcomes and unverifiable existing post IDs cannot fall
  through to another create request. Definitive rejections can be retried.
- Patched runtime and build dependencies, including sharp, csv-parse,
  sanitize-html, fast-uri and js-yaml. No forced blanket major upgrade was used.
- Normal Windows installer builds now require a valid Authenticode publisher
  signature. An explicitly enabled local-test exception requires UNSIGNED TEST
  in the installer filename. This does not obtain or configure a certificate.

## Verification

- 225 tests passed, including 18 new audit regressions exercising actual
  WordPress/GHL handlers with mock HTTP and isolated stores.
- ESLint and production renderer compilation passed.
- Full npm audit and production-only npm audit reported zero known vulnerabilities
  on the date above. This is not a guarantee against unknown vulnerabilities.
- git diff --check passed.
- Pinterest import-history browser checks passed: receipt review, saved outcomes,
  failed-only retries, and desktop/mobile layouts. The first cold Vite run timed
  out; the repeat after dependency optimization completed passed.
- The Windows installer was built and the unpacked packaged app started with an
  isolated empty user-data directory. Startup logged encrypted storage available
  and no startup error; the smoke-test process was then stopped.
- Get-AuthenticodeSignature confirms the local test installer is NotSigned.
  Installer: release-local-unsigned/Content Studio UNSIGNED TEST 1.2.93.exe.

## Operational limits

Pinterest remains CSV-only. A successful export does not mean Pinterest accepted
or published the rows. Keep reconciling the import email with delivery history;
do not re-upload unresolved batches blindly.

No live publication, real settings changes, installation, or data restoration was
performed. Tests use temporary/isolated data. Previously damaged content is not
automatically restored, and historical remote outcomes are not inferred.

Legacy WordPress posts without a verifiable article marker may require manual
review before an update is allowed. This is intentional protection against
overwriting an unrelated post.

The Windows login PIN/password is unrelated to code signing. A publisher signing
certificate or managed signing service must still be configured for distribution.
The local test installer is unsigned and may trigger Windows reputation warnings.
Existing source obfuscation and ASAR integrity checks remain enabled, but desktop
JavaScript cannot be made impossible to extract or reverse-engineer. Do not embed
publisher secrets or licensing master keys in a distributed application.
