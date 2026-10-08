# HU-after-multiway policy authoring review

Review date: 2026-10-04. AI-estimated strategies, not GTO, equilibrium or solver output.

## Current disposition after model-8 review

The user-approved, new-HU-only river mathematical-zero exception has now passed independent implementation review. Scoped `defenceVersionFor(inputs)` is8 for these new spots and remains6 for the45 legacy spots. Exact positive compatible support and integer ranks govern the exception; a real win or tie preserves ordinary floor promotion, even if the cached float is zero. Authored raises, positive-equity behavior and earlier streets remain unchanged. The independent98-decision matrices eliminate all mathematical-zero called mass for both preserved policy candidates at the reviewed model-8 identity.

**Reject the uninstalled broad revision-4 small-size proposal** (`901e2f2589aeffd1534ef3854ad4a8c7da942ccd48d35e31835960c3ed208698`). Removing the model defect does not justify keeping a size simplification that increases adverse branch exposure. On `7c5d5hTs6h`, after flop check/check and IP turn75/call, bet33 frequency rises10.0143%→71.9253%, while >5pt negative-margin call mass rises0.5148%→39.9309% under the unchanged positive-equity floor behavior. Several other called-turn cases worsen similarly. The rejected literal, provenance and all diagnostics remain preserved; none was installed.

The current candidate is therefore **the unchanged revision-3 pair under model8**, pending independent policy preflight. Its flop/later hashes remain `9070ca5074b6600eaeb1f1a20a03ce4bb2b40ecea457f8cd578fcec43e8a513a` / `c37c4091096867f53e9ec531220f5ff99c7f2a5364d7bc56283afaeca17333d6`. No new strategic approval is asserted. The existing canonical report is intentionally stale model6 evidence; fresh model8 simulation, official replay and all-board execution remain necessary after preflight acceptance.

The branch comparison is a read-only derivation from the full saved matrix and independently proven support-based zero-call removals; the model8 regression pins all genuine-positive mixes and reach data unchanged. It is not a new execution. Its optional action-frequency × conditional-call-mass product uses separate marginal ranges and is only a diagnostic sorting aid, never joint deal probability, EV, exploitability or an acceptance score. Independent review receives the actual frequencies and call masses, not just that product.

## Non-production call-EV floor comparison

A separately authorized experiment keeps canonical version8 and all policy artifacts unchanged. It compares the preserved v3 and rejected v4 policies under the current model versus a candidate rule that removes **only actual MDF-added calls with strictly negative call EV against known model betting support**. It retains the original pre-floor logistic split, legal raises, caps, floor allocation and all nonnegative-EV mixes; unknown/empty/invalid support keeps current behavior. This is not an adopted production rule or a claim of strategic acceptance.

The experiment enumerates compatible positive-weight hands with integer ranks and evaluates the exact sign of `(2×winWeight+tieWeight)×netPayout −2×totalWeight×callCost`. Stored Float64 weights, `netPayout=context.finalPot-context.rake` as computed by existing JavaScript, and `context.call` are represented as exact dyadic rationals. There is no epsilon; exact equality remains eligible. This establishes the sign for the represented model, not ideal decimal arithmetic. The simulator separately rounds settlement payout to two decimals; the diagnostic records that boundary rather than substituting it into the primary rule.

Execution14:32:04.857–14:32:08.841 UTC completed with exit0. The2×2 covers98 first-node decisions per policy,462 reached branches and44,519 defender observations. All14,657 nonnegative-EV mixes and all raises/pre-floor/cap/reach observations remain unchanged. It removes8,017 observed negative-EV floor promotions. Boundary tests cover exact zero and both adjacent ULPs, ties, subnormal/genuinely tiny winning support, exact power-of-two scaling/order invariance, pooled aliases and invalid/empty/blocked cases. Independent numerical/Fraction confirmation is pending.

- Complete result SHA-256: `2d5bac7d3d84e5970eb25c7ed9d8e62ec193e8d484c2bf0f620563685796e086` (`.local/postflop-ai/river-floor-ev-probe/comparison.json`).
- Prototype instrumentation:22,110 exact-sign evaluations and424 compiled contexts took182.12ms inside the applicable floor-promotion checks; full probe3.984s, peakRSS338,972KiB. It includes assertion/diagnostic work and repeated contexts. This is not a full-simulation performance guarantee.

