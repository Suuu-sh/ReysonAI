# MW3 final-source integration review

Date: 2026-10-05 UTC

## Bounded decision

**GO for the reviewed nonproduction source integration and the remaining final-source verification work.** No required registry-adoption, MW3/HU merge, dispatch, or retained-UI source correction was found in the subjects below. This is not a completed release gate or permission to deploy.

The initial reviewed checkpoint is `59b995488a6607cef556ba2a8743ff403ddb38d1` (tree `6e6bdcbd7ce6987d47d794aebaea09ce185d3b4a`). The subsequently requested two-file display-only update was also inspected at `fd270a0dad57e7ad1977675455a0e64bd5b564ff` (tree `55ea2616a30c33a275d18cae8c05ff5ac1aafc22`). The recorded executed integration checks described below apply to **59b9954**, not automatically to fd270a0. The latter still requires its separately scheduled verification.

These trees identify review subjects, not a final archive/receipt source freeze. Commit the intended final source and review record before producing its freshly bound manifests and independent receipts. Any later relevant code change needs a scoped review and applicable rechecks.

This reviewer used Git, sequential file inspection and Python byte/structure checks only. No Node, npm, esbuild, JavaScript tests, application probes, recipe execution, simulation, browser, Wrangler, D1, archive production, SQL generation or external publication was run by this reviewer. Existing execution records were read and checked rather than rerun. Only this review document was written; pre-existing artifact worktree changes were preserved.

## Exact adopted authority

- `apps/shared/mw3-approved.ts`: **14,126 bytes**, SHA-256 `7e1ac4ba059b4a34d8fdc7f6c6891be9929eafec470dc577c0d8702cf632fe81`.
- `apps/frontend/docs/mw3-registry-pins-independent-review.md`: **19,434 bytes**, SHA-256 `401e66cddc5e6b2e0051f7860e7deb3766da3f0ac9f3201e60ed548f49fa8324`.
- Retention patch `reysonai-hu-a703-ui-retention.patch`: **63,820 bytes**, SHA-256 `320d05b8d55bd40c93e6784b8f82f1164f3fd283a450e6497a64983a3ff8285a`.

The installed registry is byte-identical to the exact independently reviewed proposal in `activation-draft/proposed-mw3-approved-a2cf5f6.ts`. Its parsed literal has 32 pins, 16 spots, 32 unique delivery hashes and one flop/later pair per spot. The compact ordered pin-array SHA-256 remains `5f51c26f33424fa2b0aab1b69b7cc86baa46821ffba47b551b9034177bb4e323`. No expression, query-supplied authority, alternate registry, policy reauthoring or metadata promotion was introduced.

The earlier independent review's full 32-header / 972,648-rule lossless transport verification remains evidence for these unchanged bytes. This integration review does not describe that prior verification as a new transport execution. Its 32 delivery hashes, 1,552 parts and 24,632,707 encoded bytes remain bounded transport evidence, not equilibrium or production approval.

## RangeWorkspace and approved HU UI retention

The retention patch contains 16 paths. Fifteen current files, including the new card, trainer components/styles, translations, tests and `design-qa.md`, match its expected postimage Git blob identities. `RangeWorkspace.tsx` is the single intentional integration difference.

The saved three-way inputs identify:

| Subject | Git blob |
| --- | --- |
| Base | `cfa742d8603fc0667a0fba326e89c7c471a4eac8` |
| Retained HU side | `afc7804911dca9c4812bf049cd8d50453682aa0d` |
| MW3 side | `84aca0a5abd1e5f4544cf5cc4b588a8a5370eb18` |
| Integrated result | `38e40d6c503f533fc1ebe0a0185122c2d604b77c` |

A read-only recomputation with `git merge-file -p` returned exit 0, empty stderr and exactly the saved/tracked merged result. The result is 81,054 bytes, SHA-256 `1aba090c22ed7abbbb067497803927d246d29dd19f2a4006562c86ed95b014c8`.

The HU-side delta remains the new `RangeContextCard` import/wrapper and approved table-profile indicator. The MW3-side delta remains the dedicated session/client, MW3 pending-street/navigation selection and dedicated renderer. Neither side's action callbacks were dropped or replaced.

Source-level integration observations:

