# Stage 3 independent numerical review

## Status: numerical/reason/source approvals recorded; release gates pending

Reviewed on 2026-10-04, through 14:53 UTC, independently of the range author. This report covers the numerical source, four raw artifacts in `.local/stage3-full`, identical formally installed artifacts, all 1,801 compact reasons, and the Stage 3-specific delivery source/actual archive checks described below. No blocking finding remains within this reviewed scope. It is **not** approval to merge, deploy, import production data, or claim a passing complete test suite.

Full semantic reason checking, current reason fingerprint, final installed-byte comparison, focused tests, actual local archive-object checking, and exact receipt comparisons now pass. The Stage 3 approval receipt and separately scoped Stage 2 source-only renewal are recorded. Remote LFS delivery, full-suite/build/strict-D1/exact-head-CI results, receipt-bound clean restoration, and browser acceptance remain separate release gates. Stage 2 data is unchanged.

## Scope and method

- Read the Stage 3 specification, relevant AGENTS instructions, authoring instructions, Stage 1 scope, and Stage 2 result/storage documentation.
- Reviewed `stage3-catalog`, `stage3-tree`, `stage3-model`, `stage3-call-ev`, `stage3-responses`, `stage3-audit`, `stage3-coverage`, the generator/profiles, reason projection/decoder, and semantic publication checks. Also reviewed their existing joint sampler, dedicated best-five evaluator interface, shared call/all-in rules, and joint-defense implementation.
- Independently checked the raw artifacts with bounded-memory Python, rather than merely accepting their saved audit summary. The largest observed review process used 272,512 KiB peak RSS; each full-data check completed in under three seconds. No Node test, audit, generation, or resampling process was started during this raw-review window.
- The inherited HU work and narrow integration changes are outside this numerical review. The Stage 3 entry-point lazy import was inspected as a non-numerical dependency/loading change; its new regression still needs execution at the final revision.

## Exact raw artifact identity

These reviewed raw bytes also match the formally installed four artifacts byte-for-byte:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `stage3-responses.json` | 35,108,822 | `06a14c0b4c5e14ed677b931d3c47b96dcc7fd2f8052da1ffac2b1f006f5ebada` |
| `stage3-call-equities.json` | 8,952,905 | `83a6bab928383cc614ec6638981b137e689f26f571321f6c7df596527648b389` |
| `stage3-audit-report.json` | 1,567,263 | `6b0247242a67c978955c89c9d4d429ba405522affaad03f410d040d44a3f8c58` |
| `stage3-coverage.json` | 6,984,523 | `4f275ed38505cb1e8d27f1e3083573aa3dba9dc65f52ec8eeddcc04132a3e766` |

Total raw size is 52,613,513 bytes, excluding reasons and authoring inputs.

The independent baseline hash comparison still passes for all **1,888 prior JSON files and 19 protected numerical/configuration sources**. The final focused tests reverified these and the Stage 2 archive at 1,747,857 bytes, SHA-256 `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`.

## Full-data findings

The independent checks confirm 1,801 stored decisions and 304,369 hand rows. Stored families are:

| Family | Stored | Impossible omissions | Rare omissions |
| --- | ---: | ---: | ---: |
| Squeeze plus entrant | 522 | 1,398 | 0 |
| Two-caller squeeze plus entrant | 248 | 3,664 | 0 |
| Cold-three-bet call plus entrant | 806 | 364 | 0 |
| Cold-four-bet plus entrant | 225 | 195 | 0 |
| Three original callers | 0 | 0 | 4,836 |
| Four original callers | 0 | 0 | 3,874 |
| Total | 1,801 | 5,621 | 8,710 |

For every stored decision, the independent replay verified:

1. Acting order, folds/all-ins, posted blinds, actual contributions, pending actors, prior-action sources, bet level, full-raise increments, pot, dead money, incremental call cost, and legal raise totals.
2. All 169 canonical hands, integer action frequencies summing to 100, unavailable actions at zero, and exact raise-size fields.
3. Each participant's precise saved own-action product and the full live/dead opponent input ranges. No HU substitute was used for later participants.
4. Nonzero own reach and joint card feasibility for every saved equity. The 2,916 own-supported but jointly impossible individual hands are genuine fold100/null-equity placeholders.
5. The explicit authored hand-group profile, regular EV gate and three-bet fill, all-in mix, and strength ceilings. Recomputing this sequence reproduces every final action row. No positive-EV repair increment was needed in this candidate.

