# Independent MW3 activation-preparation review

Date: 2026-10-05 UTC  
Reviewed HEAD: `a2cf5f6ea429eb8dd3cafc424e2ab07c17d30579`  
Base: `c70cdecb9fdad770f7fa92d524d2771834208eb0`  
Branch: `mw3/prepare-bounded-activation-20261005`

## Decision

**GO, narrowly, for separately authorized serial syntax and contract-test execution at this exact checkpoint.** No required source-level acceptance-boundary correction was found in the 16-path activation-preparation diff. This is test eligibility only. It is not runtime acceptance, permission to fill the registry, acceptance of draft pins, source-integration approval, genuine archive/receipt/SQL acceptance, strict D1 proof, or publication approval.

Inspection used source reads, Git, Python byte/hash comparisons and Python AST parsing. **No Node, npm, esbuild, JavaScript syntax check, test, process/HTTP probe, Wrangler, D1, Monte Carlo, recipe or encoding command ran.** The coordinator's serial compute lease was respected. Only this review document was written.

The earlier `00bc6491` 43/43 focused result and later Node22 180/180 result remain historical evidence for their exact checkpoints. Neither result is transferred to the new activated mode or enlarged parent graph.

## Findings

### Required corrections

None for the stated serial-test-eligibility decision. The two observations below fail closed or concern defensive resource hardening; they do not provide an approval bypass or false-positive strict PASS in the intended draft-based workflow.

### Nonblocking: preserve canonical pin field order in a proposed registry

`scripts/ci/mw3-local-d1-oracle.mjs:399–400` compares the parsed subject pair with `assert.deepEqual`, whereas the generated worker at lines 419–420 compares that pair with `JSON.stringify`. The static registry parser permits equivalent JSON object keys in a different insertion order. Such a literal can pass the parent comparison but make the worker return 500, because the receipt-derived pair uses the canonical `spotId, stage, deliveryHash, implementationHash, policyHash, sourceHash` order.

The new draft encoder already emits that canonical order. Preserve it when proposing the literal registry. Canonicalizing the six-field identity consistently would be useful future interoperability hardening. The current mismatch is a false rejection, not acceptance of a stale or altered pin.

### Nonblocking: bound the existing-output comparison

`scripts/postflop-ai/mw3-draft-pins.mjs:75–78` preflights a safe regular-file destination, writes new output with `wx`, and preserves differing prior output. However, the existing-file branch uses `readFileSync` without a size limit. A mistakenly oversized file at this content-addressed output path can consume more memory than an ordinary draft before rejection. Using the existing bounded `readSafeFile` with the expected output length would harden retries under the tight compute budget. This does not overwrite that file, mutate raw candidates or confer approval; it is not a claim of a hard total-memory guarantee.

## Draft inventory, data preservation and source binding

The exact coordinator inventory in the raw-data checkout was independently read and checked:

- `sixteen-finished-gates-20261005T0020.json`: **31,559 bytes**
- SHA-256: `683ad141af9014736237ef0720d9cd97d0d1a8ab652587e62847cb1ce6d4b697`
- **16 distinct spot identities and 112 distinct file paths**
- All **112 current raw files** match their listed byte lengths and SHA-256 values, totaling **235,515,283 bytes**

Those are independent byte checks, not a rerun of numerical evidence or a newly issued independent strategy receipt.

`assertDraftInventory` requires the deliberately non-receipt inventory kind, exactly the current 16 reachable catalog spots, valid source hashes, and 112 bounded, unique local JSON paths. The actual read primitive subsequently enforces the stricter safe-relative-path and no-symlink rules. `deriveMw3DraftPins` binds the inventory's explicitly supplied SHA-256, verifies every raw file before processing, and calls the existing `collectMw3Snapshot` once per spot. Every collected artifact must match a distinct inventory record; all 112 must be consumed. A spot source fingerprint must equal its inventory value, every snapshot must use the same committed source tree, and the command rechecks the whole raw inventory, registry bytes, inventory bytes and tree before output.

The snapshot path checks both saved candidates against current source/implementation/policy/recipe/author identity and the correct flop versus turn/river scope. It verifies all five saved reports through `verifyMw3Evidence`, including structural coverage, joint-event/sample/diagnostic identity, simulation identity and deterministic replay identity. The seven evidence limitations are retained. Source and input records must match actual committed Git-tree bytes; missing new source roots cannot silently reuse an old snapshot.

