# Five-bet copy checkpoint — 2026-10-07

Stopped at the requested scope boundary. This draft is incomplete; do not merge.

Baseline confirmed from origin: development `de27442325d271f4d550eac57f29c68ffa7a767c`, main `3ab429f8838479d7d5423c803f728382b404853d`, shared tree `05bd330e1f45352be6bff21bcdd8c26c8a7ff3f4`. Independent clone and branch `fix/five-bet-displayed-margin`; other worktrees and existing PRs were not modified. Repository-root AGENTS/.agents/skills are absent; frontend and estimated AGENTS were read. The explicit session instruction overrides the historical instruction to work directly on development.

## Saved checkpoint

The explanation helper subtracts one-decimal saved-format equity and threshold. Raw margin, call policy, random sequence, samples and saved numeric fields are untouched. The JSON was edited as text, without invoking generators or simulations. Exactly 81 margin tokens in 11 spots were corrected. The initial 83 apparent inline/detail discrepancies comprise 81 margin corrections plus two additional inline-equity discrepancies:

| Spot / hand | Existing inline equity | Saved/detail equity | Required equity | Existing margin |
| --- | ---: | ---: | ---: | ---: |
| CO_vs_BB_five_bet / ATs | 29.6% | 29.7% | 37.5% | 7.8pt short |
| BTN_vs_SB_five_bet / A4s | 32.0% | 32.1% | 37.4% | 5.3pt short |

Those two inline equity tokens remain unchanged. Completing displayed arithmetic and inline/detail equality requires changing prose equity as well as margin. The instruction says to stop if scope expands; no such expansion was retained. This is a checkpoint for the parent/user to resolve that scope.

## Validation

`node --test tests/five-bet-reason-arithmetic.test.mjs`: helper boundary regression PASS; complete saved inline/detail regression FAIL at CO_vs_BB_five_bet/ATs (29.6 vs 29.7). A read-only enumeration independently identifies both exceptions above. Full frontend suite/build/browser checks were not run at this stop boundary.

`node scripts/check-five-bet-copy-only.mjs de27442325d271f4d550eac57f29c68ffa7a767c`: PASS. All non-reason values across 2,535 rows deep-equal baseline; only 81 margin tokens changed; all 331 other tracked files under src/estimated are byte-identical, including limp-deep, detailed reasons and opponent profiles. Non-reason JSON SHA-256: `41203415b625e3dedb0d2444e8b3d78afd70d57bd1dac443cbc4ed74ee59a619`.

`git diff --check`: PASS. No range generation, simulation, publishing, receipt updates, merge or production changes.

## Actual explanation consumers and remaining considerations

`src/estimated/RangeWorkspace.tsx` AiReason (lines 154–169) prefers detailed reasons. In Japanese it uses hand.reason only after there is no detailed record, loading or error; other locales do not use that fallback. `fiveBetMatrixModel` in `src/estimated/five-bet-responses.ts` does not pass inline reasons into its aggregates. Thus the normal selected-hand UI already uses the matching detailed explanation; this draft primarily fixes persisted inline copy. No browser-visible impact is claimed.

`reasonSourceFingerprint` in `scripts/lib/reason-context.mjs` hashes whole legacy source datasets, including inline reason text. This copy-only edit therefore changes a newly calculated authoring fingerprint while existing detailed reason fingerprints remain unchanged. Runtime detailed-reason loading does not compare these fingerprints. Existing receipts/fingerprints were deliberately preserved; deciding future authoring-fingerprint handling is separate from this stopped copy-only checkpoint, and no publication was attempted.