**Paired non-all-in control:** on `7c5d5hJh3h`, flop125/call then turn check/check, OOP bet33 is33.50BB. HJ88 has model equity2.2663% and call EV−29.7493BB. Compatible pre-bet BB support is entirely in the same monster tier:0.2208 value weight and0.00512 bluff weight. A river tier literal cannot change their internal ratio. The current model's extra-floor conditional loss is−16.6159BB per own reached-defender range; the candidate removes that increment while leaving raw negative-call loss−0.00329BB. Achieved defence falls65.1852%→8.0287%, making the reduction in MDF protection explicit.

**Merged-shove control:** on `Ac7d2h9hJd`, flop33/call then OOP turn75/call, AsKs has call EV−41.1652BB against the explicitallin label. However, bet33/bet75/bet125/allin all pay41.32BB. Exactly pooling their existing post-cap supports gives AsKs equity17.6066% and call EV−6.1068BB. This pool is a separate observable-wager diagnostic, not a canonical alias-model change. Medium/strong hands that AsKs beats are available but absent from the explicitallin selection, so policy-label allocation also contributes here. The rejected v4 has no positive explicitallin branch; its diagnostic explicitly uses the actually reached bet33 alias for the same wager.

Negative-call mass alone treats tiny represented losses and large losses equally. The result therefore records each branch's additional-floor loss, remaining raw-logistic loss and total negative-call loss, normalized by its own reached-defender weights. These are conditional model-loss diagnostics, not joint-deal EV, exploitability or a probability of encountering the branch. Preventing losses against the saved model support can weaken resistance to unknown extra bluffs and may leave defence well below MDF. Raw negative-EV logistic tails and disadvantageous raises remain separate contracts. Adoption requires the owner's decision after independent confirmation; the experiment does not optimize the entire strategy.

## Verified authoring inputs

- Catalog: 137 Stage A paths and 270 reach-ranked Stage B paths selected for authoring after the user approved allowing the necessary time for full coverage. The initial 12-path Stage B planning cap was removed. All 100BB five-bet all-ins are excluded.
- Stage A: 20 cold-three-bet/cold-call paths, 77 squeeze paths (32 one-caller and 45 two-caller), and 40 cold-four-bet paths.
- Independently loaded the inputs and generated both prompts for the initial 149 selected paths (137 A and the initial 12 B); the implementation owner subsequently reported all 407 exact Node/browser live-seat product tests passing. This authoring pass has not independently read all 407 full prompts yet. None has an empty live-seat hand-class support. Flop SPR ranges from 1.15625 to 4.842105263157895.
- Representative path `UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call`: pot 29BB, remaining effective stack 87BB, SPR 3. Its authoring prompt includes the observed action history, folded participants' dead chips and the explicit assumption that unknown folded cards are not removed.
- Independently recomputed all 45 legacy input fingerprints and compared them with the preserved pre-change fixture: 45 equal, 0 changed. This checks input identity; it does not prove missing legacy policy bytes or simulation results.

## CLI authoring route and authorized native alternative

The requested command was executed with the required model and effort:

```sh
node scripts/postflop-ai/cli.mjs generate --spot UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call --model gpt-6-astra --effort xhigh
```

The Codex app-server exited before producing a policy:

```text
Error: failed to initialize sqlite state runtime under /home/agent/.codex: failed to initialize state runtime at /home/agent/.codex
```

The CLI also reported a read-only filesystem. A separate small Astra connectivity preflight failed at the same initialization step. No API-key route, credential copy, model substitution or security-policy workaround was attempted. The parent subsequently approved using the same explicitly selected native `gpt-6-astra` / `xhigh` worker and the existing injectable generator/validators. The saved metadata distinguishes this route from Codex app-server generation and marks independent review as pending.

The representative was authored from the full current prompts and revised after independent review. Revision 2 has 146 flop rules, 90 turn rules and 88 river rules. Its structural checks have zero errors/warnings for model/effort provenance, current source and prompt hashes, all requested first-node texture/height overrides, first-raise keys, full restrained OOP-defender tier coverage and the D1 value budget. This is structural validation, not a strategic-balance certificate.

