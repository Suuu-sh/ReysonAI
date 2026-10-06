# Stage 1 final candidate: owned-history replay, not adopted

The candidate is isolated from formal4b and all other proposals. It changes only decision-prefix.mjs and effective-reach.mjs. Public createDecisionPrefix keeps the original canonicalPostflopPath then replayDecision branch and read/error ordering. Private historical reach uses the new owned-input branch: replayDecision already canonicalizes the input, so the returned table.path supplies the canonical path. Board/path/future/pending/MAX checks and fresh freezeSnapshot remain. There is no added cache, Map, WeakSet, gate memo or change to legacy45 replay.

Focused tests passed 55/55 in one bounded invocation (13.436 s, exit 0, owned process limits respected). The six new tests compare complete prefixes/hashes/errors with the retained exact4b public implementation, including both trees/all streets, merged all-in aliases, impossible raise→call terminal rejection, suffixes, empty future streets, board order, mutation isolation and public getter/Array subclass/source access ordering. Existing model11 and observable-action contracts also passed. Actual sampled owned-group peak was 380032 KiB.

The existing current-mode wrapper ran fixed cells001/002/059 once each, 64 paired trials per cell, using distinct candidate source pins and unchanged inputs/policies/seed/random stream/cache64 epoch/instrumentation. All192 complete ordered trial objects and full proof arrays matched. Draw/trial hashes, node/decision counts, cache before/after, summaries and every other non-timing engine result field matched. Source provenance and timing/resource observations are retained separately. All three children exited0 and owned cleanup completed.

Primary paired-trial loop times, excluding setup/source checks/storage:
- 001:20.623604→24.131429 ms/trial.
- 002:30.292868→30.959024 ms/trial.
- 059:29.211125→28.732464 ms/trial.
- Total192-trial loop wall:5128.166214→5364.666722 ms (+4.6118%).
- Total loop CPU:7169.069→7533.918 ms (+5.0892%).

Each condition has only one old/new observation; baseline results are the retained earlier fresh formal4b runs. These measurements do not establish a reliable slowdown, but they do not demonstrate a speed gain. The candidate is not adopted. Stage1 closes without a newly adopted optimization, and the next requested720k calculation must use unchanged formal4b. No fourth candidate, profile, repeated measurement, five-family expansion or all1755 run is scheduled.

Evidence: candidate.patch, source/, preparation-manifest.json, candidate-source-pins.json, commands.json, independent-source-review.json, independent-wrapper-review.json, focused-result.json, three-cell-parity.json, actual-validation/, and the three current-cell result/supervision directories. No shared cache or validation contract was changed.
