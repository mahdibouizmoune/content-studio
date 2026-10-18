# Pinterest Workspace Upgrade (1.4.0)

## Delivery Checklist

| Group | Implemented | Verification | External dependency |
| --- | --- | --- | --- |
| Direct publishing | Multi-account OAuth, continuous refresh token rotation, disconnect/reconnect, live board/section IDs, image uploads, persistent jobs, backoff, reconciliation and artwork history | Contract tests for approval gates, retries, duplicate protection and restart recovery | Pinterest developer app, registered desktop redirect, approved Standard access and `pins:write` for public publishing |
| Shared scheduling | One Temporal-based planner for legacy CSV and direct/CSV workspace preparation, account timezone, windows, daily limit, interval, URL-balanced/random order, locks, exact timestamps, single/following edit, calendar and queue, cancel/reset | Account-wide limit, locked shuffle, overdue queue and DST tests | Desktop must remain running for local direct jobs; CSV scheduling happens at Pinterest after import |
| Artwork | Main-page extraction, relative/lazy URLs, exclusion keywords/selectors, dimensions/failures, upload/library selection, replacement, cover/contain, focal points, four ratios, original/AI provenance, reference variation | Extraction, cropping, metadata preservation and SVG safety tests | Page must be accessible without bypassing access controls; reference generation requires existing Replicate token and confirmed model input schema |
| Review / bulk editing | Persistent drafts/review/approved/scheduled/publishing/published/rejected/canceled/failed states, identity/time/version approval, material-change invalidation, explicit approve/reject, recover drafts, copy/URL/tracking/board/section/keyword/alt/disclosure edits, paid rewrite preview, undo | Approval and content-version tests; tracking preserved; undo never restores publishing approval | Rewrite/reference calls are explicitly initiated and billed by existing provider; no automated paid fallback |
| Research / audits | Live authorized Pinterest regional trends, MoM/YoY where returned, optional advertiser volume bands, featured-topic related searches, freshness/source records, keyword-to-draft handoff, saved alerts, preview/frequency/notifications/status, read-only profile audits | Unavailable-data, region-route, volume-band and concurrent-edit contract tests | Trends/metrics access may be restricted. Volume needs authorized ad account and `ads:read`; suggestions not provided by an authorized endpoint remain unavailable |
| Stores / catalogs / video / Canva / API | Shopify GraphQL, Etsy and WooCommerce authorized sync; product chooser/feed validation; live catalog/feed creation and item batches/status; existing Video Library import/upload/processing/cover; SVG field mapping/preview; scoped REST and official-SDK MCP | Store failures preserve inventory; feed rejection, video processing and REST/MCP access tests; desktop/mobile UI checks | Store tokens and read scopes, merchant catalog access and public feed hosting. Canva imports are one-way exports, not live sync |

No live Pins, catalogs, campaigns, store inventory or paid services were modified during development. Provider contract tests use isolated responses; they are not a substitute for credentialed live verification.

## Persistence And Upgrade

- Existing articles, images, generated videos, Pin Creator rows, CSV delivery receipts and settings are unchanged.
- `pinWorkspace` is a new SQLite workspace root using the existing migration and backup facade. Existing rows are never silently converted or deleted.
- **Import Pin Creator Artwork** copies artwork into the review workspace and records the original Pin ID. Original Pin Creator fields and workflow remain intact.
- Account/app/store secrets use the existing operating-system encryption. API tokens are stored as SHA-256 hashes and displayed once when created.
- Artwork is saved under the existing managed-image directory, so backups/reference-aware cleanup protect active Pins and history.
- Queue execution is disabled initially. Enabling it is explicit. Restarted in-flight jobs become `reconciling`, never automatically posted again.

## Pinterest Setup

1. Open **Pinterest Workspace > Accounts** and configure the numeric Pinterest app ID and app secret.
2. Register the exact desktop redirect, such as `http://127.0.0.1:8786/pinterest/callback`, with Pinterest. The listener binds only to the loopback interface, validates a one-use unpredictable state, expires after three minutes and closes after completion. Pinterest's authorization-code schema currently does not specify PKCE parameters; unsupported fields are not sent.
3. Connect each desired account. Basic read access and publishing/catalog access are separate choices. Optional advertiser keyword metrics request only `ads:read`, not ad campaign modification permissions.
4. Select Standard access only after Pinterest has approved it. Selecting the option does not grant approval. Trial-created Pins are creator-only, so public publishing is blocked in Trial mode.
5. Sync boards and sections, then assign the returned stable IDs to drafts. CSV-only profiles can use saved local board names without developer access; existing CSV export remains available.
   Use **Use For Existing CSV** to associate the legacy CSV editor with that account. This is a stable account profile selection, not a required free-text account label. Existing exported schedules and new workspace jobs then share account-wide reservations. Old unlabeled batches cannot reliably be attributed to multiple different accounts; they are conservatively assigned to the chosen legacy default until their import results are reconciled.
