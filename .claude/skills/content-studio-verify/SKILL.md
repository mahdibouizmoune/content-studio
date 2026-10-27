---
name: content-studio-verify
description: Run Content Studio's full regression and release validation (lint, unit tests, build, UI fixtures, real-app screen sweep) against an isolated profile. Use before committing, after dependency changes, or when asked to verify, test or check the app still works.
---

# Content Studio verification

Run from the repository root. Never point any check at the real user profile.

## Steps

1. Isolate the profile for every command that can start the app:
   - PowerShell: `$env:CONTENT_STUDIO_USER_DATA_DIR = Join-Path $env:TEMP ('content-studio-claude-test-' + [guid]::NewGuid().ToString('N'))`
   - Bash: `export CONTENT_STUDIO_USER_DATA_DIR="$(cygpath -w "$TEMP")\\content-studio-claude-test-$RANDOM$RANDOM"`
2. `npm run lint` — expect exit 0, no output after the eslint banner.
3. `npm test` — expect `fail 0`. Read the `ℹ tests` count and compare with the last recorded count in `docs/content-studio-audit/PROGRESS.md`.
4. `npm run build` — expect `built in`.
5. `npm run test:ui` — six fixture scripts; each prints a `passed` line. A `Failed to load resource: 404` browser line is expected noise.
6. Real-app sweep (needs a fresh `npm run build`): `node .claude/skills/content-studio-verify/scripts/screen-sweep.cjs "<repo root>"`. It launches Electron on a throwaway profile, opens every sidebar screen and tab, and must end with `TOTAL_PROBLEMS 0`.
7. Dependencies: `npm audit --omit=dev --audit-level=moderate` must report 0 (CI enforces it).

## Rules

- Do not run `scripts/test-native-*.cjs` without reading their fixture preconditions first.
- Do not publish, upload, spend API credit or install updates during verification.
- If global npm fails writing `package-lock.json` (Windows -4094), use `node .codex-tools/package/bin/npm-cli.js`.
- Report counts exactly; a skipped step is reported as skipped.

## Example

"Verify the branch before I commit" → steps 1-7, then a table of check → result.
