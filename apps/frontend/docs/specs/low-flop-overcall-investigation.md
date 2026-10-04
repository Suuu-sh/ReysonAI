# Low-flop defence investigation

Status: read-only reproduction, the original seven and eight predeclared additional fixed-size continuation cases are complete. The original research, offline veto contracts and eight additional outcomes have passed independent review within their limited research scope. Runtime/model integration, delivery acceptance and production or policy changes remain unapproved. This investigation and prototype do not yet constitute a general overcalling fix.

## Pinned baseline

- Main: `2064a41011f0e91685e592c6e5f4c07f07ba7570`.
- Development at inspection: `506b1235689189ec634f6dc5d7d3832d88ad0da8`.
- Their defence implementation is the same Git blob, `2d11b3ea3dcb20a2071867bf82c544e201e858d2` (model version 6).
- The executed main snapshot's numerical import graph and persisted legacy preflop inputs were checked against main Git blob identities. The diagnostic and hashing helper are additional read-only research code.
- Original HU45 flop/later policy bytes were copied from the preserved source archive, then validated by the ordinary candidate loaders. No policy, source fingerprint, historical report or input data was rewritten. The recovered legacy reports remain historical version 5 reports, not fresh version 6 acceptance evidence.

The reproduction matrix contains eight boards, two positions (BTN betting into BB, UTG betting into BTN), and 33/75/125% sizes: 48 facing nodes. Whole-range frequencies use the product's saved own-action reach weights. These are not joint posterior-reweighted frequencies. See `low-flop-overcall.baseline.json` for all numerical results and six compact exact-combo regression cases.

## Reproduced mechanisms

### 1. MDF-target promotion can override a near-zero raw call

`Defence.floorOf` targets MDF minus ten percentage points. If the raw computed range defends less, it orders all folding mass by estimated realized equity, then converts that mass into calls until the target is reached. This step does not evaluate continuation play on the turn and river.

| Spot / board | Facing bet | Exact defender hand | Existing raw call | Final call | Preserved raise |
| --- | ---: | --- | ---: | ---: | ---: |
| BTN → BB / 8c8d2h | 4.13 BB (75%) | KcQh | 0% | 98% | 2% |
| BTN → BB / 8c8d2h | 6.88 BB (125%) | KcQh | 0% | 99% | 1% |
| BTN → BB / 5s5d4c | 4.13 BB (75%) | AcJh | 5% | 98% | 2% |
| UTG → BTN / 8s5d2c | 4.88 BB (75%) | 7c7d | 8% | 100% | 0% |

On 8c8d2h, BB's average call against 75% rises from 10.1705% to 38.1229%; the floor adds 27.9524 percentage points. Against 125%, its average call rises from 6.2562% to 26.2252%.

The 125% KcQh case has sampled showdown equity 15.0511%, the current realization multiplier 0.78, and a resulting realized-equity estimate 11.7399%, while the one-step required-equity figure is 37.6018%. Those values explain why the raw logistic call is zero. They do **not** independently establish the full flop call's value: future betting, additional investment, folds and implied/reverse-implied outcomes remain relevant.

### 2. Shared board ranks change tier semantics

The policy classifier assigns any two-pair-or-better category to `monster`, even when the board supplies the common ranks. On 5s5d4c, 2c2d becomes `monster`; on 4s4d4c, every reachable unpaired holding becomes `monster`. A board pair alone also makes unpaired high cards `medium` rather than `air`.

This affects three distinct things: the saved bettor's action-conditioned range, the defender's saved raise share, and the fixed realization multiplier. For example, BB JcTh on 4s4d4c faces a 125% bet with 2% call and 35% raise; that raise is preserved from the `monster` rule, and no MDF floor is involved.

The existing explanation feature code has more specific concepts (`boardPair`, `boardTrips`, `pocketPlusBoardPair`, and `usesHole`). A new classifier must agree with those structural facts, while its strategy-tier mapping still requires explicit authoring and review. Applying new tier semantics globally to old saved policies would reinterpret those policies and must not be treated as byte-preserving strategic equivalence. The separate three-player implementation owns its new classifier; this investigation does not introduce a competing one.

