# Multiway preflop stage 2 result

## Result

Complete bounded preflop continuation authoring, generated from explicit profiles and audited saved sources. These are independent AI estimates; they are not a jointly solved strategy or a GTO-quality guarantee.

- Clean source-only branch: `feat/multiway-preflop-stage2-source-only`
- Publication base: current development `116561aac40e06902bf168d7e00a4f27cc912637`; all 28 upstream-changed paths are retained, with both AGENTS additions reconciled.
- Verified development baseline: `9a787954ecd49546d119e80c226afce8347c141a`
- Dedicated cloud checkout: `reysonai-stage2`; the previous stage-one checkout was preserved.
- Scope: 75 starting histories; 100 existing decisions reused; 3,115 new decisions; 526,435 structural hand slots; 272,259 persisted hand rows; 4,200 structural terminal histories.
- Reachable decision histories: 1611; wholly unreachable histories: 1504. Wholly impossible histories are omitted from disk; individual zero-reach/card-incompatible hands within a stored history retain explicit fold100 placeholders.
- Total registered preflop coverage: 3,340 decisions, comprising the previous 225 plus these 3,115.
- Legacy preservation: 242/242 pre-existing estimated JSON/reason files remain byte-identical to the verified baseline.
- User-approved exception, isolated from shared gameConfig: fixed 30BB four-bets after two-caller squeezes only; other sizes are unchanged.
- External benchmarks were neither referenced nor run and are excluded from acceptance.

## Coverage

| Family | Roots | New decisions | Scope |
|---|---:|---:|---|
| One-caller squeeze | 20 | 440 | Remaining participants after four-bets and 100BB all-ins |
| Cold four-bet | 20 | 160 | Opener call/shove and all remaining responses |
| Two-caller squeeze | 15 | 2,295 | All three initial responders and their four-bet/all-in continuations |
| Third-party three-bet call | 20 | 220 | Opener response and remaining four-bet/all-in continuations |

The count is structural coverage, not a count of playable recommendations. Other seats are forced folds. Additional outside callers/raisers, three/four original callers, new postflop strategies, alternative stacks/formats and action-path UI integration are outside this bounded data task.

## Review corrections (2026-10-04)

- Restored shared cash config byte-for-byte and moved the approved 30BB exception into `configs/multiway-preflop-stage2.json`. Baseline-pinned regressions reproduce the stale-policy failure before the fix and preserve all 45 currently catalogued reachable HU fingerprints afterward (including the historical 44).
- Reachable-only schema 1.1 stores 1,611 histories and proves all 1,504 omitted histories impossible from authoritative source actions. Missing reachable ancestors/strategies stay errors or unavailable, never invented zero-reach policies.
- Compact reason templates plus exact facts preserve every rendered reason and numeric fact across all 272,259 retained hand entries. All 1,611 strategy histories preserve their previous frequencies and geometry.
- Generated strategy/equity/audit/reason outputs are ignored, with stage2-only generation and guarded full-snapshot publication documented in [storage and publication](multiway-preflop-stage2.storage.md). Existing Git history is not rewritten.
- Coverage distinguishes unreachable histories from missing work, including a stored descendant whose required ancestor is missing. The publisher blocks absent/partial Stage 2 snapshots unless a legacy-only replacement is explicitly selected.
- Final independent Astra code review reports no remaining findings. No protected visual/action-path sources were changed.

## Verification

- Stage2-only generation/install: passed; zero blocking findings, 38 saturated EV-capacity conflicts and seven segregation advisories. 632 joint defense events retain their source/policy evidence.
- Legacy regression: all 242 saved JSON/reason files byte-identical; shared config bytes and all 45 reachable HU source hashes preserved. The actual private `.local/postflop-ai` policy files are absent here, so that optional check is explicitly skipped; baseline-pinned policy-loader regressions run normally.
- Final combined continuation/coverage/audit/reason checks: 87 passed, one explicit private-policy-artifact skip (including 24 sparse/compact unit tests). Publication and coverage review regressions passed, including missing-ancestor and destructive-snapshot guards. The actual detailed-reason loader also passes its compact-payload integration test.
- Published data/reason checks: passed, including strict sources/flow/EV/joint defense and complete reason fingerprints. Independent dense-versus-expanded reason comparison is exact apart from refreshed provenance.
- Full serial suite: 533 passed, nine explicit optional skips, two test-file SIGKILL failures in `postflop-hand-ev` and `postflop-performance`; Isolating every case in those two files gives ten passes and three further SIGKILLs. The SB hand-EV failure was also reproduced with a fresh git archive of untouched development `9a787954`, with the same SIGKILL; the broader assertion coverage remains unverified. These process failures are not treated as a passing full suite or presumed baseline assertion failures. The known `postflop-flop-base` determinism test passed in this run.
- Final clean-checkout targeted checks: 27 passed, six explicit generated-artifact skips. Missing generated data is labeled not-generated/unavailable. Its production build and seven Sites tests also pass; a real clean-checkout publication CLI probe exits before creating SQL.
- Production build passed with a 768MB Node heap after resource-constrained attempts failed. Typecheck and seven Sites tests passed. Existing large-chunk warnings remain.
- Lint reports seven findings in unchanged `ProductApp.tsx` / `site/ServiceSite.tsx`; no blanket lint-pass claim.
- The correction pass does not merge, deploy, mark ready or rewrite history. The clean source-only Draft PR is created separately from PR29, which remains unchanged for comparison.

