# Hash-verified postflop artifact storage

This is a storage and verification contract, not a policy approval. Expanded saved
policy JSON remains under ignored `apps/frontend/.local/postflop-ai/`; it is never
added directly to Git. These tools do not generate strategies, replay simulations,
approve themselves, publish to D1, upload LFS objects, or modify Stage 2 tooling,
its receipt, or its deployment workflow.

## Deliverables and scopes

- `artifacts/postflop/hu-after-multiway.tar.gz`: deterministic Git LFS payload.
- `artifacts/postflop/hu-after-multiway.manifest.json`: ordinary-Git inventory and
  raw-byte SHA-256 identities. It always says `approval: "unapproved"`.
- `configs/hu-postflop-after-multiway.review.json`: separate, independently supplied
  review receipt, only after successful review. Packaging never creates this file.

The archive may preserve both `new-candidate` policy pairs and `preserved-legacy`
bytes. These classifications cannot substitute for each other. A missing new
report is allowed in a candidate snapshot and is visibly recorded as `missing`;
a present stale/incomplete new report is rejected. A stale legacy report can be
preserved exactly as historical bytes, never upgraded or presented as fresh.
For example, a recovered DEFENCE_VERSION 5 report must not become a version 6
report by rewriting its metadata. Missing legacy files are not generated or
filled from another spot. Selecting the catalog does not prove all 45 legacy
artifact sets exist or all 407 new spots have policies.

Every manifest separately records the complete current new-spot catalog IDs,
their aggregate identity, the included new IDs, and every omitted ID with an
explicit unavailable-in-this-snapshot reason. `--all-present` never means full
catalog completion. The current delivery target is all 407 new spots (A:137,
B:270); partial candidate preservation does not change that target.

## Explicit collection

From `apps/frontend`, select exact new and/or preserved spot IDs:

```sh
node scripts/postflop-ai/package-reviewed-postflop.mjs \
  --spot UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call \
  --preserve-legacy BTN_open_BB_call \
  --evidence .local/postflop-ai/representative-audit-evidence.json
```

Alternatively `--all-present` examines only catalog-derived canonical filenames.
It does not recursively traverse `.local`. It includes only each selected spot's
`-policy.json`, `-later-policy.json` and `-report.json`. New spots must have both
of their own policy files, valid under `loadInputs`, `loadCandidate` and
`loadLaterCandidate`, authored with the requested Astra model. Present reports
must satisfy the exact `isFreshSimulationReport` publication contract. Packaging
runs no audit or simulation. It does not imply that a candidate is accepted.

Audit evidence is opt-in using repeatable `--evidence`. Only these JSON path
shapes are accepted:

- `.local/postflop-ai/representative-audit-evidence.json`
- `.local/postflop-ai/audit-evidence/<spot-or-proof-name>.json`
- `.local/postflop-ai/all-boards-audit/<spot>--<full-identity-sha256>.json`
- `.local/postflop-ai/all-boards-audit/<spot>--<full-identity-sha256>.checkpoints.json` (the bounded completed-run companion only)
- Older canonical `<spot>.json` / `<spot>.checkpoints.json` remain allowlisted for historical preservation only; current acceptance requires the identity-specific names.

Each JSON must identify its selected `spot`. Authoring logs, credentials, prompts,
checkpoint directories, arbitrary files, generated code, hand-EV outputs and
recursive `.local` contents are not collected. Successful evidence may contain a
reviewable exact audit log text and its SHA-256, without collecting unrelated logs.

Outputs refuse replacement. Use a new basename with `--archive` and `--manifest`
when retaining an older snapshot. Package only after source changes are complete:
the source/config/input identities are deliberately invalidated by later changes.

## Archive and identity details

The manifest records:

- Raw byte count and SHA-256 for every restored file, plus its spot and kind.
- The exact safe destination and content-addressed `objects/<sha256>` USTAR name.
  The 85-character slugs and `-later-policy.json` suffix are never truncated to fit
  a 100-byte USTAR basename. Identical byte payloads share one object.
- Current and saved input fingerprints, flop/later policy hashes, and explicit
  policy/report freshness for each spot.
- Sorted raw-byte records of the complete static local import graph of authoring,
  simulation, audit, publisher and archive-verification entry points, plus the
  worker entry point, package/lockfile, policy knowledge and LFS attributes.
- Sorted raw-byte records of the exact persisted preflop input datasets, including
  Stage 2 continuation inputs, without reauthoring or repackaging those inputs.
- Source/input aggregate hashes, complete content identity and archive SHA-256.
- The exact expected/included/unavailable new-spot coverage, independent of what
  happens to be present in the author's filesystem.

Object order is bytewise sorted; mode is 0644; UID/GID, user/group names and all
mtimes are fixed; gzip mtime is zero. Verification requires canonical regular-file
USTAR headers and padding. There are no links, directory entries, PAX extensions
or filesystem-derived metadata. Repeated packaging with the same bytes and
Node/zlib implementation produces the same archive. The archive's committed
SHA-256 is authoritative across toolchain versions.

