# W2 — persisted balanced flop base (2026-10-01)

> **Decision 2026-10-01 (user): postflop EV is not part of the product.** EV depends on both players'
> assumed strategies; if the calling ranges differ from GTO the EV is not accurate, so showing it misleads.
> The AI strategy (frequencies) is the answer and explanations show the facts behind it. The flop base
> (generator version 6) therefore stores strategies and explanation facts only, with no EV; `flop-base.mjs`
> rejects `--ev`, `--samples`, `--measure-ev` and `--benchmark`, and a base that still carries EV is stale.
> The `/v1/postflop/hand-ev` route, the local hand-EV middlewares and the `postflop_hand_ev` table
> (migration `0006`) are removed. `exact-ev.mjs`, `hand-ev.mjs`, `later-hand-ev*.mjs`, `flop-hand-ev-core.mjs`
> and the Monte Carlo validation stay as **offline research tools only**: the app bundle and the backend do not
> import them. The EV sections below are historical and describe those offline tools. Preflop call EV is unaffected.


## Scope and sources of truth

`BTN_open_BB_call` now has all **1,755** canonical flops stored, covering all
seven decision histories of its `oop_checks` flop tree (12,285 decision views).
Balanced mode is the persisted product base; future opponent profiles are overlays.
These remain **AI-policy estimates, not solver GTO**. No policy, preflop frequency,
opponent profile, or turn/river cache was authored by this work.

Sources: the saved opening/open-response JSON, the spot in `spots.mjs`, validated
local flop/later policy candidates, `defence.mjs`, and the shared UI-facts/EV cores.
Missing/stale optional base data falls back to the deterministic browser computation.

## Suit isomorphism and exact delivery

`flop-isomorphism.mjs` is pure Node/browser code. It enumerates S4's 24 suit
permutations and chooses the lexicographically smallest numeric tuple, ordered by
descending rank and ascending suit within pairs. Card IDs are `rank * 4 + cdhs`.
It returns both actual→canonical and inverse suit permutations, including unused
suits, so board cards **and exact hole-card combos** round-trip. Tests exhaust all
22,100 unordered flops and obtain exactly 1,755 classes.

Both fallback computation and precomputation use canonical coordinates/seeds. This
also removes finite-Monte-Carlo suit-seed differences. Tables, combos and facts are
remapped to the requested actual suits; hand-class EV is never called combo EV.
Histories include check-raise responses after each of 33%, 75%, and 125% bets,
not only the earlier smallest-bet template.

## Storage and invalidation

Each canonical flop is one compact columnar JSON document, atomically written as
`<key>.json.br` (Brotli q9) under:

```
.local/postflop-ai/flop-base/btn-bb-srp-v1/
```

The JSON stores the exact policy+computed-defence+cap mix, combo reach weights,
range-table class aggregates, individual facing/betting explanation facts and
weighted class explanation facts. Strategy/reach f64s are not rounded. UI facts
use the defence's four-decimal presentation precision on both paths. Shared
columns, constants, nullable masks, delta varints and corrected predictive
residuals are lossless; decoding does not run equity or defence calculations.

The manifest contains per-file SHA-256, raw/gzip/stored bytes, compute time, EV
presence, and generator identity. Freshness checks cover source, flop/later policy,
later sizing, defence version/config, seed, isomorphism/generator version and
sample counts. A changed identity, damaged/missing file or mismatched content hash
is rebuilt by `--resume`; publishing skips stale/corrupt entries. Completed boards
survive interruptions; only the main process updates the manifest.

W1's bounded whole-board worker pool supplies ten cores. Workers write independent
files and return small metrics, not huge documents. Benchmark artifacts live
separately under `.local/postflop-ai/flop-base-benchmark/`, outside the product
artifact footprint.

