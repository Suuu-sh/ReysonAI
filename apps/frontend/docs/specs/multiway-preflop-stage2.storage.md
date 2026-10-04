# Stage 2 reviewed storage and automatic D1 delivery

## Author locally, review, then commit

The user's 2026-10-04 correction supersedes the initial source-only proposal. Generation and independent AI review happen before Git publication. GitHub Actions must never generate ranges, resample equities, compose new reasons, or update a review receipt.

Git contains the generator/catalog, the normal-Git review manifest, and a Git LFS pointer to one deterministic archive containing this exact reviewed compact set:

| Artifact | Files | Bytes |
| --- | ---: | ---: |
| `src/estimated/continuation-responses.json` | 1 | 27,736,908 |
| `src/estimated/continuation-call-equities.json` | 1 | 8,271,408 |
| `src/estimated/continuation-audit-report.json` | 1 | 1,545,287 |
| `src/estimated/reasons/{sq_,sq2_,cc_,c4_}*.json` | 1,611 | 5,722,499 |
| Total | 1,614 | 43,276,102 |

`artifacts/preflop/stage2-reviewed.tar.gz` is a 1,747,857-byte Git LFS object (SHA-256 `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`). Two independent archive builds were byte-identical. It contains only regular USTAR files with sorted paths, fixed metadata and gzip timestamp zero. A single archive avoids 1,614 separate small LFS objects. The original expanded set was 341,870,219 bytes; compaction saves 87.34%. No wholly impossible history or expanded authoring facts are committed. The 242 legacy JSON/reason files remain byte-identical. Restored Stage 2 JSON is ignored; caches, staging, SQL bundles and local databases stay in ignored `.local/`. The LFS object must actually be uploaded and fetchable: committing only a pointer is not successful publication. Account storage/bandwidth quota and billing are not inferred from this object's small size. The older PR29 still references its large original Git blobs; this branch does not inherit that commit and does not reclaim repository-wide historical storage.

`configs/multiway-preflop-stage2.review.json` lives outside `src/estimated`, so the recursive D1 publisher does not expose it as a dataset. It records:

- All 1,888 delivered JSON files, including legacy data and the 32 profile files preserved from development, with exact relative paths, byte counts and raw SHA-256. Missing, extra and changed files fail.
- A recomputed source dependency graph covering configurations, profiles, sampler/RNG, dedicated evaluator, model, audits, reason decoder, publisher/verifiers and dependency lockfile; workflow and database binding configurations are also bound.
- Source/policy fingerprint, 3,115 catalog decisions, 1,611 saved histories, 1,504 proved impossible omissions and 272,259 saved hand rows.
- The independent review scope, pre-delivery baseline commit and limitations. Exact current per-file source hashes, rather than the baseline commit alone, bind the delivery revision. The receipt is committed review evidence, not an external cryptographic approval service and not a claim that the full suite passed.

Changes to either reviewed artifacts or bound source/configuration require local verification and renewed review. After a new local generation passes independent review, run `python3 scripts/package-reviewed-preflop.py` to rebuild the deterministic archive and upload its LFS payload when Git publication is authorized. This packager only packages saved bytes and explicitly does not approve review. Reviewers then update the receipt using `reviewedFiles()` from `scripts/lib/reviewed-preflop.mjs` and the recomputed continuation source fingerprint. CI has no receipt-writing or approval mode. Never refresh hashes merely to make a failing pipeline green.

## Local authoring and review

From `apps/frontend`, install lockfile dependencies and, only when a new data generation is intended, run:

```sh
node scripts/build-continuations.mjs --install
node --test --test-force-exit --test-concurrency=1 tests/continuation-*.test.mjs tests/detailed-reasons.test.mjs
node scripts/audit-estimates.mjs --json
npm run typecheck
npm run build
npm run test:sites
```

The stage2-only authoring command copies the seven immutable legacy prerequisites to `.local/continuations-build-*`, runs the seeded sampler/audit/reasons, and installs only Stage 2 review candidates. It never regenerates legacy ranges. Review the generated outputs before updating the receipt and committing. Existing full-suite resource failures remain documented in the result report; targeted passes are not a substitute for a claimed full-suite pass.

Generation timing is deliberately outside the release path. Final reviewed inputs represent 329,564,000 accepted equity deals plus 13,060,000 final-pass defense samples, with additional reconciliation work. No samples or statistical safeguards were reduced for deployment speed.

## Actions flow

`.github/workflows/deploy-worker.yml` verifies pull requests targeting `development` or `main`. A PR receives no Cloudflare secrets and cannot enter the production job.

