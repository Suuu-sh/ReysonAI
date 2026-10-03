# Multiway preflop stage 1 result

## Result

Implemented and locally published by exactly one final pipeline execution. No merge or production deployment.

For this task, the user's latest direction excludes the existing opening benchmarks from both reference use and acceptance criteria. The result is an Astra-authored estimate assessed for consistency with the existing saved ranges, action reach, fixed sizes, shared call-EV policy and saved reasons; it is not a solver-quality guarantee.

- Branch: `feat/multiway-preflop-stage1`
- Original remote development baseline: `c39e03651f32e575bc593680a7b6be64dd1ff0a1` (2026-10-03 19:26:53 UTC)
- Implementation commit: `f15f10333bb3d451fd541ddd8f9fb2c0c0048fae`. Its prerequisites are `b4090cab0e7952a7faa5504000be28cf036a3957` (.gitignore only) and `e02b40ab894b9d7e73395d2672a395ba35702d72` (five user-supplied opening benchmarks). Those files remain intact; their values are excluded from this task's reference use and acceptance criteria.
- One checkout, working in apps/frontend. Source blob, tree and initial commit IDs were verified through the authorized GitHub connector; no credentials were extracted.
- User-approved model exception: Astra authoring and independent Astra review were used for this task. All other range-author instructions were followed.

## Verification

| Check | Result |
|---|---|
| multiway | 20/20, missing 0 |
| squeeze | 60/60, missing 0 |
| multiway_two_callers | 15/15, missing 0 |
| cold_four_bet | 40/40, missing 0 |
| Audit | 0 findings; range-capped 0, over-segregated 0, EV/order/flow/overfold violations 0 |
| Existing-range consistency | Incoming saved-action ranges, unreachable placeholders, fixed legal sizes, shared call-EV decisions and saved-frequency reasons checked |
| Final pipeline | changed; 1/1 iteration, existing changed spots 0, new spots 87 |
| Protected frequencies | Eight existing HU/limp/cold-3bet datasets unchanged against original development |
| TypeScript | npm run typecheck passed |

Initial full test command: `node --test tests/*.test.mjs`.

- tests 452
- pass 436
- fail 8
- cancelled 0
- skipped 8
- duration_ms 177358.420499

The eight failed files alone were rechecked with `--test-concurrency=1 --test-reporter=tap` after the build completed. Six existing postflop files initially failed at process level without assertion/signal diagnostics; their unchanged tests passed in the serial retry. The old range-url test was narrowed explicitly to its unchanged twelve UI-supported histories (all original round-trip cases retained; new data-only histories have dedicated dataset coverage). The initial Sites packaging assertion ran before build output existed; it passed after the successful build. Eight initial skips concern unavailable optional local postflop fixtures. No preflop frequencies or generation were changed for the retry.

Failed-file recheck:

- tests 60
- pass 60
- fail 0
- cancelled 0
- skipped 0
- duration_ms 345854.132063

There are no outstanding test failures after the targeted recheck. `npm run build` also passed (only the existing large-bundle advisory).

The pipeline's `changed` state means new datasets/spots were added on its single authorized iteration, not an audit failure. It regenerated reason-facts and all detailed reasons from the final saved frequencies.

## Authoring decisions and assumptions