The independent reviewer verified all 338 live-seat hand-frequency products, provenance, geometry and positional/donk behavior, and judged revision 2 a suitable foundation for independent per-spot authoring. Its numeric table must not be copied to other spots. A separate merged-all-in illegal-raise discrepancy was fixed by the implementation owner at the shared defence/view boundaries, with passing exact-path regression tests.

## Strategic acceptance hold and installed revision 3

Independent review of the completed revision-2 all-board evidence found a reachable policy/model interaction on `7c5d5hTsQd` after flop and turn check/check: HJ's river bet125 occurs at 11.5231% of its reached range but has zero equity-defined bluffs. The shared defence floor then calls BB `AcKc` 29% despite zero equity; 27.0551% of the whole defending range calls at more than a five-point negative margin. Three other sampled runouts of the same flop reproduce the defect. This finding is distinct from coarse air-tier warnings and blocks strategic/final acceptance. See the independent-review report for exact paths and identities.

The author preserved the unchanged revision-2 candidate, later candidate, simulation report and numerical evidence in a hash-manifested `policy-revisions/<spot>/v2` archive; the original proof/companion paths remain unchanged. The completed simulation/replay/all-board passes remain historical evidence for those policy hashes and do not transfer to a new revision.

Revision 3 changes only five IP checked-line river rules. It removes bet75, bet125 and all-in from that checked line, using check/bet33 mixes of monster 30/70, strong 45/55, medium 80/20 and air 75/25; the existing flush/strong override becomes 63/37. This preserves medium checking at 80% and retains the shared dynamic bluff cap. The representation cannot distinguish all weak board-pair holdings from other medium hands, so this is a conservative size simplification, not a claim of balanced or optimal strategy. The independent reviewer approved this draft as a provisional revised foundation for installation and fresh per-spot validation, without requiring another numerical edit. It was installed through the existing injectable `generateLater` route at 10:51:11.853 UTC; current prompt hashes were unchanged, the original flop bytes were preserved, and the revision-2 later/report were archived before replacement. The canonical revision-2 report was removed from active use; a fresh revision-3 report has since been produced. This is not strategic/final acceptance. Its bounded preflight completed with exit 0 at 10:45:37.958 UTC: two policies × seven selected river boards × all four bet actions. It reproduced the four old failures and another value-only bet125 on the flush control `AcKc4c6s9c`. In the draft, bet75/bet125/all-in have zero action reach on all seven checked-line probes; the remaining bet33 has 20.34–20.93% actual equity-defined bluffs and zero zero-equity call mass. Negative-margin call mass on the four paired examples is respectively 0.045%, 0.678%, **7.488%**, and 0.350%. The Ts6h small-bet residual is only slightly below revision 2's 7.547%, while its small-bet reach rises from 4.9225% to 11.8397%. The floor threshold is 14.9050% against a 20.9258% requirement. This remains an explicit reviewer-accepted modelling limitation for the fresh-validation stage, not a claim that all negative-margin calls are fixed. High-card/trips controls have zero such mass, and the flush control has 0.273%. The immutable diagnostic records full source/code identities, exact facts, caps/floors, range weights and both policy hashes; it does not replace fresh full simulation/replay/all-board evidence.

## Historical revision-3 validation under model 6