The saved final equity table contains 32,749 unique hand/range inputs: 8,230 three-bet-facing, 11,881 four-bet-facing, and 12,638 all-in-facing equities. Sample counts remain 12,000 / 20,000 respectively, representing 494,092,000 accepted deals in the final unique inputs. This is not a count of additional work in the last resumed process or a claim of independent resampling of every equity.

All 16,132 coverage entries have unique IDs. Independent reconstruction from saved source actions established all 7,422 nonrare histories' classification: 1,801 supported and 5,621 impossible. The stored-ID set matches exactly; no missing supported history was found. The 8,710 rare entries belong to the seven rigorously bounded roots below. The subsequent current-source Node publication validator and catalog tests also pass.

## Rare-history interpretation and card conditioning

The configured cutoff is ratio `0.0001`, meaning **0.01% of all deals**. It is not 0.01 as a ratio and is not the conditional frequency of the final response after earlier actions have already happened.

For four independently proposed uniform holecard pairs,

`P(disjoint) = product(C(52 - 2i, 2) / C(52, 2), i = 0..3) = 0.6134158110800204`.

The six three-caller own-action products, including the opener, range from 0.0000690296% to 0.0003056885%. Dividing by that disjoint probability gives rigorous legal-deal upper bounds from 0.0001125332% to 0.0004983381%, all below 0.01%. These bounds do not assume independent hands after conditioning on card legality.

Example: HJ open, CO call, BTN overcall, SB third call has uniform-combo policy averages 23.5294%, 6.26697%, 3.39367%, and 0.61086%. Their product is 0.0003056885%; its joint upper bound is 0.0004983381%. SB's 0.61086% is an individual conditional-policy average, not the full-history probability. Exact joint history probability remains unknown and correctly stored as null.

The four-caller history uses the already rare known prefix as an upper bound, with the unrecorded next action bounded by one. It does not invent a fourth-caller policy. Forced outside folds are marginalized/unmodeled; including their actual fold probabilities could only reduce the unconditional full-history probability.

## Joint-defense evidence and warnings

Independent recomputation verified:

- Exact coverage of **469 reachable raise-defense events** and **1,074 responder policies**.
- First-response participant ranges equal the exact saved source-action products, including observed folded participants.
- Every hand-specific saved fold/capacity entry agrees with the current policy and independently recomputed legal call capacity/strength ceilings.
- Risk is incremental investment and the threshold uses the whole actual pot before the raise.
- All saved Monte Carlo confidence intervals reproduce from their moments and the conservative empirical-Bernstein rule. Total accepted defense tuples: **9,400,000**.
- **457 events pass** with the all-fold upper confidence bound at or below the threshold.
- **12 events are genuine saturated capacity conflicts**: independently checked supported-hand saturation, with capacity lower confidence bounds above the threshold. They are warnings under the prescribed model, not evidence of equilibrium.
- The **six over-segregated warnings** reproduce from own-action-reach × combo weighting: pure-action support is approximately 85.7%, with two actions each at least 10%.

There are zero blocking findings and exactly 18 warnings: 12 `ev-capacity-conflict` and six `over-segregated`. All are in the cold-three-bet-call-plus-entrant family. A representative conflict is the UTG-open/HJ-3bet/CO-call/SB-entry line where SB subsequently shoves after UTG four-bets: all-fold approximately 79.05%, lower bound 76.77%, versus 67.15% break-even. Representative segregation is SB's response after BB calls and UTG raises to 20BB with HJ calling. The complete IDs and numerical evidence remain in the reviewed audit artifact.

## Earlier findings and corrections

Two earlier acceptance gaps were identified and are fixed in the reviewed source:

1. The publication gate previously accepted decodable reason facts with a correct source fingerprint without comparing their contents. It now compares the **entire compact payload** to `stage3ExpectedCompactReasons`, a read-only projection of saved strategy/equity inputs. Negative tests cover changed mixes, equity, EV, pot facts, templates, and additional fields.
2. The audit previously permitted extraneous equity/defense keys for omitted or unknown histories. It now requires exact equity IDs/table identity and exact reachable defense-event IDs; negative regressions cover these failures.

