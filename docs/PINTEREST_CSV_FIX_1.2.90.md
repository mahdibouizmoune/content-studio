# Pinterest CSV Export Fix: 1.2.90

## Findings

The legacy exporter in `electron/pin-creator/renderer.js` prepended `\uFEFF` when creating its download Blob and serialized rows manually. It now calls the same desktop IPC exporter as the React editor. The legacy directory is excluded from the current Windows package, so this proves a defect in that source path, not that every recent failed import came from a BOM.

The active exporter was BOM-free, but had separate compatibility defects: ASCII conversion changed Unicode text and board names; validation automatically scheduled blank dates and replaced expired dates; URL validation relied on a prefix and rejected media query parameters; the browser preview reported a successful export without writing a file. These behaviors are corrected.

Pinterest's official instructions specify eight columns, a 100-character title, a 500-character description, public direct media, UTC scheduling, and blank dates for immediate publishing:
https://help.pinterest.com/en/business/article/bulk-upload-video-pins

## Files and behavior

| File | Change |
| --- | --- |
| electron/pinterest-export.js | Central sanitizer, Unicode-safe truncation, strict date normalization, structured row errors, UTF-8 serializer using csv-stringify, parser round trip, filename helper. |
| electron/main.js | Shared writer, live public-media validation, date revalidation after the save dialog, disk readback, schedule audit report. |
| electron/pin-creator/renderer.js | Removed BOM and manual serializer; routes through shared writer; preserves saved edits and selected dates. |
| src/components/PinCreatorView.jsx | No implicit schedule on export/load; invalid selected dates remain errors; preserves board names and keywords; one-Pin test CSV; clear-schedule control; accurate export status. |
| src/lib/electron.js | Browser preview reports desktop export unavailable instead of fake success. |
| tests/reliability.test.js | Pinterest compatibility regression suite. |
| tests/pinterest-diagnostic.test.js | Functional one-Pin export test proving the remaining batch is retained. |
| scripts/pinterest-export-sample.js | Reproducible three-Pin sample using real input metadata and the production serializer. |
| package.json, package-lock.json | Version 1.2.90. |

## Regression coverage

- Exact headers and first bytes; BOM rejection; invalid UTF-8 rejection.
- Eight fields per row; complete batch counts; splitting only above 200 Pins.
- Commas, quotes, ampersands, apostrophes, hashtags and Unicode survive CSV round trip.
- CR/LF, NUL and other control characters are cleaned without creating new rows.
- Titles and descriptions are truncated on word/grapheme boundaries within 100/500 limits.
- Unscheduled rows remain blank; future UTC and explicit offset timestamps normalize correctly.
- Malformed, locale-formatted, impossible, expired and out-of-window dates produce errors.
- Null, undefined, NaN and object placeholders do not become CSV cell text.
- Local, relative, blob, data, private-host, gallery and temporary media URLs are rejected.
- HTTP/HTTPS and media query parameters work; destination ampersands are not HTML-encoded.
- Image thumbnails are empty; supported video thumbnail timestamp formats are accepted.
- Diagnostic export contains one Pin and preserves the remaining saved Pins.

## Real sample

Full test suite: 182 tests passed, zero failures, including the two existing integration tests and the functional diagnostic export test. Lint passed with no warnings. Production Vite build and Windows installer build passed. The packaged application started with isolated data; its startup log contained no errors.

Generated from the first three Pins in `pinterest-bulk-upload-1788896799191.csv`, deliberately without a schedule. No Pins were published.

Output: `artifacts/pinterest-export-sample.csv`
Machine-readable result: `artifacts/pinterest-export-sample.validation.json`

- UTF-8 WITHOUT BOM.
- First five bytes: `54 69 74 6C 65`.
- Three data rows, all exactly eight fields, plus the exact eight-field header.
- Title lengths: 81, 76, 69.
- Description lengths: 380, 347, 350.
- Three blank Publish date cells.
- Zero validation errors or warnings.
- Serialized values match the parsed values.

Exact header and first data row:

```csv
Title,Media URL,Pinterest board,Thumbnail,Description,Link,Publish date,Keywords
Cinnamon Roll Cold Brew Cozy with Creamy Vanilla Swirl for Easy Weeknight Comfort,https://i.ibb.co/NhTy7VD/cinnamon-roll-cold-brew-cozy-8-easy-creamy-ideas-to-try.jpg,Quick Weeknight Meals (30 Minute Dinners),,"This cinnamon roll cold brew cozy recipe offers a smooth blend of cold brew coffee, cinnamon sugar, and creamy vanilla for a comforting drink perfect for relaxing evenings. Made with a simple cold brew method and a white chocolate or cream cheese frosting swirl, it's an easy treat to save for your cozy weeknight routine. Visit for full ingredients and step-by-step instructions.",https://gourmetgather.com/cinnamon-roll-cold-brew-cozy-8-easy-creamy-ideas-to-try/?utm_source=pinterest&utm_medium=social&utm_campaign=cinnamon_roll_cold_brew_cozy_with_creamy_vanilla_swirl_for_easy_weeknight_comfort&utm_content=pin_1788818627041_2ab2546ed9691,,"cinnamon roll cold brew cozy, recipe roundup, easy recipe ideas, cinnamon roll cold brew cozy recipe, easy cinnamon roll cold brew cozy, Drinks, Quick Drinks"
```

## Verification boundary

Local serialization tests do not reproduce Pinterest's private importer. No live Pinterest upload was performed. Desktop export probes media before saving; the sample script verifies bytes and fields only. Public hosting and account-side acceptance can still change after export. Existing exports are not rewritten, and previously saved dates remain until the user changes or clears them.

The unrelated Meta/GHL exporter was not changed.
