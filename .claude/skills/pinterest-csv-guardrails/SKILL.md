---
name: pinterest-csv-guardrails
description: Constraints and verified platform limits for Content Studio's Pinterest Pin creation, CSV export, scheduling, hosting and API publishing. Use before changing electron/pinterest-*.js, pin-*.js, pin-workspace*.js, PinCreatorView.jsx or PinPublishingWorkspace.jsx, or when asked about Pin sizes, CSV rules, schedules or rate limits.
---

# Pinterest guardrails

## User requirements (do not change without an explicit request)

- Default style `custom-july-original-ai` (Ingredient Closeup) and its layout/prompt.
- Final Pins are 9:16, 1080 x 1920. The 2:3 copy and feed preview are optional extras.
- CSV default interval is 90 minutes and editable; explicitly chosen row dates and the first/last UTC preview are honoured. Never spread a short batch over extra days or rebase chosen dates.
- Single-file CSV route with row-level validation and rejected-row reporting. Media URLs must be verified finished Pins; never substitute a raw article photo. Missing import receipts are UNKNOWN, not success.
- WordPress at the destination site is the primary durable host. Replicate URLs expire.
- CSV needs no developer account or OAuth; do not add one.
- Timezones go through `electron/timezone-data.js`; never bypass a failing guard.

## Verified platform facts (checked 2026-10-27)

| Fact | Source |
|---|---|
| Standard Pin: 2:3 (1000x1500) recommended; "larger aspect ratios may get cut off"; title 100 chars (first ~40 shown); description 800 chars | https://business.pinterest.com/creative-best-practices/ |
| Bulk upload: business account, up to 200 images/videos per batch, desktop only; no alt-text column | Pinterest Create bulk page; Pinterest staff on community.pinterest.biz |
| API rate limits: Trial 1,000 req/day/app, `org_write` 300/day; Standard `org_write` 100/min/user, `trends_read` 60/min; watch `x-ratelimit-*` headers | https://developers.pinterest.com/docs/reference/rate-limits/ |
| Trends: `GET /v5/trends/keywords/{region}/top/{trend_type}`, max 50 results, `time_series` normalised 0-100 (relative, not volume), today only | https://developers.pinterest.com/docs/analytics-and-reports/trends/ |

Unverified: the CSV 500-character description limit and any "14 days ahead" publish-date window come from vendors, not Pinterest.

## Procedure

Add a failing test in `tests/pin-workspace-upgrade.test.js` or `tests/pinterest-*.test.js`, fix, then run the `content-studio-verify` skill.

## Example

"Can we post 24 Pins a day?" → compare against the account schedule policy (`configFor` in `electron/pin-scheduler.js`) and the rate limits above; do not claim an optimal volume without the user's own analytics.
