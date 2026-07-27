# Content Studio Safe Upgrade Baseline

## Safety Snapshot

- Starting branch: `main`
- Starting commit: `cfde18e4f11c83cc57106ab7cec70362fc59a1fa`
- Backup branch: `backup/pre-codex-content-studio`
- Working branch: `codex/content-studio-safe-upgrade`
- Starting worktree: clean
- Release publishing: disabled for this upgrade

## Baseline Verification

Run before runtime changes:

- `npm install`: passed, dependencies already up to date
- `npm test`: passed, 54 tests
- `npm run build`: passed, Vite production build completed

The package audit reported 25 pre-existing dependency advisories: 1 moderate and
24 high. No automatic audit fix was applied because it could introduce major or
unrelated dependency changes. These advisories are baseline findings, not
regressions introduced by this branch.

## Architecture Snapshot

- React renderer with lazy-loaded feature screens
- One Electron main process that owns generation, publishing, persistence, and
  external service integrations
- One allowlisted preload bridge shared by the renderer views
- Electron Store settings with Electron `safeStorage` encryption for secrets
- File-backed article storage and local media recovery
- Atomic workspace backup writes with retained backup history
- Checkpoint-based article generation recovery
- Replicate, WordPress, Pinterest, GoHighLevel, Impact, and Amazon integrations
- Node's built-in test runner

## Security Baseline

The existing desktop windows use:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- Content Security Policy restrictions
- Preload IPC allowlists
- Remote media and redirect validation
- Encrypted credential storage

Phase 1 must not weaken these controls or expose new privileged APIs to renderer
code without explicit validation.

## Confirmed Phase 1 Risks

1. Global article length can override a selected project preset.
2. New queue records force outline approval off and label empty articles as
   generated drafts.
3. Generation steps sometimes receive global settings after article-specific
   settings have already been calculated.
4. In-text article images are requested at `9:16` instead of a web-friendly
   article ratio.
5. Workflow state is split across contradictory queue and workflow labels.
6. Pause only takes effect between generation steps, but the interface does not
   explain that behavior.
7. Cost estimation shows a zero value while loading or when calculation fails.
8. Settings migrations are distributed across feature-specific flags instead of
   a single versioned migration path.

## Phase 1 Implementation Checklist

- [ ] Add pure resolver tests before changing generation precedence.
- [ ] Centralize article generation settings and source tracking.
- [ ] Preserve legacy articles without a source field.
- [ ] Add canonical workflow states and legacy state derivation.
- [ ] Preserve outline approval and checkpoints during recovery.
- [ ] Add outline generation and review without a paid call in tests.
- [ ] Use resolved settings in every article generation step.
- [ ] Add versioned, idempotent image-ratio settings migration.
- [ ] Use separate featured, in-text, Pinterest, Instagram, story, Facebook, and
  square ratios.
- [ ] Explain unsupported ratio substitutions and record the selected ratio.
- [ ] Rename pause behavior to `Pause after current step`.
- [ ] Add cost loading, error, retry, model, image-count, and budget details.
- [ ] Run tests and production build after every focused change.
- [ ] Scan the final diff for secrets and unsafe Electron changes.
- [ ] Do not merge, publish, or call live paid services.
