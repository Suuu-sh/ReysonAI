# Independent MW3 owned-supervision and API-oracle review

Date: 2026-10-04 UTC  
Reviewed HEAD: `22aba3f25f8ee0271b51bbf80ba30f11e53d62c2`  
Base: `d26b10eac581febbd1e85815fbd6483a288e4955`  
Commits: `429afc8`, `cd12bb8`, `22aba3f`  
Decision: **NO-GO for source-level acceptance of the complete remediation.** Two evidence-boundary findings below require correction and independent re-review. This does not retract the separately reviewed unchanged Python helper or forbid separately authorized diagnostic tests.

## Scope and execution status

This is an independent source review of the eleven changed paths: workflow, verifier documentation, Python owner, MW3 command adapter, API controller, archive allowlist, snapshot roots, local D1 verifier and three focused test files. Inspection used Git, bounded file reads, Python AST parsing and byte/hash comparison only. No Node, npm, esbuild, Wrangler, test suite, process fixture, HTTP probe or D1 import was launched. The shared-machine compute lease was respected.

The Python helper parses successfully. `git diff --check` passes. These are static results, not JavaScript syntax or runtime results. All newly proposed MW3 focused tests remain **UNRUN** in this review. Actual strict local D1 has never been established by these changes; final real archive, independent receipt and exact SQL remain separate pending inputs.

## Required findings

### R1 — API proof does not distinguish owned worker teardown from an independently failed worker

**Priority: high; source-level acceptance blocker.**

Locations:
- `scripts/ci/mw3-api-oracle.mjs:95–114,118–120`
- `scripts/verify-mw3-local-d1.mjs:219–226`
- `scripts/ci/mw3-local-command.mjs:34–43`

The controller checks the ChildProcess `exitCode` and `signalCode` after HTTP restoration, then performs synchronous input-ledger reads, an equality check and completion-file write before calling `process.exit(0)`. ChildProcess exit fields depend on the controller receiving the child exit notification; they are not an atomic observation spanning those later synchronous operations.

The parent then requires only that the completion record's worker `(pid,start_ticks)` occurs in the ownership lease and in some `cleanup_history.reaped` entry. It never checks that worker's recorded `returncode`, or whether the anchored owner actually initiated its termination. The generic API classifier accepts either normal-exit or the two teardown classifications.

Consequently, a worker can serve the final response and independently exit nonzero or receive a signal during the final synchronous completion interval, before the controller processes the exit notification. The controller can still emit a success record and exit zero. The Python subreaper can subsequently adopt/reap that exact failed worker. A positive worker failure can leave the overall classification normal-exit; a negatively reaped worker can produce owned-descendant-interrupted. Both can pass the current API acceptance conditions. This is a source-derived interleaving, not a claimed executed reproduction.

The existing completion record proves which worker birth was reaped, but does not prove the documented distinction between intentional shutdown and early worker loss. A genuinely failed worker must not acquire successful restart/lifecycle evidence solely because it was reaped.

Required correction:
- Bind API acceptance to controlled termination of the specific recorded worker birth, including its actual reaped status and the matching owner termination evidence. Reject spontaneous worker failure/exit or contradictory evidence. Preserve support for the pinned launcher's legitimate graceful shutdown behavior rather than assuming every controlled shutdown must return a negative signal code.
- Recheck the worker's birth/liveness as late as possible, but do not use another asynchronous exit-field check as the sole fix.
- Add focused fixtures for last-response/just-before-completion worker normal-nonzero exit and external signal, including a completion file already present; assert rejection and complete retained owned cleanup. Retain a positive intentional-teardown/restart fixture. Add completion-evidence mutations of worker returncode and owner termination membership.
- Do not weaken ordinary SQL classification or modify the frozen reusable owner to paper over the API distinction.

### R2 — The parent verifier and SQL classifier are listed as reviewed sources but their evaluated bytes are not bound

**Priority: high for exact source provenance; source-level acceptance blocker.**

Locations:
- `scripts/verify-mw3-local-d1.mjs:11–18,254–267,381–400,408–425`
- `scripts/postflop-ai/mw3-reviewed-snapshot.mjs:32–58,103–107`
- `scripts/ci/mw3-local-command.mjs:28–75`

The controller and worker execute bundles made from captured sources. In contrast, the parent verifier, its SQL classifier and its receipt/source verification dependencies are static ESM imports evaluated from the live checkout before the manifest is verified and sources are captured. Adding their paths to `manifest.sources` is necessary, but hashes later on-disk bytes, not the already evaluated module bytes. Later `assertCapturedSources` calls verify only the saved copies.

