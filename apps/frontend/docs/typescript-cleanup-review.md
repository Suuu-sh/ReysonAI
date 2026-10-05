# TypeScript cleanup: independent runtime-source review

Date: 2026-10-05. Comparison baseline: `769a6dc`. Working-tree review; not a review of a final commit or deployment.

## Runtime findings

No blocking behavior findings in the independently reviewed runtime conversion:

- `scripts/postflop-ai/tree.mjs`, `later-tree.mjs` and `flop-isomorphism.mjs` became `.ts` files with explicit, erasable types. Their executable code is unchanged.
- Both versions were transformed using the same installed esbuild, TS loader, ESNext/ESM output and whitespace minimization, normalizing only the relocated `./tree.ts` import to `./tree.mjs`. Outputs were byte-identical: 4,262 / 3,874 / 3,002 bytes respectively.
- The 42 changed import-reference files in frontend scripts, application, tests and backend were compared with the same transform, normalizing the three relocated module names. All 42 executable outputs were identical. No old `.mjs` references remain in the inspected source/test directories.
- Tree action ordering, sizing validation, terminal/error handling, suit permutation ordering, canonical keys, remapping, cached representative construction and `ISOMORPHISM_VERSION` are therefore unchanged.
- `flop-base-core.mjs` identity construction and freshness checks differ only by imports; generator/evaluator/isomorphism/defence versions, policy/source hashes, seed and samples are unchanged. The pilot JSON and package lock have no baseline diff. No strategy data, policy or cache identity renewal is justified by this conversion.
- `package.json` adds focused components/runtime checks after the existing typecheck; it changes no dependency, build, generation, publishing or deployment command. `tsconfig.runtime.json` uses strict, no-emit, erasable-syntax checking for the three modules.

## Bound identity findings

Reviewed `scripts/lib/reviewed-preflop.mjs` and repository-root `configs/multiway-preflop-stage2.review.json`. Independently reproduced the verifier's static import-graph collection and SHA-256/byte records, without generating data or modifying the manifest:

- Sources: **86 → 87 records**; **13 modified**, **3 removed**, **4 added**, **70 unchanged**. Thus 16 prior bound records require replacement/removal; 20 distinct paths differ across the before/after sets (17 resulting changed/new records).
- Removed: the three runtime `.mjs` modules. Added: their `.ts` replacements plus `src/components/action-format.ts`.
- Modified: `package.json`; postflop `defence.mjs`, `engine.mjs`, `flop-base-core.mjs`, `flop-base-d1.mjs`, `flop-ui-facts.mjs`, `generate.mjs`, `later-policy.mjs`, `policy.mjs`, `simulation.mjs`, `spots.mjs`, `views.mjs`; and `src/data.ts`.
- All **1,888 artifact records** match the existing manifest exactly by path, byte length and SHA-256.
- LFS archive matches exactly: 1,747,857 bytes; SHA-256 `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`.
- Existing continuation `source_fingerprint` is `b3538b0c44f04016e57d6eb76802665cf405d65f87e856b9860ed8a479065e53`. It was not recomputed in this review; all bound strategy/fingerprint policy files and delivered data were unchanged.

## Decision and limitations

Source-only identity refresh is justified for the runtime conversion and typecheck-command changes above. **Complete independent approval is conditional on a separate reviewer checking `src/data.ts` and the new `src/components/action-format.ts`: this reviewer implemented that helper extraction and cannot independently approve it.** The existing manifest correctly fails identity checks until the fully reviewed graph/hashes and overall content hash are refreshed.

Keep original artifacts, archive, counts, source fingerprint, Astra/strategy-quality review metadata, findings, advisories and limitations intact. Record any source-only amendment separately; do not reinterpret this as new data-quality approval.

No manifest edits, artifact generation, publication, production checks, full delivery/rollback checks or deployment occurred. Existing successful tests were not rerun by this reviewer. Executable parity does not prove final-head CI, whole-delivery rollback, Node/runtime availability on every supported host or live product behavior.

## Primary review and integration

The primary agent independently inspected the helper extraction: `label` retains the aliases and fallback text; `color` retains the existing action colours and null/unknown fallback; `pct` retains finite-number formatting and the missing-value label. `data.ts` re-exports the helpers for existing consumers and keeps calculation logic unchanged. The primitive prop annotations and typed animation style retain their rendered DOM. This resolves the conditional helper-review requirement above.

Integration checks: expanded `npm run typecheck` and production build passed; four backend postflop route tests passed. Earlier focused tests passed: 48 runtime, 5 cards, 20 service-site, 7 data and 4 primitives. The shared card preserves the four existing surface-specific DOM variants. The root checkout build reported an unrelated existing trainer CSS syntax warning and the existing large-chunk advisory; CSS was not changed by this cleanup.

Only source records and the aggregate content hash may be refreshed, with a separate source-only amendment. Original data/strategy approval, artifact and archive identities, counts and source fingerprint remain authoritative. Remaining JavaScript scripts and broader application type coverage are intentionally deferred to later cleanup steps.

The continuation fingerprint was recomputed and matches the preserved value. After the source-only amendment, the committed-review-manifest gate test passed (1/1). Local service-site and Range startup were checked in the browser; authenticated Trainer interaction was not verified because the local sign-in service was unavailable.
