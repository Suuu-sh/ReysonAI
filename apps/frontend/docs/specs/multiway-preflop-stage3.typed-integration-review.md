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
