# Independent research review record

This is a research review artifact, not a publication receipt or model-change approval. The review text below is reproduced verbatim from the independent review delivered on 2026-10-04. The later authorization to prepare a non-production candidate does not change the review's disposition.

- Reviewer model: the review agent's runtime did not expose a verifiable model identifier; no model identity is asserted here without separate attestation.
- Research source commit: `47ab274d52929b8da291c7af69818bc08ac0d3c9`.
- Completed-result commit: `b8d179a4655dd6704575f85d6bc23d5f56aa7e0b`.
- Reviewed clarification: uncommitted scope clarification of inherited deeper-raise reference fallbacks on that completed-result commit; raw numerical reports and the executed snapshot were unchanged.
- Executed numerical baseline: main `2064a41011f0e91685e592c6e5f4c07f07ba7570`.
- Executed defence blob: `2d11b3ea3dcb20a2071867bf82c544e201e858d2`.
- Shared numerical source-graph SHA-256: `2409bc39d7664a51bb20085406e8b45c49e5c458655bd5fdfb719e77cfba8394`.
- Research rollout source SHA-256: `7640c57f8940e853bd037a8e4a2033e506335b004a60e91ea10027f3b47baaab`.
- Preserved legacy policy archive SHA-256: `5f5dd88540c00ce7426146b91b1fd9c0cc10974b146ba02a175cc067395e7b0a`.

Reviewed report identities, rechecked when saving this review:

| File | SHA-256 |
| --- | --- |
| `low-flop-overcall-investigation.md` | `1983905f5d3d2a3998c08e365a93fe8d99dc6a3ba2f7cc389ee4b35829e7c77f` |
| `low-flop-overcall.baseline.json` | `6c0681d17e68c408aa417e6d2b8293b766dcc52342571ec39893ffd072a553cf` |
| `low-flop-overcall.high-controls.json` | `b82b61c268815c9aa7d81e020809d850726071d0f400db447eebaf86854b1929` |
| `low-flop-overcall.rollouts.json` | `f03ce06e9874d2ed5d0727ad013a3350c6dfdefdaff03e7ad26007627452c607` |
| `low-flop-overcall.validation-plan.json` | `f3045505f517b64ce2ac6cdb91af93ca72da101e3fcf2a0106428555c8709757` |
| `low-flop-overcall.integrity.json` | `f8443d7b1c3b79aba4613fff6dc8fa1c3ba0efb707e6464601640a6faaece652` |

Raw numerical report SHA-256 identities:

| Case | SHA-256 |
| --- | --- |
| 1 | `9868957593e47c3c7cfdb2d0c3e9ecaf35d3813a9d7b0eea9d94113170487570` |
| 2 | `8edffbc6bd4174e1ad12b4329112f287a27dc0cda4420dc4e481e72d90a896ee` |
| 3 | `ff17233125b79082bf12ccfc3bf62e6436129d09f801ca6aba542abf67863e24` |
| 4 | `46ce6a7683cd12e0743a0021268737d75d37142c2ce32be8aa6f6893026a76db` |
| 5 | `fdcf1c88412152e4d89e7738956a659619dc539a4f0665552f32c6cfcb698a2b` |
| 6 | `63c54bf38dc45f33f5f3f7f44e43da89e18e73d96e26d9f6f8001aa8a110b557` |
| 7 | `b7300e60e28845306baaa3e1d9d76c878f189d739af0f2ded282f9fc623ba8d3` |

## Independent review verdict

The four harmful-promotion findings are supported as narrow, model-conditional results. I found no sampler, payoff-accounting, variance, interval-formula, or provenance defect that invalidates them.

A production change remains blocked. Seven selected combos do not establish a generally safe replacement strategy, optimal calling frequencies, or the value of removing the floor everywhere.

### Important findings

1. **Continuation includes inherited reference fallbacks.**  
   `Defence.policyRule` uses `referenceLaterTierMix` for uncovered later-street raise-depth ≥2 nodes. Both used later-policy artifacts omit these deeper nodes and contain positive re-raise probabilities at shallower nodes. Requiring a saved later artifact prevents whole-artifact substitution; it does not eliminate these runtime fallbacks.

   I verified the author’s correction in the investigation report and derived rollout JSON. The seven raw reports retain their original bytes. This changes the interpretation’s wording, not the numerical results.

2. **High-board evidence establishes promotion, not harmful continuation value.**  
   The high paired-board controls disprove a top-card ≤8 explanation of the mechanism. They have no continuation validation, so their promoted calls cannot yet be called negative-value.

