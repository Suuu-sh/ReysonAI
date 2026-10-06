# Saved BB loss diagnosis, 2026-10-06

This is read-only analysis of existing saved sixth-case returns and completion traces. No Node, strategy execution, sampling, replay, policy change, source change, full-balance run, production action, or acceptance threshold was introduced. The output is a quality diagnosis, separate from numeric-integrity checks.

## Main finding

Across the 360,000 saved BB trials, candidate-minus-reference delta totals −512,857.51bb (equal-cell mean −1.424604bb). The 1,205 completion-bearing trials total +11,106.39bb; the other 358,795 trials total −523,963.90bb. Completion-bearing trials contain only 9,320.11 / 3,048,784.82 = 0.306% of gross negative deltas. The observed aggregate BB deficit is therefore in trials with no recorded completion, not concentrated in completion-bearing trials. This cohort partition is descriptive, not a counterfactual effect of enabling completion.

All 720,000 trial records have exactly baselineReturn, candidateReturn, completionDecisions, index, status. Integer-cent sums independently reproduce all 72 reported delta means (zero mismatches). All 2,424 saved completion decisions occur at river facing all-in: 1,205 OOP, 1,219 IP. Ordinary action traces were not persisted.

The worst board KcKd4h contributes 38.43% of the aggregate BB net deficit from 8.33% of BB trials. Its completion cohorts are net positive in each profile:

| Cell/profile | Whole-cell delta mean bb | Completion trials / 10k | Completion delta sum bb | No-completion delta sum bb | Completion share of gross losses |
|---|---:|---:|---:|---:|---:|
| 043 / standard | -6.857175 | 18 | +211.89 | -68783.64 | 0.080% |
| 045 / passive | -6.110485 | 26 | +39.19 | -61144.04 | 0.238% |
| 047 / aggressive | -6.739858 | 16 | +114.25 | -67512.83 | 0.096% |

## Loss concentration

Gross negative deltas are paired outcome differences, not independently calculated strategic EV loss. Standard/passive/aggressive cells have 2,106/2,678/1,911 negative trials, 1,664/1,880/1,745 positive trials, and 6,230/5,442/6,344 ties. The worst 100 trials contribute only 11.37%/11.56%/11.17% of gross negative deltas, so the result is not just a handful of isolated outliers.

- Deltas worse than −100bb account for 732/368/857 trials and 70.03%/36.92%/79.84% of gross negative deltas.
- The largest repeated losing outcome pair in all profiles is candidate −21.75bb versus reference +113bb: 265/117/304 occurrences, respectively. Ordinary nodes and actions for those trials are not stored.
- In passive, 62.28% of gross negative deltas occur even while the candidate return is nonnegative, versus 28.88% standard and 18.03% aggressive. This distinguishes smaller collected outcomes from negative candidate outcomes; it does not identify a decision error.

Selected largest saved losses (all lack completion traces):
- Cell 043, index 286: candidate -69.75, reference +113.00, delta -182.75bb; completion list empty. 043.004.trials.json, SHA256 a71f615a6b494f0775a4155987a1c4479c0a148012681441818aaf827de6b872.
- Cell 043, index 1987: candidate -69.75, reference +113.00, delta -182.75bb; completion list empty. 043.031.trials.json, SHA256 b3bb254515b993125440acbbc6a726d22b77bcb1f36dbb818d76b1185246536f.
- Cell 045, index 7160: candidate -69.75, reference +113.00, delta -182.75bb; completion list empty. 045.111.trials.json, SHA256 9cfcd862a0708313b2547eb0077715c1300a3ecd7f84d64efd4dde8ba2ba7df6.
- Cell 045, index 7843: candidate -69.75, reference +113.00, delta -182.75bb; completion list empty. 045.122.trials.json, SHA256 821f767eb3a2768ff55d539d570e11d5e5c0ed2c199ed5d03cfdaa96bedbeb8d.
- Cell 047, index 1104: candidate -69.75, reference +113.00, delta -182.75bb; completion list empty. 047.017.trials.json, SHA256 022ee71fb7d44df1eb649f19cef7014d76539035778e6fd6fbb1c58b648fbf83.
- Cell 047, index 1559: candidate -69.75, reference +113.00, delta -182.75bb; completion list empty. 047.024.trials.json, SHA256 d7b283ae1d60cd1f81d4d94497dbafd35eac9ce912d0810e4de2d89e1eaabb47.

