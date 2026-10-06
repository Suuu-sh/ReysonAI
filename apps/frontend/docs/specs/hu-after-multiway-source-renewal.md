# Source-only renewal: HU postflop after squeeze / cold 3bet / cold 4bet

Date: 2026-10-07. Reviewer: Claude (main session), implementation by Codex gpt-6.1-sol.

## Scope
Adds 40 heads-up postflop spots reached after a third player folds preflop (top 40 of
stage A by estimated reach; remaining A and all B are listed as deferred in
`scripts/data/hu-after-multiway-spots.json`). Source-only change to the postflop spot
catalogue and input builder that the reviewed preflop source graph imports.

## Changed sources
- Modified: `scripts/postflop-ai/{browser-inputs.ts, generate.mjs, inputs.mjs, spots-core.ts, spots.ts, types.ts}`
- Added: `scripts/data/hu-after-multiway-spots.json`, `scripts/postflop-ai/multiway-inputs.mjs`

## Verification
- All 1,888 preflop artifact records and the stage-2 archive are byte-identical; no preflop data generated or edited.
- Existing 45 HU spots: `spotById`, `loadInputs().fingerprint` and `seatRows` unchanged (fixture test `hu-after-multiway-inputs.test.mjs`).
- New spots read saved preflop frequencies only (product of each participant's saved action frequencies); folded players' cards are not removed.

## Limitations
No renewal of the original Astra strategy/data-quality approval. Postflop policies are AI estimates, not GTO.
