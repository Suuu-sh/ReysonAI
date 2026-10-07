# Independent review: first HU-after-multiway postflop policy

Reviewed 2026-10-04, against the **initial** representative policy pair below. This is an independent task review of an AI estimate, not a solver/GTO validation. No policy, source code, preflop dataset, or production state was changed by this reviewer.

## Verdict

**The authoring/input/provenance structure is a suitable foundation for individual per-spot generation. The current representative is not yet release-ready, and its numeric tables should not be copied across spots.** Resolve the P1 consumer inconsistency and the P2 monotone coverage finding, correct the contradictory prompt, and re-review the changed hashes before using this pair as an approved example. The river finding needs an explicit calibration response, not a claim that structural validation proves balance.

The current pair has correct saved-source products, geometry, hashes, height coverage, distinct position/line behavior, non-value raise shares and complete restrained defender donks. However, a real view/simulation mismatch occurs when a sized bet becomes an all-in, precisely the situation made common by this spot's low SPR. The structural author's `quality-review.json` does not test this behavior or the actual weighted bluff ratios.

Completed simulations, fixed-seed replay/audit, the 1,755-flop audit, UI testing and legacy artifact validation remain separate acceptance gates. **None is certified by this review.** At report time no representative simulation report or all-board result existed. The author reported that its single-worker simulation exhausted its 384 MiB heap after earlier concurrent jobs had exited 137. This review did not start heavy simulations or full-board audits.

## Reviewed identities

Spot: `UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call`.

- Source hash: `a446af2ae12f4d68aa5810cd88912ebd95642462a8cf8e5e472df6c66d22e975`
- Flop policy hash: `b4b05cd0fcc3900866e6a6e0d743e1c1bc556250a72302fa7bd5705f1d03b417`
- Later policy hash: `011bdfd07f429d7828cc1ba924285ee9f06a40da6537a11479e4519f8d897331`
- Flop complete-file SHA-256: `1fd5d27c84e59467560ed7c4981eb5c18fbc5684c49108cf82553c8c849afc5f`
- Later complete-file SHA-256: `f10a18b557f8de4d92fdaba4859afe06e1eae34cf0d0315aec2d0704fe7d42bd`
- Flop prompt hash: `260a3ef2fb20564f26f4f6e558d5894d754140855e9aa156559403ae646f1175`
- Later prompt hash: `b157437e4d5aaa88086a4a5e04bfce83ad036ff2c2ca42d688ffe050cda74800`

Both JSON artifacts are under `.local/postflop-ai/utg-open-hj-call-bb-squeeze-utg-fold-hj-call-hu-v1-{policy,later-policy}.json`. The saved policy hashes were recomputed from the actual policy objects, input freshness was checked by the normal loaders, and both prompt hashes matched freshly built prompts. There are 134 flop, 90 turn and 88 river rules.

Metadata accurately says `generator_route: native-astra-subagent`, `model: gpt-6-astra`, `reasoning_effort: xhigh`, and explains the failed Codex SQLite initialization. The CLI failure logs agree. The native authoring table and draft are inspectable, and the saved artifact does not pretend to be an app-server-generated transcript. Model selection is the parent-confirmed native task selection, not an independently authenticated CLI model attestation. This is separate-task review within the same model/vendor; it should not be represented as cross-vendor review.

## Findings

### P1 — A merged all-in gets an impossible raise in the range view, but different computed defence in simulation

**Evidence:** `scripts/postflop-ai/views.mjs:107-110` passes raw `laterPolicyMix(...)` to `defence.mix(...)`. In contrast, `simulation.mjs:78-79` uses `defence.baseMix(...)`, whose `policyRule` applies `effectiveMix(..., entry.canRaise)` at `defence.mjs:350`. `defence.mix` itself does not normalize its externally supplied base.

Exact saved-policy reproduction:

- Board: `As7d2cJh`.
- Path: flop `["bet75","call"]`, turn `["bet75"]`.
- Flop started at pot 29 / stack 87. After the flop call: pot 72.5 / stacks 65.25.
- BB's turn 75% bet is merged to its 65.25BB all-in. Pending node is `turn_ip_vs_75`, HJ, `line=defender`, `canRaise=false`, pot 137.75.
- HJ `KhQh` is a reachable draw. Raw policy: fold 40 / call 51 / raise 9.
- Actual `laterMixRows` output for **every KQs combo**: fold 91 / call 0 / raise 9.
- `defence.baseMix` followed by `defence.mix`, as simulation uses: fold 100 / call 0 / raise 0.
- Required equity is 32.625%; this combo's model equity is approximately 9.99%, realized 9.49%. Converting the already-defended impossible raise to a call afterwards would incorrectly force a 9% continue and still not match simulation.

This is an existing shared-consumer defect exposed by the new low-SPR policy, not invalid authored frequencies. Flop views and other callers passing a raw policy mix deserve the same check. It matters even if a higher UI layer hides the raise button, because the underlying probabilities then differ from simulation and from the context used to compute defence facts.

**Correction:** Normalize impossible raises **before** the computed call/fold split, preferably once at the common defence entry point or consistently by using `baseMix` for every replayable consumer. Audit `facts` and explanation consumers as well as views. Do not zero out authored raises to conceal the problem. Add a regression using this exact board/history and assert view, simulation and explanation mix equality, no positive illegal raise, and normalized totals. Also cover flop/turn sized-bet all-in merges and a legal raise control case.

**Acceptance:** This blocks claiming that the representative behaves consistently from policy through product. Re-run affected tests and acceptance checks after the fix.

### P2 — Flop monster/strong tiers have no monotone shape response

**Evidence:** All first-node monster/strong overrides in `author-representative-native-astra.mjs:60-65` are height-only. The 12 shape×height rules cover only draw/medium/air. Thus a matching `low/strong` rule gives HJ the identical mix on `8s7d6c` and `8h7h6h`: check 25 / bet33 32 / bet75 38 / bet125 5. BB's high strong similarly bets 75% in every shape, including high monotone flops. This is not caught by `quality-review.mjs:21-27`, which checks only that the height fallbacks exist for these tiers.

A direct probe on `8h7h6h`, after BB checks, confirms that the non-all-in flop cap leaves this HJ strong mix unchanged. On this board the whole HJ range bets 60.95%, with 38.42 percentage points in bet75+bet125. The same coarse rule also assigns identical frequencies to `JcJd` and `JhJc` even though their estimated equities versus the reached BB checking range differ (approximately 50.12% vs 61.24%). The latter within-tier blocker limitation belongs to the existing representation; this review does not request a new private-card feature or claim a solved optimal frequency.

**Correction:** Add explicit `monotone_high`, `monotone_mid` and `monotone_low` strong/monster rules for both first nodes, keeping the existing height fallbacks. Reassess checking and smaller sizes against this spot's saved ranges. Use shape×height rather than one blanket shape override that hides height. Check paired/wet strong-hand treatment deliberately too; no blanket frequency is prescribed. The author agreed this needs revision.

**Acceptance:** Review the new effective mixes and weighted summaries, then invalidate/re-run any policy-dependent reports. This is a strategic heuristic coverage defect, not proof of a specific GTO error.

### P2 advisory — Checked-line river large bets rely heavily on the bluff cap

**Evidence:** On `As7d2cJh9d`, with both flop and turn `["check","check"]`, the BB `river_oop_first`, line `checked`, is at pot 29 / stacks 87. Exact river `bettingFacts` using the actual saved pair gives:

| Action | Equity-defined bluff share before cap | After cap / alpha | Bluff frequency multiplier |
| --- | ---: | ---: | ---: |
| bet33 | 25.10% | 20.93% | 0.7896 |
| bet75 | 46.83% | 31.29% | 0.5172 |
| bet125 | 67.44% | 36.80% | 0.2811 |

The raw BB checked-line air row is check 72 / bet33 11 / bet75 11 / bet125 4 / allin 2 (`author-representative-native-astra.mjs:98`). At SPR 3, the river all-in share correctly transfers into bet125. For `KhQh`, the effective mix becomes approximately check 83.938902 / bet33 8.685506 / bet75 5.688886 / bet125 1.686706 / allin 0. The cap is working; the authored large-bet bluff allocation is materially reduced by it.

These figures use the defence model's equity-based value/bluff definition, not the tier-based `air` ratio from the simple balance warning. They are not interchangeable. A static tier policy cannot attain every board-conditioned target, and the cap remains necessary.

**Correction:** Reassess the checked-through river large-size air allocations against several reached ranges, including this exact counterexample, and document any intentional remaining cap reliance. Extend authoring review beyond checking rule existence: report pre/post-cap shares or reduction factors for representative reached river lines. Do not disable the cap, force all boards to a claimed equilibrium target, or fix this by blindly increasing air. The author has been asked to inspect/reduce unsupported larger-size bluffs.

**Acceptance:** This is a calibration warning, not an effective overbluff or a standalone release blocker while the cap is active. It prevents treating “zero errors/warnings” from the structural harness as strategic certification.

### P3 — The later authoring prompt contradicts the actual raise tree

**Evidence:** `scripts/postflop-ai/generate.mjs:222` says “one raise per street”, but its own subsequent node list, `max_raises_per_street: 4`, and the engine allow up to four. The phrase “two thirds” is also approximate; the actual all-in merge setting is 0.67.

**Correction:** Generate this wording from the configured maximum raise depth and merge ratio, while retaining the instruction that raise2+ rules come from the reference policy. Refresh the saved prompt/provenance honestly for any newly authored/revised candidate; do not retroactively claim that unchanged old artifacts were generated from a new prompt.

## Checks that passed independently

### Source products and geometry

Every one of the **338 live-seat hand-class rows** was recomputed directly from the referenced saved JSON frequencies. Differences: **0**.

- HJ = `HJ_vs_UTG.call × HJ_vs_BB_squeeze_UTGfold.call / 100`.
- BB = `BB_vs_UTG_HJcall.squeeze`.
- Examples: HJ AA 10×25/100 = 2.5%; AKs 10×40/100 = 4%; AQs 30×90/100 = 27%; JJ 45×80/100 = 36%; 77 85×100/100 = 85%; A5s, 76s and 22 remain 0. BB AA = 100%, AKs = 75%, A5s = 25%, 77 = 0.
- Contributions are UTG 2.5 + HJ 13 + SB 0.5 + BB 13 = **29BB**. Both live players retain **87BB**, SPR **3**. BB is OOP and last aggressor, so `oop_leads` is correct.
- The folded UTG source contributes history/freshness, but its unknown cards are not removed from the HU postflop deck, matching the requested assumption. No opponent private cards appear in the policy features.

Engine probes confirmed flop 33/75/125% bet-call leaves respectively pot/stack 48.14/77.43, 72.5/65.25 and 101.5/50.75. A subsequent 75% turn bet becomes all-in in the latter two cases. The policy's low-SPR context is therefore real, not merely a prompt label.

### Board height and positional behavior

Saved tiers match independently recomputed prompt summaries. Example raw first-action total betting frequencies:

| Board | BB OOP first | HJ IP after check |
| --- | ---: | ---: |
| As7d2c, high dry | 49.71% | 34.23% |
| Jc9d4h, mid dry | 31.26% | 37.75% |
| 8h5c2d, low dry | 25.75% | 48.50% |
| 7c6d4s, low wet | 26.17% | 58.80% |

This reflects BB's high-card/overpair strength and HJ's middle/low-pair concentration. OOP must not mechanically bet less than IP on every board regardless of range advantage; the high-board exception is explainable. HJ's number is its own saved range's conditional first-node mix, not a solver comparison or a joint-history frequency.

All first nodes cover the requested 12 shape×height combinations for draw/medium/air and high/mid/low for monster/strong. Monsters retain checks. First raises have explicit raise keys and positive draw/air support; deeper raises are deliberately left to the existing reference policy. Positive tier support is not proof of weighted bluff balance on every board.

### Later lines, donks and computed defence

All **135** street×line×texture×tier comparisons between OOP and IP first nodes differ; there is no copied OOP/IP effective table. Across all five runout textures, the effective OOP defender bet totals are:

- Turn: monster 20%, strong 15%, draw 15%, medium 4%, air 3%.
- River: monster 20%, strong 15%, medium 3%, air 5%.

No missing defender tier or texture-specific bypass was found.

A cheap exact-river defence probe on the checked-through `As7d2cJh9d` board confirmed current **DEFENCE_VERSION 6**, not the older version statements still present in documentation. HJ facing BB bet33 has required equity 20.93%, MDF 75.19% and overall computed defence 65.27%, within the configured MDF−10 floor. For `KhQh`, fallback fold96/call2/raise2 becomes fold64/call34/raise2. The river cap and SPR rerouting work. The merged-all-in raw-base inconsistency above is the specific exception that must be corrected.

## Re-review and rollout gates

1. Fix the P1 shared consumer inconsistency with exact-path tests; revise the representative's monotone rules and address the river advisory; correct future prompts.
2. Record new hashes and re-review the changed pair. Do not overwrite this report's initial identity without an explicit revision section.
3. Generate each remaining spot independently from its own saved ranges, action history, pot, effective stack, role mapping and input fingerprint. This approval does not authorize cloning this numeric table or substituting a HU range for a multiway-history range.
4. Complete full-sample simulation, fixed-seed audit and all-board checks sequentially within the memory budget. Report warnings by origin (policy, calculated defence, coarse tier heuristic), and distinguish the 1,755 flop enumeration from sampled later runouts.
5. Verify source/model/provenance and exact artifacts for every generated pair. Legacy byte preservation, existing audits and UI/build/test requirements are owned by the main implementation acceptance process and were not silently waived here.

## Revision check at 2026-10-04 08:42 UTC

The author and implementation owner made changes after the initial findings. The reviewer performed another cheap runtime check before ending this review turn; no full audit was run.

- Revised flop hash: `9070ca5074b6600eaeb1f1a20a03ce4bb2b40ecea457f8cd578fcec43e8a513a` (146 rules).
- Revised later hash: `d3c5bb66c53545f8a707056bbbe0bfee67c6a76c6397a3294c546b4e411eca45`.
- Normal candidate loaders pass and both revised prompt hashes match current prompts. The initial pair was archived by the author under `representative-revisions/initial`.
- **P2 monotone revision confirmed:** the author added the 12 monster/strong shape×height rules; the direct HJ `JcJd` / `8h7h6h` probe now gives check55 / bet33 32 / bet75 12 / bet125 1. This addresses the concrete shape-blindness finding. It is not a full all-board quality result.
- **River calibration improved:** in the exact checked-through counterexample, BB raw equity-defined bluff shares are now 23.52% at bet33, 28.59% at bet75 and 40.85% at bet125. The bet75 cap no longer activates; bet125 multiplier improves from 0.2811 to 0.8434 and reaches the same 36.80% cap. Residual dynamic cap reliance is expected and remains an advisory, not an effective overbluff.
- **P3 prompt correction confirmed by current prompt identity:** the owner removed the contradictory one-raise wording.
- **P1 view subcase fixed:** `laterMixRows` now gives all four KQs combos fold100/call0/raise0, equal to simulation on the exact merged-all-in example.
- **P1 shared-consumer closure remains pending:** raw-base callers are still present in `explain-later.mjs` response details and hero `defence.facts`, `explain.mjs`, `range-facts.mjs`, and `balance.mjs`. A view-only correction does not establish explanation/audit consistency. Normalize before splitting at the common `defence.mix` and `defence.facts` boundary, or fix and test every replayable caller. The owner has been notified. Permanent regression tests and their results remain pending.

**Updated foundation verdict:** the revised policy pair is suitable as the structural/heuristic reference for **independent per-spot authoring**, with residual river cap dependence disclosed. Do not call the integration release-ready or all-board/audit-approved until the remaining P1 consumer checks and the still-missing acceptance runs pass. This verdict never authorizes copying the numeric table to other spots.

### Exact permanent regression fixture

Use the following existing public function arguments; no generation or full simulation is required:

```js
const inputs = loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
const flop = loadCandidate(inputs);
const later = loadLaterCandidate(inputs, flop);
const board = parseCards('As7d2cJh', 4);
const combo = parseCards('KhQh', 2);
const paths = { flop: ['bet75', 'call'], turn: ['bet75'] };
const table = replayDecision(inputs, board, paths);
const entry = table.log.at(-1);
const defence = defenceFor(inputs, flop.policy, later.policy);
const rows = laterMixRows({
  actor: 'HJ', role: 'ip', board, node: entry.node, line: entry.line,
  inputs, flopPolicy: flop.policy, laterPolicy: later.policy, paths,
});
```

Assert `entry.node === 'turn_ip_vs_75'`, `entry.canRaise === false`, `table.stacks.BB === 0`, `table.stacks.HJ === 65.25`, and `table.pot === 137.75`. For `rows.find(r => r.hand === 'KQs')`, the class and all four exact combos must be `{fold: 1, call: 0, raise: 0}`. Compare these with `defence.mix(table, board, entry.node, combo, defence.baseMix(table, board, entry.node, combo)) / 100`. Compare `defence.facts(..., base).mix` and explanatory response continuations too, explicitly using a raw `laterPolicyMix` base to catch bypasses at the shared boundary. Keep a legal-raise control case. If artifacts are unavailable in clean CI, construct a minimal saved-source/geometry fixture and the few necessary rules, rather than making the test silently skip.

## Broader correction/data-path review, 2026-10-04 09:00 UTC

