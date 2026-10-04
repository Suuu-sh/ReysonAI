# MW3 saved-byte restore: independent static review

Date: 2026-10-04 (UTC)

## Latest review status

**0fbe36f7ccbf085b16698b0fe17658c9a98fa913: GO for the static source-level remediation only.** All five original implementation findings are addressed in the inspected fixed commit. The final tests, synthetic memory fixture, real nonempty restore and full sixteen-spot capacity/time checks remain unrun or unavailable. This is not an executed CI pass, real-data acceptance or production-readiness decision. The revision-specific addendum below records the scope and remaining limits.

## Original decision: 498bd0f

**NO-GO for the saved-restore/CI implementation as reviewed.** Five changes below are required before this implementation can be treated as a reliable committed-inventory gate. This is a source review, not independent acceptance of any policy, archive, receipt, database delivery, browser experience, or production release.

- Reviewed commit: `498bd0fd0589ca13d616eb3f4c5d26b3ce70ead5`
- Baseline: `a85bf69677a111cf9c4c03383781bec273c28cde`
- Main implementation commit: `5a966f7216e8179fde12a01d0c006d0ca0045ee4`
- Scope: the six changed paths, plus the source-tree, snapshot, archive, receipt, policy-transport and safe-I/O functions they call.
- Method: read-only source/diff inspection and small Git/Python metadata checks. No Node, npm, esbuild, tests, recipe compilation, policy generation, Monte Carlo work, D1, browser operation, deployment or publication was run during this review. Only this review document was written.

## Required changes

### R1 — High: accumulated decoded snapshots are incompatible with the intended bounded-memory CI design

Locations: `scripts/postflop-ai/mw3-reviewed-restore.mjs:160–177,181–194`; `mw3-reviewed-snapshot.mjs:58–72,95–106`; `mw3-reviewed-archive.mjs:105–123`; `.github/workflows/verify-mw3-contracts.yml:39–41`.

`snapshots.push(snapshot)` retains every spot's raw artifact buffers, parsed candidate policies, parsed reports, manifest and compressed archive until the final restore finishes. The artifact buffers are subarrays of the decoded tar, so their backing tar allocation also remains live. `captures` additionally retains every saved input buffer. The captures and snapshots can share the same compressed buffer; they should not be counted as independent copies, but neither reference permits that buffer to be released.

`TOTAL_LIMIT` limits the sum of recorded raw artifact bytes, not parsed-object heap, temporary JSON/codec work, compressed inputs, or peak RSS. It is checked only after the next snapshot has already been decoded and verified. Node Buffers largely use external memory; the issue is not simply comparing raw bytes to old-space. Parsed candidates and reports independently accumulate on the V8 heap, while tar and compressed buffers increase RSS. The supplied real-data sizing is approximately 14.8 MB raw per spot (approximately 237 MB across sixteen), with substantial additional parsed-object memory. This review did not independently measure those runtime estimates or reproduce an OOM. It did confirm the unbounded-with-spot-count retention path, which is not a defensible sixteen-spot implementation under `--max-old-space-size=256`.

Required approach:

1. Perform an all-inventory metadata/hash preflight first, including aggregate declared bytes, committed identity, duplicate spot/stage identities, destination paths and current source binding.
2. Fully verify one spot at a time, retaining only small manifests/records, receipt identities and accepted delivery pins afterward. Release decoded bytes, parsed policies/reports and transport parts before the next spot. Avoid retaining all compressed captures; keep their length/hash/committed identity and recheck them with bounded reads.
3. Complete all validation and all-destination collision/ignore/tracked-path preflight before the first write. Preserve that existing global property.
4. For restore, reread and hash-check the same committed archive one spot at a time, then decode/write its exact reviewed bytes. Do not solve memory pressure by reducing spot coverage, rules, reports, sample counts or evidence.
5. Account for reusable module caches, including the `probes` map in `mw3-artifacts.mjs:13–17`, and temporary full JSON/codec allocations. Sequential processing alone must be measured rather than assumed sufficient.

