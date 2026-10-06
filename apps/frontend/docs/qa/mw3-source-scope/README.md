# MW3 numerical source scope

This draft is based on PR44 commit `0838518ed50fae99b27584f30ee6ed6f6196acc0` and the supplied `spec-mw3-source-scope.md` (SHA-256 `10ce9fda07d3f71e98c9a7f2846425f8c3902939fe90ef4ba05ca836bc0f931f`). It changes source-context provenance only. No strategy generation, numerical quality renewal, merge, production D1 operation or deployment is authorized.

## Boundary

`sourcePathsFor` no longer starts from `RangeWorkspace.tsx`, `Mw3RangeView.tsx`, `AgentTable.tsx`, `src/agent/hand.ts` or the general backend `index.ts`. Frontend `src/**/*.tsx` and `src/**/*.css` are excluded before both recording and traversal. Dedicated transport, browser verification, Agent MW3 execution, shared authority, schema, numerical/gate code and strict local-verification tooling remain protected. The existing backend `mw3-index.test.mjs` continues checking application route wiring.

Type and declaration dependencies still follow the existing conservative closure. In particular, `mw3-hand.ts` imports `hand.ts` types, so `hand.ts` remains a transitive protected source even though it is no longer an explicit root. No runtime imports or gates were edited to make the inventory smaller. Neither the retained `mw3-browser.ts` nor `mw3-hand.ts` closure currently reaches a `.tsx` or `.css` dependency after the explicit UI roots are removed.

## Two specification corrections requiring review

1. The actual saved inventory has **16 subjects**, including the pilot, not 15. Renewal must cover all 16 manifests and receipts, preserving 112 saved numerical files, 16 original compressed archives and 32 delivery pins byte-for-byte.
2. A blanket exclusion of non-input JSON is unsafe and conflicts with the explicitly retained package/lock/configuration files. All reachable JSON dependencies remain protected exceptions: recipes/profiles, game and gate configuration, exact-source compatibility inventory/review/evidence, shared runtime datasets and locale imports. The conservative type/declaration graph also reaches `types.ts` → `table-profile.ts` → `i18n.ts` → locale JSON. Those files are retained with the existing declaration policy; they are not claimed to execute on every verification-parent import. Runtime JSON such as the compatibility inventory must remain available to the strict captured-parent loader. No source fallback or loader bypass is added. The three MW3 input JSON files remain in the separate, fully verified `inputs` inventory. A broader runtime/localization decoupling is a separate refactor.

The source-scope tests explicitly enforce both corrections and the retained protected boundaries. This change therefore decouples `.tsx`/`.css` edits, not every possible presentation-related `.ts` or `.json` edit.

## HU remains separate

`reviewed-postflop.mjs` has `postflop-trial.ts` as its consumer root and retains its current traversal. Editing that receipt-bound collector would change the HU-after-multiway review identity. Per the requested exception, neither that collector nor `configs/hu-postflop-after-multiway.review.json` is changed here. HU scope work requires a separate PR.

## Review and evidence

Implementation and source-context acceptance are separate tasks. New manifests may be collected with the official collector only after committing the source. A different reviewer must independently verify the final source, original numerical bytes and 32 pins, then issue the fresh receipts. Historical versions remain in Git; no full historical manifest/receipt copies are added. A compact prior-hash ledger is sufficient.

The new source-scope test is included in MW3 CI, and that read-only workflow also runs for draft changes targeting the PR44 branch. Existing checks and their opt-in behavior are retained. Required validation includes official committed-inventory restoration, MW3 frontend/backend contracts, frontend/backend type checking and temporary CSS/RankedStats mutations that must preserve numerical verification. Protected source, input, archive, manifest, receipt and pin mutations must still fail closed. Any real-D1 or browser claims must be separately evidenced; historical runs are not re-labelled.