Scope: the revised representative, shared defence normalization, bounded simulation/worker lifecycle, exact board support, catalog/input projection, and spot-scoped SQL. The concurrent continuation UI work was excluded. There was no staged diff at the start of this pass, so the review inspected the current working-tree changes directly. No code or artifacts were edited by this reviewer, and no heavy simulation/all-board job was started.

### Independently confirmed

- `tests/postflop-low-spr-consumers.test.mjs`: **2/2 PASS**, no skips, approximately 0.33 seconds. The fixtures use actual saved input geometry and test-only reference policy rules; they do not depend on optional authored `.local` artifacts. They cover the exact merged-turn-all-in case, raw/shared/view/simulation/explanation/facts agreement, a flop merge and a legal-raise control.
- The original P1 mix/facts inconsistency is corrected centrally: `defence.mix` and `defence.facts` apply `effectiveMix` before computing the call/fold split. Normalization is idempotent for callers already using `baseMix`.
- All **407** new input projections have equal Node/browser fingerprints and live-seat range products. Every catalog item resolves to a current two-live-player flop terminal, with matching pot and equal remaining IP/OOP stacks. Problems found by this independent scan: **0**.
- All **45** legacy input fingerprints still equal the preserved fixture. This does not certify legacy simulation reports: the recovered BTN/BB report is defence version 5, while this checkout uses version 6.
- The new support predicate is an exact positive-support existence test over the two live ranges. It correctly excludes folded hands from postflop card removal. Excluding proven-impossible boards from simulation/audit rather than calling them clean is sound. Later coverage counts separately distinguish sampled and impossible runouts.
- Worker retirement waits for the successful result **and exit**, preserving original board order; cache resets do not alter seeds or sample counts. The bounded/unbounded and serial/parallel performance regression tests were read, but not re-run during this pass because the author owns expensive compute. No full-sample memory-success claim is made.

### New findings and corrective requirements

#### P1 — The publication gate admitted a known stale legacy report

At first inspection, `spotArtifacts(spotById('BTN_open_BB_call'))` returned `publishable: true` for `report.defence_version === 5` with current `DEFENCE_VERSION === 6`. The gate checked source/flop identity and simulation version only. It also omitted later-policy identity, later sizing, seed/sample count and exact result coverage.

Spot-scoped SQL protects *omitted* old rows, but this stale recovered row was not omitted and could therefore be selected for replacement. No publication was performed.

**Required correction:** Use a shared cheap freshness/completeness predicate that pins current defence and simulation identity, both policies, sizing, seed, configured samples, expected board/profile/seat keys, metrics, and exact proven-unreachable board IDs. Keep full audit/replay as a separate mandatory acceptance stage. Add mutation tests and prove the recovered DEF5 artifact is skipped. The implementation owner began adding `isFreshSimulationReport` during this review; closure should be based on the final checks below, not the original failure.

#### P1 — Valid reduced-board reports cannot load through the local route

`local-view.mjs` still required `report.results.length === 72` after new simulations began omitting proven-impossible flops. AA-only/AA-only spots legitimately have fewer than twelve available representative boards. Their correctly filtered report would therefore be rejected by `/local-postflop-spot`, blocking local Range/Agent loading despite successful simulation and audit.

**Required correction:** Replace fixed 72 with the same exact reachable-board × profile × seat completeness check used by publication. Add a local-route fixture with a valid reduced-board report, plus missing/duplicate result and incorrect unreachable-proof controls. This is a data-route change, not a UI redesign.

#### P1 — An impossible turn still returned a reachable strategy

Concrete current catalog spot:

`CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_fold_SB_4bet_BB_fold_CO_call`

Both live seats, SB and CO, have exact AA-only saved support. Independent predicates give:

- `hasPostflopDeal(inputs, parseCards('Ks7d2c', 3)) === true`
- `hasPostflopDeal(inputs, parseCards('Ks7d2cAs', 4)) === false`

Nevertheless, calling `buildLaterView({flop:'Ks7d2c', flopActions:'check,check', turn:'As'}, inputs, testFlopEnvelope, testLaterEnvelope)` with test-only reference policies returned SB AA as `reachable:true`, three combos, and a positive mix (check20 / bet33 18 / bet75 35 / bet125 27). The reference policies were constructed only in memory; no strategy was generated or persisted. This is enough to demonstrate the missing guard, regardless of which valid policy is later authored.

**Required correction:** Validate the complete selected board at shared later view, explanation and range-facts boundaries, both browser and local. Add both impossible-turn and impossible-river tests and a reachable control. Return `POSTFLOP_BOARD_UNREACHABLE` rather than zero-equity or policy fallbacks. Guarding only the initial flop or filtering offline audits is insufficient.

#### P2 — New input loading accepted source sizes inconsistent with catalog geometry

In an in-memory copy of the representative's saved datasets, changing `BB_vs_UTG_HJcall.squeeze_size_bb` and its positive squeeze rows from 13BB to 14BB still allowed `buildInputs` to return the old squeeze13 history, pot29 and stack87. `multiwayInputData` checked frequency bounds, row counts and stack metadata but not source seat/action/sizing consistency.

Old candidate hashes would correctly become stale. However, a **freshly authored** candidate could then hash the inconsistent source and wrong frozen geometry together, falsely legitimizing them. The currently saved real representative sizes are correct.

**Required correction:** Before returning new inputs, validate the referenced source roles, recorded action sizes and terminal geometry, or reject a catalog whose exact generating source identity changed. Add this size-mutation regression for Node and browser paths, plus role mismatch. Do not change any saved frequencies to make a malformed context fit. The owner began adding validation during this pass.

#### P2 — A touched-spots-only dataset token can resurrect stale edge cache entries

The scoped publisher originally calculated `dataset_versions.content_hash` from only the supplied spot hashes. Two `buildSql([A1], differentPublishedAt)` calls emitted the same token. Sequence **publish A1 → publish B2 → publish A1 again** therefore returns to the original A1 token while retaining B2 in the database. `apps/backend/src/index.ts` keys all postflop edge responses by that global token, so a B1 response cached during the first A1 publication could be reused.

**Required correction:** Use a unique publication revision/nonce, or derive a token from the full resulting catalog. Preserve idempotent row changes and all unmentioned spots. Test A→B→A token invalidation. The owner began adding a publication revision during this review. If identical old SQL may be replayed after intervening publications, ensure that execution also cannot restore an obsolete token.

#### P2 — Corrected persisted view semantics need a new base identity

`flop-base-core.mjs` builds saved strategies through `flopHistoryViews`, the view path affected by the P1 normalization. Its `FLOP_BASE_VERSION` and `DEFENCE_VERSION` were both still 6 during inspection. A pre-fix version-6 base with unchanged source/policy metadata would pass `isFreshFlopBase` and bypass corrected live computation.

**Required correction:** Bump the appropriate stored-base/view generator identity (or defence identity), with a test proving old metadata is rejected. This does not require generating new bases, modifying legacy policy bytes, or changing their source fingerprints. Existing stale bases should use the already-supported live calculation fallback.

### Scope of the foundation decision

The revised policy remains a reasonable **authoring foundation for independently generated per-spot policies**. None of these findings is permission to clone its numbers across the catalog, alter preflop frequencies, lower simulation samples, or count unreachable boards as audited clean. Integration acceptance remains blocked by any unresolved P1 above and by the outstanding full-sample simulation/audit/all-board requirements. The legacy baseline is explicitly incomplete.

### Correction checkpoint at 2026-10-04 09:02 UTC

The owner made further corrections while this pass was in progress. Independent, non-mutating reproductions now show:

- `spotArtifacts(BTN_open_BB_call)` skips the recovered DEF5 report as `report missing, stale or incomplete`.
- Two fresh SQL generations for the same touched spot and same supplied timestamp produce different publication tokens via the new publication revision. This verifies fresh-generation cache invalidation; replaying identical old SQL after intervening publications was not tested.
- The 13→14BB saved-squeeze-size mutation is rejected with `source action size changed`.
- The exact AA/AA impossible-turn example now throws `POSTFLOP_BOARD_UNREACHABLE` through `buildLaterView`, with the guard placed in shared views/later explanation context.
- All **407** real new input contexts pass the strengthened geometry validator (0 errors).

The original central P1 normalization regression remains independently passed 2/2. These cheap reproductions close the specific observed failures above; permanent broader regression coverage should accompany the changes. **Last-observed outstanding items in this review turn:** local-view's fixed 72-row report gate and persisted flop-base identity invalidation. Final application-wide tests, all-board results and full-sample memory-safe simulation remain outside this pass and are still required. The independent report must not be summarized as complete release approval.

### Final focused closure at 2026-10-04 09:04 UTC

The two last-observed gaps above are now corrected and independently checked:

1. `local-view.mjs` loads the matching later candidate and calls shared `isFreshSimulationReport`; the fixed 72-row requirement is gone. The reduced-board local-route regression passes.
2. `FLOP_BASE_VERSION` is now **7**. A base with previous generator version 6 is rejected while the current identity passes. `DEFENCE_VERSION`, saved policy hashes and preflop source hashes are unchanged by this cache migration. No new bases were generated.