- Fixed 6max / 100BB / no ante / rake 5% capped at 3BB, no flop no drop. Sizes never vary by hand. Generators author candidate hand-group frequencies; the shared EV policy and consistency reconciliation select calls. These are AI estimates, not solver equilibria. The 87 new spots were not tuned to external benchmark values.
- Stage 1a was completed before stage 1b. Nonblind overcalls use existing seats-behind cold-call squeeze risk and offsuit EQR discounts. All seats behind a squeezer are assumed to fold before reopened responses.
- Four first-caller-SB histories and their twelve squeeze responses are unreachable while saved SB versus-open calls are zero. They retain fold100 placeholders and explicit unreachable reasons with null hand facts; no empty-range equity is invented.
- The approved exception sets the response to a CO/BTN 12BB squeeze to a fixed 26BB 4bet. Existing HU OOP 20BB would be below the 21.5BB legal minimum in those histories. Existing HU and blind-squeeze sizes are unchanged; the validator and tests enforce the minimum raise.
- Two-caller decisions use opener.open, first caller's heads-up call, and second caller's conditional one-caller multiway call. In particular an SB second caller is reachable through its protected multiway flat even though its heads-up flat is zero. Two-caller squeezes are 14.5BB IP or 15.5BB OOP, using the configured increment. All fifteen histories are currently reachable.
- Four-way realization is the existing category EQR × 0.90² plus the relevant existing seats-behind discount. Python/TypeScript exhaustive parity is tested.
- Cold-4bet decisions include the opener with the original 3bettor behind (additional EQR ×0.85), then the original 3bettor only after the opener folds. Opponent range is the saved cold-4bet frequency. Prior reach is saved open or 3bet respectively. Opener-call/shove continuations remain outside this stage. Five-bets are only total 100BB all-ins.
- Four-bet pots do not receive automatic positive-EV fill; only legal positive-EV calls may be added minimally to meet the joint fold-rate audit. A candidate premium flat can disappear under the EV model: e.g. UTG_vs_CO_cold4bet_HJ3bet KK has call EV −1.0566BB and therefore call0 / all-in65 / fold35. No negative-EV call was restored to force a preferred premium shape.
- UI files and runtime action-path integration were not changed. The new persisted datasets are registered for generation, audits, reasons, fingerprints, admin coverage and dataset loading.
- Only the five approved opening benchmark JSON paths were unignored. Other .local caches and private data remain ignored. Their actual files were supplied from the user's existing repository and verified against the remote blobs.

## Task-specific benchmark exclusion (2026-10-03)

The earlier comparison of existing opening aggregates was a reference check that is not adopted for this task and is not a quality guarantee. It is not used to judge or justify the new ranges.

The four stage-1 generators read saved predecessor ranges, sizing configuration and the shared call policy, not benchmark files. `scripts/lib/benchmark.mjs` compares aggregate actions only for an exact reference spot ID and does not write frequencies. The five reference IDs are existing opening spots (`UTG_open`, `HJ_open`, `CO_open`, `BTN_open`, `SB_open`); none overlaps the 87 additions recorded by the final pipeline. The build/pipeline generation and audit path does not import the benchmark comparison. The completed authoring work did not adjust any new frequency to match those values.

This clarification changes only this result document. All previously published implementation/data files still match their recorded blob hashes. No frequency regeneration, test rerun or additional pipeline execution was needed. Existing saved ranges remain the source of incoming action reach and consistency checks. The general benchmark tooling and the five existing reference files have not been removed or disabled.

## Per-spot combo-weighted actions

Percentages below are conditional on each spot's incoming saved range: hand combos × prior-action reach. “Raise” is squeeze, 4bet or 100BB 5bet according to the dataset. Zero-reach rows show the fold100 placeholder convention, not a playable recommendation.

### One caller

| Spot | Incoming combos | Fold % | Call % | Raise % |
|---|---:|---:|---:|---:|
| BB_vs_UTG_HJcall | 1326.00 | 83.62 | 13.35 | 3.03 |
| BB_vs_UTG_COcall | 1326.00 | 82.93 | 14.03 | 3.03 |
| BB_vs_UTG_BTNcall | 1326.00 | 81.95 | 15.04 | 3.02 |
| BB_vs_HJ_COcall | 1326.00 | 79.12 | 16.98 | 3.90 |
| BB_vs_HJ_BTNcall | 1326.00 | 77.67 | 18.43 | 3.90 |
| BB_vs_CO_BTNcall | 1326.00 | 75.90 | 18.86 | 5.23 |
| SB_vs_UTG_HJcall | 1326.00 | 95.96 | 1.35 | 2.69 |
| SB_vs_UTG_COcall | 1326.00 | 95.88 | 1.35 | 2.77 |
| SB_vs_UTG_BTNcall | 1326.00 | 95.26 | 1.82 | 2.92 |
| SB_vs_HJ_COcall | 1326.00 | 94.45 | 2.00 | 3.55 |
| SB_vs_HJ_BTNcall | 1326.00 | 93.79 | 2.61 | 3.60 |
| SB_vs_CO_BTNcall | 1326.00 | 92.32 | 2.81 | 4.88 |
| CO_vs_UTG_HJcall | 1326.00 | 95.35 | 1.86 | 2.79 |
| BTN_vs_UTG_HJcall | 1326.00 | 94.64 | 2.55 | 2.81 |
| BTN_vs_UTG_COcall | 1326.00 | 94.82 | 2.32 | 2.86 |
| BTN_vs_HJ_COcall | 1326.00 | 93.07 | 3.39 | 3.54 |
| BB_vs_UTG_SBcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| BB_vs_HJ_SBcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| BB_vs_CO_SBcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| BB_vs_BTN_SBcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |

