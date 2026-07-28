# Manual Test Checklist

Use a copied or isolated workspace. Never point routine validation at production
WordPress, paid Replicate jobs, Pinterest publishing, affiliate records, or live
GoHighLevel sending.

## Startup And Recovery

- [ ] Start the development app with an empty test workspace.
- [ ] Start the packaged app with isolated user data.
- [ ] Reopen a copied legacy workspace and confirm settings and articles remain.
- [ ] Confirm an interrupted article recovers to a safe workflow state.
- [ ] Create, inspect, and restore a test workspace backup.
- [ ] Confirm Diagnostics reports paths, schema version, and redacted connections.
- [ ] Confirm the renderer recovery screen can copy sanitized details.

## Navigation And Accessibility

- [ ] Navigate every main screen with the keyboard.
- [ ] Confirm focus is visible on buttons, links, fields, tabs, and menus.
- [ ] Open a confirmation dialog and verify focus starts on Cancel.
- [ ] Press Escape and verify the dialog closes without taking action.
- [ ] Tab through the dialog and confirm focus remains inside it.
- [ ] Confirm focus returns to the triggering control after closing.
- [ ] Check Articles, Plan, Create, Distribute, and More at a narrow width.
- [ ] Check light mode, dark mode, and reduced-motion behavior.

## Article Workflow

- [ ] Add one article with global length only.
- [ ] Add one article with a preset length and confirm it wins over global length.
- [ ] Add one article with a custom length and confirm it wins over the preset.
- [ ] Require outline approval, edit the outline, approve it, and continue.
- [ ] Regenerate an outline and add or remove a section.
- [ ] Pause after the current step, resume, cancel, and retry a safe checkpoint.
- [ ] Confirm completed content enters Needs Review.
- [ ] Confirm errors can be cleared and successful items remain.

## Editorial Review

- [ ] Edit the brief and confirm the article keeps article-specific values.
- [ ] Review category-level quality scores and reasons.
- [ ] Confirm critical blockers prevent normal approval.
- [ ] Record an override reason and confirm it is saved.
- [ ] Regenerate one section, compare the proposal, accept it, and restore a revision.
- [ ] Regenerate metadata and one image without replacing the full article.
- [ ] Validate a complete recipe card and Recipe JSON-LD.
- [ ] Confirm fake ratings, reviews, and unsupported facts are not generated.

## Images And Media

- [ ] Confirm featured, in-text, Pinterest, portrait, story, feed, and square ratios.
- [ ] Confirm unsupported ratios show the selected substitute.
- [ ] Generate or mock multiple images and confirm bounded processing.
- [ ] Confirm WebP optimization keeps stored media after restart.
- [ ] Download a temporary export and confirm its object URL is released.
- [ ] Clear temporary media cache and confirm generated media remains.

## WordPress And Distribution

- [ ] Test a non-production WordPress connection.
- [ ] Sync categories and verify the suggested category can be changed.
- [ ] Prepare a draft payload without publishing.
- [ ] Confirm publish warnings use the in-app confirmation dialog.
- [ ] Confirm Rank Math fields, canonical URL, recipe schema, and image alt text.
- [ ] Send a public article URL to Pin Creator and confirm no duplicate queue entry.
- [ ] Verify Pinterest board matching uses only configured boards.
- [ ] Verify Pinterest and GoHighLevel CSV schedules use the selected interval.
- [ ] Verify UTM links preserve existing query values and hash fragments.

## Connections And Security

- [ ] Test each configured connection from Connections.
- [ ] Confirm missing and failed configuration states are distinct.
- [ ] Confirm secrets are not visible in logs, diagnostics, exports, or revisions.
- [ ] Confirm renderer windows have no Node.js access.
- [ ] Confirm unapproved IPC channel names cannot be called.
- [ ] Confirm private network media and unsafe redirects are rejected.
- [ ] Confirm destructive actions require an explicit dialog choice.

## Optional Growth Features

- [ ] Confirm all large feature flags default off in a new workspace.
- [ ] Enable each flag independently and confirm disabled tools stay hidden.
- [ ] Add and edit a calendar record without publishing.
- [ ] Create a campaign record linking existing content.
- [ ] Import revenue CSV and confirm missing revenue is never invented.
- [ ] Review update recommendations and their evidence.
- [ ] Inspect a run-history record and retry only from a safe step.

## Packaging

- [ ] Install the Windows package on a clean Windows test account.
- [ ] Confirm app name, icon, Start menu entry, and uninstall entry.
- [ ] Launch, close, restart, and reopen saved data.
- [ ] Confirm Sharp loads and WebP conversion works in the packaged app.
- [ ] Verify the Windows signature before a production release.
- [ ] Build, sign, notarize, staple, and Gatekeeper-test the DMG on macOS.
- [ ] Generate and publish SHA-256 checksums for final signed artifacts.
