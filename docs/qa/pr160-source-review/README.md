# PR160 source-review evidence

This directory preserves selected small diagnostic and review evidence from the local evidence-v3 collection for PR #160. It is supporting evidence only: **no source-renewal receipt, independent approval, or installable acceptance was issued**.

## Reviewed source and result

The preserved source identity is commit 339b97a3f2fc4740fb621d098e74ee4f458957c7, tree 228bde91e060d20f36aee9c53e6eb7a60ac16c6b. The review records a scoped code-review PASS with no code findings, while the actual required reviewer model could not be verified. See review-summary.json, code-review.json, and reviewer-and-instructions.json.

Stage 2 recorded 1,888 artifact records (79,002,248 raw bytes) and rejected restore because the approved source/configuration identity changed. Stage 3 recorded 1,805 artifact records (60,027,700 raw bytes) and likewise rejected restore because its source identity changed. These are preserved diagnostics; they do not renew either source approval. See formal-files-preserved.json, mw3-recipe-preservation.json, and the full summary.

The Linux diagnostic run passed exact archive and official current-source verification for all 16 MW3 subjects: 112 raw files / 235,515,283 bytes and 561 historical joint warnings. The run issued no receipt and does not verify reviewer identity. See [linux-run.json](linux-run.json) and the [GitHub Actions run](https://github.com/Suuu-sh/ReysonAI/actions/runs/37967442609). Its diagnostic artifact is available [here](https://github.com/Suuu-sh/ReysonAI/actions/runs/37967442609/artifacts/11633703694) with the configured 14-day retention.

## Preservation and privacy

Files listed in preservation-manifest.json were checked against the source SHA256-ledger.json before copying. All selected evidence is small and text-based. SHA256-ledger.json is byte-identical to its source; its own original SHA-256 is recorded in the preservation manifest because a ledger does not hash itself.

Two local-path-only redactions are documented in path-redactions.json: the absolute source directory in review-summary.json is represented by <evidence-v3>, and local checkout paths in frontend-account-ui.log are represented by <workspace>. The original byte counts and SHA-256 values are retained. Other selected files are byte-identical to the source.

Large raw numerical files, raw rehash ledgers, generated MW3 manifests, and the 100 KB baseline UI log are not copied. account-boundary-check.mjs is omitted because its test text contains credential-like fixture material; its isolated test result is retained in test-results.json. No real account history was uploaded. The saved collect-preflop.mjs and collect-mw3.mjs are original small reproduction scripts tied to the external evidence-v3/review-v3 checkout and are retained as evidence, not runnable from this directory.

These documentation files are outside the Stage 2, Stage 3, HU, and MW3 source dependency closures; adding them does not change numerical source identities.
