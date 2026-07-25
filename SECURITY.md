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
