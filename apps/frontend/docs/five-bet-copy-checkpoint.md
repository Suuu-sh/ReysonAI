# Five-bet copy checkpoint — 2026-10-07

Explanation corrections are complete. Draft PR #86 remains blocked for independent artifact/provenance review; do not merge or publish.

Baseline confirmed from origin: development `de27442325d271f4d550eac57f29c68ffa7a767c`, main `3ab429f8838479d7d5423c803f728382b404853d`, shared tree `05bd330e1f45352be6bff21bcdd8c26c8a7ff3f4`. Independent clone/branch `fix/five-bet-displayed-margin`; other worktrees and PRs were not modified. Repository-root AGENTS/.agents/skills are absent; frontend and estimated AGENTS were read. The explicit session instruction overrides the historical instruction to work directly on development.

## Corrections

The helper rounds explanation equity/threshold with the exact saved `round1` rule and subtracts those rounded facts. Raw equity, raw margin, call policy, samples and random sequence are unchanged. Existing JSON was edited as text, without generators or simulations. 83 inline reasons in 11 spots changed: 81 margin tokens and, after explicit follow-up authorization, these two equity tokens:

| Spot / hand | Old inline equity | Correct saved/detail equity | Required equity | Margin (unchanged) |
| --- | ---: | ---: | ---: | ---: |
| CO_vs_BB_five_bet / ATs | 29.6% | 29.7% | 37.5% | 7.8pt short |
| BTN_vs_SB_five_bet / A4s | 32.0% | 32.1% | 37.4% | 5.3pt short |

Raw `toFixed(1)` can differ from the saved `Math.round(value * 10) / 10` rule at binary decimal boundaries. Regression cases include 29.65 and 32.05, both margin signs and displayed equality.

## Verification

- `node --test tests/five-bet-responses.test.mjs tests/five-bet-reason-arithmetic.test.mjs tests/detailed-reasons.test.mjs`: 5 PASS, zero failures/skips. Every reachable inline lead across all 15 spots matches displayed arithmetic, detailed facts and detailed reason. Coverage checks all 169 hands per spot, including unreachable fact equality.
- `node scripts/check-five-bet-copy-only.mjs de27442325d271f4d550eac57f29c68ffa7a767c`: PASS. Every non-reason field across 2,535 rows deep-equals baseline. Only 81 margin tokens and the two specifically allowed equity tokens changed. All 331 other tracked estimated files are byte-identical, including limp-deep, detailed reasons and opponent profiles.
- Non-reason JSON SHA-256 remains `41203415b625e3dedb0d2444e8b3d78afd70d57bd1dac443cbc4ed74ee59a619`.
- Strict archive restore PASS: existing reviewed LFS bytes only, 1,614 files / 43,276,102 bytes, archive SHA-256 `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`. This restores ignored saved continuation artifacts; no authoring occurs.
- Unmodified `verify-reviewed-preflop.mjs` correctly FAILS: `Reviewed preflop artifact paths, bytes or SHA-256 changed; author and review locally`.
- `npm run typecheck`: PASS (both frontend and runtime projects).
- `git diff --check`: PASS. No range generation, simulation, receipt/approval edits, publishing or merge. Full frontend suite and browser verification are not claimed.

## Actual explanation consumers

`src/estimated/RangeWorkspace.tsx` AiReason (lines 154–169) prefers detailed reasons. In Japanese it uses hand.reason only after there is no detailed record, loading or error; other locales do not use that fallback. `fiveBetMatrixModel` in `src/estimated/five-bet-responses.ts` does not pass inline reasons into its aggregates. The normal selected-hand UI already uses the matching detailed explanation; no browser-visible improvement is claimed.

## Fingerprint rules and independent approval blocker

The exact current source inventory from `reviewedFiles()` matches the existing receipt: **zero changed bound sources**. The corrected artifact is the only changed reviewed artifact (1,888 materialized artifact records inspected). Its byte size is 871,890 and SHA-256 is `86a34ea4c482b9987c77112f6e64ba0940234ae262c6c460b0ad086c6a40476b`.

The following are separate provenance mechanisms:

1. `scripts/lib/reason-context.mjs` hashes full legacy datasets, including inline copy. The recomputed legacy reason fingerprint changes from `d489d1f554edc8d9c5b859c4f3a939956f78b1eccafdc7549862fdcda47ce653` to `8e67399d93bfb18d6068f21e7988b07eb591e6d8f027a972337e1ff8d76b3076`. Existing detailed reason files retain their original provenance. `compose-reasons.mjs:424` refuses stale authoring facts; we did not run it, regenerate facts or relabel old facts as newly generated. Runtime does not compare that authoring fingerprint.
2. `scripts/lib/opponent-profile-build.mjs:profileSourceFindings` hashes complete balanced source bytes. Four unchanged profile metadata files (nit, station, lag, maniac) now report `profile-source` errors for five-bet. Their strategies are unchanged, but accepting them against the new source requires an explicit reviewed provenance amendment.
3. `scripts/lib/reviewed-preflop.mjs:assertReviewRecord` binds exact artifact/source/archive bytes. `docs/specs/multiway-preflop-stage2.storage.md` states: “Changes to either reviewed artifacts or bound source/configuration require local verification and renewed review.” It also forbids refreshing hashes merely to make CI green. `.github/workflows/deploy-worker.yml` restores/verifies first and never writes review receipts or authors strategies in CI.

Therefore the next step is **independent review of this exact copy-only artifact change and a narrowly attributed provenance/receipt amendment**, preserving every original strategy-quality approval and limitation. Any necessary profile or detailed-provenance metadata changes must accurately describe this copy-only source change and receive that review; they would also change the current “all other estimated files unchanged” scope and require corresponding evidence. No fingerprint exclusion, validation bypass, legacy approval reuse or simulated new approval was added. Receipt, profile metadata and detailed fingerprints remain untouched pending that review. The author does not self-approve this change.