Required evidence: final-revision tests plus representative sixteen-spot verification/restore under the actual Node 22.20.0, 256 MiB old-space and workflow time budget, with observed peak memory and exit status. Tiny contract fixtures and zero-inventory runs do not establish this capacity. Real accepted archives are currently absent, so a real nonempty/full-corpus pass remains pending even after a code fix.

### R2 — High: a wholly missing committed triple can silently become “no reviewed data”

Locations: `mw3-reviewed-restore.mjs:70–99,157–179,196–198`.

Discovery only enumerates the current filesystem. A manifest/archive/receipt found there is checked against the captured Git tree, but the implementation never asks which saved-inventory entries that tree requires to exist. Consider a valid committed triple and an empty registry, which the design expressly permits. Remove all three files from the working tree. Discovery returns no entry; no committed-file check runs for that spot; the empty registry passes; and the command returns `no-reviewed-saved-data`. The same omission can hide one complete spot among several. Deleting only part of a triple is caught, but deleting the whole triple is not.

This is a deterministic source-level counterexample, not a runtime test performed in this review. It defeats the claimed complete committed-inventory/missing-input check, and an incomplete or sparse working checkout can trigger it without fabricated policy content.

Required change: enumerate the relevant committed paths from the captured `committedTree`, reconcile the complete committed and working-tree sets, and fail for missing, extra, unexpected, nonregular or incomplete entries. Preserve the strict treatment of unknown `mw3-` names. Only allow zero-data when both the committed and working inventories are genuinely empty. Recheck the inventory set before writes, alongside the existing captured-byte recheck, so newly appearing or disappearing inventory is not ignored.

Required tests: remove an entire committed triple; remove one committed triple while another remains; omit the entire inventory directory; add an unexpected inventory entry; change the inventory after capture. Each must fail before restoration writes. Retain the valid truly empty case.

### R3 — Medium: a dirty source rollback can conceal drift in the current committed source tree

Locations: `mw3-reviewed-restore.mjs:157–159,166–169,184–188`; `mw3-reviewed-snapshot.mjs:101–105`; `mw3-source-tree.mjs:11–31`.

The new command captures `HEAD^{tree}`, but validates only the shared registry and the manifest/archive/receipt bytes against that current tree. Source/input records are validated against current working bytes and the manifest's historical `source_tree`. The final source loop again reads only working bytes. Checking that `HEAD^{tree}` has not moved does not compare its source blobs.

Counterexample: a previously accepted snapshot references historical source tree A. A later HEAD B changes a pinned source file but retains that snapshot and receipt. Locally replace the changed source with A's bytes, leaving the rollback uncommitted. The source check now sees the accepted A bytes, the historical-tree check sees A, the saved triple remains committed at B, and HEAD does not move. No check rejects B's differing source blob. Thus a dirty working tree can make a stale committed checkout appear valid.

Required change: verify every pinned source/input record against both the accepted historical tree and the captured current committed tree, as well as the bounded current-byte checks. Do not require the two whole-tree IDs to be identical: committing the saved archive/receipt legitimately changes the repository tree. Compare the pinned records. Keep the actual `apps/shared/mw3-approved.ts` in the source inventory; do not weaken that binding to accommodate publication pins.

Required tests: a changed current committed source masked by an uncommitted historical rollback must fail; an unchanged source inventory in a newer whole tree containing only added saved artifacts must pass; historical tree absence and current/historical nonregular source entries must fail.

### R4 — Medium: the Actions path filter misses source changes that invalidate saved snapshots

Locations: `.github/workflows/verify-mw3-contracts.yml:3–32`; `mw3-reviewed-snapshot.mjs:32–55`.

The saved manifest binds a wider source set than the workflow's `pull_request.paths`. Concrete omitted dependencies include `apps/frontend/scripts/postflop-ai/reviewed-postflop-archive.mjs`, imported by the new verifier; `.gitattributes`, explicitly pinned by `sourcePathsFor`; and `apps/frontend/package.json` / `package-lock.json`, also explicitly pinned. A PR changing only one of these can invalidate the saved source identity or alter verifier behavior without running this saved-inventory gate at all.