### Squeeze response

| Spot | Incoming combos | Fold % | Call % | Raise % |
|---|---:|---:|---:|---:|
| UTG_vs_BB_squeeze_HJcall | 212.50 | 76.19 | 12.80 | 11.01 |
| UTG_vs_BB_squeeze_COcall | 212.50 | 73.36 | 15.62 | 11.01 |
| UTG_vs_BB_squeeze_BTNcall | 212.50 | 73.55 | 15.44 | 11.01 |
| HJ_vs_BB_squeeze_COcall | 312.00 | 70.83 | 21.09 | 8.08 |
| HJ_vs_BB_squeeze_BTNcall | 312.00 | 72.76 | 19.17 | 8.08 |
| CO_vs_BB_squeeze_BTNcall | 389.00 | 72.34 | 20.33 | 7.33 |
| UTG_vs_SB_squeeze_HJcall | 212.50 | 80.47 | 8.05 | 11.48 |
| UTG_vs_SB_squeeze_COcall | 212.50 | 80.47 | 8.05 | 11.48 |
| UTG_vs_SB_squeeze_BTNcall | 212.50 | 74.87 | 13.65 | 11.48 |
| HJ_vs_SB_squeeze_COcall | 312.00 | 82.50 | 9.42 | 8.08 |
| HJ_vs_SB_squeeze_BTNcall | 312.00 | 81.54 | 10.38 | 8.08 |
| CO_vs_SB_squeeze_BTNcall | 389.00 | 73.62 | 19.05 | 7.33 |
| UTG_vs_CO_squeeze_HJcall | 212.50 | 81.65 | 6.64 | 11.72 |
| UTG_vs_BTN_squeeze_HJcall | 212.50 | 81.65 | 6.64 | 11.72 |
| UTG_vs_BTN_squeeze_COcall | 212.50 | 83.06 | 5.22 | 11.72 |
| HJ_vs_BTN_squeeze_COcall | 312.00 | 84.36 | 6.79 | 8.85 |
| UTG_vs_BB_squeeze_SBcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| HJ_vs_BB_squeeze_SBcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| CO_vs_BB_squeeze_SBcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| BTN_vs_BB_squeeze_SBcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| HJ_vs_BB_squeeze_UTGfold | 56.70 | 27.37 | 66.14 | 6.49 |
| CO_vs_BB_squeeze_UTGfold | 68.80 | 30.09 | 62.30 | 7.62 |
| BTN_vs_BB_squeeze_UTGfold | 93.70 | 39.43 | 53.37 | 7.19 |
| CO_vs_BB_squeeze_HJfold | 83.10 | 26.86 | 66.87 | 6.27 |
| BTN_vs_BB_squeeze_HJfold | 121.60 | 36.05 | 58.11 | 5.84 |
| BTN_vs_BB_squeeze_COfold | 145.80 | 43.25 | 51.41 | 5.34 |
| HJ_vs_SB_squeeze_UTGfold | 56.70 | 43.92 | 49.59 | 6.49 |
| CO_vs_SB_squeeze_UTGfold | 68.80 | 47.85 | 44.53 | 7.62 |
| BTN_vs_SB_squeeze_UTGfold | 93.70 | 52.68 | 40.13 | 7.19 |
| CO_vs_SB_squeeze_HJfold | 83.10 | 42.58 | 51.16 | 6.27 |
| BTN_vs_SB_squeeze_HJfold | 121.60 | 52.91 | 41.25 | 5.84 |
| BTN_vs_SB_squeeze_COfold | 145.80 | 44.24 | 49.81 | 5.95 |
| HJ_vs_CO_squeeze_UTGfold | 56.70 | 79.42 | 13.22 | 7.36 |
| HJ_vs_BTN_squeeze_UTGfold | 56.70 | 79.37 | 13.27 | 7.36 |
| CO_vs_BTN_squeeze_UTGfold | 68.80 | 78.01 | 13.35 | 8.64 |
| CO_vs_BTN_squeeze_HJfold | 83.10 | 66.94 | 26.25 | 6.81 |
| SB_vs_BB_squeeze_UTGfold | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| SB_vs_BB_squeeze_HJfold | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| SB_vs_BB_squeeze_COfold | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| SB_vs_BB_squeeze_BTNfold | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| HJ_vs_BB_squeeze_UTGcall | 56.70 | 90.93 | 5.32 | 3.75 |
| CO_vs_BB_squeeze_UTGcall | 68.80 | 90.06 | 5.22 | 4.72 |
| BTN_vs_BB_squeeze_UTGcall | 93.70 | 91.10 | 4.47 | 4.43 |
| CO_vs_BB_squeeze_HJcall | 83.10 | 84.31 | 11.88 | 3.81 |
| BTN_vs_BB_squeeze_HJcall | 121.60 | 87.83 | 9.13 | 3.04 |
| BTN_vs_BB_squeeze_COcall | 145.80 | 88.07 | 9.73 | 2.21 |
| HJ_vs_SB_squeeze_UTGcall | 56.70 | 95.41 | 0.85 | 3.75 |
| CO_vs_SB_squeeze_UTGcall | 68.80 | 94.06 | 1.22 | 4.72 |
| BTN_vs_SB_squeeze_UTGcall | 93.70 | 91.04 | 4.53 | 4.43 |
| CO_vs_SB_squeeze_HJcall | 83.10 | 93.30 | 2.89 | 3.81 |
| BTN_vs_SB_squeeze_HJcall | 121.60 | 94.69 | 2.27 | 3.04 |
| BTN_vs_SB_squeeze_COcall | 145.80 | 88.07 | 9.73 | 2.21 |
| HJ_vs_CO_squeeze_UTGcall | 56.70 | 93.58 | 0.85 | 5.57 |
| HJ_vs_BTN_squeeze_UTGcall | 56.70 | 93.58 | 0.85 | 5.57 |
| CO_vs_BTN_squeeze_UTGcall | 68.80 | 92.40 | 1.22 | 6.38 |
| CO_vs_BTN_squeeze_HJcall | 83.10 | 95.03 | 0.58 | 4.39 |
| SB_vs_BB_squeeze_UTGcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| SB_vs_BB_squeeze_HJcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| SB_vs_BB_squeeze_COcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |
| SB_vs_BB_squeeze_BTNcall | 0.00 (unreachable) | 100.00 | 0.00 | 0.00 |