A source checkout/update between ESM module loading and preflight/capture can therefore leave version A's verifier/classifier functions cached in memory while version B's current, reviewed source bytes are verified and recorded. This needs no post-capture live import or permanent hash mismatch. In particular, two versions with the same source-path inventory but different acceptance logic are not distinguished by the current mechanism. The source ledger can attest B while A supplies the decision. No external immutable-launch wrapper that closes this boundary is present in the reviewed source.

Required correction:
- Establish the parent verification/acceptance execution boundary from captured, verified bytes, or provide an equivalent actual-evaluated-source binding enforced before any import and retained with the run. A later hash of the live path, another captured-source check, or merely recording HEAD does not establish the bytes Node already evaluated.
- Keep receipt and source-tree verification intact; the bootstrap must not become a fixture/receipt bypass, and original saved input bytes must remain singly captured and bound.
- Add a focused source-change fixture spanning module load and snapshot capture. It must fail before D1 work or execute the intended captured verifier, never attest a different version from the executed classifier. Retain the existing after-capture live-checkout-isolation coverage.

## Confirmed strengths and preserved boundaries

### Exact reusable owner

The MW3 helper is byte-identical to the approved HU helper:
- Path: `apps/frontend/scripts/ci/postflop-command-supervisor.py`
- Size: **19,014 bytes**
- SHA-256: `61d0fe490ff4e1e82667a8ec188c1206efd1c26067ff8d6061b4bc8a1a67164d`

The supplied HU API note is 8,098 bytes with SHA-256 `d4593c05a02f588d187df0d28eaa91b12202049463b99bd9f577ce59a633b589`; the supplied reuse review hash matches `45acc2af5fea4d076d03fb582724154aecbb3bf8ad9ffafefbc66b1e918cbb80`. That review reports the exact HU checkpoint's 12/12, zero-skip owned-process stubs. Those are historical HU assertions, not newly run MW3 results, actual D1 evidence or a global process inventory.

The adapter copies and hashes the helper before launch, launches a new supervisor session/group and uses those same helper bytes for parent cleanup. The removed negative-PGID/group-only implementation is not retained as a second owner. The exact helper preserves birth conflicts, requires current birth-matching ancestry and live-anchor adoption, excludes the supervisor from child targets, individually rechecks targets and requires final anchored discovery plus no live or zombie owned births. Abrupt owner loss remains uncertain. No broad process-name kill, extra process-group kill or new credential path was introduced.

### Ordinary command and SQL evidence

The production classifier binds command ID, parent-returned supervisor PID, supervisor/group birth and actual child birth across resource, lease, cleanup history and final/parent cleanup. It requires a zero/error-free/signal-free wrapper, normal actual child completion, complete conflict-free ownership, bounded untruncated streams, valid RSS/time and no secondary cause. Genuine normal 124/137 remain distinguishable from timeout or signal. Expected SQL failure still needs this whole normal-nonzero contract plus the intended diagnostic. API purpose cannot satisfy the SQL classifier.

The copied helper's own invariants and the MW3 classifier are coherent at source level. The two findings above concern API teardown attribution and the provenance of the parent code executing those predicates, not a return to group-only cleanup.

The command evidence retains command/arguments, exact owner digest, finite limits, wrapper/fallback streams, original execution error, secondary causes and ownership/resource records. A fresh evidence directory/command ID prevents silent overwrite on retry. Actual failures and uncertain cleanup retain state.

### Source capture, bundling and inventory

Static traversal of the authored HJ/BTN/BB source inventory found **184 paths with no missing file**. It includes all four added lifecycle/verifier roots and the required `verify-preflop-local-d1.mjs` seed dependency. Static API-controller import closure contains 20 files; the actual esbuild metafile ledger must still be checked by execution. The changed allowlist admits the exact three `ci` filenames and exact MW3/preflop verifier filenames, not arbitrary `ci` scripts or all verifiers. Existing hidden/local/node_modules exclusions and exact inventory equality remain.

Both runtime bundles are generated inside the capture directory with explicit tsconfig, reviewed input checks and metadata-input ledgers. The new API bundle requires its controller, adapter and decoder input; it does not import the live controller at API startup. `buildSync` with `ESBUILD_WORKER_THREADS=0` avoids accepting an asynchronous esbuild service as a normally completed finite command. The installed pinned esbuild source does recognize that environment switch; behavior has not been executed here.