Transport preparation encodes the existing saved policies, checks the complete delivery identities and produces exactly 32 distinct delivery hashes. No author recipe or simulation entry point is invoked. Between spots the optional contract cache is cleared and explicit GC is requested; retained cross-spot records are pins, identities, artifact metadata and limitations rather than all decoded policies. This is a serial design, not an executed peak-RSS result.

The output is a fixed ignored `activation-draft` path derived from inventory SHA-256 and tree, with `unapproved_transport_encoding_only`, `not-authorized`, `not-created` and `not-modified` markers. It offers no arbitrary output destination, registry writer, independent-receipt constructor, final archive/SQL save, D1 import or publication path. Draft manifest identities precede the registry source freeze and cannot serve as final receipt subjects.

## Registry authority and CLI compatibility

Both CLI parsers preserve the five required saved-input/runtime arguments, accept only optional `--registry-mode empty|activated`, and reject unknown, duplicate or missing arguments. Omission remains `empty`; there is no alternate registry, approval, source override, skip-receipt, remote or reduced-coverage switch. The bootstrap explicitly captures the selected mode and records it in capture/execution metadata.

`bindCapturedRegistry` reads the captured shared TS source and passes it through the existing strict literal parser. That parser accepts only the declared six-field type plus a JSON literal inside `Object.freeze`, limits the registry to 32 entries, validates all six fields, rejects repeated delivery hashes or repeated spot/stage identities, and requires complete flop/later pairs. The actual parent-evaluated registry must deep-equal that literal and be frozen. The subject's complete six-field pair must match `mw3DeliveryPins` and the full independently reviewed receipt; changing source, implementation, policy or delivery identity cannot pass merely by retaining spot/stage.

Empty mode requires the actual registry to be empty. Activated mode rejects an empty registry and does not insert receipt-derived pins. It excludes the real database-only sentinel from build authority and derives an unknown hash absent from that authority. The actual shared registry is still unchanged and empty at this checkpoint: **421 bytes**, SHA-256 `779a2a1e1d897feb343b45a8481112fe4735f25ce380b90d69cce539fab95e30`.

The activated worker imports the captured actual `routeMw3Transport` and captured actual build registry. Its per-request checks recompute the full evaluated-pin digest and full subject pair; health binds registry-source digest, full-pin digest/count and subject-pair digest/value. A count alone cannot pass. Its source/bundle input ledger provides the raw registry-source binding; the health source digest by itself is not an independently measured runtime source hash.

A single strict invocation binds and verifies its own subject pair. It is not an independent acceptance proof for every other pair merely present in the same full-registry digest. Final inventory verification, all 16 subject proofs and independent review of the proposed complete registry remain separate requirements.

## HTTP modes, corruption and database preservation

Empty mode retains the original two phases, two-field health response, public manifest 404 check and explicitly labelled receipt-injected proof namespace. Activated mode uses ordinary `/v1/mw3/manifest` and `/v1/mw3/part` routes and verifies that the proof namespace is absent.

The source contract covers exact saved header text, each part's stored body and hash, successful full-policy reconstruction, ordinary and conditional ETags, missing parts, malformed/duplicate/extra queries, invalid part encodings and rejected methods/bodies. Unknown hashes and the database-only sentinel receive 404 for manifest and part, including conditional requests. Rejection checks require the specified error, `no-store` and no ETag; method checks include `Allow: GET`. The terminal later-delivery POST is preserved as the genuinely final HTTP operation, retaining the prior final-response fixtures' boundary.

Phase IDs are bounded to 0/1 for empty and 0/1/2/3 for activated. The parent and controller both bind the mode, phase-specific expected path and exact fixed probe. Phases 2 and 3 append a space to the later header or final later part through separately labelled local SQL. The corresponding owned API phase must reject the targeted corruption with 503 for ordinary and conditional GET while checking the other delivery and, for a part probe, all unaffected parts. Header corruption checks both the manifest and a part route, exercising their common header validation.

Each corruption fixture must actually change the full database ledger and leave all unrelated application data unchanged. The read-only API phase must preserve the entire corrupted ledger. Exact source bytes are then repaired, every delivery is revalidated, and the full schema/row ledger must equal the committed reference, including the unrelated MW3 sentinel. A failed probe, cleanup, repair or comparison exits through FAIL with retained state.