- The leading card receives **visible board blocks from `combinedBlocks`**, including MW3 turn/river blocks and pending slots. It does not read stale downstream selection fields independently. Removing later navigation blocks therefore removes their leading-card display too.
- Flop/turn/river editing uses the same permission checks and existing dialogs as the chronological board blocks. Cards remain four-suit text, and a pending later card renders `?`. The board/settings selector exposes pressed state and localized labels in all four product languages.
- Both reset controls call the existing `resetPath`; both display-mode locations call the same persisted `changeDisplayMode`. Settings retain game-format editing and the nondefault table-profile indication. Returning to preflop resets the card's internal view to Board for the next entry.
- The chronological action path still dispatches flop actions by `flopIndex`, later actions by `street`/`laterIndex`, and selected-action/block clicks through the existing rewind callback. Upstream action/card changes clear downstream streets using the existing effects. The automatic pending-street dialog still records the previously pending street, so closing it without selecting a card does not itself force a reopen.
- The dedicated MW3 view and session remain separate from the HU `PostflopTrial`. A three-player context does not acquire `pilotAvailable`, and an unsupported multiway context uses the dedicated unavailable renderer.
- The session still keys loaded results by spot and client, checks genuine verified-kit membership, cancels superseded views, and keeps computed results tied to the exact selection and kit. The card wrapper adds no data fetch, fallback or strategy authority.

These are source checks. Actual responsive layout, dialog focus/close/reopen, browser history, locale changes, exact-combo selection and full street replay still require the final browser gate.

## Trainer, Ranked and later Agent display update

The retained trainer changes comply with the updated local trainer scope rather than moving Agent statistics into drill analysis:

- `practiceAnimal` maps the existing exact-question practice classifier's keys to shared artwork. Drill classification still uses `analyzePlayer`, its deduplicated question cohorts, 30-question/10-open/10-response/three-spot readiness, and its separate provisional plotting threshold. It does not call `playerRead` for drill classification.
- The Agent dashboard remains in the Agent branch. Ranked Stats use the separately passed server profile state and readiness; its unavailable branch withholds rating/score output. It explicitly withholds individual-action/animal analysis because only server match summaries are available.
- `TrainerPage` passes actual `rankState` and `rankedReady`, initializes/reset them on account changes, and excludes new ranked answers from the local drill `onAnswer` write. Existing untagged history is preserved and its inseparability is disclosed.
- Rank/Agent visual changes, four-language additions and their tests are retained as authored. No ranked authority, policy grading, rating computation, legal/admin workflow or backend route was rewritten by the UI-retention commit.

The later `59b9954..fd270a0` delta is exactly two paths, 30 added / six removed lines:

- `apps/frontend/src/agent/PlayStyleDashboard.tsx`, blob `884f7e98eaa8fe722b595a47c0e287cf470c2699`.
- `apps/frontend/src/agent/agent.css`, blob `fe60e541c57aa3bcd3abd50c376040691e06bbab`.

The coordinator identifies these as exact retained display files from development `27413017b2dfa6aa42099c5017aa1343989f3dd7`; this reviewer independently checked the destination blobs and complete two-file delta, but did not fetch that upstream commit object. The delta displays eight background style regions/avatars and adjusts map layout. Actual classification, baseline, confidence, null-before-sufficient-data behavior, point calculation, Agent behavior and MW3 numerical sources are unchanged. The displayed horizontal thresholds match the existing looseness mapping; vertical region boundaries are rounded display percentages for the existing aggression mapping. They do not become new classifier thresholds. A collecting read still has no plotted player point and no current named region.

## Fail-closed authority and dispatch

Registry adoption changes the source-owned allowlist, not who can authorize data:

1. The browser client clones/freezes source pins, requires both stages, rebuilds inputs from the three actual saved datasets, checks their source hash and cross-stage implementation identity, hashes exact raw headers and each part, restores the policy, and requires the complete stage-specific engine node inventory. A database row, URL, localStorage value or candidate metadata alone cannot create a verified kit.
2. Missing, stale, corrupt, mismatched or incomplete deliveries retain unavailable/error behavior. Failure entries are removed for retry; a cancelled view does not cancel a shared delivery needed by another consumer. The two-spot success cache remains bounded.
3. The four `BTN/CO/HJ/UTG_open_SB_call_BB_call` origins have no pins. The catalog still independently rejects empty saved support or impossible three-hand support. Origin routing requires exactly one open and two calls at the expected sizes/order. Four-or-more live players, squeeze/3bet, limp and other unsupported three-player origins are not made eligible by the nonempty registry.
4. After a postflop fold from three players to two, navigation and Agent play continue through the MW3 table/runtime with all three original seats, original roles and saved reach/blockers. They do not switch to HU defence or a HU strategy. Unsupported/missing-kit multiway Agent play returns unavailable before HU dispatch and does not settle invented returns.
5. Backend routing accepts only GET and exact allowed query fields. It requires one captured-build-approved delivery hash before D1 access, validates exact header identity and each requested part, and validates saved bytes before returning a conditional 304. Unknown hashes, extra approval flags, missing/corrupt rows and unknown routes fail closed. The existing backend comment saying the shared registry is empty is historical wording; the actual import/call uses the now-reviewed source registry.