The API input ledger contains exactly five paths and is rechecked before and after the phase: controller bundle, expected saved delivery/policy JSON, worker bundle, dummy Wrangler config and exact owner source. The completion record binds its digest, command ID, controller birth, worker birth and every expected restoration row. Tampered/missing completion or input mismatches fail. This is valuable binding, subject to R1/R2.

### Data and numerical invariants

Independent raw-byte comparisons against the base passed for:
- **13 numerical semantic files**, directly extracted from `MW3_SEMANTIC_SOURCES`
- **8 authored verification-hash files**, including the shared pilot configuration input
- **20 recipe files**, the 19-file authored subtree plus the pilot recipe

For reproducibility, SHA-256 of compact JSON containing sorted `[path,file_sha256]` pairs:
- Numerical: `8a4cf1028b97a3544366e241f232ff76253dbb8601ed35cf5a8d25ee1b57747d`
- Gate: `679319f24c77273097b7bdc4fc8f038b136916752efa845a0a25ec8799945db1`
- Recipe: `bd99685a95cbac7aae054f8c49923ce74f37b053ee2f1b34040cbda2da8acb16`

The strict CLI still requires all saved inputs and the installed pinned runtime. The complete SQL byte check, one complete file per D1 invocation, repeated imports, two late immutable-conflict rollback probes, every header/ordered part/full payload hash, all 18 application-table sentinels, unrelated MW3 preservation and database equality after each API shutdown/restart remain present. No real recipe, policy, receipt, publication registry or production binding changed in this diff.

Old manifests lacking the new source roots cannot silently pass current inventory checks. They need a new frozen source-bound manifest and independent receipt/SQL review. The later main-branch approximation-limitations change at `666c722` is intentionally absent from this checkpoint and must be preserved when integrating, with any affected snapshot/receipt identities re-established from the final integrated tree.

## Further test and claim limitations

- The API HTTP target is a released ephemeral port plus a constant health response. The completion ties a spawned PID to ownership, but does not independently tie the listening socket/HTTP response to that PID. A phase/run-specific challenge served by the captured worker, or equivalent endpoint ownership proof, would make concurrent-port/foreign-server mistakes fail closed. This pre-existing endpoint-association limitation should not be described as a proved network-to-process identity.
- The environment allowlist and dummy localhost config are present. The local-D1 test still imports `localEnvironment` from the preflop verifier, so its credential assertions do not directly exercise the newly introduced MW3 environment function. Add direct coverage of the actual adapter helper.
- stdout/stderr are bounded and overflow rejects. RSS is measured/sampled, not a hard cgroup memory boundary. Wrangler's separate on-disk log is not covered by the stdout/stderr byte caps; do not claim a bound on every file or whole-machine resource usage.
- Runtime dependencies are pinned by installed package versions and resolution paths, as documented. This is not a cryptographic attestation of every installed runtime executable's contents.
- No source-level claim here substitutes for the unrun lifecycle tests, even though the old nineteen tests existed. The newly moved controller and the new parent adapter must earn their own source-bound evidence.

## CI and next required proof

CI adds syntax checks and serial synthetic contract/process/API fixtures. The API test constructs an explicitly synthetic fake HTTP server and bundles the captured controller; it does not launch actual Wrangler or import D1. The default CI esbuild is the frontend lockfile's 0.25.12; the proposed separate local fixture run uses the already installed pinned 0.28.1 entry via its explicit test override. Neither fixture alone is the real pinned strict D1 gate. No generation, new acceptance, remote D1, credentials, deployment or artifact upload was added.

After R1/R2 are corrected and independently reviewed, obtain the separate serial lease and run syntax, local contracts, owned-process stubs and API lifecycle fixtures against an exact frozen source inventory, retaining source-before/after identities, complete stdout/stderr, statuses and resource scope. Any added last-response/source-change negative fixture must actually run without skips. The proposed 20–45 seconds / below-250 MiB estimate is unmeasured and is not a result.

Only after those gates and final authentic archive/receipt/SQL inputs may the real pinned complete-file local D1 oracle be run under its own authorization/resource schedule. That run still needs repeated full imports, both observable late-conflict rollbacks, full unrelated preservation and two actual owned API/restart phases. No current source-only result grants remote atomicity, strategy acceptance, production approval or deployment permission.


---

## Revision review: 5011297b29eeaa2b4a9bc5598764c3e0dee49342

Date: 2026-10-04 UTC, 23:51  
Comparison checkpoint: `22aba3f25f8ee0271b51bbf80ba30f11e53d62c2`  
Decision: **NO-GO for treating this revision as statically ready for the proposed focused serial acceptance run.** The R1 correction is responsive and the R2 architecture closes the identified cached-live-module race in principle, but the new loader cannot load the actual parent dependency graph. Correct R3 and the narrowly mislabeled R4 fixture before freezing the next test candidate. Separately authorized diagnostic tests remain possible; no runtime test is granted or claimed by this review.