**Compressed storage (migration `0005_flop_base_br.sql`, replaces the TEXT table of 0004).**
`postflop_flop_base_br` holds the Brotli bytes of each flop (identical to the `.json.br`
files) as BLOB parts written as `X'...'` hex literals, at most 44,500 bytes per part so a
statement stays under 90,000 bytes. BTN_open_BB_call: 1,755 flops, 1,840 rows, 118.8 MB of
SQL, about 61 MB in D1 (vs 313 MB as TEXT), so 44 spots are about 2.7 GB. The Worker joins
the parts and returns them with `content-encoding: br` (`encodeBody: "manual"`, also kept
through the CORS wrapper) without decompressing; clients without `br` get a
DecompressionStream("brotli") body, else 406. The local Vite middleware does the same.
Older description of 0004 follows (superseded): ordered JSON TEXT parts keyed by
`(spot_id, flop_key, part)`. Publishing streams SQL and limits the **whole escaped
statement**, not just the value, to 90,000 bytes. The measured maximum is **89,201
bytes**. `--only flop-base` does not replace policy/preflop tables. The Worker route
`GET /v1/postflop/flop?spot=BTN_open_BB_call&flop=Ac7d2h` concatenates validated
parts and returns stored text **without JSON parsing**. It uses an independent
`flop-base` dataset version for edge caching. Vite's `/local-postflop-flop` reads
the same fresh documents. Browser requests share a bounded canonical-key cache;
one caller's cancellation does not cancel another.

## Measured budget and EV decision

Machine: Apple M5, ten cores, 24 GiB, Node 25.8.1. The deterministic 20-board
measurement set contains the twelve canonical representative flops and eight
seeded additional distinct flops.

| Strategy + facts measurement (20 flops, ten workers) | Result |
| --- | ---: |
| Batch wall time | 2.915 s |
| Sum of board compute times | 25.634 s |
| Mean compute time per flop under concurrency | 1.282 s |
| Mean JSON / gzip / stored bytes | 172,858 / 33,849 / 30,917 |

The EV probe used **40 samples per hand/action**, all histories and twenty flops.
It measured the paired Welford standard error of the difference between the two
most frequent actions, with common hero/villain/runout and random-stream seeds
across actions. Diagnostics do not change the existing EV rows or random stream.

- 12,776 hand-class/decision observations; **0/12,776** had SE below 0.1bb.
- Measured pooled p90 SE: **7.463bb**; wall time: **81.995 s**.
- Selected optional stored-EV count: **327,680** samples. Square-root extrapolation
  predicts pooled p90 SE **0.0825bb**, and the noisiest board's p90 **0.0930bb**.
- Linear runtime projection: all 1,755 flops **16,373 hours**; the twelve
  representatives alone **112 hours** on this machine. These are projections,
  not completed high-count precision measurements.

**Time-budget fallback:** W2 requirement 2 explicitly permits leaving EV on demand
when the time budget is insufficient. Strategies and explanation facts were stored
for all flops; **new base EV was not stored, including the twelve representatives**,
because even that reduced high-precision run projects to roughly 4.7 days. This is
a deviation from requirement 3's representative-only fallback, not a claim that
its high-sample precision requirement was measured/passed. Existing representative
EV artifacts and the on-demand class EV remain available and unchanged. The
327,680-sample p90 estimate is not shown as an achieved precision guarantee.

The CLI defaults to the practical strategies+facts budget. Explicit `--ev
representative` or `--ev all` enables the optional high-count run; `--samples`
invalidates the identity rather than relabeling existing rows. Example offline
authoring commands (not invoked by a view):

```
npm run postflop-ai:flop-base -- --spot BTN_open_BB_call --resume
npm run postflop-ai:flop-base -- --spot BTN_open_BB_call --benchmark --limit 20 --measure-ev --samples 40
npm run postflop-ai:flop-base -- --spot BTN_open_BB_call --resume --ev representative
node scripts/publish-d1.mjs --only flop-base --out .local/w2-flop-base.sql
```

## Completed generation and verification

- All **1,755/1,755** files are fresh, manifest complete, generator v5.
- Full worker batch wall time: **246.765 s** (4m 7s); sum board compute time:
  2,383.030 s. Resume audit selected **zero** boards to recompute.
