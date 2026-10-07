# Independent Astra review: Mw3 saved-byte storage

Reviewed: 2026-10-04 20:33 UTC, uncommitted storage/delivery changes after local HEAD `d6bcf5d`.
Reviewer: `gpt-6-astra`, independent of the archive/delivery implementation and the policy authors.

## Decision

**GO for the revised static storage/receipt design. NO-GO for archive acceptance, delivery or publication until the runtime gates below pass.**

This is a source review, not a policy acceptance receipt. No approval registry entry, production receipt, candidate policy or numerical implementation was written or changed by this review. The shared approved registry remains empty. Tests, Node, compilation, packaging, D1 and simulation were deliberately not run during the shared-machine compute hold. Python/Git were used only to inspect existing source and saved bytes.

## Scope and findings resolved during review

- `mw3-reviewed-archive.mjs`, `mw3-reviewed-snapshot.mjs`, `mw3-acceptance-evidence.mjs`, `mw3-reviewed-delivery.mjs`, `mw3-snapshot-cli.mjs`, the added `mw3-source-tree.mjs`, their focused tests, backend Mw3 registration/transport and the empty shared registry.
- Existing HU `reviewed-postflop-archive.mjs` primitives and Mw3 numerical/model modules were read only. They have no working-tree changes in this review.
- Consumer worktree files were inspected as prospective dependencies; their integration and behavioral review are separate.

