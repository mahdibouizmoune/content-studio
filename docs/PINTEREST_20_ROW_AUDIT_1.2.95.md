# Pinterest partial import investigation and hosting mitigation

September 15, 2026. Input: pinterest-bulk-upload-20260914-220832.csv.

## Verified observations

- The file contains 20 records, the eight expected headers, no UTF-8 BOM,
  20 distinct Media URLs and 20 distinct destination paths.
- Titles and descriptions are within the documented 100/500-character limits.
- All thumbnails are blank, as required for images.
- The export was generated September 14 at 22:08 UTC. Scheduled times run from
  September 15 at 06:00 UTC through September 16 at 20:00 UTC, every two hours.
  None exceeded the future scheduling window at export time.
- Nineteen images are on i.ibb.co; one is on gourmetgather.com.
- Live checks retrieved all 20 images as 1000 x 1500 sRGB JPEGs. Successful
  responses matched the export-time SHA-256 identities. They were roughly
  188-344 KB, not oversized images or substituted article thumbnails.
- Row 6 (Pickled Gallo) timed out after 20 seconds on the first GET; a second
  request using Pinterest-style headers succeeded in approximately 14.7 seconds.
  Other image GETs succeeded. This demonstrates intermittent access from this
  computer, not proof of Pinterest's exact failure reason or its network access.
- All 20 destination URLs returned HTTP 200 to HEAD requests.
- The site's robots.txt does not disallow Pinterestbot. Header simulation does
  not reproduce Pinterest's source IPs, reputation checks, or internal importer.

The supplied sidecar records account label Home Cooking, 20 locally valid rows,
and unconfirmed Pinterest acceptance. No row-level import receipt was supplied
for this batch. Therefore the nine missing rows and their exact remote rejection
reasons remain unverified. The Scheduled count alone excludes already-published
Pins and is not an import receipt.

## Application change

Previously Automatic retained an ImgBB URL whenever one local request passed,
even with a matching WordPress connection available. Manual WordPress recovery
was required to get off the third-party host.

Version 1.2.95 makes automatic CSV preparation prefer the matching destination
WordPress site. It rehosts the saved finished Pin, not the article featured image,
and retains the dimension and image-identity checks. WordPress preparations are
serialized to limit concurrent uploads. Existing verified WordPress copies are
reused. If selected WordPress hosting fails, the app does not silently return to
ImgBB. Without a matching configured site, the existing verified-host path stays
available. Image generation styles and Meta behavior are unchanged.

The optional account label, complete 20-row CSV, original scheduling choices,
and failed-only duplicate protection are preserved. No ten-Pin CSV cap is added.
No live Pins were published, no existing delivery outcomes were guessed, and the
user's original CSV was not modified or re-uploaded.

## Evidence and limits

- [Pinterest bulk CSV requirements](https://help.pinterest.com/en/business/article/bulk-upload-video-pins)
  specify up to 200 images/videos, a public direct media link, exact headers,
  image thumbnails blank, and supported UTC dates.
- [Pinterestbot documentation](https://help.pinterest.com/en/business/article/pinterestbot)
  explains that requests use Pinterest networks and respect robots.txt.
- [Native scheduling documentation](https://help.pinterest.com/en/business/article/schedule-pins)
  describes the manual scheduler's limits. It does not establish a ten-row CSV
  limit, and must not be used to drop or split this user's 20-row exports.

The hosting change reduces an observed failure path. It cannot guarantee external
CSV acceptance. Reconcile accepted/published/scheduled Pins before retrying only
the missing rows; never re-upload all 20 just because the Scheduled count is 11.

## Verification

All 235 regression tests passed, including five new automatic-hosting tests.
ESLint, production renderer compilation, and git diff --check passed. The network
audit used public read-only requests only; no Pinterest import was performed.
