# Pinterest export: skip invalid Pins

An invalid Pin no longer blocks otherwise valid Pins in the same export.

- Preflight failures, invalid fields, failed hosting, unavailable destinations, and changed or mismatched images are excluded per row.
- Valid rows keep their order and selected dates. Saved Pins are not deleted.
- The upload CSV contains only accepted rows. A separate `-REJECTED.csv` and validation report explain excluded rows using their original row numbers. Do not upload the rejected report to Pinterest.
- Only exported Pin IDs are marked exported. A mixture of previously exported and fresh Pins skips the previous exports to prevent duplicates; an entirely previous export retains the download-copy flow.
- When no valid Pins remain, no upload CSV or new delivery attempt is created.
- File-writing failures and invalid batch-level requests still stop export. Verification is not bypassed, and local success does not guarantee Pinterest acceptance.

Regression tests cover twenty-row batches with one invalid field, mismatched image, network failure, preflight failure, or image change during the save dialog; they also cover mixed previous exports and failed-only retry subsets.