- Full simulation completed with exit 0 at 11:05:11.859 UTC in 577 seconds: all 12 representative boards freshly computed, 72 comparisons, 10,000 paired deals per board/profile/seat. No revision-2 checkpoints were reused.
- Checkpoint identity `f24d20bc47efa1aac33fd62130a4cd7f76bd4b7d35f0e917203c19d2318fbb43` includes the complete official dependency/config/input identity and the runner's own SHA-256. Source/config/input graph and candidate bytes were checked at start, after each completed board and at completion. The full-graph identity stayed `fc44c7533c0db459590a5ad650fa6c4eeea54c78d0e7b013b7bd7853327672cd`.
- Current report SHA-256: `f46f16717c144053c8480905783883572c19d38083992ec9acc8729d3ef16139`. An actual exit/time/log/runner receipt is saved with the revision's evidence.
- Official CLI fixed-seed audit completed with exit 0 at 11:23:15.047 UTC in 580.355 seconds: 19,936 expanded combo decisions, 72 comparisons and fresh exact replay; 18 advisories remain. Its automatically captured complete start/end identity is identical to the simulation identity above. Official proof SHA-256: `8f4f946b917b90397b543b2f749a63c0c46b4e9844a47f12b9c8817f21e14e17`. The raw actual-command log and its exit/time/identity receipt are retained separately.
- The revision-safe all-board audit completed with exit 0 at 11:41:26.997 UTC in 1,081.190 seconds, starting from zero reused flops under identity `fc4bd404df9637bad4b7fc3f334c33e4dc32333f87c4c1ab6d92e66e387e0aed`. All 1,755 flops, 7,020 sampled turns and 21,060 sampled rivers were evaluated; zero unreachable boards, zero error findings, one clean flop, and 14,401 advisory occurrences in 36 keys. These heuristic audit results do not eliminate the strategic P2 findings below.
- Immutable summary SHA-256: `ff73c9d4da70d84297deff8e9c15a550aeb9351f7788988426e1bd84091f9a25`; official 1,755-row companion: `0e8fe19f741523833302c21f52b36c73b171fc2a63648d03a246624c0507192f`; full-board proof: `5965cf14bbf54ea3a42ded61bf940430e8b0356ab1abc01f87694aacca81714c`. The writer verified exact live-deal reachability and seeded coverage, and a second call reused identical bytes. Revision-2 originals were not overwritten.

## Wider revision-3 P2 findings and revision-4 draft

The independent final preflight expanded to seven river boards × five prior histories × both positions, or 70 first-node decisions and 280 offered bet branches. It found **21 positive pure-value branches with forced zero-equity calls outside the repaired IP checked line**, corresponding to 15 distinct board/history/role/wager cases after accounting for nominal sizes that merge to the same shove. Affected classes were OOP checked, IP defender and IP aggressor. No sampled bet33 branch met that condition, and no such finding was observed on the sampled OOP defender/aggressor lines. Those bounded negative findings are not universal guarantees.

For example, after both earlier streets check through on `7c5d5h3c8s`, BB's bet75 has 4.972657% action reach, zero actual bluffs, and 38.3444% zero-equity called mass; HJ A9s calls 42% with zero equity. On the same board after an OOP turn bet75/call, IP river bet75 becomes a 65.25BB shove into 72.5BB and has 18.0497% zero-equity called mass. The independent report records all 21 cases. The earlier known checked-IP improvements and Ts6h residual reproduce exactly.

**Final strategic acceptance remains held.** All 15 revision-3 raw candidate/report/evidence/log files were preserved in a hash-manifested `policy-revisions/<spot>/v3` archive while the original paths remain intact. The fresh numerical passes remain valid coverage/reproduction evidence for revision 3, not approval of the discovered policy/model interactions.

A provisional revision-4 draft changes 20 literal river first-node rules together, simplifying OOP checked and IP defender/aggressor decisions to check/bet33 with individually assigned positional, line and texture frequencies. It retains revision 3's IP checked rules, both OOP called-turn lines, all facing/raise rules, and all flop/turn rules. The draft remains uninstalled. Its broad preflight completed with exit 0 at 11:54:32.521 UTC, comparing all seven boards across seven prior histories and both positions (98 decisions /392 offered branches per policy). It records **all** zero-equity call mass, negative-margin calls, actual wager aliases and dynamic caps, not merely whether a branch is labelled pure value. Diagnostic SHA-256: `9fff481bb98a29f346430404c6b461962df311fd3283315eeca01551d5490d0f`. The expanded baseline has 22 pure-value/zero-call branches (one more than the initial 70-decision review); the draft removes those, but **four positive branches still force zero-equity calls**, so no installation or new long cycle has been approved. The additional flop125-call/turn-check-through control leaves a 33.50BB bet narrowly below the 34.0025BB merge threshold; flop33-call/turn75-call supplies the actual bet33-to-all-in control. Suppressing nominal larger sizes alone must not leave an equivalent unsupported shove under another label.

### Broader preflight residuals: pure-value removal is insufficient

| Board/history, OOP river action | Draft actual bluff share | Zero-equity called mass | Branch reach, v3 → draft |
| --- | ---: | ---: | ---: |
| Ac7d2h9hJd; flop125/call, turn check/check; bet33 |7.6320%|3.4495%|30.3800% →56.0214%|
| AcKc4c6s9c; flop/turn check/check; bet33 |10.4693%|7.6687%|15.1401% →33.2121%|
| AcKc4c6s9c; flop33/call, turn75/call; all-in |20.6600%|12.4552%|2.4617% →2.4617%|
| AcKc4c6s9c; flop125/call, turn check/check; bet33 |20.2417%|6.7404%|5.7069% →16.8613%|

