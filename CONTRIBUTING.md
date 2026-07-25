# Contributing

Content Studio is currently published as a source-available portfolio project.
Bug reports and focused improvement proposals are welcome.

## Development

1. Use Node.js 20.19 or newer.
2. Install dependencies with `npm install`.
3. Start the desktop app with `npm run dev`.
4. Keep changes focused and preserve the existing security boundaries.
5. Run `npm test` and `npm run build` before submitting changes.

## Security Requirements

- Never commit API keys, access tokens, WordPress passwords, or exported user data.
- Keep Electron sandboxing and context isolation enabled.
- Add privileged functionality through the allowlisted preload API.
- Validate remote URLs before downloads and media processing.
- Preserve encrypted local secret storage.

By submitting a contribution, you agree that its inclusion remains subject to
the repository's source-available license.