The top five in each profile are included with full file pins in saved-loss-analysis.json. No hole cards, runout or ordinary action path has been reconstructed or guessed.

## What completion traces actually show

Completion records retain public request/path and current board, actor's own combo, random index/value, selected label/action, law/mix, public geometry, provenance and proof hash. Their companion .proof.json stores the zero-likelihood certificate. They do not retain the opponent's hand, the baseline path, or all ordinary per-decision laws. In these worst-board cells, all 60 completion events are at river_oop_vs_allin. The path saved in those events is check/check on flop and turn, then BB check and BTN all-in on river. All prior actions here are an actual saved public prefix, not a reconstructed trace.

- Cell 043, index 7520: candidate -87.00 vs reference +27.55; saved river_oop_vs_allin action call, raw mix {'fold': 21, 'call': 79}, random 0.47300878865644336. Public path is flop check/check, turn check/check, river check/allin; board [44, 45, 10, 6, 49], own combo [32, 35]. Chunk SHA256 b98ce8d41fa50ac4ed51842a5d8db8cfc72e20fe3048e876f0d7882b4ea27c8d; proof 995cef2ce39feb8ebdaaea69dfc9fab28c6449460bb4e27d468d01bc66ac2fd7.
- Cell 045, index 8584: candidate +0.00 vs reference +113.00; saved river_oop_vs_allin action fold, raw mix {'fold': 21, 'call': 79}, random 0.18067089654505253. Public path is flop check/check, turn check/check, river check/allin; board [44, 45, 10, 25, 33], own combo [36, 32]. Chunk SHA256 5d775a3bcf172689bd684da49f4eb6cf144068f3881cc0d6d3593a0155fbff98; proof 8d8ddf0799985132a27fff9e25a1111e929d48f867887e3e1816777122acc441.
- Cell 047, index 5631: candidate -87.00 vs reference +27.55; saved river_oop_vs_allin action call, raw mix {'fold': 21, 'call': 79}, random 0.515923387138173. Public path is flop check/check, turn check/check, river check/allin; board [44, 45, 10, 18, 46], own combo [33, 29]. Chunk SHA256 b90476719ca1f465dee9df150edd9bc331290a4b2ffc7e4f8c22bd85f024dcf4; proof 93fd968c3b4c40b7931b5f7b26b633bb6740edc820a49b87df8b70be6276a9aa.

For these examples the saved geometry is 29bb prior pot, 87bb call, 203bb final pot, 3bb rake, 43.5% required equity. Their posterior/equity/range facts are explicitly unknown-off-model. The source forbids completion from rebuilding a posterior or using computed defence. These rare losses are real stored outcomes, but do not explain the aggregate deficit.

## Existing legacy/current paired evidence

measure.mjs executes legacy defenceFor + playHand versus current createModel11BehaviorCompletion + playModel11Hand on the same authored pair and same sampled draws. Saved result files match sourceIdentityHash, inputFingerprint, policy hashes, seed/cell and drawHash within each pair; every paired baseline return agrees.

- Cell001, As7d2c / standard / BB: all 64 candidate returns identical; delta mean −6.51703125bb in both modes; no current completion.
- Cell002, As7d2c / passive / BTN: all 64 candidate returns identical; delta mean +6.04859375bb; current has one completion (the return is unchanged).
- Cell059, 9s7s3s / aggressive / BB: current delta mean +0.33125bb versus legacy +3.253125bb, a −2.921875bb paired change. Only indices 7,24,50,61 differ: current-minus-legacy +65.25, −134.75, +17.25, −134.75bb. All four have no completion. Current's one completion occurs elsewhere. This directly localizes these four return changes to ordinary execution differences, but stored data cannot name the first differing action or law.