Final regenerated delivery size is 43,276,102 bytes, down from 341,870,219 bytes (87.34%). Reasons shrink from 272,965,675 to 5,722,499 bytes. The complete per-history compositions and advisory details are reproducible from the ignored datasets/audit and the range CLI; they are no longer duplicated as a large Markdown table in Git.

## Independent-review corrections

1. Isolated a correct best-five evaluator for continuation equities. The inherited evaluator compared discarded sixth/seventh-card kickers and could choose the wrong quads/two-pair kicker. Existing datasets/evaluator were deliberately left unchanged. Board-playing ties and 2,000 independent best-of-five comparisons cover the new evaluator.
2. Replaced marginal fold-rate multiplication with joint card-conditioned all-fold assessment. Every responder’s hand-specific fold policy is multiplied inside each complete legal deal; maximum legal call capacity is evaluated on those same deals.
3. Joint deals include the saved ranges of previously involved folded players as dead cards. Whole-tuple rejection avoids bias from resampling only a later colliding player.
4. Confidence intervals fail closed. Supported-hand saturation is checked exactly, not inferred from a sample missing a rare hand. A small saturated boundary was resolved by exact enumeration of 87,228 legal deals.
5. An exact AA-only live opponent triggers explicit support-aware three-bet/four-bet response profiles: AA retains flat/raise candidates, while generic non-AA raises are suppressed. With two such opponents, Hero’s Ax hands are impossible and remain placeholders.
6. Repairs use independent working views; predecessor frequencies remain unchanged until a complete topological regeneration. Large outputs are streamed, and staged validation runs in a short-lived process to reduce memory peaks.

## Assumptions and limits

- 6max cash, 100BB, no ante, 5% rake capped at 3BB, no flop no drop; raise sizes are total committed amounts.
- Two-caller squeezes are 14.5/15.5BB. Their minimum full four-bets are 26.5/28.5BB; the approved fixed size is 30BB. Every five-bet is total 100BB.
- Hand reach is the product of the actor’s exact saved prior actions, combined with whole-history and joint-card feasibility. No heads-up range is substituted for a later participant.
- Call equity faces every currently live opponent at its known saved reach. Only actual chips plus Hero’s current call enter the pot; pending players’ hypothetical calls are not credited. This incomplete-action model does not solve their eventual conditional continuations. Shared multiway EQR is assumed; all-in EQR is 1.
- The joint gate uses conservative empirical Bernstein bounds, with the per-event confidence budget allocated across both paired estimates and all adaptive looks. Exact fallback is limited to at most 2,000,000 raw holecard tuples, with 1e-12 numerical comparison tolerance.
- The weighted range compositions exposed by `npm run range -- list` use the traditional combo-count × Hero-own-action-reach weights, without positive joint blocker-mass reweighting. They are distinct from the joint-conditioned defense gate.
- Saturated capacity conflicts remain visible. They mean the prescribed EV/strength constraints and authored raises cannot satisfy the defense threshold even at the full permitted call capacity. They are not evidence of equilibrium.
- Segregation warnings in AA-only-support branches are retained rather than adding unjustified shoves merely to make an advisory metric look balanced.


## Clean-branch reconciliation

Development advanced by 18 commits after the original validation base. The clean source-only branch preserves its evaluator/runtime fixes, user UI changes and every unchanged remote blob. Only `src/estimated/AGENTS.md` overlaps the source-only patch; its upstream UI instruction and all Stage 2 instructions are retained. The artifact-free reconciliation reruns the targeted continuation, legacy, audit, evaluator and call-EV checks, plus typecheck/build/Sites. Earlier full-suite/SIGKILL results above are explicitly from the original validation checkout, not a claim that the new base has had a fully passing complete suite.

Reconciliation results: 107 targeted tests passed with seven explicit generated/private-artifact skips; typecheck, production build and seven Sites tests passed. The later sidebar-language-switch change is inherited unchanged from the final parent commit.