Required change: make the workflow run for the complete source/input and delivery dependency closure, or remove the restrictive path filter for the target branches. Prefer a simple broader trigger over a fragile manually incomplete list. Keep the job byte-only; expanding when verification runs does not authorize recipe generation, MC, approval or deployment.

Required check: demonstrate that a change to each of the three omitted dependency categories schedules the gate. Add a trigger-coverage regression check if maintaining a selective filter.

### R5 — Medium: archive mode accepts directly committed payloads without a Git LFS pointer

Location: `mw3-reviewed-restore.mjs:103–113`, confirmed against `git show 498bd0fd0589ca13d616eb3f4c5d26b3ce70ead5:apps/frontend/scripts/postflop-ai/mw3-reviewed-restore.mjs`.

The required storage contract is a hash-pinned Git LFS archive. However, `assertMw3CommittedFile(..., { lfs: true })` accepts `committed.equals(bytes)` before considering its pointer branch. Consequently a gzip payload committed as an ordinary Git blob passes archive mode, even though no LFS pointer was committed. This does not substitute different policy bytes, but it incorrectly treats plain-Git storage as satisfying the required LFS delivery contract.

Required change: use distinct validation branches. Archive/LFS mode must require the committed blob to equal the exact canonical pointer containing the materialized payload's SHA-256 and byte length. Ordinary metadata/source mode should continue to require exact plain-blob equality. Do not silently treat raw archive equality as an LFS fallback.

Required tests: archive/LFS mode rejects an identical direct Git payload; accepts only the canonical matching pointer; rejects wrong OID/size, malformed/extra/noncanonical pointer text, and unmaterialized pointer input. Plain metadata/source equality must still pass.

## Boundaries that are preserved in this change

- The six-path diff does not change authored frequencies, recipes/profiles, numerical engines, HU policy/runtime files, preflop data, product consumers, backend routes, database schemas or the shared approval registry. The single snapshot change adds this verifier to the delivery source roots; it does not change numerical hash inputs or authored values.
- The actual shared registry is parsed as a narrowly whitelisted static declaration followed by JSON parsing. It is not imported/evaluated as TypeScript. Expressions, extra declarations, malformed pin shapes, duplicate stages/delivery hashes and incomplete flop/later pairs are rejected by the inspected code. No execution-based registry substitution was found.
- A registered pair must match separately receipt-accepted saved delivery pins. An empty registry may coexist with accepted saved pairs. A changed registry must remain source-bound and requires a matching new snapshot/receipt; this review does not recommend removing that binding.
- For discovered files, the committed-file check uses validated regular Git blob IDs with replacement objects disabled. When the committed blob is a pointer, a materialized LFS payload must match its canonical SHA-256 and size. An unmaterialized pointer subsequently fails archive decoding. The mandatory pointer-only archive storage gap is recorded as R5.
- The archive decoder checks the manifest, exact archive length/hash, bounded expansion, gzip member/trailer structure, canonical tar entries, complete seven-file content-addressed inventory and artifact hashes. Existing candidate approval metadata stays pending; the manifest stays unapproved.
- Receipt matching binds manifest/archive/content/source/input/tree identities, exact delivery pins, evidence and limitations, and requires a reviewer task distinct from the author task. This is a committed review-record contract, not cryptographic proof that the claimed model/person actually performed an independent review. Genuine review provenance remains a process prerequisite.
- The restore branch globally checks existing destination contents before beginning writes, rejects duplicate destinations, requires untracked ignored destinations, and uses exclusive creation with identical-byte retry support. Tests should exercise two distinct spots with a collision in the later spot; the new test currently exercises a single-spot collision and a duplicate-snapshot case.
- CI requests full Git history and LFS materialization and unconditionally invokes the saved-byte command, including at the legitimate empty-data stage. It does not add recipe compilation/materialization, numerical gates, review fabrication, SQL execution, uploads, D1 import or publication.

## Safe-I/O limitations to keep explicit

The new MW3-specific `readSafeFile` is an improvement: it uses a bounded allocation, descriptor reads, `O_NOFOLLOW`, before/after descriptor metadata and final named-path identity checks. It rejects persistent leaf/parent symlinks and observed changes, and existing collision reads now use this helper instead of unbounded `readFileSync`.