3. **Neither draw protection nor global floor removal is validated.**  
   Case 5’s floor-active draw is inconclusive. The positive set control is floor-inactive, so it does not demonstrate a beneficial floor promotion. Case 7 is also inconclusive and floor-inactive; it does not establish that the raw model’s AK call is harmful.

4. **Implementation must avoid a hidden ceiling change.**  
   In `applyEquity`, an existing floor takes precedence over the ceiling. Simply returning `null` from `floorOf`, or filtering its candidates and recomputing its threshold, could activate another adjustment or move the promotion into different hands. A scoped fix must change only the identified incremental call mass.

## Verification performed

Reviewed research source commit `47ab274d52929b8da291c7af69818bc08ac0d3c9`, completed-result commit `b8d179a4655dd6704575f85d6bc23d5f56aa7e0b`, and the subsequent scope clarification in the worktree.

Numerical execution identity:

- Pinned main: `2064a41011f0e91685e592c6e5f4c07f07ba7570`
- Defence blob: `2d11b3ea3dcb20a2071867bf82c544e201e858d2`
- Shared rollout source graph: `2409bc39d7664a51bb20085406e8b45c49e5c458655bd5fdfb719e77cfba8394`
- Research rollout source SHA-256: `7640c57f8940e853bd037a8e4a2033e506335b004a60e91ea10027f3b47baaab`

A fresh GitHub tree fetch at the pinned main, returned without truncation, independently matched all 29 non-research code/input blob identities. Local SHA-256 and Git blob calculations matched all 31 integrity records. Every case’s recorded 25-file graph matched the executed snapshot.

All 90 copied policy files matched both the original archive entries and extracted original payload byte-for-byte. Archive identity:

`5f5dd88540c00ce7426146b91b1fd9c0cc10974b146ba02a175cc067395e7b0a`

This confirms preservation, not fresh acceptance. Historical defence-version-5 reports remain historical.

No production files, policies, reports, fingerprints, acceptance receipts, or numerical snapshots were modified by this review. No heavy Node jobs or rollout repetitions were run.

## Numerical and semantic audit

### Opponent and chance sampling

The opponent is selected from saved preflop support multiplied by the probability of its observed bet, with board and exact hero blockers removed. It is not sampled uniformly across hand classes.

I independently reconstructed the seven opponent-support counts and weights from preflop rows, flop tier classification, texture lookup, and saved action frequencies. All matched:

- Case 1: 621 combos; weight 60.05
- Case 2: 154; 23.15
- Case 3: 632; 59.76
- Case 4: 248; 18.39
- Case 5: 549; 14.5425
- Case 6: 681; 77.925
- Case 7: 618; 69.53

There is no support widening or replacement with a reference preflop range. The cumulative sampler correctly weights positive-support combos.

Rejection sampling of future cards removes all seven known cards, then samples an ordered turn and river without replacement. Under ideal uniform random draws, each compatible ordered runout has probability `1/(45×44)`.

### Continuation and payoff

`playFromNode` replays the observed history, snapshots invested chips at the pending decision, forces the call, and uses the complete legacy runtime strategy afterward. It does not use the sampled opponent’s private cards to choose the hero’s action.

Settlement returns uncalled excess before rake and payout. The returned quantity is payout minus investment after the decision; earlier investment is sunk. Folding at this facing decision therefore has incremental value zero.

The bounds are conservative and valid:

- Lower: negative hero stack remaining at the decision
- Upper: current pot plus opponent stack remaining
- Range: 200.5 BB for BTN–BB; 201.5 BB for UTG–BTN

Every sample is checked for finiteness and containment. Future investment, folds, rake, and reverse-implied outcomes are included. This is materially different from a flop pot-odds comparison.

### Independence, variance, and intervals

Each sample clears range-dependent stages, contexts, betting caps, and betting-fact ranges. Retained board ranks, tier tables, seeded flop-equity tables, base weights, and rule lookups are deterministic. Packed caches preserve Float64 values. I found no unreset range-dependent state that changes the intended sampled experiment.

Welford’s update and division by `n−1` correctly compute sample variance. I independently recomputed all seven empirical-Bernstein radii from the saved unrounded means and variances; all matched exactly.

