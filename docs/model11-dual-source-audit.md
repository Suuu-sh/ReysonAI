# Original-to-memo HU audit (offline, unapproved)

This is one narrowly admitted lineage: original `1e417d24cd123d85039545eecebe0154e5ecf8c4` to reviewed local raw-law memo `7911d9a54acd2c3d67db0e3d48b2aad08bb339fc`, plus the separately reviewed audit-only additions. Execution must name the final clean commit containing these additions. `7911` alone is not an execution version for this path.

The original full 720,000-trial report, original evidence and original source remain unchanged. No original result is retagged, and no second report-production run is required merely to introduce the optimization. The already-required full fresh audit replay is the first full memo execution. The ordinary same-source audit, cell producer, semantic validator, storage codec, policies, arithmetic, thresholds, raw12 and legacy45 are unchanged. Strict/completion inventories have only the exact `effective-reach.mjs` record refreshed. This does not include the separately staged all-board output-codec work.

## Process and freshness boundaries

1. `prepare` runs the actual original source's receipt and complete cell/event/full-proof semantic validators in its own bounded process. It requires the original complete full72 report. It never produces a missing original cell and counts no validation work as fresh trials.
2. Four separately launched `fresh-lane` processes own the fixed modulo-four cell indices (18 cells per lane). Each uses only the fixed inputs, policies, full plan and its own final source binding. A lane never reads the original report, original validation payload or original numeric evidence. Each cell uses a new empty isolated store, the unchanged producer and validator, and a completion marker written last.
3. `finish` validates every fresh receipt, verifies full72 unique index coverage, and imports only those new worker bytes into a fresh aggregation store. The original same-source producer is used with `requireExisting: true` solely to aggregate and revalidate them; it cannot compute a missing cell. Every original marker, chunk and proof is checked against its original binding and previously validated record, then compared exactly with the independently produced fresh counterpart.
4. The unchanged original post-replay legality, strict balance, balance partition rehydration, reference-versus-reference sanity, count/coverage and quality conditions run under the final memo source. The result still explicitly requires matching complete strict all-board evidence and independent review. It is not production approval or a substitute for those gates.

The current evidence format records paired candidate/baseline returns and completion events/laws/proofs, not every ordinary-action trajectory. Comparison covers every ordered persisted trial and event, complete proof body (all rows), count, metric and warning. A closed path-specific allowlist excludes only independently checked source-attribution wrappers and the corresponding derived file/report hashes. It never removes arbitrary fields recursively. Both source identities, both report references, final execution commit, old semantic-validation receipt, fresh lane receipts and source-neutral numerical payload hashes are retained in a distinct dual-source receipt.

No parent scheduler or extra coordinating Node process is created. Run stages only after explicit capacity admission. In particular, do not add a fifth strategy/Node process to a live four-process run. Lane parallelism is fixed at four, not a generic scheduler. `prepare` and `finish` each need one bounded process; the four fresh lanes require all four slots. Original validation and the new finalizer do not load both large input trees into one process.

Recovery is limited to this exact run/spec/source/plan. The original immutable lane provenance is retained. Each new cell has an exclusively created attempt directory and a started record tied to that lane, its source/binding/spec and its index. Only a completed per-cell receipt naming that exact attempt can be retained, after every referenced byte and the original semantic law/proof validator pass again. A partial chunk or even a cell marker without its completed receipt does not count: recomputation gets a new empty attempt directory, and the partial attempt stays untouched. Earlier runs, arbitrary same-binding caches and original-source cells are never admitted as fresh production.

An interrupted finalizer revalidates all 72 actual fresh receipts again. Exact already-written immutable aggregation parts can be reused; changed bytes fail closed. Existing merged cells never fill a missing fresh receipt. Completed lane/final receipts are revalidated and reused without rewriting timestamps. Neither retry path regenerates the completed original report or recomputes already receipted fresh cells. This is fixed-purpose recovery, not a general scheduler. Initial `prepare` must still use a new run root; partial setup before immutable lane provenance exists is not adopted.

## Required spec

Write an external JSON spec after code review, with the exact final execution commit. The strict `inputs.files` values are repository-relative and must exist with identical bytes at the same relative paths in both checkouts. Safely copy only missing policy inputs into the new checkout; verify their hashes against the original binding. Raw12 inputs must match their existing exact pins. The original report must be complete before `prepare`.

