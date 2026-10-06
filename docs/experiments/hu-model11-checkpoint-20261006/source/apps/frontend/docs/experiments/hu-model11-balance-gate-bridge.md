# Model11 balance gate bridge checkpoint

This separate checkpoint extends e51db8e8e478665a6b00e5e4eebdf3a16846a640 in an independent worktree. The e51 execution checkpoint and its runtime evidence remain separate. This bridge is static implementation only until fresh bounded tests run. It does not claim representative 72×10,000 or 1,755-board acceptance, runtime feasibility, policy approval or production adoption.

## Preserved old gate source and exact inherited kernel

The original `balance.mjs` is unchanged, SHA256 `27976f9a3de6e5092bfd0f02fa7732fa33861c28621162cda0f275201e03a637`. Directly adding optional injection there would change old acceptance source identities, even with identical default numerics. Instead, `balance-model11-kernel.mjs` is a mechanical additive copy, SHA256 `6192350ae7209cd4a4b9c7316d5c75c2811f8dd96cb12b9a304be2af6d736431`.

The complete allowed transformation is pinned in `tests/fixtures/model11-balance-kernel-correspondence.json`: remove the unused imported `defenceFor`; add `defenceFactory` to each of the two existing option signatures; replace exactly the two factory calls. There is also a fixed two-line provenance header. Every other byte is unchanged, including all thresholds, finding severities, authored-override checks, role-copy checks, physical deduplication, four-turn/three-river sampling, representative flop/turn paths, null geometry handling and aggregation order.

`verify-model11-balance-kernel.py` reconstructs the entire generated module and verifies source/kernel pins. Three Python tests pass: exact correspondence; deliberate threshold-mutation rejection; and byte equality of every transitive old `cli.mjs`, `board-worker.mjs` and `audit-all-boards.mjs` dependency against e51. Old acceptance identities are not changed or reassigned.

## Facade semantics

`createModel11BalanceFacade` supplies the four strategy-dependent surfaces expected by the inherited kernel:

- `rangeItems`: obtains dense effective own-realization weights through `rangeState({board,path}, seat)` and iterates the original saved combo order, preserving inherited aggregation order.
- `observableMix`: ignores the saved mix argument and returns the exact `execution.law({board,path}, ownCombo).physicalMass`. The inherited kernel pads hidden alias labels with zeros. It does not resample or reapply caps.
- `context` / `requirement`: use the new experiment-only `requirementState({board,path})`, which calls the actual effective core context and inherited geometry calculation. No fake context is returned.

Only public request data reaches the effective core. The facade verifies pending actor/node and full public pot/stack/invested geometry against canonical replay. It cannot accept a stale engine table or hidden actual profile as belief.

`requirementState` distinguishes `not-facing`, `effective-facing-context` and `opponent-empty`. It also retains full-product support status and both own/opponent totals. Positive support with unavailable ordinary equity is not treated as a missing context; per-combo law status retains the existing saved/capped fallback and is counted in prefix coverage. Exact incompatibility remains explicit in support status; it is not silently converted to positive compatible support. Historical exact-zero observed action remains the typed `off-model-observed-action` error. The API extension does not alter law identity, sampling order, fallback rules or the pinned numerical schedule.

A typed off-model error is never returned as `null` to trigger an old skip. It escapes the inherited kernel. `checkModel11Balance` marks that street stage incomplete, adds a severity-error `model11-off-model-coverage` finding, records the exact stopping request/node/method, and returns `blocked-off-model-coverage`. Other requested street stages can still be evaluated independently. A stopped stage does not claim complete findings; its unvisited suffix remains a coverage gap. Other numeric/source errors fail the run.

## Explicit selected-board entry

`evaluate-model11-gate.mjs` reads an explicit artifact pair and `{boardList,street,authored}` plan. It captures a separately versioned new gate source graph and all twelve raw input hashes before and after evaluation, writes only an exclusive new result, records process elapsed/RSS/heap observations, and exits nonzero for incomplete coverage or quality errors. It does not alter old audit or acceptance loaders. The result still says final acceptance is not evaluated.

The first declared plan is one flop only, using inherited complete flop representative-node coverage. It is deliberately more work than the e51 single-prefix summary. After source preservation, independent review and shared Node-lane authorization, run from `apps/frontend`:

```sh
timeout -k 5s 180s node --max-old-space-size=512 scripts/postflop-ai/evaluate-model11-gate.mjs \
  --spot BTN_open_SB_3bet_BB_call_BTN_fold \
  --flop .local/postflop-ai/btn-open-sb-3bet-bb-call-btn-fold-hu-v1-policy.json \
  --later .local/postflop-ai/btn-open-sb-3bet-bb-call-btn-fold-hu-v1-later-policy.json \
  --plan tests/fixtures/model11-one-flop-gate-plan.json \
  --output .local/hu-model11-gate-runs/one-flop.json
```

The output directory must already exist. Reuse the e51 ten-envelope fixture archive, with its exact manifest verification. The bridge tests in `postflop-model11-gate.test.mjs` have separate selectors for facade law/range-order/stale-geometry behavior, real effective requirements, and a deliberately all-check policy counterexample that must block on zero-likelihood bet coverage. Each numerical selector is a separate 180-second / 512-MiB old-heap diagnostic. No Node/parser/test/simulation was run while preparing this bridge. The heap cap is not an RSS cap; resource costs remain unmeasured.

## Remaining full-gate work

This closes the source-level strategy connection to the unchanged balance conditions; it does not close runtime validation. Still required: fresh facade/kernel equivalence controls and positive-unavailable/empty/incompatible coverage checks; measured bounded flop and later workloads; a model11 representative audit enforcing all 72 expected cells at 10,000 samples, resolved counts, legality, deterministic numerical replay and reference-zero-drift; a model11 all-1,755/all-street driver with unchanged inherited coverage, strict completeness and immutable checkpoint identities; separate acceptance/source/archive contracts and independent review. The current model10 1/407 and original45 evidence remains separate and untouched. No full workload should start before the bounded measurements justify it.
