# Release Safety

This document describes the release process for Content Studio. It does not
enable automatic publishing, add credentials, or replace platform signing
requirements.

## Release Gate

Before creating a release:

1. Start from a reviewed commit on the intended release branch.
2. Confirm the worktree is clean.
3. Run `npm ci`, `npm run lint`, `npm test`, `npm run build`, and `npm run check`.
4. Build the platform package on that operating system.
5. Smoke-test the packaged application with isolated user data.
6. Confirm existing user data opens through a copy of a real workspace.
7. Scan the committed diff and packaged files for secrets.
8. Record the installer checksum and exact commit hash.
9. Prepare release notes and rollback instructions.
10. Publish only after a human reviews the artifacts.

Do not use live WordPress publishing, Replicate generation, affiliate changes,
Pinterest posting, or GoHighLevel sending as part of automated validation.

## Windows Signing

Use an organization-owned Authenticode certificate from a trusted certificate
authority. Keep the certificate and password in the CI provider's encrypted
secret store or a protected signing service. Never commit a PFX file, password,
token, or base64 certificate.

The current local build disables executable editing and signing so unsigned test
installers can be built. A production pipeline must remove that override only
after valid signing is configured. Verify the signature in Windows file
properties and with `Get-AuthenticodeSignature` before publishing.

## macOS Signing And Notarization

Build the macOS artifact on macOS with an active Apple Developer ID Application
certificate. Keep the Apple account, team identifier, and app-specific password
or App Store Connect API key in protected CI secrets.

Sign all application code, submit the artifact for notarization, wait for a
successful result, staple the ticket, and verify the final DMG with Gatekeeper.
Do not present an unsigned DMG as a production-ready macOS release.

## Automatic Updates

No automatic updater is enabled. Keep updates disabled until a real release
provider, signing process, staged rollout plan, integrity verification, and
rollback path are configured. Never point an updater at mutable or unsigned
artifacts.

## Checksums

Generate a SHA-256 checksum after the final installer or DMG is complete. Publish
checksums beside the matching release artifacts. Recalculate after any rebuild
because even a source-equivalent package can have a different checksum.

Windows example:

```powershell
Get-FileHash ".\release\Content Studio Setup 1.2.14.exe" -Algorithm SHA256
```

macOS example:

```bash
shasum -a 256 "Content Studio-1.2.14.dmg"
```

## Release Notes

Every release note should include:

- Version and commit hash
- Supported operating systems
- User-facing changes
- Data migrations
- Security changes
- Known limitations
- Manual upgrade steps, when needed
- Verification checksum

Do not claim a platform package was tested unless it was built and smoke-tested
on that platform.

## Rollback

1. Pause distribution of the affected release.
2. Mark the release as withdrawn without deleting its investigation evidence.
3. Direct users to the last verified signed version.
4. Preserve user data and create a workspace backup before downgrading.
5. Reproduce the issue against a copy of the affected workspace.
6. Fix forward when a migrated store cannot be safely read by an older version.
7. Publish a new signed patch release with updated notes and checksum.

Content Studio settings migrations are forward-only and idempotent. Unknown
fields are preserved, but a rollback should still use a workspace backup from
before the upgrade whenever possible.

## Download Claims

The README may link to GitHub Releases only while a real release exists there.
The latest release status should be checked before changing download wording.
Local unsigned test packages must not be described as official signed releases.