### Two callers

| Spot | Incoming combos | Fold % | Call % | Raise % |
|---|---:|---:|---:|---:|
| BTN_vs_UTG_HJcall_COcall | 1326.00 | 96.62 | 0.68 | 2.70 |
| SB_vs_UTG_HJcall_COcall | 1326.00 | 96.86 | 0.54 | 2.59 |
| BB_vs_UTG_HJcall_COcall | 1326.00 | 93.67 | 3.77 | 2.56 |
| SB_vs_UTG_HJcall_BTNcall | 1326.00 | 96.77 | 0.63 | 2.59 |
| BB_vs_UTG_HJcall_BTNcall | 1326.00 | 93.03 | 4.41 | 2.56 |
| BB_vs_UTG_HJcall_SBcall | 1326.00 | 95.84 | 1.86 | 2.30 |
| SB_vs_UTG_COcall_BTNcall | 1326.00 | 96.86 | 0.54 | 2.59 |
| BB_vs_UTG_COcall_BTNcall | 1326.00 | 93.21 | 4.24 | 2.56 |
| BB_vs_UTG_COcall_SBcall | 1326.00 | 95.95 | 1.75 | 2.30 |
| BB_vs_UTG_BTNcall_SBcall | 1326.00 | 95.65 | 2.05 | 2.30 |
| SB_vs_HJ_COcall_BTNcall | 1326.00 | 96.55 | 0.61 | 2.84 |
| BB_vs_HJ_COcall_BTNcall | 1326.00 | 91.06 | 5.97 | 2.97 |
| BB_vs_HJ_COcall_SBcall | 1326.00 | 94.89 | 2.62 | 2.50 |
| BB_vs_HJ_BTNcall_SBcall | 1326.00 | 94.31 | 3.19 | 2.50 |
| BB_vs_CO_BTNcall_SBcall | 1326.00 | 92.97 | 4.17 | 2.86 |

### Cold 4bet response

