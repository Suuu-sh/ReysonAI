# Fixed pilot1755 four-lane wrapper

Static implementation only. No Node, benchmark, numerical generation, supervisor
launch, old full representative replay PASS, or acceptance is claimed here.

## Exact lineage and scope

The source base is c8d2c8bab4eb1db886f5055e8e6396a70921dc69. Every existing
postflop numerical/helper module and strict graph dependency remains byte-identical.
The output codec, its CLI/source-capture entry and Python inventory checker are
byte-identical to 47a1394a59829934d00d25e6673c9f4877980e64. The integrated source
identity separately binds strict, output, wrapper and controller inventories. It
never invokes the selected-regression source allowlist or relabels old rows.

Only BTN_open_SB_3bet_BB_call_BTN_fold, the existing full all-boards plan, all
streets and the original ordered 1,755 canonical boards are accepted. Lane k owns
indices i % 4 == k: 439/439/439/438. Each store carries the same full binding.

The proof read/semantic-verification/persistence blocks are mechanically extracted
from the frozen driver and checked byte-for-byte. The numerical row producer,
row validator, support/physical-law verifier, runouts, threshold logic and final
aggregation are unchanged. The existing advisory and global findings are preserved.

## Evidence and failure behavior

Prepare validates the source, exact inputs, full plan and runtime pins, then creates
a fresh run root. Each lane has its own checkpoint root, exclusive producer lock
and immutable attempt provenance. Existing same-binding rows are fully verified;
reused rows never count as newly computed. Unowned rows, symlinks, partial files,
or orphan proof envelopes block admission. Failed evidence is preserved. A
SIGKILL can leave a producer lock; it deliberately blocks automatic resume until
terminal ownership is established and a separately reviewed recovery is performed.

The fixed Python controller owns exactly four sessions, records PID/start ticks,
wait4 CPU/maxRSS, samples at 50ms, and uses 512MiB heap / 900MiB per-owned-group RSS /
3072MiB aggregate RSS / 2GiB available-memory floor. It preserves terminal/reap
evidence before source postflight. The caller must supply an explicit reviewed
window; this implementation does not choose or approve an initial long run.

Finalization requires a pinned successful supervision receipt, exact matching
commands/attempts, four terminal/reaped/absent owned groups, complete owned rows,
semantic proof validation and an exact disjoint union of indices0..1754. It copies
proofs before checkpoints into a new immutable merged store; conflicts cannot be
overwritten. Existing evidence is checked before the unchanged runModel11AllBoards
call and at its pre-generation assertion; onBoard also throws defensively. The
unchanged47 partition/materialize/consume codec then performs lossless roundtrip
and another original semantic aggregate check with the same missing-row guard.
Merged/validated rows do not add to the 1,755 unique original board count. Quality
errors yield exit1; warnings remain present. Component all-board output is separate
from revised common-engine/per-policy acceptance and never claims the old full
representative replay passed.

## Explicit future invocation contract

Author an external pinned spec after this source is committed and reviewed:
kind=model11-pilot1755-fixed-lanes-spec, version=1,
repository={root,executionCommit}, inputs={spot,files:{flop,later,plan}},
runRoot, node={path,version,binary:{bytes,sha256},execArgv:[--max-old-space-size=512]},
windowSeconds (an explicit parent-approved bound), source={identityHash}.
File records are repository-relative {path,bytes,sha256}; runRoot is absolute and
outside the source repository. No launch-ready spec or window is supplied here.

Prepare/lane CLI arguments require --spec, --spec-sha256, --spot and --execute-full.
Lane additionally requires --operation lane --lane 0|1|2|3.
Finalization requires --operation merge-validate-encode --require-existing
--gate-operation all-boards --supervision ABS_RECEIPT --supervision-sha256 SHA.
The explicit all-boards token preserves truthful command validation by the original
receipt validator. Finalization has no --execute-full generation permission.

## Checks

Run the Python verify-model11-pilot1755-lanes.py checker to verify inventories,
raw12 pins, byte-equality, extracted blocks, modulo partition and Python syntax.
JavaScript syntax/runtime execution remains unrun. Before any long run, separately
authorize bounded serial-versus-lane row parity (including proof-bearing/all-street
cases), missing/tampered/rehashed-omitted support, unowned/duplicate/partial store
admission and missing-checkpoint no-generation tests, and the existing47 codec
size-cap/lossless tests. These are prerequisites, not inferred passes.
