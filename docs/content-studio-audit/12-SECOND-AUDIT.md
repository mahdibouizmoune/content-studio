# 12 — Second audit (2026-10-28)

A follow-up audit of version 1.6.3 after the 360° roadmap. Electron security (context isolation, sandbox, CSP, IPC sender checks, navigation and permission guards), production dependencies (0 advisories) and error handling (the 22 empty `catch` blocks are deliberate fallbacks) were found sound.

## Implemented

| # | Change | Files |
|---|---|---|
| 1 | Settings are saved as a patch of the keys a screen changed, so a screen holding an older copy can no longer undo a newer background change (Search Console sites, affiliate sync). | `src/lib/settingsPatch.mjs`, `src/App.jsx`, browser mock in `src/lib/electron.js` |
| 2 | Backups keep the 6 newest, one per day for 7 days and one per week for 4 weeks (was the newest 12, about an hour of active work). An optional second backup folder (OneDrive, USB) gets a copy of each backup with the same retention; only the folder picker can set it. | `electron/backup-retention.js`, `electron/workspace-backup-worker.js`, `electron/main.js`, `Settings.jsx` |
| 4 | The affiliate library and each site's synced post list moved from `config.json` into `workspace.sqlite` (`settingsLists`). All code still reads one combined settings object; older backups that hold the lists inside settings restore correctly. On a copy of the real profile the settings part of `config.json` went from 674 KB to 28 KB with all 195 links and 500 posts intact. | `electron/workspace-store.js` |
| 5 | Dev-only advisories fixed without major upgrades: vite 7.3.7, undici 6.29.1, body-parser 1.20.9 (lockfile only). | `package-lock.json` |
| 6 | Tests added for the smart content engine, cluster planner and app updater. | `tests/audit-improvements.test.js` |
| 7 | Video Studio's model table and its three IPC handlers moved out of `main.js` into a module (first step of splitting the 10,000-line file). | `electron/video-ipc.js` |
| 8 | Sidebar groups can be hidden and the choice is remembered; searching, the icon-only bar and the group holding the current screen always stay open. Screens were not merged: that changes workflows and needs your decision. | `src/components/Sidebar.jsx` |
| 9 | Article export/import, revenue and title CSV imports, and WordPress and ImgBB image uploads no longer block the app while reading or writing files. Startup repair and the shutdown backup stay synchronous on purpose. | `electron/main.js` |

Not done: **3, signing the installer** — needs a code-signing certificate added to the repository secrets as `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`; the Release workflow is ready.

Eleven of the new tests fail on the previous code and pass now; the six coverage tests describe behaviour that did not change.

## Verification

lint pass · 467 tests pass · build pass · test:ui 6/6 · `test-workspace-design.cjs` desktop/tablet/mobile pass · screen sweep 22 screens + group toggle, 0 problems · `npm audit` 0 (all dependencies).

## Behaviour changes to be aware of

- Going back to version 1.6.2 or earlier after running this version would show no affiliate links or synced posts there, because those older versions look for them in the settings file. Restoring a backup made by this version into this version keeps them.
- The backup folder can hold up to 17 backups (about 20 MB each with current data) instead of 12.