| Spot | Incoming combos | Fold % | Call % | Raise % |
|---|---:|---:|---:|---:|
| UTG_vs_CO_cold4bet_HJ3bet | 212.50 | 90.59 | 0.71 | 8.71 |
| HJ_vs_CO_cold4bet_UTGopen | 74.70 | 64.21 | 11.08 | 24.71 |
| UTG_vs_BTN_cold4bet_HJ3bet | 212.50 | 90.59 | 0.71 | 8.71 |
| HJ_vs_BTN_cold4bet_UTGopen | 74.70 | 65.29 | 10.00 | 24.71 |
| UTG_vs_SB_cold4bet_HJ3bet | 212.50 | 88.56 | 2.73 | 8.71 |
| HJ_vs_SB_cold4bet_UTGopen | 74.70 | 51.29 | 24.00 | 24.71 |
| UTG_vs_BB_cold4bet_HJ3bet | 212.50 | 89.60 | 1.69 | 8.71 |
| HJ_vs_BB_cold4bet_UTGopen | 74.70 | 51.29 | 24.00 | 24.71 |
| UTG_vs_BTN_cold4bet_CO3bet | 212.50 | 90.59 | 0.71 | 8.71 |
| CO_vs_BTN_cold4bet_UTGopen | 72.30 | 70.03 | 6.37 | 23.60 |
| UTG_vs_SB_cold4bet_CO3bet | 212.50 | 88.66 | 2.64 | 8.71 |
| CO_vs_SB_cold4bet_UTGopen | 72.30 | 53.58 | 22.81 | 23.60 |
| UTG_vs_BB_cold4bet_CO3bet | 212.50 | 89.60 | 1.69 | 8.71 |
| CO_vs_BB_cold4bet_UTGopen | 72.30 | 53.58 | 22.81 | 23.60 |
| UTG_vs_SB_cold4bet_BTN3bet | 212.50 | 88.56 | 2.73 | 8.71 |
| BTN_vs_SB_cold4bet_UTGopen | 70.40 | 55.28 | 21.95 | 22.77 |
| UTG_vs_BB_cold4bet_BTN3bet | 212.50 | 89.60 | 1.69 | 8.71 |
| BTN_vs_BB_cold4bet_UTGopen | 70.40 | 55.28 | 21.95 | 22.77 |
| UTG_vs_BB_cold4bet_SB3bet | 212.50 | 88.56 | 2.73 | 8.71 |
| SB_vs_BB_cold4bet_UTGopen | 67.00 | 40.54 | 29.33 | 30.13 |
| HJ_vs_BTN_cold4bet_CO3bet | 312.00 | 93.43 | 0.48 | 6.09 |
| CO_vs_BTN_cold4bet_HJopen | 91.20 | 70.44 | 9.08 | 20.48 |
| HJ_vs_SB_cold4bet_CO3bet | 312.00 | 92.05 | 1.86 | 6.09 |
| CO_vs_SB_cold4bet_HJopen | 91.20 | 57.59 | 21.92 | 20.48 |
| HJ_vs_BB_cold4bet_CO3bet | 312.00 | 92.05 | 1.86 | 6.09 |
| CO_vs_BB_cold4bet_HJopen | 91.20 | 57.59 | 21.92 | 20.48 |
| HJ_vs_SB_cold4bet_BTN3bet | 312.00 | 92.05 | 1.86 | 6.09 |
| BTN_vs_SB_cold4bet_HJopen | 89.50 | 58.55 | 21.17 | 20.28 |
| HJ_vs_BB_cold4bet_BTN3bet | 312.00 | 92.05 | 1.86 | 6.09 |
| BTN_vs_BB_cold4bet_HJopen | 89.50 | 58.55 | 21.17 | 20.28 |
| HJ_vs_BB_cold4bet_SB3bet | 312.00 | 92.05 | 1.86 | 6.09 |
| SB_vs_BB_cold4bet_HJopen | 93.60 | 54.06 | 23.99 | 21.96 |
| CO_vs_SB_cold4bet_BTN3bet | 389.00 | 93.42 | 1.49 | 5.09 |
| BTN_vs_SB_cold4bet_COopen | 115.80 | 59.38 | 23.96 | 16.66 |
| CO_vs_BB_cold4bet_BTN3bet | 389.00 | 93.42 | 1.49 | 5.09 |
| BTN_vs_BB_cold4bet_COopen | 115.80 | 61.52 | 21.82 | 16.66 |
| CO_vs_BB_cold4bet_SB3bet | 389.00 | 91.11 | 3.80 | 5.09 |
| SB_vs_BB_cold4bet_COopen | 152.80 | 66.69 | 18.87 | 14.44 |
| BTN_vs_BB_cold4bet_SB3bet | 568.00 | 93.57 | 2.55 | 3.87 |
| SB_vs_BB_cold4bet_BTNopen | 222.30 | 65.96 | 23.57 | 10.47 |