### 3. Some high calls come from the raw model, independently of the floor

On unpaired 8s5d2c, BB AcKh calls a 75% BTN bet 39%, with 10% raise; the floor is absent. The sampled equity (47.7765%) is multiplied by the fixed OOP `air` factor 0.65, and the logistic transform produces the call. A floor-only change will not alter this case.

The present realization table depends only on street, position and coarse tier. It does not directly model future bet sizes, clean versus dirty draws, backdoor quality or the opponent's future actions. Its assumptions should remain visible rather than being described as solved realization.

## Limited counterfactual plan

Keep the saved flop/later policies, opponent reach, policy hashes and all old files fixed. First compare the original root mix with the same mix before the flop floor. Then force the exact hero combo to call and play the turn and river with the complete existing runtime strategies: saved rules, computed defence, and inherited reference-tier fallbacks for uncovered deeper-raise nodes.

Calling the first flop bet closes that street. Consequently, a root-floor-only ablation changes the frequency of choosing that call but cannot itself alter its continuation payoff. This makes the floor contribution separable from subsequent policy behavior and from a future classifier change.

`rollout-low-flop-defence.mjs` samples a compatible opponent from the observed bettor reach, samples both future cards without replacement after all known cards, and uses the existing `playFromNode` engine. Fold's incremental payoff at this node is zero. It records fixed-sample variance, a descriptive normal interval and a conservative bounded empirical-Bernstein interval. These results are conditional on the complete existing runtime strategies, including inherited deep-raise reference-tier fallbacks and the known same-amount all-in action-label limitation. They are neither GTO values nor predictions against unknown opponents.

No direct `equity < pot odds => fold` rule is proposed. No new hardcoded realization discounts are justified by the current evidence. Any implementation candidate must have a new model identity, an explicit scope, before/after impact results, protected draw/made-hand controls, independent Astra review and fresh applicable derived-artifact audits. Unchanged saved bytes do not make old simulation or flop-base evidence fresh under a changed interpretation.

## Statistical diagnostic contract

Formal validation uses a fresh seed distinct from the resource pilot, a predetermined sample count, and no result-dependent stopping. The two-sided radius follows Maurer and Pontil (2009), Theorem 4, with each tail allocated half of the case error budget: `sqrt(2*s2*log(4/delta)/n) + 7*payoffRange*log(4/delta)/(3*(n-1))`. For seven cases, each receives `delta = 0.01/7`. Range-dependent defence caches are cleared before every sample; only deterministic board ranks and immutable policy/base tables remain shared. The bounded interval has nominal coverage under the IID-draw model; a deterministic seeded pseudo-random generator is not a proof of truly independent random bits. Reference: https://www.cs.mcgill.ca/~colt2009/papers/012.pdf.

## Completed continuation validation

All seven cases completed 8,192 samples each, with the fresh `low-flop-validation-v1` seed. Results below are incremental BB relative to folding now, conditional on the complete legacy runtime strategies. The bounded intervals use each case's nominal error budget 0.01/7; the descriptive normal intervals are not the acceptance criterion.

| Case | Spot, board, hero, faced size | Raw → final call | Mean call | Bounded interval | Sign under this diagnostic |
| --- | --- | ---: | ---: | --- | --- |
| 1 | BTN → BB, 8c8d2h, KcQh, 75% | 0 → 98% | −4.7548 | [−6.2474, −3.2622] | Negative |
| 2 | BTN → BB, 8c8d2h, KcQh, 125% | 0 → 99% | −9.0726 | [−10.8243, −7.3208] | Negative |
| 3 | BTN → BB, 5s5d4c, AcJh, 75% | 5 → 98% | −5.6046 | [−7.4331, −3.7762] | Negative |
| 4 | UTG → BTN, 8s5d2c, 7c7d, 75% | 8 → 100% | −3.2649 | [−4.6635, −1.8662] | Negative |
| 5 | BTN → BB, 8s5d2c, Ac4d, 125% | 75 → 85% | −1.1114 | [−2.9004, +0.6776] | Inconclusive |
| 6 | BTN → BB, 8s5d2c, 2d2h, 75% | 65 → 65% | +20.9993 | [+18.8364, +23.1623] | Positive |
| 7 | BTN → BB, 8s5d2c, AcKh, 75% | 39 → 39% | −0.6492 | [−1.9566, +0.6583] | Inconclusive |

