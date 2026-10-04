# Computed defence at facing nodes (postflop pilot)

> **Decision 2026-10-01 (user): postflop EV is not shown or computed in the product.** References below to hand-EV
> (`hand-ev.mjs`, `later-hand-ev*.mjs`, exact-ev, the browser worker) describe **offline research tools only**, not product
> code; the defence mix itself, the explanation facts and MDF are unchanged. See `docs/postflop-flop-base.md`.

AI estimate, not GTO. `scripts/postflop-ai/defence.mjs` (pure, no `node:*`; runs in Node, the browser worker and the edge worker).

## Why

The heads-up postflop AI policies give every facing decision a fixed mix per hand tier
(monster / strong / draw / medium / air) x texture x line. Their calls therefore ignore the bet
size, the bettor's value / bluff mix, where a hand sits inside its tier and blockers. The
call / fold part of every facing decision is now a calculation. Betting decisions (check, bet
sizes) and the raise share stay AI-policy driven.

A facing node is any node whose actions include `call`: the flop `bb_vs_*`, `ip_vs_*`,
`btn_vs_raise`, `oop_vs_raise` (tree.mjs) and the turn / river `{street}_{role}_vs_{size}`,
`{street}_{role}_vs_allin`, `{street}_{role}_vs_raise` (later-tree.mjs).

## The model

1. **Bettor range B.** The aggressor's saved range, scaled by the policy probability of every
   earlier action of that seat, including the bet or raise that is faced (the same scaling the
   views use: `scaleByPath` / the later-street line weights, always with the *policy* mixes; an
   earlier call is weighted by the policy call share, not by a defended mix). Combos on the board
   are removed, and for each defender combo the bettor combos that share a card with it are removed
   (blockers).
2. **Equity.** The defender combo's showdown equity against B, ties counting half. Every combo is
   ranked once per final board with `lib/equity.mjs evaluate` and compared by rank.
   - River: exact.
   - Turn: exact, over all remaining river cards.
   - Flop: `FLOP_RUNOUTS = 300` turn+river runouts, drawn with a seeded RNG
     (`config.seed | defence | flop`) and shared by every node of that flop, so their rank tables are
     cached. A defender combo skips the runouts that contain its own cards, so it sees about 250 of
     the 300.
3. **Break-even.** P = the pot before the aggressive action, W = the chips it added, C = the call
   (capped by the defender's stack, as `engine.mjs` does), F = P + W + C, rake `r(F) = min(5% F, 3bb)`.
   Calling wins when `realized equity x (F - r(F)) - C > 0`, so
   **required equity = C / (F - r(F))**.
   - River: realized equity = equity.
   - Turn and flop: realized equity = equity x R, with R = `defence_realization[street][role][tier]`
     in `scripts/data/postflop-ai-pilot.json`. The hand tier is evaluated on the current board;
     river remains exact (R = 1). **These are explicit estimates of how much of its equity a hand
     realizes on later streets, not solved values.**
4. **Decision.** The policy keeps the combo's `raise` share. The remaining `100 - raise` percent is
   split with `call share = logistic((realized - required) / 0.02)` (so a margin of +-4pt is about
   88 / 12). Whole percentages, summing to 100. There is no special case for monsters: the
   formula decides.

## Bluff cap (betting side)

The defence is a best response to the bettor range B, so B must not carry more bluffs than the bet
can support. The cap is applied inside the mix that every consumer uses.

- **Where.** Every betting decision on the **river** (first / lead nodes, and the raise at a facing
  node), and any **all-in on any street** (an action after which the bettor has no chips behind, also
  when a sized bet merges into an all-in). **Turn and flop sized bets that are not all-in are not
  capped**: a semi-bluff has equity and the defence already accounts for it.
- **Break-even.** For each aggressive action a, alpha(a) = C / (F - rake(F)) exactly as the defence
  computes it (C capped by the stacks), from the engine table after a.
- **Range.** The bettor's reach weights at that decision times the policy probability of a. A combo is
  *value* when its equity against the defender's whole range at that point is at least 50% (the
  classification of the defence facts), *bluff* otherwise.