It is not a complete hostile-concurrent-filesystem guarantee. `O_NOFOLLOW` protects the final component, while ancestor traversal and later restoration writes remain pathname-based. A parent directory can be swapped after its check and before exclusive creation; exclusive creation protects a pre-existing leaf, not an untrusted ancestor. The global preflight also is not a transaction: a later race or I/O failure can leave some verified new files written, although a differing existing file must not be overwritten. If hostile concurrent ancestor replacement is in scope, use directory-descriptor-anchored no-follow traversal/writes and add deterministic race tests before making that guarantee. Otherwise document and enforce an exclusively controlled checkout for restoration.

Some earlier snapshot/identity reads still use the older shared `fileRecord` helper or direct `readFileSync` (`mw3-reviewed-snapshot.mjs:20–26,103`; `mw3-inputs.mjs:10,20`; `mw3-authored-source.mjs:20`). The final bounded recheck does not retroactively bound or secure those earlier reads. Avoid describing the entire dependency-read pipeline as uniformly descriptor-captured. This review did not modify the shared HU helper.

## Execution evidence and remaining limits

The inspected stored diagnostic output for **5a966f**, not the reviewed final revision, reports Node **24.19.0**, **12/12 small synthetic tests passed**, and successful actual `verify` and `restore` commands returning **zero inventory**. This review did not rerun those commands. The coordinator's recorded invocation used a 384 MiB old-space / 8 MiB semi-space setting, different from Actions' Node 22.20.0 / 256 MiB old-space environment.

- `apps/frontend/.local/mw3-saved-restore-diagnostic/5a966f.stdout.log`: 1,697 bytes; SHA-256 `4108023a7704562ebd860037cb4b1abd60a385b8f7c49ef1fab4150925166f96`.
- `apps/frontend/.local/mw3-saved-restore-diagnostic/5a966f.stderr.log`: 0 bytes; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `498bd0f` changes the toy artifact ordering from locale collation to canonical byte ordering. That final-revision test change has not been executed in the available evidence.
- Read-only `git ls-tree` inspection confirms no committed MW3-prefixed archive/manifest/receipt inventory at the reviewed revision. The checked shared registry is empty. There is no real nonempty restore, full sixteen-spot capacity, Node 22 Actions, or actual independent receipt acceptance result established here.
- The 12 synthetic tests validate small boundary examples only. The synthetic snapshot deliberately cannot pass the real source/input/evidence verifier. Their success is not real saved-policy acceptance, sixteen-spot memory evidence, or proof of the complete restore integration.
- Strict LOCAL D1, detached-process cleanup, real browser QA, public registry activation and production readiness are separate outstanding gates. No conclusion on those gates is changed by this review.

After R1–R5 are fixed, independently review the final diff and run the final tests in the authorized compute window. Keep source-code readiness, synthetic contract results, real saved-data verification, D1/browser delivery and production authorization as distinct outcomes.

## Revision addendum: 0fbe36f (2026-10-04 UTC)

### Decision and fixed scope

**GO for static implementation review at `0fbe36f7ccbf085b16698b0fe17658c9a98fa913`, relative to `498bd0fd0589ca13d616eb3f4c5d26b3ce70ead5`.** No remaining source-level blocker was found in the five reported fixes. This supersedes the original NO-GO only for those implementation defects; the original observations and historical execution evidence above are preserved.

The fixed diff contains six paths: the workflow, usage documentation, `mw3-artifacts.mjs`, `mw3-reviewed-restore.mjs`, the focused test file and the new synthetic memory helper. Review used fixed Git commit contents, source inspection and lightweight Git/Python comparisons. No Node, npm, esbuild, test runner, fixture execution, recipe authoring, MC, D1 or browser task was run. Only this independent review document was modified by the reviewer.

### R1: retained full snapshots removed; actual runtime capacity still unproved