### Existing empty-registry assertions

No remaining test inspected treats the live nonempty authority as an empty array:

- Consumer empty-authority coverage explicitly injects `Object.freeze([])`; the actual imported registry is only checked for being frozen there.
- The worker/index negative test chooses a hash absent from the live source registry, rather than assuming a particular known policy is unpublished.
- The saved-restore fixture explicitly constructs empty source text and synthetic pairs. It still checks that a newly activated registry requires matching saved artifacts and fresh source-bound receipts.
- The empty-route generator test inspects the deliberately empty verification contract; it does not run that contract against the newly activated source. Activated registry-binding tests inject separately frozen synthetic evaluated registries.
- The older HU-only Agent tests omit the MW3 capability argument; their legacy two-player constraint is not a claim about the default integrated Agent UI.

The strict D1 CLI still defaults to **empty** mode. Invoking that default against this nonempty source must fail its actual-empty-authority assertion; this is an intentional safety boundary. The final real proof must explicitly select activated mode, bind the actual captured/evaluated 32-pin registry and exact separately receipted subject pair, and use public routes. `--registry-mode activated` cannot grant approval or replace the source registry. A full-registry digest in one subject's proof does not prove the other fifteen subjects.

## Preserved numerical evidence and final-source dependency consequences

Python independently rehashed all **112 distinct raw files**, totaling **235,515,283 bytes**, against the supplied exact raw inventory. Every length/hash matched. All 13 numerical implementation sources, eight authored-gate identity sources, 20 recipe files, the pilot gate source and the complete seven-limitations module are byte-identical to `c70cdec`.

Recomputed identities remain:

