# HU model11 cold-four-bet acceptance checkpoint — 2026-10-06 UTC

`BTN_open_SB_3bet_BB_4bet_BTN_fold_SB_call` is independently accepted under the revised scoped numerical contract as a model-conditioned AI estimate for the evaluated profiles and representative paths/runouts. Alongside the [earlier pilot](hu-model11-pilot-acceptance-20261006-status.md), this makes two distinct accepted model11 research cases. The older model10 acceptance for `UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call` remains separate. Neither model11 case is adopted into the PR41 runtime.

## Exact acceptance and execution identity

- [Original acceptance JSON](hu-model11-cold4bet-acceptance-20261006.json): 11,155 bytes; SHA-256 `91db6db1e35cffbfcee38eaaf85ce887b0cdf8fa1abb81146eed34ac8b958d48`. Its historical paths identify archived artifacts, not repository-relative executable inputs. Original bytes and limitations are preserved.
- Numerical source remains `5dbd208d2ba70ceec2934efab9de134a5dc19e1c`, tree `f56e0e98fbc31bf2dd633ad1e73dc3470fc23835`, closed execution identity `f31b9b7811a9e62b4f8dee3b989791c14b9c4d175343565bad307a072a131f90`.
- Source-only preservation commit `1ed7fae33eed362df84672265a05c0b44b8ce1ce` has that exact source tree. It and this metadata checkpoint have different commit identities from the numerical execution; no execution proof is reassigned to them.

## Evidence and limits

- Own-case engineering regression: 72 cells × 64 trials = 4,608 completed trials, zero unresolved. The 64-trial budget is not precision-derived. There are 23 negative paired-delta cells; overlapping-zero descriptive intervals do not establish noninferiority. Unchanged whole12 checks cover 14,397 legal combos and 864 paired reference trials with zero reference drift, errors or unresolved cases.
- Genuine five-worker production completed all 1,755 canonical flops in 220 terminal batches: 514,215 requested prefixes, 512,325 evaluated and 1,890 proved model-unreachable; zero errors/unresolved. Elapsed compute was 51m 51.6s, with about 2.27 GiB aggregate peak RSS.
- Finalization reused the genuine producers' semantic evidence, independently verified all 1,755 row files and 1,890 proof files, and checked the entire lossless canonical receipt: 4,201,053 bytes, SHA-256 `5a1777236a0ccba3daec7468a2011828dda2162cf5a766e2b7dcdb225f27087e`. It completed in 7.892s at 345,980 KiB peak owned-group RSS (about 338 MiB); outer completion and postflight passed, all owned groups gone.
- All 17,625 warnings are retained and independently classified: 10,041 overfold, 5,891 low-air, 801 overcall, 783 value-only-raise and 109 capped-check. No mandatory policy edit is established. Warnings remain strategic limitations; per-warning trajectories and magnitudes were not retained in compact allboard rows.
- Coverage includes sampled 7,020 turn boards and 21,060 river runouts. This is not a fresh 720,000-trial replay, fresh whole-set semantic replay or fresh native-consumer replay. Statistical superiority/noninferiority, all legal histories, GTO, exploitability bounds and unknown-opponent robustness remain unproved.

## Preserved evidence pointer

Library `libfile_6fc13f8f72288191a328c485cc8d1fa9`, version 4: `hu-model11-two-cases-scoped-accepted-20261006.tar.gz`, 9,180,915 bytes; SHA-256 `076a6a69ca1e74e6685d747b068cb6f577359e6863770adca0196642d86edc16`. Version 5 retains that exact archive as a nested dependency and adds the next reviewed adapter; that adapter is outside this acceptance.

The archive includes the supporting actual-output review (SHA-256 `3346fb55574b851c7f1297cd0c35a6e0270cf49feb398d48627d6443365193c6`) and warning classification (SHA-256 `28cc4d0b696f0b67620686a21861520e7e7043b063bab0054f77fc1d7c39abe7`), plus preserved code, data and receipts. Library versions are preservation references, not fresh-download verification or claims that raw numerical data is hosted in this GitHub commit.

This checkpoint adds only this note and the exact acceptance JSON to `research/hu-model11-preservation-5dbd208-20261005`. Existing bytes and historical records are preserved. PR41 remains the draft at `471f8920fd4ed258ca163dd1daa707b75daf1250`; main/development, runtime and delivery/adoption manifests remain untouched. No new PR, numerical execution, merge or deployment is part of this preservation.