- Product JSON files: **57,342,815 bytes**; manifest: **349,597 bytes**;
  total product artifact footprint: **57,692,412 bytes (57.69 MB)**.
- Raw JSON/D1 body size: **313,402,229 bytes**; equivalent gzip total: 62,567,905
  bytes. The ≤60 MB target is satisfied by the compressed artifact footprint,
  **not** claimed for raw SQLite JSON TEXT storage.
- All data imported into isolated local D1 `evionai` at `.local/w2-d1`:
  **1,755 flops / 4,581 parts**. No existing session's local DB was replaced.
- `wrangler dev --local` at `http://127.0.0.1:8787` verified `Ac7d2h`, `KcKd4h`
  and `AcKc4c`: HTTP 200 and byte-identical JSON/SHA-256 to local files.
- Twenty random suit-remapped strategy comparisons pass. Five flops' entire
  stored/remapped outputs, all seven histories, combo facts and class facts
  deep-equal direct computation. This was also checked against the generated
  production files, not just reference-policy test fixtures.
- Frontend `npm test`: **339/339**; `npm run typecheck`: pass;
  `npm run build`: pass; Sites tests: **5/5**. Backend `npm test`: **12/12**.
  Build retains `dist/client/index.html`, `dist/server/index.js` and
  `dist/.openai/hosting.json`.
- Browser `/app`: BTN open → BB call, saved A♠7♦2♣ flop, exact A♥K♦ selection,
  weighted Average and facing a 75% bet render correctly. No app error; the
  existing missing `favicon.ico` is the only console error. Vite remains running
  at `http://127.0.0.1:5173/app`.

Local evidence: `.local/w2-{strategy-benchmark,generation,resume}.log`,
`w2-ev-budget.json`, `w2-worker-verification.json`, `w2-d1-count.json`,
`w2-production-equality.json`, and the frontend/backend/typecheck/build/Sites logs.
No network, dependency installation, deployment, staging or Git mutation was used.

## Changed files

All paths below are relative to the repository root. Protected account/profile/
layout/ProductApp files, `.claude/launch.json`, and `apps/preflop-ui/` were not edited.

- `apps/frontend/AGENTS.md`, `apps/frontend/package.json`, `apps/frontend/vite.config.mjs`
- `apps/frontend/docs/postflop-flop-base.md`
- New `apps/frontend/scripts/postflop-ai/`: `flop-isomorphism.mjs`,
  `flop-isomorphism.d.mts`, `flop-ui-facts.mjs`, `flop-base-codec.mjs`,
  `flop-base-core.mjs`, `flop-base-files.mjs`, `flop-base-d1.mjs`, `flop-base.mjs`
- Updated `apps/frontend/scripts/postflop-ai/`: `board-batch.mjs`,
  `board-worker.mjs`, `flop-hand-ev-core.mjs`, `views.mjs`, `local-view.mjs`
- `apps/frontend/scripts/publish-d1.mjs`
- Updated `apps/frontend/src/estimated/`: `postflop-api.ts`,
  `postflop-browser.ts`, `postflop-compute.ts`, `PostflopTrial.tsx`, `PostflopHandEv.tsx`
- `apps/frontend/tests/postflop-flop-base.test.mjs`,
  `apps/frontend/tests/postflop-browser-client.test.mjs`,
  `apps/frontend/tests/postflop-browser-compute.test.mjs`
- `apps/backend/migrations/0004_flop_base.sql`, `apps/backend/src/postflop.ts`,
  `apps/backend/src/index.ts`, `apps/backend/tests/postflop.test.mjs`
- Repository `design-qa.md`: dated W2 section appended only.

## Exact hand-EV (W3, 2026-10-01)