This is an appended revision decision. The original NO-GO findings and reviewed checkpoint above are preserved as history. All inspection for this revision remained static/Python/Git only. No Node, esbuild, process fixture, HTTP probe or D1 command ran.

### R1 revision result: addressed at source level, runtime proof pending

`ci/mw3-api-oracle.mjs:19–24,118–125` now checks the recorded worker birth directly in `/proc` after its ledger checks and rejects zombie/dead state before completion. `ci/mw3-local-d1-oracle.mjs:219–238` requires one unique reaped record for that exact worker birth and recorded owner TERM/KILL membership with a compatible status: zero or -15 with TERM, or -9 with KILL. API normal-exit is rejected by `ci/mw3-local-command.mjs:34–43`. Positive failed statuses, missing owner targeting and ambiguous reap evidence no longer qualify merely because a success record exists.

The synchronous precompletion-gap fixtures deliberately kill/fail the recorded worker while the controller cannot process the child notification, retain a success file, and require the production parent classifier to reject the evidence. The graceful TERM-to-zero fixture preserves legitimate signal-handler shutdown semantics. These are the appropriate source predicates for the original finding, subject to actual execution and the fixture correction below.

The assurance is explicitly bounded to the unchanged owner's recorded live-target/birth/status observations. It cannot cryptographically distinguish an identical concurrent signal by an arbitrary same-user actor, and the revised documentation does not claim that it can. The prior HTTP endpoint-to-worker/PID association limitation is now stated explicitly; this review does not upgrade it to proved socket ownership.

### R2 revision result: appropriate binding design, blocked by R3 format coverage

The new supported CLI imports only Node builtins. It captures original manifest/archive/receipt/SQL bytes once, checks their structural receipt/manifest/source bindings, validates declared source/input records against the named Git tree, checks their actual captured hashes, and reserves a fresh replay root before importing application ESM. The fixed parent entry is `ci/mw3-local-d1-oracle.mjs`; there is no alternate-entry or fixture-bypass CLI option. The captured application still runs the full existing snapshot, independent receipt and exact SQL validation before D1 import.

The synchronous hooks resolve only builtins or declared replay-root files and return private copies of captured hash-checked source buffers. The hook ledger records the bytes supplied for evaluation. New replay URLs prevent reuse of already cached live-checkout module URLs, and resolution rejects a later explicit live import. The parent guard checks that its actual entry and classifier loaded through that boundary. The new cached-A/disk-B/captured-B test targets the original issue, and the JSON, escaped-import and Git/import.meta tests cover useful supporting assumptions.

The trusted base is the builtin-only bootstrap, installed Node/runtime behavior and reserved replay-root isolation. The bootstrap's own already evaluated bytes are explicitly not attested by the later hooks. The Git metadata pointer is used for read-only immutable object access; this is not a security boundary against arbitrary same-user modification of the runtime, object store or reserved filesystem. Those stated limits are appropriate. Direct callers can still import utility exports for tests, but the strict oracle is gated on its parent boundary and the supported CLI supplies that boundary.

The moved oracle otherwise preserves the earlier data gates; a direct old-verifier/new-oracle text comparison showed changes limited to import relocation/root adjustment, R1 completion predicates, parent-boundary checks/report linkage and removal of the direct live CLI.

### R3 — Captured loader rejects the six required TypeScript dependencies

**Priority: high; deterministic strict-startup blocker.**

Location: `scripts/verify-mw3-local-d1.mjs:109–115`, particularly the allowed-extension assertion at line 112.

The load hook permits only `.mjs`, `.js` and `.json`. The actual captured parent imports `mw3-reviewed-snapshot.mjs` → `mw3-inputs.mjs` → `mw3-spots.mjs`, which directly imports `.ts` files. Independently reconstructed static parent closure contains **41 files**, including these six TypeScript dependencies:
- `apps/frontend/src/data.ts`
- `apps/frontend/src/estimated/multiway-responses.ts`
- `apps/frontend/src/estimated/opening-ranges.ts`
- `apps/frontend/src/estimated/rake.ts`
- `apps/frontend/src/estimated/ranges.ts`
- `apps/frontend/src/estimated/sizing.ts`