The source walkers explicitly include the generator and follow literal dynamic imports. Current-source execution of these regressions and semantic checking of every generated reason now pass, including the three lazy-loading changes in build, audit, and publication entry points.

## Checkpoint evidence and limits

The independently inspected smoke run has 15 stored / 13 impossible decisions and 441 equities, representing 6,764,000 accepted deals. Its resumed and fresh runs have byte-identical four data artifacts and all 15 reason files / 2,535 hand explanations. Every smoke reason's frequencies, equity, placeholder state, and arithmetic EV was independently checked.

Later checkpoint-control changes only change pause scheduling and source provenance; they do not alter the sampler or numerical algorithm. Archived smoke reasons are therefore historical reproducibility evidence, **not current-source publication approval**. The full run resumed after two pauses and completed in one reconciliation pass with no repairs. Interrupted repair-pass reproducibility is not established by this zero-repair candidate.

The numerical model remains an independent AI estimate: all-in equity assumes the currently live opponents continue to showdown, while the pot credits only actual contributions plus Hero's current call. Pending future calls, future selective ranges and raise EV are not solved. Aggregate displayed frequencies use own-action reach, not positive joint blocker-mass reweighting. The entrant-fold boundary explicitly resumes unchanged Stage 2 with that entrant's cards unmodeled. These assumptions must remain visible in the final report/reasons and must not be presented as GTO guarantees.

## Formal installed candidate verification (14:40–14:42 UTC)

The authorized single-process Node check used `--max-old-space-size=768 --max-semi-space-size=8`. `assertStage3Publication("src/estimated")` passed in 14.829 seconds and checked the full catalog, every saved equity/audit/coverage entry, and every complete compact reason payload against current saved inputs. The fingerprint is:

`a3b44b0e1fdf14e306d33335cdfa93196e214342a3500bd7883745da1cf522d6`

All 1,801 reason files / 304,369 hand explanations share this identity and total 7,414,187 bytes. The four installed numerical artifacts retain the hashes above.

The following serial focused run passed **28 tests, zero failures, zero skips**, in 9.470 seconds: `stage3-authoring`, `stage3-publication-reasons`, `stage3-delivery`, `stage3-storage`, and `stage3-legacy-preservation`. These include source-graph/literal-dynamic-import coverage, all three lazy-entry regressions, changed-reason and extra-equity/evidence negatives, deterministic fixture packaging, archive attack guards, and exact restoration of long history names. Maximum observed child RSS across verifier/tests was 645,316 KiB. The Node slot was released immediately afterward.

Independent streaming Python checked the actual local archive against every current artifact body:

- Format: `ustar+gzip-stage3-content-v1`, with content-addressed objects mapped to exact destination paths by the reviewed receipt.
- Archive: 2,436,451 bytes; SHA-256 `930d88207c2aa31430eb28570f7d90e064bb3680c40203d5e860bfe9289eac7b`.
- 1,805 artifacts / 1,805 unique regular objects; 60,027,700 uncompressed artifact bytes.
- Every object hash/size matches the current installed artifact; sorted paths, fixed ownership/mode/time metadata and gzip timestamp zero were checked.
- Sorted artifact-record-array SHA-256: `5ee2be29e51a468e8e58fb9dcee0cc9017de1118e34ba4eb66986524aa542937` (compact JSON records with `path`, `bytes`, `sha256`).

## Approval scope and outstanding gates

The independently reviewed Stage 3 numerical policies, final strategy/equity/coverage/audit bytes, all final reasons, and Stage 3-specific authoring/storage/verification/delivery changes are approved **only for the exact artifact/archive/source records independently compared here, with the scope/limitations below retained**. Both the Stage 3 receipt and separately scoped Stage 2 source-only renewal were recorded after their exact candidate comparisons.

Stage 2 renewal is **source-only**: its 1,888 artifact records, archive, protected numerical sources, frequencies and reason identities must remain unchanged. Adding Stage 3 to its delivery dependency graph does not approve Stage 3 data through the Stage 2 receipt and does not grant a new quality approval to inherited HU policies.

