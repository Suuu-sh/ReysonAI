# Committed MW3 saved-byte verification and restore

Run from the repository root, with Node 22.20 or newer:

```sh
node apps/frontend/scripts/postflop-ai/mw3-reviewed-restore.mjs verify
node apps/frontend/scripts/postflop-ai/mw3-reviewed-restore.mjs restore
```

`verify` checks the actual committed saved inventory without writing. `restore` performs the same checks and restores only independently accepted existing bytes to ignored `apps/frontend/.local/postflop-ai/mw3/` paths. Both commands have fixed repository/registry/receipt locations and no fixture, alternate-approval or generation options. They do not compile a recipe, call its authoring function, run strategy materialization/MC/audits/AI review, prepare SQL, upload, query or import a database, change publication pins, or deploy.

## Complete saved inputs

Each saved spot requires all three committed files:

- `artifacts/postflop/mw3-<spot-slug>.manifest.json`
- `artifacts/postflop/mw3-<spot-slug>.tar.gz` (the materialized payload, not its Git LFS pointer)
- `configs/mw3-<spot-slug>.review.json` (an existing separate independent acceptance receipt)

Committed MW3 names are reconciled exactly against the working filesystem using the captured current Git tree. Removing an entire committed triple cannot turn it into a valid empty stage; added/uncommitted, partially removed and unexpected names fail.

An optional matching `.sql` file is discovered as part of the same inventory but is not executed or validated by this byte-restore command. Its exact identity belongs to the separate strict LOCAL D1 gate. Unexpected MW3-prefixed files, orphan files, incomplete triples, links, dirty/uncommitted saved inputs, noncanonical or wrong LFS pins, direct Git archive blobs even with identical bytes, corrupt/extra/missing archive entries, changed source/input identities, nonexistent or mismatching source trees and stale/fake receipts fail closed. Inventory is bounded to 16 spots and 256 MiB expanded saved bytes.

The archive keeps the candidate metadata pending and the preservation manifest `approval: unapproved`. Acceptance is established only by the separate receipt matching the exact manifest/archive/content/source/input hashes, policy/delivery identities, author and distinct reviewer tasks, evidence and accepted limitations. Receipt-contract toy fixtures cannot pass the real source/input/evidence snapshot verifier.

A zero-file saved inventory plus the actual empty build registry returns `no-reviewed-saved-data`, with zero accepted/restored files. This is a valid preparation stage, not acceptance or production readiness. A missing receipt beside an archive/manifest is a failure, not a reason to skip validation. For deliberate **unapproved preservation**, use the separate `mw3-snapshot-cli.mjs package` / `verify` / `restore` commands; those explicitly report preservation without approval and do not belong to the reviewed-restore CI inventory until a real matching independent receipt exists.

## Source and registry authority

`source_tree` must name an existing regular Git tree whose exact regular blob inventory matches all pinned source/input records. Current checkout bytes and complete dependency inventory must also match, and every source/input record is checked against the captured **current committed tree** as well as the accepted historical source tree. A dirty rollback to historical bytes cannot hide an altered current commit. CI uses full Git history (`fetch-depth: 0`) and materializes LFS, so a snapshot's prior source tree remains available after the snapshot/receipt are committed. No credential-bearing network fallback is used by the verifier.

The additive restore verifier is a delivery root in `sourcePathsFor` before final archives are frozen. The source inventory still includes the **actual** `apps/shared/mw3-approved.ts`. Registry verification is separate from independent strategy acceptance: every nonempty registry entry must match an accepted saved delivery identity, with a complete flop/later pair and no duplicates. Saved accepted pairs may exist while the registry remains empty. Database rows, URLs, query parameters, candidate metadata and receipts alone cannot register a policy.

The shared registry must remain a static `Object.freeze` literal; future nonempty rows use JSON-compatible quoted object keys/strings. The verifier parses this narrow authority without executing TypeScript or accepting expressions/another registry. It never edits the registry.

Moving the registry from empty to published changes a pinned source. The old snapshot/receipt must fail; publication requires a new committed source snapshot and matching independent receipt. Do not exclude the registry to break this circularity. The preserved numerical policy bytes may remain identical, but their accepted source/delivery context must be reviewed again.

## Safe restore and CI limits

Saved manifest/receipt/archive inputs are captured using bounded regular-file descriptors with no-follow and before/after file identity checks; their same raw bytes are verified. Each spot is verified sequentially inside a one-spot scope. Only whitelisted path/size/hash/source-tree/delivery-pin records escape into the global ledger; raw captures, tar/file buffers, parsed policies/reports, receipts and transport parts are released. The optional contract-probe memoization is cleared in finally after each spot. All 16 spots and the original data coverage remain supported. Captured inputs and every reviewed source/input hash are rechecked immediately before restoration. All spot destinations are preflighted before any writes, including collisions, links, tracked paths and ignore coverage. Restoration then rereads and fully reverifies one previously accepted spot at a time against its exact ledger before writing. The archive writer rechecks individual destinations and uses exclusive creation. Different existing bytes stay intact; retrying identical bytes is allowed.

Run restoration in an exclusively controlled checkout. Persistent links and observed path/file changes are rejected, but ancestor traversal/writes remain pathname-based: hostile concurrent parent-directory replacement is outside this guarantee. Global preflight is not a filesystem transaction; a later I/O failure/race can leave some verified new files written. Earlier identity helpers also retain legacy fileRecord/readFileSync reads; do not describe the entire dependency pipeline as descriptor-captured.

Actions always runs inventory validation, even with no saved data, and restores only when real matching receipts exist. It never manufactures a receipt or generates policy/evidence. Synthetic contract tests establish boundary behavior only. The strict `verify-mw3-local-d1.mjs` gate still deliberately requires the **empty** real registry; this restore integration neither removes that guard nor establishes production delivery, remote D1 atomicity, activation, or browser/product readiness. Production registry changes, publication/deployment, and the applicable independent delivery/product review gates remain separate.

Focused checks (after an explicit coordinated compute lease):

```sh
NODE_OPTIONS='--max-old-space-size=256 --max-semi-space-size=8' node --expose-gc apps/frontend/tests/helpers/mw3-saved-memory-fixture.mjs
node --test apps/frontend/tests/postflop-mw3-saved-restore.test.mjs apps/frontend/tests/postflop-mw3-archive.test.mjs apps/frontend/tests/postflop-mw3-source-tree.test.mjs apps/frontend/tests/postflop-mw3-reviewed-delivery.test.mjs
```

The standalone memory regression constructs 16 labelled synthetic 15 MiB file buffers, 8 MiB archive buffers and 16 MiB parsed-object payloads. It exercises the same compaction boundary under the CI 256 MiB old-space limit, verifies collection via WeakRefs after turn boundaries/GC, and checks small retained ledgers and bounded post-GC heap/external memory. It never constructs a real receipt, invokes strategy generation/MC or passes the real snapshot gate. This establishes a lifetime regression, not the full real 16-archive acceptance proof.

Historical diagnostic 5a966f used Node24.19.0/384 MiB old-space: syntax4, toy12 and actual zero-inventory verify/restore passed. The revised sequential/inventory/source-tree/LFS implementation and new memory regressions are **unrun** pending another coordinated compute lease; Node22 Actions, real nonempty saved-data, LOCAL D1 and production gates remain unproved.