The author's own `r1-r2-static-preservation.json` lists the same dependencies. Node must load these modules while linking the parent graph; the hook will throw `Unsupported parent evaluation format` before the strict oracle can begin. This conclusion follows directly from the imports and unconditional extension check, without running Node. Some files contain actual TypeScript syntax, such as the optional `responses?` argument in `validateMultiwayDataset`, so simply relabeling raw `.ts` bytes as JavaScript is not a sufficient fix.

Required correction:
- Support the exact captured `.ts` sources using the installed Node version's documented TypeScript evaluation/stripping mechanism, without falling back to live file reads or an unpinned external compiler. Preserve the raw reviewed source identity and, if a transformation occurs, its executed output identity and transformation provenance.
- Extend the boundary tests beyond synthetic `.mjs`/JSON. Include real typed syntax plus captured relative TS/JSON imports, live/replay mutation isolation and a source-only import/link of the actual parent closure under the hooks. Importing the parent must not run strategy generation, call the strict oracle or launch Wrangler/D1.
- Continue rejecting formats outside the actual supported reviewed graph. Do not weaken source/receipt or exact-ledger checks to make imports succeed.

### R4 — The new “last-response” fixture exits at the first delivery's POST

**Priority: medium; correct before claiming final-response coverage.**

Location: `tests/mw3-api-lifecycle.test.mjs:55` in `fakeWorkerSource`, and the last-response test at approximately lines 192–203.

The fault is attached to every non-GET response. `assertApiRestoration` sends a POST for each delivery, so this fake server exits after the flop delivery's POST, before the later delivery has been restored. It is a useful mid-phase early-exit test, but is not the promised final HTTP response boundary. Existing parent-boundary tests also do not import the real parent closure, which is why R3 is not covered.

Required correction: trigger the last-response failure only for the final prepared delivery's POST, and retain/assert evidence that this exact boundary was reached. Keep the separate synchronous completion-gap fixture; it addresses a distinct and important race and should not be replaced by this correction.

### Revision checks and remaining proof

Independent raw-byte comparison reconfirmed **13 numerical files, 8 authored gate files and 20 recipe files unchanged** against `d26b10e`. The Python owner remains 19,014 bytes, SHA-256 `61d0fe490ff4e1e82667a8ec188c1206efd1c26067ff8d6061b4bc8a1a67164d`, and parses with Python AST. `git diff --check 22aba3f..5011297` passed. The archive allowlist adds only the exact parent-oracle filename and the snapshot includes that exact new source root.

The strict full-file/reimport/late-part-conflict/late-header-conflict checks, 18-table and unrelated MW3 preservation, exact policy/API restoration, empty production registry and two restart phases are retained. Main's later seven-limitations state must survive integration; this isolated revision does not authorize replacing it or reusing stale snapshot/receipt identities.

After R3/R4 corrections, another exact-checkpoint static review can decide eligibility for the separately leased focused serial tests. That decision would still be only test eligibility. All current MW3 lifecycle/boundary tests remain unrun in this review. Authentic final archive/receipt/SQL and actual pinned strict local D1 execution remain pending, and no production, remote D1, real strategy acceptance or release approval follows.


---

## Revision review: 00bc6491febb5a440a07131544070a26bff8e626

Date: 2026-10-05 UTC, 00:05  
Comparison checkpoint: `5011297b29eeaa2b4a9bc5598764c3e0dee49342`  
Decision: **GO, narrowly, for separately authorized focused serial test execution at this exact checkpoint.** R3 and R4 are addressed at source level; no additional required source fix was found in the four-path revision or its interactions with R1/R2. This is not runtime acceptance, actual D1 proof, strategy acceptance, integration/merge approval or production release approval.

All prior findings and their exact-checkpoint decisions remain above as history. This review used only static file/Git inspection, Python byte/hash comparisons and Python AST parsing. **No Node, esbuild, tests, HTTP/process probes or D1 commands ran.** The active numerical-gate lease was respected; this GO does not authorize overlapping it.

### R3: captured TypeScript evaluation is now supported and source-bound

The builtin-only entry imports Node's `stripTypeScriptTypes` and permits `.ts` in its existing captured-file load hook. It verifies the raw reviewed Buffer digest, requires valid UTF-8, and calls the builtin with explicit `mode: 'strip'` and the captured source URL. The exact returned JavaScript Buffer is both saved and supplied to the module loader. There is no `nextLoad` or live-filesystem fallback for these application modules and no external compiler dependency.

Each evaluated module retains its raw reviewed byte count/hash and its executed-source byte count/hash. TS records additionally retain the transformation API, strip mode, Node version, captured source URL and content-addressed saved JavaScript path. Thus Node-version-dependent stripping is visible and inspectable rather than silently being described as raw TS execution. The trust base explicitly includes the installed Node parser. Non-erasable TS and unsupported formats remain fail-closed.