```json
{
  "kind": "model11-reviewed-original-to-memo-audit-spec",
  "version": 1,
  "original": {
    "root": "/absolute/preserved-original-checkout",
    "commit": "1e417d24cd123d85039545eecebe0154e5ecf8c4",
    "report": "/absolute/completed-original-report.json",
    "evidence": "/absolute/original-evidence-root"
  },
  "optimized": {
    "root": "/absolute/reviewed-final-checkout",
    "executionCommit": "EXACT_FINAL_REVIEWED_40_HEX_COMMIT"
  },
  "inputs": {
    "spot": "BTN_open_SB_3bet_BB_call_BTN_fold",
    "files": {
      "flop": "apps/frontend/.local/postflop-ai/btn-open-sb-3bet-bb-call-btn-fold-hu-v1-policy.json",
      "later": "apps/frontend/.local/postflop-ai/btn-open-sb-3bet-bb-call-btn-fold-hu-v1-later-policy.json",
      "plan": "apps/frontend/tests/fixtures/model11-representative-full-plan.json"
    }
  },
  "runRoot": "/absolute/new-empty-audit-run",
  "node": {
    "version": "EXACT_REVIEWED_NODE_VERSION",
    "binary": { "bytes": 0, "sha256": "EXACT_REVIEWED_NODE_BINARY_SHA256" },
    "execArgv": ["--max-old-space-size=512"]
  },
  "equivalence": {
    "fullProof96": "/absolute/hu-model11-full-proof-parity-20261005.tar.gz",
    "independentReview": "/absolute/hu-model11-full-proof-independent-review-20261005.tar.gz"
  }
}
```

The two prerequisite archive hashes are hardcoded to the reviewed nonvacuous full-proof96 check and its independent review. That bounded diagnostic is a prerequisite, not a universal proof or full gate. The checked-in preserved96 test fixture is explicitly test-only and cannot be passed as a fresh full72 audit receipt.

## Essential verification commands

From the repository root, static-only checks:

```sh
python apps/frontend/scripts/postflop-ai/perf/verify-model11-dual-source-audit.py
python apps/frontend/tests/test_model11_dual_source_audit.py
```

Only after a Node lane is granted, from `apps/frontend`:

```sh
node --max-old-space-size=512 tests/postflop-model11-dual-source-audit.test.mjs
node --max-old-space-size=512 tests/postflop-model11-completion-representative.test.mjs
```

Direct invocation runs each `node:test` module in one Node process, avoiding an extra test-runner coordinator/child. The new contract suite compares the preserved96/84-row proof fixture and rejects omitted/reordered evidence, changed returns/events, wrong source attribution, tampered proof rows and unlisted wrapper fields. Static tests require the original numerical validators and all post-replay checks to remain unchanged. Legacy original-source whole-tree-preservation tests should still be run on the original checkout; the new memo lineage has its own explicit preservation check.

After independent code review, the original report finishes, input/spec pins are reviewed, and the required execution slots are granted:

```sh
CLI=apps/frontend/scripts/postflop-ai/evaluate-model11-dual-source-audit.mjs
SPEC=/absolute/reviewed-spec.json
SPEC_SHA=EXACT_SHA256_OF_SPEC_BYTES
node --max-old-space-size=512 "$CLI" --operation prepare --spec "$SPEC" --spec-sha256 "$SPEC_SHA" --execute-full
# Launch the following four commands concurrently only when all four slots are free.
node --max-old-space-size=512 "$CLI" --operation fresh-lane --lane 0 --spec "$SPEC" --spec-sha256 "$SPEC_SHA" --execute-full
node --max-old-space-size=512 "$CLI" --operation fresh-lane --lane 1 --spec "$SPEC" --spec-sha256 "$SPEC_SHA" --execute-full
node --max-old-space-size=512 "$CLI" --operation fresh-lane --lane 2 --spec "$SPEC" --spec-sha256 "$SPEC_SHA" --execute-full
node --max-old-space-size=512 "$CLI" --operation fresh-lane --lane 3 --spec "$SPEC" --spec-sha256 "$SPEC_SHA" --execute-full
# After all four complete, run one finalizer.
node --max-old-space-size=512 "$CLI" --operation finish --spec "$SPEC" --spec-sha256 "$SPEC_SHA" --execute-full
```

The result is `dual-source-audit.json` within the new run root. The separate `fresh-replay-report.json` is its source-bound replay artifact, not another original report-production stage. A quality error or unresolved coverage produces exit code 1 and an unapproved/blocked result. No successful process result implies all-board acceptance, merge or deployment permission.
