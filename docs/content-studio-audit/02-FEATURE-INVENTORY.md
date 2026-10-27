# 02 — Feature Inventory

Source: read-only code audit of all screens, `electron/preload.js` (133 invoke channels) and the main-process handlers. Status: H healthy, NI needs improvement, I incomplete, U unverified (not exercised with live services).

**IPC contract:** all 133 preload channels have handlers; no orphan handlers. Six feature flags (`contentCalendar`, `campaignRecords`, `contentUpdateQueue`, `revenueAttribution`, `runHistory`, `modelRegistry`) default on; settings migration v4 forces them on even after a user opt-out (`electron/settings-migrations.js:82-92`) although Settings labels them "Opt-in".

| Feature | Screen | Key files | External deps | Status | Main issues (file:line) |
|---|---|---|---|---|---|
| Trends / keyword research | trends | TrendsResearch.jsx, main.js research-keywords | Google Trends RSS, Replicate | H/U | Keyword JSON may truncate at 3,800 tokens (main.js research-keywords) |
| Cluster planner | cluster-planner | ClusterPlanner.jsx, pinterest-clusters.js | Replicate, page fetch | NI | Initial load errors swallowed (ClusterPlanner.jsx:46); scraped page JSON not delimited in prompt |
| Calendar, Campaigns, Content Updates, Attribution, Run History | flagged | GrowthWorkspace.jsx, growth-workspace.js | CSV only | NI → fixed partly | Revenue re-import duplicated totals (**fixed**); CSV import errors unhandled (**fixed**) |
| Model registry | flagged | modelRegistry.mjs | none | U | Static list, last verified 2026-07-28 |
| Articles: queue, generate, edit, publish | articles | AddToQueue, Queue, ArticlesList, ArticleEditor, main.js generate-article / push-to-wordpress | Replicate, WordPress, Impact, Amazon | NI → fixed partly | Bulk publish skipped quality gate (**fixed**); unknown status published (**fixed**); see 04 |
| Content Pipeline (Review Desk, Archive, Prompt Lab, Experiments, Costs, Packs) | content-pipeline | ContentOperations.jsx, recipe-evidence.js, wordpress-archive.js | WordPress REST | H | Fixed earlier this session: interrupted jobs, diagnostics ordering |
| Image Library | image-library | ImageLibrary.jsx | none | H | Does not show Meta 4:5 assets; cleanup confirm stays armed |
| Video Studio | video-studio | VideoStudio.jsx, main.js generate-video | Replicate | NI → fixed partly | Paid video lost on download failure (**fixed**); aspect ratios not validated per model; cost label ignores duration/resolution |
| Pin Creator + CSV | pin-creator | PinCreatorView.jsx, pinterest-export*.js | Replicate, ImgBB, WordPress media | NI | Save failures swallowed (PinCreatorView.jsx:648,662); overlay can overflow horizontally (pinterest-overlay.js:152-242) |
| Pinterest Workspace (API) | pin-publishing | pin-workspace*.js, pinterest-api.js | Pinterest API v5 (OAuth), Etsy | H | Board re-sync loop fixed earlier this session; background tick errors ignored |
| Meta Studio / GHL | meta-studio | MetaStudio.jsx, meta-auto-pack.js, meta-captions.js | GoHighLevel, Replicate | NI → fixed partly | GHL refresh erased receipts >200 (**fixed**); centre crop cuts Pin lettering (pending decision); FB/IG captions near-identical |
| Recipe Money Maker | recipe-money-maker | recipe-money-maker.js | DeepSeek API | NI | Separate store not in workspace backup (main.js:251); DeepSeek key not clearable |
| Performance | performance | PerformanceIntelligence.jsx, google-analytics.js | GSC, GA4, Pinterest analytics, GHL | U | Needs live credentials to verify |
| Connections | connections | Connections.jsx | all providers | H | No test button for ImgBB / Search Console |
| Job Center | jobs | JobCenter.jsx, job-center.js | none | NI | Several job types route to Diagnostics |
| Quality Studio | quality-studio | QualityStudio.jsx, quality-workspace.js | Replicate metadata, GA4 | H | — |
| Settings / Diagnostics / Updates | settings, diagnostics | Settings.jsx, Diagnostics.jsx, app-updater.js | update feed | I | Updates can be checked but not downloaded/installed from the UI; stuck-busy on check error (**fixed**) |

## Dead code

- `src/components/RepurposeStudio.jsx` (never imported) and `src/lib/utm.js` (used only by it).
- `electron/pin-creator/` legacy renderer (not loaded, not packaged; calls a missing `cancelAllJobs`).
- Preload methods never called: `downloadAppUpdate`, `installAppUpdate`, `discoverImpactAffiliates`, `createPinterestPin`, `getPinCreatorUrl` (stub), `openSettings`/`closeSettings`, `saveZipFile`.

Removal is proposed in the roadmap, not done (it changes the public preload surface).