6. Review final artwork/copy/link/alt text/disclosure/account/board/section. Approve the current version, then schedule for direct publishing or CSV.

Sources: [Access tiers](https://developers.pinterest.com/docs/key-concepts/access-tiers/), [OAuth and refresh](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/), [Official API schema](https://github.com/pinterest/api-description/blob/main/v5/openapi.yaml).

## Scheduling And Recovery

- Local-time input is interpreted in the selected account's IANA timezone and stored as UTC. Missing or ambiguous DST times are rejected; supply an explicit offset through the API when necessary.
- Multiple windows must not cross midnight: split an overnight window into two. Locked times can be outside a window, but cannot bypass the minimum interval, daily limit, past-date or horizon checks.
- Daily limits include the account's existing scheduled drafts and publication history. The same draft appearing in both is counted once. Plans are computed before any writes; a conflict leaves the queue unchanged.
- Exact-date editing offers one Pin only or an explicit following-Pins option. Locked times are never silently shuffled.
- Recovered overdue jobs respect windows and limits instead of publishing the entire backlog at once.
- Network failures after `POST /pins` are ambiguous. The app blocks automatic retries and looks for a unique remote Pin with matching metadata/time and matching artwork. Unavailable or non-unique evidence leaves the job unresolved. Video ambiguities currently remain blocked when the API cannot verify the uploaded artwork; inspect Pinterest before any new manual publication.
- **This release has no hosted worker.** Closing the desktop app stops local scheduling and alerts. It is not advertised as always-on. REST/MCP are also local-only.

## Photos, References, Canva And Video

- Extraction is bounded to main content by default and inspects at most 30 candidates. JavaScript-only, private or blocked pages may yield no photos; failures are visible.
- Cover crops use explicit normalized focal coordinates; contain preserves the full image. CSV requires the finalized dimensions already used by the installed app, shown in any validation error; other presets remain usable for direct publishing. The current local app uses 1080 x 1920 (9:16). The last committed baseline retains 1000 x 1500 (2:3). The scoped PR does not change those pre-existing dimensions or image styles; choose the matching crop preset when preparing CSV artwork.
- Reference generation uses `black-forest-labs/flux-kontext-pro` through the existing managed Replicate prediction path. It fetches the current provider schema and requires `input_image` support before spending on a generation. A real image input is sent, never merely a text description pretending to be a reference. Subject preservation is a prompt constraint, not a guarantee; review output.
- Export Canva as SVG with embedded PNG/JPEG resources and available local fonts or outlined typography. Scripts, active HTML, external resources and entity declarations are rejected. Filters/clipping/font limits are disclosed. Dynamic text/image fields are mapped without claiming two-way Canva synchronization.
- Video selection includes existing Video Studio output. Supported desktop containers are MP4/MOV with a 200 MB application cap; Pinterest processing is the authority on codec/duration acceptance. `media_id` and processing status persist between retries. A Pin is not created until processing succeeds. A selected image can be attached as cover artwork; cover changes invalidate review.

## Store And Catalog Setup

- Shopify: authorized Admin API token with `read_products`, the store's `*.myshopify.com` origin; GraphQL API version `2026-10`.
- WooCommerce: HTTPS origin, read-only consumer key/secret and the store's actual currency. Keys are sent in a Basic authorization header, never query parameters.
- Etsy: app key/shared secret, numeric shop ID, authorized OAuth access token and optional refresh token. The current documented `x-api-key` includes `keystring:shared_secret`. This release accepts an externally authorized Etsy token and rotates it when a refresh token is supplied; it does not fake a desktop Etsy OAuth callback (Etsy requires an approved HTTPS redirect).
- Failed synchronization preserves existing products and reports a credential-free error. Large catalogs are capped at 2,000 products per sync and explicitly marked sampled.
- Select products to export a CSV feed. Missing URL/photo/price/currency/availability are rejected with reasons. Host a feed publicly before providing its URL to Pinterest.
- Catalog/feed creation and item UPSERT require an explicit confirmation and merchant permissions. Processing and rejected-item responses are distinct from acceptance; a submitted batch is not reported as all items successfully published.
- Existing Amazon support is untouched.

Sources: [Shopify products](https://shopify.dev/docs/api/admin-graphql/latest/queries/products), [Etsy authentication](https://developers.etsy.com/documentation/essentials/authentication/), [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/), [Pinterest shopping guidance](https://developer.pinterest.com/docs/work-with-catalogs/shopping-best-practices/).

## REST And MCP

Start the server explicitly in **Pinterest Workspace > API**, default port 8787. It binds only to `127.0.0.1`, refuses browser Origin headers/unexpected Host headers and limits request size/concurrency. Do not expose it to the public internet or add an unauthenticated reverse proxy.

Create a read-only or read/write token scoped to explicitly selected account IDs. Requests require `Authorization: Bearer TOKEN`. Revoke tokens in the same view. Connections, raw credentials, arbitrary provider requests and the worker enable switch are not exposed as external tools.

- `GET /v1/workspace`: scoped sources, assets, accounts/boards/sections, drafts, jobs, history, research and audits.
- `POST /v1/actions/{operation}`: shared services with structured results and errors.
- `POST /mcp`: stateless Streamable HTTP using the official MCP SDK, same authorization and services.

Operations: `writeDraft`, `review`, `bulkEdit`, `undo`, `schedule`, `clearTimes`, `unlockTimes`, `reconcile`, `research`, `audit`, `addSource`, `extractPhotos`, `importAsset`, `replaceArtwork`, `rewriteCopy`.

Example schedule payload:

```json
{"accountId":"pinterest:username","ids":["DRAFT_ID"],"channel":"direct","mode":"smart","config":{"timezone":"America/New_York","dailyLimit":5,"intervalMinutes":120,"windows":[{"start":"09:00","end":"21:00"}]}}
```

Example review payload:

```json
{"ids":["DRAFT_ID"],"action":"approve","expectedVersions":{"DRAFT_ID":2}}
```

External asset imports accept a public HTTPS `url` or bounded `dataBase64`/`filename`, not arbitrary filesystem paths. API approvals record the token's client label; desktop approvals record the local owner. API access cannot bypass approval, account scope, locks or scheduling limits. Progress is read from persistent job records through the scoped snapshot. Rewrite operations return a preview only; applying changed copy requires new review.

## Validation / Remaining Limits

- Verified on 2026-10-12: lint, 341 regression tests and production build on the current local app; lint, 265 tests and build on the isolated committed-baseline PR tree; all seven views on desktop/mobile; packaged Electron startup and native approval/artwork/allowlist gates using an empty test profile. No real accounts or provider publications were used.
- The PR targets a separate baseline branch at commit `b6c0761`, not an unrelated open PR or a reset of the current app. Earlier uncommitted article/analytics/image-style upgrades remain untouched locally and outside the scoped PR. The local unsigned test installer includes those existing local upgrades plus this workspace; it is not a signed public distribution release.
- Production dependency audit reports zero known advisories. The isolated baseline still has 16 development-tool advisories (10 moderate, 6 high); resolving these requires separately evaluating framework/build-tool upgrades. This is not a claim that all possible application bugs or vulnerabilities are eliminated.
- Run `npm run check` for lint, the full regression suite and production renderer build.
- New contracts: `node --test tests/pin-workspace-upgrade.test.js`.
- Desktop/mobile UI: `node scripts/test-pin-workspace-ui.cjs` with Playwright available (optional `PLAYWRIGHT_MODULE_PATH`/`PLAYWRIGHT_CHANNEL`). Fixtures are isolated test data, never shown as live research.
- Native bridge: `node scripts/test-native-pin-workspace.mjs http://127.0.0.1:PORT` against a fresh isolated Electron profile.
- Real OAuth, public publication, merchant acceptance, store permissions and paid reference fidelity are not live-verified without account credentials/provider approvals. No private scraping or unsupported endpoints are used as a workaround.
- Search suggestions unsupported by the authorized API remain unavailable. Regional trend indices and advertiser volume bands are never substituted with AI or Google Trends guesses.
- Existing development-tool dependency warnings are not automatically repaired with unrelated major version upgrades. Production dependencies are audited separately.