`mw3-reviewed-restore.mjs:183–207` scopes each complete inspection to one async call. The call captures the three inputs, verifies the real snapshot and both source trees, prepares and checks the receipt-bound delivery identity, then returns a compact ledger rather than the snapshot. `compactMw3SavedSpot` at lines 135–147 copies whitelisted scalar/path/hash records and pin fields into new objects. It does not return candidate policies, reports, tar/file/archive buffers, raw receipts, transport parts or the original manifest. The outer loop retains these compact records only (lines 215–228), and the source map stores similarly small records.

The original all-snapshot accumulation is therefore removed. Global registry validation, an inventory recheck, all saved/source-byte hashes and destination collision/ignore/tracked-path preflight still finish before the first write (lines 230–238). The restore pass rereads and fully verifies one spot at a time against its exact prior ledger, then writes only its verified bytes (lines 239–241). The aggregate raw-byte limit is still checked after each bounded one-spot inspection rather than in a separate up-front manifest-only pass. That could reject an over-budget inventory earlier if optimized, but it no longer retains the preceding spots' large bodies and it rejects before restoration writes.

`clearMw3ContractCache()` runs in the inspector's `finally`, including failure paths. The three-line addition in `mw3-artifacts.mjs:14–16` clears the existing `Map` and returns its previous entry count. Clearing the map neither changes the cache key nor mutates previously returned contract objects. New calls recompute through the same `probeMw3Hand` implementation. Static comparison verified that removing exactly those three lines reproduces the original file byte for byte.

The lifetime defect is addressed at source level. One-spot parsing, full geometry probes, source-tree subprocesses and transport serialization still need actual peak-memory measurement. The restore pass fully verifies each spot again, so real runtime must also be checked against the workflow's five-minute timeout; freeing memory does not by itself prove acceptable elapsed time.

### R2: committed inventory now reconciled and rechecked

Discovery at `mw3-reviewed-restore.mjs:77–99` reads the captured tree's MW3 paths and compares the complete sorted set to the filesystem names before assembling triples. A whole deleted triple, one removed spot among several, an added working-only triple and unknown/noncanonical names cannot silently disappear into a zero-data success. The outer command passes its captured tree explicitly and repeats discovery before any restoration writes (line 233). The code continues to reject missing triple members and persistent symlinks.

The newly declared regression covers deletion of the first, second and both complete triples, plus an added working-only triple (`postflop-mw3-saved-restore.test.mjs:190–202`). These tests have not run. Optional SQL remains deliberately outside the byte/receipt validation contract and must be checked by the separate D1 gate.

### R3: historical and current committed source bindings both present

`assertMw3SavedSourceTrees` at lines 149–151 calls the existing regular-blob verifier for both tree IDs. The inspector applies it to the complete source/input records at line 192. It compares the pinned records in each tree, not equality of the whole-tree IDs, so a newer tree that merely adds saved artifacts remains compatible while a dirty rollback cannot conceal a changed current source blob. The snapshot verifier and final bounded live-byte checks are retained. The source list still binds the actual shared approval registry.

The new regression explicitly constructs a historical source, changes and commits it, rolls the working file back without committing, and expects the two-tree check to reject it (test lines 203–211). It is unrun.

### R4: omitted dependency trigger categories covered

The workflow now includes the whole postflop-ai, frontend script-library/data/source, backend source/script and shared-source directories, plus frontend package/lock/tsconfig files, `.gitattributes` and `.gitignore`. These patterns cover the concrete omitted dependencies from R4. The new memory-helper file also triggers the workflow. The existing test statically checks representative required patterns. The workflow still invokes only verification, restoration and tests; no strategy generation, approval creation or publication was added.

This is static trigger inspection. No GitHub Actions event or Node 22 execution was observed for this revision.

### R5: strict pointer-only archive mode present

`assertMw3CommittedFile` at lines 103–114 now selects one expected byte sequence: canonical pointer bytes for LFS mode, raw exact bytes for ordinary metadata/source mode. LFS-mode committed blobs are bounded to 256 bytes before reading and have no direct-payload equality fallback. The inspected tests cover identical direct blobs, canonical pointers, CRLF changes, added text, missing final newline, wrong size and wrong OID (test lines 212–222). These tests are unrun.

