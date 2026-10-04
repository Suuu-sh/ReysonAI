# Multiway preflop stage 2 result

## Result

Complete bounded preflop continuation authoring, generated from explicit profiles and audited saved sources. These are independent AI estimates; they are not a jointly solved strategy or a GTO-quality guarantee.

- Clean-history branch: `feat/multiway-preflop-stage2-source-only` (the historical branch name is retained; reviewed compact artifacts are now included via Git LFS at the user's request).
- Publication reconciliation: development `6e59fe9fbd5ecd946010be1f893d9ee6e04f98a5` is merged normally into PR32. Its eight new commits, including opponent profiles and localization, are preserved: 97 changed paths are byte-identical and five shared authoring/audit/AGENTS files retain both sets of changes. The original PR32 parent was `116561aac40e06902bf168d7e00a4f27cc912637`.
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
- The initial source-only delivery was superseded by the user's 2026-10-04 correction: generated data must undergo local AI verification/review before being committed. The 43,276,102-byte compact artifact set is retained byte-for-byte in a deterministic 1,747,857-byte Git LFS archive; Actions validates the recorded hashes and imports only this reviewed preflop snapshot, without authoring new estimates. See [storage and publication](multiway-preflop-stage2.storage.md). Existing Git history is not rewritten.
- Coverage distinguishes unreachable histories from missing work, including a stored descendant whose required ancestor is missing. The publisher blocks absent/partial Stage 2 snapshots unless a legacy-only replacement is explicitly selected.
- Final independent Astra code review reports no remaining findings. No protected visual/action-path sources were changed.

## Verification

- Stage2-only generation/install: passed; zero blocking findings, 38 saturated EV-capacity conflicts and seven segregation advisories. 632 joint defense events retain their source/policy evidence.
- Legacy regression: all 242 saved JSON/reason files byte-identical; shared config bytes and all 45 reachable HU source hashes preserved. The actual private `.local/postflop-ai` policy files are absent here, so that optional check is explicitly skipped; baseline-pinned policy-loader regressions run normally.
- Final combined continuation/coverage/audit/reason checks: 87 passed, one explicit private-policy-artifact skip (including 24 sparse/compact unit tests). Publication and coverage review regressions passed, including missing-ancestor and destructive-snapshot guards. The actual detailed-reason loader also passes its compact-payload integration test.
- Published data/reason checks: passed, including strict sources/flow/EV/joint defense and complete reason fingerprints. Independent dense-versus-expanded reason comparison is exact apart from refreshed provenance.
- Full serial suite: 533 passed, nine explicit optional skips, two test-file SIGKILL failures in `postflop-hand-ev` and `postflop-performance`; Isolating every case in those two files gives ten passes and three further SIGKILLs. The SB hand-EV failure was also reproduced with a fresh git archive of untouched development `9a787954`, with the same SIGKILL; the broader assertion coverage remains unverified. These process failures are not treated as a passing full suite or presumed baseline assertion failures. The known `postflop-flop-base` determinism test passed in this run.
- The earlier source-only clean-checkout targeted checks were 27 passed, six explicit generated-artifact skips. That check established the runtime's missing-data behavior, not delivery readiness. The corrected Actions path requires the complete reviewed artifact set and fails before delivery if any file/source identity differs.
- Production build passed with a 768MB Node heap after resource-constrained attempts failed. Typecheck and seven Sites tests passed. Existing large-chunk warnings remain.
- Lint reports seven findings in unchanged `ProductApp.tsx` / `site/ServiceSite.tsx`; no blanket lint-pass claim.
- The correction pass does not merge, deploy, mark ready or rewrite history. The clean-history Draft PR32 is separate from PR29, which remains unchanged for comparison.

Final compact delivery size is 43,276,102 bytes, down from 341,870,219 bytes (87.34%). Reasons shrink from 272,965,675 to 5,722,499 bytes. The complete per-history compositions and advisory details are in the reviewed compact datasets/audit and accessible through the range CLI; they are not duplicated as a large Markdown table.

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

## Reviewed Git LFS delivery checks (2026-10-04)

- Development reconciliation: all prior 1,856 delivered JSON bytes remain identical, and exactly 32 already-reviewed profile files are added. The delivery receipt now binds 1,888 JSON files and 86 source/configuration files. Profile/legacy/continuation checks pass 34 tests with one private-policy-artifact skip; the profiles-only dry-run passes without changing published data.
- Exact local artifact set: 1,614 files / 43,276,102 bytes. Deterministic USTAR+gzip LFS object: 1,747,857 bytes, SHA-256 `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`. The tracked local packager reproduces the same bytes. No strategy was regenerated for this delivery change.
- Review/source/file guards and archive attack probes passed; independent Astra delivery code review has no blocking findings. CI never writes an approval receipt or generates strategies.
- Earlier pre-reconciliation local payload diagnostic: all 1,856 delivered datasets / 3,454 parts / 64,542,160 JSON payload bytes matched SHA-256 twice. All 11 unrelated postflop/account sentinel tables and schemas were preserved. A separate failed local transaction preserved all preceding rows. The diagnostic used 32 exact-content groups per pass and took about 94.7 seconds. Nine focused local-D1 tests passed, including small strict and bounded pinned-Wrangler integrations.
- The full 65,374,389-byte local SQL import was not established: workerd exited by SIGKILL (-9), observed after 6.78 seconds at 685,696 KiB maximum RSS, and Wrangler reported ECONNRESET. No kernel OOM evidence was available; this is not labeled a confirmed OOM or a remote D1 size limit. The bounded diagnostic does not establish full-delivery rollback. Actions deliberately retains the strict whole-file default, and its exact-head result is still required.
- Typecheck, production build and seven Sites tests pass with the restored artifacts. The earlier full-suite/lint limitations above remain; these checks do not replace a full-suite pass.
- Production D1 access/quota and remote import behavior have not been exercised. No production run, merge, history rewrite or readiness change occurred. The Git LFS object must be uploaded and freshly fetched/hashed before publication can be reported complete.

Latest integrated targeted checks: 85 passed, two explicit optional skips (private HU artifact and opt-in small Wrangler fixture); no failures. The full local-D1 pipeline has its own strict Actions step. Typecheck, production build and seven Sites tests also pass after upstream reconciliation.

The final reconciled bounded-local D1 diagnostic passes all 1,888 datasets / 3,582 parts / 67,852,874 payload bytes twice, including all 32 nested profile files. All 11 unrelated table schemas/sentinels remain intact, and the separate failed transaction rolls back. It uses 34 exact-content groups per pass; wall time is 99.668 seconds, largest observed process RSS 346,412 KiB (not aggregate memory). Final SQL is 68,705,643 bytes, SHA-256 `b0bb41c1bf47106654ebadf30f0eba40de4252aca195e73fcbcd9236c6e6e77c`. Strict whole-file Actions validation and remote deployment remain pending.

## Narrow source/configuration review renewal (2026-10-04)

- Independent read-only review approved the `ece9ca0` workflow/backend configuration delta and the local-D1 verifier's two new ranked sentinel inserts, with zero blocking findings. The workflow retains main-only verified deployment, no PR credentials or local authoring, scoped ranked migration, and live API readiness before the client. The verifier now seeds valid `ranked_players` / `ranked_matches` records so repeat imports and failed-file rollback must preserve their contents as well as schemas. This is not a new strategy-quality review or renewed Astra data approval.
- `reviewedFiles()` confirms that all 1,888 artifact records, the materialized LFS archive, and 83 other bound sources are unchanged. Only the workflow, backend configuration and local-D1 verifier source records changed. The recomputed continuation policy/reason fingerprint remains `b3538b0c44f04016e57d6eb76802665cf405d65f87e856b9860ed8a479065e53`; no generation, resampling or repackaging occurred. Original receipt review identities and limitations remain intact; `review.renewal` records this separate narrow review.
- Focused verification: five backend ranked tests, two workflow tests, ten localization tests (including consistent Spanish Leyenda/Maestro/puntuación), and ten local-D1 tests passed. The latter uses pinned Wrangler 4.147.0 with a small Unicode fixture: strict repeat import and a failed-file rollback preserve all 16 current unrelated tables, including both ranked tables; the bounded small-fixture diagnostic also passes. Every current migrated table has one FK-valid sentinel, so future missing coverage fails.
- After renewal, exact LFS restoration passes for all 1,614 files / 43,276,102 bytes, and the reviewed verifier validates all 1,888 delivered datasets without generating strategies. Delivery SQL remains exactly 68,705,643 bytes with SHA-256 `b0bb41c1bf47106654ebadf30f0eba40de4252aca195e73fcbcd9236c6e6e77c`. All nine receipt/archive guard tests pass, including the full artifact/source byte-identity gate and rejected pointer-only or modified candidates.
- Small-fixture local import evidence does not establish rollback for the complete 1,888-dataset delivery. Exact-head strict full delivery Actions verification, production deployment/readiness and the original full-suite/lint limitations remain pending; no remote database change is part of this correction.