Per-hand action EV (flop `flopHandEvForHand` / `handEvForBoard`, turn and river `laterHandEvForHand`) is no longer
sampled. `scripts/postflop-ai/exact-ev.mjs` computes **the expected value of each action when both players then
follow the shown strategy**: every opponent combo of the node's reach range (card-removed against the hero combo),
every runout, and at every later decision of both players the full mix (policy + computed defence + bluff cap +
MDF ceiling / floor from `defence.mjs`) instead of one sampled action. Both mixes depend only on the public line and
their own combo, so a path has probability `s_hero(path) * v_opp(path)` (a scalar times a vector over opponent
combos); leaves are fold payoffs or showdowns, summed with rank-sorted prefix sums and per-card blocker lists.
Chips, rake (on the final pot), stack caps and the all-in merge come from `engine.mjs` itself (every state is an
engine replay). The hero's own later decisions use the hero combo's own mix, not a best response.

- River: all opponent combos, no runout. Turn: every river card. Flop: the first `FLOP_EV_RUNOUTS = 24` of the
  defence's seeded 300 turn+river runouts (`flopRunouts`, `config.seed`). Exhaustive and the 300-set are too slow: each
  runout needs about 800 river defence contexts (one hand class: 54 s for 300 runouts, 5 s for 24).
- The result is a pure function of the inputs: repeated requests, sample counts, seeds, the 12-board artifact and the
  on-demand worker all give identical numbers (`tests/postflop-exact-ev.test.mjs`).
- Branches whose opponent mass times the best hero probability is under `PRUNE = 1e-5` of the root are skipped and
  the covered mass is renormalised (|EV change| <= 0.01bb on the cases checked).
- The old Monte Carlo is kept as `*MonteCarlo` functions (`method: "monte-carlo"`) for validation only.
  `tests/reference/hand-ev-enumeration.mjs` is an independent plain enumeration the exact code is tested against.
- Runout-set error (flop only), measured on As7d2c, 7 classes, against all 300 runouts: RMSE of an action's EV with
  24 runouts 0.4-0.7bb (differences between actions 0.1-0.4bb); 300 runouts 0.15-0.3bb. The earlier 40-sample p90
  standard error of an action difference was 7.5bb; 600 on-demand samples about 1.9bb.

Validation against 8 independent Monte Carlo runs (`perf/exact-validate.mjs`; flop Monte Carlo drawn from the same 24
runouts; all |z| <= 3):

| Decision | exact vs MC mean (largest |z| of 5-7 values) |
| --- | --- |
| river OOP first (KQs), facing bet75 (AKo), IP facing bet33 (77) | 2.34 / 1.29 / 0.92 |
| turn OOP first (AKo, 77), IP after check (KQs) | 1.59 / 1.39 / 0.89 |
| flop first action (KQs, 77) | 0.70 / 1.43 |

The seeded `mulberry32` stream of the old code is slightly low-biased for this sampling scheme (class equity of 77 on
the turn: 95.86 sampled vs 95.93 exact, brute-force enumeration 95.926; `Math.random` gives 95.93 / 95.96), so the
validation uses `Math.random` through the `rng` option.

| Timing (Apple M5, Node 25, cold process) | Budget | Result |
| --- | ---: | ---: |
| River decision, one class | 50 ms | 14 ms (warm 1 ms) |
| Turn decision, one class (all 48 rivers) | 400 ms | 1.5 s cold, 0.34 s warm |
| Flop decision, one class (24 runouts) | 1.5 s | 4.8 s cold, 3.3 s warm |
| 12 representative boards, all classes and nodes (`postflop-ai:hand-ev`) | much faster | **61 s** (was 43m50s) |

The turn and flop budgets are not met: the time is the defence's own river contexts (equity, floor, ceiling per
board and line), not the EV arithmetic. A whole board shares those contexts between hand classes, which is why
all classes of 12 boards take 61 s while one class takes 5 s.

**Flop base EV:** `--ev all` was measured (20 flops, ten workers): 103.8 s wall, 927 s of compute (46 s per flop).
All 1,755 flops project to about 2.5 h wall (22.6 CPU-hours), over the 1 hour limit, so EV is **not** stored in the
flop base (no generator version bump; strategies and facts files are unchanged). `--ev` now stores exact rows and
`--samples` no longer affects them. `HAND_EV_VERSION` is 3 and `LATER_HAND_EV_VERSION` 2 (older files are stale).
