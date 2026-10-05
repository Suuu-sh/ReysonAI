# Stage 3 typed-development integration: independent source review

Date: 2026-10-05. Scope: exact source-only integration of preserved PR50 head `0d0be207` (tree `fcb896f259ff0b4ab118776ecc27105630f9e94e`) with fixed development `b28147774ec6909196b80353d10129723f333adb` (tree `ce3cb615f10d3fe8f85606744f9a95cb5ffb1852`). This review was performed independently of the type-port author. It is not new strategy-quality, browser, production, D1 rollback, or final-head CI approval.

## Immutable saved data

Independent raw-byte checks matched all 1,888 Stage 2 artifacts, all 1,805 Stage 3 artifacts, and both actual archive payloads against the exact preserved-head receipts. Neither baseline fixture was changed. The Stage 3 baseline fixture retains SHA-256 `4f8dfddc112fb879b665fcdd337a53c72272c09dfc50baa1d61d328b586c32b8`; its historical 19 protected policy/configuration records remain authoritative.

- Stage 2 archive: 1,747,857 bytes, SHA-256 `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`.
- Stage 3 archive: 2,436,451 bytes, SHA-256 `930d88207c2aa31430eb28570f7d90e064bb3680c40203d5e860bfe9289eac7b`.
- Stage 2 saved source fingerprint remains `b3538b0c44f04016e57d6eb76802665cf405d65f87e856b9860ed8a479065e53`.
- Stage 3 saved source fingerprint remains `a3b44b0e1fdf14e306d33335cdfa93196e214342a3500bd7883745da1cf522d6`.

No strategy/equity/reason generation, resampling, archive repackaging, numerical threshold change, policy change, or new HU model11/MW3 research integration occurred as part of this review.

## Independent executable comparison

The reviewer independently transformed exact cached historical Git blobs and the final typed sources with esbuild 0.25.12, using the TS/TSX loader, ESNext/ESM output and syntax/whitespace minimization without identifier minimization. Normalization was restricted to actual static/dynamic literal import/export specifiers in the explicit `.mjs` → `.ts` relocation map. Arbitrary strings, seeds, versions, policy names and numerical constants were not normalized.

Of 129 complete source/test comparisons, 121 executable outputs are identical. This includes every changed Stage 3 numerical/runtime module, the complete `postflop-trial.ts` wrapper, `range-url.ts`, inherited HU model10 runtime and the six separately adopted typed frontend modules. No blanket adoption or equivalence of the separate MW3 branch is asserted.

The eight non-identical comparisons were individually reviewed:

1. `data.ts`: unchanged presentation-helper extraction. Ranks/hands and all 1,868 bytes of the remaining calculation bodies are identical. The extracted percentage, action-label and colour functions preserve finite-value handling, aliases, colours and null/unknown fallbacks.
2. `continuation-reasons.mjs`: one guarded historical-source helper import and one policy-byte-read replacement.
3. `stage3-reasons.mjs`: the same narrowly reviewed adapter, including its self-fingerprinted source. The historical policy file names/order and all data/configuration hashing remain unchanged.
4. `stage3-legacy-preservation.test.mjs`: checks the original protected historical source bytes through that exact-pair adapter; raw artifact/configuration/archive checks and immutable fixture identity remain unchanged.
5–6. Both source walkers: visit an existing adjacent `.d.mts` when a bound `.mjs` is visited, then traverse literal type imports. This binds declarations without introducing a separate delivery mechanism.
7. `stage3-delivery.test.mjs`: expects the actual relocated evaluator/equity `.ts` source paths; no acceptance gate is removed.
8. `RangeWorkspace.tsx`: retains the exact fixed-development settings presentation. After isolating only that exact upstream JSX, its entire final executable is identical to preserved Stage 3. During review, an accidentally omitted retry control and unnecessary fallback-field removals were identified and restored. Stage 3 persistence, reset/rewind, entrant selection, range availability, missing/error recovery and participant rendering are preserved.

The final reviewed `RangeWorkspace.tsx` SHA-256 is `99785490187d45ca0437bd2f6c327fe7b5fecb9923d70dff5301d93b6836922a`.

## Historical-source compatibility

The inherited compatibility receipt's 14 exact current/historical pairs were independently checked against preserved Stage 3 Git blobs. They remain unchanged. Fifteen additional pairs extend this to 29 total: 26 independently executable-identical type/import migrations and the three explicit helper/adapter exceptions above.

Historical bytes are returned only when both the exact current-source SHA and embedded historical SHA match their reviewed pair. Changed current files hash current bytes, corrupted historical snapshots also fall back to current bytes, and missing files throw. The helper and exact compatibility JSON are themselves bound by both complete source graphs. This is not permission to reuse a fingerprint after an unreviewed policy change. The compatibility receipt explicitly distinguishes the three source-only exceptions from executable-identical migrations and preserves its inherited scope as historical context.

