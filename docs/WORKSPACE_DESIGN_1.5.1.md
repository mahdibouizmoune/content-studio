# Content Studio Workspace Design

## Scope

This release changes the renderer layout and styling, not the publishing engine.
Existing route IDs, provider requests, image output sizes, CSV field formats,
schedule calculations, storage keys, and background-job lifecycle are retained.
The only new saved preference is whether desktop navigation is collapsed.
No additional runtime dependencies, fonts, external trackers, or paid APIs were added.

## Changes

- Searchable, collapsible desktop navigation with current-page semantics.
- Responsive workspace header and immediate access to Job Center.
- Consistent light/dark surface, form, focus, and button styles.
- Distinct error, warning, success, and informational colors in dark mode.
- Compact article status filters, workflow tabs, writing formats, and list rows.
- Wrapping article actions and larger grid-view image previews.
- Pinterest appearance and delivery controls arranged side by side on wide screens.
- Meta batch preparation and individual editing arranged side by side on wide screens.
- Mobile navigation retains access to all feature-flagged workspaces.
- Keyboard skip link, icon labels, theme controls, and reduced-motion support.

## Research

These projects informed interaction and layout choices. Their source code was
not copied and their frameworks were not installed or substituted for this app.

- https://github.com/shadcn-ui/ui
- https://ui.shadcn.com/docs/components/radix/sidebar
- https://github.com/satnaing/shadcn-admin
- https://github.com/tabler/tabler
- https://mantine.dev/core/app-shell/
- https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md

Available local frontend-related skill folders were inventoried. The browser
verification guidance was reviewed; the in-app browser bridge was unavailable,
so local Playwright checks were used instead.

## Verification

`scripts/test-workspace-design.cjs` exercises the actual App renderer at 1440,
900, and 390 pixels using isolated browser storage, without publishing or paid
generation. It checks workspace navigation, article filtering and view switching,
navigation search/collapse, light/dark themes, retained article workflow state,
render exceptions, and horizontal overflow on Articles, Pinterest, Meta, and Settings.

Additional regression commands:

```
npm run lint
npm test
npm run build
node scripts/test-pinterest-schedule-ui.cjs
node scripts/test-quality-studio-ui.cjs
```

Screenshots are written under `artifacts/workspace-*.png`. Browser fixture data
is not written to the installed application's user data. These checks do not
prove live Pinterest or WordPress availability or guarantee third-party imports.

Any locally packaged installer remains an unsigned test build unless a signing
certificate and verified release provenance are configured.

Completed checks for 1.5.1: lint, production build, all 367 automated tests,
the three-size App renderer checks, desktop/mobile CSV timing regression,
desktop/mobile Quality Studio and reader controls, and native packaged-screen
navigation checks. The initial CSV startup timeout passed after allowing the
cold test server 60 seconds; no scheduling code was changed. A strict native
Pin-style label locator was corrected to target the visible label and controls.
