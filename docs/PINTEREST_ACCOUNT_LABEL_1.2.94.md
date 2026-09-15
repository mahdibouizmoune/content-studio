# Pinterest CSV account label fix

The target account field was a local delivery-history label, not part of the
Pinterest bulk CSV format. Version 1.2.93 incorrectly required it before export.

Version 1.2.94 makes the label optional in both the renderer and export service.
Named labels continue to be remembered. Blank labels display as Unassigned account
in history and add no new CSV field, credentials, or authentication requirement.

All finished-image, URL, dimension, scheduling, row-count, and file-integrity
checks remain enabled. Unassigned exports conservatively overlap named account
history for duplicate detection; clearing a label cannot bypass a previous
confirmed or unresolved export. Failed-only retries support unassigned batches.

Verification: 230 tests passed, including five new account-label regressions;
ESLint passed. No live upload, installed application, or user data was changed.