The original complete-file SQL identity/import path, two initial imports, late immutable-part and immutable-header NOT NULL failures, rollback equality, repair/reimport, 18 seeded application-table ledger and unrelated MW3 preservation remain present. Phases 0 and 1 still require complete owned shutdown and a fresh worker over the same persisted database, followed by full ledger equality and saved-row verification. Synthetic corruption/repair is not substituted for the original whole-file rollback proof.

## R1/R2 and exact source invariants

R1 remains intact: the controller checks the worker's exact live birth late, exits normally and sends no teardown signals. Parent acceptance still requires zero controller completion, exact input/completion/row equality, one uniquely reaped record for the worker birth and explicit matching owner TERM/KILL membership with compatible final status. Positive failure, unowned spontaneous signal, normal-exit API classification, ambiguity, incomplete cleanup, truncation, resource limits and secondary causes remain rejecting. SQL still uses its separate ordinary-command purpose and cannot borrow API teardown acceptance.

The Linux owner is byte-identical to the approved base: **19,014 bytes**, SHA-256 `61d0fe490ff4e1e82667a8ec188c1206efd1c26067ff8d6061b4bc8a1a67164d`; Python AST parsing succeeds. No ownership algorithm, broad group kill or alternative signal path was added.

R2 remains intact: the supported entry is builtin-only, original saved bytes and tree provenance are captured before application ESM imports, and the loader supplies privately copied/hash-checked Buffers. The shared registry and mode helper are now required source roots and required loaded modules. TS is stripped from captured raw bytes using the installed Node builtin, with exact executed output and transformation provenance retained. The source allowlist adds only the named registry-mode CI helper; the draft encoder is an explicit snapshot source root. No live application import fallback or external TS compiler was introduced.

Independent static traversal found **44 actual parent dependency modules, 341,460 raw bytes and seven TS modules**, with no format outside `.mjs`, `.json` and `.ts`. Every traversed file matches the reviewed HEAD. The seven TS modules are `data.ts`, estimated `multiway-responses.ts`, `opening-ranges.ts`, `rake.ts`, `ranges.ts`, `sizing.ts`, and shared `mw3-approved.ts`. The enlarged complete-parent fixture checks actual loader inventory and transformed output and still does not call the strict oracle. This traversal is not a successful runtime import/link result.

Independent byte comparisons against the approved base show no change to **13 numerical semantic files, eight authored gate-hash files or 20 recipes**. Their sorted path/hash aggregate SHA-256 values remain:

- Numerical: `8a4cf1028b97a3544366e241f232ff76253dbb8601ed35cf5a8d25ee1b57747d`
- Authored gate: `679319f24c77273097b7bdc4fc8f038b136916752efa845a0a25ec8799945db1`
- Recipes: `bd99685a95cbac7aae054f8c49923ce74f37b053ee2f1b34040cbda2da8acb16`

The complete seven-limitations evidence module is also byte-identical. `git diff --check` for the reviewed base-to-HEAD diff succeeds.

## Conditions and remaining proof

1. Obtain the separate serial lease and run the planned syntax/local/owned/API/parent contracts with no skips. Retain exact source-before/after identities, complete logs, exit/resource/cleanup evidence and the new actual 44-module/7-TS ledger. Preserve all final-response and precompletion-gap negative fixtures.
2. The four-phase fake-HTTP test validates controller and lifecycle contracts. It does not execute the generated activated worker or actual D1 route. The SQL fixture uses reference SQLite. Neither may be promoted to actual strict Wrangler proof.
3. Run dedicated inventory, consumer and backend contracts, typecheck/build and the final integrated full suite under the approved resource plan. Re-establish Node22.20 CI on the final exact commit. The workflow includes the new syntax checks and draft inventory test glob without adding strategy generation or real D1 work.
4. Only after the separate encoding lease should the fixed inventory command run. Independently inspect actual draft output and the proposed registry source change before final freeze; this preparation does not authorize registry activation.
5. Freeze genuine final source-bound manifests/archives, separate accepted receipts and exact SQL, then establish each subject's actual pinned four-phase strict D1 proof. Complete all-16 saved restoration, LFS payload delivery and browser/product checks separately.

The trusted base remains the builtin bootstrap, installed runtime/toolchain, reserved replay filesystem and Git object provenance. The source changes do not attest every installed executable, establish a hard process-tree memory ceiling, prove HTTP listening-socket ownership by the recorded PID, or resist arbitrary same-user tampering/concurrent identical signals. No remote D1 atomicity, global process inventory, production readiness or publication permission follows from this GO.

