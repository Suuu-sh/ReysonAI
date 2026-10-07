# Stage 3 reviewed artifact storage

Stage 3 has its own deterministic Git LFS archive and normal-Git review receipt:

- `artifacts/preflop/stage3-reviewed.tar.gz`
- `configs/multiway-preflop-stage3.review.json`

The archive contains only the four compact saved datasets (`stage3-responses`, `stage3-call-equities`, `stage3-audit-report`, `stage3-coverage`) and `reasons/s3_*.json` for stored histories. Expanded authoring facts and equity/defense caches remain in ignored `.local/`. Rare and impossible histories remain explicitly classified in the compact coverage dataset; they have no fabricated strategy, equity or reason file.

The Stage 2 archive is unchanged. Its receipt continues to bind its original 1,888 JSON files. Stage 3 is checked by a separate receipt, so renewing delivery-source review for Stage 2 does not approve Stage 3 data. Both receipts must pass before a combined delivery can be serialized. A committed independent review status is required; a local candidate or a passing generator is not approval.

## Local authoring and independent review

With Stage 2 already restored, use the isolated route from `apps/frontend`:

```sh
npm run build:estimates -- --stage3-only
npm run pipeline -- --stage3-only --max-iterations 1
```

Each route copies the eight immutable predecessor datasets into a fresh staging directory, authors Stage 3 there, checks complete sources, exact coverage/omission evidence, saved equities and the current audit, and composes compact reasons. Installation touches only the four Stage 3 datasets and their `s3_` reason files. It cannot regenerate or overwrite earlier strategies, reasons, profiles, shared cash configuration or Stage 2 policies. `ESTIMATES_DRY_RUN=1` keeps candidates in staging. `STAGE3_FAMILIES` or `STAGE3_ROOTS` selections are partial diagnostic candidates and cannot replace the full snapshot. CI is expressly rejected by the authoring entry point.

`npm run range -- list s3_` and `view <s3_id>` use exact saved Hero own-action-reach × combo weights. Missing rare/impossible histories remain unavailable and can be inspected through the saved coverage classification; no other range substitutes for them. A `range -- check` containing only `s3_` IDs selects the isolated Stage 3 dry-run route and never reads external benchmark references. Mixed Stage 3/legacy checks are rejected. `audit:estimates` includes the complete saved Stage 3 audit and exact current coverage/equity checks when present; partial datasets or orphan Stage 3 reasons fail before any legacy-only report can hide the omission.

After authoring, run focused tests and arrange independent review of the exact data and bound source revision. The immutable regression fixture captures development `61e457f4e35d8e28b2476b304a118b89dbf4be1f` before Stage 3 changes, including all 1,888 delivered JSON files, 19 protected policy/configuration sources and the unchanged Stage 2 archive. Tests never obtain their expected baseline from a refreshed receipt.

```sh
node --test --test-concurrency=1 tests/stage3-*.test.mjs
python3 scripts/package-reviewed-stage3.py
node scripts/record-stage3-review-candidate.mjs
```

The packager reads saved bytes only. It reports `review_approved: false` and never changes either review receipt. It uses sorted regular USTAR entries, fixed file metadata and gzip timestamp zero; repeat packaging must produce identical bytes. Output is restricted to the Stage 3 archive namespace or ignored local staging. The candidate-recording command writes only to `.local/` with `pending-independent-review` status. An independent reviewer then records the approved exact file/source/archive hashes, fingerprint, counts, baseline and review scope in normal Git, after also renewing the Stage 2 receipt's changed delivery-source review. Do not refresh hashes merely to silence a failed check.

Uploading the actual LFS payload and fetching/hashing it from the published revision are separate publication requirements. A pointer alone is not a delivered archive. No publication, PR check, production import or full-suite success is established by these local packaging commands.

## Read-only delivery flow

The existing Actions job keeps the name **Verify reviewed preflop snapshot**. It checks out LFS, restores Stage 2 and Stage 3, verifies both approved receipts and full snapshots, serializes preflop-only SQL, runs the storage/coverage/reason/legacy regressions, verifies local D1 roundtrip/isolation/idempotency/rollback, and builds the compatible client. It never generates ranges, samples equities, composes reasons, packages candidates or writes review approval.

```sh
git lfs pull
node scripts/restore-reviewed-preflop.mjs
node scripts/restore-reviewed-stage3.mjs
node scripts/verify-reviewed-preflop.mjs --out .local/reviewed-preflop
```

Stage 3 restoration rejects pointer-only or changed payloads, altered source identities, unsafe or duplicate paths, nonregular entries, unexpected metadata, changed hashes/sizes, truncation and invalid padding. Every destination is checked before writing; directory/file symlinks and changed local candidates are refused. Repeated restoration of identical saved bytes is idempotent. Full publication also compares every complete compact reason payload against the deterministic read-only projection of its exact saved strategy, equity and context, including all numeric hand/spot facts and unreachable templates. A matching source fingerprint and decodable row alone are insufficient; verification never samples, authors strategies or writes reason files.

Full publication fails if Stage 3 is absent, partial, stale, missing reachable histories, missing compact reasons or inconsistent with its exact coverage evidence. The generic publisher's existing explicit `--allow-legacy-only` option can acknowledge an intentionally destructive omission; partial snapshots remain errors. Actions has no such fallback. The combined delivery manifest binds both review identities and both sets of counts, while preserving the existing preflop-only database schema and production verification safeguards described in the Stage 2 storage document.

## Long history filenames

Stage 3 history IDs can produce reason basenames longer than the 100-byte USTAR filename field. The archive therefore uses format `ustar+gzip-stage3-content-v1`: sorted regular `objects/<raw-body-sha256>` entries, deduplicated by exact content. The reviewed receipt maps each object back to its full original artifact path. The restorer accepts only that exact object set and verifies every hash, size and destination before writing. This preserves all original IDs without truncation, GNU/PAX extensions or unsafe archive paths. The existing Stage 2 archive remains byte-identical.
