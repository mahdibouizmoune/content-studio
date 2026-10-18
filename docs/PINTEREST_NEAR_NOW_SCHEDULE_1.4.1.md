# Pinterest CSV Scheduling Fix (1.4.1)

## Confirmed Cause

The local file `pinterest-bulk-upload-20261017-135143.csv` contains 24 rows starting on October 21, despite being exported on October 17. Earlier files form a continuous queue into that date. Automatic preparation appended every new batch after the latest downloaded CSV, even when the files were not assigned to a specific Pinterest account. The editor also seeded its start control from a saved row and enforced an unrelated six-hour lead.

## Changes

- Automatic batches start at the nearest available minute at least 10 minutes after preparation completes, not after the last export. Selected intervals are preserved.
- Unassigned downloads do not reserve a fictional shared account queue. Explicit account profiles still honor their real reservations, daily limits, windows and minimum spacing; genuine conflicts can delay the nearest available slot.
- The default start control follows the current time until edited. Existing row dates no longer initialize it. Deliberate starts and row dates remain unchanged.
- Newly generated automatic dates are marked so stale, unexported automatic plans can be refreshed safely. Older unmarked dates are treated as deliberate rather than silently moved.
- **Start From Now** explicitly resets local row dates to the current start and chosen interval. The editor displays the first and last UTC timestamps.
- Local row date controls are converted to explicit UTC before backend planning. CSV timestamps remain Pinterest's `yyyy-mm-ddThh:mm:ss` UTC format.
- Scheduling happens after image hosting, so lengthy preparation does not consume the upload buffer.
- Already exported dates and immediate-publishing rows are preserved by automatic checks. Duplicate-publication protection and delivery receipts are unchanged.

This does not modify files already downloaded or Pins already scheduled on Pinterest. Do not upload a second copy of an imported file to change its dates; edit/cancel the scheduled Pins on Pinterest first. A CSV download is not confirmation that Pinterest accepted it.

Pinterest documents future timestamps and explicit UTC times for scheduling: [bulk upload guide](https://help.pinterest.com/en/business/article/bulk-upload-video-pins). The ten-minute lead is this application's upload buffer, not a claimed Pinterest requirement.

## Verification

- `node --test tests/pinterest-near-now-schedule.test.js`: default start, four-day regression, automatic/manual/exported distinctions, exact intervals, known-account reservations, slow hosting, unassigned history, schedule merge and renderer fallback.
- `node scripts/test-pinterest-schedule-ui.cjs`: real Pin Creator in New York and Auckland timezones, manual start, Start From Now, preflight round-trip, UTC export and responsive layout. Provider calls use isolated test fixtures.
- Full repository lint, all 348 regression tests and the production renderer build passed. The desktop/mobile editor checks passed in both test timezones. Final packaged Electron startup and native approval/allowlist checks passed with an empty isolated profile. The 1.4.1 Windows installer built successfully as an unsigned local test build, not a signed public distribution release.