Limits: 16 MiB per archived file, 256 MiB total uncompressed artifact content,
64 MiB compressed archive, 4,096 files and an 8 MiB sidecar. The decoder enforces
an additional exact decompression bound derived from the validated inventory.

## Verification and restoration

Materialize the actual Git LFS object for the exact checked-out revision using
the repository's authorized Git LFS workflow. A pointer-only checkout fails;
a missing payload is never treated as an empty or successfully restored snapshot.
The pinned persisted preflop inputs must also exist first, including the already
reviewed Stage 2 bytes restored through its unchanged tooling.

```sh
node scripts/postflop-ai/verify-reviewed-postflop.mjs
node scripts/postflop-ai/restore-reviewed-postflop.mjs --allow-unapproved
```

The first command is read-only integrity verification. Its unapproved status is
intentional. The second is an explicit local opt-in to restore unapproved
candidates for review, not permission to publish them. Source/config/input hashes,
catalog identities, complete entry set, hashes and every destination are checked
before any destination directory or file is written. Existing identical files
are accepted; a single differing existing file rejects the entire preflight.
Symlinks, dangling links, nonregular entries, traversal, duplicate destinations or
archive entries, unexpected objects, malformed/truncated/oversized data and
hash/set mismatches fail closed. Files are created exclusively, never truncated.
The preflight protects against ordinary workspace conflicts; filesystem writes
are not a transaction against a concurrent hostile process mutating directories.

## Independent acceptance gate

Only a separately reviewed receipt can accept a specified subset of new spots.
The receipt binds `manifest_sha256`, `archive_sha256`, `content_sha256`, a 40-hex
`review.baseline_commit`, independent `review.author` and `review.reviewer`, a
review `scope`, and `review.status: "independently-reviewed"`. Its
`accepted_new_spots` rows contain `spot`, `representative_evidence` and
`all_board_evidence` as exact repository-relative archived evidence paths. Its
`preserved_legacy_spots` must exactly match the sorted preserved manifest IDs.
Other new candidates remain unapproved even when stored in the same bundle.
The receipt must also declare `coverage.scope` as `complete-catalog` or
`reviewed-subset`, copy the manifest's `coverage.catalog_sha256`, list the exact
sorted `coverage.expected_new_spot_ids` it accepts, and supply
`coverage.deferred_new_spots` as a sorted array of `{spot, reason}` for every other
catalog ID. Complete-catalog approval requires all 407 current new IDs and no
deferrals. A subset requires explicit reasons even for still-unaudited candidates
that are included in the same archive; a five-pair bundle cannot silently claim
full completion.

Each accepted new spot must have all of:

1. A valid current flop/later pair and a complete fresh simulation report.
2. Actual successful fixed-seed full CLI audit evidence, with command, exit 0,
   timestamps, source/policy/raw-artifact hashes, numerical code hashes and exact
   hash-verified PASS log. A cached report or structural-only check is insufficient.
3. Actual successful all-street 1,755-canonical-flop evidence, command/exit/times,
   the same exact identities, evaluated plus proven-unreachable count of 1,755,
   zero errors, and the hash-verified complete all-board result in the archive.
   Per-board checkpoints and partial coverage do not meet this condition.
4. Independent examination of the substantive policy and audit evidence.

Audit proof JSON uses schema version 1 and `status: "pass"`, with `spot`,
`command`, `exit_code`, `started_at`, `completed_at`, `source_fingerprint`,
`flop_policy_hash`, `later_policy_hash`, `artifact_sha256` keyed by `candidate`,
`laterCandidate`, `report`, and `log: {text, sha256}` with a raw-text log hash.

Representative proof additionally supplies `fixed_seed_replay_pass`,
`checkedCombos`, `comparisons`, and `audit_identity: {start, end, sha256}`. The
identity is captured by the official CLI immediately before and after the actual
full audit. `captureAuditIdentity` follows the complete transitive static and
literal-dynamic local import/export graph from the CLI and explicit board-worker
entry point, including cached values, browser inputs, sizing and JSON configs.
It separately hashes the complete 12 persisted input datasets. Both recorded
identities must exactly match each other and a fresh verifier capture, with
`sha256` equal to SHA-256 of `JSON.stringify(start)`. Every captured record must
match the archive's source/input ledger. A hand-selected list of code hashes is
insufficient. Older proofs and disclosed prompt-only exceptions may be preserved
as historical evidence, but cannot be supplemented after the run or used for
current acceptance: the official full audit must run again with start/end capture.

All-board proof adds `street: "all"`, `canonical_flops: 1755`, `evaluated_boards`,
`proven_unreachable`, `errors: 0`, `identity_hash`, `later_coverage`,
`result: {path, sha256}`, and `checkpoint_companion: {path, sha256}`. Its numerical
identity is the runner's `allBoardIdentity`, recomputed from the complete transitive
static/literal-dynamic source and JSON/config graph rooted at `audit-all-boards.mjs`,
plus current input fingerprint and policy hashes. `captureSourceGraph` is shared
with the CLI identity capture; no hand-maintained dependency subset is sufficient.
This includes authoring loaders, opponent-profile definitions, cash/Stage 2
configuration and the generated HU catalog. It does not depend on unrelated
later CLI edits.

