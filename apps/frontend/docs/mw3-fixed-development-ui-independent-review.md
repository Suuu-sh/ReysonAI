# Fixed-development MW3 UI integration: independent static review

Reviewed 2026-10-05. Decision: **no blocking integration regression identified in the scoped source review**. This is not browser QA, runtime numerical verification, or delivery approval.

## Exact review boundary

- Frozen development: `ada7dd0e4b9a2015028cf3f512b04d3075b04669`, tree `0cffe162c4fd3b50541d325063c4c93cab47ad39`.
- Its verified local tree materialization: `267102cd416d8e37c66f5e032a1f175f6ac6f612`.
- Preserved MW3/PR44 branch: `d29a50aed0208b57f80d5ecc305f8b17468aa8a5`.
- Reviewed integration is an uncommitted frozen working snapshot. All 23 source SHA-256 hashes are in `mw3-fixed-development-ui-independent-review.json`. Recheck that manifest after any source edit.
- Source files were read-only for this reviewer. Only this report and its evidence were created.

## Method and result

Read the applicable frontend and estimated-range AGENTS instructions. Compared all 23 assigned source files with the preserved MW3 source and inspected the development presentation changes. A bounded source-only comparison used installed esbuild to erase TypeScript and Babel to compare runtime syntax trees. It did not import or execute application code. Import suffixes `.mjs` and their relocated `.ts` targets were normalized; source locations, comments, literal quotation styles and redundant parentheses were ignored. Correctness of relocated runtime modules is a separate runtime/source-identity review boundary.

Eighteen of the 22 files present in the preserved commit have identical normalized runtime ASTs. `postflop-facts.ts` is a type-only file. The remaining four diffs were inspected in full:

1. `AgentTable.tsx` replaces its duplicate Card renderer with development's shared PlayingCard, retaining the agent variant, sizes, hidden cards, board and log integration. Expanded MW3/continuation dataset loading and MW3 routing remain intact.
2. `PostflopTrial.tsx` uses development's shared Dialog shell for flop and later cards. Manual selection, random flop, excluded cards, apply/close handlers and labels are unchanged. The shared shell retains focus trapping, Escape, backdrop close and focus restoration.
3. `RangeWorkspace.tsx` retains development's settings header/reset/display-mode placement. The other differences are removal of two unused arguments from `rewindActionBlockTransition` and an equivalent Boolean predicate in `filter`. The callee does not read those removed arguments.
4. `continuation-copy.ts` introduces a typed `errorLike` local referencing the same input; the error-code/message checks and displayed errors are unchanged.

`PlayingCard.tsx`, `Dialog.tsx` and `RangeContextCard.tsx` are byte-identical to the frozen development materialization; their hashes are retained in the manifest.

## Preservation findings

- `range-url.ts` retains its observable-action legality/canonicalization, saved continuation choices and board/history serialization. `RangeWorkspace.tsx:378-419` retains popstate session remount and dependent street clearing. Its source-loading state still does not erase valid board intent (`RangeWorkspace.tsx:698-719`).
- `continuation-flow.ts` and `continuation-ranges.ts` retain exact saved source selection, conditional hand reach, terminal compatible-deal checks, distinct missing/unreachable/error states, retry and navigation availability. Their runtime ASTs match the preserved implementation.
- `postflop-trial.ts` retains the shared street-state replay and physical observable action labels/aliases. `PostflopTrial.tsx` continues passing actual decision metadata to hand explanations. No duplicated old replay logic was restored.
- `postflop-compute.ts`, `postflop-browser.ts`, `postflop-advanced.ts`, `postflop-explanation.ts` and action-copy helpers show no runtime drift after import relocation. They do not introduce new frequencies, ranges or EV. Exact river call EV implementation/parity is owned by the runtime review, not inferred from this UI comparison.
- `Mw3PostflopTrial.tsx`, `Mw3RangeView.tsx`, `mw3-range-state.ts`, `mw3-browser.ts`, `mw3-copy.ts` and `mw3-explanation.ts` preserve their runtime syntax. Dedicated MW3 navigation, verified delivery checks, action grouping, original-role labels and 3-to-2 continuation are not replaced with heads-up policy data.

## Types and narrow recommendation

No new type-related runtime blocker was found. The integrated UI still has permissive `any` boundaries inherited from the preserved MW3 implementation, and `WorkspaceActionBlock` remains a broad partial shape requiring non-null assertions. These limit compile-time discrimination, but are not evidence of a behavioral regression. A future isolated cleanup can derive MW3 view/navigation types from the runtime and use discriminated block unions. Do not expand this preservation patch into a broad runtime-guard or policy rewrite.

Proceed with the coordinator's already-planned targeted regression tests and browser QA on these exact bytes. Browser checks should cover manual/random cards, Close/Escape/focus return, rewind and Back/Forward with delayed/missing continuation data, MW3 flop-to-river/3-to-2 navigation, and canonical all-in labels. No additional implementation change is recommended from this review.

## Verification limits

- Source-erasure comparison: PASS, 2026-10-05 05:37:47 UTC, exit 0, approximately 0.67 seconds.
- Coordinator reported frontend and runtime typecheck PASS on the frozen integration before this comparison. This reviewer read the corresponding final log but did not rerun it.
- App numerical tests: not run by this reviewer.
- Browser QA, screenshots, accessibility interactions and layout at mobile widths: not run by this reviewer and not passed by this report.
- No assertion about production, deployed APIs, final CI, artifact restore or merge readiness is made here.
