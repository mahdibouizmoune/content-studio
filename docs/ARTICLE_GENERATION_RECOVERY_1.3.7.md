# Article generation recovery, 1.3.7

## Evidence

Read-only inspection of the saved workspace on October 11 found 20 errored articles:
18 recipe-collection validation failures and 2 later image/prompt timeouts.
The latter two retained article text in generation checkpoints, but their normal
content field was empty. One saved recipe passed validation; the chicken orzo
draft still needed a thermometer instruction and must not be published unchanged.
No real articles were deleted, published, requeued or regenerated during this audit.

## Changes

- Recognize useful cold/no-cook result cues and written ingredient counts.
  Missing measured ingredients, vague methods, contradictory times and unsafe
  poultry remain failures.
- Distinguish leftover/prepared poultry from raw poultry. Reheated poultry still
  needs a thermometer-verified 165 F (74 C). Smoked poultry without evidence of
  cooking is not automatically considered ready to eat.
- Align generation and targeted repair prompts with the checks.
- Compact collections with valid structure but an invalid primary card return
  their draft to the queue for card-only repair. They no longer regenerate an
  entire article or discard useful text for a card defect.
- Repeated structural failures retain the draft with an explicit collection
  warning. The queue stops before images; missing promised ideas are never
  silently treated as completed.
- Checkpoint text is also saved in the article's content field, and successful
  companion work remains available for retry.
- An explicit retry of a saved draft can repair its card again. The initial run
  does not repeat exhausted repairs, and an uncertain provider timeout stops
  blind repair resubmission.
- Image-prompt requests now wait up to roughly 150 seconds rather than 40,
  polling the same prediction. Provider outages and explicit cancellations can
  still stop work; this is not a promise of zero future errors.

## Recovery

Install 1.3.7, select **Retry Errors**, then **Generate All**.
Use saved-step retry rather than restarting articles with existing checkpoints.
Previously discarded collection text cannot be recovered from an empty record;
those articles need new generation. Unresolved recipe issues remain reviewable
drafts and are blocked from unsafe publication.

## Verification

Seven new regressions cover cold recipes, quantities, raw and reheated poultry,
actual compact-generation control flow, draft retention, targeted card-only
repair and image-prompt waits. The full suite has 304 passing tests, with lint
and production build passing. Tests use mocked providers, not paid predictions.
The packaged desktop app also passed isolated startup, queue/deduplication,
cold-recipe and raw-poultry checks with no renderer exceptions or paid calls.

Food-safety reference:
https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/leftovers-and-food-safety
