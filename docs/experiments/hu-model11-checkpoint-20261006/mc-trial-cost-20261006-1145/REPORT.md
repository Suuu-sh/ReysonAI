# HU Monte Carlo trial runtime, 2026-10-06

The current proof-gated model11 completion path took **20.62–30.29 ms per paired trial**, versus **8.17–10.19 ms** for retained model10 semantics in the same fixed source. The three selected conditions averaged 26.71 versus 9.36 ms, a **2.85× wall-time ratio**. These are single-run diagnostic measurements, not a precision claim or a whole-job forecast.

| Existing cell | Condition | Legacy wall ms/trial | Current wall ms/trial | Ratio | Legacy/current CPU ms/trial |
|---|---|---:|---:|---:|---:|
| 001 | As7d2c / standard / BB, adverse case | 8.17 | 20.62 | 2.53× | 12.71 / 30.30 |
| 002 | As7d2c / passive / BTN, completion case | 9.72 | 30.29 | 3.12× | 14.50 / 41.56 |
| 059 | 9s7s3s / aggressive / BB, completion case | 10.19 | 29.21 | 2.87× | 15.32 / 40.16 |

Each measurement covers 64 paired baseline-and-candidate trials, cache release at index 0 and after the epoch, the same saved policy pair, input fingerprint, seed, sampling functions and 24-action-random draw schedule. All three old/current draw hashes match. All 192 current complete trial objects exactly match existing saved evidence, including completion events and laws. There are two completion decisions and no unresolved current trials. Candidate returns differ in 4/64 trials in cell059; they happen to match in cells001/002. Semantic equality between old and current models is not required.

Current execution setup was 38–42 ms per cell, versus approximately 0.12 ms for the legacy factory. Setup and sampler preparation are outside the quoted loop timing. Both loop timers include the reference baseline. Current candidate timing includes a separately measured evidence callback (0.82–3.03 ms per 64 trials); it is not an overhead-free engine benchmark. CPU usage is process CPU across runtime threads and can exceed elapsed wall time.

## Current hotspots

A separate current-path cell059 profile used the V8 inspector at a 1 ms sampling interval, yielding 1,932 samples over approximately 2.024 seconds. It is excluded from the timing ratios above. Inclusive percentages overlap:

- Public-prefix construction: 26.0%; 15.9 percentage points occur under historical reach reconstruction, 5.4 under the public prefix facade and 4.7 under the law request path.
- JSON validation, immutable snapshot construction, canonicalization and content identity work together: 21.5%. Snapshot construction alone accounts for 12.0% inclusive; canonical JSON 6.4%; assertion self time 3.1%; SHA self time only 1.1%.
- Rank-table construction: 13.2%; range equities: 10.8%.
- Semantic zero-proof verification: 5.1% on this completion-bearing condition.

The current path recursively constructs effective action laws for historical reach and validates public prefixes. The old path uses saved-policy-conditioned computed defence. This additional model work explains why lowering persistence overhead alone cannot close the gap.

Current law-cache builds were 121 / 184 / 175; evictions were 0 / 56 / 47. The latter two cases hit the 128-entry cap while retaining approximately 30–33 MiB of numeric data. Cache growth was not tested or changed.

## Producer, persistence and validator

The official `produceCompletionRepresentativeCell` for cell002 took 1,874.6 ms. Instrumented store methods consumed 5.94 ms, approximately 0.32%, including serialization and hashing. Its separate native cell/proof validator took 197.9 ms. Official producer trial objects also exactly matched the saved 64. Independent-process timing noise means subtracting this producer timing from the separate loop timing would not measure storage overhead.

## Scope and source

- Fixed numerical source: `4b6b39a613afe72a2362f85aa93a305cd61b3586`; unchanged throughout.
- Old comparator: retained model10 semantics via `defenceFor` and `playHand` in that same current source. Historical `471f8920fd4ed258ca163dd1daa707b75daf1250` was inspected; its `simulation.mjs` is byte-identical, but whole historical-engine performance parity is not claimed.
- Current comparator: `createModel11BehaviorCompletion` and `playModel11Hand`, with exact official representative trial construction. Strict `simulateModel11` was not substituted.
- Eight fresh, sequential, bounded jobs: six model/condition measurements, one official producer, one separate profile. Each had 512 MiB heap, 900 MiB owned-process RSS limit, 2 GiB available-memory floor and 120-second stop bound.
- All jobs exited normally with complete birth-bound owned-process cleanup. Maximum sampled/process peak was 324.04 MiB; minimum host available memory was 8,211 MiB. No full 720,000-trial run or 1,755-board launch occurred.
- No policy, validation coverage, thresholds, acceptance decision or formal source was changed. The previous 64-trial evidence was neither extended nor promoted.

## Smallest next experiment

Test a private weak brand for snapshots and their immutable subtrees created only after `freezeSnapshot` successfully validates, clones and deeply freezes them. `assertJsonCompatible` can avoid rewalking those exact owned objects while continuing full validation of all new or unbranded objects. Arbitrary `Object.freeze`, proxies, malformed descriptors, sparse arrays, cycles, non-finite values and mutable caller inputs must retain existing rejection behavior. This addresses only part of the observed identity cost; it does not eliminate cloning or canonicalization, and a speedup is unproven.

Keep that candidate in an isolated checkout and require identical per-trial returns, completion laws, proofs, hashes and malformed-input behavior before adoption. Public-prefix reuse may offer more benefit, but the direct duplicate facade path is only about 5.4% here; the larger historical reach reconstruction requires a separately reasoned immutable-request design. Do not reduce trials or proof coverage to obtain a runtime improvement.

## Evidence

`summary.json` contains exact metrics, resource receipt pins and limitations. `measure.mjs`, `run-one.py`, `source-pins-v2.json` and `independent-source-review-v2.json` pin the executed wrapper. The six `{legacy,current}-{001,002,059}/result.json` and `trials.json` files retain individual measurements and trials. `producer-002/` retains native proof/chunk evidence. `profile-059/cpu.cpuprofile` and `profile-summary.json` retain the sampled profile. The final result review is separate from source approval.