## Independent runtime-evidence review and limited integration decision

Date: 2026-10-05 UTC, 01:02  
Executed checkpoint: `a2cf5f6ea429eb8dd3cafc424e2ab07c17d30579`

**GO for source integration of this activation preparation into main and for the separately leased serial derivation of the 32 unapproved draft transport pins from the exact fixed inventory.** Preserve the actual empty registry and all numerical/gate/recipe/limitation identities. This decision accepts the tested preparation sufficiently to take that next bounded step; it does not accept nonexistent real draft output, authorize a registry fill, confer final strategy/delivery acceptance, or establish real strict D1, release or publication readiness.

This reviewer did not execute Node, tests, esbuild, process/HTTP probes, Wrangler or D1. The decision is based on independently reading the recorded commands, complete stdout/stderr, exact source/test bytes and retained race/parent-loader evidence. The preceding static decision and its two nonblocking observations remain part of the record.

### Executed scope and exact evidence

Primary record: `apps/frontend/.local/mw3-activation-diagnostic/runtime-a2cf5f6/execution.json`, **10,044 bytes**, SHA-256 `139b8fc6fe4fdeb3a4a883710c2ca1c3a8bdb63e87a4b672f496bb364d29f1cc`.

The record spans **2026-10-05 00:59:37.268768 to 01:00:07.086113 UTC**, **29.817345 seconds**, and records Node **24.19.0**. All 16 recorded commands exited zero: version, official Stage2 fixture restoration, seven explicit syntax checks and seven targeted test invocations. The seven syntax checks have empty stdout/stderr. All 16 outer stderr logs are empty; this does not mean warning-free tests. The parent test's experimental TS-strip warning and two existing duplicate-localization-key warnings appear in retained TAP stdout and were inspected.

Independently verified TAP totals:

- Local D1 contracts/reference SQLite: **22/22**
- Owned-process contracts: **9/9**
- API lifecycle contracts: **9/9**
- Captured parent boundary: **7/7**
- Draft inventory contracts: **2/2**
- Consumer contracts: **35/35**
- Backend contracts: **6/6**
- Total: **90/90**, with **zero failed, cancelled, skipped or todo tests** in every invocation. The first five groups comprise the 49 focused tests.

All **20 paths** in `source_before` and `source_after` match one another, the current file bytes and the exact executed Git commit. This is the recorded 20-path identity scope, not a claim that the harness hashed the entire repository. The independent actual-parent and retained control-bundle ledgers below provide additional evaluated/captured-source coverage.

Verified stdout identities, in the group order above:

- Local D1: 6,047 bytes; `808fc0026438fbffbf806926b34ce0deb013d3dbecaeed2841810b060070d95f`
- Owned process: 2,480 bytes; `eb5fac98536f724d7f7bd8a6607a12ed32c9dd455d0c7375ea13e0cd754d8913`
- API lifecycle: 3,048 bytes; `403b337c2edebace63ef024144b4b8b90bd0c5d4a676f84f62c16c1dd11e7186`
- Parent boundary: 2,417 bytes; `a15b6b3b1c27e4ac7a8b66c992c7aa4f443be9df27563c28df49cd5203c7e33d`
- Draft inventory: 643 bytes; `b7dbb88ec3acdd9a707b58ec9b86d6cb246d10ad51c39cc00ae9438e18081c9e`
- Consumers: 10,285 bytes; `05d6feb62bacfca42406c8ad735faf55733aec028c98d52ac93b50f45cc4adfa`
- Backend: 1,532 bytes; `a7cb298745ac6a64af2e76e49fbcd40a958ebf3f5f3e6d4afa0c81ea4d8cedc0`

The final recorded **418,320 KiB cumulative child maximum RSS** is a cumulative high-water observation. It is not a per-command memory measurement, hard aggregate/process-tree cap or global survivor inventory. None of those broader claims is needed for this decision.

### R1: the retained negative races still exercise real rejection boundaries

The four retained directories from the new API log were independently inspected:

