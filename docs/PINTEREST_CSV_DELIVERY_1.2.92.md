# Pinterest CSV delivery safeguards: 1.2.92

CSV remains the publishing route. No developer application, OAuth connection,
or direct Pinterest publishing was added. No production Pins were published
during implementation or testing.

## Changes

- Final export resolves saved Pin IDs in the main process, matches the verified
  public URL, downloads the image, verifies 1000 x 1500 dimensions, and compares
  image identity. It rechecks saved state after the Save dialog.
- Finished Pinterest CSV images must decode as JPEG or PNG, agree with their
  MIME type and filename extension, and be at most 20,000,000 bytes. Meta's
  existing format validation remains unchanged.
- Every CSV is staged, synced, read back and parsed before replacing its final
  filename. Partial multi-file commits are recorded. A 20-Pin batch remains one
  CSV; splitting occurs only above 200 Pins.
- Workspace-backed import history records the manually entered target account,
  immutable rows, asset identities, file checksums, and per-row reported results.
  Exporting a file does not mark its Pins as accepted by Pinterest.
- Receipt matching proposes failures only for exact title-and-board matches in
  tab-separated or pipe-separated error rows. Review and save the matches.
  Missing and ambiguous matches remain unresolved, never assumed successful.
- Failed-only retries exclude confirmed Pins and other unresolved attempts for
  the same account. Retried schedules and assets undergo full validation again.
- Show CSV locates an existing export after checking its saved checksum. It
  does not create another batch or upload anything.

## Workflow

1. Enter the destination Pinterest account name in the CSV controls. This is a
   manual label, not authentication; verify the same account in Pinterest.
2. Prepare and export the complete batch, then upload that CSV to Pinterest.
3. In Pinterest Import History, select that batch. Paste the Pinterest email,
   choose Match Error Rows, review the row statuses, then Save Results. Use the
   per-row dropdowns when the receipt cannot be matched precisely.
4. Confirm successful rows only from Pinterest evidence. Unknown rows stay
   pending. Use Retry Failed Only for explicitly failed rows.
5. If Pinterest rejects reachable media again, the existing WordPress recovery
   host option can rehost the finished images for the selected retry. A changed
   image or expired schedule must be corrected before exporting the retry.

History begins with exports from this version; earlier files are not silently
imported or labeled accepted. Reports distinguish local validation from actual
Pinterest acceptance. Previously exported files are not modified by this update.

## Limits

Pinterest's email for the supplied 18-row batch proves it parsed the rows but
reported failure creating every Pin. Its generic error does not identify the
cause. These fixes close verified local correctness gaps and prevent blind
full-batch retries; they cannot guarantee Pinterest's external processor will
accept every CSV. Receipt statuses remain explicitly user-reported.