The new typed fixture exercises actual optional-parameter/type syntax, a relative TS dependency and a JSON import; it changes both live and replay files after capture and requires the originally captured behavior, exact raw/output records and saved-output hash equality. The new actual-parent fixture recursively captures the real graph, imports it under the same hooks and checks that every transitive loaded path is in the captured inventory. It explicitly checks all six TS modules and does not call `verifyMw3LocalD1`, strategy generation, Wrangler or D1. The source-only graph evidence is retained for independent inspection.

Independent static traversal reconfirmed **41 files, 309,564 raw bytes, six TS modules, and no graph format outside `.mjs`/`.js`/`.json`/`.ts`**. This is a source inspection, not a successful import/link result. The complete actual graph fixture must still execute successfully on the leased installed Node runtime before the boundary can be called tested.

### R4: the fault now targets the genuine final HTTP response

The fake server now triggers the fault only for the final prepared delivery's manifest POST with exactly one matching delivery parameter. In the two-delivery fixture this is the later delivery's terminal HTTP check, after the flop and later part restoration checks.

The finish handler records responses before the fault handler writes its marker and exits/signals. The test requires the final recorded response to be that later-delivery POST with status 405, both deliveries to have all expected response counts, and every part to have completed 200 and 304 responses. The marker retains the fault type, worker PID, final delivery, response index and complete observed response inventory. This removes the previous first-POST/mid-phase mislabeling. The existing synchronous completion-gap rejection and graceful TERM-to-zero cases remain intact.

### R1/R2 interactions and preserved scope

The revision does not relax the prior controlled-teardown rules: API normal-exit is rejected, the worker has a late live birth observation, exactly one compatible reaped status is required, and the owner must have recorded the corresponding TERM/KILL targeting. SQL remains a separate purpose requiring genuine normal actual command completion and all identity/cleanup/resource predicates.

The actual parent still enters through the builtin-only bootstrap, private captured module buffers, fresh replay URLs and declared-file resolver restriction. The TS path uses that same binding instead of reintroducing live module reads. Bootstrap/installed-runtime/reserved-root/Git-object isolation are explicit trust assumptions. Neither arbitrary same-user tampering nor cryptographic attribution of concurrent identical signals is claimed. The HTTP endpoint is still not independently attested as the recorded worker's listening socket.

Independent checks again confirmed all **13 numerical files, 8 authored gate files and 20 recipe files byte-identical** to `d26b10e`, with the aggregate hashes recorded earlier unchanged. The Python owner remains **19,014 bytes**, SHA-256 `61d0fe490ff4e1e82667a8ec188c1206efd1c26067ff8d6061b4bc8a1a67164d`, and Python AST parsing succeeded. `git diff --check 5011297..00bc649` passed. The only tracked changes in this revision are the builtin entry, parent-boundary tests, API lifecycle tests and verification documentation.

Exact reviewed file identities:
- Builtin entry: 16,689 bytes; SHA-256 `91bdabb5f6753f36479b0d0ea82593813cebaa3c9372feaf9aacfeabc9f642a1`
- Parent-boundary tests: 14,407 bytes; SHA-256 `c2d06e1260bbc72c460850860248778300662536d4d019a6c3e973f945be96ff`
- API lifecycle tests: 22,623 bytes; SHA-256 `fc9b4c92ef7c62e7cc489ba32610645e0695434eb78f53abf4ec00028d9370ff`

### Conditions of this GO

After obtaining the explicit separate serial lease, execute the focused syntax, local-contract, owned-process, API lifecycle and parent-boundary tests against this frozen checkpoint. Preserve source-before/after hashes, complete output/status/resource records and the retained real-graph/final-response/completion-gap evidence. Runtime failures require diagnosis and a newly frozen/reviewed correction where source changes; they must not be relabeled as passed static work. Prior estimated duration/RSS remains unmeasured until execution.

Main's later seven-limitations state must survive future integration. Final genuine archive, independently reviewed receipt and exact SQL remain pending. Even a fully passing focused run would not establish complete-file local D1 transactions, repeated import, late-conflict rollback, all unrelated preservation or actual Wrangler restart/API restoration; those remain the real strict gate's separate obligations. No remote D1, credential work or production publication follows from this decision.


---

## Independent runtime-evidence review and narrow integration decision

