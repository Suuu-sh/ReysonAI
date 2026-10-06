# Request-lifetime historical prefix memo: measured candidate, not adopted

The separate candidate starts from formal model11 commit `4b6b39a613afe72a2362f85aa93a305cd61b3586`. It changes only `effective-reach.mjs` in the numerical source. The formal worktree remains unchanged. Neither the earlier gate geometry memo nor the paused WeakSet identity candidate is included.

## Proposed change

`EffectiveDefence.reach` keeps internally generated, deeply frozen historical prefixes in a private Map for one outer `withRequest` lifetime. The exact key contains the full revealed board and all three earlier street paths. The Map is capped at `MAX_PREFIX_DECISIONS`, disabled when any completed-law cache budget is zero, and cleared at outer request finalization and explicit release. Public request validation, every numeric `prepare` call, law/proof construction, iteration order and existing cache counters remain unchanged.

## Validation and measured result

- Independent source/test and distinct-source wrapper reviews were obtained before execution.
- Seven focused test files passed 42/42 tests, with no failures, skips or cancellation. One bounded invocation: exit 0, 14.298 s, peak owned-group RSS 378864 KiB.
- The existing diagnostic wrapper ran current-mode cells 001, 002 and 059 once each, 64 paired trials per cell, against the retained fresh formal4b baseline. Each run used the same saved inputs, policies, seeds, draw/random stream, cache64 epoch and instrumentation. All three exited 0 with owned cleanup complete.
- All 192 complete ordered trial objects and complete proof arrays matched. Draw/trial hashes, cache-before/cache-after states, decision counters, node counts, summaries and all remaining result fields matched. The parity record separately retains differing source provenance, timings and resource observations; no law or proof identity was dropped.

Per paired trial, including the same reference-hand control and evidence callback:

- Cell 001: 20.623604 ms baseline, 21.881606 ms candidate.
- Cell 002: 30.292868 ms baseline, 32.335922 ms candidate.
- Cell 059: 29.211125 ms baseline, 31.972255 ms candidate.

The measured 192-trial loop wall sum was 5128.166214 ms baseline versus 5516.146108 ms candidate (+7.5657%). Loop CPU was 7169.069 ms versus 7981.395 ms (+11.3310%). Setup/source checks/storage are outside these loop timers. Total candidate process wall times were 2.5701, 3.5902 and 3.3008 s; peak owned-group RSS was 253412, 340252 and 325808 KiB respectively.

This is one pair per condition, using already retained baseline measurements from the same host/runtime minutes earlier. It does not establish a statistically reliable slowdown, but it does not demonstrate a speed gain and provides no basis for adoption. No repeated measurement, profile, full1755, 720k, 10000-trial projection, coverage-contract change or runtime adoption occurred.

## Evidence

`candidate.patch`, `source/`, `candidate-source-pins.json`, `preparation-manifest.json`, `commands.json`, both independent review receipts, `focused-result.json`, `three-cell-parity.json`, `actual-validation/`, and the three current-cell result/supervision directories retain the proposed source, test source, exact input/source pins, complete outputs and terminal ownership evidence. The paused WeakSet candidate remains in its separate directory and has had no Node/test/numerical invocation.