1. Check out the exact workflow revision with `lfs: true`, install the lockfile with pinned Node 22.20.0, and restore the archive. Pointer-only/missing or changed LFS payloads fail. The restorer checks every entry hash/path and rejects links, duplicates, unexpected files, truncation, and overwriting a changed local review candidate.
2. `verify-reviewed-preflop.mjs` verifies raw hashes, source identities, complete saved strategies/equities/reasons, exact reachability and current audit. It serializes only those saved JSON values into delivery SQL; it never computes replacement strategies.
3. Run continuation/reason/HU regression tests. Missing generated artifacts fail the first gate rather than becoming a successful optional skip.
4. Import into an isolated local D1 using pinned Wrangler 4.147.0. Check every reconstructed body hash, repeat-import idempotency, unrelated-table preservation and rollback of an intentionally failed import.
5. Typecheck/build/test the compatible client. Retain the exact SQL and its delivery manifest as an immutable artifact of that run. Raw JSON SHA and compact D1 JSON SHA are explicitly separate.

On the existing main push/manual deployment path, the production job requires all verification to pass. It downloads only that same run's named artifact, verifies it again against the same checkout, builds and successfully deploys the compatible client, and then calls `import-reviewed-preflop.mjs --remote`.

The importer is main-Actions-only. It first compares D1 metadata. If already identical, it verifies every actual stored part/body and skips the blocking import. Otherwise it captures a recovery bookmark and submits one SQL file containing only the idempotent `0003_preflop.sql` schema and full preflop replacement. It then checks every dataset name, hash, byte count, part count and ordered body through bounded direct-D1 queries, bypassing HTTP caches.

The same production concurrency group covers client and data, without canceling an in-progress release. PR verification has a separate cancelable group. A successful client deployment with a failed data import leaves a backwards-compatible client and the preceding D1 snapshot, not a partially inserted preflop dataset.

## Schema, scope, credentials and recovery

This release uses the existing `preflop_datasets` / `preflop_dataset_parts` schema. Data delivery is not the same as applying all schema migrations. Do not run unscoped `d1 migrations apply`: that directory contains unrelated postflop/account changes. Do not invoke bare `publish:d1`: its default also publishes private local postflop artifacts. The Actions path only creates/replaces preflop tables and does not access account/session or postflop rows.

Production uses only the already configured `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secret names. The token's D1 permission has not been verified by this implementation. If it lacks access to the existing `reysonai` database, deployment fails closed; any credential creation or permission expansion requires separate approval. No secret values are committed or inspected.

Wrangler 4.147.0 uses D1's import API for `--remote --file`, waits for completion, and documents rollback to the pre-import database state when an import fails. Keep the schema and entire replacement in one file, without `BEGIN`/`COMMIT`. This process temporarily makes the shared database unavailable, including account services. Identical snapshots skip it. A disconnected client has an uncertain outcome: inspect metadata/body hashes before retrying, rather than assuming failure.

The workflow never automatically invokes Time Travel: that would rewind the entire shared database, including unrelated user/account writes. For a completed but undesired data release, restore only a previously reviewed preflop snapshot from Git/run artifacts after approval. Keep the prior compatible client when using old data. The captured pre-import bookmark and import outcome are retained as a run artifact even when the deployment job fails. The bookmark is an emergency reference, not authorization for a whole-database restore.

The compatible reason loader is deployed before compact data. It also accepts legacy reason payloads. Existing browser/HTTP caches and open pages can retain prior data; this Stage 2 addition leaves legacy bytes unchanged and does not claim globally instantaneous replacement. Stage 2 action-path UI integration remains separate.

For local delivery verification without authoring:

```sh
git lfs pull
node scripts/restore-reviewed-preflop.mjs
node scripts/verify-reviewed-preflop.mjs --out .local/reviewed-preflop
node scripts/verify-preflop-local-d1.mjs --sql .local/reviewed-preflop/preflop.sql --manifest .local/reviewed-preflop/delivery.json
```

For constrained local diagnostics only, `--bounded-local` loads byte-exact statement groups into the disposable local database and explicitly reports that whole-delivery rollback is not established. Actions never sets this option: its full-file verification remains mandatory. The local cloud full-file attempt ended in a measured workerd SIGKILL; it is not evidence of a remote D1 file-size limit.

No production run, merge or readiness change is authorized by a successful local test or Draft PR.

References: [pinned Wrangler implementation](https://github.com/cloudflare/workers-sdk/blob/wrangler%404.147.0/packages/wrangler/src/d1/execute.ts), [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
