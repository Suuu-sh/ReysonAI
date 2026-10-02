# W1: exact heads-up postflop performance

All commands are offline. Golden scripts only read `.local/postflop-ai`; their outputs live in
the explicitly supplied temporary directory. Never capture **after** optimising and call that a
before golden.

## Capture / comparison

```sh
node scripts/postflop-ai/perf/equality.mjs capture /private/tmp/solvea-w1-before
node scripts/postflop-ai/perf/equality.mjs compare /private/tmp/solvea-w1-before
```

This covers the 400-deal simulation, all hand classes/histories of As7d2c and the any-flop KhTh4s
at 200 samples/action, five hand classes on each of two non-representative flops, five river hands
at 600 samples, and three explanation/view nodes. Comparison checks deep JSON equality **and
byte equality**. JSON normalises rounded negative zero on both paths. Optional case names include
`simulateDefault`, `auditDefault`, `coldFlop160`, `coldFlop600`, `coldTurn600`, `coldRiver600`.
The permanent tests also check raw floating-point equality against the frozen range-query
reference, both JS and WebAssembly paths, board workers, hand tiers and the evaluator.

## Isolated on-demand benchmark

```sh
node scripts/postflop-ai/perf/ondemand.mjs flop
node scripts/postflop-ai/perf/ondemand.mjs turn
node scripts/postflop-ai/perf/ondemand.mjs river
```

Each new Node process makes one cold and one identical warm request. The JSON includes sample
counts, wall timings, target budget and result equality; it does not hide an exceeded budget.

## Explicit full CLI measurements

```sh
node scripts/postflop-ai/perf/measure.mjs /private/tmp/solvea-w1-before /private/tmp/solvea-w1-after
```

This runs the real default `simulate` → `audit` → `hand-ev` commands for **BTN_open_BB_call only**.
Unlike the golden/on-demand scripts, it writes that spot's approved report and hand-EV artifacts.
It requires the original `simulateDefault.json` and `existing-hand-ev.json` before starting,
records wall timings and command logs, and checks the entire simulation and all 12 original
2,000-sample hand-EV `boards` for deep and serialized byte equality. No counts/seeds are overridden.

## Profile and baseline (this machine)

Apple M5, Node v25.8.1, `availableParallelism() = 10`, 24 GiB memory. Before files, the original defence and
existing 2,000-sample hand-EV were copied to `/private/tmp/solvea-w1-before`. CPU profiles are in
`/private/tmp/solvea-w1-profile`.

The initial 160-sample profile spent roughly 60% inclusive in `floorOf`, with multi-board
`equityIndexed` and rank binary searches dominating self time. Floors recomputed a whole defence
range for every new context. The flop artifact generator was **serial**; only the distinct later
artifact generator previously used threads. Per-flop runouts/rank tables were already shared
within a worker and are still shared. Separate workers have independent JS heaps/rank caches.

| Before measurement | Wall |
| --- | ---: |
| Flop cold, 160 samples | 1.770 s |
| Flop cold, 600 samples | 4.381 s |
| Turn cold, 600 samples | 0.533 s |
| River cold, 600 samples | 0.037 s |
| Full default simulation, 10,000 deals/comparison | 428.383 s |
| Full default audit | 534.001 s |
| As7d2c full hand/history board, 200 samples | 273.663 s |
| KhTh4s full hand/history board, 200 samples | 542.375 s |

The default simulation/audit and two-board golden capture overlapped, so the before CLI-equivalent
timings include that CPU load. The before 12-board/2,000-sample job was not rerun for hours; the
user's “several hours” observation is not presented as a new measured time. Final CLI timings,
comparison results and checks follow.

## Final results (2026-10-01)

The real default commands ran in order, without overrides, on AC power:
`simulate` → `audit` → `hand-ev`, always `--spot BTN_open_BB_call`.

| Target | Before | Final after | Budget |
| --- | ---: | ---: | ---: |
| Full simulation | 428.383 s* | **36.247 s** | 60 s |
| Full audit | 534.001 s* | **49.773 s** | 90 s |
| Full hand-EV, 12 boards × 2,000 samples/action | Several hours† | **43m 49.847s** | 45 min |
| Flop cold, 600 samples | 4.381 s | **1.406 s** | 1.5 s |
| Turn cold, 600 samples | 0.533 s | **0.319 s** | 0.5 s |
| River cold, 600 samples | 0.037 s | **0.031 s** | 0.5 s |

\* These before CLI-equivalent measurements overlapped the golden capture; they are not isolated
speedup claims. The supplied simulation observation was approximately 160 s.
† Supplied observation, not a new full pre-optimization measurement. The two 200-sample board
baselines above were actually measured.

All six measured final budgets passed. Warm identical requests took **22 / 23 / 17 ms** for
flop / turn / river, and returned deep-equal results. The old default flop count was 160
(measured cold: 1.770 s); it is now **600**, while saved hand-EV stays **2,000**.
The explicit W1 requirement supersedes the older 160-sample description in the already-modified
`src/estimated/AGENTS.md`; that other-session file was preserved.

