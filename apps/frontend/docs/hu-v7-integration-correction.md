# HU-v7 integration correction

## Contract and scope

The adopted HU contract is development `7c2fe16c20c0c5bcf2777ccd0d84572a41880cd5` (defence 7, simulation 3, evaluator 2). The integration source `6566786a5ab7dcf03fac41db93901b96bbc84837` accidentally selected an older, unadopted observable-v10 experiment whenever a spot had history. This correction restores actual v7 execution, rather than relabeling saved reports.

All 255 tracked policy/report files remain unchanged. They contain 85 reachable spot tuples, 6,120 report rows and 18,360 metric groups. The 40 continuation pairs retain their recorded `gpt-6.1-sol/high` attribution; the 45 legacy pairs retain 44 Sonnet/max and one Opus/high. Independent review is separate from generation. This change makes no new strategy-quality claim and regenerates no policy, report, simulation or numerical approval.

## Executable parity and adapters

`tests/fixtures/adopted-hu-v7-contract.json` records the exact erased executable AST hashes of 20 v7 computational modules. Imports and erased types are excluded. Exactly four separately tested validation adapters (audit header guard, flop-cache marker guard, later-cache marker/optional defence guard, flop-base contradictory marker guard) are matched as complete literal additions, asserted to occur once, then removed for baseline comparison. All other executable statements remain byte-structure-equivalent. Import relocation directs HU hand classification to the existing `hu-hand-tier.ts`; its complete classifier and draw-helper declarations match the corresponding v7 `model.ts` declarations. The frozen MW3 `model.ts` and MW3 numerical code remain unchanged.

`hu-v7-street-state.ts` extracts the exact development geometry, replay, options and later-decision bodies. `street-state.mjs` and its declaration file supply naming/export adapters. Numerical and offline consumers do not import UI completion routing. UI helpers use the same extracted functions. The two integrated `flopSpotFor`/`completedFlopContext` bodies remain exact to 6566786a, preserving Stage3 unsupported endings, dedicated MW3 routing and selected-HU boundaries.

425 deterministic engine scenarios across all 85 spots and complete 85-spot flop/turn/river UI case bundles are pinned to results obtained from the exact development source. They include folded participants, low-SPR wagers, repeated/impossible raises, merged amounts and invalid suffixes. In particular, `BTN_open_SB_3bet_BB_4bet_BTN_fold_SB_call`, flop bet33/call then turn bet125/call, retains `turn_ip_vs_125` and the original `bet125` token, ending at a 202.5BB pot. No random simulation is used for this replay evidence.

Validation-only exceptions are documented separately from computational parity: the publisher retains stronger source/content/binding/row gates, and offline audit/cache readers reject incompatible experiment identities. These must not alter computation or broaden the saved-policy scope.

## Preserved delivery and newer development

The stricter publisher preserves `--require-all`, exact source/flop/later hashes, later-to-flop binding, expected row keys, finite confidence intervals, seed/sample/config/runtime identities and spot-scoped SQL. Preflop-before-postflop execution ordering, pinned Wrangler, streaming delivery and main-only deployment workflow remain unchanged. This source correction does not apply or renew any original receipt.

Frontend changes between 7c2fe16 and development `0070873e44e9631d865ef69405aa3f0b08b69297` are retained: PR117 responsive CSS/tests and PR121 explanation wording, hand-feature explanation facts, locales and audit tooling/tests. The older Stage2 review configuration from that development delta is deliberately not copied. PR121's explanation changes are presentation/fact-description changes, not permission for numerical regeneration. Later development movement requires a fresh pre-merge classification.

## Superseded test contracts

The following files previously asserted that the unadopted v10 experiment was the live product. They now explicitly assert the adopted-v7 contract. No test is skipped to obtain a pass, and no source/data-integrity assertion is relaxed.

- `postflop-observable-actions`: retains standalone historical projection/alias helper tests; production engine assertions now require saved size tokens and matching chips rather than alias canonicalization.
- `postflop-observable-consumers`: replaces pooled-response and pooled-copy expectations with preserved per-label nodes, local/browser view parity and the unchanged Agent profile sampler/registry key.
- `postflop-observable-defence`: replaces observable cap/floor expectations with identical v7 defence/facts for matching histories and history-free geometry, plus illegal suffix rejection.
- `postflop-observable-ui`: replaces canonicalized URL/option assumptions with retained bet125 identity, correct physical amount labels, terminal handling and illegal-path rejection. Existing continuation URL/reach/hydration suites remain in place.
- `postflop-observable-v3`: preserves immutable historical archive/manifest checks and proves historical reports cannot substitute for the adopted runtime.
- `postflop-street-state-parity`: replaces all-407 experimental replay assumptions with exact shared v7 function identity and all-85 adopted root option parity. All-40 selected and all-367 deferred scope is checked separately.
- `postflop-low-spr-consumers`: verifies v7 view/defence per-label mix parity; impossible raises remain engine-coerced. It does not introduce v10's additional normalization.
- `postflop-observable-prompt`: verifies v7 authoring geometry/private-card/dead-chip facts without injecting the unadopted v10 authoring contract.
- `postflop-new-hu-river-floor`: verifies the shared v7 MDF floor, bounded real-history parity, local/browser facts, fixed-deal decisions, all-85 identity headers and cache hash guards. V10's negative-call-EV floor exception is intentionally not activated.
- `postflop-river-exact-cache`: verifies actual v7 ordinary/compact cache equivalence, board release, river trimming and ordinary LRU bounds. The standalone exact-river-call algorithm and historical goldens remain unchanged and dormant.

`adopted-hu-v7-runtime.test.mjs` adds the complete executable-body and deterministic replay checks. Publisher tests retain and extend negative source/content/version/row/provenance checks. Historical helper checks are not counted as evidence of adopted-v7 strategy quality.

## Acceptance limits

Local source, typecheck, build and bounded/full-suite results are separate from final independent source review, receipt application, real-browser acceptance, D1 verification and exact-head CI. A source-only checkpoint does not authorize main/production publication or establish any of those pending outcomes.

## Collector delta

The unchanged recursive source collectors now return Stage2 188 paths (previously194) and Stage3 98 paths (unchanged). The only six paths no longer reachable from Stage2 roots are the `.mjs`/`.d.mts` pairs for `observable-actions`, `observable-view-paths` and `exact-river-call-ev`, because the unadopted experiment is no longer imported. No collector exclusion, root removal or baseline/hash bypass was added. The separate HU execution inventory includes the new typed v7 street-state core and its adapter. Final review must recompute all inventories from the frozen source.

All16 MW3 source closures retain the dedicated numerical files and saved artifacts unchanged. Their context changes at five shared paths: HU `engine.ts`/`defence.ts`, Agent `hand.ts`/`policy.ts`, and PR121 `reasons-secondary.json`. These changes require independent source-context renewal; original MW3 approvals are not self-renewed.