These are conditional reached-range masses. The small-bet exposure increases in three cases; a zero count under only the narrower pure-value predicate would conceal that regression. The final two branches already bind their global bluff caps (raw65.51%→20.66% and79.31%→20.24%). Non-club HJ ATs/AJs combinations nevertheless have zero equity and call about16–26% because the floor is at equity0. Increasing generic air/medium frequency alone would be capped back down and does not select weaker individual bluff holdings. This is evidence that the existing coarse features/global cap and mandatory defence floor interact beyond the original pure-value defect. The subsequent independent support probe proves that river-only reweighting cannot repair several selected defenders under the unchanged earlier-street policies:88 on the A-high flop125-call line,77 on the checked-through four-club board, and non-club AT on the four-club flop125-call line cannot beat or tie **any** compatible BB holding available before betting. Their compatible pre-bet BB weights are respectively0.06736,7.83113 and0.07040, with zero beat/tie weight. The last range contains two-pair/sets, not only flushes. The aggressor shove has some weaker available A5/A3/A2/Kx for AT, but its lower-pocket-pair callers still cannot beat any available BB holding. Thus one selection issue is distinguishable, while the general dominated-call problem cannot be solved simply by manufacturing more river bluffs.

Independent review attributes all four exact-zero-equity call masses to MDF-floor promotion; the same pre-floor mixes call zero. The positive-equity defenders cannot meet the imposed MDF-minus-10 target. The reviewer recommends that the implementation owner consider a separately scoped new-family, exact-river-zero-equity exception to floor promotion, preserving legal bluff raises and honest below-target defence when eligible calls are insufficient. Scope, model/version/cache binding and consumer regression tests require an explicit implementation decision before any change. The shared MDF model, legacy policies and canonical revision-3 artifacts remain unchanged. No proposal to eliminate every river bet merely to pass a diagnostic is being adopted.

## Read-only interpretation of the below-reference results

The revision-3 report has 12 negative upper-CI comparison rows, all for BB on four flops and all three fixed reference profiles. The remaining six official-audit advisories concern balance heuristics. Saved revision-2/revision-3 comparison rows are retained in `below-reference-readonly-comparison.json`; no new simulation was run for this interpretation.

| Board | Standard delta BB | Passive delta BB | Aggressive delta BB |
| --- | ---: | ---: | ---: |
| AhKh4h | -1.5263 | -1.1685 | -1.2810 |
| KcKd4h | -12.4369 | -6.5083 | -16.1463 |
| 8c8d2h | -4.9948 | -2.3343 | -6.0547 |
| 5s5d4c | -4.3135 | -2.9482 | -6.4626 |

For the largest difference, BB's candidate return is **+44.1495BB** versus the reference hero's **+60.2958BB**, giving -16.1463BB with paired 95% CI [-17.2075, -15.0852]. These are conditional postflop returns for the specified board/ranges, including the existing pot, not BB/100 over all preflop deals. The difference is substantial within this experiment and must not be dismissed as sampling noise. The reference baseline rows are exactly identical to revision 2. Across all twelve affected rows, revision 3 changes the mean delta by only -0.0497 to +0.3485BB; the largest-gap case changes by +0.0005BB. The new checked-IP river simplification did not create this pattern.

**Verified comparison-design limits:** `simulation.mjs` uses the same sampled legal hands, runouts and random stream for the candidate/baseline pair (lines 120–133), but only the candidate hero uses computed defence and bluff caps (lines 67–81). The opponent and baseline hero use fixed tier-reference mixes. The candidate's defence model infers both seats' reached ranges from the candidate policies (`defence.mjs`, `policyRule`/`reach`/`build`); it does not substitute the actual passive/aggressive reference profile when forming its belief about the opponent. Consequently, these deltas combine authored betting, candidate-only defence/caps, and opponent-model mismatch. They are neither a controlled attribution to one decision nor equilibrium exploitability estimates. Their CIs quantify sampling variability in the stated fixed-bot comparison, not uncertainty in the underlying strategy model.

