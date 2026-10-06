# Gate geometry memo: rejected performance candidate

Decision: do not adopt this isolated candidate and do not repeat or expand measurements. The exact formal model11 source remains unchanged at `4b6b39a613afe72a2362f85aa93a305cd61b3586`.

The candidate only stores the owned frozen prefix geometry's canonical string in the existing gate last-request slot. It retains live geometry and pending validation, unusual-array fallbacks and release behavior. It changes `gate-model11.mjs` only (4 insertions, 2 deletions). It does not change MC per-trial execution, policies, full407 coverage or the separate revised validation contract.

## Verification

- Existing prepared-prefix, gate and gate-vector tests: 14/14 passed, 0 failed/skipped/cancelled. One bounded invocation, exit 0, 4.354 s, sampled owned-group peak 272096 KiB, no resource stop.
- Exactly one fresh baseline/candidate comparison used the same accepted BTN cold-3bet policies, literal As7d2c board and all-street inherited runouts.
- Unchanged existing Python comparator passed every ordered result field, including laws/proofs, coverage and cache counters, omitting only `diagnostics.elapsedMs`. Both runs covered 444 prefixes, with 0 errors and 14 warnings. Distinct source identities were retained.
- The existing source review approved only the isolated comparison. This is not acceptance of the candidate source or new numerical coverage.

## Single-pair measured timing

The timing boundaries differ and must not be mixed:

- Result `diagnostics.elapsedMs`: baseline 18802.622645 ms; candidate 20040.649539 ms. This timer begins inside `checkModel11Balance` after bridge/execution preparation. The candidate took 6.5843% longer on this metric in this single pair.
- Harness `gateMs`, enclosing the entire `checkModel11Balance` call: baseline 18860.063418 ms; candidate 20103.827648 ms.
- Supervisor total wall time, including Node startup and harness setup/output: baseline 19.349 s; candidate 20.617 s.
- Harness CPU user+system for input loading and gate call: baseline 22758.209 ms; candidate 24426.489 ms.
- Sampled owned-group peak RSS: baseline 436752 KiB; candidate 434592 KiB. Both exited 0, without time/RSS/host-floor stops.

This single pair did not demonstrate a speed improvement. It does not establish a statistically reliable slowdown either. No five-family expansion, all1755 run, MC measurement or adoption was performed for this candidate.

## Evidence

`candidate.patch`, `source/`, `preparation-manifest.json`, `commands.json`, `independent-source-review.json`, `focused-result.json`, `one-pair-result.json`, `actual-validation/`, and `results/` preserve the exact proposed bytes, original test bytes, pins, terminal logs and complete old/new outputs. Raw inputs and policy fixtures remain referenced by verified byte count and SHA256 instead of duplicated in this small archive.
