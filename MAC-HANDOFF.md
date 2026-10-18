# Content Studio Mac Handoff

This source bundle contains Content Studio 1.3.2. It intentionally excludes
local credentials, workspace databases, generated media, dependencies, and
Windows installers.

## Open In Codex

1. Extract the ZIP to a normal project folder.
2. Open Codex and choose **Open Folder**.
3. Select the extracted `Content-Studio-1.3.2-Mac-Source` folder.
4. Ask Codex to run the verification and Mac packaging commands below.

## Requirements

- macOS 13 or newer
- Node.js 22.13 or newer (Node.js 24 recommended)
- npm
- Xcode Command Line Tools

Install the Apple command-line tools once:

```bash
xcode-select --install
```

## Verify The Source

From Terminal in the extracted folder:

```bash
npm ci
npm run check
```

## Build A Local Mac Installer

For an Apple Silicon Mac (M1, M2, M3, M4, or newer):

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac -- --arm64 --config.mac.identity=null --config.mac.hardenedRuntime=false
```

For an Intel Mac:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac -- --x64 --config.mac.identity=null --config.mac.hardenedRuntime=false
```

The DMG will be created in `release/`. Open it, drag Content Studio to
Applications, then use Finder's **Open** command the first time. macOS may ask
for confirmation because this local build is not Apple-notarized.

## Configuration

Open Content Studio Settings and enter the Mac user's own Replicate,
WordPress, ImgBB, Impact, Amazon, or GoHighLevel credentials. Credentials from
the original Windows computer are not included and must not be shared.

## Distribution Note

The commands above create a local unsigned build. A polished installer for
general distribution requires an Apple Developer ID Application certificate,
Apple notarization credentials, and a signed/notarized build produced on macOS.