The fixed reference is intentionally coarse: its rules ignore board-height/texture range advantages, and its monster tier includes any two-pair hand. For example, on KcKd4h an 88 holding is already in that tier despite losing to any Kx. Reference monster facing mixes always continue and frequently raise; its aggressive profile increases bet/raise frequency. Reference and candidate also allocate value to different sizes. These facts make both reference-specific value extraction and strength-tier misclassification plausible contributors on paired boards. **They are hypotheses about the large delta, not measured causal decompositions.** The monotone result may have different causes, including the deliberately more cautious authored monotone strategy.

No saved aggregate report identifies which nodes/hands contribute the gap. A bounded trace or ablation against the same fixed opponent would be needed to separate value-sizing, raise, and defence effects; the running audit and all policies remain unchanged. Final review should retain the large known comparison gap and model limitation unless such attribution establishes a concrete policy defect and a separately reviewed revision. Do not optimize saved policy numbers merely to beat an exploitable reference bot.

## Historical revision-2 simulation and audit status

- **Full-sample representative simulation complete:** 12 representative flops × 3 opponent profiles × 2 hero seats × 10,000 paired deals = 72 comparisons / 720,000 paired deals. The archived report uses the revision-2 source/policy hashes, simulation version 3 and defence version 6.
- **Fixed-seed audit PASS:** the normal `cli.mjs audit --spot UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call` ran from 09:05:00.585 to 09:14:33.697 UTC and passed 19,936 expanded combo decisions / 72 comparisons / fresh exact replay. There are 20 advisory warnings, including reference-policy deep re-raise composition and coarse river-air under-bluff warnings; no blocking balance error. Source/code/artifact/log hashes and the prompt-only source-change exception are preserved in the machine-readable audit receipt. Independent storage review subsequently found that this manually recorded code list does not cover the complete numerical dependency graph. The actual PASS remains valid execution history, but it is not final archive-approval evidence. A new official CLI audit must record complete graph/config identity automatically at start and finish and re-run before final acceptance.
- **All-1,755-flop audit complete:** exit 0, all 1,755 flops evaluated, zero proven-unreachable flops and zero error findings; elapsed 1,137 seconds (18 minutes 57 seconds), completed 10:07:25.741 UTC. All boards have at least one advisory. A verified 1,755-row companion and immutable historical proof were produced. Final acceptance requires fresh revision-3 numerical evidence, the new complete-dependency identity receipts, and independent review.
- **Additional provisional authoring:** the four diverse Stage A pairs listed below have been individually authored with their own literal totals, sizing weights and facing mixes. Their full prompts and saved ranges were read, no representative numeric table was loaded or cloned, and all five new pairs pass the aggregate structural checks. The four additional pairs have provisional independent foundation review (including the individual cold-four-bet correction), but still need simulation, fixed-seed audits and all-board checks. Further authoring is paused pending the representative all-board findings. All 270 Stage B paths remain ungenerated; Stage A must finish first.

Early concurrent/default-worker attempts were killed with exit 137. A bounded retry hit the existing 384MiB worker heap limit. The implementation owner added simulation-only board/512-hand cache expiry and retired each completed board worker, with exact seeded-result regressions. The final one-worker run sustained 45–55 seconds per board. Nine boards were checkpointed before another exit 137; the remaining three completed in 148 seconds after resumption, for about 565 seconds of successful compute.

Checkpoints preserve source/policy/config/code identities. During the first run, a source-geometry validation block was added to `multiway-inputs.mjs`. Removing exactly that added block cryptographically reconstructs the prior composite code hash; product calculation/source ordering were unchanged, and the owner confirmed all 407 Node/browser product tests. An explicit compatibility receipt preserves both identities and per-seat row hashes. The subsequent successful CLI audit independently recomputed all 12 boards under the final numerical code and matched the saved report exactly. The successful replay, rather than checkpoint reuse alone, establishes that equality.

- Current flop policy hash: `9070ca5074b6600eaeb1f1a20a03ce4bb2b40ecea457f8cd578fcec43e8a513a`
- Current revision-3 later policy hash: `c37c4091096867f53e9ec531220f5ff99c7f2a5364d7bc56283afaeca17333d6`. Its full simulation, official fixed-seed replay and all-board run are complete, but final strategic acceptance is held by the broader P2 findings.
- Historical revision-2 later policy hash: `d3c5bb66c53545f8a707056bbbe0bfee67c6a76c6397a3294c546b4e411eca45`.
- Initial hashes retained for review history: flop `b4b05cd0fcc3900866e6a6e0d743e1c1bc556250a72302fa7bd5705f1d03b417`; later `011bdfd07f429d7828cc1ba924285ee9f06a40da6537a11479e4519f8d897331`.