The stated two-sided formula correctly applies [Maurer–Pontil Theorem 4](https://www.cs.mcgill.ca/~colt2009/papers/012.pdf) to normalized bounded payoffs, allocating `delta/2` per tail. Hence `log(4/delta)` is appropriate. Seven cases at `delta=.01/7` permit the stated nominal 1% family error bound under the IID model.

All seven process logs contain the complete sequence through 8,192 samples and successful exits. The validation seed differs from the 128-sample resource pilot. There is no result-dependent stopping in the source.

The deterministic 32-bit seeded PRNG does not prove independent random bits. “Nominal coverage under the IID Monte Carlo model” is the correct qualification. Individual payoff samples were not retained, so I verified the moment-update implementation and recomputed intervals from summaries rather than independently reconstructing every sample’s variance.

## What the seven results establish

Cases 1–4 have strictly negative bounded intervals for calling under the fixed continuation model. With raise probabilities unchanged and fold worth zero, the floor’s incremental contribution is:

- Case 1: −4.6597 BB
- Case 2: −8.9818 BB
- Case 3: −5.2123 BB
- Case 4: −3.0037 BB

These are conditional contributions for each specified exact combo and decision, not whole-range averages.

Calling closes the flop, so suppressing only that initial promotion cannot change its forced-call continuation under the frozen legacy model. This makes the attribution sound.

Case 4 establishes that shared-board tier defects alone cannot explain all harmful promotion. Cases 5 and 7 remain unresolved. Case 6 establishes positive call value for one strong made hand, not the superiority of calling over raising.

The results do not establish equilibrium play, exploitability improvements, robustness against changed opponents, or consistency of the legacy saved-action reach assumptions with actual computed continuation frequencies.

## Recommended limited safety design

Evaluate an **offline-evidence veto on incremental first-bet flop promotion**, before considering a general strategy change.

1. Preserve the full legacy calculation. Obtain the post-cap, pre-floor mix and the final legacy mix.
2. Define added call probability as the positive difference between those two call probabilities.
3. For an explicitly covered context with a valid, independently reviewed full-continuation certificate whose upper bound is below zero, return only that added mass to fold.
4. Preserve the raw call, raise share, all floor-inactive decisions, and turn/river behavior.
5. Do not refill the MDF shortfall with other hands or recompute the floor threshold. Accept and report the shortfall.
6. Leave ambiguous and uncovered contexts unchanged during this limited experiment.

This is a conditional safety intervention, not an optimal-frequency rule. It must not become `realized equity < required equity ⇒ fold`, a new arbitrary realization discount, a paired-board switch, or a top-rank cutoff.

Certificates must bind the exact spot, board, combo, history, chip geometry, policies, classifier/reach semantics, continuation source graph, and sampling protocol. Do not extend across suit isomorphisms until the actual deterministic calculation passes relevant symmetry checks.

A runtime candidate should use versioned evidence or a separately validated rule; it should not add postflop EV computation or EV output to the product. The current seven fixtures are insufficient justification for deploying a broad heuristic.

## Required controls before a model change

- Verify the post-cap raw/legacy boundary, conservation of probabilities, unchanged raises, no replacement promotion, and no accidental ceiling activation.
- Add diagnostic contract tests for a small known weighted opponent distribution, blockers, compatible runouts, cold/warm cache equivalence, Welford updates, and deterministic payoff fixtures. Existing application tests should be reused where suitable; the four new diagnostic tests do not cover this entire contract.
- Compare unchanged and modified results over all affected combos using current-source identities. Verify policy bytes and saved support remain unchanged.
- Include beneficial or unresolved floor-active draws, genuine pocket pairs, shared-board pairs/trips, high paired boards, no-floor draws, and no-floor made hands.
- Run the applicable full application and derived-artifact gates on the eventual candidate. Any accepted numerical change needs a new model identity and invalidation of affected bases/caches/reports.
- Keep the three-player classifier separate. A global reinterpretation of legacy tiers requires its own explicit policy migration and validation.

A useful next bounded research batch would be eight new exact-combo cases, each fixed at 8,192 samples with a fresh seed and a separately declared family error budget:

1. BTN–BB, AsAd2h, KcQh, 75%
2. BTN–BB, KsKd4c, AcJh, 75%
3. BTN–BB, QsQd2h, AcJh, 75%
4. UTG–BTN, 9s5d2c, 7c7d, 125%
5. BTN–BB, 8s5d2c, Ad3d, 125%
6. UTG–BTN, 9s5d2c, Ac4c, 125%
7. BTN–BB, AsAd2h, 4c3c, 75%
8. BTN–BB, 6h5h2d, QhJh, 75%, floor-inactive draw control

These were chosen from frequency diagnostics, without new rollout outcomes. This batch would strengthen scope assessment but would not by itself certify all flops. Estimated resources: roughly 4–7 minutes serial execution, one Node slot, 384 MiB heap setting, with memory headroom beyond the prior approximately 341 MiB peak RSS. Coordinate the slot before execution. No automatic repeat of the completed seven cases is warranted.

**Disposition:** accept the corrected research conclusions within their stated model and exact-combo scope; withhold approval for implementation or model-version change until the safety contract and impact controls are specified and validated.
