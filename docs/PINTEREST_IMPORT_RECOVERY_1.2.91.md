# Pinterest import recovery: September 14, 2026

## Confirmed evidence

- User-supplied CSV: pinterest-bulk-upload-20260914-013752.csv.
- Pinterest's email identifies all 18 titles and boards, with zero successful
  rows and the generic error "Upload didn't work" for every row.
- The CSV contains 18 data records, exactly eight columns, valid UTF-8 without
  a BOM, and consistent CRLF line endings. It passes the production round-trip
  parser. Longest title: 89 characters; longest description: 405 characters.
- All 18 media URLs are unique ImgBB links. During diagnosis all returned HTTP
  200 and real JPEG images at 1000 x 1500. All 18 destination pages also returned
  HTTP 200. These were requests from the user's computer using Pinterest's
  documented image-proxy and crawler User-Agent strings, not Pinterest servers.
- All 18 dates were valid future UTC timestamps during export and diagnosis:
  September 14 at 11:00 through September 15 at 21:00, at two-hour intervals.
- GourmetGather's public robots rules did not disallow Pinterest. The ImgBB
  robots request failed with a socket error; that alone proves no crawler block.

The exact Pinterest-side cause is NOT confirmed. The email proves the rows
were read, but does not distinguish media fetch failure, account restrictions,
or a Pinterest processing error. Its "Video Pins" wording is not evidence that
the app exported videos: all 18 Media URLs were verified as JPEGs.

## Recovery changes

- Added CSV image hosting: Automatic or WordPress Media Library (recovery).
- Recovery bypasses saved third-party URLs that pass local checks, uploads the
  finished Pin to the matching configured WordPress site, and requires both
  exact 1000 x 1500 dimensions and a fingerprint match to the finished image.
- WordPress recovery fails explicitly if hosting fails; it never silently
  falls back to the same ImgBB URL. Uploads are serial to reduce WordPress load.
- Automatic preparation keeps the current verified media URL first instead of
  prioritizing historical ImgBB URLs over a recovered WordPress URL.
- Remote recovery now requires saved image identity. Without a local finished
  image or matching fingerprint, the app does not adopt an arbitrary image.
- Validation reports now retain row-level media checks and explicitly mark
  Pinterest import status as unconfirmed, with accepted-row count unknown.
- Titles, boards, descriptions, keywords, dates, image designs and Meta/GHL
  behavior are unchanged. Full export remains one CSV for batches up to 200.

## Next verification

Select WordPress recovery, then Export Test CSV (First Pin). Upload that file
to the same Pinterest account and inspect the confirmation email. This changes
the media host without changing the Pin design, metadata or intended schedule.
If the test succeeds, export the remaining batch via the same host, taking care
not to upload the successful test Pin again. If it fails, use the report and
Pinterest's email with Pinterest support; do not assert the host was the cause.

No images were rehosted and no Pins were published during this code change.
Recovery uploads occur only when the user invokes export or Auto Fix in the app.

## Sources

- https://help.pinterest.com/en/business/article/bulk-upload-video-pins
- https://developer.pinterest.com/docs/reference/image-proxy-requests-to-your-website/
- https://help.pinterest.com/en/article/rate-limit-blocks
