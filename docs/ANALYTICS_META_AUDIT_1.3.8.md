# Content Studio 1.3.8: Analytics, Trends and Meta

## Changes

- Settings accepts a Google Analytics measurement ID, numeric GA4 property ID, and website origin. The measurement ID is stored for identification only: it neither installs tracking nor grants report access. Read-only reporting uses the existing Google Desktop OAuth connection, extended with analytics.readonly and PKCE. Enable Google Analytics Data API for that client, use an account with property access, and reconnect to grant the new scope.
- Trends and Clusters show matching saved articles ranked by engaged landing-page sessions, with total sessions, engagement rate, average session engagement, Pinterest-attributed sessions and comparable-period growth. These are session metrics, not exact time spent reading an individual article. Reports compare two nonoverlapping 28-day periods ending two days ago to avoid incomplete reporting days.
- Source-based cluster and trend prompts receive verified, relevant aggregate metrics. Small samples, weak baselines, old, sampled or thresholded reports are not treated as proven expansion evidence. The app does not invent conversions or shares. Only known saved article destinations are retained; visitor identifiers and credentials are not sent to the renderer.
- Refresh is manual, concurrent requests are coalesced, and cached reports are reused for planning. Changing property or website prevents cross-site reuse. No automatic paid report or generation calls were added.
- Local Trends fallback no longer imports unrelated keywords when the requested topic has no matching evidence, and labels inferred ideas honestly. AI expansion failure preserves useful local plans without buying replacement generations.
- Trends and Clusters queue through authoritative duplicate/cannibalization intake rather than saving each row directly.
- Meta feed captions use a short measured-ingredient preview from the validated saved recipe card and, when available, a safe preparation tip. They clearly label this as a partial preview. Invalid cards do not produce invented ingredient quantities. Readers are invited to message for the full recipe; automatic message delivery is not implemented or promised.
- Article links and follow-up link comments are excluded from native Meta bulk/single CSVs, edited exports, restored batches, and direct GHL uploads. Source addresses remain internal for matching/hosting. Existing manual caption edits remain preserved.
- Existing Pinterest-only image selection and one shared 1080 x 1350 Meta crop are unchanged. Feed-only quality checks no longer require carousel/Reel plans.
- Settings includes official-documentation recommendations for Gemini Developer API free-tier text research, Search Console, and Analytics. Gemini is a suggestion, not a newly connected provider: existing Gemini-via-Replicate calls are still paid. Check current quotas, billing configuration and free-tier data-use terms before integrating it.

## Verification And Limits

App-wide static checks, automated regressions, production build, isolated desktop/mobile UI checks and packaged-app checks are used. No live website publishing, paid AI generation, Google login, or modification of the user's article collection is performed in these tests. Live Analytics access remains untested until the user provides a numeric property ID and completes authorized Google setup; a G- code alone is insufficient.

Shipping dependencies have zero known audit findings. The development toolchain still has 15 findings (5 high, 10 moderate), in previously identified build-tool dependency chains. Fix suggestions include major framework changes or downgrades; these are not applied blindly to the production update. This does not establish that the app has no possible defects or security issues. The Windows installer is explicitly unsigned because no signing certificate is configured.

## Official References

- https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart
- https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- https://developers.google.com/analytics/devguides/reporting/data/v1/quotas
- https://developers.google.com/webmaster-tools/pricing
- https://ai.google.dev/gemini-api/docs/pricing
- https://about.fb.com/news/2025/04/cracking-down-spammy-content-facebook/