Date: 2026-10-05 UTC, 00:11  
Executed checkpoint: `00bc6491febb5a440a07131544070a26bff8e626`  
Decision: **GO for source integration of this reviewed owned-supervision/API/parent-boundary remediation, preserving main's later seven-limitations state and subject to final integrated checks.** This is a narrow engineering integration decision. It is not actual strict D1 completion, final artifact/receipt/SQL acceptance, Node22 CI proof, publication or production release approval.

This reviewer did not rerun Node, esbuild, any tests, process/HTTP probes or D1. The following conclusions come from independent inspection of retained execution records, all relevant stdout/stderr, exact frozen source/test bytes and the retained race/real-parent-graph evidence.

### Actual focused execution verified

Primary record: `apps/frontend/.local/mw3-owned-supervision/runtime-00bc6491-v2/execution.json`, 6,935 bytes, SHA-256 `2092e02bf667219709f402b3903a5d0ffc94cd754ea3132ba8ace284feea1b13`.

The recorded run spans **2026-10-05 00:08:38.883004 to 00:08:53.753005 UTC**, approximately **14.870 seconds** including version/syntax checks and four serial suites. The version output is `v24.19.0`. Every recorded command exited zero. All eight explicit JavaScript syntax checks have empty stdout/stderr.

Verified suite totals from the complete retained logs:
- Local D1 contract/synthetic reference tests: **20/20**
- Owned-process tests: **9/9**
- API lifecycle tests: **7/7**
- Parent-boundary tests: **7/7**
- Total: **43/43**, with **zero failed, cancelled, skipped or todo** tests in every suite

The four stdout records independently hashed here are:
- `mw3-local-d1.stdout.log`: 2,435 bytes; SHA-256 `acfbdfccccec0eac3dc0f6c185dc86ec1b86a6b85dc086aa81dbd3151a1b9c9f`
- `mw3-owned-process.stdout.log`: 1,149 bytes; SHA-256 `725bb4803b00cdf33adb614c8cd8df7c52f3296869bc997edf0443585ea205cd`
- `mw3-api-lifecycle.stdout.log`: 1,355 bytes; SHA-256 `76f9db9c528318c484be762891d6cad1c9a7140439ca3d41a0416d53bb8a44e9`
- `mw3-parent-boundary.stdout.log`: 1,237 bytes; SHA-256 `42fc8eb3205446fe8a7e0f4e10fe7bd6542d1d5fa81b3100eb4fda27e6a6abb4`

All four outer stderr files are empty. The parent-boundary stdout retains Node's experimental `stripTypeScriptTypes` warning as test-runner output; it was not discarded or misrepresented as absent.

The execution record's **13-path** `source_before` and `source_after` maps are identical. Each recorded hash also matches the current file and the corresponding exact `00bc6491` Git blob. This was a 13-path execution ledger, not a claim that it sampled every repository file. Separately, the retained real graph binds all 41 actually loaded parent modules, and the retained API captures bind their actual 20 source inputs, as checked below.

The earlier `runtime-00bc6491/launch-failure.json` explicitly records missing `/usr/bin/time` before Node process creation (`node_started: false`). That is retained as a failed harness launch, not a failed or passed Node test. The subsequent run used direct subprocess execution and monotonic elapsed time. Its final **75,052 KiB cumulative RUSAGE_CHILDREN maximum** is a cumulative child high-water measurement; it is not a per-command hard memory cap, concurrent process-tree sum, whole-machine measurement or global survivor inventory.

### R1/R4: retained negative races establish the relevant rejection, not just test names

I inspected the exact production predicates and both test-loop bodies against all four retained directories reported by the log:

1. `/tmp/mw3-api-last-response-nonzero-F2pjYk`
   - The final-response marker reaches response **17**, the **later-delivery manifest POST, 405**, after both deliveries' expected checks.
   - Controller actually exits **0** and writes a success completion record.
   - The exact worker birth is owner-reaped with **returncode 7**, with **no TERM/KILL owner targeting**. Overall classification is normal-exit.
   - The API lifecycle rejects this outcome. Thus the test genuinely reaches the former false-positive shape instead of merely failing before completion.

2. `/tmp/mw3-api-last-response-signal-6voKg1`
   - Marker likewise reaches the genuine final later-delivery POST/405 at response 17.
   - The late `/proc` check observes worker death; the controller exits **1**, no completion file exists, and the worker is reaped as **-9** without owner targeting.
   - Captured stderr contains the intended `Worker died before completion` assertion.

