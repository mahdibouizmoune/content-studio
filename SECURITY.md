# Security Policy

## Supported Version

Security fixes are applied to the latest release of Content Studio.

## Reporting a Vulnerability

Please do not open a public issue for a suspected security vulnerability.
Use GitHub's private vulnerability reporting feature for this repository.

Include:

- The affected feature and version
- Clear reproduction steps
- The expected and observed behavior
- Any relevant logs with credentials and personal data removed

## Credential Handling

Content Studio stores supported API secrets with Electron `safeStorage`.
Credentials, local application data, generated media, and `.env` files must
never be committed to the repository or attached to an issue.

Legacy plaintext credentials are migrated to operating-system encrypted storage
when the app starts and secure storage is available.

## Packaged Application Protection

Release builds use an ASAR archive, application-owned JavaScript obfuscation,
disabled source maps, Electron fuse hardening, ASAR-only application loading,
and embedded ASAR integrity validation. These controls deter casual copying and
detect packaged-code replacement, but no client-side application can make code
extraction impossible for a determined attacker.

Production installers should also be Authenticode signed on Windows and signed
and notarized on macOS. Signing protects the executable and makes its packaged
code and fuse configuration materially harder to replace.