### Numerical, cache and output parity

An independent Git-blob comparison between the two reviewed commits found all **13** entries of `MW3_SEMANTIC_SOURCES` byte-identical: engine, hand features, actions, tree, policy, spots, inputs, input core, runtime, joint defence, model, equity and continuation evaluator. No authored recipe/profile, frequency, preflop data, HU numerical source or shared registry change appears in the fixed diff. The cache-release addition is outside that semantic-source list; the existing numerical hash calculation and contract computation are unchanged. Delivery/source provenance still correctly changes when its own verifier/helper source changes, so archives must be frozen against their final reviewed source context.

The new cache regression (test lines 241–256) checks cache-hit reference identity, preservation of an already returned object's deep contents after clearing, a fresh object on recomputation, and identical recomputed contents. It uses a tiny legal synthetic geometry, not the real 100BB policy/evidence gate. Static inspection supports the expected behavior, but the runtime parity assertions have not been executed.

The CLI status/result fields are preserved. Its spot ordering is now explicit ASCII order instead of locale collation; that is appropriate for the restricted ASCII slugs and is not a numerical-policy change.

### Test and memory-fixture limits

The fixed focused test file declares **18 tests**. None has been run for this revision. The separate `tests/helpers/mw3-saved-memory-fixture.mjs` is also unrun. It intentionally cannot pass the real snapshot gate: it constructs labelled synthetic buffers and a large parsed string, uses the production compactor, then checks small retained ledgers, `WeakRef` collection and post-GC heap/external-memory readings across sixteen iterations. It also reports maximum RSS. Explicit turn boundaries and `global.gc()` make this a useful retention regression, not a model of the complete real inspector's allocation peaks or normal automatic-GC behavior.

In particular, the helper does not exercise real rule-object density, real report parsing, real Git/source validation, receipt acceptance, policy transport or a real full-hand geometry probe. Its synthetic parsed payload is a large string rather than the actual rule graph. It may detect an accidentally retained snapshot but cannot establish that real sixteen-archive verification and restore fit Node 22.20.0, 256 MiB old-space or the five-minute CI budget. Keep that distinction in any test report even if the helper later passes.

The previous 5a966f/Node 24 small-fixture and zero-data output remains historical evidence only. Read-only tree inspection again confirms no committed real MW3 inventory at 0fbe36f. Required next evidence is execution of the final revision's focused/related checks and memory fixture in the authorized compute window, then real nonempty/full-corpus validation when genuine reviewed archives and receipts exist. Do not relabel synthetic receipts or reduce coverage to produce that result.

The documented exclusive-checkout requirement, legacy early reads and nontransactional/pathname-based restore limitations remain. Real accepted-data delivery, strict LOCAL D1, browser QA, publication/registry activation and production authorization are still separate pending outcomes. Static GO here grants none of them.

## Subsequent execution record (coordinating implementer, 2026-10-04 22:31 UTC)

After the static review, the coordinating implementer ran the exact `0fbe36f` revision under an explicitly allocated shared-machine slot. Six syntax checks, all 18 focused tests (zero skipped), the standalone synthetic sixteen-spot lifetime fixture, and actual zero-inventory verify/restore all exited successfully. The run used Node 24.19.0 with `--max-old-space-size=256 --max-semi-space-size=8`, finished at 22:31:38 UTC, and its enclosing session exited 0. No real policy generation or D1 execution was included.

The synthetic fixture reports 24,117,248 raw bytes plus 16,777,216 parsed bytes per simulated spot, maximum RSS 140,008 KiB, compact ledger 53,783 bytes and `real_snapshot_acceptance: false`. It tests retained-object lifetime, not full real sixteen-spot restore capacity. Real nonempty inventory and the separate D1/browser/LFS gates remain unrun.

- Diagnostic `0fbe36f.stdout.log`: 2680 bytes, SHA-256 `c817a87f8bba83478b16faae31ef6d141ea7fea0fdf29a064c68100a3dd6e2ef`.
- Diagnostic `0fbe36f.stderr.log`: 0 bytes, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
