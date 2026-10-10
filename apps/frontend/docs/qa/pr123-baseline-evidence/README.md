# PR #123 baseline and standard-mode evidence

This folder records a standard-mode output comparison, the runtime/import closure used for the candidate overlay, inherited JSON input identities, and a classification of the earlier full-suite failures. It is review evidence only. It does not renew numerical-policy approval, source-review receipts, D1 state, or production readiness.

## Corrected standard-mode comparison

The published replay script previously applied the candidate overlay before both captures, so replaying that script captured candidate code twice. That defect is corrected in `reproduce-standard-output-parity.sh`: it now creates two separate worktrees, asserts the historical baseline worktree is clean before overlay, checks out the candidate closure only in the second worktree, enforces Node.js `v25.8.1`, and records both execution-tree identities.

The earlier recorded capture commands used two different directories. This evidence does not claim that those original captures were contaminated. The corrected run was repeated from a clean checkout of baseline commit `7c2fe16c20c0c5bcf2777ccd0d84572a41880cd5` and a separate baseline checkout with the 70 verified runtime/import files from source commit `91109e156c17c7fdb9e2eb0dbc8d0704c7ee3e46` overlaid. All 70 candidate blobs match both the source commit and protected PR head `6b5291089c15304c25af7433e87cd1bcaac38428`.

All 13 standard-mode prompt, policy, explanation, range-fact, node, and balance outputs matched. The saved baseline and candidate capture envelopes include complete output values and are compressed at `baseline-capture.json.gz` and `candidate-capture.json.gz`. Their execution trees are recorded in `standard-output-parity.json`; the candidate overlay tree is `f1bc0d3312adb5ebb96e8890e80d17126d60bbf5`.

The 70-file closure manifest is pinned by SHA-256 `c28d77a70470845f89c37e1659c8b9a9b4b84ad6f6bca669f2e1df5e32a70d1c`. In addition, `runtime-filesystem-json-inputs.json` binds eleven filesystem JSON inputs used by the run, including six saved range datasets and five statically imported configs/catalogs. Their blob identities are the same in the historical baseline, source commit, and protected PR head; the manifest SHA-256 is recorded in the report.

The corrected canonical 13-output object is in `raw-standard-output-objects.json.gz`. Its gzip SHA-256 is `9f336573051bdf4439e01e44d9766658ac9b0d1dc598b597cc1774c0b07e6767`; after decompression, its SHA-256 is `13e2e209855c33995d3cfceb04ee1d0de1faad0aa7f953c72657618cc8450185`.

The previous candidate-only object is preserved as `superseded-candidate-only-output-objects.json.gz`. It is labeled superseded because the old checked-in replay runner did not reproduce the two-checkout procedure. Its bytes are not represented as the corrected comparison proof.

To inspect the corrected canonical object:

```sh
gzip -dc apps/frontend/docs/qa/pr123-baseline-evidence/raw-standard-output-objects.json.gz > /tmp/pr123-canonical-outputs.json
shasum -a 256 /tmp/pr123-canonical-outputs.json
```

To rerun, use a full clone that contains the pinned baseline, source, and protected PR commits:

```sh
git fetch --no-tags origin pull/123/head:refs/remotes/origin/pr-123
bash apps/frontend/docs/qa/pr123-baseline-evidence/reproduce-standard-output-parity.sh "$PWD" /tmp/pr123-parity-reproduction
```

The archived capture ran on macOS (`darwin`); it makes no claim about Linux runtime parity. The Linux CI workflow now also runs the all-board checkpoint and lineage tests, which were missing from its prior 14-case coverage of the 21 unresolved test cases.

## Full-suite failure classification

`full-suite-failure-classification.json` describes the prior 1,417-test macOS run and separates failures reproduced on clean development, host-specific failures, the test-only migration-count correction, source/receipt identity failures, and unresolved cases. The full suite was not rerun for this evidence update. Focused Linux coverage runs in the existing MW3 workflow; no assertions were relaxed.
