# Three-player postflop saved-byte delivery

Status: implementation preparation, not yet executed or independently accepted. This document does not approve a policy, archive, receipt or production publication.

## Separate identities

- Policy source fingerprint: the exact three live preflop ranges, geometry, classifier and fixed game inputs.
- Numerical implementation hash: the existing isolated Mw3 semantic modules. Presentation/transport code is not injected into that hash.
- Author recipe hash: the accepted V4 pilot keeps its original raw file hash; every new spot binds its own profile and the declared common author source files in fixed order.
- Verification hash: the exact gate, audit, simulation, independent aggregate validator and representative-board inputs. The pilot retains its original gate. New spots use a separate source-pinned CLI and output directory.
- Delivery provenance: the complete current import closure of the Mw3 numerical, author, archive, browser, Range/Agent and backend roots, plus input records, is hash-pinned separately. A delivery-source change requires a new storage review; it does not silently force or skip numerical revalidation.

The sixteen reachable spot IDs stay distinct. Four SB-first-call zero-support paths remain unavailable. The approved build registry at `apps/shared/mw3-approved.ts` is empty during preparation. D1 rows, policy metadata and request parameters cannot add to it.

## One archive per spot

Each immutable `artifacts/postflop/mw3-<slug>.tar.gz` contains exactly seven raw-byte objects:

1. Saved flop candidate
2. Saved turn/river candidate
3. All-1,755-flop structural report
4. Representative later-runout report
5. Joint-defence report
6. Twelve-board self-play report
7. Full same-engine deterministic replay report

Candidate metadata stays pending even after an independent reviewer accepts the exact bytes. Acceptance is a separate receipt. Existing preservation checkpoints and old policy versions are not rewritten.

Content-addressed canonical USTAR entries use fixed mode, uid, gid and timestamps, with deterministic gzip. The per-spot bounds are 16 MiB per extracted file, 48 MiB total raw payload and 8 MiB compressed. Source/input records contain hashes and sizes, not copies of those files. Every recorded path is also verified against a regular blob in the manifest’s real Git source tree; symlinks and submodules are rejected. Remote commit-to-tree correspondence is recorded separately when the source checkpoint is saved to GitHub. The decoder rejects LFS pointers, unknown/duplicate/unsorted members, traversal, links, noncanonical headers, changed bytes, truncation and trailing bytes. Restore preflights the full destination set before writing and refuses differing existing files and symlinks. Interrupted writes can be retried only against exactly identical existing bytes.

The existing `.gitattributes` rule for `artifacts/postflop/*.tar.gz` already covers these archives. A Git LFS pointer or a private local archive is not delivery. Final acceptance still requires the real authenticated LFS upload, an independent clean fetch and exact size/SHA verification. A clean checkout must also fetch the remote-verified source checkpoint commit (or sufficient/full Git history), so the pinned source tree and blobs exist. A default depth-1 archive commit checkout may lack that tree and must fail closed; do not rewrite the manifest to evade this check.

## Local commands

The accepted CO→BTN→BB pilot retains `materialize-mw3-pilot.mjs` and `gate-mw3-pilot.mjs`; do not re-label its historical reports.

Every other authored spot requires all three explicit arguments:

    node scripts/postflop-ai/materialize-mw3-authored.mjs --spot <exact-id> --model gpt-6-astra --source-hash <exact-fingerprint>
    node scripts/postflop-ai/gate-mw3-authored.mjs --spot <exact-id> --model gpt-6-astra --source-hash <exact-fingerprint> --all-flops --later --joint --simulate --replay

A missing author, pin mismatch, incomplete geometry, stale artifact or differing prior report fails closed. No sample count or coverage-reduction switch exists. The common recipe registry and author decisions must be independently reviewed before materialization.

Saved-byte operations use:

    node scripts/postflop-ai/mw3-snapshot-cli.mjs package --spot <exact-id> --source-hash <exact-fingerprint>
    node scripts/postflop-ai/mw3-snapshot-cli.mjs verify --spot <exact-id> --source-hash <exact-fingerprint>
    node scripts/postflop-ai/mw3-snapshot-cli.mjs restore --spot <exact-id> --source-hash <exact-fingerprint> --restore-root <existing-empty-directory>
    node scripts/postflop-ai/mw3-snapshot-cli.mjs sql --spot <exact-id> --source-hash <exact-fingerprint>

`package` only preserves unapproved bytes. `verify` and `restore` do not grant acceptance. `sql` additionally requires a separate matching `configs/mw3-<slug>.review.json`. None of these commands executes D1, calls a model, uploads, deploys or writes an approval receipt.

## Evidence and receipt gate

The read-only snapshot verifier checks both saved candidates, source/implementation/recipe identities, complete 1,755-flop and representative later coverage, all 108 joint diagnostic event slots with at least 20,000 accepted tuples for each supported event, independent aggregate accounting over 12 × 10,000 self-play hands, and a matching full deterministic replay.

Joint MDF deviations remain advisory and must be independently reviewed; they are not mechanically repaired. A recorded zero-support reason is not solver proof and requires source/policy review. Same-engine replay proves reproducibility, not equilibrium or independent algorithmic correctness. Structural warning counts, joint warnings and these limitations are pinned in the separate review receipt.

A valid receipt identifies distinct author and reviewer tasks using the requested Astra model, the exact Git source tree, archive/manifest/content/source/input hashes, the accepted spot, complete evidence summary and both delivery pins. No production receipt has been written by this implementation preparation.

## D1 and browser boundary

The shared registry pins spot, stage, source, implementation, policy and delivery-header hashes. The dedicated read-only `/v1/mw3/manifest` and `/v1/mw3/part` routes never consult HU policy caches. An empty registry returns unpublished before querying D1.

Policy JSON is losslessly dictionary-encoded, split into bounded 16,000-UTF-16-unit chunks without cutting surrogate pairs, and protected by part, payload, decoded-policy and header hashes. The browser also verifies the live input fingerprint and complete required node inventory.

SQL touches only `mw3_policy_deliveries` and `mw3_policy_parts`. There are no deletes or global dataset-version changes. Repeating identical rows is idempotent; a conflicting same-hash row deliberately violates NOT NULL instead of overwriting it. The entire per-spot SQL file must be executed as one D1 batch. Every statement is limited to 90,000 UTF-8 bytes.

The SQLite transaction tests are a reference check only. The strict pinned D1 runtime still needs a real per-spot roundtrip, second import, corrupt-row rollback, API restoration and restart check. Database schema registration, final LFS receipt, complete regression/build/browser QA and the authorized release order are separate remaining gates.

## CI

Actions may check syntax and toy contract fixtures and verify/restore already-approved saved bytes. They must not author strategies, compile real candidate recipes, run the quantitative gate or AI review, upload archives, approve receipts or publish data. Expanded candidate JSON and local audit outputs remain ignored.