New regression coverage checks the original Stage 3 policy-list/order digest, every exact pair, changed/current and corrupted/historical identities, declaration/compatibility/type-source closure, and exclusion of the expanded 27 MB continuation payload. Existing fixture tests also check physical current-file mutation, unmapped sources and missing files.

## Source graph and UI preservation

Independent graph reconstruction finds no missing local imports:

- Stage 2: 116 → 153 records; 58 added, 21 removed, 53 modified, 42 unchanged.
- Stage 3: 67 → 98 records; 34 added, 3 removed, 39 modified, 25 unchanged, including the exact final Stage 2 receipt bytes.

Five adjacent HU declarations are now bound: exact-river-call-EV, multiway inputs, observable actions, observable view paths and range support. Added structural definitions contain types only. Existing small legacy JSON inputs reached through type references remain exact original bytes; the expanded continuation dataset is not imported into the source graph. No expanded reason facts or newly generated artifacts enter the graph.

All 35 inspected Stats/Ranked/trainer/account files match fixed development byte-for-byte. `ProductApp.tsx` retains the earlier Stage 3 account-ready/route-commit fix and its executable is identical to the preserved Stage 3 head. The RangeContextCard and its settings JSX match fixed development exactly. Ranked server authority and separate Stats scopes are unchanged.

## Renewal boundary

Only exact source records and aggregate content identities are renewed. Every prior review field/amendment, artifact/archive record, source fingerprint, count and historical limitation is preserved. Stage 2 is finalized first; Stage 3 then binds that final receipt body. The original numerical review remains the numerical authority.

Strict frontend/runtime typechecks passed in the integration task. Focused testing and the narrow authentication assertion adjustment are recorded in the integration result report; one optional private-policy `.local` test may remain skipped and must be disclosed rather than replaced with invented data. Full current-source publication verification, canonical SQL identity, whole-delivery D1 checks, final suites/build, fresh LFS delivery, browser acceptance and exact-head CI remain separately verified release gates. Source renewal alone establishes none of those outcomes.


## Narrow HU archive source-collector addendum

After the main source renewal, the focused HU storage tests exposed a stale literal `browser-inputs.mjs` root in `scripts/postflop-ai/reviewed-postflop.mjs`. Its current runtime module is `browser-inputs.ts`. Independent comparison against the preserved head confirms the only changes to this collector are the previously reviewed `spots.ts` import, that corrected literal root, the same adjacent `.d.mts`/transitive `.mts` traversal already reviewed above, and the exact known-input classification fix described below. Every other byte of its collection, safe-file checks, snapshot identity, freshness validation, review requirements and acceptance logic is unchanged.

The independently reconstructed HU archive source closure is 81 historical sources versus 104 current sources, with no missing local paths. It binds six adjacent declarations: exact-river-call-EV, multiway inputs, observable actions, observable view paths, range support and the UI-consumed street state. The 12 separate preflop input paths are unchanged and remain excluded from this source array. This count covers the whole inherited typed integration, not 23 new files caused solely by this one-line root correction.

The corrected collector SHA-256 is `5104d147ec0c4712fe4fd614101ad4a4ed9bcda292376012948913490fd96608`. It is not a source in either preflop review graph; independent rehashing still matches all 153 Stage 2 and 98 Stage 3 source records. Consequently no preflop receipt refresh is justified or performed. The fix makes the HU collector follow the actual reviewed modules and declarations; it does not approve or refresh any HU archive, manifest, candidate policy, numerical report or strategy-quality review. Storage test rerun results belong to the integration result report.


The renamed-root rerun then exposed a classification mismatch: `allBoardIdentity.code` follows type-only JSON imports, while the HU manifest deliberately stores the fixed 12 numerical datasets in `inputs`, not `sources`. The narrowly reviewed fix classifies only exact canonical paths from `reviewedInputPaths()` as inputs; every other record must still match `manifest.sources`. Every identity record continues to require an exact path and SHA-256. There is no union lookup, namespace fallback, skipped record, stale-identity acceptance or changed all-board identity construction. The result/companion, 1,755-board coverage, fixed-seed, policy/fingerprint and independent-review gates remain unchanged. Negative regressions reject a wrong classified-input hash and a missing classified input. This correction reconciles existing provenance namespaces; it does not renew numerical-policy or artifact approval.

## Bounded FastFold integration addendum: static review, execution pending

This second integration starts from published Stage 3 head `b3905029d0a4c4cc696edf15dd72ae369bb1827a` and integrates fixed development `e695dc94625260b8ac620cd489c5fc24097e3252`, using `b28147774ec6909196b80353d10129723f333adb` as the common development base. It is isolated from the previously tested checkout. The earlier source approvals, results and limitations above remain historical and unchanged. At this addendum's initial review, the new scoped parity/regression tests have been prepared but have not run; neither preflop review receipt has been renewed for this second integration.