- **Cap.** If bluff / (value + bluff) > alpha(a), only the bluff combos' frequency of a is multiplied by
  f = alpha * value / ((1 - alpha) * bluff) (0 when there is no value), so the share equals alpha. The
  removed frequency goes to check at first nodes. Under-bluffed actions are left alone; bluffs are never
  increased. The capped frequencies are not rounded to whole percent (the share must equal alpha), so
  a capped mix can have decimals.
- **Raises.** At a facing node the raise share of bluff combos is scaled the same way, and the defence
  then splits the non-raise remainder into call / fold as before (so the removed raise share becomes
  call or fold according to the margin, not a fixed call).
- **Everywhere.** `defence.mix` applies it at all decisions, and the reach weights of a seat (`rangeOf`,
  `rangeItems`) use the capped probabilities of that seat's earlier decisions, so the defence's B, the
  view rows, hand-EV samples, explanations and the balance check all agree. `bettingFacts` returns per
  action alpha, the value / bluff weights and shares before and after, and whether the combo counts as
  value or bluff. `defenceFor(..., { bluffCap: false })` switches it off (tests, comparisons).
- **Defence ceiling.** With the bluff share at alpha a bluff-catcher that beats every bluff sits at zero
  margin, so the logistic alone would call most of them and defend far above the minimum defence; a value
  hand shoving into that range then wins several times the pot. When the faced action was under the bluff
  cap, the defender's total continue frequency (calls + raises) is therefore limited to MDF: the weakest
  (lowest realized equity) calls are dropped until the total equals MDF, the strongest hands keep their
  logistic call share. Uncapped actions (turn and flop sized bets) have no ceiling.

## Facts returned for explanations / UI

