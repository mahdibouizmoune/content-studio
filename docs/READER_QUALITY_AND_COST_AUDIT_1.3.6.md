# Reader quality, provider spending and WordPress Pin retention

## Hosting and cleanup

Keeping an image in WordPress does not automatically add it to every page, but uploads, generated thumbnail variants, storage, backups and image delivery can consume server resources. The app cannot guarantee site speed without measuring the hosting environment. Existing bounded image sizes, upload serialization and verified URL reuse are retained.

WordPress Pin Cleanup remains enabled by default under Settings. It runs on app startup and daily while the app is open. Only tracked app-uploaded finished Pinterest Pins become eligible after seven days. Article images, attached media, content references, unresolved imports and future scheduled Pins remain protected. A confirmed import remains protected for a week after its scheduled/publication confirmation time, whichever is later. Unknown import results must be reconciled in batch history; export alone is not proof of successful ingestion.

Cleanup now avoids all site requests when nothing is eligible, protects malformed batch records, and also checks saved featured/in-text image fields before deletion. It does not delete arbitrary Media Library items. It fails closed when full WordPress reference checks are unavailable. No live remote deletion was performed during development.

## Avoidable Replicate spending fixed

- A second full-article editorial rewrite is no longer unconditional. The initial prompt now includes the stronger editorial standard. Local checks request a paid revision only for detected practical-coverage, readability, repetition or trust gaps. Recipe validation and bounded repair are still required; the checks are not a claim of kitchen testing.
- Title/image-prompt and image/prompt parallel tasks checkpoint each successful result before raising a companion failure. Resuming therefore reuses paid work instead of throwing it away.
- If the generation backend has already exhausted its recipe repairs, the queue validates and flags the draft instead of immediately buying another two identical repairs. A later explicit publish attempt can still repair an edited or old draft.
- Optional affiliate planning starts only after article/media success and is saved for resume. It no longer runs in the background for an article that fails earlier.
- Transient polling failures recheck the same prediction. Timeouts and cancellation stop remote work; ambiguous prediction-submission responses prevent blind automatic resubmission. Provider deadlines bound abandoned work. These protections cannot refund work already billed or guarantee that an ambiguous submission was never created.
- Article-title inputs are actually capped at their advertised 1,500-character context. Small title and featured-prompt outputs are bounded. Selected writing and image models are unchanged.

Existing Meta automatic captions, local crops, verified hosted-image reuse and checkpoints were retained. No extra paid model pass was added for the new reader navigation. Displayed provider costs remain estimates, not billed amounts; actual savings depend on drafts and retries.

## Reader-first article improvements

The generation and collection prompts emphasize practical flavor/texture, ingredient state, equipment/pan size, measurable instructions, substitutions and their limitations, failure prevention/rescue, realistic storage and appropriate serving temperature. Cold recipes are not forced to invent reheating instructions. Nutrition, testing, ratings, credentials and health claims must not be fabricated.

The article gets one lightweight, accessible Jump to Recipe link near its opening. It uses an ordinary anchor without tracking, third-party scripts or extra calls, and is idempotent across saves. Existing contextual internal links and save/newsletter elements remain. Quality reporting no longer falsely rejects a valid three-ingredient recipe/schema or a Yield label.

Better usefulness can support reader satisfaction, but longer visits, rankings or sharing are not guaranteed. A short successful cooking visit is not a failure. Editorial review and real kitchen testing remain important, especially for fermentation/preservation and special-diet recipes. Existing published posts are not rewritten automatically.

## Research sources

- WordPress optimization and image/server load: https://developer.wordpress.org/advanced-administration/performance/optimization/
- Replicate deadlines and request versus prediction lifetime: https://replicate.com/docs/topics/predictions/create-a-prediction
- Replicate API cancellation: https://replicate.com/docs/reference/http/
- Google people-first content, with no preferred word count: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google Recipe structured-data requirements: https://developers.google.com/search/docs/appearance/structured-data/recipe
- Sally's Baking, observed recipe navigation, ingredient explanations, substitutions and freezing guidance: https://sallysbakingaddiction.com/best-banana-bread-recipe/
- RecipeTin Eats, observed recipe navigation, substitution options, storage and reheating: https://www.recipetineats.com/chicken-marinade/

These pages informed structure and checks; their prose and recipes were not copied into generation output.

## Verification

297 automated tests, lint and the production build passed. Browser checks verified a single working recipe shortcut, idempotent layout, no scripts and no horizontal overflow at desktop and mobile widths. The final packaged app passed startup, trusted article intake and native recipe validation checks in an empty test profile. Runtime dependency audit: zero known vulnerabilities; the previously documented development/build dependency findings remain at 15 (5 high, 10 moderate). The installer is explicitly unsigned because no signing certificate is configured. Tests used mocked provider calls or isolated data, not paid live generation, publication or remote deletion. This does not certify culinary outcomes or the performance of the live hosting account.