The remote-source reconciliation was independently checked against the parent-provided direct GitHub connector evidence for commit `44e6ef5f94ce08ed1fe0d9338b1aafcabef52043`, tree `7de23edbc1247971c5061626a16a2aea832bec86`, containing 827 blob records. Before final receipt renewal, the independently reconstructed Stage 2 dependency graph has 112 paths: 84 match remote Git blob hashes, eight are reviewed Stage 3 delivery/CLI modifications, and 20 are new Stage 3 files. The Stage 3 graph has 95 paths. All 26 shared `postflop-ai` dependencies in these graphs match the remote blobs exactly; none is changed by this candidate. The later Stage 2 receipt update itself must be reflected in Stage 3's exact source records. This establishes inherited-source identity, not new HU-policy quality approval.

At 14:48 UTC, the independent exact Stage 2 candidate comparison passed against `reviewedFiles()` and a freshly computed continuation reason fingerprint. All original review metadata, amendments, 1,888 artifact records, archive identity and counts were preserved. The reviewer recorded only the new source-renewal result and reviewed source/content identities in `configs/multiway-preflop-stage2.review.json`: 497,171 bytes, file SHA-256 `b2678c8b40f9829c091534e2855443b3e3a8019aed3ab2022dfdeb4566b75c19`, content SHA-256 `94528c03c99778d5b47069d11604dd2b616fd4ee839fc807c845e5637caab5a3`, unchanged continuation fingerprint `b3538b0c44f04016e57d6eb76802665cf405d65f87e856b9860ed8a479065e53`. `remaining_gates_at_review` records historical limitations; passing a later release gate does not require rewriting this review evidence.

At 14:52 UTC, the independent exact Stage 3 candidate comparison passed against `reviewedStage3Files()` and `assertStage3ReviewRecord`: all 1,805 artifact records, 95 current dependency records, archive identity, counts and final reason fingerprint matched. Its source records explicitly pin the finalized Stage 2 receipt above. The reviewer recorded `configs/multiway-preflop-stage3.review.json`: 499,206 bytes, file SHA-256 `ff0f1db8f46e0cf5bd383daba027d24dcfe534c6d4ad4d191b142dc1a16e5745`, content SHA-256 `436aff83c5fdca28d9247042cad3a281f178c0d463e12fc0302314f332db48ef`. Its review metadata identifies the reviewer, timestamp, report, inherited HU commit, exact verification scope, 18 retained advisories, model limitations and `remaining_gates_at_review`. This binds the completed independent review to exact bytes; it does not mark outstanding release gates complete.

Remaining gates:

- Establish receipt-bound clean restoration of both reviewed snapshots and preserve their exact recorded identities through publication.
- Establish remote LFS upload/fetch/hash, not merely the tested local archive or a committed pointer.
- Establish required full-suite, typecheck/build, strict local-D1, exact-head CI, and browser acceptance results. These are separate release gates and are not implied by this numerical review.
- Any change to reviewed numerical sources, artifacts, reason templates/projection or verification logic requires renewed relevant checks before using the approval record. Unrelated inherited HU policy quality remains outside this scope.

## CLI summary integration amendment

The first complete serial suite exposed two integration gaps after the full Stage 3 snapshot was installed: the older all-reason test did not enumerate/decode Stage 3, and the CLI appended Stage 3 findings without refreshing its shared balance summaries. An independent Astra static review approved the exact three-file correction (`28b1bb3c72d7c61bf96f9a00fb20039a01673da7ab9f76f1ded10f7367b67728`). The corrected tests require every Stage 3 hand and its exact saved mix, explicitly validate zero-reach placeholders, and check all 1,801 metrics and 12 capacity conflicts in the combined report.

After application, the production build passed in 4.74 seconds and 45 targeted tests passed with zero skips in 27.94 seconds. A separate independent source/receipt review re-executed the exact-byte checker, reconstructed the prior wrapper from the reviewed patch, checked both regression tests, and confirmed all 1,888 legacy artifacts, 1,805 Stage 3 artifacts, both archives and protected numerical sources remain unchanged. The only bound source change is `scripts/audit-estimates.mjs`, SHA-256 `0df6c40b63b91474ef9b3adef71e1e9070dfa58f10a37be8f22d8ea7a63b78de` to `a83fa329de14492b8b2476ccff04fb28f710aa27664f5799687d09d952ab7fdb`.

The receipts now retain all previous review metadata and add this limited source-summary amendment. Stage 2's updated receipt body is correctly rebound as a Stage 3 source dependency. This is not a new numerical approval or a declaration that the remaining full-suite, clean-restore, D1, remote-LFS, CI or browser gates have completed.