## Four additional provisional Stage A pairs

### `CO_open_BTN_call_BB_squeeze_CO_call_BTN_fold`

- Flop: `1c48ec56a17827f7df7c7bff56b9ac5ef7e48e94af7884ebd0af72a6ebc0232b`
- Later: `cb28d0cb8eedf5b135f46ff78225bb36a419afac5560a4dda30fe9261402460b`
- Status: structural checks and independent foundation review pass; all simulation/audit gates remain pending.

### `BTN_open_SB_3bet_BB_4bet_BTN_fold_SB_call`

- Flop: `82e9187899fe5cc4747e3b71e4434ed127f32cc4d92065ed6539f5791b7ecbb1`
- Later: `8b947cf4e9c3d3331883346393dc68a310037bc89d51a0ea36000abd2ae7f210`
- Status: structural checks and independent foundation review pass; all simulation/audit gates remain pending.

### `BTN_open_SB_3bet_BB_call_BTN_fold`

- Flop: `88d5eb1338d9af2a8509ea03587a46519df199ab0868841fa0c2f9ce8fb0e9e7`
- Later: `b0017d5e8c0455590d1ab4ed835adce0c1bf73d4eb9f3a75eb03de6792f74f75`
- Status: structural checks and independent foundation review pass; all simulation/audit gates remain pending.

### `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_fold_CO_fold_BTN_call`

- Flop: `69a084e4fe5f5907647f6a694c1fc78d82f0b2dd77ad30e2a6a65e9e99f71724`
- Later: `dadab781583d917708f45625960902ac04e490f4f4a128bb67595b0d7d73b70c`
- Status: structural checks and independent foundation review pass; all simulation/audit gates remain pending.

The independent next-four review exposed a separate cold-four-bet interaction: on `As7d2c`, the optional 125%-pot flop bet becomes a 74BB all-in carried only by value. The defence floor then promoted extremely weak calls. The cold-four-bet candidate was revised to assign zero frequency to this optional flop size across all tiers/textures, moving its value/draw sizing weight to 75% and preserving checks. Shared defence, legal actions and facing raise rules were not altered. The changed pair was archived before regeneration, and the unchanged later numeric table was rebound to the new flop identity. Independent recheck is pending.

The native expansion helper now rejects reuse if an existing policy differs from the newly authored literal table, before writing any metadata. A deliberately changed-table regression confirmed rejection and unchanged saved artifact bytes.

## Independent calibration recheck

See [the independent review](hu-postflop-after-multiway-preflop.independent-review.md), including its revision section. On checked-through `As7d2cJh9d`, the revised BB raw equity-defined bluff shares are 23.52% at bet33, 28.59% at bet75 and 40.85% at bet125. The bet75 cap no longer activates; the bet125 multiplier improves from 0.2811 to 0.8434, reaching the effective 36.80% cap. Remaining dynamic cap reliance is disclosed and expected; neither this probe nor a structurally valid tier table proves all-board balance.

The monotone-low HJ strong-hand example now checks 55% and uses bet33/bet75/bet125 at 32/12/1%, compared with the original 25/32/38/5%. This is an explicit response to the reviewed shape-coverage gap, not a claim of GTO precision.

## Completed representative all-board findings

- 15,214 advisory occurrences across all 1,755 evaluated flops. The legacy summary field named `boards` counts occurrences, so multiple sizes can produce several findings on the same flop. The unique-board column below is independently derived from the individual rows.
- Later coverage: flops=1755, reachable_flops=1755, turn_boards=7020, unreachable_turn_boards=0, river_runouts=21060, unreachable_river_runouts=0.

| Category | Occurrences | Unique flops |
|---|---:|---:|
| bluff-ratio(under) | 8092 | 1755 |
| value-only-raise | 5694 | 1406 |
| overcall | 1428 | 691 |

The largest groups are:

