# Five-bet copy and approved provenance amendment — 2026-10-07

Explanation corrections and the exact independently approved metadata amendment are applied in Draft PR #86. Final-head CI is required before readiness; merge/main/production changes are not authorized.

## Scope and exact independent approval

Baseline: development `de27442325d271f4d550eac57f29c68ffa7a767c`, main `3ab429f8838479d7d5423c803f728382b404853d`, shared tree `05bd330e1f45352be6bff21bcdd8c26c8a7ff3f4`. The independent reviewer approved candidate `e024e78065c50ee1396758580576d173fd614546` and precisely enumerated subsequent metadata updates. Other worktrees/PRs were untouched. Frontend/estimated AGENTS were read; repository-root AGENTS/.agents/skills are absent.

The exact reviewer report is [pr86-independent-copy-approval.json](pr86-independent-copy-approval.json), Library `libfile_d940bce527e0819195ce2b7ca3a5cf56`, 11,706 bytes, SHA-256 `ad5c2ada8e117bbe59a58c8d59588367e2a70016ccc069b0f3a46397a40a4e53`. It was obtained through the formal Library transfer helper and checked before applying changes. This is an independent task, not self-approval or a different-vendor claim; the review is limited to copy/provenance, not renewed strategy-quality approval.

## Explanation correction

The pure explanation helper uses the exact saved `round1` rule for equity and threshold before subtraction. Raw equity, raw margin passed to callFrequency, frequencies, sample count and RNG/seed are unchanged. Existing JSON was edited as text without generators or simulations. 83 inline reasons in 11 spots changed: 81 margin tokens and these two explicitly authorized prose equity tokens:

| Spot / hand | Old inline | Saved/detail | Required | Unchanged margin |
| --- | ---: | ---: | ---: | ---: |
| CO_vs_BB_five_bet / ATs | 29.6% | 29.7% | 37.5% | 7.8pt short |
| BTN_vs_SB_five_bet / A4s | 32.0% | 32.1% | 37.4% | 5.3pt short |

Binary decimal boundaries can make raw toFixed differ from saved Math.round. Regression includes 29.65 and 32.05, both signs and displayed equality.

## Applied metadata and preserved approval

Only `balanced_source_sha256.five-bet-responses` in four `profiles/{nit,station,lag,maniac}/villain/meta.json` files changed, from `4f1b78b45e364c14f93cbe19cb7bef6e4ecfbc9076fd79d0834d2dd3b4b91d7c` to `86a34ea4c482b9987c77112f6e64ba0940234ae262c6c460b0ad086c6a40476b`. Every resulting file SHA/byte length exactly matches the independent approval. Parsed objects match after restoring that one field; no profile numeric or strategy changes.

`configs/multiway-preflop-stage2.review.json` updates exactly those four artifact records plus five-bet and content_sha256, and appends separately attributed `review.copy_amendments`. All original approval fields, original reviewer/baseline/limitations/source renewals, remaining 1,883 artifact records, 103 source records, archive, continuation counts and fingerprint are preserved by structural comparison. `reviewedFiles()` observed approved content SHA `ef05f76b24009d8b4270860f68335e3006c6b82329cedb97be6c04973b34f5ce`, matching the independently predicted value.

Continuation source fingerprint was recomputed read-only and remains `b3538b0c44f04016e57d6eb76802665cf405d65f87e856b9860ed8a479065e53`; counts remain catalog 3,115 / saved 1,611 / unreachable 1,504 / hands 272,259. Archive SHA remains `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`.

## Legacy provenance and actual consumer

The reviewer explicitly concluded **preserve historical detailed fingerprints, no migration/recompose**. Legacy authoring fingerprint changes from `d489d1f554edc8d9c5b859c4f3a939956f78b1eccafdc7549862fdcda47ce653` to `8e67399d93bfb18d6068f21e7988b07eb591e6d8f027a972337e1ff8d76b3076` because it hashes inline copy too. Saved detailed reasons remain accurately matched to current saved numeric facts; original provenance is retained. Old local authoring facts cannot be reused by compose-reasons against the new fingerprint: its stale-fact guard is unchanged. No facts/detail fingerprint rewriting, fingerprint exclusion or automatic migration occurred.

RangeWorkspace AiReason prefers detailed reasons; fiveBetMatrixModel does not pass inline reasons into aggregates. The usual UI already uses the matching detailed explanation. No browser-visible improvement is claimed.

## Verification

Before metadata application: focused five-bet/arithmetic/detail tests 5 PASS, zero failures/skips; both typechecks PASS. Independent reviewer fetched complete before/after artifacts and all 15 detailed reason files and independently ran both arithmetic tests PASS. No full-suite or browser pass is claimed.

Post-amendment checks and exact final-head CI results are recorded below. The comparison command checks every non-reason value of all 2,535 rows and every other tracked estimated file: 327 byte-identical plus four exact metadata-only reference amendments. Non-reason JSON SHA remains `41203415b625e3dedb0d2444e8b3d78afd70d57bd1dac443cbc4ed74ee59a619`.

Commands:

- `node scripts/check-five-bet-copy-only.mjs de27442325d271f4d550eac57f29c68ffa7a767c`
- `node scripts/restore-reviewed-preflop.mjs` (saved reviewed bytes only; no authoring)
- `node scripts/verify-reviewed-preflop.mjs --out .local/pr86-approved-delivery`
- `node --test --test-concurrency=1 tests/five-bet-responses.test.mjs tests/five-bet-reason-arithmetic.test.mjs tests/detailed-reasons.test.mjs tests/reviewed-preflop.test.mjs tests/opponent-profiles.test.mjs`
- `npm run typecheck`

Post-amendment results:

- Comparison PASS: 2,535 non-reason rows unchanged; 327 tracked estimated files byte-identical; four exact approved reference-only metadata amendments.
- Strict restore PASS: 1,614 files / 43,276,102 reviewed bytes.
- Unchanged review/profile/delivery verifier PASS: 1,888 datasets, `generated_strategies:false`; SQL 68,705,643 bytes / SHA-256 `04d176915c953d141599ea8d6ff7d75f1b65e145d1f42b99a9d94f9faceb2fec`.
- Selected tests: 20 PASS, zero fail/skip. **Execution limitation:** opponent-profiles.test.mjs includes a deterministic generator test that invokes the existing profile generator into a disposable temporary directory. This was mistakenly included despite the no-generation request. No persisted profile/strategy was regenerated or overwritten; the temporary outputs are not delivered. Do not claim no generator invocation occurred. This test will not be rerun for this task.
- No numeric artifact changes, sampling, simulation, weakened gates, old approval impersonation, merge, deployment or production writes.

Final-head CI result is pending at commit creation; it will be reported separately without modifying the approved artifacts.
