# Content Studio Mac Handoff

Current source: Content Studio 1.6.5. Repository:
https://github.com/mahdibouizmoune/content-studio

The source excludes local credentials, workspace databases, generated media,
dependencies, and Windows installers. This is not a prebuilt Mac installer.
If the repository is private, its owner must invite the Mac user's GitHub account.

## Open In Codex

1. Clone the repository, or download its main-branch ZIP and extract it.
2. Open Codex and choose **Open Folder**.
3. Select the `content-studio` project folder.
4. Ask Codex to run the verification and Mac packaging commands below.

```bash
git clone https://github.com/mahdibouizmoune/content-studio.git
cd content-studio
```

## Requirements

- macOS 13 or newer recommended
- Node.js 24 LTS (use the current patch release)
- npm
- Xcode Command Line Tools

Install the Apple command-line tools once:

```bash
xcode-select --install
```

## Verify The Source

From Terminal in the project folder:

```bash
npm ci
npm run check
```

For development without creating an installer, run `npm run dev`.

## Build A Local Mac Installer

For an Apple Silicon Mac (M1, M2, M3, M4, or newer):

```bash
CONTENT_STUDIO_ALLOW_UNSIGNED=1 CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac -- --arm64 --config.mac.identity=null --config.mac.notarize=false '--config.artifactName=Content Studio UNSIGNED TEST ${version}.${ext}'
```

For an Intel Mac:

```bash
CONTENT_STUDIO_ALLOW_UNSIGNED=1 CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac -- --x64 --config.mac.identity=null --config.mac.notarize=false '--config.artifactName=Content Studio UNSIGNED TEST ${version}.${ext}'
```

The DMG will be created in `release/`. Open it, drag Content Studio to
Applications. The filename must include **UNSIGNED TEST** because this is a
personal local build, not an Apple-notarized distribution. Automatic updates
remain disabled. Do not disable Gatekeeper globally; macOS may require an
explicit per-app approval in Privacy & Security for a build you trust.

Do not run both architecture commands. `uname -m` prints `arm64` on an Apple
Silicon native shell, and `x86_64` on an Intel shell (or under Rosetta).
Use a native Terminal session matching the Mac's architecture.

## Configuration

Open Content Studio Settings and enter the Mac user's own Replicate,
WordPress, ImgBB, Impact, Amazon, or GoHighLevel credentials. Credentials from
the original Windows computer are not included and must not be shared.

## Distribution Note

The commands above create a local unsigned build. A polished installer for
general distribution requires an Apple Developer ID Application certificate,
Apple notarization credentials, and a signed/notarized build produced on macOS.
No Mac DMG was built or tested on the Windows development computer.

## Prompt For Your Friend's Coding Assistant

> Use the existing Content Studio repository, not a new application. Read
> MAC-HANDOFF.md and package.json, install the locked dependencies with npm ci,
> run npm run check, then build a personal UNSIGNED TEST DMG matching this Mac's
> architecture using the documented command. Preserve all publishing, recipe,
> spending and security gates. Do not copy credentials or the Windows user
> profile, purchase API generations, publish content, or disable Gatekeeper.
> Report test failures honestly and give me the DMG path when the build succeeds.