### Static preservation established

The incoming development delta contains 44 paths. Independent byte comparison finds 38 exact upstream files; the intentionally integrated paths are the deployment workflow, spots wrapper, browser inputs, Agent hand/preflop scope and retained Stage 2 receipt. A further 893 published baseline records outside the incoming delta remain unchanged, including explicit pointer-to-materialized-payload validation for the two inherited HU archives. All 3,693 Stage 2/Stage 3 artifacts and both preflop archives have again passed independent raw-byte comparisons to the prior approved receipts. No saved strategy, equity, reason, policy threshold, sample count, baseline fixture or archive was generated or changed.

The independent source graph is narrowly bounded: Stage 2 grows from 153 to 155 sources, with two additions (`spots-core.ts`, `multiway-spots.ts`), five modifications (workflow, backend Wrangler configuration, browser inputs, spots wrapper and local D1 verifier), no removals and 148 unchanged records. Stage 3 remains 98 sources; only the workflow differs before final Stage 2 receipt coupling. These are candidate-source counts, not a declaration that the old receipt already accepts the new sources.

The incoming `spots-core.ts` remains byte-exact upstream: an injected-data factory for the 49 legacy descriptors, with no eager registry reads. The old immutable HU catalog, descriptor types and exact-history matcher are extracted into a pure `multiway-spots.ts`. The ordinary `spots.ts` wrapper composes legacy descriptors followed by the unchanged HU descriptors. Browser input lookup checks exact HU IDs in that pure catalog and otherwise uses the injected legacy factory. It never substitutes a different history or another spot's range.

An omitted Agent dataset lookup retains existing ordinary practice semantics, including exact HU-after-multiway matching and Stage 2 continuation decisions. An explicitly injected lookup retains incoming FastFold's legacy-only coverage. The distinction is made before selecting the ordinary registry default in both postflop and preflop consumers. This avoids accidentally adding HU/continuation coverage to server FastFold or letting the ordinary continuation branch hide an upstream injected lookup. The old greater-than-two-voluntary-participant guard is retained. No policy or missing-data fallback is invented.

### Delivery and sentinel checks

The workflow is independently reproduced as the exact conflict-free three-way merge. It retains both Stage 3 restore steps, Stage 3 test glob, strict full-file D1 verification without bounded-mode substitution, credential-free checkout and main-only deployment gate. Incoming FastFold steps retain pinned Wrangler local authentication/DO checks, exact additive migration `0010_fastfold.sql` before the API, and live FastFold readiness before the compatible client. No workflow, remote migration, live readiness probe or deployment was executed by this review.

The local preservation verifier differs only by the five exact upstream synthetic INSERTs. An independent Python in-memory SQLite check applied all ten current backend migrations with foreign keys enabled, then the complete unchanged-plus-five seed. All 21 unrelated tables contain exactly one row and `foreign_key_check` is empty. The real FastFold result trigger leaves rating/peak at 1000, records one hand and zero result/rating evidence; the paused session has no settlement or receipt update. This verifies schema-valid local fixtures only, not Wrangler/D1 import or rollback.

### Review history and pending executable proof

Incoming FastFold source reviews are documented separately in `fastfold-source-renewal.md` and `fastfold-sentinel-source-renewal.md`. Its receipt carries four `source_renewals` records: two historical TypeScript reviews and the two FastFold reviews. All four must remain verbatim historical evidence alongside every field of the existing Stage 3-integrated review history. Their historical 103-source/Stage-2-only SQL results are not the current combined delivery identity.

Prepared independent execution covers exact JSON serialization of all 456 existing descriptors (49 legacy plus 407 HU), all 452 reachable complete browser-input objects and fingerprints, all 407 ordinary HU Agent paths, injected/missing-lookup rejection, interleaved lookup isolation, and representative continuation families compared against both prior ordinary behavior and the frozen upstream injected preflop module. Four current-source regression tests cover the same scope boundary, including an exact squeeze-four-bet history. At this point these are planned assertions, not passing results.

Only after executable proof may a narrowly attributed source-only amendment update the exact source/content records: Stage 2 first, followed by Stage 3 binding its final receipt bytes. All artifact/archive records, fingerprints, counts, original numerical approvals and historical limitations must remain unchanged. No new strategy-quality, FastFold-rating calibration, browser, production, full-D1 rollback or final-head CI approval follows from this static review.

### FastFold executable proof and source-only renewal completed