Timing logs and original comparisons are in `/private/tmp/solvea-w1-after`; untouched before
goldens and the original full hand-EV are in `/private/tmp/solvea-w1-before`.

## Exactness and validation

The final shared computation passed all six original golden groups: simulation (400 deals),
both full 200-sample board/history outputs, ten non-representative-flop hand outputs, five river
hands, and three explanation/view nodes. Both deep JSON and serialized byte comparisons passed.
The full default simulation and audit also matched their original goldens. The audit passed
41,378 expanded combo decisions and 72 comparisons, retaining the same nine advisory balance
warnings. All 12 final 2,000-sample hand-EV boards passed deep and serialized byte equality;
the **entire hand-EV file**, including metadata, has the same SHA-256 as the original:

```text
26d39d216aa2232271432e0c112e035eb8d87b89175ffe6135e2d790b24ed735
```

Permanent tests retain
the original range-query and tier implementations and compare raw, unrounded floating-point
results, native and JS fallbacks, packed-cache special values, counterfactual cache lifetime,
worker ordering/seeds, both heads-up trees, completed-board cache release and worker failure cleanup.

Frontend: **328 tests passed**, typecheck and build passed; Sites: **5 tests passed**.
Backend: **10 tests passed**. No tests were skipped. The browser Web Worker was verified on
the non-representative Q♥9♣4♠ flop with AKo: range, exact-combo selection, explanation and
computed action EVs all rendered without console errors. The local `/app` preview is left open.

The isolated final 600-sample cold/warm timings were flop **1.406 / 0.022 s**, turn
**0.319 / 0.023 s**, river **0.031 / 0.017 s**. The parallel frontend timing test has an explicit
4.5 s ceiling (3× the isolated 1.5 s budget), not a lower sample count.

### Measurement conditions

Later multi-worker probes encountered a low-battery condition (3%, discharging, early battery
warning). A real CLI simulation in that period took 96.547 s and remained golden-identical;
it **did not** meet the 60 s budget. This is retained rather than labelled a passing target.
GC probes and isolated single-board profiles did not justify changing the computation:
native prefix preparation was faster than JS preparation for sparse and dense ranges, and
disabling large-run cache completion did not improve the full simulation. The requested full
hand-EV measurement and original-file comparison subsequently completed and passed.

A 128 MiB young-generation trial increased memory-compression churn and took 62m 05.558s;
it is retained as a failed intermediate measurement, not the final result. Bounded 384 MiB
old / 64 MiB young heaps and the measured representative-board work order returned the job to
45m 22.742s, still just above budget. Releasing the completed board's context/betting/reach
caches before a worker starts its next board reduced the final tail to 43m 49.847s. Policy/base
weights, large-run storage mode, per-board hand/history reuse, arithmetic and seeds are retained.
Only transient `caffeinate` assertions were used for the final long runs; no power preferences
or other sessions' processes were changed. No all-44 artifact batch was run: only BTN artifacts
were authorized, while the shared computation and scheduler apply to all supported spots.

## Changed files / scope

- Shared computation: `scripts/postflop-ai/{defence,range-equity,cached-values,equity-kernel,model,flop-hand-ev-core,later-hand-ev-core}.mjs`, `scripts/lib/equity.mjs`.
- Offline orchestration: `scripts/postflop-ai/{board-batch,board-worker,simulation-parallel,simulation,hand-ev,audit,cli}.mjs`.
- Tests/oracles: `tests/postflop-performance.test.mjs`, `tests/postflop-browser-compute.test.mjs`, `tests/reference/{range-equity,hand-tier}.mjs`.
- Reproducible tooling: `scripts/postflop-ai/perf/{equality,ondemand,measure}.mjs`.
- Documentation: this README and `docs/postflop-defence.md`.

No dependencies or external network were used. No commit, push, reset, stash, checkout or staging
was performed. Protected and pre-existing unrelated work was preserved. `.local/postflop-ai`
writes were limited to the explicitly authorized BTN simulation/hand-EV measurement commands;
golden and probe outputs were stored under `/private/tmp`.

## W3 note (2026-10-01)

Per-hand action EV became an exact expectation (`exact-ev.mjs`, docs/postflop-flop-base.md). The hand-EV golden
cases of `equality.mjs` (200-sample boards, 160/600-sample classes, river hands at 600 samples) and the 2,000-sample
`measure.mjs` hand-EV comparison were Monte Carlo goldens and no longer apply; simulation, audit and explanation
goldens are unchanged. Use `perf/exact-validate.mjs river|turn|flop` for the validation against the Monte Carlo
and `perf/ondemand.mjs` for cold timings (budgets: river 50 ms, turn 400 ms, flop 1.5 s; the turn and flop are over).