1. `/tmp/mw3-api-last-response-nonzero-Pkllm2`: terminal response 17 is the later manifest POST/405, after both deliveries and their part 200/304 responses. The controller exits zero and writes success; the exact worker is reaped with status **7** and no owner TERM/KILL targeting. Classification is normal-exit and the production API acceptance rejects it.
2. `/tmp/mw3-api-last-response-signal-8y6yfU`: the same complete terminal response boundary is reached. The late live-birth check rejects `Worker died before completion`; controller status is **1**, no completion file exists, and the worker is reaped as **-9** without owner targeting.
3. `/tmp/mw3-api-precompletion-normal-nonzero-GsOq2a`: a zero-exit controller writes success during the synchronous gap, but the worker is reaped as **7** with no owner targeting; acceptance rejects it.
4. `/tmp/mw3-api-precompletion-external-signal-Pyui7E`: a zero-exit controller writes success, but the worker is reaped as **-9** with no owner targeting. Its owned-descendant-interrupted classification alone does not satisfy the controlled-worker predicate.

All four have complete anchored discovery and parent cleanup. In each, the five API input files match their ledger; every existing completion binds the exact input-ledger digest; the retained stdout/stderr match their outcome hashes. All **21 captured API-control source inputs** match their ledger, captured files and exact executed Git blobs, including the new registry-mode helper. Both last-response markers independently show all 17 expected responses and the final later POST/405 rather than an earlier partial restoration.

The positive empty-mode restart/graceful-TERM tests, new activated four-phase test and wrong-registry-source-health negative test completed their source-defined assertions. Their passing temporary directories are intentionally removed by the fixture, so those detailed per-phase files were not independently available afterward. The evidence for those cases is the exact tested predicates and completed logs, not a claim that every successful phase directory was retained or separately inspected. The activated HTTP server is explicitly fake; no real Wrangler worker or D1 is implied.

### R2: the enlarged actual parent graph executed through captured buffers

Retained ledger: `/tmp/mw3-parent-real-graph-M1rRmH/parent.execution.json`, **20,824 bytes**, SHA-256 `333dc077eadccd799e92dedf7ad7e10f3de4def9849901a2d50f0a2e545accfa`.

It records pass and **44 loaded modules / 341,460 raw bytes**. Every raw module was independently compared against the replay copy, current file and exact executed Git blob. For all **seven TS modules**, including the actual shared registry, the saved JavaScript bytes match `executed_source`; transformation provenance names `node:module.stripTypeScriptTypes`, strip mode, Node **24.19.0** and the correct replay source URL. Non-TS modules retain raw executed-byte equality. The replay has no `apps/frontend/.local` oracle directory, consistent with source-only import/link rather than invoking the strict gate.

This establishes the enlarged real graph on the executed Node24 runtime. It does not establish Node22.20 compatibility for this revision or replace the required final integrated CI run.

### Fixture restoration and preserved source/data

The coordinator's dirty Stage2 archive is understood and preserved. The saved original pointer at `.local/mw3-activation-diagnostic/stage2-lfs-pointer.original` is **132 bytes** and equals the exact HEAD Git blob. The materialized payload is **1,747,857 bytes**, SHA-256 `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`, matching both OID and size in that pointer. The official restore command exited zero in about **0.784 seconds** and reported 1,614 reviewed local fixture files / 43,276,102 bytes. That is preflop fixture preparation, not MW3 pin derivation or D1 proof.

All **112 raw MW3 file lengths and SHA-256 values** were independently rechecked after the run against the unchanged exact coordinator inventory and still match. The actual build registry is still empty, and its source digest, the owner digest and complete seven-limitations module match the reviewed checkpoint. No real draft pins or real Wrangler/D1 execution are recorded.

### Scope of the next allowed engineering step

Integrate the source preparation while preserving the approved base and existing work, then freeze/record the integrated source identity before the separately leased draft command. If integration changes any relevant source rather than merely its commit/tree context, review and test that difference; do not transplant this exact-checkpoint pass without checking. Draft derivation must use the stated 112-file inventory/hash, remain serial and keep output explicitly unapproved. Preserve draft-canonical field order, do not overwrite differing prior output, and retain the real derivation's command/output/status/resource and before/after identities.

The new real 32-pin output, proposed literal registry change and subsequent final source freeze still require independent review. Final archives, independent receipts and SQL, all-16 saved restoration/LFS delivery, actual complete-file/four-phase strict local D1, typecheck/build/full suite, final Node22 CI and browser/product verification remain separate gates. No approval to publish the registry, deploy, make remote D1 changes or claim release readiness follows from these 90 targeted tests.
