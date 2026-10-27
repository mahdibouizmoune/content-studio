# 06 — Social Media Audit (Meta via GoHighLevel)

Platforms present: Facebook and Instagram (scheduled through GoHighLevel), plus legacy repurpose formats (Reddit etc.) in the unused `RepurposeStudio.jsx`. No TikTok, YouTube or X publishing exists.

## Fixed

- **GHL status refresh erased receipts.** It kept only the newest 200 of up to 1,000 receipts and overwrote receipts saved concurrently, deleting idempotency keys that block duplicate posts. Now results are merged into the latest store by id (`electron/main.js` refresh-ghl-publishing-status).

## Healthy

- Meta packs use finished Pins only, force `includeSourceLink:false`, strip URLs, and the caption prompt bans links and engagement bait (main.js ~6988, 7053; meta-captions.js).
- Upload intent recorded before posting; unknown outcomes blocked from retry; single upload at a time.

## Open findings — need your decision

| Severity | Finding | Evidence | Options |
|---|---|---|---|
| Fixed | 4:5 crop was `fit:'cover', position:'centre'`, removing 285 px top and bottom of a 1080x1920 Pin (headline and "GET THE RECIPE" button cut) | was main.js ~4508 | **Done (your choice A):** whole Pin fitted over a blurred, dimmed copy (`electron/meta-portrait.js`); asset fingerprint bumped to `contain-blur:v3` so old cropped assets are rebuilt |
| Med | Pin Creator's GHL export/upload calls default to `includeSourceLink = true`, and the repurpose prompt/fallback ask for a "link CTA" | main.js 7473, 7513, 2484, 7337 | Confirm whether Pin Creator GHL rows target Pinterest (links needed) or Facebook (links unwanted) |
| Med | Dedupe key hashes caption + image URL + schedule, so a re-upload after re-scheduling or re-hosting creates a second post | main.js 3040-3047, 2553 | Add a logical key (article + platform + location) with a warning |
| Med | Facebook and Instagram captions are nearly identical in the bulk path, with the same three hashtags for every post; the platform-distinct quality check is not applied there | meta-auto-pack.js:60-92; main.js 7139 | Run `metaQuality` in the bulk path; platform-specific templates |
| Med | Engagement-bait patterns miss "Comment RECIPE below", "DM us", "Drop a ❤️"; Instagram has no bait check | src/lib/metaQuality.mjs:1-8 | Extend patterns; apply to all caption fields |
| Low | Link stripping misses bare domains ("myblog.com/pasta") | meta-captions.js:9 | Strip `www.`/domain patterns |
| Low | Hashtags drop accents ("crème brûlée" → `#crmebrle`) | meta-auto-pack.js:44, 54 | Normalise with NFD and strip combining marks |
| Med | With only `ghlInstagramAccountIds` set, Facebook rows fall back to all `accountIds` | main.js 7551-7575 | Require an explicit Facebook account list |

Instagram limits to enforce (01-RESEARCH): caption 2,200 chars, 30 hashtags, 20 mentions, image aspect 4:5–1.91:1.
