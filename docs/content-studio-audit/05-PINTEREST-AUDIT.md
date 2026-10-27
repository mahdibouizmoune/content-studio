# 05 — Pinterest Audit

## Fixed this session

- **Board re-sync loop** (`electron/pin-workspace.js`): a restored API account with no boards re-downloaded every board and section every 30 seconds and never surfaced an error. Now one sync per session, then a visible job error. Disconnect clears sync state; board sync no longer stores boards for an account disconnected mid-sync. Test: `tests/pin-workspace-upgrade.test.js` ("restored API accounts sync boards once per session").
- **OAuth link** routed through the safe external-URL check.
- **Timezone:** Electron 43.8.3 ships tzdata 2026d, so `Africa/Casablanca` scheduling passes the Morocco guard (it was blocked on 43.7.7 / 2025c).

## Healthy (verified in code and tests)

- CSV: 90-minute editable default, chosen dates preserved, UTF-8 fields, row-level rejection report, verified finished-Pin media identity (sha256 + perceptual hash) re-checked before commit, duplicate-export protection, unknown import receipts stay unknown (`pinterest-export-service.js`). UI fixture test passes.
- API publishing: approval-fingerprint gate, publication key duplicate check, account daily limit/interval/windows re-checked at execution, ambiguous responses go to reconciliation, 429/5xx back off up to 6 attempts (`pin-workspace.js` tick).
- Pinterest page scraping disabled in favour of original recipe URLs (`source-policy.js`).

## Open findings

| Severity | Finding | Evidence | Recommendation |
|---|---|---|---|
| Med | Overlay text can run past the right edge: font floor 58 px, lines beyond 3 merged, QA checks only vertical safe zone | pinterest-overlay.js:152-154, 217-242, 470-479 | Shrink-to-fit or re-wrap; add horizontal bounds to QA |
| Med | No missing-glyph handling for display fonts (accents/emoji → tofu boxes) | pinterest-overlay.js:94-163 | Check `charToGlyphIndex`, fall back to Montserrat |
| Med | Pin title/description prompt tells the model to use nutrition/benefits from an article it only sees 700 chars of; built-in styles get only the URL | main.js 4705-4767, 1032-1053 | Always pass the article context block; drop nutrition |
| Low | Prompt templates say "9:16" even when the UI requests 2:3/1:1 | main.js 987, 1016 | Insert the actual ratio |
| Low | Unknown image model ids silently priced as Ideogram | pinterestCost.mjs:15 | Add entries or reject unknown ids |
| Info | Pinterest recommends 2:3; app default 9:16 is a user requirement | business.pinterest.com | Compare outbound clicks of 9:16 vs optional 2:3 copies using the user's analytics before any change |

## Publishing volume

The brief mentions ~24 Pins/day. Pinterest publishes no optimal frequency (01-RESEARCH). Standard API access allows 100 `org_write` calls/min; Trial allows 300/day. The app enforces account-level daily limits, windows and intervals; no change is recommended without the user's own outbound-click data per day-volume bucket.
