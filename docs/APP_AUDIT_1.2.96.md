# Content Studio 1.2.96 audit and GitHub handoff

Date: September 15, 2026.

## Scope

Reviewed the current working tree, including the accumulated article-generation,
WordPress, Pinterest CSV, Meta/GHL, credential, managed-media, backup, updater,
and packaging changes. This is a source review with regression and isolated UI
checks, not a penetration test or a guarantee that no defects remain.

## Additional fixes

- GHL verification now requires the requested post ID and checks location when
  returned. HTTP 200 with an empty body, embedded error, another post, or another
  location no longer counts as verified. The documented `results.post` response
  envelope is supported for post IDs and status extraction.
- Pinterest recovery fingerprints downloaded bytes before rehosting them. A
  remote image that changes after the validation GET cannot silently replace
  the saved finished Pin.
- WordPress image hosting selects the most specific configured site path and
  checks ports. A subdirectory installation cannot be confused with a sibling
  installation on the same hostname.
- Bulk WordPress publication separates public posts from drafts/other posts
  needing review and rejects unsuccessful result objects before saving success.
- CI uses Node 24, and the declared minimum is Node 22.13, because the workspace
  uses built-in SQLite. CI also runs on `codex/**` branch pushes.
- The optional Pinterest browser smoke test no longer embeds a developer's
  absolute runtime path. Synthetic fixtures are tracked under `tests/fixtures`;
  generated diagnostics and screenshots under `artifacts/` are ignored.

Existing fixes from 1.2.90-1.2.95 are preserved, including complete CSV exports,
finished-image identity checks, optional account labels, failed-only recovery,
WordPress-first export hosting, publication retry guards, SQLite recovery,
Meta crop invalidation, patched dependencies, and distribution signing gates.

## Verification

- 239 regression tests passed, including four new behavior tests covering the
  fixes above (multiple invalid-response cases run inside the GHL test).
- ESLint and production Vite build passed.
- Full online npm audit reported zero known vulnerabilities.
- Pinterest delivery-history browser test passed at 1400px and 390px widths:
  receipt matching, saving outcomes, failed-only retry, no page overflow, and no
  browser exceptions. The first cold dependency-optimization run timed out; the
  repeat after optimization passed.
- No real posts, Pins, credentials, settings, or workspace records were modified
  by verification. No installer was installed or rebuilt in this audit.

## Optional browser check

Install Playwright separately in a test environment or set
`PLAYWRIGHT_MODULE_PATH` to an available Playwright package. Install its Chromium
browser, or set `PLAYWRIGHT_CHANNEL=msedge` to use installed Edge. Run:

```sh
node scripts/test-pinterest-delivery-ui.cjs
```

The test creates an isolated local server, mocks the Electron API, writes
screenshots to ignored `artifacts/`, and closes the browser/server afterwards.

## Remaining limits

- Pinterest CSV acceptance is external. Locally valid media and CSV syntax do
  not prove Pinterest accepted every row. Historical missing rows still require
  the actual import receipt; do not blindly re-upload unresolved batches.
- Windows production signing remains unconfigured. An OS login PIN is not a
  publisher certificate. Unsigned local-test builds are not signed releases.
- Live-provider permissions, quotas, outages, and WordPress plugins were not
  exercised with real publication side effects.
- Local Windows checks passed; GitHub's Windows/Linux jobs must run after push.
- Client-side obfuscation and ASAR integrity deter copying but cannot make
  desktop source impossible to extract.

## Primary references

- [HighLevel Get post response](https://marketplace.gohighlevel.com/docs/ghl/social-planner/get-post/)
- [Node.js SQLite introduction](https://nodejs.org/en/blog/release/v22.5.0)
- [Pinterest bulk-upload requirements](https://help.pinterest.com/en/business/article/bulk-upload-video-pins)
