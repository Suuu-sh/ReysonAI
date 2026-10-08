# Multiway preflop Stage 3 result

## Review status

The numerical/reason snapshot remains independently reviewed and byte-identical. The current source preserves published Stage 3 head `b3905029d0a4c4cc696edf15dd72ae369bb1827a` and integrates fixed development `e695dc94625260b8ac620cd489c5fc24097e3252`, including TypeScript, Stats and FastFold. Independent source/data review, complete scoped input parity, both strict typechecks and **132 targeted tests** pass. Heavy current-tree delivery/SQL, full-file D1, real FastFold workerd and build gates are delegated to the unchanged required PR workflows, not claimed from older local results. See the bounded FastFold integration record below and [independent source review](multiway-preflop-stage3.typed-integration-review.md).

The preserved earlier checkpoint passed the full frontend suite **836/836** and strict whole-delivery D1 CI. Those remain historical results, not a current full-suite or current 21-table D1 pass. Exact-head CI is tracked on [Draft PR #50](https://github.com/Suuu-sh/ReysonAI/pull/50). The required preflop browser flows passed on head `0d0be207`; the authenticated unsupported-postflop screen remains **NOT RUN**, because Guest sign-in intercepted it and supported Mac browser control later became unavailable. No production merge, deployment or D1 import has occurred. Earlier blocker descriptions below are chronological history and are superseded by this status and the newest integration record.

These are independently authored AI estimates, not a jointly solved strategy or a GTO-quality guarantee.

## Source and scope

- Initial source: development `61e457f4e35d8e28b2476b304a118b89dbf4be1f`, tree `1387907dae53f1f63c09f3ac200641726f17b267`.
- Agreed later reconciliation target: development `50bae3bce4beed13994967c78cfee36b4e2becb8`, tree `e75f21b57364eb615c3e277550e0c5f37dcda663`. These changes are integrated through HU checkpoint `0c48dd03bca2d1de7c3178f5e0dffa7990af0a74` (tree `d15d45ede6913d60ab906f75b7d6b062403cd413`); the later hydration/guard/18-table D1 changes are now integrated through HU commit `44e6ef5f94ce08ed1fe0d9338b1aafcabef52043` (tree `7de23edbc1247971c5061626a16a2aea832bec86`). That checkpoint also reconciles development `b5e20e47d9c7c5afc19bafed46b9d39a7316c14f`. The narrow published PR43 legal/ranked guard patch is also retained.
- The shared Stage 1/2 action-path UI comes from the HU-after-multiway work. Stage 3 is stacked on that common implementation, rather than independently rewriting it. HU postflop policy generation/acceptance is a separate deliverable.
- Existing 1,888 estimated JSON/reason/profile files, 19 protected numerical/configuration sources, and the original Stage 2 archive are pinned in the immutable Stage 3 preservation fixture. They have been independently hash-checked against the initial source; final integrated verification repeated these byte checks successfully.
- Added datasets are isolated under `stage3-*.json`; compact reasons use `reasons/s3_*.json`. Expanded JSON is ignored and must not be committed. Storage follows the separate deterministic Stage 3 Git LFS archive and normal-Git review receipt.

### Structural coverage

| Family | Starting histories | Decisions |
|---|---:|---:|
| Additional entrant after one-caller squeeze | 15 | 1,920 |
| Additional entrant after two-caller squeeze | 6 | 3,912 |
| Additional entrant after existing third-party 3bet call | 15 | 1,170 |
| Additional entrant after cold 4bet | 15 | 420 |
| Three original callers | 6 | 4,836 |
| Four original callers | 1 | 3,874 |
| Total | 58 | 16,132 |

There are 18,620 structural terminal histories and 51 explicit entrant-fold boundaries. Structural counts are not claims of positive reach or published strategy coverage. The complete generated coverage artifact records each decision's saved, unreachable, rare or missing status and its reach evidence.

For the extra-entrant families, exactly one previously unacted seat may enter. Other outside seats fold. The entrant's fold resumes the unchanged Stage 2 forced-outsider model; its folded cards are intentionally unmodeled across that legacy boundary. Once the entrant calls or raises, its exact saved action factors, cards and chips are retained for all subsequent original-participant responses. No heads-up range substitutes for a missing participant.

### Full generated coverage

The completed first pass saves 1,801 decisions / 304,369 hand-class rows. Another 5,621 decisions have exact zero reachable support and 8,710 decisions belong to the seven conservatively rare roots. There are zero missing structural decisions.

| Family | Saved | Unreachable | Rare |
|---|---:|---:|---:|
| One-caller squeeze + entrant | 522 | 1,398 | 0 |
| Two-caller squeeze + entrant | 248 | 3,664 | 0 |
| Third-party 3bet call + entrant | 806 | 364 | 0 |
| Cold 4bet + entrant | 225 | 195 | 0 |
| Three original callers | 0 | 0 | 4,836 |
| Four original callers | 0 | 0 | 3,874 |

The four raw saved artifacts total 52,613,513 bytes. The 1,801 compact reason files add 7,414,187 bytes, for 1,805 files / 60,027,700 bytes before compression. The deterministic archive is 2,436,451 bytes, SHA-256 `930d88207c2aa31430eb28570f7d90e064bb3680c40203d5e860bfe9289eac7b`. A repeat package and an independent USTAR/object-hash scan reproduce the exact bytes. Actual LFS transfer and approved-receipt restoration remain pending.

### Rare three/four-caller histories

The specification's strict 0.01% cutoff applies only to three/four original callers, not the extra-entrant families. All seven current roots are below it, so their complete structural decision lists remain explicitly unavailable and no strategies, equities or hand-reason files are fabricated for them.

The metric is the unconditional probability of the complete observed history from a random deal, including the opening action. It is not the conditional frequency of the next player's decision. Each participant's complete own-action weight is averaged over its 1,326 combinations. The product of those marginal averages is only an independent-deal quantity, not an exact card-conditioned probability.

For `n` known participating hands, the probability that independently uniform holecard pairs are mutually distinct is

`D(n) = product(i = 0..n-1, C(52 - 2i, 2) / C(52, 2))`.

Because every action weight is between zero and one, the legal-deal joint history probability is at most `independent_product / D(n)`. Forced outsider actions and an unavailable additional caller can only lower this conservative upper bound. Exact joint reach remains null in the coverage evidence; it is never mislabeled as the independent product.

For the four known participants here, `D(4) = 0.6134158110800204`.

| Open / callers / next actor | Independent history (%) | Rigorous legal-deal upper bound (%) | Result |
|---|---:|---:|---|
| UTG / HJ, CO, BTN / SB | 0.0000862870 | 0.0001406665 | Below 0.01%; unavailable |
| UTG / HJ, CO, BTN / BB | 0.0000862870 | 0.0001406665 | Below 0.01%; unavailable |
| UTG / HJ, CO, SB / BB | 0.0000690296 | 0.0001125332 | Below 0.01%; unavailable |
| UTG / HJ, BTN, SB / BB | 0.0001106532 | 0.0001803885 | Below 0.01%; unavailable |
| UTG / CO, BTN, SB / BB | 0.0001048713 | 0.0001709628 | Below 0.01%; unavailable |
| HJ / CO, BTN, SB / BB | 0.0003056885 | 0.0004983381 | Below 0.01%; unavailable |
| UTG / HJ, CO, BTN, SB / BB | Unknown fourth-call factor | At most 0.0001406665 | Known prefix already below cutoff; unavailable |

For example, the HJ history uses `23.5294% × 6.26697% × 3.39367% × 0.61086%`. Its independent product is `0.00000305688467` as a ratio, or `0.000305688467%`. Dividing by `D(4)` yields the upper bound `0.000498338096%`. SB's individual conditional call-policy average remains `0.61086%`; that is a different quantity.

The isolated 40BB four-bet setting makes the structural three/four-caller trees legal (the largest minimum full raise is 38.5BB after a 20.5BB squeeze). Those roots are currently omitted for rarity. Existing heads-up sizing and the Stage 2 30BB exception are unchanged.

## UI behavior

- Existing Stage 1/2 continuations use the shared saved-source action path, including two-caller squeezes, 4bets, 5bets and cold-4bet continuations.
- Stage 3 exposes the additional unacted seat at its actual place in the first lap. Choosing it loads exact saved ranges; missing, malformed and rare histories remain explicit unavailable states.
- Every live participant retains its latest exact historical/current range and synchronized selected hand. Folded seats are removed.
- Only the selected Stage 3 root is expanded by the normal browser graph. Full offline enumeration, equities and audits are not imported by the workspace.
- Explicit Stage 3 URL state preserves the root and validated action prefix. Reset and rewind clear only the appropriate downstream choices. An already-folded BB legacy URL cannot be reopened as a pending Stage 3 decision.
- A Stage 3 preflop terminal cannot borrow a Stage 2/HU postflop policy. Unsupported postflop histories remain unavailable.
- Four supported languages retain the same numerical facts; additional-participant and rare-history status copy is localized.

## Verification completed so far

- The official `npm run build:estimates -- --stage3-only` route completed in 45.84 seconds, using zero new equity samples. It reproduced all four core artifacts byte-for-byte, generated and installed all 1,801 compact reasons, and preserved all 1,888 legacy files / 19 protected sources / original Stage 2 archive. Maximum observed concurrent-process RSS was 999,736 KiB.
- Independent full publication/reason verification passed in 14.83 seconds. All 304,369 reason rows match the saved strategy/equity facts and fingerprint `a3b44b0e1fdf14e306d33335cdfa93196e214342a3500bd7883745da1cf522d6`. The final authoring/reason/delivery/storage/legacy negative suite passed 28 tests with zero skips, including the lazy import regressions.

- All 51 non-rare roots completed with zero blocking findings and 18 warnings: 12 `ev-capacity-conflict` and 6 `over-segregated`. The 469 joint-defense events used 9,400,000 accepted tuples in total. The initial pass required no positive-EV call increments or repair pass. The subsequent independent review checked the complete all-family artifacts and all 304,369 reason rows.
- A representative capacity warning is the UTG open / HJ 3bet / CO call / SB additional call / UTG 4bet to 20BB / HJ and CO fold / SB all-in history: joint-conditioned all-fold is 79.05% (interval 76.77–81.33%) against a 67.15% break-even threshold. Exact reachable positive-EV call support is already saturated. This is an explicit residual model conflict, not an equilibrium claim; the generator does not invent negative-EV calls to erase it.
- Six segregation advisories reach 85.7% pure-action combo weight, slightly above the 85% advisory threshold. Exact IDs and facts are retained in the complete audit artifact.

- Independent numerical/source review verified all legacy pinned bytes, legal order/sizing, actual-chip pots, source reach, joint live/dead-card handling, all-in/strength gates and the conservative rare bound. It identified two acceptance gaps: semantic reason-fact comparison and extra equity/defense entries. Both are fixed with negative tests and independently re-reviewed in source and in the complete all-family artifacts.
- First cold-4bet-extra root: 28 structural decisions, 15 saved and 13 proved unreachable; zero blocking findings and zero warnings.
- Complete fresh-cache and interrupted/resumed runs of that root are byte-identical across all four data artifacts and all 15 reason files / 2,535 hand explanations. Both equity and defense caches were isolated for the fresh run. Total unique accepted deals: 6,764,000 across 441 hand/range estimates, with 12,000 ordinary and 20,000 all-in samples unchanged.
- Fresh root run: 24.052 seconds, peak child RSS 439,784 KiB. An earlier resume was terminated by SIGKILL; its atomic checkpoint survived, and the same work later completed. The cause was not established and is not labeled a confirmed OOM.
- UI/URL/SSR integration: 44 tests passed, zero failures/skips, about 7.94 seconds. This includes all 18,620 structural terminal replays, representative deep URL round trips for all 58 roots, exact fourth-caller cross-root predecessors, missing/rare gates, the folded-BB regression and four-language labels.
- Independent small-Python verification also checked every smoke reason’s action frequencies, placeholders, equity and arithmetic EV against its saved inputs. This no-repair smoke does not by itself establish interrupted repair-pass reproducibility.
- Integrated HU hydration and Stage 3 UI/URL/continuation/admin/localization validation: 92 tests passed, zero failures/skips, 54.0 seconds, followed by a passing frontend typecheck. The later complete suite/build results are recorded below; real-browser acceptance remains outstanding.
- Content-addressed archive storage received an independent source/Python review and 8 serial JS tests passed in 1.26 seconds. This includes exact restoration of a legal 125-byte reason basename, deterministic bytes despite source metadata changes, deduplication, complete-object-set validation, path/link/hash/truncation rejection, receipt format, source graph and CI no-authoring behavior.
- Focused delivery/CLI tests also cover immutable legacy bytes and complete reason-payload tampering. The actual archive and finalized receipts were subsequently verified during the clean saved-byte restoration recorded below. Remote LFS verification remains outstanding.

## Historical integration checkpoints

The first full serial run completed all 776 tests in 851.57 seconds: 762 passed, 4 failed, and 10 were skipped. Two failures were Stage 3 integration gaps in the older all-reason test and CLI summary aggregation; both are corrected, independently reviewed, and covered by 45 passing targeted tests. The other failures were a missing production-build output and an inherited HU serial-pin test's dependency on an absent canonical local candidate. Production build now passes; the HU test now uses an isolated exact-LFS fixture. Sites, Agent, real range facts and the inherited model-8 floor tests all passed together (39 tests, zero skips, 5.03 seconds).

Nine of the initial skips came from unavailable saved legacy HU candidates, and one from the opt-in pinned-Wrangler integration. The exact historical 45-pair ZIP has now been hash-verified and restored exclusively as an explicit ignored test fixture (135 files / 4,864,362 bytes), preserving its original defence-5 reports without regeneration or a new freshness/publication claim. New unapproved HU foundation policies are not being installed as an implicit test prerequisite.

The 4.74-second production build retains two pre-existing `trainer.css` parsing warnings around the reduced-motion block and the existing large-chunk advisory. The Stage 3 task does not change that CSS. The later all-test pass is recorded below; the remaining delivery gates are still required.

### Earlier model-8 full-suite rerun

The corrected full command ran with a single test worker, a 768MB heap and unchanged sample coverage. **776/776 tests passed, zero failures and zero skips**, in 914.10 seconds; maximum child RSS was 789,540 KiB. This includes the previously optional local integration with the official pinned Wrangler 4.147.0 installed in an ignored isolated directory, the exact legacy policy fixtures, and the hermetic model-8 serial-pin test. The successful pinned-Wrangler test covers its full small-fixture roundtrip, repeat import, table isolation and failed-file rollback; full 3,693-dataset delivery remains a separate check below.

## Clean saved-byte restoration

A new isolated tree started without the large Stage 2 or Stage 3 datasets. The approved receipt-driven restorers installed all 1,614 Stage 2 archive entries and all 1,805 Stage 3 entries; repeated restoration produced the same exact files. Both official full verifiers passed for the restored 1,888 legacy and 1,805 Stage 3 artifacts, including every compact reason and unchanged fingerprint. This took 21.15 seconds with peak RSS 763,536 KiB and generated zero strategies. This is local saved-byte restoration evidence, not a remote LFS upload/fetch claim.

## Whole-delivery memory diagnosis

The official combined SQL preparation was killed with both a 768MB heap and a 512MB heap. The latter ended after 22.38 seconds with signal 9, observed peak RSS 806,312 KiB and child-resource peak 907,368 KiB; neither attempt produced a completed SQL bundle. The cause has not been established and is not reported as a confirmed OOM.

A separately frozen copy of the original canonical SQL builder processed all 3,693 datasets one at a time in 3.03 seconds, with peak RSS 338,724 KiB. It preserves the original traversal, property enumeration, compact JSON, quoting, 30,000-character parts, schema and newline bytes. The resulting complete SQL is 129,253,470 bytes with SHA-256 `25d7f2a99ff7e7b0603116ab533a72e4a48f369b277e170b8db52d7e64791443`. This is an exact comparison reference for the bounded serializer correction; it does not replace the official full-verification, receipt, import or rollback gates.

The earlier 776/776 test pass remains valid for its recorded source checkpoint. At that checkpoint, the bounded delivery correction passed 19 targeted tests (including all five new streaming tests), direct comparison of all 129,253,470 canonical SQL bytes, all 3,693 dataset metadata records and the independent limited source/receipt amendment. The final integrated all-test refresh is recorded below; external delivery gates remain required.

## Official delivery and first strict local-D1 result

The receipt-bound official delivery command now passes with the bounded serializer: build 26.50 seconds, check-bundle 24.19 seconds, peak child RSS 791,168 KiB. Both complete Stage 2/Stage 3 verifiers ran; the 3,693-dataset manifest and 129,253,470 SQL bytes match the frozen canonical reference exactly. No strategies were generated.

The first strict whole-file import with unmodified pinned Wrangler 4.147.0 failed after 37.67 seconds with `other side closed`, before either repeat-import verification or the intentional failed-file rollback probe. Observed maximum child RSS was 869,568 KiB and the own-process-group RSS sum peaked at 1,345,180 KiB (shared pages may be counted more than once). The root cause is unresolved; this is not a confirmed OOM or a passed D1 gate. The input was not split and no vendor code, payload, sample count or validation coverage was changed.

The exact pinned runtime passed both immediate and 8-second synchronous-idle SELECT controls in 8.95 seconds, so the simple idle-delay hypothesis was not reproduced. The whole-file failure remains unresolved. The later controlled diagnostics below distinguish the observed failure from a simple idle delay; no cause is conclusively established. Cloudflare's [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [import documentation](https://developers.cloudflare.com/d1/best-practices/import-export-data/) describe the remote file-import path, which is distinct from the pinned CLI's local `db.batch()` implementation. Their documented import allowance does not establish this local full-batch test has passed. A [reported local proxy idle error](https://github.com/cloudflare/workers-sdk/issues/7376) has the same error text but is not yet proven to explain this failure.

A second unchanged strict-CLI attempt also failed with the same transport error (19.84 seconds). The schema/sentinel seed completed 52 statements successfully. A diagnostic using the same bundled runtime, with every statement parsed before opening the proxy and all data sent in one batch, then terminated with SIGKILL after 16.50 seconds. Its last sampled processes used 536,112 KiB (Node) and 768,192 KiB (workerd); this was not the diagnostic timeout. Resource pressure is a hypothesis, not a confirmed OOM. Further identical large-batch attempts in this cloud environment are paused. The strict full-payload, repeat-import, unrelated-table and late-failure rollback gates remain required on the identical artifact in a sufficiently resourced authorized environment/CI. No split-import result or alternative runtime diagnostic replaces that gate.

After the serializer amendment, a second new empty tree repeated exact restoration and both full verifiers successfully (21.53 seconds, peak RSS 641,868 KiB). It binds Stage 2 content `3c50a40a4ce0c156c4ec472993ca7f2afe9cfc40d453bd3b9e41411482fb6631` and Stage 3 content `5df912bdedd469cd3b0e0a245a7d5fc094fe144d26fb4a41b6f304be73e4c0e7`, with both archives and every restored artifact unchanged.

## Remaining acceptance work

- Complete whole-delivery SQL/D1 validation. Receipt-bound clean restoration and every Stage 3 reason/publication check have passed.
- Keep the independently reviewed receipts current if any further bound source changes are needed. Numerical/artifact review, source-only renewal and the limited CLI-summary amendment are now recorded.
- Transfer and freshly verify the deterministic archive as a real Git LFS object; its exact identity is recorded above.
- Keep final validation current if bound code changes. The complete 776-test suite, typecheck and production build have passed against the integrated source.
- Browser acceptance for the specified two-caller → squeeze → 4bet → response path. Exact steps, saved IDs and expected values are in `multiway-preflop-stage3.browser-qa.md`. The cloud localhost browser is blocked with `ERR_BLOCKED_BY_CLIENT`; no bypass was attempted. Separate authorized browser access may be needed.
- Obtain file-specific approval for saving `configs/multiway-preflop-stage3.review.json` to the private repository, then finish the complete feature commit/Draft PR. Upload and freshly verify the actual Stage 3 LFS object, and verify the exact-head `Verify reviewed preflop snapshot` Actions result. Committing a pointer alone does not complete publication. The actual archive is also saved in the owner’s Library; a fresh local materialization reproduces its exact hash, which is not a GitHub LFS verification.


## Final shared-HU integration and local validation

The exact stable HU local commit `3ab7ad54822d77d2a59821d24878eb47d19e4a76`, tree `0ef7e64db3717349b66d4bfa2adf4bba2dd1539f`, is now integrated using the fixed prior HU checkpoint as the three-way base. This includes the separately reviewed observable-action model and pure street-state kernel. Stage 3's completed-flop live-participant priority, root/action URL state, missing/rare gates and unsupported-postflop behavior remain intact. Current HU numerical/policy acceptance is a separate deliverable.

Independent source review checked all 66 integration-path identities, the shared URL/UI merge, all 19 protected numerical sources, all 1,888 legacy and 1,805 Stage 3 artifact files, both archives and all six bounded-serializer files. There were no blocking integration findings. Stage 2's source graph is 116 paths: nine changed and three added HU dependencies, no removals. Stage 3 remains 67 paths; only the final Stage 2 receipt body is rebound. Every prior review field and amendment is retained, with the inherited HU amendment clearly labeled as separate-checkout historical evidence.

- Shared integration regressions: 73/73 pass, zero skips, 53.68 seconds; typecheck and production build pass.
- Exact isolated candidate check: both original full verifiers pass, all 3,693 dataset metadata records / 7,126 parts and every one of the 129,253,470 SQL bytes match the frozen original serializer, in 23.64 seconds.
- Final complete frontend suite: **836/836 pass, zero failures/skips**, 924.09 seconds, maximum child RSS 785,140 KiB, one worker and a 768MB heap. The pinned Wrangler 4.147.0 small-fixture integration actually ran. Its successful small-fixture rollback is not the separate full-delivery D1 gate.
- Final receipt-bound official delivery: build 26.49 seconds; check-bundle 24.87 seconds; maximum child RSS 785,092 KiB. The complete SQL remains 129,253,470 bytes, SHA-256 `25d7f2a99ff7e7b0603116ab533a72e4a48f369b277e170b8db52d7e64791443`.
- Final empty-tree restoration: first and repeated restore install all 1,614 Stage 2 and 1,805 Stage 3 entries and pass both complete verifiers, 21.12 seconds. No strategy generation or new numerical sampling occurred.
- Historical fixture check: all 135 original HU ZIP payload files / 4,864,362 bytes still match exactly. The explicitly unapproved foundation-v3 LFS test archive is the exact 127,590-byte object; it is used only by hermetic tests, not approved for publication.

The existing CSS parsing/large-chunk warnings remain. The full suite also reports a duplicate localization key whose two translation values are identical; that inherited file is unchanged by this final integration.

The remaining blockers are strict full-payload D1 roundtrip/repeat-import/isolation/late-failure rollback in a sufficiently resourced authorized environment, actual remote LFS fresh-fetch/hash, real-browser acceptance, the specifically blocked manifest upload, and a complete commit/Draft PR with exact-head required CI. Identical large-batch cloud retries and alternate routes for the denied manifest remain stopped.

## Authorized repository preservation — 2026-10-05

The owner approved saving `configs/multiway-preflop-stage3.review.json` to the private `Suuu-sh/ReysonAI` repository. The exact reviewed file is 509,233 bytes, SHA-256 `13b2c8e8a8bd2561420f0af8ca1db3c8b7dda71678c9ebbf0e909f8e6f83e37f`; its successful Git blob is `d7441c9e2610da454e35c668cbe57d6645c55bd3`. This resolves the earlier file-specific upload block for this payload. Earlier checkpoint descriptions of the upload block are historical.

An authorized Mac execution completed at 01:02 UTC: it materialized the exact Stage 3 archive, verified its 2,436,451-byte size and SHA-256 `930d88207c2aa31430eb28570f7d90e064bb3680c40203d5e860bfe9289eac7b`, uploaded that object to the same private repository, and fetched it into separate empty LFS storage with the same size/hash. It changed no branch/ref, commit or credentials and did not transfer the review manifest. The parent read the completed result at 01:03 UTC. This establishes actual remote LFS preservation; strict full-delivery D1, browser acceptance and required exact-head CI remain separate gates.

## Fixed development and Ranked preservation — 2026-10-05

The integration now retains development `27413017b2dfa6aa42099c5017aa1343989f3dd7`, including the published Ranked browser CORS fix from main `b03d8b06aaf66abcfbe7917df4d09b4d4c905671`. The Ranked patch changes the existing Worker response headers, its regression tests and the existing deployment readiness check. Source-compatibility review independently confirmed the gate is unchanged from the published fix and Stage 3's restoration/test additions remain present. All prior receipt metadata, all reviewed numerical artifacts and both archives remain intact.

The shared RangeContextCard and sixteen-path upstream UI reconciliation are inherited from the separately tested HU integration. The Stage 3 workspace merge retains all 41 Stage 3-specific lines and its original continuation, hydration and URL behavior. Development's final two StyleMap display files are exact upstream bytes. Of the 27 incoming development paths, 21 match exactly; the other six retain the already-authorized HU/Stage 3 additions and their coupled review receipts.

Current targeted validation: backend Ranked 11/11, frontend UI/Stage 3/Ranked 91/91 and Sites 7/7, all with zero skips; typecheck and production build pass. Both original full numerical/publication verifiers then passed, and all 3,693 metadata records / 7,126 parts / 129,253,470 SQL bytes matched the frozen canonical reference. That final delivery check took 23.22 seconds. The earlier 836-test complete suite remains evidence for its previous reviewed checkpoint; these current targeted checks are recorded separately. No new full-payload D1 cloud attempt or numerical generation was performed.

Current receipt identities:
- `configs/multiway-preflop-stage2.review.json`: 529,120 bytes; SHA-256 `3ea5d252dd257d75677ccff61bf94a3aa639066f3e32c7e20ed076b80ec3fb2b`; content `9b2a266fe502f2f04de46d1308d89908d3eb5b9d7cd635543f29397d92b7f476`.
- `configs/multiway-preflop-stage3.review.json`: 512,995 bytes; SHA-256 `2a9dcb1dc46b38a86836a86b0afe3dfcdc025f5a8944b7c2ece3a55692bc1b4c`; content `1533778dd4ec63139dd7611d38aecca66cce5ccfac9e29a2a82c65b591f68222`.

Full-payload D1, real-browser acceptance and the final required CI result remain release gates. The actual Stage 3 LFS transfer/fresh-fetch and original manifest-specific permission are already established.


## Current typed-development integration — 2026-10-05

- Fixed inputs: preserved PR50 `0d0be207c8775e0f1615a9984f308fbf8230932f` and development `b28147774ec6909196b80353d10129723f333adb`.
- Independent review preserved all 3,693 saved artifact bodies, both archive payloads, both immutable fixtures, every saved fingerprint/count, and every prior receipt review field. All 35 inspected Stats/Ranked/account files match fixed development. Stage 3 state, participant ranges, no-HU fallback, rewind/reset/reload and Retry behavior remain intact.
- Historical-byte compatibility now has 29 independently checked exact pairs. Type/import-only changes and the three explicit presentation/fingerprint-adapter exceptions are separately identified. Both source walkers include adjacent declarations; source-only receipt graphs are Stage2 153 and Stage3 98, with exact final receipt coupling.
- Strict frontend and runtime TypeScript checks pass. Focused UI/history/access/legacy tests pass **134**, with **one optional private `.local` HU-policy check skipped** because its local artifacts are unavailable; the immutable 45-spot source fingerprints and pinned policy-loader checks do run and pass. The former guest-gate source-regex assertion now accepts only the erased type annotation; its full eight-test access suite passes.
- Storage/authoring/delivery/source regressions pass **64/64**, zero skips, including the real pinned Wrangler 4.147.0 local small-fixture roundtrip, repeat import, table isolation and full-file rollback. The separate inherited HU collector has a reviewed relocation/type-declaration amendment and exact known-input namespace checks, with wrong-hash, absent-input and wrong-namespace negatives. This does not approve new HU policies or replace full-payload D1.
- Backend Ranked **11/11** and Sites **7/7** pass. Production build passes; the existing large-chunk advisory remains.
- Official combined verifier/SQL build passes in 23.90s; official repeated bundle check passes in 22.73s. All 3,693 metadata records / 7,126 parts / **129,253,470 SQL bytes** retain SHA-256 `25d7f2a99ff7e7b0603116ab533a72e4a48f369b277e170b8db52d7e64791443`. Maximum observed process RSS was 1,038,028 KiB despite a 768 MiB V8 heap; these are distinct measurements. No strategies were generated.
- A fresh source-only tree initially contained neither expanded Stage2 nor Stage3 snapshot. Both first and repeated official restorers installed the same 1,614 / 1,805 entries; both complete numerical/publication verifiers then passed in 18.29s. No source generation, sampling or archive repackaging occurred.

The browser record remains tied to its actual tested head. Current-source CI and the unsupported-terminal browser observation remain explicit release gates; the PR must not be merged/deployed merely because source integration is complete.


## Bounded FastFold development integration — 2026-10-05

Fixed lineage: published PR50 `b3905029d0a4c4cc696edf15dd72ae369bb1827a` plus development `e695dc94625260b8ac620cd489c5fc24097e3252`. The isolated integration retains FastFold's injected server-dataset scope and all ordinary Stage 3/HU behavior. No saved strategy, reason, equity, threshold, sample count, fixture or archive changed; all 3,693 saved artifacts and four inherited archive payloads were independently compared.

- Complete ordered descriptor parity: **456/456**. Complete reachable input objects/fingerprints: **452/452**, with the same four unreachable legacy descriptors. All **407** ordinary HU Agent paths match; all 407 injected and 407 missing-injected-source paths reject HU coverage. Four continuation families preserve ordinary sources while matching exact upstream FastFold sources/choices under injection. Interleaved injected lookups cannot read or mutate another scope. Runtime-equivalent type-only facade annotations were independently checked after this parity run.
- Both strict frontend/backend-import and runtime TypeScript checks pass. TypeScript 7 launches a native compiler, so its measured RSS, not the Node launcher's heap flag, governs memory. Final frontend check: 2.357s, 813,848 KiB child peak; runtime: 1.561s, 397,936 KiB sampled group peak.
- **132 current targeted tests pass, zero skips**: Agent 14; continuation UI 9; learning access 8; new injected-scope regressions 4; FastFold UI 8; player-analysis UI 6; remaining Stage3/range URL/ranked/workflow/type-source set 50; real range/account hydration 18; actual Trainer/FastFold authenticated ephemeral-server integration 1; HU storage and exact legacy preservation 14. This selected set is not a new complete frontend suite and does not claim the old optional private-policy test was run.
- FastFold tests cover auth/readiness, explicit consent, immediate server fold, identical-id retry, stale-version recovery, pause/reload/resume, seven rank tiers, sign-out races and preservation of old quiz records. The authenticated app test uses isolated in-memory SQLite and no live credentials. It is not the separate real workerd/DO or browser gate.
- The incoming FastFold Stats component correctly withholds legacy quiz summaries. One superseded test now explicitly asserts login/live-server gating and rejection of supplied old quiz/drill figures. The existing ranked-answer/local-drill isolation assertion remains unchanged. This test-only update is absent from both receipt source closures.
- Earlier 448 MiB guarded compiler/SSR attempts were stopped, not counted as passes. The stopped UI batch had 31 completed passes and seven canceled files; every canceled file was subsequently run to completion. A 900 MiB own-process-group guard then permitted the separate compiler/SSR checks. Processes ran one at a time; no global process action was used. No local full-verifier, workerd/D1 or build ran concurrently with the separate numerical task.
- Independent in-memory SQLite schema review verifies valid sentinels in **21** unrelated tables, including all five FastFold tables, with foreign keys enabled. This is fixture validity, not a whole-file D1 roundtrip/rollback pass.
- Final source-only receipts retain all prior metadata and all four upstream renewal entries: Stage2 **155** sources / 556,863 bytes / SHA-256 `630a45330923d076c71d47b1a06cbcb96e88c8d6acc5058a6698b1e30f0e62e7`; Stage3 **98** sources / 530,588 bytes / SHA-256 `461bfa6359ddcbbf3b1a766709e92f54738340c6683e581e5e2d1d555911b4a3`. Stage3 binds the exact final Stage2 receipt. All records were independently rehashed.

The existing workflows retain both archive restores, full reviewed-source/artifact validation, strict whole-file D1 repeat/rollback and 21-table isolation, actual FastFold workerd tests, strict types/build and Sites checks. These current-tree heavy gates must pass after publication; the prior canonical SQL identity remains the comparison target, not a newly executed result. The earlier optional private-HU policy limitation and browser **NOT RUN** status remain explicit. Keep the PR draft; source preservation and CI do not themselves authorize production.