The independently prepared bounded parity harness subsequently passed in 6.478 seconds, with reported peak RSS 366,076 KiB and a 256 MiB Node heap cap. It compared the prior tested checkout with this integration without generation or sampling. Complete ordered JSON serialization matched for all 456 descriptors and all 452 reachable browser-input objects, including their fingerprints; the same four legacy descriptors remain unreachable. All 407 ordinary HU Agent paths matched the previous implementation. All 407 injected-server and 407 missing-injected-source HU paths returned null. Interleaved legacy scopes remained isolated, could not read the ordinary registry as a fallback, and did not mutate another scope.

Representative squeeze, cold-four-bet, two-caller-squeeze and three-bet-cold-call histories also preserved old ordinary continuation sources. Their explicitly injected sources and choices matched the frozen exact upstream preflop implementation. This is important: the latter two injected histories retain upstream legacy squeeze/three-bet sources, while ordinary practice retains the separately saved continuation records. Neither behavior was silently substituted for the other. The frozen comparison module changes only relative import URLs for the isolated harness; its executable source is the exact incoming Git blob.

The full proof includes every descriptor/input fingerprint and before/after source identities. Its SHA-256 is `12198452989ddcc83d032aedfc3e9e485fbf135bbe06bd555419400c525e3c36`. Source hashes were checked again after the run and before renewal.

The independent reviewer then renewed only source/content identities, retaining all old metadata and the four complete upstream `source_renewals` entries verbatim. All 3,693 artifact records, four existing archive payloads, baseline fixtures, saved fingerprints and counts remain unchanged. Final receipt identities are:

- Stage 2: 155 sources, 554,848 bytes; receipt SHA-256 `9156cb33224a06dd4d9b857a025047f8fc5c88eecc6ea67813aaa38514f801cb`; content identity `9365af739d383d3715cd59ec969a38c59a32cff91ff488a794730bffbed50e38`.
- Stage 3: 98 sources, 528,418 bytes; receipt SHA-256 `a5c2cf564b542d7e79ead2861686105e7d2c6afd89547ffa51283c88ad19029d`; content identity `b8478f85a10fba2193644a0c280c800adbc7f567c27cdf84d78133353f03f6fa`.

Stage 2 was finalized first. Stage 3 was then bound to those exact Stage 2 bytes. Independent raw-byte rechecking passed every source, artifact and archive record after installation. The final Stage 3 source delta is two modifications (workflow and Stage 2 receipt), with 96 unchanged records and no additions/removals.

This completes the scoped compatibility review only. Current-source regression suites, typecheck/build, complete publication/SQL/clean-restoration validation, strict full-file D1 verification and final-head CI are separately recorded by the integration task. No private policy was invented to remove an optional test skip, and no production/browser/rating-calibration assurance is added.

### Final erased facade annotation

Strict integration typechecking exposed an inferred public lookup union in the consumer's flop-spot selection. The fix is limited to two type aliases (`LegacyLookup`, `LegacyFacade`) and the `LegacyFacade` annotation on the existing `spots.ts` export destructuring. Lookup exports retain the established `Spot | null` facade. No consumer or runtime expression changes.

The independent reviewer removed exactly those two declarations and that one annotation in memory. The resulting bytes reproduce the parity-tested `spots.ts` SHA-256 `eca3419557d2dc4fba69bdc3540dde814e2afed364deae295528a56ba3b4e249` exactly. Current typed source SHA-256 is `d9a783c3594976b7777d4402a34cfac364bad4cb74f20d2c2f5c59948fb7a994`. This establishes that the existing 456-descriptor/452-input execution proof is unchanged by the annotation. Frontend strict TypeScript then passed with exit 0 in 2.357 seconds; no additional Node process or strategy generation was run by the reviewer.

A separate additive type-only renewal preserves every preceding review field and all four inherited upstream source reviews. Only the Stage 2 `spots.ts` source record changes; Stage 3 then rebinds the final Stage 2 receipt. All source/artifact/archive records were independently rehashed afterward. Latest receipt identities supersede only the previous receipt byte/content identities above:

- Stage 2: 155 sources, 556,863 bytes; SHA-256 `630a45330923d076c71d47b1a06cbcb96e88c8d6acc5058a6698b1e30f0e62e7`; content identity `f403cd76b634a1a6c57d6b2cba0e893d05f005018ff795a6eb710fbd9602bde5`.
- Stage 3: 98 sources, 530,588 bytes; SHA-256 `461bfa6359ddcbbf3b1a766709e92f54738340c6683e581e5e2d1d555911b4a3`; content identity `bc7f564f4d06a6d547f1aa4f319794dcbaa6bd19bf8c3ea66f68d2b434cc816e`.

Numerical artifacts, archives, saved fingerprints, counts and all other release gates remain unchanged. Subsequent runtime typecheck, focused/full suites and delivery evidence are recorded separately; this annotation renewal does not claim those results.