`defence.facts(table, board, node, combo, base)` returns, for one defender combo:
required equity, the combo's equity, realization factor and realized equity, the margin and the call share, the
combo's **percentile** inside the defender's range at this node (share of defender weight with a
lower realized equity, 0-1), the **overall defence frequency** (call + raise share of the whole
defender range under the defended mixes), **MDF** = P / (P + W), the bettor range **value / bluff
split** (value = bettor combos whose equity against the defender's whole range is at least 50%;
weights and percentages) and the **blocker facts** of the combo (percentage of the bettor's value
weight and of its bluff weight removed by the combo's cards, against the unblocked range).
`explainCombo` / `explainLaterCombo` return them as `defence` when the hero faces a bet, and use
the same break-even (`required`), including rake, as the mixes.

## Integration

One shared instance per `(inputs, flopPolicy, laterPolicy)` (`defenceFor`) caches the rank tables,
tiers, reach weights and per-decision contexts. The context of a decision is rebuilt from the
engine table (`engine.mjs` now logs every decision and the actions taken per street in
`table.log` / `table.path`; `replayDecision` rebuilds that table from a list of actions).

Consumers that use it: the self-play simulation (the candidate only; the fixed reference opponent
and the baseline run keep their tier mixes), `hand-ev.mjs`, `later-hand-ev-core.mjs` (shared by
`later-hand-ev.mjs` and the browser worker), the flop and turn/river views (`views.mjs`, used by
`local-view.mjs` and `postflop-compute.ts`), `explain.mjs`, `explain-later.mjs` and `balance.mjs`
(so the `overfold` / `overcall` findings judge the computed mixes). The policy files still contain
call / fold numbers: they are validated as before, feed only the raise share and are the fallback
when no context can be built (an empty bettor range, or a path the engine resolves differently).
`fix-overcall.mjs` may still be used but is no longer needed for the defence.

## Hand-strength realization table (2026-09-30)

Flop and turn equity is scaled by R(tier, position) before it is compared with the break-even:

| Tier | IP | OOP |
|---|---:|---:|
| Monster | 1.00 | 1.00 |
| Strong | 0.97 | 0.92 |
| Draw | 0.95 | 0.88 |
| Medium | 0.85 | 0.78 |
| Air | 0.75 | 0.65 |

Strong hands realize about their equity, weak ones much less, and out of position less than in
position. The table is an explicit estimate, checked rather than fitted: on five BTN_open_BB_call
flops (KhTh4s, As7d2c, 8h7h6c, Kd8s3c, 9s7c3h) BB's computed defence against 33/75/125% bets
stays between MDF − 10 points and a little above MDF. Turn uses the same table; the river is exact.

An EQR average taken from the flop hand-EV artifacts was tried first and rejected: EQR there is
mix EV over equity × the pot before the decision, not the share of equity a call realizes, and
using it (monster 0.83, air above medium) made BB defend 9–23% against a 75% bet where MDF is 57%.

## Defence floor

Uncapped bets (flop, turn) can be under-bluffed by the AI policy. The best response then folds far
below MDF, which only reads this policy and would be exploited by any extra bluffs. When the
computed defence is more than 10 points under MDF, the strongest folding hands by realized equity
call until defence reaches MDF − 10 points (`DEFENCE_FLOOR_MARGIN`).

2026-10-03 (DEFENCE_VERSION 5): the floor also applies to capped actions. A capped range sits exactly at the
caller's break-even, so its bluff-catchers are indifferent and the logistic split called only about half of
them: river 33% bets were defended near 54% against an MDF of 75% on almost every one of the 1,755 flops.
Capped actions are now defended between MDF − 10 points (floor) and MDF (ceiling).

2026-10-04 (new HU-after-multiway model version 8; legacy model remains version 6):
only canonical history-bearing spots, on the river with a positive call cost and actual
floor promotion, retain their pre-floor logistic call/fold split when exact integer ranks
prove nonempty positive-weight bettor support compatible with the hero and board, and every
compatible opponent beats the hero. Any win or tie preserves normal promotion, even if the
cached float is zero. Empty support or invalid ranks do not prove zero. This replaces the
provisional version-7 float-zero test, which missed three TT combinations with a tiny positive
prefix-subtraction residue despite no winning/tied outcome. No epsilon or equity-kernel change
is used. Authored/capped legal raises remain intact. The floor's
allocation is unchanged, so removed promotion is not redistributed to positive-equity
hands; achieved defence may honestly remain below MDF − 10 points. This is not an epsilon
cutoff or a change to pre-floor calls, ceilings, bluff caps, flop/turn behaviour or the
45 legacy spots. `defenceVersionFor(inputs)` binds the scoped model to reports, flop bases
and offline hand-EV freshness; version-6/7 new-HU outputs require fresh execution.

The three candidate hashes are unchanged (`defence_realization` is excluded from the flop
fingerprint and from `later_sizing_hash`); simulation reports carry `defence_version`.

## Performance notes

- Rank tables (all 1,081 unblocked combos of a 5 card board, sorted by score) and tier arrays are
  cached per board and shared by every context; `lib/equity.mjs evaluate` is allocation free
  (`tests/equity-evaluate.test.mjs` pins it to the original implementation).
- A context answers its first few equity queries by scanning the bettor range once per final
  board (a simulated hand asks about one combo); a context that is queried more (a whole-range view)
  switches to sorted prefix sums with per-card blocker lists. Both modes compute the same value up
  to floating point rounding.
- Contexts are cached per `(node, board, actions taken)` with an LRU per street; the reach weights of
  the flop and turn stages are cached separately.

### W1 exact computation (2026-10-01)

`range-equity.mjs` owns the weighted-range queries. Whole-range floors, ceilings and bluff
classification batch their queries in final-board order, retaining the original scan-to-prefix
transition, rank-prefix accumulation, blocker subtraction and runout accumulation order. Rank
boundaries and board tiers are shared; the first card's subtractions are reusable. River queries
merge sorted hero scores with the per-card prefix lists. Large temporary range/table indexes are
released after the context's equities are cached, including the dense weights and per-card JS
arrays, so the larger context LRU does not keep their indexes alive. River batch prefixes use
worker-local typed scratch buffers; uncommon subsequent point/facts queries reconstruct the
same original indexes from the stored sparse weights.

Long self-play runs also cache equity for counterfactual hands in the saved preflop support.
Computed calls and forced hand-EV actions can reach hands with zero saved-policy reach; without
this completion, their point queries would rebuild and retain the released prefix tables.
Additional queries are appended only after the original three scan queries, so the original
floating-point path is unchanged. Completed caches use packed Float64 values (preserving null,
undefined and signed zero), and large-run reach stages store sparse weights. Small interactive
requests retain their cheaper shared dense stages. A permanent regression test covers the
zero-policy-reach case and index lifetime.

The optional, browser-safe scalar `equity-kernel.mjs` generates a small WebAssembly loop from its
readable assembler. It uses the same sequential f64 operations, without SIMD, fused operations,
reassociation, sampling changes or randomness. CSP/edge environments that cannot compile it use
the exact JavaScript path. Its prefix/card-list preparation also preserves the original rank
order and per-card combo-ID order. `tests/postflop-performance.test.mjs` compares both against the frozen
test-only reference **bit-for-bit**, and pins the allocation-free draw/tier lookup as well. The
existing evaluator reference tests cover the straight-mask lookup.

Offline `simulate` and flop `hand-ev` now use `availableParallelism()` board workers. Each worker
owns one stable inputs/policy identity and computes every history and hand of its assigned board;
board completion order does not affect seed material or report ordering. Audit still replays the
entire fixed-seed report (using the parallel replay) and performs all existing balance checks.
When a hand-EV worker moves to another board, it releases the completed board's contexts,
betting and reach-stage caches, preserving its policy/base weights and large-run storage mode.
All hands/histories within a board still share their caches; completed boards are never revisited.
Workers have explicit 384 MiB old-generation and 64 MiB young-generation heap limits, avoiding
ten independent multi-GiB default heaps; typed-array caches remain outside the JS heap.
The fixed representative-board hand-EV queue uses a measured longest-first order to avoid
starting the expensive low-paired boards only after the first wave has completed. Custom boards
retain their relative order; results are always restored to the caller's original board order.
Shared browser modules do not import the Node scheduler. Per-hand action EV is an exact expectation (see `docs/postflop-flop-base.md`, W3): no sample counts remain on
the EV path.

See `scripts/postflop-ai/perf/README.md` for golden replay, isolated timing and the measured W1
results. Performance changes never author or publish a policy or modify the saved ranges.

## Reading the numbers

The defence is a best response to B, so it is only as sensible as the policy's betting ranges. A
shove range with more air than the bet size can support makes wide calls correct, and a value
hand that deviates to a shove then wins a lot; a value-heavy range folds bluff-catchers. The
`bluff-ratio` balance check is what tells you the betting policy needs regenerating.

## River all-in sized by SPR

The later-street policy gives river first nodes an `allin` share regardless of depth, which at 100bb deep means shoving
about 9x the pot with a wide range. The effective mix (`defence.mjs`, `buildBetting`) therefore applies a computed rule:

- shove/pot = min(stacks) / pot at the decision. When it is above `river_allin_max_pot_ratio` (2.5 in
  `scripts/data/postflop-ai-pilot.json`, about the largest overbet commonly used: 2x to 2.5x pot), the all-in share of every
  combo moves to the largest regular bet (bet125). The all-in stays legal in the tree but is 0% in the shown strategy, so
  the facing-all-in nodes are unreachable.
- At or below the limit the all-in is a natural stack-off and keeps its share for strong hands and the capped bluffs, while
  the medium tier (river draws count as medium) moves to bet125, so there are no thin shoves.
- A null limit switches the rule off (used only by tests of the plain bluff cap).

`DEFENCE_VERSION` is 4. The stored flop base is flop-only and its contents do not change.