The performance outputs also retain aggregate byNode callback counts, not per-trial node/action traces. Their drawHash covers the sampled hands/runouts/randoms but those draws were not saved. The separate cell001 probe's 192 complete trial objects exactly equal the full run's first 192, with one completion; it adds no ordinary action trace and is not an independent sample.

## Comparison being made

The sixth-case baseline is referencePolicyFor(spot.tree) + referenceLaterPolicy with no computed defence. Both alternatives face the configured actual reference profile. It is a fixed heuristic reference, explicitly ai_estimate_not_gto, not a solver or equilibrium benchmark. The reported negative delta is relative underperformance against that reference, not necessarily a negative absolute candidate return: KcKd4h candidate BB means are +31.178061/+31.572504/+29.519321bb.

The candidate uses unchanged model10-authored policy artifacts evaluated through model11 balanced-vs-balanced effective reach/computed defence, then separately declared saved-policy completion only after verified zero likelihood. Current candidate belief does not substitute the actual standard/passive/aggressive opponent profile. The paired legacy diagnostic uses the same policy artifacts with the legacy computed-defence implementation; it is a different comparison from the actual MC baseline.

Relevant source: model11-completion-representative.mjs lines18–44 (producer and conditional trace persistence), simulation-model11.mjs lines17–53 (candidate/reference dispatch), simulation.mjs lines55–93 (legacy execution) and 111–132 (reference versus candidate), execution-model11.mjs lines14–36 (candidate belief and actual-only reference), offpath-behavior-model11.mjs lines14–26 and 50–89 (completion restrictions), policy.mjs lines120–149 (fixed reference). Exact source hashes are in source-pins.json.

## Remaining causal gap and smallest useful replay proposal (not run)

No saved evidence identifies the ordinary node that first causes the largest BB losses. A minimal diagnostic would trace four already selected deals: cell043/index286, cell045/index7160, cell047/index1104 (largest saved −182.75bb loss in each worst-board profile), plus cell059/index24 (known −134.75bb current-versus-legacy change). Execute only those selected deals under current, legacy and baseline after reconstructing the original seeded draw stream, with reviewed instrumentation and source unchanged. This is an illustrative mechanism check, not population attribution.

Required provenance: exact frozen source/pair/config/binding and input fingerprint; original cell/trial index and seed; original sampled draw bytes/hash; 64-trial cache-epoch semantics; per-decision actor/node/public prefix, own combo, mix/law, sequential random index/value, physical action, chip geometry and completion provenance for all three executions. Verify saved candidate and reference returns exactly before interpreting traces; cell059 legacy return must also match. Capture first divergence without feeding other-hand/runout/reference information into candidate belief. Since playHand does not expose an onDecision hook, any observational instrumentation must be separately reviewed for semantic parity. Stop on any mismatch. No regeneration or new pass threshold is justified by this read-only result.

## Pins and outputs

- Receipt SHA256 288c8262c33b4560101adc15b2a21ee0e747e641f4a93de04f6c2c076791e165
- Regression summary SHA256 051a69f93c0b50a089c1663ee7ed40c66a56d6a45aac6b88a8d5af4cdd878b6e
- Source commit 4b6b39a613afe72a2362f85aa93a305cd61b3586; source identity c892e71764f280fe19c2c171f238bc9d75889e3e8db262a57a7d5b3d7eb50ba4
- Authored flop file SHA256 22919105d09997b89501ac53631fd10da9852794d5921688a2bfb07196fc5102
- Authored later file SHA256 bac3b2ba2691fc20d68e425368b4759f88cd053a13b5a053d342edb916f82a39
- saved-loss-analysis.json: all 72 cohort summaries, worst-board examples/chunk pins, and legacy/current comparison file pins.
- source-pins.json: comparison source hashes, policy artifacts, plan, existing audit result, and probe verification.
- analyze_saved.py: read-only JSON aggregation script, separate from source4b.

No policy acceptance, strict-law acceptance, exploitability bound, GTO claim, or full balance conclusion follows from these numbers. Existing integrity success and zero unresolved trials do not erase this material quality warning.