Independent command:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 tests/postflop-report-contract.test.mjs tests/postflop-publish-d1.test.mjs
```

Result: **9/9 PASS, 0 failed, 0 skipped**, approximately 1.19 seconds. Coverage includes stale defence/later/sizing/seed/sample identities, missing/duplicate comparison rows, reduced-board local loading, impossible turn/river rejection in local/browser views and browser explanation, old base identity rejection, scoped/empty SQL safety, statement budget, and distinct fresh A→B→A publication revisions. This was a focused test run, not a simulation or all-board audit.

**Closure:** All concrete blocking failures found in this focused review have a checked correction. The source-size mutation fix and all 407 valid contexts were also independently exercised in the preceding checkpoint; the owner is adding permanent size/actor mutation regressions. No further blocking defect was found within the inspected scope. The residual river-cap advisory remains documented. Fresh-publication nonce behavior is verified; replaying identical old SQL after an intervening unrelated publication was not part of the tested workflow.

**Acceptance boundary is unchanged:** the revised representative may guide independent per-spot authoring. This is **not release approval**. Full configured-sample simulation, fixed-seed audit, all-board checks, final application-wide tests/UI evidence and the explicitly incomplete legacy baseline remain outstanding responsibilities of the implementation acceptance process. Numeric policies must still be authored individually, never cloned from the representative.

## Four additional individually authored Stage A pairs, 2026-10-04 09:25 UTC

This pass inspected the actual saved pairs, their current input/prompt identities, and literal authoring tables/receipts under `.local/postflop-ai/native-next-four`. It did not generate policies, run full simulations or run full-board audits.

### Verification common to all four

- All **1,352** live-seat hand-class products match their exact saved preflop factors.
- Source hashes, current prompt hashes, saved context text, seat-row receipt hashes, decision-table hashes and model/effort metadata match. Provenance accurately identifies the native Astra/xhigh route.
- The reviewer captured each literal table in an isolated in-memory context with `install` replaced by a capture-only callback, then independently expanded its betting totals/size weights and facing tuples. **All 1,349 saved rules** matched the independent expansion exactly before the cold-four-bet revision described below.
- No authoring script imports the representative's numeric policy. Exact comparison against that representative found only 0–2 coincident first-node flop rows per pair; later first-node coincidences were 0–2. Literal tables, shape totals, sizing distributions and facing tuples differ. This supports individual authoring, not a claim about unobservable thought processes. Sharing the schema/rounding expander is appropriate; copying numeric strategies across spots would not be.
- First nodes include every height/shape combination, including explicit strong/monster monotone slowdown. All effective later OOP/IP line×texture×tier comparisons differ. No missing defender donk tier or texture-specific bypass was found.
- Checks use only the acting hand, board and saved public history/ranges. Unknown folded hands are not removed from the postflop deck.

### A. CO open, BTN call, BB squeeze, CO call, BTN fold

ID: `CO_open_BTN_call_BB_squeeze_CO_call_BTN_fold`.

- Source: `5d10469bb026a6ac8d6013030f6c850f3ed298521f1cc8d91fcec9457f484ebf`
- Flop: `1c48ec56a17827f7df7c7bff56b9ac5ef7e48e94af7884ebd0af72a6ebc0232b`
- Later: `cb28d0cb8eedf5b135f46ff78225bb36a419afac5560a4dda30fe9261402460b`

Pot29 / stack87 / SPR3, `oop_leads`, BB OOP and CO IP. Dead money is BTN2.5 + SB0.5. BB uses its own squeeze range (40 supported classes); CO uses RFI × squeeze-call (17). This is correctly different from the original-caller HJ representative.

Weighted flop betting totals BB/CO: As7d2c 44.64%/32.13%; Jc9d4h 27.05%/33.81%; 8h5c2d 18.24%/40.52%; 8h7h6h 13.56%/38.90%. The high-card versus middle/low-pair asymmetry and monotone slowdown match the saved range rationale.

OOP defender bet totals across every runout texture: turn monster/strong/draw/medium/air = 19/13/14/3/2%; river monster/strong/medium/air = 19/13/3/4%.

**Verdict:** suitable individually as a provisional authoring foundation. No blocking policy defect found by these checks. The river cap advisory below remains; full simulation/audits are not yet certified.

### B. BTN open, SB 3bet, BB cold 4bet, BTN fold, SB call

ID: `BTN_open_SB_3bet_BB_4bet_BTN_fold_SB_call`.

Initial reviewed identities:

- Source: `3f31ad8f0801750d5c576b5f5809c0526797bb5904fede5b8f59459b6d7618c6`
- Flop: `7e964e680e71b47aff651c9738864cd19b5649a3ce144945a53eac9e8e1508d5`
- Later: `8b947cf4e9c3d3331883346393dc68a310037bc89d51a0ea36000abd2ae7f210`

Pot54.5 / stack74 / SPR1.357798, `oop_checks`, SB OOP and BB IP. BB's cold-4bet range has 16 supported classes. SB's 43-class range is its original 3bet × saved cold-4bet-call. BTN contributes 2.5BB dead money; both blinds are already included in the live 26BB contributions.

Weighted BB flop betting totals: As7d2c63.96%, Jc9d4h35.53%, 8h5c2d39.37%, 8h7h6h24.58%. SB correctly has no flop leading node in this tree; later positions are distinct. OOP defender totals are turn18/12/13/2/2%, river18/12/2/3%.

#### P2 requiring revision — value-only merged flop shove interacts badly with the MDF floor

On As7d2c, the initial bet125 action becomes **74BB all-in**, not a 68.125BB ordinary bet. Pending response is `bb_vs_125`, `canRaise=false`, pot128.5; call74 makes final pot202.5 less 3BB rake, required equity **37.0927%**.

The entire positive initial BB shove range is AA (weight0.8 per available combo) and A2s (weight0.1), each shoving6%. No draw or air tier has positive support there. Computed facts classify it as **100% value / 0% bluff**. The MDF floor consequently forces SB KcQc to **call100%** despite model equity **6.61%**, realized equity **4.30%**, and an almost-zero logistic call share. Overall defence is32.41%, exactly MDF−10. This is the defined defence-floor behavior reacting to an excessively value-only authored branch, not the already-fixed impossible-raise inconsistency.

**Correction requested:** for this pair, remove the optional oversized flop branch where it cannot carry a sensible betting range, or author meaningful proportional bluff support from the actual available ranges. Do not change shared defence to hide the finding. The author agreed to suppress flop bet125 across this pair's tiers/textures and move its sizing weight into bet75 while preserving check frequencies and the legal tree. Subsequent revision identities and the exact probe must be checked before this pair is approved as a foundation.

**Initial verdict:** held pending the individual revision. This does not block the other three pairs.

### C. BTN open, SB 3bet, BB cold call, BTN fold

ID: `BTN_open_SB_3bet_BB_call_BTN_fold`.

- Source: `56a5911b08804bacd3bb4f1560beb697248b8dfd36d92270c20209c796e64adc`
- Flop: `88d5eb1338d9af2a8509ea03587a46519df199ab0868841fa0c2f9ce8fb0e9e7`
- Later: `b0017d5e8c0455590d1ab4ed835adce0c1bf73d4eb9f3a75eb03de6792f74f75`

Pot26.5 / stack88 / SPR3.320755, `oop_leads`, SB OOP and BB IP. SB retains its 75-class 3bet range; BB uses its own 17-class cold-call response, not a generic blind-vs-open range. BTN's2.5BB is dead money.

The factual high-board rationale checks out: on As7d2c, SB has30.1% strong hands, BB47.1%. Weighted SB/BB betting totals are27.74%/50.95% there, 35.13%/39.57% on Jc9d4h, 16.69%/27.55% on 8h5c2d and22.65%/24.02% on 8h7h6h. The preflop aggressor is not mechanically granted the range advantage on every high board.

OOP defender totals: turn18/12/15/3/2%, river18/12/2/4%.

**Verdict:** suitable individually as a provisional authoring foundation. No blocking policy defect found by these checks. The river advisory applies; full simulation/audits remain pending.

### D. HJ open, CO and BTN call, BB squeeze, HJ/CO fold, BTN call

ID: `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_fold_CO_fold_BTN_call`.

- Source: `1328e3df0d57d2c1268daa60c6c478966622caef36f818e932e62552bfe6339c`
- Flop: `69a084e4fe5f5907647f6a694c1fc78d82f0b2dd77ad30e2a6a65e9e99f71724`
- Later: `dadab781583d917708f45625960902ac04e490f4f4a128bb67595b0d7d73b70c`

Pot36.5 / stack84.5 / SPR2.315068, `oop_leads`, BB OOP and BTN IP. Dead money5.5BB = HJ2.5 + CO2.5 + SB0.5. BB uses its **two-caller** squeeze range (21 classes). BTN's 13-class range multiplies its saved `BTN_vs_HJ_COcall` call with the exact continuation call; no heads-up flat substitutes for the second caller's source.

Saved-summary claims are accurate: BTN has28.9% monsters on Th9h8c and75.5% strong hands on6h5h2d. BB/BTN weighted betting totals are50.16%/24.95% on As7d2c,29.33%/35.55% on Jc9d4h,19.72%/55.42% on8h5c2d and11.45%/44.23% on8h7h6h. This differs materially from both one-caller squeeze pairs.

OOP defender totals: turn17/11/12/2/2%, river17/11/2/3%.

**Verdict:** suitable individually as a provisional authoring foundation. No blocking policy defect found by these checks. The river advisory and pending full checks remain.

### Non-blocking shared advisory: large small-bet cap adjustments

Exact river probes used As7d2cJh9d, with both earlier streets checked through and, for the IP probe, OOP also checking river. The existing dynamic cap works, but equity-defined raw bluff shares can greatly exceed the small-bet target:

| Pair / actor | bet33 raw bluff share | Capped share | Multiplier |
| --- | ---: | ---: | ---: |
| A / CO IP |65.08%|20.93%|0.1420|
| C / SB OOP |42.40%|20.93%|0.3597|
| C / BB IP |27.60%|20.93%|0.6945|
| D / BTN IP |60.20%|20.92%|0.1749|

These are equity-defined bluffs, often weak made hands in a checked-through range, not necessarily `air`. The saved strategy's small-bet frequencies therefore should not be described as quantitatively balanced before the cap. Review cap reliance and value-only action warnings during each full audit; do not “repair” these figures by blindly changing only air. These effective capped probes do not show a standalone effective-overbluff defect.

### Authoring helper provenance caution

The initial `expand-authored.mjs` called `generate`/`generateLater` (which reuse existing files) and then unconditionally assigned newly supplied provenance. If a literal table changes without first archiving old candidates, it could attach a new `decision_table_hash` to old reused policy bytes. **No such mismatch was found in the four current pairs:** every saved rule matches its literal table. Before revising or retrying changed tables, archive both candidates or reject any reused candidate not equal to the independently expanded object before changing metadata. This was sent to the author before the cold-four-bet revision.

### Representative validation status update

The original revised representative now has a saved report matching its reviewed flop/later/source hashes, defence version6,72 result rows and10,000 samples per board/profile/seat. The implementation owner reports a completed fixed-seed audit of19,936 combo decisions /72 comparisons /720,000 paired deals with20 advisory findings. This review inspected report identities but did **not** independently re-run that expensive replay. Its all-board audit remains pending; none of that representative evidence transfers to these four individually authored policies.

### Cold-four-bet revision closure, 2026-10-04 09:27 UTC

The author archived both original cold-four-bet artifacts under `native-next-four/revisions/cold-four-bet-r1` and installed an individual revision.

- Revised flop hash: `82e9187899fe5cc4747e3b71e4434ed127f32cc4d92065ed6539f5791b7ecbb1`.
- Later numeric hash remains `8b947cf4e9c3d3331883346393dc68a310037bc89d51a0ea36000abd2ae7f210`; its `flop_policy_hash` now correctly binds the revised flop.
- Source hash is unchanged. Current prompt hashes, receipt identities and both decision-table metadata hashes match the revised literal table.
- All **71** `btn_first` fallback/height/shape rules have `bet125:0`, with check totals unchanged. On the exact As7d2c reproduction, both raw bet125 range mass and effective bettor reach are **0**. The previously observed value-only shove is therefore removed from candidate play, not disguised by editing defender frequencies. The legal tree still includes the action; a manually forced zero-probability branch is not evidence of a played strategy.
- The remaining flop sizes are not all-in at initial pot54.5/stack74: the 75% bet is below the configured 67%-of-stack merge threshold. Future-street merges and raise chains remain subject to the shared legal-action/defence logic.
- `expand-authored.mjs` now checks existing policy content against the freshly expanded expected policy and rejects a later candidate bound to a different flop **before** calling generation or changing provenance. This closes the helper caution for changed-table reuse. This review inspected the guard without running authoring or modifying artifacts.

**Final individual foundation verdicts:** A, B (revised hash above), C and D are each suitable as provisional, individually authored foundations. No unresolved blocking policy finding remains from this focused pass. River cap dependence is explicitly recorded, and it remains important to inspect quantitative warnings rather than describing structural validation as balance proof.

**Still not release-approved:** none of these four pairs has a completed full simulation/fixed-seed/all-board result established by this review. The representative's validation cannot be reused for them. Keep every spot's own source, prompt, literal table, policy hashes, validation evidence and final delivery identity; do not clone the representative or another pair's numeric rules.


## Representative all-board warning review, 2026-10-04 10:27 UTC

**Verdict: the completed all-board run is valid coverage evidence, but the representative still needs an individual river-policy refinement before strategic acceptance.** Most warning counts are explained by coarse tiers, unreachable deep histories or nominal sizing. A focused probe nevertheless found a real, reachable value-only river overbet that makes the shared MDF floor call hands with exactly zero equity. This is a P2 policy/model interaction, separate from the previously closed illegal-raise bug. Do not approve the final archive receipt from this review; the official fixed-seed replay with complete dependency binding remains pending.

No policy or executable code was changed. The reviewer first inspected saved evidence without numerical work, then used the implementation owner's allocated window for bounded probes: five individual balance boards, selected effective contexts, and the 48 sampled river contexts for one diagnostic flop. No simulation or all-board job was restarted. The compute slot was returned to the memory-test worker after the probes exited successfully.

### Evidence identity and actual coverage

The policy objects remain the reviewed revision 2:

- Flop: `9070ca5074b6600eaeb1f1a20a03ce4bb2b40ecea457f8cd578fcec43e8a513a`.
- Later: `d3c5bb66c53545f8a707056bbbe0bfee67c6a76c6397a3294c546b4e411eca45`.
- Source: `a446af2ae12f4d68aa5810cd88912ebd95642462a8cf8e5e472df6c66d22e975`.
- All-board identity: `534359089c8cdf1100260143b71100ab2780c37408424f60d73d47ad9b003118`.
- Summary file SHA-256: `c0a5c85519798f48571de0073271680cdf799611f57344420c50167f2c774aed`.
- Companion SHA-256: `f9e8bb374af26d51049a06fd9d9a0ae8a01c4327402c2a44da4fdd12645eda14`.

The reviewer recomputed both policy hashes, the companion and summary hashes, the companion's summary binding, every one of its 1,755 row hashes, and warning aggregates. There are 1,755 distinct flop IDs with no duplicates; all 22 code files listed in the stored audit identity still matched their recorded bytes at review time. This does not substitute for the separate complete-dependency/archive verifier.

Every checkpoint reports one reachable flop, four reachable sampled turns and twelve reachable sampled rivers. Totals are **1,755 evaluated flops, 7,020 sampled turns, 21,060 sampled river runouts, zero unreachable and zero error findings**. All twelve shape-by-height regions are represented:

| Shape | High | Mid | Low |
| --- | ---: | ---: | ---: |
| Dry |148|67|13|
| Wet |516|273|127|
| Monotone |166|85|35|
| Paired/trips |135|99|91|

These are canonical-class counts, not probabilities of being dealt those boards. The later check samples only the selected check-through and called-bet paths. It does not enumerate all turn/river cards or every action history; in particular, `checkLaterBalance` excludes river raise-response nodes from its river check set. Coverage must be described accordingly.

### P2 — Reachable river overbet has no equity-defined bluff support and triggers zero-equity calls

**Exact current-policy reproduction:**

- Board `7c5d5hTsQd`, one of the saved audit's seeded river runouts.
- Flop `["check","check"]`; turn `["check","check"]`; river `["check","bet125"]`.
- HJ is the river bettor after BB checks. Pot before the bet is29BB; bet36.25BB; required calling equity is **36.8020%**. This bet itself is not all-in.
- HJ chooses bet125 at **11.5231% of its reached range**. Its actual equity-defined bettor range is **100% value / 0% bluff**. This is not merely `air=0` in the coarse warning.
- BB `AcKc` has **exactly zero equity** against that betting range, but its effective mix is **fold71 / call29 / raise0**. The context's defence floor is active at equity threshold0, fraction0.28896949; its unconstrained equity calculation would fold this hand.
- Total computed BB defence is34.5395%, around MDF−10 points. **27.0551% of the entire reached defending range** is called with equity more than five percentage points below the requirement.

The same check-through line has the defect on several other sampled runouts of this flop:

| River board | HJ bet125 frequency | Actual bluff share | Zero-equity AcKc call | Defender range called at >5pt negative margin |
| --- | ---: | ---: | ---: | ---: |
|7c5d5h3c8s|2.1760%|0%|32%|31.1020%|
|7c5d5hTs6h|2.6891%|0%|31%|30.7661%|
|7c5d5hJh3h|5.3939%|0%|30%|28.3743%|
|7c5d5hTsQd|11.5231%|0%|29%|27.0551%|

The current `river_ip_first / checked / medium` mix is check80/bet33=19/bet75=1/bet125=0/allin=0. On a paired board, available weak holdings can be `medium` because the board itself supplies the pair; the `air` rule cannot supply all the needed bluff candidates. The cap only removes excessive bluffs and cannot repair a value-only action. The deliberate shared MDF floor then creates the bad calls above. Zero aggregate overfold warnings therefore do not demonstrate adequate authored bluff support.

**Minimal correction:** revise this spot's reached river size allocation using its actual saved ranges. Either support the oversized action with a considered allocation of available weak made hands, letting the existing cap enforce the upper bound, or suppress unsupported larger branches and redistribute their value weight into appropriate smaller sizes/checks. Inspect the resulting bet75 and bet125 branches together so the defect is not merely moved. Do not blindly increase `air`, copy another spot's numbers, or change the common defence floor to hide this authored-range problem. If the existing tier/line/texture representation cannot distinguish the required cases, report that limitation explicitly before proposing a broader shared-model change.

**Recheck required:** run the exact four boards/paths above through `defence.bettingFacts`, `defence.context`/`facts` and effective mixes; show the supported betting frequencies and actual value/bluff weights, plus the resulting AcKc response and floor dependence. Check an unpaired high-board control and a monotone/flush control to catch regressions. A policy hash change invalidates this pair's simulation/fixed-seed/all-board evidence for final acceptance; the completed run remains historical evidence for the old hashes.

### Why most warning counts do not call for mechanical policy edits

The complete 15,214 occurrences recompute as:

| Heuristic | Occurrences | Distinct affected flops |
| --- | ---: | ---: |
|River air-ratio under|8,092|1,755|
|Tier-based value-only raise|5,694|1,406|
|Overcall|1,428|691|

There are35 node/type categories, zero clean flops, and no over-bluff, overfold or capped-check findings. IP river under warnings are4,595 occurrences on1,754 flops; OOP are3,497 on1,725. These counts are neither error counts nor exploitability estimates.

**River air warnings:** `balance.mjs` counts only `handTier === "air"`; the actual cap classifies by equity against the reached defender range. On a paired board there may be no air-tier hands at all, and on trips every hand is `monster`. A direct example is `2c2d2hAs9d` after both streets check through: air range share is0% for both positions, yet HJ's raw equity-defined bluff share is70.70% in all three bet sizes. The cap reduces it to20.93%/31.29%/36.80%, with frequency multipliers0.1097/0.1888/0.2413. BB's corresponding actual bluff share is17.34%, not0%. Thus the reported under warning can coexist with a strong raw over-bluff correction.

On the sampled unpaired control `Ac7d2h9hJd`, the same checked line gives BB effective bluff shares20.93%/22.80%/28.94%. HJ gives20.93%/23.71%/16.88%; its small-bet cap multiplier is0.0676. These are meaningful calibration facts and substantial cap reliance, but they do not support turning every coarse under warning into a demand for more air. The value-only counterexamples above were found using the actual equity definition instead.

**Raise warnings:**3,627 occurrences are the four depth-3 categories. At pot29/stack87, the smallest flop chain starts9.57 → raise-to28.71 → an87BB merged all-in. A third raise cannot occur. Both saved flop depth-3 histories returned `null` under `replayOrNull`; the audited turn paths have the same or lower available SPR. `balance.mjs` falls back to raw reference mixes when replay fails, so these warnings describe unreachable reference branches. The906 first-raise flop warnings are exclusively on paired/trips boards, where a tier-based non-monster measure is especially misleading. On `2c2d2h`, every hand is monster, but the effective bettor ranges in the checked bet125 and lead bet33 probes contain98.24% and57.36% equity-defined bluffs respectively. Those bettor figures illustrate the tier/equity distinction; they are not measurements of the subsequent raise branch. A `value-only-raise` label must not be equated with100% equity-defined value without inspecting that branch itself.

**Ordinary flop/turn overcall:** these use computed defence, but MDF is a heuristic benchmark and uncapped non-all-in bets deliberately have no MDF ceiling. On `9c8c7d` versus BB bet125, HJ defends56.27% against MDF44.44%; only0.174% of its range is called at more than a five-point negative margin, the floor is inactive and6.86% of the range raises. On `AcKc4c` versus HJ bet75, BB defends67.97% versus57.14%, with0.216% called at that negative margin threshold. On the turn `AcKc4c6s` after check-through, BB versus HJ bet75 defends98.28%, with zero such negative-margin calls and no floor: the opposing betting range contains61.27% equity-defined bluffs. These are model/policy calibration advisories, not evidence of stale saved call/fold placeholders or another illegal-action bug.

**The one river overcall warning:** on `7c5d5h`, the audit compares every bet125 path against nominal MDF44.44%, although actual sampled geometries give MDF38.34%,44.44%,52.63% or74.44%. Across its48 sampled contexts, the correct reach-weighted MDF is46.7453%, monster share45.8873%, and total defence49.4826%. Its reported non-monster defence is6.6440%; the actual required non-monster share is1.5855%, making the existing allowance8.1711%. The aggregate warning disappears with the actual sizing benchmark. That removes this warning's nominal-MDF interpretation, but does **not** excuse the distinct zero-equity floor calls uncovered inside those contexts.

### Audit follow-up and acceptance boundary

A future audit improvement should distinguish geometrically unreachable histories instead of interpreting their raw reference fallbacks as played strategy, derive MDF/bluff targets from actual merged wagers and rake, and retain action/runout identifiers plus diagnostic values for warnings. Preserve the present receipts and label their existing semantics; do not silently rewrite their counts.

The review therefore supports the coverage and identity claims above, preserves the provisional authoring-foundation approval, and **holds strategic/final acceptance of this representative pending the P2 river refinement and fresh hash-bound evidence**. The previous fixed-seed PASS is historical, and no archive or production release is approved by this report. Evidence for this one spot still does not transfer to the other four authored candidates or to bulk generation.


## Revision 3 proposal review, 2026-10-04 10:50 UTC

**Disposition: approve the literal revision3 draft as a revised representative foundation for installation and fresh numerical validation. No further numeric policy edit is required before those checks.** The known value-only large-bet/zero-equity-call counterexamples are removed in the recorded seven-board diagnostic. The residual small-bet negative-margin calls on `7c5d5hTs6h` remain material and explicitly unresolved under the existing shared defence model. This is not final strategic, archive or release approval.

At this review, the hot later artifact was still revision2. The reviewer made no policy/code changes and ran no Node jobs during the owner's build. This pass independently inspected the literal diff, the full diagnostic script and all14 recorded comparison rows, verified hashes, and compared the old-policy rows with the independently reproduced counterexamples from the preceding review. It did not re-execute the draft's numerical diagnostic.

### Exact reviewed draft and scope

- Draft: `.local/postflop-ai/policy-revisions/UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call/v3-proposal/later-policy-draft.json`.
- Draft policy hash: `c37c4091096867f53e9ec531220f5ff99c7f2a5364d7bc56283afaeca17333d6`.
- Diagnostic: the same directory's `checked-river-preflight.json`, complete-file SHA-256 `e8de67c367491e2ae778eb9a8f2bc61d09774ab6d0570f9ec5e8e66d3cbb1722`.
- Diagnostic script: `.local/postflop-ai/preflight-checked-river.mjs`, SHA-256 `8b9e04e9f7959535d79c31602d5a0886cb034f3f4bfbe448fb4310fd3768e736`.
- The preserved baseline hashes, source fingerprint and unchanged flop hash match the preceding revision2 review. The script validates both policies, applies the common cap and defence to actual reached ranges, measures all four bet branches, rejects inconsistent zero-reach contexts and verifies its source identity at start/end.

Exactly five existing rules change, all `river_ip_first`, `line=checked`. Their check/bet33 allocations are monster30/70, strong45/55, medium80/20 and air75/25; the checked+flush strong override is63/37. Every larger-size frequency in those rules is zero. Rule counts remain90 turn /88 river, and the complete turn object is identical. Other river lines and OOP decisions are unchanged.

This is a deliberate simplification of one decision class. It trades away large sizing choices on the checked-IP river line because the present tier/line/texture representation cannot reliably distinguish a weak board-pair holding from every unpaired medium hand. It does not claim that a single small size is optimal. It retains positional/line differences and meaningful checking; it is not a blanket policy clone or a change to the shared MDF rule.

### Effective result and remaining limitation

The preflight uses flop/turn check-check and OOP river check. In all seven cases, **bet75/bet125/all-in have zero actual policy reach**. Only bet33 remains, with actual equity-defined bluff share20.3367%–20.9258%; zero-equity call mass is0 in every played branch.

| Board | Draft effective bet33 frequency | Draft call mass at >5pt negative margin |
| --- | ---: | ---: |
|7c5d5hTsQd|43.0463%|0.0450%|
|7c5d5h3c8s|9.7447%|0.6777%|
|7c5d5hTs6h|11.8397%|7.4876%|
|7c5d5hJh3h|21.4211%|0.3496%|
|Ac7d2h9hJd|12.3181%|0%|
|2c2d2hAs9d|25.9386%|0%|
|AcKc4c6s9c|38.5826%|0.2734%|

The third column is conditional on the corresponding reached defending range, not a percentage of all deals or an EV estimate. The flush control also exposed a revision2 value-only bet125 branch with21.7449% zero-equity call mass; it is removed by the draft. The preserved baseline reproduces the earlier independently measured large-bet findings.

**The Ts6h residual is not solved:**

- Bet33 bluff share is20.9258%, already at the exact cap; required equity is20.9258%.
- The MDF floor remains active at equity threshold **14.9050%**, fraction0.29905675, and total defence is65.1516%.
- **7.4876% of the reached defending range** is called with equity more than five points below break-even, compared with7.5466% for revision2's small-bet branch.
- Small-bet frequency increases from **4.9225% to11.8397%**. Thus the almost unchanged conditional residual must not be presented as eliminated or as an unqualified reduction in that branch's exposure.
- The previously used diagnostic hand `AcKc` is no longer a losing call here: its equity is24.99% and its effective call share100%. Other holdings remain below the requirement; the saved examples include AQ combinations at approximately13.61%–13.75% equity calling3% from the logistic tail, and the active floor accounts for additional below-threshold calling. The saved first-four examples are not a complete ranking of contributors.

A global equity-defined bluff share does not guarantee each defender hand's conditional break-even: blockers and the strength of the hands labelled as bluffs affect those equities. The shared policy deliberately imposes a defence floor, and its logistic split also allows small negative-margin call frequencies. Eliminating every negative-margin call is therefore a different objective from repairing an authored100%-value overbet. Blindly increasing medium/air frequencies to erase one statistic is not justified when the cap already binds. A more granular blocker/tier model or a revised defence objective would need a separately scoped shared-model review; neither is required or approved here.

The residual is accepted as an explicit **model-calibration advisory for proceeding to full validation**, not as proof of good strategy and not as grounds to hide the number. If the fresh all-board review finds the same issue broadly worsened, or discovers new value-only branches with forced zero-equity calls outside this checked-IP line, reassess the policy before final acceptance.

### Next acceptance boundary

The author and implementation owner were notified of this disposition. Install only with honest updated provenance and a binding to the unchanged flop hash, then perform fresh simulation, official fixed-seed replay and all-board validation for the new later hash. Review the resulting effective warnings again. Revision2 results must stay historical.

The diagnostic's47 recorded source files and12 input files are present. At this read, two evidence/packaging sources (`audit-identity.mjs` and `reviewed-postflop-archive.mjs`) had changed since the diagnostic; the numerical source files and inputs remained matched. The record is a bounded preflight, not a current final archive receipt. Fresh final evidence must bind the final source graph and artifacts after these concurrent implementation changes settle.


## Revision 3 final numerical-evidence review, 2026-10-04 11:46 UTC

**Final disposition: numerical execution and evidence checks pass, but strategic/final acceptance of this exact revision3 pair is withheld.** The seven corrected IP-checked probes reproduce the intended improvement. Broader, independently executed river probes find the same pure-value/zero-equity-call defect in OOP checked and IP called-bet lines. These are reachable authored branches with an active MDF floor, not merely coarse air-tier warnings or the previously acknowledged nonzero-equity Ts6h residual. Further individual policy refinement is required before acceptance; no archive/release approval is granted.

### Exact verified execution identity

Current source/flop/later policy hashes are respectively:

- `a446af2ae12f4d68aa5810cd88912ebd95642462a8cf8e5e472df6c66d22e975`
- `9070ca5074b6600eaeb1f1a20a03ce4bb2b40ecea457f8cd578fcec43e8a513a`
- `c37c4091096867f53e9ec531220f5ff99c7f2a5364d7bc56283afaeca17333d6`

The installed later object equals the reviewed literal draft. Complete candidate/later/report file SHA-256 values are `c985e881ae3baab9f0cc54a164f7bb5b9b65802307bceaa4d91b90fb650113ed`, `317462f34ae7f451dcc9458b28a762b8aa1a51db0774028f9772983ce832b105` and `f46f16717c144053c8480905783883572c19d38083992ec9acc8729d3ef16139`. All match the official execution receipts. Preserve these bytes; recording a future review disposition does not authorize rewriting artifact metadata under these receipts.

The official CLI proof is `.local/postflop-ai/audit-evidence/UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call-replay-1791112414692.json`, SHA-256 `8f4f946b917b90397b543b2f749a63c0c46b4e9844a47f12b9c8817f21e14e17`. It records exit0 from11:13:34.692 to11:23:15.047 UTC,19,936 expanded decisions,72 comparisons and18 advisories. Start/end identities are identical, identity hash `fc44c7533c0db459590a5ad650fa6c4eeea54c78d0e7b013b7bd7853327672cd`; all47 recorded source and12 input files were independently compared with current bytes and matched. The log hash also matches. The report has12 configured boards ×3 profiles ×2 seats,10,000 samples each, simulation version3 and defence version6. This review verified the saved execution proof; it did not repeat the expensive720,000-deal replay.

All-board output base is `UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call--fc4bd404df9637bad4b7fc3f334c33e4dc32333f87c4c1ab6d92e66e387e0aed`:

- Summary under `.local/postflop-ai/all-boards-audit/`, suffix `.json`, SHA-256 `ff73c9d4da70d84297deff8e9c15a550aeb9351f7788988426e1bd84091f9a25`.
- Companion in the same directory, suffix `.checkpoints.json`, SHA-256 `0e8fe19f741523833302c21f52b36c73b171fc2a63648d03a246624c0507192f`.
- Execution proof under `.local/postflop-ai/audit-evidence/`, suffix `-all-boards.json`, SHA-256 `5965cf14bbf54ea3a42ded61bf940430e8b0356ab1abc01f87694aacca81714c`.

The run started with0 reused checkpoints and completed11:23:25.807–11:41:26.997 UTC,1,081.190 seconds, exit0. The reviewer independently invoked `assertAllBoardCompanion` against the live saved inputs and exact identity. It verified all1,755 canonical rows, per-row hashes, actual live-deal support, deterministic runout coverage and recomputed aggregates. All29 code records in the all-board proof, its identity/code hashes, the saved log and its embedded log hash also match.

Coverage is1,755 evaluated flops,7,020 sampled turns,21,060 sampled rivers,0 unreachable,0 errors and1 clean flop (`6c3d2h`). The preceding review's action-history/runout limitations still apply.

### Warning and simulation limitations remain visible

| Warning family | Revision2 occurrences | Revision3 occurrences | Revision3 distinct flops |
| --- | ---: | ---: | ---: |
|River air-ratio under|8,092|6,780|1,754|
|Tier-based value-only raise|5,694|5,694|1,406|
|Overcall|1,428|1,927|958|
|Total|15,214|14,401|—|

There are36 categories. IP air-under declines4,595→3,283 occurrences (now1,737 flops); OOP remains3,497 on1,725. River `oop_vs_125` overcall increases1→496 flops and `oop_vs_75` adds4. Do not describe the lower total as uniform strategic improvement. Suppressing some checked-line actions changes which histories contribute to an aggregate, and nominal-MDF/all-in mismatches remain in this heuristic. The direct findings below are independently established using actual chip sizes and actual equity, so they do not depend on accepting those warning labels literally.

Twelve of the18 official-audit advisories are below-reference simulation rows: BB on `AhKh4h`, `KcKd4h`, `8c8d2h` and `5s5d4c`, for all three reference profiles. The largest difference is `KcKd4h/aggressive`: **candidate +44.1495BB versus reference +60.2958BB**, delta **−16.1463BB**,95% interval[−17.2075,−15.0852]. This is a comparative deficit, not a16BB absolute candidate loss. It predates the revision: the prior delta was−16.1468BB. Across those12 rows, v3−v2 changes range−0.0497 to+0.3485BB.

The simulation applies computed defence/caps to the candidate only, while the opponent and baseline use fixed tier references. Its inferred opponent ranges come from candidate policies, rather than adapting to the actual reference profile. These are substantial comparator limitations; paired-board tier behavior can also be unusually crude. They do not establish which node causes the performance difference, prove superiority/GTO, or excuse a concrete effective-strategy defect. The numbers remain part of the assessment.

### P2 — Value-only river bets with forced zero-equity calls remain in other positions/lines

After the owner returned the compute slot, the reviewer ran one bounded read-only Node process, then returned the slot immediately. It checked **70 river first-node decisions**: the same seven previous boards ×both positions ×five prior paths. Of280 offered size branches,231 had positive effective action reach and49 had zero reach. The condition inspected was positive action reach, zero equity-defined bluff weight and positive called mass from defenders with exact equity0.

**Twenty-one action labels matched**, spanning five of the seven boards. Several labels merge to the same all-in, so these represent15 distinct board/history/role/effective-wager cases, not21 independent strategic regions. No bet33 branch matched in this bounded set. No sampled OOP aggressor/defender branch matched; this is not an exhaustive claim about those lines.

Path keys used below:

- **CC:** flop `[check,check]`, turn `[check,check]`.
- **FC:** flop `[bet33,call]`, turn `[check,check]`.
- **OC:** flop `[check,check]`, turn `[bet75,call]` (OOP was the turn aggressor).
- **IC:** flop `[check,check]`, turn `[check,bet75,call]` (IP was the turn aggressor).
- The fifth sampled control was flop `[bet33,call]`, turn `[bet75,call]`; it produced no matching branch in these seven boards.

For OOP the pending river history is `[]`; for IP it is `[check]`. Append the listed action to reach the facing decision. Frequencies are conditional on the actor's reached range; zero-equity call mass is conditional on the defender's reached range. All listed betting ranges have actual bluff weight0.

| Board | Prior path | River actor/line | Action | Action frequency | Defender zero-equity call mass |
| --- | --- | --- | --- | ---: | ---: |
|7c5d5hTsQd|CC|BB checked|bet75|8.4732%|2.7682%|
|7c5d5hTsQd|IC|HJ aggressor|bet125|24.9650%|8.5287%|
|7c5d5hTsQd|IC|HJ aggressor|allin|17.5680%|8.5287%|
|7c5d5h3c8s|CC|BB checked|bet75|4.9727%|38.3444%|
|7c5d5h3c8s|CC|BB checked|bet125|2.4153%|25.5629%|
|7c5d5h3c8s|FC|BB checked|bet75|12.6168%|13.1901%|
|7c5d5h3c8s|OC|HJ defender|bet75|19.1221%|18.0497%|
|7c5d5h3c8s|OC|HJ defender|bet125|7.5482%|18.0497%|
|7c5d5h3c8s|OC|HJ defender|allin|2.5161%|18.0497%|
|7c5d5h3c8s|IC|HJ aggressor|bet125|16.4789%|19.2390%|
|7c5d5h3c8s|IC|HJ aggressor|allin|11.5963%|19.2390%|
|7c5d5hTs6h|CC|BB checked|bet75|4.9530%|36.6750%|
|7c5d5hTs6h|CC|BB checked|bet125|2.4058%|24.1526%|
|7c5d5hTs6h|FC|BB checked|bet75|11.7770%|10.7979%|
|7c5d5hTs6h|IC|HJ aggressor|bet125|23.1751%|15.1970%|
|7c5d5hTs6h|IC|HJ aggressor|allin|16.3084%|15.1970%|
|7c5d5hJh3h|CC|BB checked|bet75|7.8259%|25.8800%|
|7c5d5hJh3h|CC|BB checked|bet125|3.8012%|12.5479%|
|7c5d5hJh3h|IC|HJ aggressor|bet125|16.2116%|6.3705%|
|7c5d5hJh3h|IC|HJ aggressor|allin|8.1058%|6.3705%|
|AcKc4c6s9c|CC|BB checked|bet75|13.1862%|1.6278%|

Two concrete reproductions show why the finding is more than an advisory count:

1. **OOP checked:** `7c5d5h3c8s`, CC, BB river bet75. Pot29, wager21.75, required equity31.2950%. BB bets this size4.9727%, with value weight0.786058 and bluff weight0. HJ `Ad9d` has exact equity0 but calls42%. The floor threshold is0, fraction0.42103655. Total defence47.0482%;38.3444% of the whole reached defending range calls with equity0, and44.1592% calls at more than a five-point negative margin.
2. **IP after calling turn:** the same board, OC, BB river check, HJ bet75. Pot72.5, remaining stack65.25; the nominal75% bet becomes a65.25BB all-in. Its action frequency is19.1221%, value weight0.86228094 and bluff weight0. Required equity32.6250%, raises correctly unavailable. BB `Ac2c` has exact equity0 but calls24%; the floor threshold is0, fraction0.23719367. Zero-equity call mass is18.0497%. This is not a recurrence of the illegal-raise bug.

The IP-aggressor IC branches expose the same problem after the opposite turn betting direction. The fixed all-board later sampler did not cover that exact IP-turn-bet history. An error-free canonical-flop run therefore could not establish that these lines were sound.

### Correction scope and recheck

The owner has been notified that this exact revision3 cannot receive final acceptance. The author received all affected classes and exact path definitions before report completion. Review the representative's river first-node allocations **together**, including both positions and checked/aggressor/defender lines. Support any retained large/merged action with appropriate available weak holdings, or suppress the unsupported branch and reconsider its redistribution. Preserve the shared defence model, saved preflop ranges and the45 legacy policies. Do not patch one line and immediately start another full acceptance cycle.

Before installing a new revision, repeat the70-decision bounded matrix above and additionally test flop `[bet75,call]`/turnCC and flop `[bet125,call]`/turnCC for both river actors. The flop125-call geometry is a useful near-threshold non-all-in control: pot101.5/stack50.75 gives rounded bet33=33.50, below0.67×50.75=34.0025. The reviewer initially misstated this arithmetic; the author identified the error before further execution, and this report corrects it. In the flop33-call/turn75-call geometry, pot120.36/stack41.32, bet33 really does merge all-in: changing a nominal label does not necessarily remove an unsupported shove. Retain the seven-board controls and the existing low-SPR flop33-call/turn75-call case. Inspect actual value/bluff weights, effective size, supported action frequency and exact zero/negative-equity called mass, rather than only tier ratios. Check all-tier OOP defender donk limits after any redistribution.

The original IP-checked revision3 fix still reproduces exactly: its only positive size on all seven boards is bet33, zero-equity call mass remains0, and Ts6h negative-margin call mass remains7.4876% at11.8397% betting frequency. That narrow closure does not extend to the newly failing lines.

**Acceptance remains held.** The execution proofs above truthfully document successful calculations for these exact bytes and remain useful historical evidence after a policy change. Any replacement policy needs its own preserved provenance, independent preflight disposition and fresh hash-bound numerical gates. The representative's evidence never certifies another spot, bulk generation, GTO quality, or production release.


## Revision 4 draft: support versus MDF-floor diagnosis, 2026-10-04 12:03 UTC

**Disposition: do not install or start another full numerical cycle for the current draft solely because its pure-value counter is zero.** The remaining zero-equity calls expose a limitation of the common defence objective and, in one branch, a narrower authored-selection issue. The smallest defensible next decision is whether the new HU family should explicitly exempt exact-zero-equity river calls from MDF-floor promotion. That is a model change requiring the implementation owner's decision and correct version/cache binding; this reviewer has not changed or authorized shared code or the45 legacy policies.

### Draft and diagnostic identity

- Uninstalled later draft hash: `901e2f2589aeffd1534ef3854ad4a8c7da942ccd48d35e31835960c3ed208698`.
- Draft path: `.local/postflop-ai/policy-revisions/UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call/v4-proposal/later-policy-draft.json`.
- Broad diagnostic in the same directory: `wide-river-preflight.json`, SHA-256 `9fff481bb98a29f346430404c6b461962df311fd3283315eeca01551d5490d0f`.
- Diagnostic script `.local/postflop-ai/preflight-wide-river.mjs`, SHA-256 `84917ae24aa02cd927c4e545c227a1918de12e10a09f506607a6474d929a28da`.

The reviewer recomputed the draft/script/diagnostic hashes, inspected the complete comparison script and20 changed river rules, and confirmed all recorded source/input bytes still matched. The complete turn object is unchanged. The changes jointly simplify OOP checked and IP defender/aggressor betting to check/bet33, including their texture overrides; the previous IP-checked correction is retained. This avoids merely shifting a failed75% branch into125%.

The diagnostic covers98 decisions/392 offered sizes for each of v3 and the draft. Positive effective branches fall301→161. Pure-value-plus-zero-call findings fall22→0, but the broader **any zero-equity call** condition falls26→4, not0. The broader condition is necessary: an aggregate equity-defined bluff can still beat a particular defender every time.

### Four residuals, including increased branch exposure

All four residuals are OOP betting into HJ. Frequencies and call masses are conditional reached-range measures, not whole-deal probabilities or EV.

| Board and prior line | River action | v3 → draft action frequency | Draft actual bluff share | Draft zero-equity call mass |
| --- | --- | ---: | ---: | ---: |
|Ac7d2h9hJd; flop125/call, turnCC|bet33|30.3800% →56.0214%|7.6320%|3.4495%|
|AcKc4c6s9c; flopCC, turnCC|bet33|15.1401% →33.2121%|10.4693%|7.6687%|
|AcKc4c6s9c; flop33/call, turn75/call|allin|2.4617% →2.4617%|20.6600%|12.4552%|
|AcKc4c6s9c; flop125/call, turnCC|bet33|5.7069% →16.8613%|20.2417%|6.7404%|

The first two are below the global bluff cap, and their bluff shares decline from10.1329% and15.8995% respectively as value weight is concentrated into the smaller size. The latter two already saturate their caps. Conditional zero-equity calling is nearly or exactly unchanged, while three branch frequencies increase materially. None of those facts permits reporting the problem as solved.

### Independent exact support probe

In an allocated compute window, the reviewer ran a bounded read-only four-context probe, then returned the slot. It evaluated **every compatible BB hand available before the river action**, not just the hands selected to bet, against selected zero-equity defenders. This tests whether river literal reweighting could create any winning/tied matchup for those hands. It also compared the actual mix with the same capped base passed through `applyEquity(..., raw=true)`, which omits the floor/ceiling adjustment without changing policies or sources.

| Context / selected HJ hand | Compatible BB weight before betting | Weight HJ beats or ties | Actual HJ call | Call before floor |
| --- | ---: | ---: | ---: | ---: |
|A-high flop125-call line /8c8d|0.06736|0|9%|0%|
|Four-club check-through /7d7h|7.83113|0|18%|0%|
|Four-club flop33-call/turn75-call shove /AdTd|1.49400|0.12136 beaten,0 tied|26%|0%|
|Four-club flop125-call line /AdTd|0.07040|0|16.190762%|0%|

The first context's available BB support consists of0.02704 monster weight and0.04032 strong weight. None of it loses or ties to88. The check-through flush context includes monster/strong/medium support, but none loses or ties to77. In the last context, all available compatible BB weight is monster:0.0408 two-pair and0.0296 trips. It contains no available hand that no-club AT can beat. Earlier shorthand describing these capped “bluffs” as weak flushes was too narrow; here the weaker equity-defined betting hands include two-pair/sets that still always beat top pair.

Consequently, adding a river `air`/`medium` frequency cannot manufacture a missing losing hand in those three contexts. Altering upstream policy to make currently absent hands reach the river would be a separate, much broader calibration exercise. Suppressing every bet simply to make the diagnostic empty would hide the incompatible objectives rather than establish a good value-betting policy.

The OOP-aggressor shove has a distinguishable authored-selection component for **AT**: available weaker hands include Ah5h/As5s, Ah3h/As3s, Ah2h/As2s and small KQ/KJ weights, all assigned zero to the explicit all-in branch. A considered reallocation can change AT's equity. However, that same context also forces lower pocket pairs such as77. The saved BB support consists only of A/K-containing nonpairs or TT-and-higher pairs; on the four-club A-K-9-6-4 board,77 cannot beat those holdings even before river selection. Generic extra “bluff” mass is therefore not a guarantee against zero-equity calls across the defender range.

For all four contexts, **the entire zero-equity call mass comes from the MDF floor**. The pre-floor mix calls0 for these hands. The current positive-equity defender shares are61.6715%,57.3959%,52.0954% and58.2008%, while their MDF−10 targets are65.1852%,65.1880%,64.4433% and65.1852%. The floor fills the remaining quota with equity0 hands. Omitting only those calls would give total continue rates61.6776%,57.3959%,52.0954% and58.4007%; differences from the positive-equity shares include retained authored bluff raises. This is the deliberate floor behavior meeting a target that the current range cannot meet using positive-equity calls alone.

### Smallest defensible next decision

1. **Retain the distinction between betting calibration and dominated calling.** The draft fixes unsupported pure-value large branches in the examined matrix, but its small-bet redistribution still needs ordinary range/size judgement. It is not justified to keep increasing or suppressing betting just to satisfy an impossible caller-floor target.
2. **Consider a narrowly scoped exact-river-zero-equity exception to floor promotion.** At a facing decision with a positive call cost and exact river equity0, leave the already calculated non-raise fold/call split unchanged instead of moving fold mass into call to satisfy MDF. Preserve authored/capped raises: a zero-showdown-equity raise can be a bluff, and the last probe has a legal0.726236% raise that should not be indiscriminately erased. Positive-equity hands, normal cap behavior and nonriver realization estimates are a separate question. The floor must explicitly be allowed to remain below its nominal target when eligible calls are insufficient.
3. **Get the implementation owner's scope/versioning decision before code changes.** To preserve the45 legacy strategies, an approved new-family treatment needs explicit family/model identity across consumers, caches, reports and receipts. Do not silently alter global defence behavior under unchanged evidence identities. This review proposes the bounded semantic change; it does not approve its implementation or a versioning shortcut.
4. **Test actual consumer agreement and keep all residuals visible.** Use the four exact contexts above, the prior98-decision matrix, a positive-equity floor control, a legal zero-equity bluff-raise control and an unchanged legacy control. Confirm shared view/explanation/simulation/facts behavior, zero calls at exact equity0 and honest achieved defence below MDF where necessary. Keep the existing Ts6h nonzero-equity negative-margin residual separate; a zero-equity exception would not solve it. Any accepted model/policy change then needs fresh version-bound simulation, official replay and all-board evidence.

The current draft remains **uninstalled and not finally accepted**. The implementation owner and author received the support findings and this model-decision recommendation immediately after the probe. No code, policy, preflop input or production state was modified by this reviewer.


## New-HU defence version 8: independent implementation review, 2026-10-04 13:50 UTC

Disposition: the approved, new-family-only mathematical-zero river floor exception is suitable to adopt at the reviewed code identity. No blocking implementation finding remains in this change. This is not approval of the uninstalled v4 policy, all 407 policies, or fresh full numerical acceptance. The reviewer inspected code, permanent tests, fixtures, actual bounded-run output and its evidence hashes; the reviewer did not launch Node or repeat the author's numerical run while the shared compute slot was owned elsewhere.

### Exact implementation and scope

Reviewed `scripts/postflop-ai/defence.mjs` SHA-256 `225fe6b4c9bd9c017e8db3c601eb79d8032957b4cdfa045d8c17bc7833202fb8`. `onlyLosingRiverSupport` proves nonempty, strictly positive-weight, hero/board-compatible support with all opponent integer ranks strictly above the hero rank. One actual win or tie protects ordinary promotion regardless of the cached float. Zero-weight and blocked entries are ignored; empty support, a blocked/duplicate hero and invalid own/opponent rank do not prove zero. There is no float-zero OR shortcut or epsilon cutoff.

`applyEquity` calls this predicate only after calculating an actual positive `moved` floor increment, with `spot.history`, river street and positive call cost. It returns the already calculated pre-floor split; authored/capped legal raises, raw logistic tails, equity values, floor allocation and ceiling logic are unchanged. Positive-equity calls are not increased to compensate for removed calls. The helper uses existing rank tables and sparse range arrays, adds no persistent per-context cache and short-circuits on a winning/tied outcome. Its extra scan cost is bounded by the actual bettor support for applicable floor promotions; the short matrix proves practical bounded execution, not full-job performance or memory acceptance.

Legacy `DEFENCE_VERSION` remains 6 and `defenceVersionFor` returns 8 only for history-bearing new spots. Simulation/report freshness, CLI audit entry, publication, local artifact route, flop-base identity, offline flop/later EV freshness and serial pins bind the scoped version. Version-6/7 new-family outputs are rejected. All-board identities bind the transitive execution source graph, including defence.mjs. Legacy later-EV identity intentionally retains its prior shape. No equity-kernel/range-equity changes are part of this correction.

### Evidence checked

- Permanent test log `.local/hu-river-floor-v8-target-tests.log`: 11/11 passed, 0 skipped; SHA-256 `da3ce29e58f7915a862c1dfc4f46e20dfa094930c1b3bc70edcf7f1586eb777f`.
- Selected existing-test log `.local/hu-river-floor-v8-existing-tests.log`: 27/27 passed, 0 skipped in that selected run; SHA-256 `38d223fbbf2f24266764def3348741e9305ef58783f3266a4aa7487fa5465a4f`. The two offline-EV execution tests were excluded from this selection; this is not the complete suite.
- Matrix script `.local/hu-river-floor-integer-support-recheck.mjs`: SHA-256 `7765214857b7de290583709d2fe94eb95e338d2aa72bf5888906c06dbf2a2a07`. Output JSON SHA-256 `c7f89e9d3546770cc5195dbe2fb3d36a78a3d24a82cd27cf11f62359016a61d1`; log SHA-256 `f4b96f5bb5d7dfa7c9250c188f8a325a4ae51ce7f6f692dc0d14211aaad742e0`.
- Matrix execution 13:47:42.225–13:47:46.496 UTC, using source `a446af2ae12f4d68aa5810cd88912ebd95642462a8cf8e5e472df6c66d22e975`, flop `9070ca5074b6600eaeb1f1a20a03ce4bb2b40ecea457f8cd578fcec43e8a513a`, v3 later `c37c4091096867f53e9ec531220f5ff99c7f2a5364d7bc56283afaeca17333d6`, and uninstalled v4 later `901e2f2589aeffd1534ef3854ad4a8c7da942ccd48d35e31835960c3ed208698`.
- The reviewer independently rehashed the current 47-source/12-input execution graph using a separate Python reader; it equals recorded code identity `29f343fe901b9bd6f91bc5e6e6bf7b39041189e68087ba9d6087df39f7c5dca8`. The script also asserts its start/end identities match.

The matrix covers the same seven boards, seven histories and both first-node roles: 98 decisions / 392 offered labels per policy, with 301 reached v3 branches and 161 reached v4 branches. Mathematical-zero call branches fall from 26 to 0 for v3 and from 4 to 0 for v4. The reviewer independently checked all 30 saved formerly failing branch records have zero new mathematical-zero call mass. The script asserts the raw/base/cap/equity/reach values, every raise, original floor/ceiling and all 34,525 genuine-positive observations remain identical to the frozen model-6 calculation. It checks 44,519 live view combo observations, selected facts/explanation agreement for every reached branch, and three actual v4 TT simulation decision boundaries.

In the checked-through `AcKc4c6s9c` OOP bet33 branch, mathematical-zero called mass is 7.6687299483% before and 0 after; achieved defence is 57.3959447319%, honestly below the unchanged nominal floor target. The previously diagnosed TdTh/TdTs/ThTs residual is covered by live v4 simulation-boundary checks. The permanent test is explicitly different evidence: it derives actual support from the fixed v3 archive and injects the captured v4 tiny float into the guard. It does not falsely label that captured value as a naturally computed v3 equity.

Permanent coverage additionally protects genuine win/tie support even at `Number.MIN_VALUE` weight with cached float zero, irrelevant zero/blocked support, empty support and invalid ranks, no-cost/nonriver/zero-moved branches, raw tails, ceilings, legal zero-equity raises, the positive-equity Ts6h residual, current consumer agreement, legacy45 actual numeric goldens and new-HU version-6/7 stale-artifact rejection. Historical fixture `tests/fixtures/new-hu-river-floor-golden.json` remains SHA-256 `527311942d380fec23db0050aaf8928703c1d8de81c3ce8d90551eee69a1ad9e`.

### Remaining limits

The exception resolves mathematically impossible calls added by this floor. It deliberately leaves true positive-equity hands eligible; adding a token weak bluff can therefore re-enable a deeply negative-margin call. Policy selection still requires branch reach and negative-margin call-mass comparison, including the known Ts6h residual. None of the bounded matrix, fixed historical goldens or version8 implementation review substitutes for fresh selected-policy simulation, official replay and full all-board execution under the final code identity. Canonical v3 and draft v4 policy approval remain separate decisions.


## Remaining MDF promotion: independent exact call-EV comparison, 2026-10-04 14:37 UTC

**Recommendation to the parent:** proceed to a separately reviewed, new-HU-only implementation of the strict-negative-call-EV promotion exception, retaining canonical v3 literal policies as the candidate. Do not adopt the rejected v4 wholesale small-size rewrite. This recommendation follows actual bounded evidence and an independent probe; it is not adoption, policy acceptance, full-407 approval or release approval. Canonical defence version 8 and policy bytes remain unchanged during this comparison.

### Causal finding and policy/model separation

The version-8 mathematical-zero exception behaves as approved. It intentionally leaves true-positive hands eligible for MDF promotion, including hands with severely negative call EV. The read-only derived v3/v4 comparison SHA-256 `085f021ca7ab3b4309e15dbc054d9ca8ee5a2cdb4ac2e1669174e2dab4146535` is correctly labelled derived evidence, not another execution. Independently counting its v3 rows gives 62 of 98 sampled first-node contexts with at least one action label where hands more than 5 equity points below break-even account for over 5% of conditional defender call mass (175 of 301 positive-reach labels; aliases are counted separately). This is a description of that bounded sample, not an all-board frequency or a proposed acceptance threshold.

The author could alter the A-high betting mixture: before the observed action, AsKs beats available medium weight 2.1640125, strong weight 1.9035 and air weight 0.0105875, while monster weight 2.73309 beats it and strong weight 0.216 ties. The v3 explicit allin allocation uses the tiny air support and omits the substantial medium/strong support. However, all four offered sizes merge to the same actual 41.32 BB shove. The model still conditions on the original action label. Independent AsKs call EVs are +7.08629945 BB against the bet33 label, −3.44617552 against bet75, −23.36259492 against bet125 and −41.16516714 against explicit allin. Those different label-conditioned ranges cannot be treated as four distinct observable wagers.

Pooling the existing effective, individually capped alias weights exactly gives AsKs equity 17.6065987768% and call EV −6.1068024463 BB against the common 41.32 BB shove. Thus the large explicit-allin figure overstates the observable pooled loss, but a real negative-call-EV problem remains under this diagnostic. This pooling is **after the existing per-label cap**. It does not simulate a different model that pools aliases before classification/capping. Observable-wager conditioning remains a separate model issue; this comparison does not resolve it.

For `7c5d5hJh3h`, flop125/call then turn check/check, every available BB holding compatible with HJ 8c8d is in the same monster tier. BB weight 0.2208 beats 88 and 0.00512 loses to it. The river rule cannot change the internal relative allocation of these two groups: both receive the same monster mix, and the current under-bluffed branch is uncapped. The smallest offered size, bet33, still gives 88 only 2.2662889518% equity versus required 20.2416918429%. Its call EV is −29.7492917847 BB. Current version8 raises its raw call 0.01% to 81.085296% while retaining legal raise 0.30594%. This case cannot be repaired selectively by another river tier literal; suppressing the whole value branch merely hides the call-model problem. Upstream range changes or finer policy features would be separate, broader interventions.

### Exact numerical contract

For nonempty positive-weight bettor support compatible with hero and the river board, compute the sign of

`D = (2 * winWeight + tieWeight) * netPayout - 2 * totalCompatibleWeight * callCost`.

The experimental contract freezes the existing Number result `netPayout = context.finalPot - context.rake`, the existing `context.call`, and every saved positive Float64 range weight, and treats each as its exact dyadic rational. Integer showdown ranks determine wins/ties. Strict `D < 0` removes only an actual positive floor-added call increment; `D === 0`, positive EV, unknown/empty/invalid support retain current behavior. No epsilon, equity-kernel change, raw-logistic-tail removal, authored/capped raise change or floor-budget redistribution is involved.

This is the exact sign for the **saved range and existing model net-payout value**, not an exact claim about ideal decimal chip arithmetic or solver EV. Taking exact rational finalPot and rake separately before subtraction is a different boundary contract: e.g. finalPot=1, rake=0.1, call=0.45 with all ties is zero using the existing Number net, but slightly negative using the separate exact Float64 operands. Freezing the existing net isolates the requested floor intervention. Simulation additionally rounds its settled payout to two decimals; the experiment reports that comparison separately. No payout-rounding sign changes occurred in the sampled observations; that is not a proof for all possible inputs.

### Actual evidence and independent checks

The ignored experiment output is `.local/postflop-ai/river-floor-ev-probe/comparison.json`, SHA-256 `2d5bac7d3d84e5970eb25c7ed9d8e62ec193e8d484c2bf0f620563685796e086`. It ran 14:32:04.857–14:32:08.841 UTC. Current source/input identity is `29f343fe901b9bd6f91bc5e6e6bf7b39041189e68087ba9d6087df39f7c5dca8`; the reviewer verified every recorded source/input file still matches. Experiment script SHA-256 is `96013cfc4c7151bce58cc295f64bb39814a8e71b83b877962d67c39eea70e1ea`; exact helper SHA-256 is `e9de7f04cd4cbdd3de7ae5b23ecdef22073e0538b9a4416dcc2e8a226a21797d`. Both matched their live bytes when reviewed. Canonical source and policy hashes are the same as the version8 review above.

The 2×2 comparison uses v3 and rejected v4, each under current version8 and the experimental floor rule, with independent Defence instances. It covers 98 first-node contexts per policy, 392 offered action labels per policy and 462 positive-reach branches total. Assertions preserve all 44,519 raw/base/cap/equity/reach/raise observations and 14,657 nonnegative-EV mixes, while removing 8,017 negative-EV floor promotions. Unknown support was covered by synthetic tests, not naturally encountered in this matrix. The first attempt stopped because the optional v4 explicit-allin diagnostic had zero reach; the final output explicitly records its absence and uses the reached same-wager bet33 for that supplementary comparison. The abandoned attempt was not reported as success.

The reviewer independently replayed seven selected version8 facing contexts with a 192 MiB heap and 20-second timeout; Node exited 0 in 0.393 seconds. Every positive compatible bettor holding was independently enumerated from the live context. A separate Python `Fraction` calculation reconstructed each original Float64 weight, net and cost and matched the helper's complete rational EV, not just its sign, on all seven contexts plus the pooled shove. Three independent exact-boundary cases gave signs 0 / positive / negative at exact equality and adjacent call-cost ULPs. The checks included:

| Context/hand | Exact-rational call EV, displayed BB | Current call | Pre-floor call |
| --- | ---: | ---: | ---: |
| A-high explicit allin / AsKs | −41.16516714 | 100% | 0% |
| Paired Jh3h bet33 / 8c8d | −29.74929178 | 81.085296% | 0.01% |
| A-high bet33 alias / AsKs | +7.08629945 | 100% | 85% |
| Checked Ts6h bet33 / AcKc | +1.85857962 | 100% | 88% |
| Four-club checked bet33 / TdTh | −9.57 | 0% | 0% |

The positive controls must retain the existing promotion; the already-fixed mathematical-zero TT control must remain unchanged. The independent probe returned the compute slot immediately after the Fraction check and did not run another full matrix.

### Effect and limits

In v3, branches containing negative-EV floor promotion fall from 254/301 to 0/301. The candidate still permits negative-EV raw logistic calls in 246 branches; this is intentional. Conditional call mass more than 5 equity points below required equity is at most 2.5411453093% in the bounded v3 sample, rather than as high as 58.9391721792% before. That statistic is neither an all-board guarantee nor an equilibrium criterion.

For the known checked-IP Ts6h line, the aggregate negative-margin call mass falls from 7.4875559670% to the unchanged raw residual 0.7974911681%; achieved defence falls from 65.1516050686% to 58.4615402697%. For paired Jh3h bet33, negative-margin call mass falls from 57.1699703375% to raw 0.0134452074%, while achieved defence falls from 65.1851851407% to 8.0286600106%. The conditional loss attributable to added floor calls changes from −16.6158919245 BB to zero; raw loss −0.0032901530 BB remains. These loss figures normalize by the defender's own reached range; they are **not joint-deal EV or exploitability**. The drastic defence reduction must be disclosed as a model decision, not hidden as an ordinary calibration.

The candidate prioritizes avoiding known negative-call-EV MDF additions against the model's estimated current betting range. It sacrifices some protection against extra bluffs absent from that estimate. The comparison establishes the causal removal and numeric selectivity of this intervention; it does not prove strategy optimality or performance against the fixed reference profiles. The saved-reference asymmetry described earlier still applies.

Before adoption: bind a new new-HU defence version and stale-output invalidation; move the sign/unknown/strict-zero/adjacent-ULP tests into permanent coverage; preserve the legacy45 and nonriver goldens; verify all view/facts/explanation/simulation consumers; add bounded reachable river raise-response cases (the current 98-context matrix covers facing first bets, not every raise-response node); keep raw negative-EV calls and achieved below-target defence visible. Fresh simulation, official replay and full all-board evidence under the final implementation are still required. The full-run performance/memory effect is unproven: the ignored matrix reported 3.984 seconds, 338,972 KiB maximum RSS, 22,110 exact sign evaluations and approximately 182 ms sign/compile time, which is only bounded-probe evidence.


## Version 9 production-code candidate: independent static and evidence review, 2026-10-04 15:10 UTC

**Scoped disposition:** no blocking arithmetic, scope or consumer-contract defect found in the reviewed version9 implementation. Its numeric semantics are acceptable as the separately approved implementation candidate. Memory behaviour under extended retained-context workloads remains an execution gate; this review does not declare long-run resource safety, accept v3/v4 policies, approve 407 spots, resolve action aliases or approve production publication. No Node was launched by the reviewer during this turn because Stage3 owned compute.

Reviewed `defence.mjs` SHA-256 `f20c0384bc60844e2107da12e7d97df453dd43704e6d5f6e0ddfc41badc22478` and new `exact-river-call-ev.mjs` SHA-256 `b624216c5019d6a5ddbb5e9e53d1a9f618d8c534e772b76258634d310490e3bb`. The reviewer independently reconstructed and hashed the current 48-source/12-input runtime graph: `518985dd20f259da4deb49c7201b8b71854d92a6eb011bc2b7b99e443e9fc25f`, matching the execution receipt. Receipt `.local/hu-river-floor-v9-execution-receipt.json` SHA-256 `d37d76d3c281ffbe8ee57f79e13e7b9eadb567ce2510069f14b857fc7dc5da0e` has 16 file records; every recorded size/hash matched the actual file bytes, including all four unsuccessful harness logs.

The helper correctly freezes the existing Float64 net subtraction and call cost before exact dyadic conversion. It compares an integer numerator without division or epsilon. Strictly negative signs alone suppress actual positive floor promotion in paid new-family river facing decisions. EV0, positive EV and unknown signs retain normal behaviour. The production helper deliberately validates opponent rank after hero-card filtering, so a positive-weight invalid rank that is hero-blocked cannot invalidate otherwise known compatible support; an invalid compatible rank does yield unknown. Board-blocked and zero-weight entries do not contribute. Invalid shape, chip quantities, duplicate support, invalid hero, empty support and nonfinite/negative weights are handled conservatively.

Raw logistic tails, legal/capped raises, original floor/ceiling allocation, pre-floor equity queries and the existing range-equity kernel are unchanged. The exact helper is browser/edge-safe and imports no Node facilities. It returns no BigInts to persisted facts or browser response objects. `NEW_HU_DEFENCE_VERSION` is 9 and legacy version remains 6; existing `defenceVersionFor` consumers invalidate new-HU reports/bases/offline-EV at versions6/7/8. The transitive audit/archive walkers include the new helper, so its code is bound to fresh execution and delivery. Documentation states the below-MDF and unmodelled-bluff tradeoff and keeps same-wager alias conditioning explicitly separate.

### Actual tests and numerical evidence

The inspected logs show 18/18 permanent tests in 2.132 seconds and 27/27 selected existing tests in 2.552 seconds. The latter selection explicitly excludes the two expensive offline-EV tests; it is not the complete suite. Permanent coverage now includes exact EV0 and adjacent weight/cost/net ULPs, tie-only outcomes, subnormal weights/costs, extreme finite weights, input order and power-of-two scaling, the frozen-subtraction distinction, unknown/invalid/blocked support, real paid-floor scope, raw tails/raises/ceilings, six real river raise-response paths across both positions, fixed simulation boundaries, cache release, freshness and all45 legacy goldens. The test reference builds exact rationals from binary strings, independently of the production IEEE-bit decoder. The numeric fixture is tied to the previously independently Fraction-verified experiment `2d5bac7d...96e086`. The historical model6/v8 numeric golden remains unchanged at SHA-256 `527311942d380fec23db0050aaf8928703c1d8de81c3ce8d90551eee69a1ad9e`.

Actual matrix `.local/hu-river-negative-call-ev-recheck.json`, SHA-256 `86a6febe8771c27114840961dc8e87a84ed2d0ce85083ef592deff7b9b91d752`, ran 14:57:43.011–14:57:53.917 UTC. Its 645 nonempty observations comprise v3 301 first-bet plus 102 raise responses (OOP63/IP39), and rejected v4 161 first-bet plus81 raise responses (OOP42/IP39). It checks 18,715 nonnegative-EV mixes unchanged, 10,499 negative promotions removed and 60,721 live view-combo observations, with selected facts/explanation agreement. First-bet aggregate results match the independently verified prototype. The printed 392 raise-response count is a theoretical slot count; explicit allin cannot be raised, so 294 candidate raise labels per policy were actually attempted. Empty defender contexts are counted separately. This covers selected seven-board runouts and first raises, not every legal river raise tree/runout.

The failed attempts are informative and were not silently replaced as passing evidence. Attempt1 offered an illegal raise after explicit allin. Attempts3/4 record `Ac7d2h9hJd / flopCC-turnCC / OOP bet75-raise / id2598`: equity metadata 1.0000000000000002 versus1, with identical raw/mix/raise values and positive exact EV. The same discrepancy reproduced under the current kernel with unequal observer/query-cache histories. The corrected harness uses the same kernel and isolates cache histories per compared branch; no numerical tolerance or kernel change was introduced. This is a valid same-path regression control and does not establish universal bitwise equivalence to historical metadata under every query ordering.

### Additional-cache retention gate

`context.exactRiverCallEv` retains compiled bettor rows with BigInt weight units, a board Set and a per-hero sign Map. `compiled.score` shares the existing `context.tables[0].score` array; it does not copy that rank array. The new retained rows/BigInts/signs are additional memory. `releaseRangeTables` drops range indexes, not this exact cache. The exact cache dies with the context LRU, `releaseBoardCaches` or `trimRiverCaches`; there is no global exact-result cache or cross-policy reuse. Valid hero keys bound a sign Map to at most1,326 card pairs (at most1,081 for a fixed valid river board).

The river context LRU can hold16,000 contexts. At roughly100 bettors/100 observed heroes, a VM-dependent extra footprint of tens of KiB per context can accumulate to hundreds of MiB; this is a risk estimate, not a measured bound. Ordinary simulation already clears all board caches every512 hands, and exact-EV trims river contexts at1,500 or12,000 depending on the root street. Thus it would be incorrect to assume that every normal simulation retains16,000 exact caches. Conversely, the branch-isolated matrix intentionally releases caches before every branch and cannot certify large-cache memory safety.

A small separate exact-cache LRU is a reasonable candidate if measurement warrants it. A64–128-context per-instance limit can delete the evicted context's compiled/sign property while leaving the underlying strategy context intact; board release/trim must also clear any added LRU references. Sign-only caching avoids retained compiled rows but recompiles the entire support for every newly queried hero, trading memory for CPU/GC. Neither alternative should alter precision or equity-query ordering.

Minimum additional validation proposed to the parent: (1) retain at least three times the chosen exact-cache capacity using real support and several heroes, revisit evicted contexts, assert exact signs/mixes unchanged and verify additional-cache counts after eviction/release/trim; compare heapUsed/RSS and post-GC retention for identical construction order, sharing rank tables to isolate additional-cache cost. (2) Before a long official run, execute a difficult representative paired board with the unchanged formal10,000 samples/profile/seat, seed and512-hand batch; compare all six result rows byte-for-byte across retention variants and measure peak RSS. This is a one-board resource preflight, not a reduction or replacement of the required full12-board simulation/replay or1,755-board audit. Any cache implementation change requires review against its new source identity before acceptance.

## Observable-action alias contract: independent static review, 2026-10-04 15:42 UTC

**Disposition: recommend the bounded contract below for parent review before implementation.** The causal diagnosis is sound: an opponent observes a chip action, not which of several saved size labels produced that action. Version9's exact negative-call-EV floor rule does not fix label-conditioned ranges. Alias normalization is a separate numerical change and needs its own scoped identity, implementation review and fresh evidence. This section does not approve a policy, the alias implementation, all407 spots or release. The separate version9 cache evidence reported by its owner is not used as proof of this contract.

I read the design at `.local/hu-observable-alias-design.md` and independently verified its SHA-256 `d30d352421ebee44055fd7855d090b0dcec99974dee205963d4d13fe611f129a`. I inspected the current engine, policy selection, defence reach/caps/floor/ceiling, exact-EV bypass and pruning, trees/configuration, UI replay/URL grammar, Agent sampling/logs and simulation paths. A read-only Python JSON check confirmed the407 published catalog entries and geometry below. No Node process, numerical replay, policy change or implementation was run for this design review.

### Minimal recommended numerical contract

1. **Opt in by resolved new-HU spot identity.** Server/worker inputs can use the validated catalog spot. UI contexts must resolve `spotId` or carry a mode derived from that resolution; `completedFlopContext` omits `history`, so testing only that UI object's `history` silently leaves the bug active. Unknown or not-yet-loaded identity is not permission to use default-spot geometry or truncate a saved path. Verify that any supplied geometry agrees with its resolved identity. Keep all legacy45 behavior and identities on their current path.

2. **Share one physical transition projection.** Preserve the engine's actual street-specific arithmetic: flop compares the unrounded pot fraction to the merge threshold before `put` rounds; later streets round the fraction first. Form class keys from the resulting cent-valued chips/commitments, action semantics, actor/next actor, terminal status and effective raise legality, relative to the same canonical parent. Do not merge check with fold merely because both pay zero, or distinct histories merely because their pots match. Effective all-in metadata must reflect the actual effective-stack commitment, including a wager covering the opponent. Do not infer it from a token or just the acting player's residual stack.

3. **Preserve each route's played label mixture, then project once.** For computed candidate play, retain the current reroute and separate per-label cap, including six-decimal `cap.apply` rounding. Convert the final label mix to the probabilities actually selected by the existing ordered `choose`/`fillProbs` remainder convention, then sum member probabilities into the class. Do not normalize label ranges separately, reapply a pooled bluff cap, round the grouped frequencies again, or feed projected output back into raw cap construction. Raw-policy simulation, fixed reference opponents and Agent profile overrides currently bypass candidate cap/defence; their final label mixtures need the same physical projection without newly applying the candidate cap. An explicit raw-versus-projected boundary is required for `defence.mix`, the optimized exact-EV mixer, views and Agent overrides.

4. **Choose an existing representative and erase latent conditioning.** Prefer configured river `allin` when it belongs to the class, even if that raw label has zero frequency. Otherwise use the first existing member in configured action order. Flop and turn have no allin node. Use the representative as a policy address and path token, but use physical metadata for labels and explanations: a flop `bet33` representative that committed the effective stack is described as all-in, never as a small bet. Canonicalize log entries, pending nodes, cache keys, source likelihoods and API lookups at every relevant prefix. Recompute defender range/equity/floor/ceiling once against the unnormalized pooled bettor weights. A caller-supplied base from the old alias node must be replaced consistently or rejected as a mismatch. Empty/unknown support uses a deterministic canonical fallback, preserving the version9 unknown-sign behavior.

5. **Retain cap-reduction provenance as the ceiling trigger for this change.** Set the class's `capped/wasReduced` from actual positive weighted bluff mass removed by the existing member caps, using actual pre/post probabilities after the existing rounding and sampling convention. Calculate pooled value/bluff facts from those same masses; do not copy one member's flag/factor or rely on `bluffBefore * factor` as if it were exact played mass. Accumulate removed contributions directly in a deterministic order so subtraction of nearly equal large totals does not erase a real reduction. Cover factor<1 with no actual rounded change, zero-weight members and remainder boundaries. Preserve unknown classification explicitly. The class's common physical wager supplies the common alpha. A pooled effective factor is diagnostic, not a second cap.

6. **Restrict supported multi-label wager classes to effective all-ins.** For an unexpected non-all-in rounded collision, return an explicit unsupported-geometry result before choosing a defender raise row. Do not silently pick the representative's legal-raise allocation or average label-conditioned replies. That would be another strategy convention; preserving latent response behavior would require blocker-conditioned label posteriors and potentially joint latent-history state. Such machinery is unnecessary for the current catalog.

7. **Preserve old path legality before canonicalization.** An old regular-bet label that merged all-in could legally be followed by a requested `raise` that the engine interpreted as call. Validate that original source-node action and its effective-call conversion before replacing the bet with river `allin`. An original explicit `allin,raise` remains illegal. Reject every unconsumed suffix after an effective call/fold and every attempt to proceed to a later betting street after all-in. Do not add a fake response node or silently fall back to another spot. URL `B33/B75/B125` remain percentage tokens; amount syntax would require a distinct format. Resolve delayed loads before rewriting a URL, respecting newer intent, retry and Back/Forward.

8. **Version the observable model independently of saved policy bytes.** Use a new new-HU model/action identity after9, leaving legacy defence6 and the shared legacy simulation identity unchanged. Invalidate computed and raw-policy reports, bases, offline EV, histories, cached explanations, checkpoints/companions and acceptance bundles. Raw reports currently omit `defence_version`, so a defence-only bump is insufficient. Recapture source-graph identities including the shared projection. Keep the policy/source bytes unchanged and preserve prior proofs as historical evidence.

### Why provenance, rather than aggregate saturation, is the smaller choice

The current ceiling activates on whether a faced label was actually capped. Pooling that provenance gives a deterministic function of the observed class and preserves the existing heuristic's trigger meaning. It does **not** prove that the aggregate lies at break-even. For alpha0.25, member A with value9/bluff1 is uncapped; member B with value1/bluff9 is capped to bluff1/3. The played post-cap pool has value10/bluff4/3, a bluff share about11.7647%, below alpha. Pooling before capping instead permits bluff10/3, changing betting mass. Requiring the post-cap pool to saturate alpha would switch off the existing ceiling for the first pool, introducing a separate response-model change and a new numerical saturation boundary.

Recommend retaining provenance for this alias correction and making its limitation explicit in facts/docs. Existing comments that say every capped range or bluff-catcher is at break-even must not be reused as a theorem about these pools. Global value/bluff classification and hero-specific blocker equity already differ. The provenance-triggered ceiling can trim positive-model-EV calls; this is an inherited heuristic, not an optimal-response result. Fresh probes must report achieved defence, active floor/ceiling and their actual changes. They must also retain raw negative-call tails and conditional loss metrics after the version9 guard. If those observations motivate an aggregate-saturation rule, review that rule as an additional model experiment, rather than folding it silently into normalization.

### Verified boundary for ordinary non-all-in collisions

The current `hu-after-multiway-spots.json` contains407 entries (137 Stage A,270 Stage B), all with nonempty history and cent-valued positive geometry. Starting pots are19–79BB and equal starting stacks are70–92BB. Configured opening fractions on each street are0.33,0.75,1.25. Pot size cannot fall while a live betting decision remains: uncalled-chip return occurs at terminal settlement. Thus the smallest gap between distinct unmerged opening bets is at least `(0.75 - 0.33) * 19 = 7.98BB`, far exceeding the at-most-one-cent combined rounding uncertainty. Each facing node has only one raise label. Therefore distinct unmerged size labels cannot collide solely by cent rounding in these published geometries. Stack cap/merge can make them equal, precisely the effective-all-in case above. This proof depends on the current catalog and sizing; retain both a catalog/config regression assertion and a runtime collision check so future changes fail clearly instead of inheriting an arbitrary raise-row convention.

### Additional implementation hazards and required checks

- **Sampling arithmetic:** A new normalized `choose` call over rounded grouped percentages is not automatically the same sampler. The simplest exact preservation of an existing fixed random variate is to sample the original ordered final label mix, immediately map to the class, and never expose the latent label to subsequent decisions. Use one random draw per decision. The exported probability projection must respect cumulative clipping/final-action remainder and be checked around cumulative boundaries, under/over sums caused by rounding and zero-frequency representatives. Grouped display percentages must not become inputs to later sampling or reach.
- **Exact-EV pruning:** `exact-ev.mjs` currently builds/prunes one branch per raw action. Map-and-recurse on each alias separately is insufficient: two individually sub-threshold masses can have an above-threshold pooled class. Construct one child and perform pruning after class aggregation. On a small fixed river compare `prune=0` to direct enumeration; separately test two tiny member probabilities straddling the pruning threshold. Refresh approximate EV evidence rather than promising bitwise equality to the old latent-label tree.
- **Profiles and comparators:** Agent's `profile ?? balanced` path must not mix raw profile keys with projected offered actions. Project the selected final source once, keep registry keys canonical, and verify physical options/logged `to` against engine chips. Candidate-derived inferred reach still does not adapt to the simulation's fixed reference or an Agent profile override; normalization does not remove that existing limitation.
- **Required real fixture:** For `Ac7d2h9hJd`, flop `bet33,call`, turn `bet75,call`, river `check,{bet33|bet75|bet125|allin}`, all four aliases physically pay41.32BB from pot120.36BB. For AsKs and all reachable defender combos require identical canonical pending state, full bettor weights/support, blocker equity, exact call-EV sign, mixes, faced cap facts, floor/ceiling and summaries. The previously measured post-cap pooled AsKs EV was negative; the equality assertion must not assume that pooling makes it profitable.
- **Geometry/path coverage:** Test both positions/trees, all three streets, partial and full merged classes, singleton merged actions, explicit allin absent/present, legal raise chains, merged-bet requested raise→call, genuinely illegal explicit-allin raise, terminal suffixes, implicit OOP flop check, merge equality and neighboring cent/half-cent cases. Test unsupported synthetic non-all-in collisions without manufacturing a production rule for them.
- **Public-consumer coverage:** Match live defence APIs, rows/combos, range facts, explanations, browser/local routes, stored-base keys, Agent balanced/profile/human routes, raw/reference/candidate simulation and the exact-EV optimized path. Compare every old alias URL to the canonical URL after delayed load, failed-load retry, newer URL intent, Back/Forward and action reselection. Explain actual all-in semantics on flop/turn even when the transport token remains `bet33` or another size.
- **Counting and evidence:** Count each observable branch once in aggregate audit/EV coverage, or report structural alias counts separately from unique physical branches. Do not turn repeated aliases into independent successful evidence. Preserve all45 legacy byte fingerprints and numerical/engine/Agent/URL goldens. First pass focused contract tests, then the parent's full tests/build and fresh representative simulation, official replay and1,755-board evidence against the final adopted identity. Existing version9 precision or one-board cache results cannot replace these gates.

The design can proceed to a concrete implementation plan with these constraints. Adoption remains with the parent; numerical acceptance remains pending implementation and fresh evidence.

## Model10 exact-diff implementation review, 2026-10-04 16:50 UTC

**Scoped disposition:** the implementation follows the adopted observable-action contract. I found two P2 defects in the frozen candidate, reported them immediately, and inspected the parent's subsequent narrow corrections. The independent bounded probe below passed. No additional blocking numerical defect was found in the reviewed paths. This is an implementation-candidate review, not acceptance of the representative policy, all407 policies, publication or production. The full current-model suite/build, simulation, independent replay and1,755-board audit remain required; previous model6/9 evidence does not establish model10 policy quality.

### Exact review boundary and findings

The source boundary is local commit `88adc280d2a7dd65f49565a0237fdb2da706f679`, tree `c3b17e92a4dfa35e7ba7d4007131a03f1507bc0d`, compared with executed model9 checkpoint `b3af21f94ede4119e333722f03adfbc3bf6fb5fe`. I independently read all53 records in `.local/hu-model10-review-checkpoint/manifest.json`, fetched each frozen Git blob and verified every recorded byte length/SHA-256. All53 matched. The substantive model9-to-model10 diff contains47 changed paths; the53-record checkpoint also includes already-reviewed model9 precision/cache files. The archive/review receipt was intentionally stale and is not made current by this review.

- **P2, frozen Agent all-in option still displayed its nominal percentage.** `src/agent/AgentTable.tsx` at the actual option-button rendering retained `^bet\\d+$` percentage markup even when `option.allIn` was true. The heading correctly said All-in, but a flop/turn size-token option could still show33%/75%/125% beneath it. The parent added `AgentActionSizeHint`, gated on `!option.allIn`, and routed the actual option button through it. The added SSR assertions render that component for all three size tokens, retaining legacy markup when the flag is absent. Inspected correction hashes: `src/agent/AgentTable.tsx` SHA-256 `e65165e1710175ffe167716800c5ded34c0afb528ad2558dafaaa0ae0619f5c9`; `tests/postflop-observable-ui.test.mjs` `4b3e995278eccadb250ab2181c8ca8c061df2a45b92a299128b9b208522a19eb`. The original frozen88 code is not silently treated as corrected.
- **P2, authoring prompt called saved fold/call rows disposable structural placeholders.** Frozen `generate.mjs`'s new-family execution note understated their role: `defence.reach` still multiplies earlier call/fold histories by the saved probabilities. A saved call0 can erase later inferred support even when computed defence actually calls. The parent replaced the claim with an explicit distinction between the current computed response and materially important saved reach factors. New-HU tree text now consistently says exact67% of the remaining effective stack; legacy wording remains unchanged. Inspected correction hashes: `scripts/postflop-ai/generate.mjs` `5c0139eb674a4cbfd7885abb220c9fb6c49664fbded148e3f11533ed98eeedc6`; `tests/postflop-observable-prompt.test.mjs` `6a242f2806b8a8208482dcf4983bcb045f64cb47f704bd8522918e01aa0314af`. Prompt tests were awaiting the parent's allocated execution slot at the time of this review.

I also inspected the parent's packaging-only follow-up that adds `.observable-actions.md` to `reviewedSourcePaths`' explicit document list. `scripts/postflop-ai/reviewed-postflop.mjs` SHA-256 is `f5c39a2ba3f5109bd605ad8fbf6662f8350bb1ec3d7f300ce95064cc2b490639`. This makes the adopted contract part of the handoff's source pins; it does not renew or approve the existing receipt. These post88 corrections need a new final checkpoint and its own source binding.

### Numerical and consumer code assessment

`observable-actions.mjs` (frozen SHA-256 `982ea012ed5d799ffbcff76420377c062e8ce2593bdb3fbe972d91dd27d1e429`) preserves the separate flop/later rounding order, distinguishes semantic action families, projects effective commitments/raise legality and rejects unsupported non-all-in multi-label collisions with legal raises. Its whole-source-path validation precedes canonicalization, preserving old merged-regular-bet requested-raise→call imports while rejecting explicit-allin→raise and effective-terminal suffixes. Representatives use only real configured nodes. Every engine decision records its projection and immediately maps the selected raw label to the canonical public action before the next decision.

The sampling boundary is correctly kept separate from presentation. `defence.mix` remains the raw-label final mixture; `observableMix` projects it once. Simulation and Agent continue sampling their original ordered label mixture with one existing random variate; the engine forgets the latent label. Raw-policy simulation, reference opponents and profile overrides do not acquire a candidate cap. The Agent profile registry receives the canonical node. Reach multiplies the sum of played member likelihoods at the canonical prefix, retains saved-policy-plus-cap reach assumptions, and does not substitute computed call probabilities. Alias node/base requests are reconciled against the actual pending class or rejected.

`buildBetting` retains the individual raw-label caps/reroute. Observed cap facts sum actual post-rounding played masses, accumulate positive removed bluff contributions and use `wasReduced` for the inherited ceiling. They do not apply a new aggregate cap or assume aggregate saturation. The new facing-copy branch explicitly reports pooled share and reduction provenance, with four-locale assertions and a legacy-copy control. Version9's exact weighted negative-call-EV helper is byte-identical to the previously reviewed helper; it now evaluates the appropriately pooled range. Unknown/empty support still preserves the existing fallback. The floor allocation and raw/raise contracts are tested against an alias-aware control that disables only the exemption, rather than incorrectly comparing model10 ranges to historical latent-label goldens.

The exact-EV optimized mixer projects the final raw mixture, constructs one child per class and prunes after aggregation. It does not expand/prune each hidden alias independently. Balance traversal deduplicates canonical public histories and uses physical price/MDF for new-HU findings. Schema validation still expands authored structural rows; its `checkedCombos` count is not a unique physical-branch count. Saved-base views mark impossible nodes unavailable; imported paths and stored explanations resolve to the canonical pending node. Flop/turn all-in copy uses physical metadata despite size-token transport keys. UI mode resolution handles the catalog `spotId` carried by completed contexts; URL tokens keep their percentage meaning and imported source legality. The mounted load/retry/Back/Forward test exercises retained board/action intent.

Scoped model10/action identities reach computed and raw simulation reports, publication/freshness checks, flop bases and offline EV. Legacy defence6 and its raw simulation schema remain unchanged. The raw report identity matters because such reports omit `defence_version`. New source imports enter the transitive audit graph. Neither a new version field nor a successful structural test renews historical numeric proofs.

### Independent bounded execution

After the parent explicitly released compute, I ran one inline, read-only Node probe under `timeout 20s` and `--max-old-space-size=192`. It exited0. In-process interval was `2026-10-04T16:49:06.810Z`–`16:49:07.605Z` (795.19ms); peak RSS was244,788KiB, heapUsed at completion102,459,104 bytes. Node had exited before I returned the slot. No policy, source, test or receipt was written by this probe.

- 54 engine-versus-independent-arithmetic comparisons covered all three streets, both roles and all three regular labels, using full/partial merges and the flop-versus-later pre-rounding threshold distinction. Physical paid chips, stacks and all-in metadata matched.
- For preserved real representative v3, I independently checked1,647 combo reach weights across18 alias inputs: two-, three- and four-member classes for both roles. The oracle used the complement of the preceding raw action intervals for these suffix classes, not `projectActionMix` or `playedActionMass`. Whole posterior arrays, pending paths/nodes, selected defender mixes and cap facts were identical across member spellings. Wagers were77.43BB,65.25BB and41.32BB respectively. The checked-IP two-member class had zero actual reach and remained zero; zero-frequency aliases did not invent support.
- On real high-pot geometry `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_4bet_CO_fold_BTN_call_SB_fold`, I used explicitly test-only narrow AA/KK ranges and reference rules to bound work. The complete generated flop-base JSON round trip deep-equaled live views for both `bet75` and `bet125`; stored exact-combo facts deep-equaled the live facts. The base retained22 explicitly unavailable structural views. This was a codec/consumer probe, not authoring or validating that spot's policy.

I then independently recomputed the full weighted river call-EV sign in Python `Fraction.from_float`, using the saved Float64 weights and the model's frozen net/call. For the known A-high checked-IP full class facing AsKs there were72 positive compatible opponent holdings,54 winning and6 tying for AsKs. Exact weighted equity was approximately0.1760659877683753; call cost41.32BB and frozen net200BB give EV approximately **−6.106802446324941BB**. The production helper also returned a strictly negative sign. The exact reduced EV fraction was `-65545704598704537901531090084273209 / 10733228260585012598055946780934144`. The serialized independent support/net/call/helper-result input has SHA-256 `3b564030ce086c006d45c22eda8188b3ed028433c349970fbc3dc7410c415c86`. Pooling fixes observational consistency; it does not make this call profitable or remove every raw logistic tail.

### 128-context exact-cache closure

I separately reviewed the bounded cache added after the initial version9 precision review. It touches a per-instance128-context LRU, deletes the evicted context's compiled/support/sign property, removes it on ordinary context eviction, and clears retained exact references on board release and actual river trimming. Rank score arrays remain shared. External context references no longer retain the exact-cache payload after those release operations. The arithmetic helper and policy bytes remain unchanged.

I independently verified all34 recorded files against `.local/hu-river-exact-cache-preflight/execution-receipt.json`, SHA-256 `73bc766be08eac7491ccc5d6aadcf67de512f5cf349f3c92d5e0a85d953d1b15`, using frozen model9 blobs for subsequently changed source files. No hash/size mismatch was found. The512-context×7-hero retention observations match, with exact caches512→128 and bounded trim/release leaving0. Post-GC heapUsed was25,385,744 versus22,507,648 bytes. Short-probe maximum RSS was141,344 versus153,884KiB, so this is not evidence that every RSS measure improves.

The official difficult-flop `5s5d4c` baseline/bounded reports independently compared byte-for-byte equal at SHA-256 `d1c05ac2d9bad63eca6961711b3ea00b65f242cee6e83f6103b994f06eac639b`, using unchanged10,000 samples per profile/seat and all six comparisons. This closes the bounded cache's requested model9 equivalence preflight, not a whole-run memory guarantee. Model10 adds observation metadata and changes the numerical inference tree, so its full-run resource behavior still requires fresh execution.

### Evidence scope and remaining execution

I checked the first model10 execution records against their actual log byte lengths and hashes. They show pure11/11, numeric7/7, floor/cache24/24 (including historical45 goldens), mounted hydration1/1 and typecheck exit0. The last saved consumer run at this review boundary was12/13 with one incomplete facing-facts fixture; the fixture correction, added pooled-cap copy test, Agent percentage correction and prompt tests were awaiting the parent's next rerun. Failed logs remain preserved. I have inspected the corrected code/test definitions, but do not relabel those old logs as passing the new files.

Required closure is the parent's corrected consumer/prompt execution and final checkpoint/source hashes, followed by the required complete checks and fresh representative12-board×6×10,000 simulation, official fixed-seed replay and1,755-flop audit with its declared sampled later coverage. The full observational/range model remains an AI estimate. Existing saved-call reach assumptions, coarse tiers, profile-range mismatch, inherited ceiling behavior and raw negative-call residuals remain explicit limitations for subsequent policy-quality review. Current policy acceptance remains separate from this implementation review.


## Representative v3 policy quality under model10, 2026-10-04 17:55 UTC

**Independent disposition: scoped acceptance of this one representative as an AI estimate. No further authored-policy revision is required by this review.** This conclusion follows review of the actual saved strategy, the fresh isolated numerical run, all 1,755 checkpoint rows, and a new independent effective-line probe. It is not inferred from zero audit errors alone. It accepts exactly `UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call` under the pinned model10 contract, with the quantitative limitations below. It is **1/407**, not approval of the remaining 406 spots, the legacy 45 reports, a final delivery archive/receipt, production publication, or the separate final UI gate. The rejected v4 remains uninstalled. No representative numeric table should be cloned into other spots.

The parent authorized this append after the isolated run and its guard ended. Only this original-repository review document and the separate ignored reviewer diagnostic were written. The isolated repository, pin, export manifest, policy bytes, numerical sources, and acceptance metadata were not changed by the reviewer. The isolated export still correctly says `numerical-complete-unapproved` / `review_approved:false`; a later final archive and acceptance receipt need independent binding to this decision.

### Exact accepted scope and evidence

- Source/range fingerprint: `a446af2ae12f4d68aa5810cd88912ebd95642462a8cf8e5e472df6c66d22e975`.
- Flop decision-table hash: `9070ca5074b6600eaeb1f1a20a03ce4bb2b40ecea457f8cd578fcec43e8a513a`; raw candidate file SHA-256 `c985e881ae3baab9f0cc54a164f7bb5b9b65802307bceaa4d91b90fb650113ed`.
- Later v3 decision-table hash: `c37c4091096867f53e9ec531220f5ff99c7f2a5364d7bc56283afaeca17333d6`; raw later file SHA-256 `317462f34ae7f451dcc9458b28a762b8aa1a51db0774028f9772983ce832b105`.
- Implementation checkpoint `91896ec7f09cc5292993cb952aa8df8d01381539`, tree `ff33f8664895706f26c127e53e26e0f157fdf2fc`; defence/action model10, simulation version3. The official replay identity is `06f17321645b2bc95ec6b378eb033dc3bbe5e12e31ab30ebc8be83b98cfeaa1c`.
- Isolated run: `.local/postflop-ai/serial-validation/runs/run-20261004T165546Z-fd2f72cb6fea4683b604402e48ce653d/`. Its `pin.json` SHA-256 is `73b2c961984c23019244c59c7bff2ebb96b6271b748eaba98f9f173ddd8851a2`; completed `export-manifest.json` SHA-256 is `d3a6525d25768875fc8998ca8e10c7ad94db49c09f21c68adb9e74890ba891ec`.
- Fresh simulation ran 16:55:46.939–17:12:43.520 UTC, actual exit0: 12 flops × 3 reference profiles × 2 seats × 10,000 paired deals, 72 comparisons / 720,000 paired deals. Report SHA-256 `80b657a069d8399a79b326d3322e86caac60b7c89d07c9a4e6f38dc0e8395581`.
- Official CLI replay ran 17:12:44.161–17:30:04.860 UTC, actual exit0: 19,936 expanded combo decisions, all 72 comparisons matched, 23 total advisories. Proof `audit-evidence/UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call-replay-1791133964508.json`, SHA-256 `1628e842da9bc08748e7d0c64017e1483d924601ea5980a208358eae6fd061ff`.
- Fresh all-board process ran 17:30:05.566–17:51:23.476 UTC, actual exit0, starting from `resume 0/1755`. All 1,755 flops evaluated, zero unreachable, 7,020 sampled turns and 21,060 sampled river runouts, zero errors, **zero clean boards**, 20,642 warning occurrences across 36 node/category keys. It is all canonical flops with deterministic sampled later runouts, not exhaustive enumeration of every turn, river, and private holding decision.
- All-board identity `16867bc8d681321acf544095d93bdb174357330105c54493094a2459e139046a`; summary SHA-256 `aceb751a2c27dcb0aabccdfe2f64e41b0f9af51723c6aec5815d26a39eb766b9`; companion SHA-256 `1dc4c95bc5a6037e94453f5119e174e2821a1530d07d561a7b1ac0aaec9e94fd`; actual serial all-board proof SHA-256 `3810d2ce8919e5c31b1efeb99dac75b05478d09933ccf2881e39474d5f0eb1f1`.

Paths for report/proofs above are inside the run's `repository/apps/frontend/.local/postflop-ai/`. All-board summary/companion filenames use the spot ID followed by `--16867bc8d681321acf544095d93bdb174357330105c54493094a2459e139046a`. The proof adds `-serial-run-20261004T165546Z-fd2f72cb6fea4683b604402e48ce653d-attempt-000001-all-boards.json`.

The reviewer independently verified 57 pinned runtime sources, 12 input files, and 25 handoff files in the isolated copy, then 230 recorded hash/size references including receipts and exports (repeated references included). There were no mismatches. The 69 original-repository runtime/input files also still matched the isolated pin after the probe. Both numeric policy hashes were recomputed from saved decision tables. The official replay start/end identities are identical. Every companion row's SHA-256 and 4-turn/12-river coverage matched; a separate Python enumeration over all 22,100 raw flops and 24 suit permutations reconstructed exactly the same 1,755 canonical classes with no missing or extra row. These checks corroborate the official writer/export; they do not replace the actual numerical execution.

### Actual strategy and range-based rationale

This remains a BB-squeeze / HJ-call pot of 29BB with 87BB effective stacks (SPR3). The saved range products, actors, and source fingerprint remain the previously independently reviewed ones. The decisions use public history, the actor's own cards, board features, and inferred ranges with card removal. They do not access the opponent's actual private cards. Author provenance remains the recorded native Astra/xhigh route after the CLI state failure; the raw files' earlier provisional-review wording is historical and is not rewritten to fabricate current approval.

The flop table has distinct OOP/IP decisions and shape × height behavior, including all twelve explicit monotone monster/strong overrides. The range-weighted current-model probe gives BB an approximately 49.71% bet frequency on As7d2c, mainly 33% pot (37.93% of range), versus 25.59% on low-connected 8s7d6c. HJ after a BB check bets approximately 34.23% and 63.99% respectively. On As7d2c, BB's strong-plus-monster share is 50.00%, while HJ has 65.48% medium hands; on 8s7d6c HJ has 21.43% monsters and 20.48% draws. These are concrete support for the different positional/height choices, rather than a generic assertion that the preflop aggressor owns every board.

On AhKh4h, BB checks 59.86% of its range and HJ checks 78.50%; on 9s7s3s those figures are 81.16% and 65.62%. The explicit low-monotone literals further slow BB's strong hands (77% check, only 4% bet75) while HJ's strong hands check55/bet33 32/bet75 12/bet125 1. The original overly aggressive height-only monotone fallback is not present. These frequencies are estimates, not measured optimal values.

Turn/river line overrides retain asymmetry: the previous OOP defender has nonzero donks for every tier, with total turn bets monster20/strong15/draw15/medium4/air3 and river bets monster20/strong15/medium3/air5. Checks preserve value support. IP checked-through river uses v3's one-small-size simplification; its raw monster/strong/medium/air totals are70/55/20/25, with flush-strong37. The model may cap these frequencies and may physically merge the nominal small bet on a low-SPR history. Those effects were measured at actual observable branches; neither a bet33 label nor a saved all-in label is treated as an independent size once the chip transitions coincide.

The policy's important remaining feature limitation is coarse made-hand strength. On KcKd4h, HJ 88 is a `monster` and receives check22/bet33 28/bet75 43/bet125 7, despite losing to any Kx. HJ's reached monster share there is 74.89%; it includes many pocket pairs, not merely trips/full houses. BB's monster share is77.12%. On 5s5d4c, HJ 88 similarly receives the low-height monster row. The same issue persists on later paired/trips boards: literal tier rules cannot individually select weak pocket-pair bluffs from strong hands in the same tier. Current caps/defence partly react through exact equities; they do not turn the authored betting policy into a fine-grained strategy. This is a material limitation for training/explanation and remains explicitly accepted only within the AI-estimate scope.

### Independent current-model effective-line check

Reviewer script `.local/reviewer-model10-policy-quality.mjs`, SHA-256 `09769021e2624267894b7c5a2f09a9711ca63c9c22542fdf53d72258ad1004bd`, dynamically imported the isolated runtime and read its pinned candidate pair. Output `.local/reviewer-model10-policy-quality.json`, SHA-256 `3121e5e0377514b46066a47426f27aa3f0e8fbb59a2d0a89d5996f8b8fb1c772`. It ran 17:52:51.190–17:52:52.303 UTC with `timeout 20s node --max-old-space-size=192`, actual exit0, measured1.113s, peak RSS222,076KiB. Its source identity matches the official replay identity. The first two reviewer attempts stopped immediately because of a missing array bracket and then an omitted required `base` argument in the probe. Only the ignored probe was corrected; neither failure was a production defect or a numerical pass. Node was fully stopped and the shared compute slot returned before further analysis.

Coverage: the seven previously diagnosed boards `7c5d5hTsQd`, `7c5d5h3c8s`, `7c5d5hTs6h`, `7c5d5hJh3h`, `Ac7d2h9hJd`, `2c2d2hAs9d`, `AcKc4c6s9c`; seven histories (flopCC/turnCC, flop33-call/turnCC, flopCC/turnOOP75-call, flopCC/turnIP75-call, flop33-call/turnOOP75-call, flop75-call/turnCC, flop125-call/turnCC); both river first-node roles. These are98 decisions, **168 distinct reached physical betting branches**, and16,068 defender observations. All observed exact call-EV signs were known. There were zero negative-EV floor promotions and zero mathematical-zero-equity call branches. Sixteen branches had zero equity-defined bluff share; this no longer forces zero-equity calls. This is a bounded first-bet diagnostic, not exhaustive river/raise-response proof. It also measured the 24 OOP/IP first decisions on the 12 simulation flops.

Three earlier failure examples now behave as follows:

| Exact line | Current observation | Residual and interpretation |
| --- | --- | --- |
| Ac7d2h9hJd, flop33-call / turnOOP75-call / riverOOPcheck / IP bet | All four saved bet labels pool into one41.32BB shove. Its reached frequency is37.7747%; equity-defined bluff share17.8655%; BB AsKs equity17.6066% against required20.66%. | AsKs calls18%, exactly its raw logistic mix; no floor addition. Its conditional model call EV remains−6.1068BB. Aggregate strictly negative call mass6.90175%, but more-than5-point negative-margin mass0.123571%. Achieved defence12.7345% versus nominal MDF74.4433%; this large shortfall is visible, not claimed balanced. |
| 7c5d5hJh3h, flop125-call / turnCC / OOP bet33 | Physical33.50BB bet remains below the merge threshold. Reached frequency22%, equity-defined bluffs2.26629%. | HJ88 retains call0.01% and legal raise0.30594%; earlier forced81.0853% calls are gone. Negative call mass0.0134452%, conditional aggregate call loss−0.00329015BB, defence8.02866% versus MDF75.1852%. Legal raises are intentionally preserved and are not certified optimal. |
| 7c5d5hTs6h, both streets checked / OOPcheck / IP bet33 | Physical9.57BB bet, reached frequency11.8397%, capped equity-defined bluff share20.9258%. | More-than5-point negative call mass0.797491%, all raw residual; defence58.4615% versus MDF75.1880%. AcKc has positive model call EV+1.85858BB and retains the legitimate100% promoted call. |

The flush cases also close the earlier dominated-call failure: AcKc4c6s9c checked OOP bet33 has no negative or zero-equity call mass; after flop33-call/turn75-call the OOP observed shove has no zero-equity calls and only0.0490913% more-than5-point negative call mass. No vanishing/tiny-positive bluff exception is being used: signs are exact against all positive compatible support under the already reviewed frozen-Float64 net-pot contract.

**Raw negative-EV calls remain.** There are144 of168 sampled branches with some strictly negative call mass, frequently near the break-even boundary. The largest total such mass is38.9239% at 7c5d5h3c8s, flop125-call/turnCC/IPbet33; its conditional weighted loss is−0.230331BB, and only0.0978261% of the defender range both calls and is more than5 equity points below requirement. The largest more-than5-point call mass is2.54115% on AcKc4c6s9c, flop125-call/turnCC/IPbet33, reached betting frequency43.3179%, conditional weighted call loss−0.267116BB. The largest conditional negative-call loss in the sampled grid is−0.619136BB at 2c2d2hAs9d, flop33-call/turn75-call/OOPshove; negative call mass10.7887%, with no more-than5-point subset. These are defender-own-reach conditional diagnostics, not joint hand EV, BB/100, or exploitability. Reporting only the zero-floor result would hide these residuals.

The scope deliberately retains raw logistic calls, legal raises, per-label caps, and the original floor allocation. Altering those to remove every negative tail would be another model objective, not an individual numeric-policy repair. Five sampled pooled classes have cap-reduction provenance yet remain more than one point below their nominal bluff target. This matches the reviewed cap-after-label-pooling contract: `capped` means actual bluff mass was removed, not that the aggregate pool is exactly saturated. Three sampled branches use a ceiling; no claim is made that caps enforce a single blocker-invariant ratio for every defender.

### All-board warnings: occurrence, region, and meaning

The companion was aggregated independently. The historical summary field named `boards` counts repeated warning occurrences, so it must not be presented as a distinct-board count:

| Warning family | Occurrences | Distinct canonical flops |
| --- | ---: | ---: |
| River air-tier ratio below size target |7100|1755|
| River defence more than15 points below nominal MDF |10019|1755|
| Raises have very little non-monster tier weight |2067|390|
| Flop/turn non-monster defence above the heuristic target |1456|691|

OOP river air warnings are3734 occurrences on1727 flops; IP3366 on1755. IPvs33 and IPvsallin overfold each occur on every1755 flop; IPvs75 on1754, IPvs125 on1650, OOPvs33 on1577, OOPvsallin on1528. These are genuine measurements of the specified diagnostic, not evidence of10,019 distinct bad calls or all-in failures. The exact negative-EV exception intentionally allows achieved MDF shortfalls against the assumed underbluffed range; it provides no defence guarantee against a differently bluffing real opponent.

Every shape/height region is represented:

| Region | Canonical flops | Air-under occurrences | MDF-shortfall occurrences | Raise-tier occurrences | Overcall occurrences |
| --- | ---: | ---: | ---: | ---: | ---: |
| paired low |91|421|477|412|105|
| paired mid |99|467|526|525|167|
| paired high |135|667|665|1019|193|
| monotone low |35|120|208|0|4|
| monotone mid |85|270|508|1|4|
| monotone high |166|742|975|4|186|
| wet low |127|352|757|0|68|
| wet mid |273|827|1620|4|35|
| wet high |516|2350|2945|67|608|
| dry low |13|39|78|0|0|
| dry mid |67|198|396|1|11|
| dry high |148|647|864|34|75|

The air-ratio check uses `handTier === air`, whereas the cap/defence value-bluff split uses equity against the reached opponent range. They are different quantities. For example, paired 7c5d5hTs6h checked-IP bet33 has zero air-tier share but20.9258% equity-defined bluffs. Thus7100 air warnings cannot be relabelled7100 verified underbluffs. Conversely, the Jh3h example really has only2.26629% equity-defined bluff share; coarse-tier selection and a narrow earlier-call range explain a real value-heavy branch. The reviewer does not dismiss all underbluffing as a naming artifact.

The raise-tier metric is also coarse:1956/2067 occurrences lie on paired flops, where pocket pairs can all be `monster`. It does not establish that every such raise is near-nut value or that adding an arbitrary air raise is desirable. Flop/turn overcall warnings compare aggregate tier-filtered defence to a minimum-defence heuristic, not exact action EV; draws, range strength, realization approximations, and legal raise shares matter. They remain quality caveats. No unsupported universal claim of “all warnings harmless” is made; rather, the measured definitions, concentration, prior defects, and current effective probes do not establish a new blocking authored mistake at this acceptance scope.

### Reference comparisons and acceptance limits

Twelve of72 simulation comparisons have materially below-reference deltas: BB on AhKh4h, KcKd4h, 8c8d2h, and5s5d4c against all three profiles. Worst is KcKd4h/aggressive: candidate **+44.0557BB**, baseline+60.3081BB, difference−16.2524BB with paired95% CI[−17.3177,−15.1870]. The deficit is substantial within this experiment and cannot be explained away as sampling noise. It is not a−16BB absolute candidate return. These are conditional postflop values including the existing pot.

As in the previously reviewed simulation design, only the candidate hero receives computed defence/caps; reference opponents and the baseline hero use fixed tier profiles. Candidate inference still forms both seats' reach from the saved candidate strategy; it does not fit the actual standard/passive/aggressive reference policy. Earlier saved call/fold frequencies also continue to influence later assumed reach, even where a computed live response differs. These are material limitations on model calibration and attribution. Paired-tier weakness and reference-specific value extraction are plausible contributors, not proven decompositions. The descriptive model6-versus10 report is not used as causal proof or as a substitute acceptance gate. Optimizing the authored strategy merely to win this fixed-bot comparator would not establish general quality.

This single candidate has passed its required fresh simulation, strict replay, and canonical-flop gates and has received independent strategy review. The remaining weaknesses are explicit estimate/model tradeoffs: coarse board-made tiers; unsaturated value-heavy branches; raw negative-EV tails and retained legal raises; lower achieved MDF versus the assumed range; and reference/reach mismatch. They do not warrant another blanket size suppression or a manufactured token bluff. A later targeted revision should require a concrete reachable decision, exact current ranges/chips, an action-level defect beyond these declared heuristics, and held-out validation that the change improves the intended behavior without moving exposure elsewhere. Any changed policy, source-range fingerprint, action/defence contract, or numerical runtime identity requires a new scoped review and fresh applicable gates. The other406 policies each require their own authoring and evidence.

Finally, the previously fixed implementation P2 follow-ups are now executed: `consumer-ui-3.log`14/14 (SHA-256 `4e0e924a72d381d6fe48ac2b841ade3b6e9dc75ad0f3d62ffa21a2ab80d1307f`), `prompt-1.log`2/2 (`9cd538c7fdb1ba9e0b5f78e193a1e135325156801928c6d4754f4c8e1bd12232`), and `affected-consumers-1.log`92/92, skip0 (`08f0b3e04304921650c7abfeb0347e8af32aa02b82b85982fd83dda0640194cf`) were independently read. Those checks support the corrected implementation; they are separate from this policy-quality decision and the still-separate final UI/delivery/publication gates.
