# Experimental MW3 source context split

This additive prototype is based on PR44 head 0838518. It does not change the existing snapshot, restore, receipt, compatibility or public registry gate. Existing numerical policies, input bytes, raw artifact hashes and 32 approved pins remain untouched. It emits an **unapproved proposal**, never a policy approval.

## Contract

The explicit policy assigns every reachable file an owner. Numerical roots cover the existing archive/identity/authoring closure, all sixteen author source inventories, input JSON, backend dispatch and registry, runtime and browser loading, continuation action/URL state, Agent hand/settlement/session/cache and recorded hand storage. UI roots cover Range/Agent components, consumer QA, local-D1 supervision QA and the additive workflow. Shared dependencies remain numerically owned.

Each context hashes sorted roots, actual file byte/SHA256 records and import/resource edges. The UI contract lists bridges to shared numerical files; those files are bound by the numerical digest. Changes to a bridge edge invalidate UI approval. Numerical changes invalidate numerical approval; final integration requires both. CSS-only changes preserve the numerical digest and stale the UI digest.

AST parsing follows static imports, re-exports, type imports, literal dynamic imports and adjacent declarations. Computed module imports require a reviewed expression hash and explicit source dependencies, or fail. Explicit resource edges retain input files accessed via runtime filesystem lookups. Unknown imports, owner downgrades from numerical to UI, missing sources, orphan classifications and stale computed declarations fail closed. The parser comes from the existing lockfile's @babel/parser dependency; no package is added.

The Git CLI accepts only an existing exact tree object, reads regular blobs with replace objects disabled and verifies all records against that tree. Integration joins numerical and UI approval digests with one source tree. Approval tokens must be supplied from a trusted independent review channel; tests use synthetic tokens only. This module alone does not authenticate reviewer identity. No token is minted or installed here.

## Review requirements / deliberate limits

This is a classification proposal, not a claim that static imports prove every dynamic runtime dependency. New non-import resource lookup or computed module loading requires explicit dependency review. External package code is represented by pinned package/lock records, not copied into source records. The mixed consumer files (AgentTable/RangeWorkspace) contain orchestration as well as presentation; their whole bytes remain UI gated. Numerical helpers/dispatch/loader/storage are conservative numerical roots, but proof that consumer inline logic cannot bypass those contracts still requires independent review and integration tests.

Do not activate the split by simply removing old sources from legacy manifests. Migration needs independently accepted numerical and UI inventory baselines, preservation of existing artifact/policy/input identities and receipts, protected receipt retrieval, and an integration-only gate that reconstructs both closures at the current integration tree. Existing legacy receipt verification stays active until that reviewed migration is complete. This prototype does not solve the current PR44 CSS base drift by itself.

## Validation

Run `node --test apps/frontend/tests/postflop-mw3-source-context.test.mjs apps/frontend/tests/postflop-mw3-source-tree.test.mjs`. Seven new tests cover actual shared ownership, CSS/UI isolation, equity/dispatch/registry/input/storage mutations, newly added shared imports and prohibited reclassification, import syntax/escape rejection, computed/orphan failures, and dual approval with same-tree verification. Existing three source-tree tests cover regular blobs, stale bytes, symlinks and replace refs.

Run `node apps/frontend/scripts/postflop-ai/mw3-source-context-cli.mjs` after committing the proposal to emit records from that committed tree. The additive design workflow runs tests and emits the unapproved proposal. No generation, restore bypass, D1 import, billing/access or deployment is introduced.

## Cost compared with frozen-source renewal

A frozen-source renewal reviews the existing sixteen-context source change once and preserves the current gate. This split additionally needs classification and non-import resource review, two independent source-context approvals, trusted receipt plumbing, compatibility/migration rules and integration QA. It is a larger follow-up; the prototype is deliberately isolated so it cannot silently substitute for the immediate frozen-source renewal. Prefer renewal for the current PR44 integration if this review work delays that fix.