## Bounded canonical delivery amendment

Combined delivery initially terminated with SIGKILL at both 768MB and 512MB heap settings; the underlying kill cause was not established. The separately authored six-file correction (`99ad1aa7dbf2712d9ba8d8e99229fce8cef0685106a58fbce5da2e8106b9b110`) serializes one compact dataset and complete SQL lines at a time. It preserves the old recursive locale order and numeric object-key enumeration, quoting, 30,000 UTF-16 code-unit boundaries, schema/newlines and every dataset metadata field. File validation compares every raw byte with bounded buffers, rejects early EOF/trailing content, checks each replayed source identity, and rechecks immediately before any production import. Both full numerical/publication verifiers remain mandatory.

Independent static review and the parent’s re-execution of the source/receipt checker confirmed the original full preflop verifier body is byte-identical (`8e030bc4e52bb64da73390081171d6911eadb93f056fabdd5d307972ba37b34d`). The Stage 2 graph grows from 112 to 113 paths only by adding the serializer. Stage 3 changes from 95 to 67: the same serializer is added, while 29 incidental generic-publisher/postflop dependencies disappear because delivery imports the pure serializer directly. All Stage 3 generation/model/equity/audit/coverage/reason and full verification dependencies remain bound and unchanged; removed paths remain bound by the separately required Stage 2 graph where applicable.

All five new streaming tests and fourteen existing delivery/workflow/Stage 3 tests passed (19/19, no skips) in 5.09 seconds. Mutated SQL, early EOF, trailing content, missing SQL, changed/missing/added source datasets and substituted metadata were rejected. The independent frozen original serializer and new implementation produced matching metadata for all 3,693 datasets / 7,126 parts; all 129,253,470 SQL bytes were directly compared, with SHA-256 `25d7f2a99ff7e7b0603116ab533a72e4a48f369b277e170b8db52d7e64791443`. The full streamed comparison took 5.54 seconds and reached 289,596 KiB peak RSS.

At 17:55 UTC the independent parent authorized only this verified delivery-source amendment. All 1,888 legacy and 1,805 Stage 3 artifacts, both archives and numerical gates are unchanged. Final receipt identities for this amendment:

- Stage 2: 501,343 bytes; file SHA-256 `120f8175d2283ee35c9c11fc034738ac3ac0b9a419546980f99f069d1bfc4771`; content SHA-256 `3c50a40a4ce0c156c4ec472993ca7f2afe9cfc40d453bd3b9e41411482fb6631`.
- Stage 3: 498,042 bytes; file SHA-256 `919ea2ec5dc3adf8e035a21042579d15b6a3f006f1ed8f224c01a95b9ec2798b`; content SHA-256 `5df912bdedd469cd3b0e0a245a7d5fc094fe144d26fb4a41b6f304be73e4c0e7`. Its source records bind the exact final Stage 2 receipt body above.

Official delivery build/check, renewed clean restoration/final suite, strict full D1 roundtrip and rollback, remote LFS, exact-head CI and browser acceptance remain separate gates. The independently approved source amendment does not authorize or claim those operations succeeded.

## Final shared-HU compatibility amendment

The independent source-compatibility reviewer approved the exact three-way integration from local HU `a6fa187351650297c1e7714f363e72759dc724f5` to stable local HU `3ab7ad54822d77d2a59821d24878eb47d19e4a76` / tree `0ef7e64db3717349b66d4bfa2adf4bba2dd1539f`. All 66 integration paths are bound by ledger SHA-256 `7cbcac3077328ca4a034beac70df28d0ba702cccc15f07dc2d271ac6f0c526be`. The independent report SHA-256 is `bd04a9b5676e12b6fbce40546a79fe2d72d55030f19529719bd3a9dba7af275c`.

The final postflop trial differs from stable HU only by Stage 3's required live-participant priority. Shared URL merging preserves the Stage 3 root/actions while adding HU's validated observable-action canonicalization. All 1,888 legacy and 1,805 Stage 3 artifacts, both archives, 19 protected numerical sources and six bounded delivery files remain exact. HU's numerical/all-board graphs match the stable commit and do not reach the UI wrapper or Stage 3 modules; all 12 raw HU inputs also match the stable receipt.