The floor's added call contributes about −4.6597, −8.9818, −5.2123 and −3.0037 BB per decision in cases 1–4 respectively, while preserving the raise share. Case 4 is a genuine pocket pair on an unpaired board, so board-pair classification alone does not explain all harmful promotion. Case 5 is deliberately a floor-active draw; its interval does not resolve the sign. Case 6 protects a strong made-hand control, and case 7 demonstrates that raw-model calls must not be conflated with floor promotion.

Case 5 was amended from a 75% bet with no floor to a 125% bet with a 10-point floor promotion before its first rollout sample. This selection used only baseline frequencies, not rollout outcomes. The exact plan and amendment are saved in `low-flop-overcall.validation-plan.json`.

Total execution time for the seven validation processes was 207.553 seconds; the maximum per-process RSS was 349,164 KiB. Every case preserved its source graph and saved policy bytes. All seven source graphs are identical. The pinned main code/input records and all 90 preserved flop/later policy files were rechecked after execution; see `low-flop-overcall.integrity.json`. These are research checks, not publication acceptance evidence. Four focused diagnostic tests passed; full application/audit gates were not run in this research pass.

## Higher-board controls reject an arbitrary 8/9 cutoff

A further 12 board/position probes (36 facing nodes, including two exact repeat controls) found the same phenomenon on high paired boards:

| Spot | Board | Hero, 75% bet | Raw → final call | Range-wide floor-added call |
| --- | --- | --- | ---: | ---: |
| BTN → BB | AsAd2h | KcQh | 0 → 98% | +24.10 points |
| BTN → BB | KsKd4c | AcJh | 0 → 98% | +21.19 points |
| BTN → BB | QsQd2h | AcJh | 3 → 98% | +27.12 points |

On QsQdQc, the shared-trips classification again assigns `monster` and preserves a 35% BB raise share against a 75% bet. At this initial stage these high-board cases had only frequency diagnostics; the predeclared continuation controls below now add conditional value evidence. The two 8s5d2c repeat probes matched their previous output bytes exactly. The full high-board results are in `low-flop-overcall.high-controls.json`.

A proposed top-card ≤8 hotfix is therefore **not adopted**: it introduces a boundary that does not isolate the observed cause. A board-paired-only fix is also incomplete because case 4 is unpaired. Wholesale floor deletion is **not accepted** either; the floor-active draw remains unresolved and the seven selected cases are not a comprehensive strategy audit.

## Independent review and next decision

Before implementing a new model version, independently examine the saved bettor support, blocker-conditioned sampling, future-card sampling, payoff bounds, per-sample state independence, interval formula and the interpretation of model-conditional losses. Then evaluate an MDF-promotion safety design that separates shared-board tier defects, raw realization assumptions and promotion itself. Any accepted implementation must explicitly invalidate affected derived artifacts, preserve original saved bytes, cover beneficial/ambiguous draw promotions and perform the required impact audit. This report does not recommend a new optimal calling frequency, claim GTO values, or authorize production publication.

## Independent-review scope correction

The runtime continuation is **not exclusively the saved later-policy artifact**. Main `Defence.policyRule` uses `referenceLaterTierMix` at uncovered later-street nodes with raise depth at least two. The two used later artifacts omit the `*_vs_raise2/3/4` nodes, while shallower saved rules have positive re-raise shares, so these fallbacks are materially reachable. Requiring a saved later artifact prevents whole-artifact replacement by a reference policy; it does not prohibit these existing deeper-node fallbacks.

The fallback source was already included in each captured execution graph. This correction changes the interpretation wording, not the executed strategy, numerical results, source fingerprints or hashes. Raw reports and the executed snapshot remain unchanged. Derived report annotations explicitly record this correction. Therefore the values describe the **full legacy runtime policy, including its inherited fallback behavior**, and cannot be attributed solely to the saved authors' later-street rules.