- Numerical implementation: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`.
- Authored gate: `92b946dfc5c87359dcb3e610e832e262c2d3ac366110f295968eca2f7392c088`.

The saved inventory still reports 16 accepted bounded AI-estimate subjects, 28,080 flop board checks, 3,776 later-board checks, 1,469 positive joint events, 259 zero-support events, 29,380,000 accepted tuples, **561 advisory warnings**, and 1,920,000 simulation / 1,920,000 same-engine replay hands. These counts were preserved/read, not freshly simulated. The detailed independent quality reviews and their residual overfold/overcontinue weaknesses remain applicable.

A static walk of the actual snapshot dependency rules confirms `RangeContextCard.tsx` is automatically included after the merge. Compared with draft tree `4bfb8950903591ca68f66575010f8fb2bdc9078d`, the pilot source inventory grows **185→186**, and each other subject **187→188**. The union of source/input paths grows **205→206**. No old dependency disappears. At fd270a0, the changed existing dependency bytes are `PlayStyleDashboard.tsx`, `agent.css`, `RangeWorkspace.tsx`, `ranges.css`, `product-direct.json` and `mw3-approved.ts`; the new dependency is `RangeContextCard.tsx`.

Thus stable numerical and transport hashes do **not** make the old draft source ledger, draft manifest digest or draft tree usable as final receipt subjects. The real final manifests, archives and separate independent receipts must bind the final committed source/input inventories and both exact six-field pins for each subject. Existing saved-restore checks intentionally reject an approved registry without matching genuine saved inventory; do not weaken them to get a green empty-inventory build.

All seven limitations remain explicit:

1. AI estimate, not equilibrium/GTO proof.
2. Joint MDF deviations are advisory.
3. Zero-support reasons require independent source/policy review.
4. Replay uses the same engine, not an independent solver.
5. Structural coverage is geometric/source-combo tier coverage, not joint policy reach.
6. Fold conditions of seats outside the active three are unmodeled.
7. After 3-to-2, context buckets can merge different surviving opponent identities.

## Read and verified executed evidence at 59b9954

Execution record: `apps/frontend/.local/postflop-ai/mw3/final-integration-59b9954-run1/execution.json`, **11,197 bytes**, SHA-256 `31d9a64aae9980f101d2b8aa7d952ddce7d1b18ba6bf3b60bc25f0eabe0a2b69`.

The record names `59b995488a6607cef556ba2a8743ff403ddb38d1`, starts at `2026-10-05T01:31:00.310145+00:00`, ends at `01:31:45.911264+00:00`, and records all seven commands exiting 0. All 35 before/after source records are identical and independently match the corresponding Git blobs at that commit. The log summaries show:

| Executed group | Result |
| --- | --- |
| Activation / owned-process / API lifecycle / parent boundary / draft contracts | 49/49, fail 0, skip 0 |
| MW3 delivery / Range / Agent / UI consumers | 35/35, fail 0, skip 0 |
| Backend index / transport | 6/6, fail 0, skip 0 |
| Range context / player analysis / ranked workflow | 12/12, fail 0, skip 0 |
| Sites packaging/routes | 7/7, fail 0, skip 0 |
| Configured TypeScript check | Exit 0 |
| Frontend/Sites build | Exit 0, warnings retained below |

This is **109 passed targeted tests**, not the full frontend suite, actual browser QA, real D1, archive restore or final CI. The configured TypeScript project includes the site and backend; it is not a claim that all product TSX is strict-typechecked. Product code was bundled by the recorded Vite build. The record's maximum child cumulative RSS reaches 581,996 KiB; it is not a hard process-tree ceiling or complete resource attestation.

Key stdout SHA-256 values:

- Focused 49: `7bbfa02fa8e7f643f711f6a8944c6f0b2e728575e652795b631088ae7ade84d5`.
- Consumer 35: `a684624806bb8f022829001f65ca83e67510d952f051abdc673a694a8498fdca`.
- Backend: `46f78a61627bae2fc08d119f781ae5bbf543236633f1a945a42cd76abac31d89`.
- UI: `900cf590bd292c3cd902c94a2c46e15316a11ebe9db6f4d6804456927920665f`.
- Sites: `19a47a8a4982134f8e4f153da82adb01d8a06220e1bcc4db8dbea84559884b33`.

### Build warnings and inherited UI limitation

The build is successful **with warnings**, not warning-free. In addition to npm's existing `http-proxy` warning and the large-chunk advisory, it reports two CSS syntax warnings. `trainer.css` currently contains a malformed reduced-motion block at lines 729–731, with a selector preceding `@media` and another dangling selector before the closing brace. The same malformed block exists at 213af50; it was retained from the approved UI source, not introduced by this MW3 merge. The specific block cannot be relied on for its intended reduced-motion override. A separate global reduced-motion duration rule exists, but this review does not claim browser verification of the combined behavior. Preserve this finding for UI follow-up rather than calling the build warning-free or silently changing the retained upstream UI in this review.

## Gates still open

1. Execute the separately planned fd270a0 display-update checks and inspect their warnings/results. Do not relabel the 59b9954 execution as a test of later bytes.
2. Finalize the source freeze, then generate genuine final source-bound manifests/archives, exact SQL and separate matching independent receipts for all 16 subjects. Retain all raw bytes and all seven limitations.
3. Perform actual saved-pair restoration and strict local D1 activated proofs for each subject, through the real public routes and all four phases, including exact whole-file imports/idempotence, immutable-conflict rollback, unrelated-data preservation, restart, late-header/part corruption rejection and exact repair.
4. Retain the reviewed R1 owned-process termination/reap contract and R2 captured-parent/evaluated-source contract, with complete outcome, source, runtime and input ledgers. Fake HTTP/SQLite/DOM fixtures do not replace their real gates.
5. Complete final integrated inventory, consumer/backend and full frontend checks, applicable typecheck/build/Sites checks, exact required Node 22.20 CI, HU regressions, actual LFS payload upload plus fresh-fetch/hash verification, and actual Range/Agent browser QA. Exercise all streets, exact combos, original-role-preserving 3-to-2, board edits, rewind/reset/retry, stale/missing/failed deliveries, permissions, locales and narrow screens.

**Final verdict: narrow GO for these integrated nonproduction source bytes and continuation of final verification. Production, final independent receipt, actual D1, LFS delivery, full-suite/CI and real-browser readiness remain unapproved by this record.**