- `later warn bluff-ratio(under) river_ip_first`: 4595 occurrences on 1754 distinct flops; examples 2c2d2h, 3c2c2d, 3c2d2h.
- `later warn bluff-ratio(under) river_oop_first`: 3497 occurrences on 1725 distinct flops; examples 2c2d2h, 3c2c2d, 3c2d2h.
- `flop warn value-only-raise btn_vs_raise3`: 966 occurrences on 966 distinct flops; examples 2c2d2h, 3c2c2d, 3c2d2h.
- `later warn value-only-raise turn_oop_vs_raise3`: 959 occurrences on 959 distinct flops; examples 2c2d2h, 3c2c2d, 3c2d2h.
- `later warn value-only-raise turn_ip_vs_raise3`: 898 occurrences on 898 distinct flops; examples 2c2d2h, 3c2c2d, 3c2d2h.

Coarse river-air ratios are not the equity-defined bluff-cap ratio. Deep `raise2+` warnings come from the shared reference mixes rather than independently authored deep-raise rules. Computed-defence warnings must not be “fixed” by treating saved call/fold rows as the effective current strategy. Those saved probabilities still determine earlier-action reach in the existing model, so they remain material to later inferred support. These advisories do not certify equilibrium or optimality.

## Legacy artifact preservation

The original 45 policy pairs/reports have now been received as a 135-file archive. The implementation owner verified all 135 raw hashes against its manifest. Original bytes are preserved under `.local/postflop-ai/legacy-source/manifest.json` and `payload/`; 132 previously absent files were materialized into the normal artifact paths. The three existing BTN/BB fixture files were kept after semantic equality was confirmed. No legacy strategy was regenerated or edited.

All 45 original reports record simulation version 3 / defence version 5. The unchanged development baseline already uses defence version 6. These historical reports therefore cannot be called fresh strict-replay passes under current code, even though their original bytes, policy hashes and source identities are preserved. The earlier inability to retrieve the published API was a transport blocker, now resolved by receiving the original archive; it does not justify silently updating old reports.

The initial read-only API attempts are retained as troubleshooting evidence: connection timeout in the shell, inaccessible web response, and cloud-browser `net::ERR_BLOCKED_BY_CLIENT`. No security-policy bypass or production mutation was attempted.

## Required continuation and quality checks

After the authorized Astra authoring route and original artifact bytes are available:

1. Generate the representative Stage A flop and later policy, validate provenance/source hashes and policy structure, simulate at the existing configured sample count, and run its fixed-seed audit.
2. Author the remaining Stage A paths with 2 initial generation jobs, increasing to at most 4 after the route is proven. Do not start Stage B before Stage A is complete. Avoid competing writes for one spot and bound CPU-heavy simulation/audit concurrency separately.
3. Check every first-node air/medium/draw tier across the 12 shape×height classes, monster/strong height overrides, first-raise keys, OOP/IP differences, and turn/river OOP-defender overrides for every tier. Check the 90,000-byte D1 value budget.
4. Run the normal per-spot audits and all 1,755 canonical flops for each authored spot. The existing all-board later-street check uses 4 seeded turn cards × 3 seeded river cards per flop; it does not enumerate every legal turn/river runout. Record error counts, warning counts by kind and representative boards. Do not relabel heuristic warnings as proof of strategic optimality.
5. Run the final audit serially after concurrent writes are complete, and verify all 45 original artifact pairs remain byte-for-byte unchanged and their existing audits pass.

No flop-base or hand-EV generation, production D1 import or deployment was performed.


## Current candidate-model gate (2026-10-04)

The5 preserved policy pairs remain unapproved and402 additional policies are not authored.
The previous representative simulation/replay/all1,755 results belong to historical model6,
not the current model10 implementation candidate. Model9 exact-call-EV and bounded-cache
preflights were completed and frozen separately; their one-board equivalence result is not
a replacement for current full validation. The newly adopted observable-action contract
changes range conditioning and invalidates those derived results. See
[the version10 contract](hu-postflop-after-multiway-preflop.observable-actions.md).

Current floor regressions compare model10 against a test-only control that disables only
the negative-call-EV floor exemption, retaining exactly the same observable classes, raw
mixtures, ranges, chip state and floor allocation. Historical numeric fixtures are not
rewritten or relabeled. All45 legacy byte/numeric golden checks remain mandatory.