The full independent review is saved in `low-flop-overcall.independent-review.md` (SHA-256 `3493dc80ff5caa0f11e5e5c94d07fa9f7891d592c1a24ade7d2e3dd11a17686b`). It accepted the corrected exact-combo research findings, independently verified remote provenance and all 90 policy files, and withheld implementation/model-version/publication approval. A separate offline-veto prototype passed 27 contracts, a 128-sample uncapped parity check and seven binding replays. Independent static re-review found no new blocker to continued offline testing and retained the delivery/runtime/model approval holds. It is not imported by the product.

## Eight predeclared additional continuation controls

All eight used the unchanged frozen v1 runtime, 8,192 samples, fresh seed `low-flop-controls-validation-v1`, and a separately allocated nominal family error budget of .01. Combining the original and additional families gives a nominal .02 union bound under the stated IID Monte Carlo approximation, not .01. The raw source, policy bytes and original reports are preserved. Independent review accepted the additional research evidence, as recorded in `low-flop-overcall.additional-independent-review.md`; this does not expand any approved application scope.

| Spot / board | Defender hand / bet | Raw → final call | Call mean BB | Conservative interval BB | Classification |
| --- | --- | ---: | ---: | --- | --- |
| BTN_open_BB_call / AsAd2h | KcQh / 75% | 0 → 98% | -10.702 | [-12.521, -8.884] | negative |
| BTN_open_BB_call / KsKd4c | AcJh / 75% | 0 → 98% | -8.560 | [-10.365, -6.755] | negative |
| BTN_open_BB_call / QsQd2h | AcJh / 75% | 3 → 98% | -9.003 | [-10.922, -7.084] | negative |
| UTG_open_BTN_call / 9s5d2c | 7c7d / 125% | 32 → 100% | -3.527 | [-5.236, -1.817] | negative |
| BTN_open_BB_call / 8s5d2c | Ad3d / 125% | 70 → 85% | -1.086 | [-3.002, 0.831] | inconclusive |
| UTG_open_BTN_call / 9s5d2c | Ac4c / 125% | 28 → 90% | 0.534 | [-1.416, 2.485] | inconclusive |
| BTN_open_BB_call / AsAd2h | 4c3c / 75% | 0 → 78% | -5.789 | [-7.497, -4.081] | negative |
| BTN_open_BB_call / 6h5h2d | QhJh / 75% | 72 → 72% | 5.828 | [3.938, 7.717] | positive |

The high paired A/K/Q examples reproduce negative continuation means with strictly negative conservative upper bounds, so a low-rank cutoff does not isolate the mechanism. The unpaired 952 pocket-pair example also remains negative. Draw labels alone do not separate the cases: two floor-active draws are inconclusive, the AA2 gutshot control is negative under this runtime, and the floor-inactive flush-draw control is positive. A general draw exception, raw-call removal or whole-floor deletion is not established.

The positive flush-draw control has no floor addition. It must not be described as demonstrating a beneficial floor promotion; that remains unestablished by these cases.

These comparisons hold the existing future policy, fallback behavior and observed-bet support fixed. They compare forced call with folding now; they do not optimize later decisions, compare raises, or prove an equilibrium policy. Total measured case execution was 248.329 seconds, maximum RSS 349,716 KiB. Full raw evidence, source identities and execution records are in `low-flop-overcall.additional-rollouts.json`.

The four-context preview currently changes only four of 21,546 archived node/combo rows, with node-wide call reductions of approximately 0.11–0.87 percentage points. This limited prototype does not resolve general overcalling. Its table substitution is not a full integrated Gate impact audit.

## Current delivery checkpoint

A closed, explicitly unapproved v3 preview now passes 36 mandatory contracts and independent limited-research review. It runs the unchanged frozen main engine and changes only the four original exact contexts: 4 of 21,546 audited rows. Its active-input boundary rejects caller iterators, accessors, proxies and foreign execution objects. See `low-flop-overcall.runtime-preview.md` and its v3 execution review. This remains a small research candidate, not a general quality correction or a change to the current application. Draft PR #45 preserves source/provenance; actual GitHub LFS object delivery and clean remote materialization are still pending.
