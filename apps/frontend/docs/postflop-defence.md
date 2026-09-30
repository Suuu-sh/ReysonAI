# Computed defence at facing nodes (postflop pilot)

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
   - Turn and flop: realized equity = equity x R, with R = `defence_realization` in
     `scripts/data/postflop-ai-pilot.json` (1.0 in position, 0.9 out of position). **This is an
     explicit estimate of how much of its equity a hand realizes on later streets, not a solved
     value.**
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
required equity, the combo's equity and realized equity, the margin and the call share, the
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

## Reading the numbers

The defence is a best response to B, so it is only as sensible as the policy's betting ranges. A
shove range with more air than the bet size can support makes wide calls correct, and a value
hand that deviates to a shove then wins a lot; a value-heavy range folds bluff-catchers. The
`bluff-ratio` balance check is what tells you the betting policy needs regenerating.
