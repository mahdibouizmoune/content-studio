# Content Studio 1.6.4

Local update addressing the five findings in the 2026-10-29 takeover audit.

- Keep durable AI-generation provenance and recipe-collection metadata after queue completion. Both generation validations receive current metadata; legacy multi-recipe content is checked recipe by recipe even without a checkpoint. Previously generated completed articles remain eligible for the recipe review control.
- Commit and verify migrated settings lists before removing legacy fields. Roll back the list replacement if the settings file cannot be saved; close failed initializations. Only actual SQLite corruption permits quarantine, not disk-full, permission or migration failures.
- Save WordPress site edits by stable identity and changed fields. Preserve newer sync results and sites added elsewhere. Keep explicit removal, detect edits to deleted sites, and clear old-domain sync data when a URL changes. Legacy full-array callers cannot roll back newer timestamped sync data.
- Scope GHL caption duplicate checks to overlapping social accounts. Disjoint known accounts can receive the same caption; unknown legacy targets remain conservative to prevent accidental duplicates.
- Rebuild publication recipe schema from the final uploaded image URLs. Omit individual Recipe entries without a representative durable photo, with an explicit warning; never remove their visible recipe or invent a matching photo. Non-food content does not receive recipe-review warnings.

Unchanged: primary Ingredient Closeup style, 1080 x 1920 Pins, editable 90-minute CSV default, chosen row dates, hosting choices, Pin-only Meta repurposing, app identity and existing user-data location.

Verification before packaging: 481 tests passed; lint passed; build passed; all six UI fixture suites passed. Verification uses isolated profiles and synthetic data, not live publishing or paid generation. Installer verification is recorded separately with the generated artifact.

This local development update is not a signed/tagged production release. No signing credentials were configured. An explicitly named UNSIGNED TEST installer is permitted by the existing test-build route; production signing, provenance and obfuscation checks remain enabled.