Stage 2 changes from 113 to 116 source paths, exactly the nine changed and three added dependencies already independently checked in HU's separate source-compatibility amendment. No source is removed. Stage 3 remains 67 paths and rebinds only the final Stage 2 receipt file. Every prior review metadata field and delivery amendment is preserved; HU's fifth amendment is appended verbatim with an explicit boundary between its historical 89→92-source / 68,705,643-byte Stage2-only SQL proof and this checkout's combined validation.

The original complete Stage 2 and Stage 3 verifiers passed against the isolated candidate, followed by exact comparison of all 3,693 dataset records / 7,126 parts and all 129,253,470 SQL bytes. Independent review then confirmed the metadata-only finalization and exact canonical receipt coupling:

- `configs/multiway-preflop-stage2.review.json`: 525,358 bytes; file SHA-256 `e45f85eb251fb077165b2421fbadf6fcb42128b1b74b5c1ab4656049d9c7bc1e`; content SHA-256 `4075f163fe37e44f16a493a56dcfe5c912876e9f06ec548a5ff4d149c5e7172d`; 116 sources / 1,888 artifacts.
- `configs/multiway-preflop-stage3.review.json`: 509,233 bytes; file SHA-256 `13b2c8e8a8bd2561420f0af8ca1db3c8b7dda71678c9ebbf0e909f8e6f83e37f`; content SHA-256 `e0ef4099b67ab7ee7053318493dc6cbc06c44b73bb03a333392a24e93038f665`; 67 sources / 1,805 artifacts.

Later execution on this exact integrated source passed 836/836 complete frontend tests, zero failures/skips, plus final official delivery build/check and first/repeated empty-tree restoration. These later results are recorded in the result document; historical `remaining_gates_at_review` fields are intentionally retained. Strict whole-delivery D1, remote LFS, browser, complete commit/PR and required exact-head CI remain open. This source-only amendment does not accept a HU policy or grant production approval.

## Subsequent storage status — 2026-10-05

After the numerical/source reviews above, the owner explicitly approved the exact 509,233-byte Stage 3 receipt for the same private repository; blob `d7441c9e2610da454e35c668cbe57d6645c55bd3` matches the reviewed file. Authorized Mac execution also completed object-only LFS upload followed by a fresh fetch into separate empty storage, reproducing archive SHA-256 `930d88207c2aa31430eb28570f7d90e064bb3680c40203d5e860bfe9289eac7b` and 2,436,451 bytes. This later storage result does not rewrite historical review limitations or approve D1, browser, CI or production deployment.

## Ranked workflow source-compatibility amendment — 2026-10-05

The independent parent read the four-file Ranked patch and both proposed receipts, reran the complete receipt preparation, and checked all 1,888 legacy and 1,805 Stage 3 artifacts, both archives and the 116/67 source candidates. The current workflow differs from the production hotfix only by the already reviewed Stage 3 restore and test additions. It preserves the exact main-only deployment condition, original independent verification, full-D1/bundle checks and ordering. The candidate was approved as a limited source-compatibility update.

Only the workflow source record changes in each graph; Stage 3 also rebinds the final Stage 2 receipt body. Every prior review field and amendment is retained. The current two receipts are:
- `configs/multiway-preflop-stage2.review.json`: 529,120 bytes; SHA-256 `3ea5d252dd257d75677ccff61bf94a3aa639066f3e32c7e20ed076b80ec3fb2b`; content `9b2a266fe502f2f04de46d1308d89908d3eb5b9d7cd635543f29397d92b7f476`.
- `configs/multiway-preflop-stage3.review.json`: 512,995 bytes; SHA-256 `2a9dcb1dc46b38a86836a86b0afe3dfcdc025f5a8944b7c2ece3a55692bc1b4c`; content `1533778dd4ec63139dd7611d38aecca66cce5ccfac9e29a2a82c65b591f68222`.

The separate upstream display merge introduces no numerical source or artifact change. All 41 Stage 3-specific workspace lines survive exactly; the inherited RangeContextCard uses existing reset/edit callbacks and current visible board blocks. Backend 11, current frontend 91 and Sites 7 targeted tests passed with zero skips, along with typecheck/build. Both complete verifiers and every canonical SQL byte passed afterward. This amendment is not full-D1, browser, CI or production approval and does not relabel the earlier 836-test run as a later full-suite execution.