Each worker computes this identity from the inputs and policy pair it actually
loaded, and checks the parent's expected hash before emitting any checkpoint.
After all workers complete, the main process reloads inputs and both policies,
recaptures the full source graph, and requires the original identity before
writing a completed summary. A mismatch fails the run; partial checkpoints do
not become a new completed result. No numerical audit or sampler behavior is
changed by these guards.

Completed summaries are immutable at
`all-boards-audit/<spot>--<full-identity-sha256>.json`, and companions use the same
basename plus `.checkpoints.json`. The full hash is mandatory, never shortened.
An identical repeated write may reuse existing bytes; differing existing bytes
or symlink destinations fail without replacement. `summary.md` is only a mutable
index linking the current run's immutable files. Historical v2 canonical paths
are not renamed, overwritten or republished as current acceptance after source
or policy changes.
The complete original result is kept byte-for-byte; its SHA-256 is not rewritten
to accommodate additional verification. Frontend-relative result/companion paths
are accepted; the manifest's evidence paths are repository-relative.

### Completed checkpoint companion

Only after the original all-board command has completed and written its summary:

```sh
node scripts/postflop-ai/package-all-board-companion.mjs --spot <spot-id>
```

This read-only-to-inputs conversion performs no numerical audit and cannot
approve anything. It reads the current identity's `identity.json` and exactly
1,755 canonical checkpoint files, verifies their identity keys and original row
hashes, and writes only `.local/postflop-ai/all-boards-audit/<spot>--<full-identity-sha256>.checkpoints.json`.
It never modifies the active runner, checkpoints or summary. Missing checkpoints,
wrong identities, changed hashes, malformed coverage and different existing
companion bytes fail closed. Collection is limited to 512 KiB per checkpoint and
16 MiB total input and output; unrelated checkpoint files are never collected.

The compact companion schema is:

- `schema_version: 1`, `kind: "completed-all-board-checkpoints"`, `spot`,
  `street: "all"`, `identity_hash`
- `summary: {path, sha256}` pinning the unchanged original summary
- `rows`: exactly the 1,755 unique canonical board rows in the runner's order
- `row_sha256`: the corresponding original checkpoint row hashes in that order

Each evaluated board must have `flops: 1`, `reachable_flops: 1` and complete
integer later coverage. Evaluated plus proven-unreachable turns must total four;
evaluated plus proven-unreachable river runouts must total twelve, matching the
frozen deterministic sampler. An unreachable flop must have no findings or
later-coverage object. An aggregate count of 1,755 flops with just one turn/river
cannot pass. These checks describe the recorded representative runout sampling
on every canonical flop, not exhaustive enumeration of all turn/river cards.

The verifier recomputes every aggregate, including clean/unreachable/evaluated
counts, all later coverage, errors, ordered findings, counts and example lists,
and requires equality to the pinned original summary. Its historical
`findings[].boards` field counts finding occurrences, which may repeat on one
board for different sizes; the companion preserves that behavior without
silently converting it to a unique-board count. Archive the proof, original
summary and companion explicitly with three `--evidence` options. Raw checkpoint
directories remain ignored and are never recursively archived.

```sh
node scripts/postflop-ai/verify-reviewed-postflop.mjs \
  --review configs/hu-postflop-after-multiway.review.json
node scripts/postflop-ai/restore-reviewed-postflop.mjs \
  --review configs/hu-postflop-after-multiway.review.json
```

Verification of a reviewed subset is not D1 publication authorization. CI may
fetch LFS, restore and verify the exact reviewed bytes; it must never invoke the
packager, author/replay policies, or update an approval receipt automatically.
No postflop deployment workflow is added by this storage change. The existing
Stage 2 delivery contract remains untouched.

## Focused tests

`node --test tests/postflop-artifact-storage.test.mjs tests/postflop-all-board-companion.test.mjs tests/postflop-all-board-lineage.test.mjs` uses synthetic artifacts and tiny per-board records. It checks deterministic long-name round trips, raw-byte preservation,
malicious/noncanonical archives, missing/extra/duplicate files, truncation,
oversize, pointer-only LFS, preflight non-overwrite, symlink rejection, separation
of historical preservation and acceptance, official transitive start/end identity, exact per-board coverage/aggregate reconstruction, and failure without real audit proof.
It runs no strategy generation, simulation, full-board audit or production action.

## Separate immutable legacy source

The recovered 45 old HU sets are preserved byte-for-byte in `artifacts/postflop/legacy-hu45-source.zip` (Git LFS) with `legacy-hu45-source.manifest.json` in ordinary Git. Run `python3 scripts/postflop-ai/preserve-legacy-postflop.py --verify` to verify the authorized transfer hash, exact 137 ZIP entries, all 135 payload hashes, baseline fingerprints and policy/report identities. The tool never restores over canonical policy files or generates policy/report data. Every report stays at historical defence version 5; preservation does not grant current-code audit or publication approval. The three older canonical BTN serializations remain untouched, while the ZIP retains the exact received originals.
