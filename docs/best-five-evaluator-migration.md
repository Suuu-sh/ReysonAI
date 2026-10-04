# Best-five evaluator correction (2026-10-04)

## Scope of this change

`apps/frontend/scripts/lib/equity.mjs` now ranks only the best five cards. Trips use
two kickers, a pair uses three, and quads/two pair select the highest remaining
rank even when that rank belongs to another pair. The score encoding is unchanged.
`EVALUATOR_VERSION = 2` identifies corrected calculations.

This immediately corrects the shared runtime showdown comparison (including agent
play), postflop rank tables, calculated defence and numerical explanations. It does
not author a new AI policy or rewrite any saved preflop frequency, equity, fact,
reason, policy or practice record. Existing preflop data remains a historical
snapshot with known evaluator error; it must not be described as revalidated.

## Evidence and independent checks

- All 2,598,960 distinct five-card hands agree with an independent, sorted-group
  five-card reference; all category totals and the 7,462 distinct ranks match.
- 30,000 random six/seven-card hands and 12,000 paired-heavy seven-card hands agree
  with the maximum reference score over every five-card subset.
- Explicit regressions cover a pair, trips, two pair and quads that play the board,
  multiple trips, three pairs, wheels, flushes, real kickers and suit/card order.
- The actual showdown engine, check-down and policy-driven agent replay, JavaScript
  and WASM range scans, prefix-index queries and batch queries preserve split pots.
- Six checked BB-vs-BTN cache rows exactly reproduced the old seeded sampler.
  Correcting only the ranking changes A2o from 46.1958% to 47.1292% and 22 from
  45.5125% to 45.8750%. The call-selection gate did not change these six rows.
  These small checks do not establish an overall error rate or frequency impact.

## Runtime cache handling

Derived flop bases now require `evaluator_version = 2` and `defence_version = 6`.
A base lacking the evaluator identity, or carrying an older one, fails the shared
freshness check. The existing deterministic browser computation then supplies the
view. No stored file is deleted or regenerated, and a missing base does not block
an otherwise valid authored policy. The base generator records the new identity
if a separately authorized generation is later run. It is not run by this change.

The defence-version bump also invalidates offline flop hand-EV artifacts that
already check that field. In-memory rank/defence caches are process-local; a new
app worker/process loads the corrected implementation.

## Explicitly deferred data migration

The following historical artifacts are **not** made current merely by this code
fix. Their values and existing validity rules are preserved to keep approved
saved datasets, explanations and audits internally consistent:

1. `src/estimated/call-equities.json` and optional `.local/call-equities-cache.json`
   use version 1, 12,000 samples and input/seed matching, without evaluator identity.
   `apply-call-ev.mjs` can reuse these values and change call/fold frequencies.
2. `five-bet-responses.json` and the BB all-in branch of `limp-deep-responses.json`
   derive frequencies directly from sampled showdown equity.
3. `hand-strength.json` is a generated audit-ordering table. Preflop reason facts
   and advisory raise-EV caches also contain evaluator-derived numbers.
4. Offline later-hand-EV results do not currently validate an evaluator/defence
   identity. Simulation/audit artifacts may contain old outcomes even when source
   policies match. They require a separately reviewed cache migration.

Do not run the normal estimate-publishing pipeline as part of this runtime fix:
valid legacy cache entries could be reused alongside newly computed corrected
entries, while unchanged version 1 would hide the mixed provenance. No claim of
fresh evaluator provenance should be based on those historical checks.

Lowest-risk follow-on: explicitly authorize an isolated, non-publishing migration.
Add evaluator identity to call/raise/fact/strength/all-in and remaining offline
artifact provenance; make the *generation* cache checks reject legacy identity,
while retaining an explicit read-only historical-data path. Produce corrected
side-by-side equity, EV, frequency, reach and reason diffs without replacing saved
files. Review changes and update the shared source fingerprints before any
publication. Do not bump `CALL_EQUITY_VERSION` alone while retaining old JSON:
that would fail the saved-data audit without actually repairing the data.

Authored RFI/opening constants, combo counts, blockers, RNG and range expansion are
not changed. Authored postflop policy constants remain intact; corrected computed
defence may produce different displayed mixes. Prior simulated results are not
retroactively rewritten.
