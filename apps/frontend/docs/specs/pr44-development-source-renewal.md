# PR44 development integration: limited source renewal

The three shared spot/input sources preserve the latest scoped dataset factory while restoring PR44's 407 heads-up terminals after multiway preflop action histories. Independent read-only review by **Codex mobile_base_review** found no blocking defect in this limited change. Approval applies to the exact source records below, conditional on their official receipt binding and the unchanged restore/delivery gates. It does not renew the original Astra strategy/data-quality approval.

The compared PR44 head is `70137c0d833c3c9f2bd2301bad5d68ce99ec51d9`; the integrated development base is `7df430ef0e92a6b9fd237d89739045aec012e5b1`. All evidence was captured from the merged working files before the final binding. No dataset authoring, sampling, policy generation, production write, authentication bypass or gate modification occurred.

## Exact identity delta

The original PR44 receipt contained 113 sources and the latest development receipt contained 103. The integrated static graph and merged inventory contain **114 sources**. Official `reviewedSourcePaths()` and `fileRecord()` on Node **24.19.0** confirm **114 → 114**, **three modified**, **111 unchanged**, **zero added or removed** relative to that merged inventory. The factory source remains included; no graph edge or source record was excluded.

| Path | Bytes | Reviewed SHA-256 |
| --- | ---: | --- |
| `apps/frontend/scripts/postflop-ai/browser-inputs.ts` | 13,187 | `5818d403ac9584f3713253f4875589e8bbf77695a2b66cd6bcc0bb2de9f55222` |
| `apps/frontend/scripts/postflop-ai/spots-core.ts` | 13,653 | `1ffb6e68f09454fbca281565bc51f92ca4955778e5aca1d0685dee8acd58e599` |
| `apps/frontend/scripts/postflop-ai/spots.ts` | 769 | `287da692988f818a45c836fcae75f6ecfcea29d64a8077a41438a066dd55e5db` |

The prior recorded content identity is `0a61cc6d1c46a549445baf76bb1f1c1ee620a4798dff4abd7867cdacdaa98619`. The exact current artifact/source/archive tuple produces **`d3b8469cb40270067303a1c69fb27c67d7e1686f94f9edf14c552ab1f526102d`** through the official hash formula. The captured merged receipt's stale source records produce `592dd161bea4cde9356b56d761604714a8d77817afa838b5b277dadb7b0d02f2`; that value must not be used to bind the current sources.

## Scoped injection and complete geometry/input parity

`spots-core.ts` owns `createPostflopSpots(datasets)` and reads only its supplied dataset map for legacy reach and size geometry. PR44's persisted 407-terminal catalog, types and exact action-history lookup move into that factory without changing their recorded values or matching rules. `spots.ts` retains the existing browser/Node compatibility wrapper. Its shared registry read does not enter the server's factory path.

The only executable change to PR44 `browser-inputs.ts` is importing the factory from `spots-core.ts` and selecting the spot through `createPostflopSpots(datasets).spotById(spotId)`. The downstream source validation, action products, JSON property order and fingerprint formulas remain unchanged. A type-only import from the wrapper remains a bound provenance edge and is erased at runtime.

Actual original Git source functions and integrated functions were executed read-only with Node 24.19.0. Native TypeScript stripping was used only to load the original source in memory, and relative imports resolved to unchanged dependencies. Strict deep equality establishes:

- **456/456** integrated spot geometries equal the original PR44 catalog; the **407** extended HU terminals remain present.
- **49/49** legacy geometries equal the latest development factory.
- **452/452** reachable complete `buildInputs()` bodies, including `seatRows`, `sources`, configuration and fingerprints, equal original PR44 outputs. The other **four** remain unreachable.
- After the original shared registry loaded dataset A, injecting a separate dataset B with BB-vs-BTN call reach set to zero still produced an unreachable spot and rejected `buildInputs()`. Dataset A's output stayed identical afterward. A missing injected extended-HU source also failed validation. The injected path therefore does not borrow a stale shared-registry value.

The temporarily missing `continuation-responses.json` was read directly from the bound archive into memory for parity proof; the reviewer did not restore or write it.

## Preserved delivered bytes and continuation identity

Independent hashing checked all **1,888** artifact payloads against the original PR44 receipt and original Git/LFS provenance: **274** current raw files plus **1,614** archive members, **79,002,248** bytes in total, **zero mismatches**. The receipt's artifact records and archive record remain identical. This proves delivered bytes; the 1,614 archive members were not yet materialized as raw working files at review time.

The materialized archive remains **1,747,857 bytes**, SHA-256 **`b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`**, matching the committed LFS payload oid. The Git blob for that archive is its LFS pointer, not the payload. Official `decodeReviewedArchive()` independently accepted all **1,614** entries and **43,276,102** decoded bytes without restoring them.

Official `continuationReasonFingerprint()` recomputed **`b3538b0c44f04016e57d6eb76802665cf405d65f87e856b9860ed8a479065e53`**, unchanged. Counts remain **catalog 3,115 / saved 1,611 / unreachable 1,504 / hands 272,259**.

All **22** receipted MW3 `current_path` sources remain byte-identical to PR44 and match their exact current-byte/current-SHA records. The MW3 receipt, proposal, adapter and three supporting evidence files also remain byte-identical. Historical compatibility snapshots are distinct from these current-path records; this check did not redefine either identity target.

## Evidence and remaining checks

Read-only proof files in the integration workspace's sibling `pr44-integration-evidence/` directory:

- `mobile-renewal-official-identity.json`: official graph, three exact records, strict archive decode, recomputed continuation fingerprint/counts and prospective content identity.
- `mobile-renewal-geometry-input-parity.json`: every compared spot and reachable input fingerprint/body digest, plus injected-scope failure checks.
- `mobile-renewal-data-hashes.json`: complete artifact/archive and 22-source byte evidence.
- `mobile-renewal-source-graph.json`: independent reconstruction of the same static graph and before/after records.

The primary integrator owns the final receipt write and must preserve every original data-quality field, finding/advisory, baseline, original review attribution and limitation while appending this source-only renewal. Final strict restore, delivery verification, types/tests/build, required CI and coordinated browser QA remain separate checks. This review does not claim final-head CI, production play, production CPU, remote rollback, GTO/EV quality or renewed full-suite success. Existing approval limitations remain applicable.
