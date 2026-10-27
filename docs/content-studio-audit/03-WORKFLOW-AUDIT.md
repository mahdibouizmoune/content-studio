# 03 — Workflow Audit

## Current main workflow

```mermaid
flowchart LR
  R[Trends / keyword research] --> Q[Add to Queue<br/>cannibalization: advisory]
  Q --> O[Outline<br/>ignored by collections]
  O --> G[generate-article<br/>recipeCardEnabled forced true]
  G --> E[Editorial pass<br/>full regeneration]
  E --> C[Card repair x2]
  C --> P[Post-process: meta, schema, links, images]
  P --> QA[Quality report]
  QA -->|editor: blockers need override| WP[push-to-wordpress]
  QA -->|bulk: previously no gate| WP
  WP --> L[Prompt-leak gate] --> RR[Recipe readiness<br/>primary card only] --> M[Media upload] --> POST[POST with receipt] --> RM[Rank Math meta] --> PIN[Pin queue + post-publish QA]
  PIN --> CSV[Pinterest CSV / API] --> META[Meta 4:5 from Pins] --> GHL[GHL scheduling]
  GHL --> AN[GA4 / GSC / Pinterest analytics]
```

## Failure points found

| Stage | Failure | Status |
|---|---|---|
| Bulk publish | Quality blockers ignored | Fixed: blocked articles count as "needs review" with reasons |
| Recipe readiness | Recipes 2–N of complete collections not gated | Fixed for `complete-recipes` collections |
| Card repair | Repaired AI text not re-checked for prompt leaks | Fixed |
| Payload | Unknown status → public | Fixed: fails closed to draft |
| Generation | Non-food listicles get recipe rules and paid card repair | Open (needs paid testing) |
| Generation | Long lengths (6,500+ words) exceed max_tokens and trigger 3 paid retries | Open |
| Featured image | Deferred image still publishes with no featured media | Open (behaviour change) |
| Publish receipt | Unknown outcome blocks forever; no clear action | Open |
| GHL refresh | Receipts beyond 200 erased (duplicate risk) | Fixed |
| GHL dedupe | Key changes when schedule/image URL changes | Open |
| Video | Download failure lost paid result | Fixed |
| Pinterest API tick | Board re-sync every 30 s | Fixed (earlier this session) |

## Improved workflow (proposed)

```mermaid
flowchart LR
  R[Research] --> Q[Queue + blocking cannibalization check<br/>against WordPress archive]
  Q --> O[Approved outline used by every path]
  O --> G[Category-aware generation<br/>recipe rules only for food]
  G --> V{Deterministic gates:<br/>recipe per item, leaks, schema, links}
  V -->|fail| FIX[Targeted section repair, not full regeneration]
  FIX --> V
  V -->|pass| H[Human approval queue]
  H --> WP[Publish, fail-closed status, receipts]
  WP --> D[Distribution: Pins → CSV/API, Meta crop with lettering check]
  D --> A[Analytics with uncertainty] --> RF[Refresh candidates]
```

The lifecycle (Idea → Draft → Validating → Needs revision → Approved → Scheduled → Publishing → Published → Analyzing → Refresh) mostly exists as `workflowStatus`/`queueStatus` values; the gaps are the blocking gates above, not a new orchestrator.
