# HU postflop after multiway preflop: implementation results

Status: work in progress. This is not a release approval.

## Current checkpoint — 2026-10-04 13:56 UTC

- Draft PR [#41](https://github.com/Suuu-sh/ReysonAI/pull/41) preserves the initial implementation at commit `0c48dd03bca2d1de7c3178f5e0dffa7990af0a74`, based on frozen development `50bae3bc`. All 90 changed blobs and tree `d15d45ede6913d60ab906f75b7d6b062403cd413` match the local checkpoint. The subsequent six-file `b5e20e47` release/receipt repair is being reconciled once because it directly overlaps the required gate; unrelated upstream behavior is retained.
- Coverage is still **407 defined / 5 authored / 0 finally accepted / 402 not authored**. Stage A137 and B270 are not complete. Historical audit success below must not be read as current-model or strategic acceptance.
- The explicitly approved, new-HU-only river exception is now defence version8. It proves mathematical zero using nonempty, compatible, positive-weight bettor support and integer showdown ranks. Any actual win/tie prevents exemption, even if cached equity rounds to zero. Raw mixes, legal raises, original floor allocation, nonriver behavior and all45 legacy goldens remain unchanged. An independent Astra review accepted this scoped implementation after 11 new regressions, 27 existing regressions and two98-decision matrices. Zero-call branches fell26→0 for v3 and4→0 for the uninstalled v4; all34,525 genuinely positive-support observations were unchanged, with44,519 live view-combo comparisons passing.
- Version8 invalidates the representative's old version6 report and all old code-bound numerical evidence. New simulation, independent replay and all1755 boards remain mandatory. The broad v4 small-sizing proposal is not installed: a separate exposure comparison found a negative-margin-call regression. The existing v3 bytes plus model8 are being reassessed before selecting any further policy changes.
- Both LFS objects are saved and independently re-downloaded with exact hashes: the441,204-byte legacy ZIP `5f5dd88540c00ce7426146b91b1fd9c0cc10974b146ba02a175cc067395e7b0a` and127,590-byte unapproved foundation `e74de8b1cfb9349d20f0e328c6d7c3f36220c0ec533eae1b01e1f6635cca45fe`. The latter has no acceptance receipt. Git contains pointers/manifests, not expanded generated policies.
- Real Mac Range operation reached river/Showdown but exposed a reload/direct-URL loss. The account/profile hydration race was reproduced in the actual ProductApp and repaired. The first56-test checkpoint passed independent UI review and was sent for authorized Mac re-QA. Further mounted coverage reproduced a same-owner account-data retry whose intermediate ready=false render was batched away. The profile effect now observes the stable account snapshot notification;17 mounted,26 account/URL/route and19 estimated-UI assertions pass, plus typecheck. The estimated-UI file initially failed before assertions with an unspecified child failure; a complete isolated rerun passed in5.08 seconds with heap384/young8, without removing assertions. Final browser confirmation remains pending.
- Ordinary Agent domain replay reaches river/Showdown on both the old Mac model6 and new model8 with seed `hu-qa-2097`, HJ AhQs: call2.5, call10.5, flop6d3s7c call9.57, turnKs call36.11, river4h check. This proves one natural path; it does not expand the existing no-multiway rule or claim407 gameplay paths.
- All18 current D1 migration schemas, ranked trigger execution and valid preservation fixtures pass isolated SQLite regressions. The real Miniflare18-table update/API/rollback/restart proof is waiting for a fresh version8 report; its freshness gate is not bypassed. Full frontend693/694-pass evidence below belongs to the earlier checkpoint and must be rerun for the final revision.
- Required preflop source reconciliation now passes all five complete canonical phases, official restore/verify/check-bundle and9 receipt/archive tests. The exact upstream `b5e20e47` renewal, original strategy review and prior3 amendments are preserved; a fourth narrow source-only amendment covers the current89 records. Receipt SHA256 is `82f1013326aacbf5064c543b747c53af533a6003c496f9d2def026e3c0cd7b8e`; SQL remains68,705,643 bytes with the original hash. Exact-head strict Actions D1 delivery remains pending.

The remaining sections retain dated implementation and investigation history. Where an older section says a report is fresh, a handoff is pending, or an archive is not uploaded, this current checkpoint takes precedence.

## Scope and baseline

- Implementation started from `development` commit `33574ad6bf08f5e99e73b46eacd4a874a639e1c9`. The current publication base is `61e457f4e35d8e28b2476b304a118b89dbf4be1f`. Four upstream specification changes and the subsequently merged native-auth/runtime-config PRs are preserved exactly; the isolated local base tree matches GitHub tree `1387907dae53f1f63c09f3ac200641726f17b267`.
- The bounded preflop catalog has 525 non-all-in, two-player flop endings: 407 have saved support and a compatible participant deal; 118 are impossible.
- Stage A: 137 paths (32 one-caller squeeze endings, 40 cold-four-bet endings, 45 two-caller squeeze endings, 20 cold-three-bet-call endings). Stage B: 270 subsequent four-bet endings. Every five-bet is 100 BB all-in, so there is no non-all-in five-bet postflop path.
- Only 52 Stage A paths use Stage 1 files alone. The other 85 Stage A paths require reviewed Stage 2 responses. The scope follows the requested path families, rather than pretending all Stage A data predates Stage 2.
- All 407 supported definitions and exact saved-action products are implemented. Each policy pair is authored and reviewed separately; a definition does not mean its policy is already authored, audited or published.
- Existing 45 reachable HU input fingerprints remain identical to the pinned baseline fixture. Existing preflop strategy files are not edited.

## Current acceptance evidence

- Representative `UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call`: pot 29 BB, remaining 87 BB, BB OOP leads. Current revision 3 has a fresh 12-board, 72-comparison, 720,000-paired-deal simulation. Its separate official fixed-seed CLI audit passed on 2026-10-04 11:23:15 UTC after 580.355 seconds: 19,936 expanded combo decisions, 72 comparisons, 18 advisories. Complete start/end identity covers 47 transitive sources and 12 inputs. Independent review confirmed every bound byte. Revision 3 all-board auditing completed at 11:41:26 UTC: 1,755 evaluated, zero unreachable/errors, 7,020 sampled turns, 21,060 sampled rivers, one warning-free flop and 14,401 warning occurrences in 36 categories. Its exact 1,755-row companion is independently verified. Broader strategic probes still reject final acceptance as described below.
- Representative revision 2 all-board command exited 0 on 2026-10-04 10:07:25 UTC after 1,137 seconds: 1,755/1,755 flops evaluated, 0 unreachable, 7,020 sampled turns and 21,060 sampled river runouts, error 0. It produced 15214 warning occurrences across 35 categories. Complete source-bound companion verification passed. Independent strategic probes subsequently found the river P2 below, so this revision is historical evidence and is not accepted for publication.
- Five new policy pairs have passed independent, individual foundation review. Four still need full simulation/fixed-seed/all-board acceptance; the representative has completed current numerical checks but is held by additional independent strategic findings. The other 402 pairs have not been authored. Stage A is not complete.
- Focused tests cover 407 Node/browser input projections, every saved action product, exact chip geometry, legacy 45 fingerprints, low-SPR legal-action consistency across view/explanation/simulation, source mutation rejection, impossible turn/river rejection, reduced-board report loading, cache invalidation and spot-scoped SQL preservation.
- The continuation UI passes all 4,200 structural terminal URL/action-strip round trips and all 407 supported HU terminal mappings. Independent review findings in source validation, retry recovery and four-language fact labels were corrected and rechecked.
- The isolated production build, Sites checks and repaired resource-heavy test files pass. The final aggregate suite awaits the independently reviewed preflop source-receipt reconciliation. Real browser acceptance and the inherited historical-report audit mismatch remain open. Workloads are serialized, with bounded workers and deterministic checkpoints.

## Agent table and range workspace coverage

- Range workspace: all 407 cataloged paths have exact saved-source navigation, current participant ranges, deep continuations, rewind/reset and URL/session persistence. Missing or impossible data stays unavailable.
- Agent mapping: all 407 recorded histories resolve correctly. The existing table rule that forbids a call making a third live participant remains unchanged. Under that rule,68 paths are naturally selectable (Stage A 36, Stage B 32);339 are blocked by that pre-existing rule. This is not 407-path Agent gameplay verification.
- The requested UTG/HJ/BB representative is naturally selectable in Agent play. Browser verification through the river is still pending.
- Policies missing from an installation remain missing; another spot or a test reference policy is never installed as a runtime substitute.

## Correctness and delivery changes

- Dead chips from folded participants are retained. Their unknown cards are not removed from the postflop deck. Both live ranges multiply every saved action frequency in the exact history.
- Current source actors, incoming sizes, chosen raise-to sizes, commitments and final pot/stacks are checked before authoring. Changing a saved source size cannot silently produce a fresh policy with stale geometry.
- A merged all-in is normalized before the computed call/fold split at the shared defence boundary. Views, explanations and simulation agree; older cached flop views are invalidated by base generator version 7 without changing legacy policy/input hashes.
- AA-only supports can make otherwise valid board cards impossible. Live-pair compatibility is checked on flop, turn and river; no fallback strategy is supplied on an impossible board.
- Postflop SQL updates only explicitly supplied spots. Unmentioned policies/reports/reasons survive. Empty publication makes no changes; each new patch gets a unique cache revision. Report freshness includes defence/later/sizing/seed/sample/comparison completeness.
- Legacy read-only previews retain their existing hash/spot/report matching contract and label historical reports explicitly. New-history previews and publication still require the strict current report gate; no historical report is upgraded.
- New policy artifacts remain under ignored `.local/postflop-ai`. Deterministic, hash-verified Git LFS archive and exact-evidence verification tooling is implemented and independently reviewed, with explicit coverage and separate independent acceptance. The first new-policy archive has not yet been fixed/uploaded. Expanded strategy JSON is not a normal-Git deliverable. No production import/deployment has run.

## Baseline data and known blockers

- Public API retrieval from this cloud was blocked/timed out. The authorized read-only Mac transfer recovered all 45 legacy candidate/later/report sets. ZIP SHA256: `5f5dd88540c00ce7426146b91b1fd9c0cc10974b146ba02a175cc067395e7b0a`. All 135 raw file hashes, both policy/report identities and all 45 baseline input fingerprints match. Three earlier BTN canonical files were semantically identical and kept in place; their exact recovered originals remain in the separate immutable archive.
- `artifacts/postflop/legacy-hu45-source.zip` and its hash manifest preserve that source independently of new candidates. All 45 reports retain defence version 5; the unmodified development baseline already uses version 6. Historical byte preservation is verified, but it is not current-code audit PASS. No legacy policy/report was regenerated or relabeled.
- The baseline preflop receipt already mismatched the workflow-only retry fix in commit `a18365fbeaef70f970a7a374b3d201885e6b05df`. The fix changed artifact naming/overwrite behavior, not strategies. Its gate must be reconciled through independent review, not bypassed. This feature also changes source files bound by that receipt and requires a final reviewed source reconciliation.

## New reachable path inventory

Reach values are seeded estimates from the known participants' saved action-frequency products, corrected for hole-card collisions (32,768 draws). Outside forced folds are unweighted. They are ranking estimates, not solver reach probabilities. All Stage A paths precede Stage B; each stage is ordered by this estimate.

| Stage | ID / complete action history | Pot BB | Stack BB | Tree | Estimated reach % | Current local artifacts |
|---|---|---:|---:|---|---:|---|
| A | `BTN_open_SB_3bet_BB_call_BTN_fold` | 26.5 | 88 | oop_leads | 0.30675851 | flop, later |
| A | `CO_open_SB_3bet_BB_call_CO_fold` | 26.5 | 88 | oop_leads | 0.087334664 | not authored |
| A | `CO_open_BTN_call_BB_squeeze_CO_fold_BTN_call` | 29 | 87 | oop_leads | 0.057605599 | not authored |
| A | `CO_open_BTN_call_SB_squeeze_CO_fold_BTN_call` | 29.5 | 87 | oop_leads | 0.052918713 | not authored |
| A | `CO_open_BTN_3bet_BB_call_CO_fold` | 19 | 92 | oop_checks | 0.04740747 | not authored |
| A | `CO_open_BTN_3bet_SB_call_CO_fold` | 19.5 | 92 | oop_checks | 0.034869673 | not authored |
| A | `HJ_open_BTN_call_BB_squeeze_HJ_fold_BTN_call` | 29 | 87 | oop_leads | 0.032456431 | not authored |
| A | `BTN_open_SB_3bet_BB_4bet_BTN_fold_SB_call` | 54.5 | 74 | oop_checks | 0.030454722 | flop, later |
| A | `CO_open_BTN_call_BB_squeeze_CO_call_BTN_fold` | 29 | 87 | oop_leads | 0.0272517 | flop, later |
| A | `HJ_open_CO_3bet_BTN_call_HJ_fold` | 20 | 92 | oop_leads | 0.026638349 | not authored |
| A | `HJ_open_CO_call_BB_squeeze_HJ_fold_CO_call` | 29 | 87 | oop_leads | 0.025069337 | not authored |
| A | `HJ_open_BTN_call_SB_squeeze_HJ_fold_BTN_call` | 29.5 | 87 | oop_leads | 0.024922365 | not authored |
| A | `CO_open_BTN_call_SB_squeeze_CO_call_BTN_fold` | 29.5 | 87 | oop_leads | 0.023486434 | not authored |
| A | `HJ_open_SB_3bet_BB_call_HJ_fold` | 26.5 | 88 | oop_leads | 0.022860763 | not authored |
| A | `HJ_open_CO_call_SB_squeeze_HJ_fold_CO_call` | 29.5 | 87 | oop_leads | 0.020946301 | not authored |
| A | `HJ_open_CO_3bet_BB_call_HJ_fold` | 19 | 92 | oop_checks | 0.012943561 | not authored |
| A | `HJ_open_BTN_3bet_BB_call_HJ_fold` | 19 | 92 | oop_checks | 0.012745619 | not authored |
| A | `UTG_open_BTN_call_BB_squeeze_UTG_fold_BTN_call` | 29 | 87 | oop_leads | 0.012224829 | not authored |
| A | `HJ_open_BTN_call_BB_squeeze_HJ_call_BTN_fold` | 29 | 87 | oop_leads | 0.012172625 | not authored |
| A | `HJ_open_CO_call_BTN_squeeze_HJ_fold_CO_call` | 28 | 88 | oop_checks | 0.011189186 | not authored |
| A | `UTG_open_CO_call_BB_squeeze_UTG_fold_CO_call` | 29 | 87 | oop_leads | 0.010534231 | not authored |
| A | `UTG_open_HJ_3bet_BTN_call_UTG_fold` | 20 | 92 | oop_leads | 0.010446138 | not authored |
| A | `UTG_open_HJ_3bet_CO_call_UTG_fold` | 20 | 92 | oop_leads | 0.010413668 | not authored |
| A | `UTG_open_CO_3bet_BTN_call_UTG_fold` | 20 | 92 | oop_leads | 0.010050517 | not authored |
| A | `UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call` | 29 | 87 | oop_leads | 0.0097500141 | flop, later, simulation |
| A | `HJ_open_CO_3bet_SB_call_HJ_fold` | 19.5 | 92 | oop_checks | 0.0097066669 | not authored |
| A | `HJ_open_BTN_3bet_SB_call_HJ_fold` | 19.5 | 92 | oop_checks | 0.0095411891 | not authored |
| A | `UTG_open_BTN_call_SB_squeeze_UTG_fold_BTN_call` | 29.5 | 87 | oop_leads | 0.0094613216 | not authored |
| A | `HJ_open_CO_call_BB_squeeze_HJ_call_CO_fold` | 29 | 87 | oop_leads | 0.0089931531 | not authored |
| A | `CO_open_SB_3bet_BB_4bet_CO_fold_SB_call` | 54.5 | 74 | oop_checks | 0.0089448306 | not authored |
| A | `UTG_open_CO_call_SB_squeeze_UTG_fold_CO_call` | 29.5 | 87 | oop_leads | 0.0079653623 | not authored |
| A | `CO_open_BTN_3bet_SB_4bet_CO_fold_BTN_call` | 43.5 | 80 | oop_leads | 0.0075374307 | not authored |
| A | `UTG_open_HJ_call_SB_squeeze_UTG_fold_HJ_call` | 29.5 | 87 | oop_leads | 0.0072700286 | not authored |
| A | `UTG_open_SB_3bet_BB_call_UTG_fold` | 26.5 | 88 | oop_leads | 0.0072613803 | not authored |
| A | `CO_open_BTN_3bet_BB_4bet_CO_fold_BTN_call` | 43 | 80 | oop_leads | 0.0068922839 | not authored |
| A | `HJ_open_BTN_call_SB_squeeze_HJ_call_BTN_fold` | 29.5 | 87 | oop_leads | 0.0064128047 | not authored |
| A | `UTG_open_BTN_3bet_BB_call_UTG_fold` | 19 | 92 | oop_checks | 0.0063005894 | not authored |
| A | `HJ_open_SB_3bet_BB_4bet_HJ_fold_SB_call` | 54.5 | 74 | oop_checks | 0.0044352647 | not authored |
| A | `UTG_open_BTN_call_BB_squeeze_UTG_call_BTN_fold` | 29 | 87 | oop_leads | 0.0040473364 | not authored |
| A | `HJ_open_CO_call_SB_squeeze_HJ_call_CO_fold` | 29.5 | 87 | oop_leads | 0.0038316075 | not authored |
| A | `HJ_open_CO_3bet_BB_4bet_HJ_fold_CO_call` | 43 | 80 | oop_leads | 0.0037760022 | not authored |
| A | `HJ_open_CO_3bet_SB_4bet_HJ_fold_CO_call` | 43.5 | 80 | oop_leads | 0.0037605123 | not authored |
| A | `UTG_open_HJ_3bet_BB_call_UTG_fold` | 19 | 92 | oop_checks | 0.0037432673 | not authored |
| A | `UTG_open_HJ_3bet_SB_call_UTG_fold` | 19.5 | 92 | oop_checks | 0.0037368248 | not authored |
| A | `UTG_open_CO_3bet_BB_call_UTG_fold` | 19 | 92 | oop_checks | 0.0036456761 | not authored |
| A | `UTG_open_CO_3bet_SB_call_UTG_fold` | 19.5 | 92 | oop_checks | 0.0036112962 | not authored |
| A | `UTG_open_BTN_3bet_SB_call_UTG_fold` | 19.5 | 92 | oop_checks | 0.0035765483 | not authored |
| A | `HJ_open_BTN_3bet_SB_4bet_HJ_fold_BTN_call` | 43.5 | 80 | oop_leads | 0.0035399996 | not authored |
| A | `HJ_open_BTN_3bet_BB_4bet_HJ_fold_BTN_call` | 43 | 80 | oop_leads | 0.0035282956 | not authored |
| A | `UTG_open_BTN_call_SB_squeeze_UTG_call_BTN_fold` | 29.5 | 87 | oop_leads | 0.0033319869 | not authored |
| A | `UTG_open_CO_call_BB_squeeze_UTG_call_CO_fold` | 29 | 87 | oop_leads | 0.0030425142 | not authored |
| A | `HJ_open_CO_call_BTN_squeeze_HJ_call_CO_fold` | 28 | 88 | oop_checks | 0.0027206899 | not authored |
| A | `BTN_open_SB_3bet_BB_4bet_BTN_call_SB_fold` | 64 | 74 | oop_leads | 0.002365517 | not authored |
| A | `UTG_open_SB_3bet_BB_4bet_UTG_fold_SB_call` | 54.5 | 74 | oop_checks | 0.0023511816 | not authored |
| A | `UTG_open_CO_call_BTN_squeeze_UTG_fold_CO_call` | 28 | 88 | oop_checks | 0.0022359186 | not authored |
| A | `UTG_open_HJ_3bet_BB_4bet_UTG_fold_HJ_call` | 43 | 80 | oop_leads | 0.0020804429 | not authored |
| A | `UTG_open_HJ_3bet_SB_4bet_UTG_fold_HJ_call` | 43.5 | 80 | oop_leads | 0.0020690685 | not authored |
| A | `UTG_open_HJ_call_BB_squeeze_UTG_call_HJ_fold` | 29 | 87 | oop_leads | 0.0020108853 | not authored |
| A | `UTG_open_CO_3bet_BB_4bet_UTG_fold_CO_call` | 43 | 80 | oop_leads | 0.0019302909 | not authored |
| A | `UTG_open_CO_3bet_SB_4bet_UTG_fold_CO_call` | 43.5 | 80 | oop_leads | 0.0019023444 | not authored |
| A | `UTG_open_BTN_3bet_BB_4bet_UTG_fold_BTN_call` | 43 | 80 | oop_leads | 0.0017941606 | not authored |
| A | `UTG_open_HJ_call_CO_squeeze_UTG_fold_HJ_call` | 28 | 88 | oop_checks | 0.0017937111 | not authored |
| A | `UTG_open_BTN_3bet_SB_4bet_UTG_fold_BTN_call` | 43.5 | 80 | oop_leads | 0.0017836575 | not authored |
| A | `UTG_open_HJ_call_BTN_squeeze_UTG_fold_HJ_call` | 28 | 88 | oop_checks | 0.0017784251 | not authored |
| A | `HJ_open_CO_3bet_BTN_4bet_HJ_fold_CO_call` | 56 | 74 | oop_checks | 0.001493762 | not authored |
| A | `UTG_open_CO_call_SB_squeeze_UTG_call_CO_fold` | 29.5 | 87 | oop_leads | 0.0013371485 | not authored |
| A | `CO_open_SB_3bet_BB_4bet_CO_call_SB_fold` | 64 | 74 | oop_leads | 0.0012968629 | not authored |
| A | `UTG_open_HJ_call_SB_squeeze_UTG_call_HJ_fold` | 29.5 | 87 | oop_leads | 0.0011241971 | not authored |
| A | `UTG_open_HJ_3bet_CO_4bet_UTG_fold_HJ_call` | 56 | 74 | oop_checks | 0.00092824483 | not authored |
| A | `UTG_open_HJ_call_BTN_squeeze_UTG_call_HJ_fold` | 28 | 88 | oop_checks | 0.00092349076 | not authored |
| A | `UTG_open_HJ_call_CO_squeeze_UTG_call_HJ_fold` | 28 | 88 | oop_checks | 0.00090831755 | not authored |
| A | `UTG_open_HJ_3bet_BTN_4bet_UTG_fold_HJ_call` | 56 | 74 | oop_checks | 0.00080884581 | not authored |
| A | `UTG_open_CO_call_BTN_squeeze_UTG_call_CO_fold` | 28 | 88 | oop_checks | 0.00080760223 | not authored |
| A | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_fold_CO_fold_BTN_call` | 36.5 | 84.5 | oop_leads | 0.00057446936 | flop, later |
| A | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_fold_CO_fold_BTN_call` | 37 | 84.5 | oop_leads | 0.00053257827 | not authored |
| A | `UTG_open_CO_3bet_BTN_4bet_UTG_fold_CO_call` | 56 | 74 | oop_checks | 0.00042111094 | not authored |
| A | `CO_open_BTN_3bet_BB_4bet_CO_call_BTN_fold` | 48.5 | 80 | oop_leads | 0.0002907611 | not authored |
| A | `CO_open_BTN_3bet_SB_4bet_CO_call_BTN_fold` | 49 | 80 | oop_leads | 0.00028741862 | not authored |
| A | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_fold_CO_fold_BTN_call` | 37 | 84.5 | oop_leads | 0.00020237222 | not authored |
| A | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_fold_CO_fold_BTN_call` | 36.5 | 84.5 | oop_leads | 0.00019893145 | not authored |
| A | `HJ_open_SB_3bet_BB_4bet_HJ_call_SB_fold` | 64 | 74 | oop_leads | 0.00019484034 | not authored |
| A | `CO_open_BTN_call_SB_call_BB_squeeze_CO_fold_BTN_fold_SB_call` | 36 | 84.5 | oop_checks | 0.00018823587 | not authored |
| A | `HJ_open_CO_3bet_BB_4bet_HJ_call_CO_fold` | 48.5 | 80 | oop_leads | 0.00017387472 | not authored |
| A | `HJ_open_CO_3bet_SB_4bet_HJ_call_CO_fold` | 49 | 80 | oop_leads | 0.00017281891 | not authored |
| A | `HJ_open_BTN_3bet_SB_4bet_HJ_call_BTN_fold` | 49 | 80 | oop_leads | 0.00017163058 | not authored |
| A | `HJ_open_BTN_3bet_BB_4bet_HJ_call_BTN_fold` | 48.5 | 80 | oop_leads | 0.00017109739 | not authored |
| A | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_fold_HJ_fold_BTN_call` | 37 | 84.5 | oop_leads | 0.00016540189 | not authored |
| A | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_fold_HJ_fold_BTN_call` | 36.5 | 84.5 | oop_leads | 0.00016456895 | not authored |
| A | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_fold_HJ_fold_CO_call` | 36.5 | 84.5 | oop_leads | 0.00013149379 | not authored |
| A | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_fold_HJ_fold_CO_call` | 37 | 84.5 | oop_leads | 0.0001314548 | not authored |
| A | `UTG_open_HJ_3bet_SB_4bet_UTG_call_HJ_fold` | 49 | 80 | oop_leads | 0.00012555129 | not authored |
| A | `UTG_open_BTN_3bet_SB_4bet_UTG_call_BTN_fold` | 49 | 80 | oop_leads | 0.00012466926 | not authored |
| A | `UTG_open_CO_3bet_SB_4bet_UTG_call_CO_fold` | 49 | 80 | oop_leads | 0.00011891635 | not authored |
| A | `UTG_open_SB_3bet_BB_4bet_UTG_call_SB_fold` | 64 | 74 | oop_leads | 0.0001099114 | not authored |
| A | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_fold_HJ_fold_CO_call` | 35.5 | 85.5 | oop_checks | 8.8627685e-05 | not authored |
| A | `UTG_open_HJ_3bet_BB_4bet_UTG_call_HJ_fold` | 48.5 | 80 | oop_leads | 8.8138385e-05 | not authored |
| A | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_fold_CO_fold_SB_call` | 36 | 84.5 | oop_checks | 8.6617223e-05 | not authored |
| A | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_fold_BTN_fold_SB_call` | 36 | 84.5 | oop_checks | 8.6224817e-05 | not authored |
| A | `UTG_open_BTN_3bet_BB_4bet_UTG_call_BTN_fold` | 48.5 | 80 | oop_leads | 8.5377498e-05 | not authored |
| A | `UTG_open_CO_3bet_BB_4bet_UTG_call_CO_fold` | 48.5 | 80 | oop_leads | 8.4916627e-05 | not authored |
| A | `HJ_open_CO_3bet_BTN_4bet_HJ_call_CO_fold` | 61.5 | 74 | oop_checks | 4.9236812e-05 | not authored |
| A | `UTG_open_HJ_3bet_BTN_4bet_UTG_call_HJ_fold` | 61.5 | 74 | oop_checks | 3.5799412e-05 | not authored |
| A | `UTG_open_HJ_3bet_CO_4bet_UTG_call_HJ_fold` | 61.5 | 74 | oop_checks | 3.5205939e-05 | not authored |
| A | `UTG_open_CO_3bet_BTN_4bet_UTG_call_CO_fold` | 61.5 | 74 | oop_checks | 3.4479755e-05 | not authored |
| A | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_fold_BTN_fold_SB_call` | 36 | 84.5 | oop_checks | 2.6380621e-05 | not authored |
| A | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_fold_CO_fold_SB_call` | 36 | 84.5 | oop_checks | 1.9491225e-05 | not authored |
| A | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_fold_HJ_fold_SB_call` | 36 | 84.5 | oop_checks | 1.7001414e-05 | not authored |
| A | `CO_open_BTN_call_SB_call_BB_squeeze_CO_fold_BTN_call_SB_fold` | 36 | 84.5 | oop_leads | 7.949172e-06 | not authored |
| A | `CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_fold_SB_fold` | 36 | 84.5 | oop_leads | 4.7193126e-06 | not authored |
| A | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_call_CO_fold_BTN_fold` | 36.5 | 84.5 | oop_leads | 3.3895432e-06 | not authored |
| A | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_call_CO_fold_BTN_fold` | 37 | 84.5 | oop_leads | 3.1650359e-06 | not authored |
| A | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_call_BTN_fold_SB_fold` | 36 | 84.5 | oop_leads | 3.0043685e-06 | not authored |
| A | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_fold_CO_call_BTN_fold` | 36.5 | 84.5 | oop_leads | 2.9457513e-06 | not authored |
| A | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_fold_CO_call_BTN_fold` | 37 | 84.5 | oop_leads | 2.7461338e-06 | not authored |
| A | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_fold_BTN_call_SB_fold` | 36 | 84.5 | oop_leads | 1.8468428e-06 | not authored |
| A | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_call_CO_fold_SB_fold` | 36 | 84.5 | oop_leads | 1.7765788e-06 | not authored |
| A | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_call_CO_fold_BTN_fold` | 36.5 | 84.5 | oop_leads | 1.622048e-06 | not authored |
| A | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_call_CO_fold_BTN_fold` | 37 | 84.5 | oop_leads | 1.6154973e-06 | not authored |
| A | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_fold_CO_call_BTN_fold` | 37 | 84.5 | oop_leads | 1.5428297e-06 | not authored |
| A | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_fold_CO_call_BTN_fold` | 36.5 | 84.5 | oop_leads | 1.4876702e-06 | not authored |
| A | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_call_BTN_fold_SB_fold` | 36 | 84.5 | oop_leads | 1.4586505e-06 | not authored |
| A | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_fold_CO_call_SB_fold` | 36 | 84.5 | oop_leads | 1.4475621e-06 | not authored |
| A | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_call_HJ_fold_BTN_fold` | 37 | 84.5 | oop_leads | 1.4278242e-06 | not authored |
| A | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_call_HJ_fold_BTN_fold` | 36.5 | 84.5 | oop_leads | 1.4192255e-06 | not authored |
| A | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_fold_BTN_call_SB_fold` | 36 | 84.5 | oop_leads | 1.3840182e-06 | not authored |
| A | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_call_HJ_fold_CO_fold` | 35.5 | 85.5 | oop_checks | 1.1147045e-06 | not authored |
| A | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_fold_HJ_call_BTN_fold` | 37 | 84.5 | oop_leads | 1.0672669e-06 | not authored |
| A | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_fold_HJ_call_BTN_fold` | 36.5 | 84.5 | oop_leads | 1.0645652e-06 | not authored |
| A | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_call_HJ_fold_CO_fold` | 36.5 | 84.5 | oop_leads | 1.0616836e-06 | not authored |
| A | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_call_HJ_fold_CO_fold` | 37 | 84.5 | oop_leads | 1.0527508e-06 | not authored |
| A | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_call_CO_fold_SB_fold` | 36 | 84.5 | oop_leads | 9.2621471e-07 | not authored |
| A | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_fold_CO_call_SB_fold` | 36 | 84.5 | oop_leads | 8.2992874e-07 | not authored |
| A | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_call_HJ_fold_SB_fold` | 36 | 84.5 | oop_leads | 7.9180576e-07 | not authored |
| A | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_fold_HJ_call_CO_fold` | 35.5 | 85.5 | oop_checks | 7.7354968e-07 | not authored |
| A | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_fold_HJ_call_CO_fold` | 37 | 84.5 | oop_leads | 7.3248517e-07 | not authored |
| A | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_fold_HJ_call_CO_fold` | 36.5 | 84.5 | oop_leads | 7.1160524e-07 | not authored |
| A | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_fold_HJ_call_SB_fold` | 36 | 84.5 | oop_leads | 5.5622561e-07 | not authored |
| B | `BTN_open_SB_3bet_BB_call_BTN_4bet_SB_fold_BB_call` | 64 | 74 | oop_checks | 0.0043902152 | not authored |
| B | `CO_open_BTN_call_SB_squeeze_CO_4bet_BTN_fold_SB_call` | 55.5 | 74 | oop_checks | 0.0026237569 | not authored |
| B | `CO_open_BTN_call_BB_squeeze_CO_4bet_BTN_fold_BB_call` | 55 | 74 | oop_checks | 0.0024400693 | not authored |
| B | `CO_open_BTN_call_SB_squeeze_CO_fold_BTN_4bet_SB_call` | 55.5 | 74 | oop_checks | 0.0017191082 | not authored |
| B | `CO_open_SB_3bet_BB_call_CO_4bet_SB_fold_BB_call` | 64 | 74 | oop_checks | 0.0015568041 | not authored |
| B | `CO_open_BTN_call_BB_squeeze_CO_fold_BTN_4bet_BB_call` | 55 | 74 | oop_checks | 0.0014124822 | not authored |
| B | `HJ_open_BTN_call_SB_squeeze_HJ_4bet_BTN_fold_SB_call` | 55.5 | 74 | oop_checks | 0.00139165 | not authored |
| B | `HJ_open_BTN_call_BB_squeeze_HJ_4bet_BTN_fold_BB_call` | 55 | 74 | oop_checks | 0.0012722912 | not authored |
| B | `HJ_open_CO_call_BTN_squeeze_HJ_4bet_CO_fold_BTN_call` | 56 | 74 | oop_leads | 0.00098246927 | not authored |
| B | `HJ_open_CO_call_SB_squeeze_HJ_4bet_CO_fold_SB_call` | 55.5 | 74 | oop_checks | 0.00095432813 | not authored |
| B | `CO_open_BTN_3bet_BB_call_CO_4bet_BTN_fold_BB_call` | 48.5 | 80 | oop_checks | 0.00094230649 | not authored |
| B | `HJ_open_BTN_call_SB_squeeze_HJ_fold_BTN_4bet_SB_call` | 55.5 | 74 | oop_checks | 0.00091703936 | not authored |
| B | `UTG_open_BTN_call_SB_squeeze_UTG_4bet_BTN_fold_SB_call` | 55.5 | 74 | oop_checks | 0.00089225117 | not authored |
| B | `HJ_open_CO_call_BB_squeeze_HJ_4bet_CO_fold_BB_call` | 55 | 74 | oop_checks | 0.00087853772 | not authored |
| B | `HJ_open_BTN_call_BB_squeeze_HJ_fold_BTN_4bet_BB_call` | 55 | 74 | oop_checks | 0.00077356465 | not authored |
| B | `CO_open_BTN_3bet_SB_call_CO_4bet_BTN_fold_SB_call` | 49 | 80 | oop_checks | 0.0007371775 | not authored |
| B | `UTG_open_BTN_call_BB_squeeze_UTG_4bet_BTN_fold_BB_call` | 55 | 74 | oop_checks | 0.00071866506 | not authored |
| B | `HJ_open_CO_call_BTN_squeeze_HJ_fold_CO_4bet_BTN_call` | 56 | 74 | oop_leads | 0.00068844505 | not authored |
| B | `BTN_open_SB_3bet_BB_call_BTN_4bet_SB_call_BB_fold` | 64 | 74 | oop_checks | 0.00068555396 | not authored |
| B | `HJ_open_CO_call_SB_squeeze_HJ_fold_CO_4bet_SB_call` | 55.5 | 74 | oop_checks | 0.00066784534 | not authored |
| B | `UTG_open_CO_call_SB_squeeze_UTG_4bet_CO_fold_SB_call` | 55.5 | 74 | oop_checks | 0.0006504464 | not authored |
| B | `UTG_open_CO_call_BTN_squeeze_UTG_4bet_CO_fold_BTN_call` | 56 | 74 | oop_leads | 0.00063342368 | not authored |
| B | `UTG_open_HJ_call_SB_squeeze_UTG_4bet_HJ_fold_SB_call` | 55.5 | 74 | oop_checks | 0.00055132616 | not authored |
| B | `UTG_open_CO_call_BB_squeeze_UTG_4bet_CO_fold_BB_call` | 55 | 74 | oop_checks | 0.00054448337 | not authored |
| B | `UTG_open_HJ_call_BTN_squeeze_UTG_4bet_HJ_fold_BTN_call` | 56 | 74 | oop_leads | 0.00053589321 | not authored |
| B | `HJ_open_CO_call_BB_squeeze_HJ_fold_CO_4bet_BB_call` | 55 | 74 | oop_checks | 0.00053423926 | not authored |
| B | `UTG_open_HJ_call_CO_squeeze_UTG_4bet_HJ_fold_CO_call` | 56 | 74 | oop_leads | 0.00053374237 | not authored |
| B | `HJ_open_CO_3bet_BTN_call_HJ_4bet_CO_fold_BTN_call` | 49.5 | 80 | oop_leads | 0.00048263681 | not authored |
| B | `UTG_open_HJ_call_BB_squeeze_UTG_4bet_HJ_fold_BB_call` | 55 | 74 | oop_checks | 0.0004612813 | not authored |
| B | `UTG_open_BTN_call_SB_squeeze_UTG_fold_BTN_4bet_SB_call` | 55.5 | 74 | oop_checks | 0.00045915996 | not authored |
| B | `HJ_open_SB_3bet_BB_call_HJ_4bet_SB_fold_BB_call` | 64 | 74 | oop_checks | 0.00043474078 | not authored |
| B | `UTG_open_CO_call_BTN_squeeze_UTG_fold_CO_4bet_BTN_call` | 56 | 74 | oop_leads | 0.0004250139 | not authored |
| B | `UTG_open_BTN_call_BB_squeeze_UTG_fold_BTN_4bet_BB_call` | 55 | 74 | oop_checks | 0.00039460217 | not authored |
| B | `UTG_open_CO_call_SB_squeeze_UTG_fold_CO_4bet_SB_call` | 55.5 | 74 | oop_checks | 0.00038041177 | not authored |
| B | `UTG_open_CO_call_BB_squeeze_UTG_fold_CO_4bet_BB_call` | 55 | 74 | oop_checks | 0.00030992915 | not authored |
| B | `UTG_open_HJ_3bet_CO_call_UTG_4bet_HJ_fold_CO_call` | 49.5 | 80 | oop_leads | 0.00030462688 | not authored |
| B | `UTG_open_HJ_3bet_BTN_call_UTG_4bet_HJ_fold_BTN_call` | 49.5 | 80 | oop_leads | 0.00030419183 | not authored |
| B | `UTG_open_CO_3bet_BTN_call_UTG_4bet_CO_fold_BTN_call` | 49.5 | 80 | oop_leads | 0.00030257802 | not authored |
| B | `UTG_open_HJ_call_BTN_squeeze_UTG_fold_HJ_4bet_BTN_call` | 56 | 74 | oop_leads | 0.00029892575 | not authored |
| B | `UTG_open_HJ_call_CO_squeeze_UTG_fold_HJ_4bet_CO_call` | 56 | 74 | oop_leads | 0.00029337356 | not authored |
| B | `HJ_open_BTN_3bet_BB_call_HJ_4bet_BTN_fold_BB_call` | 48.5 | 80 | oop_checks | 0.00028667972 | not authored |
| B | `HJ_open_CO_3bet_BB_call_HJ_4bet_CO_fold_BB_call` | 48.5 | 80 | oop_checks | 0.00028511527 | not authored |
| B | `UTG_open_HJ_call_SB_squeeze_UTG_fold_HJ_4bet_SB_call` | 55.5 | 74 | oop_checks | 0.00026918394 | not authored |
| B | `CO_open_SB_3bet_BB_call_CO_4bet_SB_call_BB_fold` | 64 | 74 | oop_checks | 0.00025567591 | not authored |
| B | `UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_4bet_BB_call` | 55 | 74 | oop_checks | 0.00023480787 | not authored |
| B | `HJ_open_CO_3bet_SB_call_HJ_4bet_CO_fold_SB_call` | 49 | 80 | oop_checks | 0.00022613181 | not authored |
| B | `HJ_open_BTN_3bet_SB_call_HJ_4bet_BTN_fold_SB_call` | 49 | 80 | oop_checks | 0.00022389386 | not authored |
| B | `UTG_open_BTN_3bet_BB_call_UTG_4bet_BTN_fold_BB_call` | 48.5 | 80 | oop_checks | 0.00021062869 | not authored |
| B | `UTG_open_SB_3bet_BB_call_UTG_4bet_SB_fold_BB_call` | 64 | 74 | oop_checks | 0.00020300133 | not authored |
| B | `CO_open_BTN_3bet_BB_call_CO_4bet_BTN_call_BB_fold` | 48.5 | 80 | oop_leads | 0.00015158058 | not authored |
| B | `UTG_open_HJ_3bet_SB_call_UTG_4bet_HJ_fold_SB_call` | 49 | 80 | oop_checks | 0.0001282069 | not authored |
| B | `UTG_open_HJ_3bet_BB_call_UTG_4bet_HJ_fold_BB_call` | 48.5 | 80 | oop_checks | 0.00012808529 | not authored |
| B | `UTG_open_CO_3bet_BB_call_UTG_4bet_CO_fold_BB_call` | 48.5 | 80 | oop_checks | 0.0001279941 | not authored |
| B | `UTG_open_CO_3bet_SB_call_UTG_4bet_CO_fold_SB_call` | 49 | 80 | oop_checks | 0.00012718512 | not authored |
| B | `UTG_open_BTN_3bet_SB_call_UTG_4bet_BTN_fold_SB_call` | 49 | 80 | oop_checks | 0.00012683365 | not authored |
| B | `CO_open_BTN_call_BB_squeeze_CO_call_BTN_4bet_BB_call_CO_fold` | 65.5 | 74 | oop_checks | 0.00011021551 | not authored |
| B | `CO_open_BTN_3bet_SB_call_CO_4bet_BTN_call_SB_fold` | 49 | 80 | oop_leads | 0.00010116891 | not authored |
| B | `CO_open_BTN_call_SB_squeeze_CO_call_BTN_4bet_SB_call_CO_fold` | 66 | 74 | oop_checks | 9.506994e-05 | not authored |
| B | `CO_open_BTN_call_BB_squeeze_CO_call_BTN_4bet_BB_fold_CO_call` | 65.5 | 74 | oop_checks | 8.6892863e-05 | not authored |
| B | `HJ_open_CO_3bet_BTN_call_HJ_4bet_CO_call_BTN_fold` | 49.5 | 80 | oop_leads | 8.0613513e-05 | not authored |
| B | `CO_open_BTN_call_SB_call_BB_squeeze_CO_fold_BTN_fold_SB_4bet_BB_call` | 65 | 70 | oop_leads | 7.1328812e-05 | not authored |
| B | `CO_open_BTN_call_SB_squeeze_CO_call_BTN_4bet_SB_fold_CO_call` | 66 | 74 | oop_checks | 7.0306084e-05 | not authored |
| B | `HJ_open_SB_3bet_BB_call_HJ_4bet_SB_call_BB_fold` | 64 | 74 | oop_checks | 6.798732e-05 | not authored |
| B | `HJ_open_BTN_call_BB_squeeze_HJ_call_BTN_4bet_BB_call_HJ_fold` | 65.5 | 74 | oop_checks | 6.5102172e-05 | not authored |
| B | `HJ_open_CO_call_BB_squeeze_HJ_call_CO_4bet_BB_call_HJ_fold` | 65.5 | 74 | oop_checks | 6.4673257e-05 | not authored |
| B | `UTG_open_HJ_3bet_BTN_call_UTG_4bet_HJ_call_BTN_fold` | 49.5 | 80 | oop_leads | 5.3120873e-05 | not authored |
| B | `UTG_open_HJ_3bet_CO_call_UTG_4bet_HJ_call_CO_fold` | 49.5 | 80 | oop_leads | 5.2473752e-05 | not authored |
| B | `UTG_open_CO_3bet_BTN_call_UTG_4bet_CO_call_BTN_fold` | 49.5 | 80 | oop_leads | 4.7820707e-05 | not authored |
| B | `UTG_open_SB_3bet_BB_call_UTG_4bet_SB_call_BB_fold` | 64 | 74 | oop_checks | 4.08523e-05 | not authored |
| B | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_fold_BTN_fold_SB_4bet_BB_call` | 65 | 70 | oop_leads | 3.6421897e-05 | not authored |
| B | `HJ_open_BTN_call_BB_squeeze_HJ_call_BTN_4bet_BB_fold_HJ_call` | 65.5 | 74 | oop_checks | 3.6236208e-05 | not authored |
| B | `HJ_open_CO_3bet_BB_call_HJ_4bet_CO_call_BB_fold` | 48.5 | 80 | oop_leads | 3.5698552e-05 | not authored |
| B | `HJ_open_BTN_3bet_BB_call_HJ_4bet_BTN_call_BB_fold` | 48.5 | 80 | oop_leads | 3.5099897e-05 | not authored |
| B | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_fold_CO_fold_BTN_4bet_SB_call` | 66 | 70 | oop_checks | 3.4613074e-05 | not authored |
| B | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_fold_CO_fold_BTN_4bet_BB_call` | 65.5 | 70 | oop_checks | 3.4442356e-05 | not authored |
| B | `HJ_open_CO_call_BB_squeeze_HJ_call_CO_4bet_BB_fold_HJ_call` | 65.5 | 74 | oop_checks | 3.1326626e-05 | not authored |
| B | `CO_open_BTN_call_SB_call_BB_squeeze_CO_4bet_BTN_fold_SB_fold_BB_call` | 65 | 70 | oop_checks | 3.1234938e-05 | not authored |
| B | `UTG_open_BTN_3bet_BB_call_UTG_4bet_BTN_call_BB_fold` | 48.5 | 80 | oop_leads | 3.113225e-05 | not authored |
| B | `HJ_open_BTN_call_SB_squeeze_HJ_call_BTN_4bet_SB_fold_HJ_call` | 66 | 74 | oop_checks | 2.8450672e-05 | not authored |
| B | `HJ_open_BTN_call_SB_squeeze_HJ_call_BTN_4bet_SB_call_HJ_fold` | 66 | 74 | oop_checks | 2.786757e-05 | not authored |
| B | `UTG_open_BTN_call_BB_squeeze_UTG_call_BTN_4bet_BB_fold_UTG_call` | 65.5 | 74 | oop_checks | 2.7259822e-05 | not authored |
| B | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_fold_CO_fold_SB_4bet_BB_call` | 65 | 70 | oop_leads | 2.4941153e-05 | not authored |
| B | `UTG_open_BTN_call_SB_squeeze_UTG_call_BTN_4bet_SB_fold_UTG_call` | 66 | 74 | oop_checks | 2.4689366e-05 | not authored |
| B | `UTG_open_BTN_call_BB_squeeze_UTG_call_BTN_4bet_BB_call_UTG_fold` | 65.5 | 74 | oop_checks | 2.3361975e-05 | not authored |
| B | `HJ_open_CO_call_BTN_squeeze_HJ_call_CO_4bet_BTN_fold_HJ_call` | 65.5 | 74 | oop_checks | 2.2696654e-05 | not authored |
| B | `HJ_open_CO_call_SB_squeeze_HJ_call_CO_4bet_SB_fold_HJ_call` | 66 | 74 | oop_checks | 2.2687862e-05 | not authored |
| B | `UTG_open_CO_call_BB_squeeze_UTG_call_CO_4bet_BB_fold_UTG_call` | 65.5 | 74 | oop_checks | 2.2238141e-05 | not authored |
| B | `HJ_open_CO_call_SB_squeeze_HJ_call_CO_4bet_SB_call_HJ_fold` | 66 | 74 | oop_checks | 1.9965924e-05 | not authored |
| B | `UTG_open_BTN_call_SB_squeeze_UTG_call_BTN_4bet_SB_call_UTG_fold` | 66 | 74 | oop_checks | 1.8533195e-05 | not authored |
| B | `UTG_open_CO_call_BB_squeeze_UTG_call_CO_4bet_BB_call_UTG_fold` | 65.5 | 74 | oop_checks | 1.8530664e-05 | not authored |
| B | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_fold_BTN_fold_SB_4bet_BB_call` | 65 | 70 | oop_leads | 1.8390469e-05 | not authored |
| B | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_fold_CO_fold_BTN_4bet_SB_call` | 66 | 70 | oop_checks | 1.7280929e-05 | not authored |
| B | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_4bet_CO_fold_BTN_fold_BB_call` | 65.5 | 70 | oop_checks | 1.6335569e-05 | not authored |
| B | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_4bet_BTN_fold_SB_fold_BB_call` | 65 | 70 | oop_checks | 1.6331073e-05 | not authored |
| B | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_fold_CO_fold_BTN_4bet_BB_call` | 65.5 | 70 | oop_checks | 1.6264566e-05 | not authored |
| B | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_4bet_CO_fold_BTN_fold_SB_call` | 66 | 70 | oop_checks | 1.6035896e-05 | not authored |
| B | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_fold_HJ_fold_BTN_4bet_SB_call` | 66 | 70 | oop_checks | 1.4703133e-05 | not authored |
| B | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_fold_HJ_fold_CO_4bet_BTN_call` | 66.5 | 70 | oop_leads | 1.4580408e-05 | not authored |
| B | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_fold_HJ_fold_CO_4bet_SB_call` | 66 | 70 | oop_checks | 1.4489701e-05 | not authored |
| B | `CO_open_BTN_call_SB_call_BB_squeeze_CO_fold_BTN_4bet_SB_fold_BB_call` | 65 | 70 | oop_checks | 1.4331251e-05 | not authored |
| B | `CO_open_BTN_call_BB_squeeze_CO_4bet_BTN_call_BB_fold` | 65.5 | 74 | oop_leads | 1.4055647e-05 | not authored |
| B | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_fold_HJ_fold_BTN_4bet_BB_call` | 65.5 | 70 | oop_checks | 1.3993458e-05 | not authored |
| B | `HJ_open_CO_call_BTN_squeeze_HJ_call_CO_4bet_BTN_call_HJ_fold` | 65.5 | 74 | oop_leads | 1.3901473e-05 | not authored |
| B | `HJ_open_CO_3bet_SB_call_HJ_4bet_CO_call_SB_fold` | 49 | 80 | oop_leads | 1.3787844e-05 | not authored |
| B | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_fold_HJ_fold_CO_4bet_BB_call` | 65.5 | 70 | oop_checks | 1.377477e-05 | not authored |
| B | `CO_open_BTN_call_SB_squeeze_CO_4bet_BTN_call_SB_fold` | 66 | 74 | oop_leads | 1.3684832e-05 | not authored |
| B | `HJ_open_BTN_3bet_SB_call_HJ_4bet_BTN_call_SB_fold` | 49 | 80 | oop_leads | 1.3656651e-05 | not authored |
| B | `UTG_open_HJ_call_BB_squeeze_UTG_call_HJ_4bet_BB_fold_UTG_call` | 65.5 | 74 | oop_checks | 1.3355299e-05 | not authored |
| B | `UTG_open_CO_call_SB_squeeze_UTG_call_CO_4bet_SB_fold_UTG_call` | 66 | 74 | oop_checks | 1.2473326e-05 | not authored |
| B | `UTG_open_CO_call_BTN_squeeze_UTG_call_CO_4bet_BTN_fold_UTG_call` | 65.5 | 74 | oop_checks | 1.2310588e-05 | not authored |
| B | `UTG_open_HJ_call_BTN_squeeze_UTG_call_HJ_4bet_BTN_fold_UTG_call` | 65.5 | 74 | oop_checks | 1.0973296e-05 | not authored |
| B | `UTG_open_HJ_call_CO_squeeze_UTG_call_HJ_4bet_CO_fold_UTG_call` | 65.5 | 74 | oop_checks | 1.0708481e-05 | not authored |
| B | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_fold_CO_fold_SB_4bet_BB_call` | 65 | 70 | oop_leads | 1.0585503e-05 | not authored |
| B | `UTG_open_BTN_call_SB_squeeze_UTG_4bet_BTN_call_SB_fold` | 66 | 74 | oop_leads | 1.0435845e-05 | not authored |
| B | `UTG_open_BTN_call_BB_squeeze_UTG_4bet_BTN_call_BB_fold` | 65.5 | 74 | oop_leads | 9.1926203e-06 | not authored |
| B | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_fold_HJ_fold_SB_4bet_BB_call` | 65 | 70 | oop_leads | 9.0857585e-06 | not authored |
| B | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_4bet_CO_fold_SB_fold_BB_call` | 65 | 70 | oop_checks | 9.0200856e-06 | not authored |
| B | `UTG_open_HJ_call_BB_squeeze_UTG_call_HJ_4bet_BB_call_UTG_fold` | 65.5 | 74 | oop_checks | 8.7627725e-06 | not authored |
| B | `UTG_open_HJ_3bet_SB_call_UTG_4bet_HJ_call_SB_fold` | 49 | 80 | oop_leads | 8.4155024e-06 | not authored |
| B | `UTG_open_HJ_3bet_BB_call_UTG_4bet_HJ_call_BB_fold` | 48.5 | 80 | oop_leads | 8.2911111e-06 | not authored |
| B | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_4bet_CO_fold_BTN_fold_SB_call` | 66 | 70 | oop_checks | 8.2561738e-06 | not authored |
| B | `HJ_open_CO_call_BB_squeeze_HJ_4bet_CO_call_BB_fold` | 65.5 | 74 | oop_leads | 7.9238602e-06 | not authored |
| B | `UTG_open_CO_3bet_SB_call_UTG_4bet_CO_call_SB_fold` | 49 | 80 | oop_leads | 7.8630627e-06 | not authored |
| B | `UTG_open_CO_3bet_BB_call_UTG_4bet_CO_call_BB_fold` | 48.5 | 80 | oop_leads | 7.8165357e-06 | not authored |
| B | `HJ_open_BTN_call_BB_squeeze_HJ_4bet_BTN_call_BB_fold` | 65.5 | 74 | oop_leads | 7.7615343e-06 | not authored |
| B | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_4bet_CO_fold_BTN_fold_BB_call` | 65.5 | 70 | oop_checks | 7.7474299e-06 | not authored |
| B | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_fold_CO_4bet_BTN_fold_BB_call` | 65.5 | 70 | oop_checks | 7.6498993e-06 | not authored |
| B | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_fold_CO_4bet_BTN_fold_SB_call` | 66 | 70 | oop_checks | 7.6241312e-06 | not authored |
| B | `UTG_open_HJ_call_SB_squeeze_UTG_call_HJ_4bet_SB_fold_UTG_call` | 66 | 74 | oop_checks | 7.5578244e-06 | not authored |
| B | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_4bet_BTN_fold_SB_fold_BB_call` | 65 | 70 | oop_checks | 7.5359169e-06 | not authored |
| B | `UTG_open_BTN_3bet_SB_call_UTG_4bet_BTN_call_SB_fold` | 49 | 80 | oop_leads | 7.456362e-06 | not authored |
| B | `HJ_open_BTN_call_SB_squeeze_HJ_4bet_BTN_call_SB_fold` | 66 | 74 | oop_leads | 7.433128e-06 | not authored |
| B | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_4bet_HJ_fold_BTN_fold_SB_call` | 66 | 70 | oop_checks | 7.4117549e-06 | not authored |
| B | `UTG_open_CO_call_SB_squeeze_UTG_4bet_CO_call_SB_fold` | 66 | 74 | oop_leads | 7.3064394e-06 | not authored |
| B | `HJ_open_CO_call_SB_squeeze_HJ_4bet_CO_call_SB_fold` | 66 | 74 | oop_leads | 7.2489759e-06 | not authored |
| B | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_4bet_HJ_fold_BTN_fold_BB_call` | 65.5 | 70 | oop_checks | 7.0316815e-06 | not authored |
| B | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_fold_BTN_4bet_SB_fold_BB_call` | 65 | 70 | oop_checks | 6.8512666e-06 | not authored |
| B | `UTG_open_CO_call_SB_squeeze_UTG_call_CO_4bet_SB_call_UTG_fold` | 66 | 74 | oop_checks | 5.8965452e-06 | not authored |
| B | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_4bet_HJ_fold_CO_fold_BTN_call` | 66.5 | 70 | oop_leads | 5.251621e-06 | not authored |
| B | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_4bet_HJ_fold_CO_fold_SB_call` | 66 | 70 | oop_checks | 5.0257548e-06 | not authored |
| B | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_4bet_HJ_fold_CO_fold_BB_call` | 65.5 | 70 | oop_checks | 4.8729101e-06 | not authored |
| B | `UTG_open_HJ_call_SB_squeeze_UTG_4bet_HJ_call_SB_fold` | 66 | 74 | oop_leads | 4.6888985e-06 | not authored |
| B | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_fold_CO_4bet_BTN_fold_SB_call` | 66 | 70 | oop_checks | 4.5993251e-06 | not authored |
| B | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_4bet_CO_fold_SB_fold_BB_call` | 65 | 70 | oop_checks | 4.4911078e-06 | not authored |
| B | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_fold_CO_4bet_BTN_fold_BB_call` | 65.5 | 70 | oop_checks | 4.4665964e-06 | not authored |
| B | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_fold_CO_4bet_SB_fold_BB_call` | 65 | 70 | oop_checks | 4.2527576e-06 | not authored |
| B | `UTG_open_HJ_call_BTN_squeeze_UTG_call_HJ_4bet_BTN_call_UTG_fold` | 65.5 | 74 | oop_leads | 4.0950903e-06 | not authored |
| B | `UTG_open_HJ_call_CO_squeeze_UTG_call_HJ_4bet_CO_call_UTG_fold` | 65.5 | 74 | oop_leads | 4.0703835e-06 | not authored |
| B | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_fold_BTN_4bet_SB_fold_BB_call` | 65 | 70 | oop_checks | 4.0363535e-06 | not authored |
| B | `UTG_open_HJ_call_SB_squeeze_UTG_call_HJ_4bet_SB_call_UTG_fold` | 66 | 74 | oop_checks | 3.8929565e-06 | not authored |
| B | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_4bet_HJ_fold_SB_fold_BB_call` | 65 | 70 | oop_checks | 3.8438064e-06 | not authored |
| B | `UTG_open_CO_call_BTN_squeeze_UTG_4bet_CO_call_BTN_fold` | 65.5 | 74 | oop_leads | 3.842797e-06 | not authored |
| B | `HJ_open_CO_call_BTN_squeeze_HJ_4bet_CO_call_BTN_fold` | 65.5 | 74 | oop_leads | 3.8277511e-06 | not authored |
| B | `UTG_open_CO_call_BB_squeeze_UTG_4bet_CO_call_BB_fold` | 65.5 | 74 | oop_leads | 3.7054044e-06 | not authored |
| B | `UTG_open_CO_call_BTN_squeeze_UTG_call_CO_4bet_BTN_call_UTG_fold` | 65.5 | 74 | oop_leads | 3.6021514e-06 | not authored |
| B | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_fold_HJ_4bet_BTN_fold_SB_call` | 66 | 70 | oop_checks | 3.4456591e-06 | not authored |
| B | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_fold_HJ_4bet_BTN_fold_BB_call` | 65.5 | 70 | oop_checks | 3.3161561e-06 | not authored |
| B | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_fold_CO_4bet_SB_fold_BB_call` | 65 | 70 | oop_checks | 2.5343047e-06 | not authored |
| B | `UTG_open_HJ_call_BTN_squeeze_UTG_4bet_HJ_call_BTN_fold` | 65.5 | 74 | oop_leads | 2.4977152e-06 | not authored |
| B | `UTG_open_HJ_call_BB_squeeze_UTG_4bet_HJ_call_BB_fold` | 65.5 | 74 | oop_leads | 2.4921028e-06 | not authored |
| B | `UTG_open_HJ_call_CO_squeeze_UTG_4bet_HJ_call_CO_fold` | 65.5 | 74 | oop_leads | 2.4753805e-06 | not authored |
| B | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_fold_HJ_4bet_CO_fold_SB_call` | 66 | 70 | oop_checks | 2.3486955e-06 | not authored |
| B | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_fold_HJ_4bet_CO_fold_BTN_call` | 66.5 | 70 | oop_leads | 2.3251494e-06 | not authored |
| B | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_fold_HJ_4bet_CO_fold_BB_call` | 65.5 | 70 | oop_checks | 2.2299106e-06 | not authored |
| B | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_fold_HJ_4bet_SB_fold_BB_call` | 65 | 70 | oop_checks | 1.7545407e-06 | not authored |
| B | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_4bet_CO_fold_BTN_call_BB_fold` | 78.5 | 70 | oop_leads | 4.8281811e-07 | not authored |
| B | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_4bet_CO_fold_BTN_call_SB_fold` | 79 | 70 | oop_leads | 4.5134972e-07 | not authored |
| B | `CO_open_BTN_call_SB_call_BB_squeeze_CO_fold_BTN_4bet_SB_call_BB_fold` | 78 | 70 | oop_checks | 3.7796476e-07 | not authored |
| B | `CO_open_BTN_call_SB_call_BB_squeeze_CO_4bet_BTN_fold_SB_call_BB_fold` | 78 | 70 | oop_checks | 3.3872519e-07 | not authored |
| B | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_4bet_CO_fold_BTN_call_SB_fold` | 79 | 70 | oop_leads | 3.1796983e-07 | not authored |
| B | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_4bet_CO_fold_BTN_call_BB_fold` | 78.5 | 70 | oop_leads | 2.9585767e-07 | not authored |
| B | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_4bet_HJ_fold_CO_call_SB_fold` | 79 | 70 | oop_leads | 2.7075395e-07 | not authored |
| B | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_4bet_HJ_fold_BTN_call_SB_fold` | 79 | 70 | oop_leads | 2.6880327e-07 | not authored |
| B | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_4bet_HJ_fold_BTN_call_BB_fold` | 78.5 | 70 | oop_leads | 2.5188696e-07 | not authored |
| B | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_4bet_HJ_fold_CO_call_BB_fold` | 78.5 | 70 | oop_leads | 2.514722e-07 | not authored |
| B | `CO_open_BTN_call_SB_call_BB_squeeze_CO_fold_BTN_call_SB_4bet_BB_fold_BTN_call` | 78 | 70 | oop_leads | 2.5010776e-07 | not authored |
| B | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_fold_CO_4bet_BTN_call_BB_fold` | 78.5 | 70 | oop_leads | 2.4577469e-07 | not authored |
| B | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_fold_CO_4bet_BTN_call_SB_fold` | 79 | 70 | oop_leads | 2.2642258e-07 | not authored |
| B | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_4bet_BTN_fold_SB_call_BB_fold` | 78 | 70 | oop_checks | 1.9412852e-07 | not authored |
| B | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_fold_CO_4bet_BTN_call_SB_fold` | 79 | 70 | oop_leads | 1.7931592e-07 | not authored |
| B | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_fold_CO_4bet_BTN_call_BB_fold` | 78.5 | 70 | oop_leads | 1.7469488e-07 | not authored |
| B | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_fold_BTN_4bet_SB_call_BB_fold` | 78 | 70 | oop_checks | 1.7384356e-07 | not authored |
| B | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_4bet_BTN_fold_SB_call_BB_fold` | 78 | 70 | oop_checks | 1.7050447e-07 | not authored |
| B | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_4bet_HJ_fold_CO_call_BTN_fold` | 78.5 | 70 | oop_leads | 1.4034023e-07 | not authored |
| B | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_4bet_CO_fold_SB_call_BB_fold` | 78 | 70 | oop_checks | 1.3555423e-07 | not authored |
| B | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_fold_HJ_4bet_CO_call_SB_fold` | 79 | 70 | oop_leads | 1.3270573e-07 | not authored |
| B | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_4bet_CO_fold_SB_call_BB_fold` | 78 | 70 | oop_checks | 1.306378e-07 | not authored |
| B | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_fold_HJ_4bet_BTN_call_SB_fold` | 79 | 70 | oop_leads | 1.290615e-07 | not authored |
| B | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_fold_HJ_4bet_CO_call_BTN_fold` | 78.5 | 70 | oop_leads | 1.2884607e-07 | not authored |
| B | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_fold_HJ_4bet_CO_call_BB_fold` | 78.5 | 70 | oop_leads | 1.2697142e-07 | not authored |
| B | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_fold_HJ_4bet_BTN_call_BB_fold` | 78.5 | 70 | oop_leads | 1.2425894e-07 | not authored |
| B | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_4bet_HJ_fold_SB_call_BB_fold` | 78 | 70 | oop_checks | 1.1150014e-07 | not authored |
| B | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_fold_BTN_4bet_SB_call_BB_fold` | 78 | 70 | oop_checks | 9.3383347e-08 | not authored |
| B | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_fold_CO_4bet_SB_call_BB_fold` | 78 | 70 | oop_checks | 7.8055748e-08 | not authored |
| B | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_fold_CO_call_BTN_4bet_BB_fold_CO_call` | 78.5 | 70 | oop_checks | 7.4598038e-08 | not authored |
| B | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_fold_CO_4bet_SB_call_BB_fold` | 78 | 70 | oop_checks | 7.0144559e-08 | not authored |
| B | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_fold_CO_call_BTN_4bet_SB_fold_CO_call` | 79 | 70 | oop_checks | 6.9223906e-08 | not authored |
| B | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_fold_CO_call_BTN_4bet_SB_fold_CO_call` | 79 | 70 | oop_checks | 5.8981625e-08 | not authored |
| B | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_fold_HJ_4bet_SB_call_BB_fold` | 78 | 70 | oop_checks | 5.7332832e-08 | not authored |
| B | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_fold_CO_call_BTN_4bet_BB_fold_CO_call` | 78.5 | 70 | oop_checks | 5.6077899e-08 | not authored |
| B | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_fold_BTN_call_SB_4bet_BB_fold_BTN_call` | 78 | 70 | oop_leads | 5.5534624e-08 | not authored |
| B | `CO_open_BTN_call_SB_call_BB_squeeze_CO_4bet_BTN_call_SB_fold_BB_fold` | 78 | 70 | oop_leads | 5.3740632e-08 | not authored |
| B | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_4bet_CO_call_BTN_fold_BB_fold` | 78.5 | 70 | oop_leads | 5.2094864e-08 | not authored |
| B | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_4bet_CO_call_BTN_fold_SB_fold` | 79 | 70 | oop_leads | 4.9278152e-08 | not authored |
| B | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_fold_BTN_call_SB_4bet_BB_fold_BTN_call` | 78 | 70 | oop_leads | 4.6641338e-08 | not authored |
| B | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_4bet_CO_call_BTN_fold_SB_fold` | 79 | 70 | oop_leads | 4.6339635e-08 | not authored |
| B | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_fold_CO_call_SB_4bet_BB_fold_CO_call` | 78 | 70 | oop_leads | 4.5211669e-08 | not authored |
| B | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_4bet_CO_call_BTN_fold_BB_fold` | 78.5 | 70 | oop_leads | 4.4767976e-08 | not authored |
| B | `CO_open_BTN_call_SB_call_BB_squeeze_CO_fold_BTN_call_SB_4bet_BB_call_BTN_fold` | 78 | 70 | oop_leads | 4.2731445e-08 | not authored |
| B | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_fold_HJ_call_CO_4bet_BTN_fold_HJ_call` | 78.5 | 70 | oop_checks | 4.2026128e-08 | not authored |
| B | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_4bet_BTN_call_SB_fold_BB_fold` | 78 | 70 | oop_leads | 4.1698066e-08 | not authored |
| B | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_fold_HJ_call_BTN_4bet_SB_fold_HJ_call` | 79 | 70 | oop_checks | 3.9964179e-08 | not authored |
| B | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_fold_HJ_call_CO_4bet_SB_fold_HJ_call` | 79 | 70 | oop_checks | 3.9225066e-08 | not authored |
| B | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_fold_HJ_call_CO_4bet_BB_fold_HJ_call` | 78.5 | 70 | oop_checks | 3.7154731e-08 | not authored |
| B | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_fold_HJ_call_BTN_4bet_BB_fold_HJ_call` | 78.5 | 70 | oop_checks | 3.6899876e-08 | not authored |
| B | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_fold_CO_call_SB_4bet_BB_fold_CO_call` | 78 | 70 | oop_leads | 3.5338237e-08 | not authored |
| B | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_4bet_BTN_call_SB_fold_BB_fold` | 78 | 70 | oop_leads | 3.2371836e-08 | not authored |
| B | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_4bet_HJ_call_BTN_fold_SB_fold` | 79 | 70 | oop_leads | 3.0725803e-08 | not authored |
| B | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_4bet_HJ_call_BTN_fold_BB_fold` | 78.5 | 70 | oop_leads | 2.9102452e-08 | not authored |
| B | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_4bet_CO_call_SB_fold_BB_fold` | 78 | 70 | oop_leads | 2.7322494e-08 | not authored |
| B | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_4bet_CO_call_SB_fold_BB_fold` | 78 | 70 | oop_leads | 2.6416429e-08 | not authored |
| B | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_fold_HJ_call_SB_4bet_BB_fold_HJ_call` | 78 | 70 | oop_leads | 2.3643508e-08 | not authored |
| B | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_4bet_HJ_call_CO_fold_BTN_fold` | 78.5 | 70 | oop_leads | 2.3495228e-08 | not authored |
| B | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_4bet_HJ_call_CO_fold_SB_fold` | 79 | 70 | oop_leads | 2.2094242e-08 | not authored |
| B | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_4bet_HJ_call_CO_fold_BB_fold` | 78.5 | 70 | oop_leads | 2.1973599e-08 | not authored |
| B | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_4bet_HJ_call_SB_fold_BB_fold` | 78 | 70 | oop_leads | 1.7676002e-08 | not authored |
| B | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_fold_BTN_call_SB_4bet_BB_call_BTN_fold` | 78 | 70 | oop_leads | 8.3706165e-09 | not authored |
| B | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_fold_CO_call_BTN_4bet_SB_call_CO_fold` | 79 | 70 | oop_checks | 6.8492481e-09 | not authored |
| B | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_fold_CO_call_BTN_4bet_BB_call_CO_fold` | 78.5 | 70 | oop_checks | 6.6983561e-09 | not authored |
| B | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_fold_CO_call_BTN_4bet_SB_call_CO_fold` | 79 | 70 | oop_checks | 6.687793e-09 | not authored |
| B | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_fold_CO_call_BTN_4bet_BB_call_CO_fold` | 78.5 | 70 | oop_checks | 6.622561e-09 | not authored |
| B | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_fold_CO_call_SB_4bet_BB_call_CO_fold` | 78 | 70 | oop_leads | 5.6701328e-09 | not authored |
| B | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_fold_BTN_call_SB_4bet_BB_call_BTN_fold` | 78 | 70 | oop_leads | 5.6473478e-09 | not authored |
| B | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_fold_CO_call_SB_4bet_BB_call_CO_fold` | 78 | 70 | oop_leads | 5.2309666e-09 | not authored |
| B | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_fold_HJ_call_BTN_4bet_BB_call_HJ_fold` | 78.5 | 70 | oop_checks | 4.4841531e-09 | not authored |
| B | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_fold_HJ_call_BTN_4bet_SB_call_HJ_fold` | 79 | 70 | oop_checks | 4.4774364e-09 | not authored |
| B | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_fold_HJ_call_CO_4bet_SB_call_HJ_fold` | 79 | 70 | oop_checks | 4.4461199e-09 | not authored |
| B | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_fold_HJ_call_CO_4bet_BB_call_HJ_fold` | 78.5 | 70 | oop_checks | 4.3865645e-09 | not authored |
| B | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_fold_HJ_call_CO_4bet_BTN_call_HJ_fold` | 78.5 | 70 | oop_leads | 4.380917e-09 | not authored |
| B | `CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_fold_SB_4bet_BB_fold_CO_call` | 78 | 70 | oop_leads | 3.5840131e-09 | not authored |
| B | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_fold_HJ_call_SB_4bet_BB_call_HJ_fold` | 78 | 70 | oop_leads | 3.4781256e-09 | not authored |
| B | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_call_CO_fold_BTN_4bet_BB_fold_HJ_call` | 78.5 | 70 | oop_checks | 2.9946227e-09 | not authored |
| B | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_call_CO_fold_BTN_4bet_SB_fold_HJ_call` | 79 | 70 | oop_checks | 2.8132542e-09 | not authored |
| B | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_call_BTN_fold_SB_4bet_BB_fold_HJ_call` | 78 | 70 | oop_leads | 2.4874269e-09 | not authored |
| B | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_call_BTN_fold_SB_4bet_BB_fold_UTG_call` | 78 | 70 | oop_leads | 2.2763498e-09 | not authored |
| B | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_call_CO_fold_BTN_4bet_SB_fold_UTG_call` | 79 | 70 | oop_checks | 2.0726255e-09 | not authored |
| B | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_call_HJ_fold_CO_4bet_BTN_fold_UTG_call` | 78.5 | 70 | oop_checks | 1.9735766e-09 | not authored |
| B | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_call_CO_fold_BTN_4bet_BB_fold_UTG_call` | 78.5 | 70 | oop_checks | 1.9582112e-09 | not authored |
| B | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_call_HJ_fold_BTN_4bet_SB_fold_UTG_call` | 79 | 70 | oop_checks | 1.9282551e-09 | not authored |
| B | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_call_CO_fold_SB_4bet_BB_fold_HJ_call` | 78 | 70 | oop_leads | 1.8066062e-09 | not authored |
| B | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_call_HJ_fold_CO_4bet_SB_fold_UTG_call` | 79 | 70 | oop_checks | 1.8046651e-09 | not authored |
| B | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_call_HJ_fold_CO_4bet_BB_fold_UTG_call` | 78.5 | 70 | oop_checks | 1.7945908e-09 | not authored |
| B | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_call_HJ_fold_BTN_4bet_BB_fold_UTG_call` | 78.5 | 70 | oop_checks | 1.7908625e-09 | not authored |
| B | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_call_CO_fold_SB_4bet_BB_fold_UTG_call` | 78 | 70 | oop_leads | 1.7672293e-09 | not authored |
| B | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_call_HJ_fold_SB_4bet_BB_fold_UTG_call` | 78 | 70 | oop_leads | 1.6011846e-09 | not authored |
| B | `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_call_CO_4bet_BTN_fold_BB_fold_HJ_call` | 78.5 | 70 | oop_checks | 6.5807969e-10 | not authored |
| B | `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_call_CO_4bet_BTN_fold_BB_fold_UTG_call` | 78.5 | 70 | oop_checks | 5.8897046e-10 | not authored |
| B | `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_call_CO_4bet_BTN_fold_SB_fold_HJ_call` | 79 | 70 | oop_checks | 5.756346e-10 | not authored |
| B | `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_call_CO_4bet_BTN_fold_SB_fold_UTG_call` | 79 | 70 | oop_checks | 5.6969071e-10 | not authored |
| B | `CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_4bet_SB_fold_BB_fold_CO_call` | 78 | 70 | oop_checks | 5.6465095e-10 | not authored |
| B | `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_call_BTN_4bet_SB_fold_BB_fold_UTG_call` | 78 | 70 | oop_checks | 5.274487e-10 | not authored |
| B | `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_call_BTN_4bet_SB_fold_BB_fold_HJ_call` | 78 | 70 | oop_checks | 3.8253748e-10 | not authored |
| B | `HJ_open_CO_call_SB_call_BB_squeeze_HJ_call_CO_4bet_SB_fold_BB_fold_HJ_call` | 78 | 70 | oop_checks | 3.6044166e-10 | not authored |
| B | `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_call_HJ_4bet_BTN_fold_BB_fold_UTG_call` | 78.5 | 70 | oop_checks | 3.5733402e-10 | not authored |
| B | `UTG_open_CO_call_SB_call_BB_squeeze_UTG_call_CO_4bet_SB_fold_BB_fold_UTG_call` | 78 | 70 | oop_checks | 3.3784996e-10 | not authored |
| B | `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_call_HJ_4bet_BTN_fold_SB_fold_UTG_call` | 79 | 70 | oop_checks | 3.3608164e-10 | not authored |
| B | `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_call_HJ_4bet_CO_fold_BTN_fold_UTG_call` | 78.5 | 70 | oop_checks | 3.1714305e-10 | not authored |
| B | `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_call_HJ_4bet_CO_fold_SB_fold_UTG_call` | 79 | 70 | oop_checks | 3.0168721e-10 | not authored |
| B | `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_call_HJ_4bet_CO_fold_BB_fold_UTG_call` | 78.5 | 70 | oop_checks | 2.8697546e-10 | not authored |
| B | `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_call_HJ_4bet_SB_fold_BB_fold_UTG_call` | 78 | 70 | oop_checks | 2.3448459e-10 | not authored |

## Impossible paths

These118 paths have zero saved action support or no compatible participant hole-card assignment and are not authored.

- `UTG_open_SB_call_BB_squeeze_UTG_fold_SB_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_SB_call_BB_squeeze_UTG_fold_SB_4bet_BB_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_SB_call_BB_squeeze_UTG_call_SB_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_SB_call_BB_squeeze_UTG_call_SB_4bet_BB_fold_UTG_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_SB_call_BB_squeeze_UTG_call_SB_4bet_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_SB_call_BB_squeeze_UTG_4bet_SB_fold_BB_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_SB_call_BB_squeeze_UTG_4bet_SB_call_BB_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_SB_call_BB_squeeze_HJ_fold_SB_call`: zero saved action support or no compatible participant hole cards
- `HJ_open_SB_call_BB_squeeze_HJ_fold_SB_4bet_BB_call`: zero saved action support or no compatible participant hole cards
- `HJ_open_SB_call_BB_squeeze_HJ_call_SB_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_SB_call_BB_squeeze_HJ_call_SB_4bet_BB_fold_HJ_call`: zero saved action support or no compatible participant hole cards
- `HJ_open_SB_call_BB_squeeze_HJ_call_SB_4bet_BB_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_SB_call_BB_squeeze_HJ_4bet_SB_fold_BB_call`: zero saved action support or no compatible participant hole cards
- `HJ_open_SB_call_BB_squeeze_HJ_4bet_SB_call_BB_fold`: zero saved action support or no compatible participant hole cards
- `CO_open_SB_call_BB_squeeze_CO_fold_SB_call`: zero saved action support or no compatible participant hole cards
- `CO_open_SB_call_BB_squeeze_CO_fold_SB_4bet_BB_call`: zero saved action support or no compatible participant hole cards
- `CO_open_SB_call_BB_squeeze_CO_call_SB_fold`: zero saved action support or no compatible participant hole cards
- `CO_open_SB_call_BB_squeeze_CO_call_SB_4bet_BB_fold_CO_call`: zero saved action support or no compatible participant hole cards
- `CO_open_SB_call_BB_squeeze_CO_call_SB_4bet_BB_call_CO_fold`: zero saved action support or no compatible participant hole cards
- `CO_open_SB_call_BB_squeeze_CO_4bet_SB_fold_BB_call`: zero saved action support or no compatible participant hole cards
- `CO_open_SB_call_BB_squeeze_CO_4bet_SB_call_BB_fold`: zero saved action support or no compatible participant hole cards
- `BTN_open_SB_call_BB_squeeze_BTN_fold_SB_call`: zero saved action support or no compatible participant hole cards
- `BTN_open_SB_call_BB_squeeze_BTN_fold_SB_4bet_BB_call`: zero saved action support or no compatible participant hole cards
- `BTN_open_SB_call_BB_squeeze_BTN_call_SB_fold`: zero saved action support or no compatible participant hole cards
- `BTN_open_SB_call_BB_squeeze_BTN_call_SB_4bet_BB_fold_BTN_call`: zero saved action support or no compatible participant hole cards
- `BTN_open_SB_call_BB_squeeze_BTN_call_SB_4bet_BB_call_BTN_fold`: zero saved action support or no compatible participant hole cards
- `BTN_open_SB_call_BB_squeeze_BTN_4bet_SB_fold_BB_call`: zero saved action support or no compatible participant hole cards
- `BTN_open_SB_call_BB_squeeze_BTN_4bet_SB_call_BB_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_call_HJ_fold_CO_4bet_BTN_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_call_HJ_call_CO_4bet_BTN_fold_UTG_fold_HJ_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_call_HJ_call_CO_4bet_BTN_fold_UTG_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_call_HJ_call_CO_4bet_BTN_call_UTG_fold_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_call_HJ_4bet_CO_fold_BTN_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BTN_squeeze_UTG_call_HJ_4bet_CO_call_BTN_fold_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_call_HJ_fold_CO_4bet_SB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_call_HJ_call_CO_4bet_SB_fold_UTG_fold_HJ_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_call_HJ_call_CO_4bet_SB_fold_UTG_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_call_HJ_call_CO_4bet_SB_call_UTG_fold_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_call_HJ_4bet_CO_fold_SB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_SB_squeeze_UTG_call_HJ_4bet_CO_call_SB_fold_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_call_HJ_fold_CO_4bet_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_call_HJ_call_CO_4bet_BB_fold_UTG_fold_HJ_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_call_HJ_call_CO_4bet_BB_fold_UTG_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_call_HJ_call_CO_4bet_BB_call_UTG_fold_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_call_HJ_4bet_CO_fold_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_CO_call_BB_squeeze_UTG_call_HJ_4bet_CO_call_BB_fold_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_call_HJ_fold_BTN_4bet_SB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_call_HJ_call_BTN_4bet_SB_fold_UTG_fold_HJ_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_call_HJ_call_BTN_4bet_SB_fold_UTG_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_call_HJ_call_BTN_4bet_SB_call_UTG_fold_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_call_HJ_4bet_BTN_fold_SB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_SB_squeeze_UTG_call_HJ_4bet_BTN_call_SB_fold_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_call_HJ_fold_BTN_4bet_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_call_HJ_call_BTN_4bet_BB_fold_UTG_fold_HJ_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_call_HJ_call_BTN_4bet_BB_fold_UTG_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_call_HJ_call_BTN_4bet_BB_call_UTG_fold_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_call_HJ_4bet_BTN_fold_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_BTN_call_BB_squeeze_UTG_call_HJ_4bet_BTN_call_BB_fold_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_call_HJ_fold_SB_4bet_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_call_HJ_call_SB_4bet_BB_fold_UTG_fold_HJ_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_call_HJ_call_SB_4bet_BB_fold_UTG_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_call_HJ_call_SB_4bet_BB_call_UTG_fold_HJ_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_call_HJ_4bet_SB_fold_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_HJ_call_SB_call_BB_squeeze_UTG_call_HJ_4bet_SB_call_BB_fold_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_call_CO_fold_BTN_4bet_SB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_call_CO_call_BTN_4bet_SB_fold_UTG_fold_CO_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_call_CO_call_BTN_4bet_SB_fold_UTG_call_CO_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_call_CO_call_BTN_4bet_SB_call_UTG_fold_CO_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_call_CO_4bet_BTN_fold_SB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_SB_squeeze_UTG_call_CO_4bet_BTN_call_SB_fold_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_call_CO_fold_BTN_4bet_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_call_CO_call_BTN_4bet_BB_fold_UTG_fold_CO_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_call_CO_call_BTN_4bet_BB_fold_UTG_call_CO_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_call_CO_call_BTN_4bet_BB_call_UTG_fold_CO_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_call_CO_4bet_BTN_fold_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_BTN_call_BB_squeeze_UTG_call_CO_4bet_BTN_call_BB_fold_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_SB_call_BB_squeeze_UTG_call_CO_fold_SB_4bet_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_SB_call_BB_squeeze_UTG_call_CO_call_SB_4bet_BB_fold_UTG_fold_CO_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_SB_call_BB_squeeze_UTG_call_CO_call_SB_4bet_BB_fold_UTG_call_CO_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_SB_call_BB_squeeze_UTG_call_CO_call_SB_4bet_BB_call_UTG_fold_CO_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_SB_call_BB_squeeze_UTG_call_CO_4bet_SB_fold_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_CO_call_SB_call_BB_squeeze_UTG_call_CO_4bet_SB_call_BB_fold_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_call_BTN_fold_SB_4bet_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_call_BTN_call_SB_4bet_BB_fold_UTG_fold_BTN_call`: zero saved action support or no compatible participant hole cards
- `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_call_BTN_call_SB_4bet_BB_fold_UTG_call_BTN_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_call_BTN_call_SB_4bet_BB_call_UTG_fold_BTN_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_call_BTN_4bet_SB_fold_BB_call_UTG_fold`: zero saved action support or no compatible participant hole cards
- `UTG_open_BTN_call_SB_call_BB_squeeze_UTG_call_BTN_4bet_SB_call_BB_fold_UTG_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_call_CO_fold_BTN_4bet_SB_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_call_CO_call_BTN_4bet_SB_fold_HJ_fold_CO_call`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_call_CO_call_BTN_4bet_SB_fold_HJ_call_CO_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_call_CO_call_BTN_4bet_SB_call_HJ_fold_CO_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_call_CO_4bet_BTN_fold_SB_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_SB_squeeze_HJ_call_CO_4bet_BTN_call_SB_fold_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_call_CO_fold_BTN_4bet_BB_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_call_CO_call_BTN_4bet_BB_fold_HJ_fold_CO_call`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_call_CO_call_BTN_4bet_BB_fold_HJ_call_CO_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_call_CO_call_BTN_4bet_BB_call_HJ_fold_CO_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_call_CO_4bet_BTN_fold_BB_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_BTN_call_BB_squeeze_HJ_call_CO_4bet_BTN_call_BB_fold_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_SB_call_BB_squeeze_HJ_call_CO_fold_SB_4bet_BB_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_SB_call_BB_squeeze_HJ_call_CO_call_SB_4bet_BB_fold_HJ_fold_CO_call`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_SB_call_BB_squeeze_HJ_call_CO_call_SB_4bet_BB_fold_HJ_call_CO_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_SB_call_BB_squeeze_HJ_call_CO_call_SB_4bet_BB_call_HJ_fold_CO_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_SB_call_BB_squeeze_HJ_call_CO_4bet_SB_fold_BB_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_CO_call_SB_call_BB_squeeze_HJ_call_CO_4bet_SB_call_BB_fold_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_call_BTN_fold_SB_4bet_BB_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_call_BTN_call_SB_4bet_BB_fold_HJ_fold_BTN_call`: zero saved action support or no compatible participant hole cards
- `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_call_BTN_call_SB_4bet_BB_fold_HJ_call_BTN_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_call_BTN_call_SB_4bet_BB_call_HJ_fold_BTN_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_call_BTN_4bet_SB_fold_BB_call_HJ_fold`: zero saved action support or no compatible participant hole cards
- `HJ_open_BTN_call_SB_call_BB_squeeze_HJ_call_BTN_4bet_SB_call_BB_fold_HJ_fold`: zero saved action support or no compatible participant hole cards
- `CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_fold_SB_4bet_BB_call_CO_fold`: zero saved action support or no compatible participant hole cards
- `CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_call_SB_4bet_BB_fold_CO_fold_BTN_call`: zero saved action support or no compatible participant hole cards
- `CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_call_SB_4bet_BB_fold_CO_call_BTN_fold`: zero saved action support or no compatible participant hole cards
- `CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_call_SB_4bet_BB_call_CO_fold_BTN_fold`: zero saved action support or no compatible participant hole cards
- `CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_4bet_SB_fold_BB_call_CO_fold`: zero saved action support or no compatible participant hole cards
- `CO_open_BTN_call_SB_call_BB_squeeze_CO_call_BTN_4bet_SB_call_BB_fold_CO_fold`: zero saved action support or no compatible participant hole cards

## Implementation files

- `.gitattributes`
- `apps/frontend/docs/postflop-policy-knowledge.md`
- `apps/frontend/docs/specs/hu-postflop-after-multiway-preflop.independent-review.md`
- `apps/frontend/docs/specs/hu-postflop-after-multiway-preflop.policy-review.md`
- `apps/frontend/docs/specs/hu-postflop-after-multiway-preflop.result.md`
- `apps/frontend/docs/specs/hu-postflop-after-multiway-preflop.storage.md`
- `apps/frontend/scripts/data/hu-after-multiway-spots.json`
- `apps/frontend/scripts/postflop-ai/all-board-checkpoints.mjs`
- `apps/frontend/scripts/postflop-ai/audit-all-boards.mjs`
- `apps/frontend/scripts/postflop-ai/audit.mjs`
- `apps/frontend/scripts/postflop-ai/balance.mjs`
- `apps/frontend/scripts/postflop-ai/board-batch.mjs`
- `apps/frontend/scripts/postflop-ai/browser-inputs.mjs`
- `apps/frontend/scripts/postflop-ai/build-multiway-spots.mjs`
- `apps/frontend/scripts/postflop-ai/defence.mjs`
- `apps/frontend/scripts/postflop-ai/explain-later.mjs`
- `apps/frontend/scripts/postflop-ai/flop-base-core.mjs`
- `apps/frontend/scripts/postflop-ai/flop-ui-facts.mjs`
- `apps/frontend/scripts/postflop-ai/generate.mjs`
- `apps/frontend/scripts/postflop-ai/inputs.mjs`
- `apps/frontend/scripts/postflop-ai/local-view.mjs`
- `apps/frontend/scripts/postflop-ai/multiway-inputs.mjs`
- `apps/frontend/scripts/postflop-ai/package-reviewed-postflop.mjs`
- `apps/frontend/scripts/postflop-ai/publish-d1.mjs`
- `apps/frontend/scripts/postflop-ai/range-facts.mjs`
- `apps/frontend/scripts/postflop-ai/range-support.mjs`
- `apps/frontend/scripts/postflop-ai/restore-reviewed-postflop.mjs`
- `apps/frontend/scripts/postflop-ai/reviewed-postflop-archive.mjs`
- `apps/frontend/scripts/postflop-ai/reviewed-postflop.mjs`
- `apps/frontend/scripts/postflop-ai/simulation-parallel.mjs`
- `apps/frontend/scripts/postflop-ai/simulation.mjs`
- `apps/frontend/scripts/postflop-ai/spots.mjs`
- `apps/frontend/scripts/postflop-ai/verify-reviewed-postflop.mjs`
- `apps/frontend/scripts/postflop-ai/views.mjs`
- `apps/frontend/src/agent/AgentTable.tsx`
- `apps/frontend/src/agent/hand.ts`
- `apps/frontend/src/agent/preflop.ts`
- `apps/frontend/src/estimated/PostflopTrial.tsx`
- `apps/frontend/src/estimated/RangeWorkspace.tsx`
- `apps/frontend/src/estimated/action-path.ts`
- `apps/frontend/src/estimated/continuation-copy.ts`
- `apps/frontend/src/estimated/continuation-flow.ts`
- `apps/frontend/src/estimated/continuation-history.ts`
- `apps/frontend/src/estimated/continuation-ranges.ts`
- `apps/frontend/src/estimated/english-reasons.ts`
- `apps/frontend/src/estimated/postflop-browser.ts`
- `apps/frontend/src/estimated/postflop-compute.ts`
- `apps/frontend/src/estimated/postflop-trial.ts`
- `apps/frontend/src/estimated/range-url.ts`
- `apps/frontend/src/locales/reasons-secondary.json`
- `apps/frontend/tests/agent-table.test.mjs`
- `apps/frontend/tests/continuation-ui.test.mjs`
- `apps/frontend/tests/estimated-ui.test.mjs`
- `apps/frontend/tests/fixtures/postflop-legacy-fingerprints.json`
- `apps/frontend/tests/postflop-all-board-checkpoints.test.mjs`
- `apps/frontend/tests/postflop-artifact-storage.test.mjs`
- `apps/frontend/tests/postflop-low-spr-consumers.test.mjs`
- `apps/frontend/tests/postflop-multiway.test.mjs`
- `apps/frontend/tests/postflop-performance.test.mjs`
- `apps/frontend/tests/postflop-publish-d1.test.mjs`
- `apps/frontend/tests/postflop-report-contract.test.mjs`
- `apps/frontend/tests/postflop-trial.test.mjs`

## Independent review detail

- [Policy and core correctness review](hu-postflop-after-multiway-preflop.independent-review.md)
- [Policy authoring and audit status](hu-postflop-after-multiway-preflop.policy-review.md)
- [Artifact storage and verification](hu-postflop-after-multiway-preflop.storage.md)

## Acceptance-evidence integrity

- Independent storage review identified incomplete numerical dependency binding in the first manually recorded fixed-seed proof. The official CLI now captures its complete transitive source/config and raw input identities before and after a real replay; revision 3 has completed that new run. The earlier successful execution remains historical evidence, not a substituted final proof.
- All-board acceptance binds an exact compact set of 1,755 checkpoint rows, independently recomputed live-range reachability, per-reachable-flop fixed-seed turn/river coverage, and recomputed aggregates. Revision-safe immutable paths and hardened per-row checkpoints preserve prior results; the running numerical audit remains frozen. Existing `findings[].boards` values count finding occurrences across sampled nodes/sizes, not necessarily distinct flops; reporting must preserve that distinction.

## Upstream specification refresh

The first upstream refresh at `6edd86512a20e9008b93e9e70746b34daf556c58` changed four specification documents only. The later `61e457f4e35d8e28b2476b304a118b89dbf4be1f` contains merged PR35 native Google session support and PR36 public runtime configuration. All 16 files in that later delta were fetched through GitHub and verified against their exact Git blob hashes before inclusion. Their workflow, migration0008, backend, tests and previous receipt amendments remain intact. The HU spec explicitly requests a dedicated branch and Draft PR. Unrelated future three-way/stage3/profile implementation remains out of scope.

### Historical revision-2 all-board warning distribution

Warning counts below are occurrences, with distinct affected flops separately reported. These are heuristic advisories, not solver exploitability measurements.

| Finding | Occurrences | Distinct flops |
|---|---:|---:|
| `later warn bluff-ratio(under) river_ip_first` | 4595 | 1754 |
| `later warn bluff-ratio(under) river_oop_first` | 3497 | 1725 |
| `flop warn value-only-raise btn_vs_raise3` | 966 | 966 |
| `later warn value-only-raise turn_oop_vs_raise3` | 959 | 959 |
| `later warn value-only-raise turn_ip_vs_raise3` | 898 | 898 |
| `flop warn value-only-raise oop_vs_raise3` | 804 | 804 |
| `later warn overcall turn_oop_vs_75` | 346 | 346 |
| `later warn value-only-raise turn_ip_vs_75` | 283 | 283 |
| `flop warn value-only-raise oop_vs_raise` | 256 | 256 |
| `flop warn overcall ip_vs_33` | 224 | 224 |
| `flop warn value-only-raise ip_vs_33` | 203 | 203 |
| `flop warn overcall bb_vs_75` | 191 | 191 |
| `flop warn value-only-raise ip_vs_75` | 170 | 170 |
| `flop warn value-only-raise bb_vs_125` | 165 | 165 |
| `later warn value-only-raise turn_oop_vs_raise` | 164 | 164 |
| `later warn value-only-raise turn_ip_vs_raise` | 160 | 160 |
| `later warn overcall turn_oop_vs_33` | 158 | 158 |
| `flop warn value-only-raise bb_vs_75` | 148 | 148 |
| `flop warn value-only-raise bb_vs_33` | 146 | 146 |
| `flop warn overcall bb_vs_33` | 146 | 146 |
| `later warn value-only-raise turn_ip_vs_33` | 142 | 142 |
| `later warn overcall turn_ip_vs_33` | 125 | 125 |
| `flop warn overcall bb_vs_125` | 107 | 107 |
| `flop warn value-only-raise ip_vs_125` | 74 | 74 |
| `later warn overcall turn_oop_vs_125` | 67 | 67 |
| `flop warn value-only-raise btn_vs_raise` | 67 | 67 |
| `flop warn overcall ip_vs_75` | 32 | 32 |
| `later warn value-only-raise turn_oop_vs_75` | 31 | 31 |
| `later warn overcall turn_ip_vs_75` | 28 | 28 |
| `later warn value-only-raise turn_oop_vs_125` | 27 | 27 |
| `later warn value-only-raise turn_oop_vs_33` | 26 | 26 |
| `later warn value-only-raise turn_ip_vs_125` | 5 | 5 |
| `later warn overcall turn_ip_vs_125` | 2 | 2 |
| `flop warn overcall ip_vs_125` | 1 | 1 |
| `later warn overcall river_oop_vs_125` | 1 | 1 |

## Independent strategic review after the full-board run

- Large `bluff-ratio` counts compare the coarse `handTier=air` category to nominal bet sizing, not the equity-defined bluff cap. They do not by themselves prove actual under-bluffing. Some deep-raise warnings arise from raw-policy fallbacks on histories that are already all-in.
- Nonetheless the independent reviewer found a concrete revision-2 problem on `7c5d5hTsQd`, after flop/turn check-check and BB checking the river: HJ bet125 contained no equity-defined bluffs at 11.52% reached-range frequency, while BB `AcKc` had zero equity but a 29% call forced by the existing MDF floor. 27.06% of the defender range called more than five percentage points below price. Other sampled runouts of the same flop showed the issue.
- Revision 3 changes five IP checked-river rules to check/bet33 only. Independent seven-board preflight removed the observed positive pure-value large-bet/zero-equity-call branches; a smaller residual negative-margin call-floor effect remains documented. Shared MDF rules and all existing 45 policies stay unchanged. Revision 3 has fresh simulation, official replay and a complete all-board run. Broader independent effective-line probes found 21 positive branches (15 distinct wager cases) on five of seven diagnostic boards that still make value-only bets and force zero-equity calls outside the corrected IP checked line. For example, on `7c5d5h3c8s`, BB river bet75 after both streets check through makes HJ A9s call 42% with zero equity. A separate turn-bet75/call path exposes the same defect after the river bet merges all-in. Revision 3 is therefore held, and only the new later policy is being revised; the shared model and legacy policies remain unchanged. Revision-2 zero-error results cannot approve changed policy bytes.
- Twelve of revision 3’s 18 official advisories are below-reference BB simulation rows on `AhKh4h`, `KcKd4h`, `8c8d2h` and `5s5d4c`. The largest is `KcKd4h` against the aggressive reference: candidate +44.1495 BB versus baseline +60.2958 BB, delta −16.1463 BB (95% CI −17.2075 to −15.0852). This is a relative shortfall, not a −16 BB candidate loss. The comparison uses computed defence/caps for the candidate and fixed-tier reference policies for the opponent/baseline; candidate defence does not adapt its inferred range to the reference profile. These limitations do not erase a real comparison result. Audit PASS is reproducibility/consistency, not superiority to those references or solver-equilibrium validation.
- The 21,060 sampled rivers cover the existing audit’s selected bet/check paths, not every legal later runout or action history. River raise-response nodes are outside that audit node set; this limitation stays explicit.

## Build and bounded-resource validation update

- Production frontend build passed after isolated execution (Vite 4,720 modules, 4.41 seconds). Two existing service-site CSS parse warnings and the existing large-chunk advisory remain; this feature does not edit the affected CSS. Sites packaging tests passed.
- Final targeted admin/legacy/report/Sites set: 27/27 passed; all original 242 legacy JSON hashes and 45 Node/browser input hashes still pass. The admin inventory now includes all three new HU kinds, and the old Stage 2 baseline tests explicitly retain their original 45-ID boundary.
- Three previously memory-killed test files now pass with unchanged numerical coverage: flop-base 8/8, hand-EV 6/6, performance 8/8. The exact-EV regression adds 6/6 passing checks, including bit-identical cold-versus-packed storage over both flop trees. Full suite rerun awaits final source review/receipt reconciliation.
- New revision-safe evidence tests: 34/34 passed. Simulation compact-cache preselection was benchmarked with identical seeded output but no memory/time benefit, and was not adopted.
- All 1,888 preflop artifact records and the original 1,747,857-byte Stage 2 LFS payload match the original review bytes. Source-only receipt reconciliation remains independent work; this byte check is not an approval of changed code.

## Local D1 acceptance and browser boundary

- Actual Miniflare/workerd D1 verification passed with the real backend postflop route. All 45 legacy sets and unrelated sentinel rows across 13 tables remain unchanged. The new representative v3 pair/report round-trips through the API; exact SQL replay is idempotent; an intentional final `postflop_spots.slug` NOT NULL failure rolls the complete batch back; data remains identical after dispose/restart. SQL: 63,672 bytes, SHA256 `0d2af306077437aedc0c9bf2f3b91db50178de60354aecb1d5db67e671bc66d5`. This is local delivery correctness, not strategic/publication approval.
- A deterministic legal Agent preflop seed was found (`hu-qa-2097`, human HJ calls twice), with positive saved support for the human hand. An ignored local harness uses only a synthetic account and fixed dealer/seed; product authentication is unchanged.
- Real browser acceptance is blocked: the cloud browser rejected `http://localhost:5173/analyze/ranges` with `net::ERR_BLOCKED_BY_CLIENT`. No alternate host/network/control mechanism was used to bypass that restriction. Browser testing through the river is **not complete**; there is no configured PR preview in the current workflow/hosting settings. The user has authorized a separate isolated Mac QA session; its hash-pinned source/data handoff is being prepared, and no browser result is claimed yet.

## Measured full-scope workload and checkpoint delivery

- The representative costs about 38 minutes for simulation, independent replay and all 1,755 flops. At a uniform representative cost, Stage A’s 137 pairs would take about 87 hours and all 407 about 257 hours of serialized computation, plus authoring, review and rejected revisions. This is a scenario calculation, not a measured catalog average or completion promise; four diverse family benchmarks are next. No samples, canonical flops or independent replay are removed to fit a deadline.
- The working Draft PR may preserve an explicitly incomplete reviewed subset and be extended as Stage A is completed. Its status must retain all missing IDs/gates; a checkpoint PR is not a completed specification. Stage B follows the specified reach order and any deferrals remain explicit.
- Independent preflop source-scope review found 89 source records: 74 unchanged, 12 amended, 3 new, none removed. All 1,888 strategy byte records and the original archive are unchanged. Canonical publication/fingerprint/SQL validation is still required before amending the source receipt; the original strategy review and its limitations must be retained.

## Current browser QA handoff

The separate isolated Mac UI-only session has been authorized and started from a hash-verified source/data ZIP. It contains the exact representative provisional revision3 pair/report and deterministic legal preflop seed, not a strategy approval. Product source/account authentication remains unchanged; an ignored serve-only harness keeps account and strategy API requests on loopback and disables generation/OAuth. Baseline public font assets are preserved. Actual browser outcomes and screenshots have not yet been returned.

## Checkpoint validation before the approved model refinement

- Full frontend suite completed on 2026-10-04 at 12:23 UTC: 694 tests, 693 passed, 0 failed, 1 existing opt-in pinned-Wrangler integration skip; elapsed 836 seconds. No numerical test coverage or sample count was reduced. Heap384MiB/young-generation8MiB and serial test files avoided the earlier resource kills. The raw log SHA256 is `84ab1a8901c23c06901da3078b8d61f5484b2e00cf4fc3a0f1082e288e18e333`.
- Official Stage2 restore returned1614 exact LFS files. Official verify and check-bundle passed against the independently amended receipt; the complete SQL remains byte-identical to the original. Receipt tests9/9 passed. Original strategy fields and both upstream delivery amendments remain unchanged.
- Backend32/32 passed after a test-only correction distinguishing preserved historical preview data from publication eligibility; runtime API bytes remain unchanged. The upstream runtime-config imports also needed a narrow compile-time declaration bridge; no runtime body/config or strict compiler setting changed. Typecheck, build, Sites7/7 and Python serial-runner31/31 pass.
- The user has now authorized the scoped new-HU river exact-zero-equity floor exception. No implementation of that refinement is included in the preceding numerical evidence. Current v3 source/input bytes were preserved in full (47 source +12 input records). Its known strategic failure remains recorded, and all changed numerical evidence will be rerun after the refinement.


## 2026-10-04 18:36 UTC — exact model10 representative acceptance and delivery checks

This is a reviewed **1/407 subset**, not complete catalog coverage or production
release. Five policy pairs have been authored. The other four require model10
validation and independent acceptance; 402 pairs have not yet been authored.
Stage A remains incomplete (136 remaining), with Stage B's 270 following A.
Existing Agent no-multiway restrictions remain: catalog mapping of 407 is not
a claim that all 407 have been played through the Agent UI.

### Frozen accepted snapshot

- Spot: `UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call`, representative v3.
- Published source checkpoint: `791123af5324402764b0cc07d9b8cb73f2f237bc`,
  tree `5f54326afe3c716f3d13ff215ac160747d976f58`; exact local tree-equivalent
  checkpoint `7de20604e4bae57cb1c14cd25e5534c196fe7759`.
- Immutable run: `run-20261004T165546Z-fd2f72cb6fea4683b604402e48ce653d`.
  Its pin binds 57 runtime source files, 12 inputs and 25 handoff files.
- Full simulation: 1,016.581 seconds; separate full fixed-seed replay: 1,040.699
  seconds; all-board audit: 1,277.910 seconds. Each representative run retains
  72 comparisons × 10,000 paired deals. Total numerical phases: 55.5865 minutes.
- All 1,755 canonical flops were evaluated, none unreachable, zero errors;
  7,020 turn and 21,060 river evaluations follow the configured four seeded
  turns × three rivers per flop. This is not every legal turn/river runout.
- There are 20,642 advisories and zero clean boards: air-tier 7,100, MDF
  under-defence 10,019, raise-tier 2,067 and overcall 1,456. These remain visible
  in the accepted evidence; no numerical rule or warning was waived silently.

Independent Astra policy review examined the actual saved policies and observed
range/action semantics, then a separate Astra archive reviewer independently
verified all artifacts, source/input records, original phase logs/receipts,
1,755 checkpoint hashes/canonical classes and preserved legacy bytes. The
acceptance is a scoped AI estimate. Raw negative-EV calls, coarse board-made
tiers, below-reference results and reduced defence against unmodelled extra
bluffs remain limitations. It does not assert GTO, optimal response or uniform
quality across the remaining spots. See the bound independent review for the
full substantive findings and the 12/72 below-reference cases.

### Exact archive and independent receipt

The original DEF6 representative report was first preserved under its raw
SHA-256 in the ignored versioned policy-revisions directory. The exact DEF10
report and four audit/summary/companion files were then copied from the immutable
run using exclusive destinations. The run, both policies and legacy artifacts
were unchanged.

- `artifacts/postflop/hu-after-multiway.tar.gz`: 106,912 bytes; SHA-256
  `5fd7f87575a9509d9fa2667ff7f13bf556cdf69a31184c932c1a819849e88c04`.
- `artifacts/postflop/hu-after-multiway.manifest.json`: 128,033 bytes; SHA-256
  `8825c4338362d6f79b36f922f5f20eddbe117541ac3561bd59c26b971a76bfa7`.
  Seven artifact files, 80 reviewed source files and 12 inputs; its packaging
  approval remains explicitly unapproved, as required by the storage contract.
- `configs/hu-postflop-after-multiway.review.json`: 129,396 bytes; SHA-256
  `0cfd4476194ddbd511d2b3108fddb49c9cac83ba5ce4d73bb00c540a7a7c931d`.
  The independent receipt accepts precisely this one spot and names all 406
  deferred spots. Historical old-45 and five-pair foundation archives are separate.
- Official packaging plus complete proof/companion verification passed in 1.547
  seconds. The separate final official receipt verifier passed in 1.413 seconds,
  exit 0, reporting `independently-reviewed-subset-verified`. An unavailable
  `/usr/bin/time` wrapper had exited 127 before Node ran; the subsequent recorded
  Python timing wrapper ran the exact verifier successfully.
- The exact archive is preserved in the user's Library. LFS upload and empty
  storage re-download verification are pending, so the new pointer/manifest/receipt
  are not yet part of the published source checkpoint.

### Local D1 and required CI

`verify-local-d1.mjs` passed against installed Miniflare 4.20260515.0/workerd in
an isolated credential/proxy-free process and disposable persistent local D1,
2.540 seconds, exit 0, measured maximum child RSS 205,688 KiB. It applied all
current backend migrations and checked real sentinels in all 18 tables, including
Native auth and Ranked. All 45 historical policy/report sets and unrelated rows
were preserved. The actual API returned the exact selected spot/policies/report;
identical retry was idempotent; the deliberately invalid final NOT NULL insertion
caused full-batch rollback; restart retained the committed database and API result.
No production database was read or modified.

The selected delivery SQL is 63,685 bytes, SHA-256
`113b0e997ec08e5708dff2bed9239104990db226fb187a0cbd350a3664e40385`.
The execution/log and result are retained under `.local/hu-model10-first-tests/`
and `.local/hu-postflop-d1-JuVmPO/`. Log SHA-256:
`d3782737e1c60e93e7bf4b16efb55f4a8eaeff4fa908c3d6d1144a94ff13e3fe`.

The exact published source head's [required CI run](https://github.com/Suuu-sh/ReysonAI/actions/runs/37224378189)
passed, including preflop receipt/LFS/full SQL verification, strict preflop local
D1 roundtrip/idempotency/isolation/rollback, typecheck and build. Separate account
authentication and runtime-config workflows also passed. Deployment was skipped.
These required workflows are distinct from a final all-frontend test run.

### Remaining work and sequencing

Before validating hundreds of policies, a separately implemented minimal
`street-state` extraction will remove the genuine offline hand-EV dependency on
UI presentation code while retaining the UI wrapper as an explicit final review
source. Existing datasets/sizing/numerical rules remain byte-fixed. The current
accepted snapshot is preserved as history. The extraction must pass exact old/new
path, chip, legal-option, label/history and source-identity parity plus independent
review. It needs a fresh representative simulation/replay/new pin. The official
all-board gate may reuse immutable checkpoints only if the complete all-board
source/input/policy/config identity is exactly unchanged; otherwise it must
recompute all 1,755 boards.

The already-authored other four pairs are next in saved reach-frequency order,
then remaining Stage A, then Stage B. A simple 55.5865-minute-per-spot extrapolation
is about 126 serial hours for the 136 remaining Stage A spots or 376 hours for all
406 remaining spots. This is a resource scenario, not a completion estimate: it
excludes spot-dependent cost, authoring, review, revisions and the shared queue.
Final full frontend tests, shared-source integration, model10 real-browser QA,
LFS delivery, all remaining policy gates and release approval are still outstanding.

At 19:10 UTC, the independent delivery reviewer confirmed a two-field,
meaning-preserving author/reviewer display-label correction. All evidence and
acceptance scope remained unchanged; the original 009f0211 receipt is preserved.
The corrected receipt passed the same official verifier in 1.457 seconds, exit 0.
Its Library version is 1; the archive and manifest bytes did not change.


## 2026-10-04 19:14 UTC — shared numerical/UI extraction checkpoint

The minimal street-state extraction passed independent implementation review.
The final nine-file patch SHA-256 is
`3a81c54f7610c90d08e5bbba6cd2ca977a5b46a21e44dbbac1f41e8b734e7332`.
Only shared chip/path/ordered-option facts move into `street-state.mjs`; offline
later-hand EV and later explanations import it directly. UI labels/history and
intent remain in `postflop-trial.ts`, which is an explicit publication-review
source root. Source-capture filters and gates are unchanged. Stage3's live-seat
UI addition can remain outside the numerical graph.

A zero-stack river display discrepancy found during independent review was
recorded as a real before-fix failure, then corrected to preserve the exact old
output. The final oracle validates the immutable prior module and dependencies;
its private replay is exposed only in a separate exact-copy fixture with a
45-byte export suffix, leaving the original untouched. Exact comparisons cover
all 452 inputs (407 new plus 45 legacy), 246 geometries, 7,064 flop paths, 43,254
turn paths, 135,604 river paths, 188,852 old later action-block outputs, 19,002 raw
alias cases, 143,527 illegal-action cases and 654 boundary cases. Full oracle
passed in 105.787 seconds, peak RSS 283.2 MiB; nine new contract tests also passed.

The focused existing consumer suite has 215 passing assertions and zero skips,
including old45 actual goldens, Agent/Range, hydration, all407 Node/browser inputs,
source identities and archive contracts. The initial run had 199 passing tests
and two file-level failures because the historical foundation archive was only
a Git LFS pointer in the isolated checkout. Materializing the exact already-known
127,590-byte object resolved the setup; those 16 tests passed on a recorded rerun.
No implementation/test assertion was changed to waive that failure. Both logs
are retained. Configured typecheck and production build passed. Existing CSS
minification and large-chunk warnings remain; all 11 CSS files match the baseline.

Independent review verified the final patch, actual logs, oracle provenance and
unchanged 31-file all-board graph, 54 protected runtime sources, 12 inputs and
92 Stage2 receipt sources. This is a GO for pure extraction/parity and shared
source integration, **not new numerical or production acceptance**. The prior
one-spot archive remains an immutable historical accepted snapshot, additionally
copied with its exact 95 source/input/archive/manifest/receipt files into a
separate historical repository and successfully checked by the official verifier.
The current source needs a new pin, fresh representative simulation/replay and
the unchanged official full1755 gate. Checkpoint reuse is allowed only by that
existing gate under exactly equal full numerical identity; no proof is relabelled.