3. `/tmp/mw3-api-precompletion-normal-nonzero-nzuOSr`
   - Controller exits **0** and writes a success completion file during the deliberately blocked event-notification gap.
   - Worker is reaped as **7**, with no owner TERM/KILL target. Classification is normal-exit; the API classifier rejects.

4. `/tmp/mw3-api-precompletion-external-signal-aaPRoS`
   - Controller exits **0** and writes a success completion file.
   - Worker is reaped as **-9**, with no owner TERM/KILL target. Classification is owned-descendant-interrupted, so the exact API-completion check's targeting requirement supplies the needed rejection rather than relying solely on the generic classification.

All four retained outcomes have complete parent cleanup and anchored discovery. For both final-response markers I independently checked the response count and final delivery/405 identity, plus both deliveries' expected counts and each part's 200/304 responses. For all four cases, controller stdout/stderr byte counts and hashes match their outcome summaries; the five phase input files match the input ledgers; existing completion files bind those exact ledger bytes. Every entry in each retained 20-file control-bundle source ledger matches its captured bytes and the frozen Git source. Bundling command records name the already installed Wrangler-associated esbuild entry; its installed package metadata is **0.28.1**. No actual Wrangler/D1 invocation follows from that esbuild use.

Retained outcome SHA-256 values, in the order above:
- `fee0f915e2c437c93ffee8bd2808be2d63f089662d420609541156259e3ec94b`
- `9b1c7b143a4f6edb25e3310fc0bc00413a12fe3632665699a76b7886340bd3df`
- `d92e4223a637dc280db6d3cb46ca7374bcef75dc23c1e4743446453f3d600fcd`
- `98e1efa4ce51cf8ef6fab86337497b085e0600f7fd7b22aff2ae4ea96a55247b`

The positive two-restart and graceful TERM-to-zero test bodies also completed, with their source-defined birth/target/status and purpose-separation assertions. Those passing fixture directories are intentionally removed by the tests, so their detailed per-fixture files are not independently retained here; the proof is the exact source-bound completed test predicates and logs. The four race directories above remain independently inspectable.

### R2/R3: actual complete parent import graph and transformed bytes verified

Retained record: `/tmp/mw3-parent-real-graph-0xwY7w/parent.execution.json`, **19,267 bytes**, SHA-256 `be7d9e5868cf19bd1c1910a9a6540c1c1ed0ac2cde23a1bfac8a065b20ad64c3`.

It reports pass for the exact-buffer-module-loader source-only fixture and contains **41 loaded sources**. I compared every row against all three of the current file, frozen `00bc6491` Git blob and replay copy: all raw byte counts/hashes and bytes match. For each of the **six TS modules**, I also verified the saved transformed output against its executed-source byte count/hash, `node:module.stripTypeScriptTypes` / strip-mode / Node **24.19.0** provenance and exact captured source URL. Non-TS entries have no transformation and executed bytes matching the captured raw input.

The replay root has no `apps/frontend/.local` oracle state directory, consistent with the source-only fixture importing/linking the graph and inspecting exports without calling the strict oracle, authoring strategy data or starting Wrangler/D1. The other completed parent tests exercise cached live A versus captured B, capture disagreement, JSON/builtin/escaped imports, replay Git/import.meta behavior and actual typed TS/JSON mutation isolation. No skip or early-success branch excludes these tests' required assertions.

### Integration boundary and remaining obligations

The prior static invariance and exact helper results remain applicable: the owner is unchanged at SHA-256 `61d0fe490ff4e1e82667a8ec188c1206efd1c26067ff8d6061b4bc8a1a67164d`; this remediation does not alter the 13 numerical, eight gate or 20 recipe files. Integrate the reviewed changes while preserving main's **seven** accepted limitations; the isolated worktree's older four-limitations content is not a replacement for main. Source-bound snapshots/receipts must describe the final integrated tree.

These focused Node24 results resolve the tested source/process/API/bootstrap regressions sufficiently for narrow source integration. They do **not** establish:
- Node22.20 CI behavior or the final integrated full suite
- Final authentic source-bound archive, independent receipt and exact SQL acceptance
- Any actual Wrangler/workerd strict D1 run, full-file transactional rollback, real repeated import, all unrelated-row/schema preservation or actual-worker persistence/restart proof
- Remote D1 atomicity, a global system-process inventory, a hard total-memory bound, HTTP listening-socket/PID attestation or protection against arbitrary same-user tampering
- Strategy publication, registry approval, production deployment or release readiness

Final integrated checks, Node22 CI and the genuine saved-input strict D1 gate remain separate pending work. Do not promote synthetic SQLite/fake HTTP acceptance or the historical HU 12-stub result into those claims.
