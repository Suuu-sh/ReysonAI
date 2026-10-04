# LOCAL-only serial HU-after-multiway numerical validation

This runner validates existing, individually authored gpt-6-astra/xhigh policy
pairs. It cannot generate policies, invoke a paid/API model, approve a review,
upload, deploy, publish, run production, generate flop bases or generate hand EV.
Numerical completeness remains separate from independent review and acceptance.

## Compute and selection contract

Run from the approved `apps/frontend` directory. The coordinator must release
the shared numerical slot before `--execute`, including verification-only Node
helpers. The advisory owner lock serializes cooperating runner processes; it
does not replace the coordinator's control of unrelated manual commands.

Each batch contains one to four explicit, disjoint reachable new IDs. Unknown,
duplicate, unreachable and legacy IDs are rejected. A manifest must be a safe
frontend-relative regular file, containing exactly:

```json
{"schema_version":1,"spot_ids":["UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call"]}
```

Stage A precedes Stage B. Stage B is sorted by recorded descending reach, with
ID tie-breaks. Before starting any B batch, the runner requires current reverified
full saved proofs for all 137 A spots and every earlier B spot outside the batch.
It does not interpret a status flag or aggregate summary as proof.

Plan mode is lightweight and starts no Node or numerical process:

```sh
python scripts/postflop-ai/serial-validation.py --spot UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call
```

After the coordinator releases the slot:

```sh
python scripts/postflop-ai/serial-validation.py --execute --manifest .local/postflop-ai/assigned-validation-batch.json
```

The fixed permitted command sequence for each spot is:

1. Official CLI `simulate --spot ID`, all configured 10,000 paired deals per
   representative-board/profile/seat comparison, all twelve representative boards
   accounted for, including explicit jointly unreachable boards.
2. Official CLI `audit --spot ID`, a separate fresh fixed-seed computation. The
   simulation report is the comparison target and is never reused as replay work.
3. Official `audit-all-boards.mjs --spot ID --street all --workers 1`, all 1,755
   canonical flops, followed by official checkpoint companion conversion and the
   existing hardened replay/all-board evidence validators.

Only one child process runs at a time. Every Node parent has a bounded 512MiB
heap; official numerical workers retain their existing resource bounds and
single-worker scheduling. No sample or coverage-reduction flag is exposed.
Later coverage remains four seeded turns and three rivers per turn for each
evaluated flop; it is not exhaustive later-runout enumeration.

## Isolation, identities and storage

Each unique run lives under `.local/postflop-ai/serial-validation/runs/RUN_TOKEN/`.
Its `repository/` is a minimal repository containing exclusive ordinary byte
copies of the complete official CLI/worker/all-board/companion source graph,
separately pinned official package/restore/verify files and documents, all twelve
input files, configuration, runner/verifier and the selected existing policies.
There are no links to live modules. Official identity roots resolve inside this
copied repository and preserve the same repository-relative paths.

The twelve input files currently total 33,091,509 bytes (31.56MiB); the runner
prints the exact actual copied-byte total, including source/config/policy bytes.
One snapshot is shared by up to four spots in that run. It refuses snapshots
over 256MiB and requires at least copied bytes plus 512MiB free disk space.
The default per-run limit is 1GiB and total retained-run limit is 8GiB. Explicit
limits may be selected with `--max-run-mib` (128..4096) and
`--max-storage-mib` (at least the run limit, at most 32768). Periodic checks stop
the child if a limit is exceeded. Logs are bounded to 32MiB each. There is no
automatic deletion or hidden storage growth without an explicit budget.

Live and copied source/input/policy paths are checked for symlinks and pinned
to full byte hashes. The Python parent monitors inode, size and modification
identities during every child and checks byte hashes at phase boundaries. A
running change fails closed. Report bytes are additionally guarded during replay
and all-board work. Reports, checkpoint lineage, summary indexes and audit proofs
are written only in the isolated repository; existing canonical candidates,
reports and unrelated evidence remain unchanged.

Packaging-only files/documents are separately pinned and checked when exporting;
they are not numerical dependencies. A later update to an independent-review
document does not silently invalidate the already verified numerical identity.
All admitted Stage A/earlier Stage B policy and saved-proof identities remain
guarded throughout a Stage B batch, preventing prerequisite revision races.

## Durable receipts, interruption and resume