1. **Unverified commit-shaped provenance.** The initial receipt accepted any 40-hex `source_commit`. The revised manifest carries `source_tree` inside its content hash; the receipt must match it. `mw3-source-tree.mjs:11–31` verifies an existing tree and each recorded path's regular blob mode, length and SHA-256 from its actual Git object, rejects duplicate paths and disables Git replacement refs. `mw3-reviewed-snapshot.mjs:84–86,101–105` joins these checks to current source/input records. Remote commit-to-tree correspondence is a separate checkpoint verification, not an unverified receipt claim.
2. **Missing real Agent delivery caller.** Initial source roots omitted `AgentTable.tsx`, although it controls Mw3 loading, availability, retry and kit caching. The revised roots at `mw3-reviewed-snapshot.mjs:52–55` include it. A read-only merged-source projection follows its cache helper and all current modified consumer modules: 178 source records, approximately 3.29 MB, with no missing exact imports or source allowlist violations. This is not a substitute for collecting the actual final merged inventory.
3. **Concatenated gzip members.** Plain `gunzipSync` accepts concatenated gzip members; an appended empty member leaves the decoded tar unchanged and escaped tar-tail checks. The revised decoder at `mw3-reviewed-archive.mjs:79–88` validates a fixed no-options gzip header, exact raw-DEFLATE consumption, one CRC32/ISIZE trailer and output bounds. Tests now cover prepended/appended empty members and zero padding. The new Node API behavior still requires execution on the pinned runtime. See the [official Node zlib documentation](https://nodejs.org/api/zlib.html#class-zlibgunzip).

## Boundaries supported by static inspection

- Packaging reads existing exact candidate/report buffers, without invoking an author builder or altering pending candidate metadata. Each spot requires the two policy files and five identity-bound reports. Historical V4 gates are retained.
- Strict sorted content-addressed USTAR headers, allowed destinations, source/input disjointness, file/total/compressed limits, object SHA-256 and full preflight collision/symlink checks are present. Interrupted saves/restores can retain identical files and refuse differing bytes.
- Evidence verification binds source, implementation, gate and policy identities; new authored spots also bind recipe/version. It requires 1,755-flop declared coverage, the exact representative later-runout list, every one of 108 unique joint-event slots, at least 20,000 samples for supported joint events, full twelve-board simulation accounting and its same-engine replay hash.
- Zero-support reasons, structural/joint warnings and replay limitations remain disclosed. These saved-report checks cannot by themselves prove a numerical run occurred or establish strategy quality; independent review of the exact evidence and its generating source is still required.
- The separate receipt binds manifest/archive/content/source/input/tree identities, exact evidence summary and both delivery pins, and requires distinct author/reviewer task labels using Astra. It does not rewrite a candidate as approved. The labels are review provenance, not cryptographic proof of reviewer identity.
- SQL statements are capped at 90,000 UTF-8 bytes and touch only `mw3_policy_deliveries` and `mw3_policy_parts`. Identical inserts are idempotent; conflicting immutable rows deliberately violate NOT NULL. Whole-import rollback depends on execution as one actual D1 batch; the SQL text and a manually rolled-back SQLite test do not establish that runtime property alone.
- The registered read-only route consults the build-owned registry before D1. With the empty registry it cannot publish from a request parameter, database row or candidate metadata, and it does not fall through into HU policy storage.

## Independent existing-byte checks

Python SHA-256/compact-JSON reconstruction matched both saved V4 policies, their original recipe and implementation identities, all five historical gate identities and the full saved simulation/replay link:

- Implementation: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`
- Verification: `0f35a9371c0220d1a41587c51f6d90698f9294d3f0706c841b58b31bed4d19d6`
- Recipe: `ae196be62d212769fb27a1b1f6619ffd4c7f6488f5d0c3c132efd13eade42798`
- Raw flop candidate: 2,588,625 bytes, `660ed0e712cce29d863a0bceecc59b5e94d4334e2be2b0261251ab3c80578718`
- Raw later candidate: 12,187,418 bytes, `0db36c711160d8e2f818818edc9812ba192c73aed2c636f4b9f85229739d14a9`
- Joint report: 90 supported events plus 18 recorded zero-support events, with 39 advisory warning rows. No warning was repaired or suppressed.

## Required execution and release gates

1. Run the focused archive/evidence/receipt/source-tree/backend tests on pinned Node 22.20.0, including exact `inflateRawSync({info:true}).engine.bytesWritten` behavior, CRC/ISIZE rejection and fail-closed tree/receipt mutations. None ran in this review.
2. Integrate the independently reviewed consumers, collect the real complete inventory, commit the source checkpoint, and confirm its remote commit/tree correspondence. Packaging must refuse uncommitted source/input changes; execute the added replacement-ref regression too.
3. Exercise package, verify and retry-safe restore using existing V4 bytes. Confirm the raw candidates/reports and pending metadata are unchanged. Add a real independent receipt only after exact archive, source and evidence review; the synthetic test receipts are never production approval.
4. Obtain real authenticated Git LFS upload and independent clean-fetch verification. Fetch the verified source checkpoint commit/history too: a default shallow checkout of a later artifact commit may lack the prior `source_tree` object. Missing provenance must fail closed, not cause report relabeling or numerical regeneration.
5. Use the strict pinned D1 runtime for a complete per-spot batch, second identical import, corrupt-row atomic rollback, unrelated-table preservation, API reconstruction and restart test. Schema registration and the actual caller's single-batch behavior remain unverified.
6. Complete the other fifteen spots' individual evidence/review gates, final consumer review, full regression/typecheck/build, unchanged HU evidence, and Range/Agent browser QA. No accepted-storage or source-review result authorizes production publication.

## Reviewed code hashes

SHA-256 of the fixed source bytes at the end of this review:

- `mw3-reviewed-archive.mjs`: `88463c4c4f76897e363c1034e874eed090c2d3038e0e5809ecd3bf0a02b1cfbc`
- `mw3-reviewed-snapshot.mjs`: `5e26b4d0b355890c5d87b2632b020ee729b1200344046d6dd50d490f00ede377`
- `mw3-acceptance-evidence.mjs`: `d7a1b272aa4310815114e88ae3fc4e85ea3c205d2abd523eb8a6a85bee4c36d6`
- `mw3-reviewed-delivery.mjs`: `2cdf553c571d88ac68f9e92066d14e8219fad07b696fa50c2c4dd49e68504849`
- `mw3-snapshot-cli.mjs`: `53b35eb31c0235ef72efe28d32bee831f77c840b5930fbda611287d06fafb343`
- `mw3-source-tree.mjs`: `0adf3d40b7b4b0defbf7634e13fda410794cce623d32207380a14195817e9681`
- `apps/backend/src/index.ts`: `38f46a5d9fbc2ad90a92f917f136042261cd10f81c2d2134185d5e21b3cc880f`
- `apps/backend/src/mw3-transport.ts`: `c6030794e0fda559e557d2477e814bb7730ec90c2b7b516155d46d7a6da12a7d`
- `apps/shared/mw3-approved.ts`: `779a2a1e1d897feb343b45a8481112fe4735f25ce380b90d69cce539fab95e30`