## Changed files against original development

- `.gitignore`
- `apps/frontend/.local/benchmarks/BTN_open.json`
- `apps/frontend/.local/benchmarks/CO_open.json`
- `apps/frontend/.local/benchmarks/HJ_open.json`
- `apps/frontend/.local/benchmarks/SB_open.json`
- `apps/frontend/.local/benchmarks/UTG_open.json`
- `apps/frontend/benchmarks/README.md`
- `apps/frontend/docs/specs/multiway-preflop-stage1.result.md`
- `apps/frontend/scripts/apply-call-ev.mjs`
- `apps/frontend/scripts/audit-estimates.mjs`
- `apps/frontend/scripts/build-estimates.mjs`
- `apps/frontend/scripts/compose-reasons.mjs`
- `apps/frontend/scripts/eqr.py`
- `apps/frontend/scripts/generate-cold-four-bet-responses.py`
- `apps/frontend/scripts/generate-multiway-responses.py`
- `apps/frontend/scripts/generate-multiway2-responses.py`
- `apps/frontend/scripts/generate-squeeze-responses.py`
- `apps/frontend/scripts/lib/benchmark.mjs`
- `apps/frontend/scripts/lib/call-consistency.mjs`
- `apps/frontend/scripts/lib/reason-context.mjs`
- `apps/frontend/scripts/pipeline.mjs`
- `apps/frontend/scripts/range.mjs`
- `apps/frontend/scripts/reason-facts.mjs`
- `apps/frontend/scripts/sizing_rules.py`
- `apps/frontend/src/admin/coverage.ts`
- `apps/frontend/src/estimated/AGENTS.md`
- `apps/frontend/src/estimated/audit.ts`
- `apps/frontend/src/estimated/call-equities.json`
- `apps/frontend/src/estimated/call-ev-report.json`
- `apps/frontend/src/estimated/call-ev.ts`
- `apps/frontend/src/estimated/cold-four-bet-responses.json`
- `apps/frontend/src/estimated/cold-four-bet-responses.ts`
- `apps/frontend/src/estimated/datasets.ts`
- `apps/frontend/src/estimated/eqr.ts`
- `apps/frontend/src/estimated/multiway-responses.json`
- `apps/frontend/src/estimated/multiway-responses.ts`
- `apps/frontend/src/estimated/multiway2-responses.json`
- `apps/frontend/src/estimated/multiway2-responses.ts`
- `apps/frontend/src/estimated/reasons/BB_vs_BTN.json`
- `apps/frontend/src/estimated/reasons/BB_vs_BTN_3bet_COopen.json`
- `apps/frontend/src/estimated/reasons/BB_vs_BTN_3bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/BB_vs_BTN_3bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/BB_vs_BTN_SBcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_BTN_four_bet.json`
- `apps/frontend/src/estimated/reasons/BB_vs_CO.json`
- `apps/frontend/src/estimated/reasons/BB_vs_CO_3bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/BB_vs_CO_3bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/BB_vs_CO_BTNcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_CO_BTNcall_SBcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_CO_SBcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_CO_four_bet.json`
- `apps/frontend/src/estimated/reasons/BB_vs_HJ.json`
- `apps/frontend/src/estimated/reasons/BB_vs_HJ_3bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/BB_vs_HJ_BTNcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_HJ_BTNcall_SBcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_HJ_COcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_HJ_COcall_BTNcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_HJ_COcall_SBcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_HJ_SBcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_HJ_four_bet.json`
- `apps/frontend/src/estimated/reasons/BB_vs_SB.json`
- `apps/frontend/src/estimated/reasons/BB_vs_SB_3bet_BTNopen.json`
- `apps/frontend/src/estimated/reasons/BB_vs_SB_3bet_COopen.json`
- `apps/frontend/src/estimated/reasons/BB_vs_SB_3bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/BB_vs_SB_3bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/BB_vs_SB_four_bet.json`
- `apps/frontend/src/estimated/reasons/BB_vs_SB_limp.json`
- `apps/frontend/src/estimated/reasons/BB_vs_SB_limp_five_bet.json`
- `apps/frontend/src/estimated/reasons/BB_vs_SB_limp_reraise.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_BTNcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_BTNcall_SBcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_COcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_COcall_BTNcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_COcall_SBcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_HJcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_HJcall_BTNcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_HJcall_COcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_HJcall_SBcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_SBcall.json`
- `apps/frontend/src/estimated/reasons/BB_vs_UTG_four_bet.json`
- `apps/frontend/src/estimated/reasons/BTN_open.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_cold4bet_COopen.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_cold4bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_cold4bet_SB3bet.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_cold4bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_five_bet.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_squeeze_COcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_squeeze_COfold.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_squeeze_HJcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_squeeze_HJfold.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_squeeze_SBcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_squeeze_UTGcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_squeeze_UTGfold.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_BB_three_bet.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_CO.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_CO_3bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_CO_3bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_CO_four_bet.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_HJ.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_HJ_3bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_HJ_COcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_HJ_four_bet.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_cold4bet_COopen.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_cold4bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_cold4bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_five_bet.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_squeeze_COcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_squeeze_COfold.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_squeeze_HJcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_squeeze_HJfold.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_squeeze_UTGcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_squeeze_UTGfold.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_SB_three_bet.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_UTG.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_UTG_COcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_UTG_HJcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_UTG_HJcall_COcall.json`
- `apps/frontend/src/estimated/reasons/BTN_vs_UTG_four_bet.json`
- `apps/frontend/src/estimated/reasons/CO_open.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_cold4bet_BTN3bet.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_cold4bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_cold4bet_SB3bet.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_cold4bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_five_bet.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_squeeze_BTNcall.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_squeeze_HJcall.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_squeeze_HJfold.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_squeeze_SBcall.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_squeeze_UTGcall.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_squeeze_UTGfold.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BB_three_bet.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BTN_cold4bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BTN_cold4bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BTN_five_bet.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BTN_squeeze_HJcall.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BTN_squeeze_HJfold.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BTN_squeeze_UTGcall.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BTN_squeeze_UTGfold.json`
- `apps/frontend/src/estimated/reasons/CO_vs_BTN_three_bet.json`
- `apps/frontend/src/estimated/reasons/CO_vs_HJ.json`
- `apps/frontend/src/estimated/reasons/CO_vs_HJ_3bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/CO_vs_HJ_four_bet.json`
- `apps/frontend/src/estimated/reasons/CO_vs_SB_cold4bet_BTN3bet.json`
- `apps/frontend/src/estimated/reasons/CO_vs_SB_cold4bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/CO_vs_SB_cold4bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/CO_vs_SB_five_bet.json`
- `apps/frontend/src/estimated/reasons/CO_vs_SB_squeeze_BTNcall.json`
- `apps/frontend/src/estimated/reasons/CO_vs_SB_squeeze_HJcall.json`
- `apps/frontend/src/estimated/reasons/CO_vs_SB_squeeze_HJfold.json`
- `apps/frontend/src/estimated/reasons/CO_vs_SB_squeeze_UTGcall.json`
- `apps/frontend/src/estimated/reasons/CO_vs_SB_squeeze_UTGfold.json`
- `apps/frontend/src/estimated/reasons/CO_vs_SB_three_bet.json`
- `apps/frontend/src/estimated/reasons/CO_vs_UTG.json`
- `apps/frontend/src/estimated/reasons/CO_vs_UTG_HJcall.json`
- `apps/frontend/src/estimated/reasons/CO_vs_UTG_four_bet.json`
- `apps/frontend/src/estimated/reasons/HJ_open.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_cold4bet_BTN3bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_cold4bet_CO3bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_cold4bet_SB3bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_cold4bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_five_bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_squeeze_BTNcall.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_squeeze_COcall.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_squeeze_SBcall.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_squeeze_UTGcall.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_squeeze_UTGfold.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BB_three_bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BTN_cold4bet_CO3bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BTN_cold4bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BTN_five_bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BTN_squeeze_COcall.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BTN_squeeze_UTGcall.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BTN_squeeze_UTGfold.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_BTN_three_bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_CO_cold4bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_CO_five_bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_CO_squeeze_UTGcall.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_CO_squeeze_UTGfold.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_CO_three_bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_SB_cold4bet_BTN3bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_SB_cold4bet_CO3bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_SB_cold4bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_SB_five_bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_SB_squeeze_BTNcall.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_SB_squeeze_COcall.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_SB_squeeze_UTGcall.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_SB_squeeze_UTGfold.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_SB_three_bet.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_UTG.json`
- `apps/frontend/src/estimated/reasons/HJ_vs_UTG_four_bet.json`
- `apps/frontend/src/estimated/reasons/SB_open.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_cold4bet_BTNopen.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_cold4bet_COopen.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_cold4bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_cold4bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_five_bet.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_iso.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_limp_four_bet.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_squeeze_BTNcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_squeeze_BTNfold.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_squeeze_COcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_squeeze_COfold.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_squeeze_HJcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_squeeze_HJfold.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_squeeze_UTGcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_squeeze_UTGfold.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BB_three_bet.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BTN.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BTN_3bet_COopen.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BTN_3bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BTN_3bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/SB_vs_BTN_four_bet.json`
- `apps/frontend/src/estimated/reasons/SB_vs_CO.json`
- `apps/frontend/src/estimated/reasons/SB_vs_CO_3bet_HJopen.json`
- `apps/frontend/src/estimated/reasons/SB_vs_CO_3bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/SB_vs_CO_BTNcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_CO_four_bet.json`
- `apps/frontend/src/estimated/reasons/SB_vs_HJ.json`
- `apps/frontend/src/estimated/reasons/SB_vs_HJ_3bet_UTGopen.json`
- `apps/frontend/src/estimated/reasons/SB_vs_HJ_BTNcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_HJ_COcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_HJ_COcall_BTNcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_HJ_four_bet.json`
- `apps/frontend/src/estimated/reasons/SB_vs_UTG.json`
- `apps/frontend/src/estimated/reasons/SB_vs_UTG_BTNcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_UTG_COcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_UTG_COcall_BTNcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_UTG_HJcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_UTG_HJcall_BTNcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_UTG_HJcall_COcall.json`
- `apps/frontend/src/estimated/reasons/SB_vs_UTG_four_bet.json`
- `apps/frontend/src/estimated/reasons/UTG_open.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BB_cold4bet_BTN3bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BB_cold4bet_CO3bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BB_cold4bet_HJ3bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BB_cold4bet_SB3bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BB_five_bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BB_squeeze_BTNcall.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BB_squeeze_COcall.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BB_squeeze_HJcall.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BB_squeeze_SBcall.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BB_three_bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BTN_cold4bet_CO3bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BTN_cold4bet_HJ3bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BTN_five_bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BTN_squeeze_COcall.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BTN_squeeze_HJcall.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_BTN_three_bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_CO_cold4bet_HJ3bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_CO_five_bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_CO_squeeze_HJcall.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_CO_three_bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_HJ_five_bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_HJ_three_bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_SB_cold4bet_BTN3bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_SB_cold4bet_CO3bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_SB_cold4bet_HJ3bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_SB_five_bet.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_SB_squeeze_BTNcall.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_SB_squeeze_COcall.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_SB_squeeze_HJcall.json`
- `apps/frontend/src/estimated/reasons/UTG_vs_SB_three_bet.json`
- `apps/frontend/src/estimated/sizing.ts`
- `apps/frontend/src/estimated/squeeze-responses.json`
- `apps/frontend/src/estimated/squeeze-responses.ts`
- `apps/frontend/tests/admin-coverage.test.mjs`
- `apps/frontend/tests/call-ev.test.mjs`
- `apps/frontend/tests/cold-four-bet-responses.test.mjs`
- `apps/frontend/tests/detailed-reasons.test.mjs`
- `apps/frontend/tests/estimated-audit.test.mjs`
- `apps/frontend/tests/multiway-responses.test.mjs`
- `apps/frontend/tests/multiway-stage1-policy.test.mjs`
- `apps/frontend/tests/multiway2-responses.test.mjs`
- `apps/frontend/tests/range-url.test.mjs`
- `apps/frontend/tests/squeeze-responses.test.mjs`