Every actual command, including helper verification, has immutable start JSON,
bounded raw log and completion receipt containing command/hash, request hash,
working directory, start/end time, actual exit code, errors and exact log hash.
Phase completion pins actual receipt bytes and exact report/proof/summary/
companion paths and hashes. Replay proof uses the official start/end complete
identity. All-board summary/proof binds the full all-board identity and official
verification of every canonical checkpoint row, exact live-range support and
seeded coverage. Zero errors are required; advisory warnings remain visible.
All-board proof filenames include the attempt identifier, so interruption after
proof creation cannot collide with a later resumed attempt's immutable evidence.

SIGINT/SIGTERM terminates the active process group, records the interruption and
releases the owner lock. A failed phase stops the batch. Prior completed phases
can be resumed only with the identical selection and unchanged full identity:

```sh
python scripts/postflop-ai/serial-validation.py --execute --resume RUN_TOKEN --manifest .local/postflop-ai/assigned-validation-batch.json
```

Every saved completed phase is hash-checked and reverified through the hardened
official gates. Missing/corrupt/stale proofs refuse resume. The official all-board
checkpoint mechanism resumes interrupted canonical-board work in its separate
full-identity namespace. This first runner checkpoints simulation/replay phases,
not their intermediate boards. Interrupted simulation/replay must restart their
own computation. A report left by an unproven simulation attempt is never
overwritten: retain that run and choose a new isolated run.

To reverify/export an already complete run without starting any missing numerical
phase, add `--verify-only` with `--execute --resume`. It stops on a missing phase.
No result is labeled accepted, even after all numerical phases pass.

## Explicit export/promote handoff

Completion creates `export-manifest.json` in the unique run directory. It lists
the exact isolated repository, full pin hash, verified report/replay proof/
all-board proof/summary/companion source paths, hashes, sizes and exact canonical
destination paths, plus the actual execution receipt/log records. The runner
does not promote or overwrite canonical artifacts.

The coordinator's explicit handoff must:

1. Reverify the completed run using `--verify-only`, and check the live complete
   source/input/policy pin before packaging or any canonical copy.
2. Select the isolated `repository/` as the root of the existing official
   `packageSnapshot({root, spots, evidence, archivePath, manifestPath})` function,
   or copy only the manifest-listed artifacts to their exact canonical paths.
3. For any canonical copy, reject symlinks/traversal/nonregular paths; use a fresh
   ordinary byte copy with exclusive creation. Existing byte-identical files may
   be reused. Any differing existing report/proof/summary/companion blocks that
   destination; preserve it and request an explicit archival/revision handoff.
   Never force-overwrite, change candidate metadata or relabel old proof identity.
4. Verify all destination hashes and rerun the existing official packaging and
   independent-review gates against the selected root/current code. Keep the full
   original run receipts and raw logs for reviewer inspection.

This contract does not authorize a new review outcome, acceptance receipt,
upload, production import, deployment or publication. Those remain separate.

## Tests and verification status

```sh
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tests -p 'test_postflop_serial_validation.py' -v
```

Tests mock the only process boundary and never run numerical workloads. They
cover the exact serial command sequence and separate replay, safe paths/IDs,
exclusive writes, source/policy changes, single-owner lock, immutable receipts,
failed-phase stop, resume proof/hash gates, Stage-B prerequisites, storage
budgets and isolated byte copies. Node helper smoke checks must be run in a
coordinator-approved quiet gap. No real batch has been run by implementation.

Implementation verification on 2026-10-04: all 31 Python mock-boundary tests
passed. Coordinator-approved bounded Node syntax, live snapshot and isolated
snapshot checks also passed with a 512MiB heap limit. The isolated snapshot had
identical official 47-source/12-input audit identity, 54 numerical-source records,
24 separately pinned packaging-only files, 35,198,172 copied bytes and zero
symlinks. These smoke checks started no simulation or audit workload. A real
end-to-end numerical batch remains unrun.

### Short text ready to append to the batch plan after the active audit

A new LOCAL-only serial-validation runner accepts bounded, disjoint batches of
already-authored Astra/xhigh pairs. It pins the full source/config/input/policy
identity, performs unchanged official full-sample simulation, a separate fresh
fixed-seed replay and all 1,755 canonical all-street checks in an isolated byte-copy
repository, and reuses the hardened official evidence/companion validators.
It records actual command/exit/timestamp/log hashes, resumes only verified complete
phases under unchanged identity, fails closed on changes or missing proofs, and
stops the batch on any failed phase. Stage B waits for current verified completion
of all 137 Stage A and follows recorded reach order. Storage is bounded and
explicit export is no-overwrite. Numerical completion remains unapproved; no
model invocation, automatic review approval, upload, deployment or production
operation is available. The coordinator still owns the shared numerical slot.
