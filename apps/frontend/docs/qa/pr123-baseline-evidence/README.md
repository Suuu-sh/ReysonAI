# PR #123 baseline and standard-mode evidence

This evidence records a standard-mode parity capture, the runtime/import closure used for the candidate overlay, and the classification of the earlier full-suite failures. It is review evidence only. It does not renew numerical-policy approval, source-review receipts, D1 state, or production readiness.

## Standard-mode parity

The same capture program evaluated 13 standard-mode outputs on a clean checkout of historical baseline commit `7c2fe16c20c0c5bcf2777ccd0d84572a41880cd5` and on that baseline with only the 70 files in `runtime-import-closure.json` overlaid from source commit `91109e156c17c7fdb9e2eb0dbc8d0704c7ee3e46`. Each candidate closure blob was checked against the corresponding file in PR head `6b5291089c15304c25af7433e87cd1bcaac38428`. This overlay is deliberately described as a runtime/import closure, not a full candidate checkout.

All 13 canonical output values are present in `raw-standard-output-objects.json.gz`. The gzip SHA-256 is `db2eac5468111dffd02f4bb6475876506825fbcc59ed13993dc8e339b206fba6`; after decompression the canonical JSON object is 886,818 bytes and its SHA-256 is `13e2e209855c33995d3cfceb04ee1d0de1faad0aa7f953c72657618cc8450185`.

To inspect the saved object:

```sh
gzip -dc apps/frontend/docs/qa/pr123-baseline-evidence/raw-standard-output-objects.json.gz > /tmp/pr123-canonical-outputs.json
shasum -a 256 /tmp/pr123-canonical-outputs.json
```

To rerun the comparison from a clean clone that has the referenced commits:

```sh
git fetch origin pull/123/head:refs/remotes/origin/pr-123
bash apps/frontend/docs/qa/pr123-baseline-evidence/reproduce-standard-output-parity.sh "$PWD" /tmp/pr123-parity-reproduction
```

The runner verifies the exact baseline/source/PR-head commit trees and all 70 closure blobs before overlaying anything. It requires Node.js `v25.8.1` and invokes the capture script with `--experimental-strip-types`. The archived capture ran on macOS (`darwin`); this evidence does not claim Linux runtime parity.

The exact commands from the original capture, the 13 per-output hashes, measured runtimes, input identity, and raw envelope checksums are in `standard-output-parity.json`. The baseline and candidate capture envelopes were 2,390,646 and 2,390,648 bytes respectively and are represented there by hash; the shared 13-value output object is the compact raw artifact published here.

## Full-suite failure classification

`full-suite-failure-classification.json` describes the prior 1,417-test macOS run and separates failures reproduced on clean development, host-specific failures, a test-only migration-count correction, source/receipt identity failures, and unresolved cases. The full suite was not rerun for this evidence update. Any additional focused review should run in clean Linux CI as described in the task, not against the dirty local checkout.
