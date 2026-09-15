# Pinterest CSV and delivery audit

Audited Content Studio 1.2.91 on September 14, 2026. This is an audit and
implementation recommendation, not a claim of successful Pinterest ingestion.
No production Pins, site media, or app settings were changed by this audit.

## Executive conclusion

The supplied batch was read by Pinterest: its email names all 18 titles and
boards and reports zero successes. The generic "Upload didn't work" error does
not establish whether the host, account, or Pinterest processing caused failure.
The prior local checks found genuine 1000 x 1500 JPEGs and reachable destinations.
Do not label ImgBB as the proven cause or claim changing CSV quoting fixes this.

The lasting improvement is end-to-end delivery accounting. A valid CSV is an
input to Pinterest, not a receipt from Pinterest. Keep the all-in-one CSV, but
track import outcomes and retry only explicitly failed Pins. For stronger
delivery verification, add official API publishing with direct image bytes.

## Findings, highest priority first

### P1: Final export does not enforce finished-image identity

`electron/main.js:8314` accepts rows and board names, but no expected asset
identity. Its final download checks dimensions and computes a hash; it does not
compare that hash with the finished Pin verified during preparation.

Reproduction executed against the actual handler in a VM with network and disk
mocked: provide an expected hash of 64 "a" characters, then serve a different
1000 x 1500 asset with hash 64 "b" characters. Export returns success and the
report records the changed hash. This is a real correctness gap, not evidence
that it caused the supplied 18-row failure.

Fix: pass stable Pin IDs and expected image identities to final export, resolve
the authoritative saved asset in the backend, match each row URL to that asset,
and compare the final downloaded image before allowing the CSV to be written.
Keep exact dimensions and the existing conservative recompression tolerance.
Fail closed for missing or mismatched identity across all export entry points.

### P1: No import-result reconciliation or failed-only recovery

`electron/main.js:8367` correctly says import status is unconfirmed. There is no
code that turns this into confirmed per-row outcomes. The React export function
at `src/components/PinCreatorView.jsx:1311` selects all saved Pins for a normal
export, and only records `exportedAt` afterwards. It cannot distinguish a
successful Pin from one rejected by Pinterest. Repeating a batch can duplicate
successes and retry the same failed inputs without learning anything.

Fix: persist an immutable batch manifest with batch ID, target account, stable
Pin ID, row number, media hash and URL, board, intended UTC time, CSV checksum,
and explicit outcome. Record user-supplied Pinterest import feedback against
that exact batch. Require manual resolution for ambiguous title/board matches;
do not infer success merely because a row is absent from an error table.

### P2: Image compatibility checks are incomplete

`electron/main.js:7694` permits any image MIME type and downloads up to 25 MiB.
It checks dimensions but does not compare decoded format with the MIME type and
file suffix. A controlled probe serving WebP at a .jpg URL passed validation.
WebP itself is supported by Pinterest's general Pin specs, so that probe is NOT
proof Pinterest rejects the format. It proves the app cannot currently attest
that the declared JPEG really is JPEG. The general web upload limit is 20 MB.

Fix: standardize finished CSV images to actual JPEG or PNG, validate decoded
format and MIME consistently, and enforce a conservative 20,000,000-byte cap.
Use those rules for CSV exports without imposing image limits on videos.

### P2: File writing is not atomic

`electron/main.js:8358` writes directly to the final CSV filename, then reads it
back. Disk-full, interruption, or a failed later chunk can leave incomplete or
partially generated outputs with normal .csv names. This is not the cause of
the supplied file, which parsed successfully.

Fix: stage files under temporary non-CSV names in the same destination folder,
validate their bytes, and rename completed files into place. Record exactly
which files were committed if a multi-file export fails. Preserve existing
exports until replacements are verified.

## CSV-only implementation

1. Apply the final identity, compatibility, size and atomic-write fixes above.
2. Keep one CSV for batches of up to 200 Pins. Preserve selected boards, Unicode,
   valid UTC dates, and intentionally blank schedules. Do not impose an invented
   five-Pin limit or silently clear dates to force immediate publication.
3. Persist batch/account manifests and expose Pending confirmation, Confirmed,
   Failed, and Needs review states separately from Exported.
4. Let the user attach/paste the Pinterest result and review its row mapping.
   Export Failed Only must exclude confirmed successes and leave unknowns alone.
5. Use explicit host recovery only for the selected failures. Compare the same
   image and metadata on a different host before blaming the original host.
6. Warn about schedules that are close to expiry, but never claim a delay buffer
   guarantees importer completion. Revalidate dates when creating a retry file.

This prevents silent accounting loss and blind full-batch retries. It cannot
make Pinterest's external CSV processor accept every request.

## Stronger delivery path: official Pinterest API

Pinterest's current official OpenAPI schema supports image_base64, allowing the
finished image bytes to be sent without ImgBB or WordPress fetching. Create Pin
returns a Pin object on success, and Get Pin permits follow-up verification.
Use these as the primary delivery path while retaining CSV as an optional export.

Use OAuth and explicit target-account/board IDs. Persist a job before sending,
then persist the returned Pin ID before marking it confirmed. Key jobs by account,
board, source Pin and asset revision to prevent concurrent duplicate submissions.
On ambiguous timeouts, reconcile or request review instead of blindly repeating
a POST. Retry only classified retryable failures with bounded backoff and respect
rate limits. Authentication and policy failures need attention, not retry loops.

The existing Pinterest API code (`electron/main.js:3764`) is analytics-only.
Publishing needs a proper OAuth connection and approved Standard access; Trial
Pins are only visible to their creator. An always-on scheduling worker is needed
for reliable unattended publishing when the desktop app is closed. Do not claim
the CSV Publish date field is accepted by the Create Pin API.

## Acceptance criteria

- Every row has an explicit outcome; unknown never means successful.
- Same-size wrong images, missing identity and incompatible payloads are rejected.
- App restart, interrupted writes, disk failures and transient host failures are
  covered by tests; saved Pins are not deleted on export or recovery failure.
- A controlled partial-result fixture retries only the failed rows.
- Lost POST responses do not trigger blind duplicate publication.
- Two Pinterest accounts cannot share a job's credentials, board or confirmation.
- Verify a real one-Pin import and then a user-authorized batch before claiming
  the workflow works end to end. Sandbox success alone is not public production
  visibility. No such publication was performed in this audit.

## Verification and sources

Existing regression baseline: 189 tests passed. The two additional in-memory
probes above exposed gaps outside that baseline; they made no network requests
or file writes. No new installer was built for this audit.

- [Bulk CSV requirements](https://help.pinterest.com/en/business/article/bulk-upload-video-pins)
- [General Pin specifications](https://help.pinterest.com/en/article/review-pin-specs)
- [Official API schema](https://github.com/pinterest/api-description/blob/main/v5/openapi.yaml)
- [Image proxy access](https://developer.pinterest.com/docs/reference/image-proxy-requests-to-your-website/)
- [API access tiers](https://developer.pinterest.com/docs/key-concepts/access-tiers/)
- [API rate limits](https://developer.pinterest.com/docs/reference/rate-limits/)
