# Backend boundaries and incremental DDD plan

This describes the backend at `main` commit `7158301dafd2021d982540c7ae809515bafd262c` and the first incremental boundary extraction. It is intentionally a map of the code that exists, not a target-wide folder migration.

## Current bounded contexts and state owners

| Context | Main code | State and boundary |
| --- | --- | --- |
| Published strategy data | `src/preflop-datasets.ts`, `src/postflop.ts`, `src/mw3-transport.ts` | Published D1 tables are read models. Preflop files under the frontend are canonical; D1 stores ordered text parts. Postflop policy/report payloads and MW3 approved delivery are also read from D1. |
| Identity and account sync | `src/account.ts`, `src/native-account.ts` | D1 owns Google subject identity, browser/native sessions, OAuth attempts and account snapshots. The browser's verified session selects the account row; `expectedOwner` is only a stale-client assertion. Snapshot updates use a version compare-and-swap. Native exchange/cancel state changes use D1 batches. |
| Rated quiz | `src/ranked.ts`, `src/ranked-history.ts`, `shared/ranked-rules.ts` | D1 owns players, match questions, submissions and ratings. Finalization is coordinated by the match-status conditional update and `ranked_finalize` trigger. `ranked-history.ts` is a cross-context read model. |
| Agent practice | `src/fastfold-dispatch.ts`, `src/fastfold-do.ts`, `src/fastfold.ts` | The Durable Object serializes the session entry point. D1 remains authoritative for session state, replay receipts/results and aggregates; strategy inputs are read from published D1/R2 data. A session CAS commits a request receipt, result and aggregate changes together. |
| Human competition | `src/fastfold-do.ts`, `src/human-rank.ts`, `src/multiplayer-engine.ts` | The Durable Object serializes requests and owns alarm scheduling; D1 rows plus the human-ranked triggers own player/table transitions and settlement. A history GET is read-only and must not sweep state or schedule an alarm. |
| Solution delivery | `src/index.ts`, `src/postflop-runtime-config.ts` | The Worker composition root routes public reads, applies CORS/cache behavior, and serves immutable R2 solution artifacts plus D1-backed published data. Runtime config is a static, byte-stable contract. |

The present route modules often combine HTTP parsing, orchestration and SQL. Pure helpers already exist in places, but dependency direction is not consistent yet: `index.ts` composes routes, while route modules can still call D1 directly. Cloudflare Worker and Durable Object bindings belong at the outside edge; D1 and R2 are adapters, not domain state owners for the game rules.

## First vertical slice: published preflop datasets

The dataset boundary is narrow but shared: the public HTTP route serves it, and Ranked reads the same immutable datasets to create and grade matches. Ranked previously constructed a fake `/v1/preflop/datasets/<name>` path and called the HTTP route. The extraction removes that route dependency while leaving the public route as the compatibility adapter.

```text
index.ts / routeRanked
        │
        ├── routePreflopDatasets (HTTP status/body/ETag mapping)
        │        └── application: listPublishedDatasets / readPublishedDataset
        │                       └── port: PublishedDatasetReader
        │                                   └── infrastructure: D1PublishedDatasetReader
        └── Ranked use case ────────────────┘
                         application → domain name policy
```

The extracted boundary is in `src/domain/published-dataset.ts`, `src/application/published-datasets.ts`, and `src/infrastructure/d1-published-dataset-repository.ts`. `src/preflop-datasets.ts` remains the public presentation adapter. The use case validates a published name, distinguishes a missing dataset from incomplete parts, and concatenates stored text without parsing or re-serializing it. The D1 adapter retains the existing list query, metadata-first read order, and ordered-parts query.

The existing contract is held by Worker tests for accepted/encoded names, malformed paths, status/error mapping, exact ETag matching, cache and CORS headers, and raw Unicode/whitespace delivery. The use case tests cover missing, skipped, duplicate and non-zero-first parts. The adapter test applies migration `0003_preflop.sql` to an isolated in-memory SQLite database and checks the actual SQL order and text reconstruction.

## Invariants to keep at their boundaries

- Do not parse/stringify published JSON in the delivery path. Part order, whitespace, Unicode text, hash ETag, and list byte count come from the canonical publication path.
- Ranked must continue to distinguish unavailable/missing inputs (`ranked_dataset_unavailable`) from malformed published JSON or invalid quiz content (`ranked_service_unavailable`).
- Keep `ranked_finalize` match-status compare-and-swap and rating updates in the same D1-triggered transition. Do not replace them with a generic repository save or asynchronous event.
- Keep the FastFold session compare-and-swap that commits replay receipt, result and aggregates once. The DO remains the serialized request/alarm adapter; D1 stays authoritative.
- Preserve all human-ranked triggers as a coordinated unit. A human history GET must not sweep state or arm an alarm.
- Keep browser/native identity and owner authorization at the authenticated transport boundary. Never accept an account owner ID as authority from request data.

## Suggested next steps

1. **Identity and account sync:** separate provider/session mechanics from account snapshot use cases after keeping owner assertion, per-transport auth, explicit import consent, request limits and version-CAS behavior under characterization tests.
2. **Rated quiz:** extract question-pool construction and grading as pure domain rules, then isolate match-start/finalize use cases around the existing D1 statements and trigger semantics. Keep `ranked-history.ts` as a read model rather than forcing it into the write aggregate.
3. **Agent practice:** separate pure hand/action rules from the request orchestration while preserving DO serialization, D1 session CAS, receipt/replay handling and strategy-source checks.
4. **Human competition:** model queue, reservation, hand, settlement and exit rules only alongside tests for the ten coordinated SQL triggers, ownership, deadlines, alarm scheduling and history-GET side effects.
5. **Remaining read models:** extract the postflop policy, MW3 delivery and R2 solution reads where a caller-independent use case is useful; retain their exact payload-byte, cache, CORS and fail-closed contracts.

Each step should stay a separately reviewable change. Do not combine it with Worker configuration, MCP routing, strategy/data regeneration, SQL behavior changes, or production publication.
