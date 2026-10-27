# 08 — UX and Technical Audit

## Security (verified in code)

- Renderer: `contextIsolation`, `sandbox`, no node integration, `webviewTag:false`, devtools off when packaged, CSP with explicit image/connect allowlists, all permissions denied, navigation and window-open routed through `openExternalSafe` (https/mailto/loopback only).
- IPC: every handler goes through `secureIpcHandle`, which rejects non-main-frame or untrusted-origin senders.
- Files: managed-media paths resolved with `realpath` and checked against app roots; reveal/open limited to app storage.
- Network: SSRF guard (`media-security.js`) blocks private, loopback, link-local, CGNAT and multicast ranges, re-checked on redirects; Pinterest page extraction disabled.
- Secrets: OS `safeStorage`; job payload sanitiser drops token/secret/password/key fields.
- Spending: Replicate predictions pass a daily reservation ledger with replay blocking.
- Dependencies: production `npm audit` = 0 after this session's updates; Electron 43.8.3. Remaining dev-only advisories: vite (dev server launch-editor), undici, old body-parser.

### Open security/quality items

| Sev | Item | Evidence |
|---|---|---|
| Med | Legacy `electron/pin-creator/renderer.js` `escapeHtml` does not escape quotes in attributes — dead code (not loaded or packaged), so not exploitable today | renderer.js:1696 |
| Med | Recipe Money Maker store (recipes, settings, encrypted DeepSeek key) is excluded from workspace backup; DeepSeek key not clearable via `clear-stored-credential` | main.js:251, 3776 |
| Low | `rmm-test-connection` network errors reject instead of returning `{success:false}` | recipe-money-maker.js:170 |
| Low | Background Pinterest tick/alert errors are swallowed (`catch(() => {})`) — no log | pin-workspace-ipc.js:520 |

## UX

Screen sweep on an empty profile (all 22 screens and their tabs, Electron 43.8.3): **0 console errors, 0 page errors**. UI fixture tests (6 scripts, desktop + mobile layouts) pass.

| Sev | Finding | Evidence |
|---|---|---|
| Med | Update can be found but never downloaded or installed from the UI (no buttons wired) | Diagnostics.jsx:144; app-updater.js:23 |
| Fixed | Update check error left buttons disabled | Diagnostics.jsx |
| Fixed | Revenue CSV import errors silent; re-import double-counted | GrowthWorkspace.jsx, growth-workspace.js |
| Med | Pin save failures swallowed — edits can be lost silently | PinCreatorView.jsx:648, 662 |
| Med | Meta Studio and Cluster Planner show an empty workspace when the initial load fails | MetaStudio.jsx:252-266; ClusterPlanner.jsx:46 |
| Low | Job Center routes several job types to Diagnostics instead of their screen | job-center.js:21-27 |
| Low | Feature flags labelled "Opt-in" but forced on by migration v4 | settings-migrations.js:82-92 |
| Low | Video Studio offers aspect ratios the model registry does not list; cost label ignores duration/resolution; second paid job can start while a download is still running | VideoStudio.jsx:119-211 |

Accessibility was not measured with an automated tool in this session.
