# MW3 numerical source scope

This draft is based on PR44 commit `0838518ed50fae99b27584f30ee6ed6f6196acc0` and the supplied `spec-mw3-source-scope.md` (SHA-256 `10ce9fda07d3f71e98c9a7f2846425f8c3902939fe90ef4ba05ca836bc0f931f`). It changes source-context provenance only. No strategy generation, numerical quality renewal, merge, production D1 operation or deployment is authorized.

## Boundary

`sourcePathsFor` no longer starts from `RangeWorkspace.tsx`, `Mw3RangeView.tsx`, `AgentTable.tsx`, `src/agent/hand.ts` or the general backend `index.ts`. Frontend `src/**/*.tsx` and `src/**/*.css` roots are excluded before both recording and traversal. A relative import from any retained source into that excluded scope is instead rejected immediately, with both importer and target in the error; it must never disappear silently from the dependency closure. The same guard covers static and side-effect imports, dynamic imports, re-exports and type-only imports using a pinned TS/JS AST parser; conservative type/declaration reachability remains protected. Dedicated transport, browser verification, Agent MW3 execution, shared authority, schema, numerical/gate code and strict local-verification tooling remain protected. The existing backend `mw3-index.test.mjs` continues checking application route wiring.

Type and declaration dependencies still follow the existing conservative closure. In particular, `mw3-hand.ts` imports `hand.ts` types, so `hand.ts` remains a transitive protected source even though it is no longer an explicit root. No runtime imports or gates were edited to make the inventory smaller. All 16 current retained closures pass the traversal-time guard: none reaches a `.tsx` or `.css` dependency after the explicit UI roots are removed. Isolated mutations of `mw3-browser.ts`, `mw3-hand.ts` and the transitively retained `hand.ts` prove that adding such an edge fails for all 16 identities, even when the excluded UI target is absent. This is an edge check before filtering, not an assertion that the filtered inventory contains no UI files.

## Exact excluded closure, including non-UI files

This is a root-and-reachability reduction, **not only an extension filter**. Compared with the PR44 base above, each of the 16 source inventories loses the same **96 original paths**, while the robust dependency guard adds **4 verification dependencies** listed below: **23 `.tsx`, 6 `.css` and 67 other files**. The 67 other files are **59 `.ts`, 3 `.d.mts`, 3 `.mjs`, 1 `.json` and 1 `.png`**, not 67 TypeScript files. The earlier root reduction changed the pilot inventory from 228 to 132 paths and each other inventory from 229 to 133. Adding the four parser verification dependencies makes the current counts **136 and 137** respectively. The retained numerical/runtime paths are unchanged; the verification source scope is explicitly larger. [The complete verified excluded inventory](excluded-inventory.json) lists every path and each subject's before/after count.

Those 67 files were reachable only through removed UI roots or the general backend entry point. Their names/extensions do not imply they are presentation-only, and they are no longer bound by MW3 numerical acceptance. They include:

- MW3 range selection, cache, copy and explanation helpers: `mw3-range-state.ts`, `mw3-kit-cache.ts`, `mw3-copy.ts`, `mw3-explanation.ts`.
- Agent session/statistics and UI-only range/continuation helpers, plus HU browser, explanation and observable-view helpers reached through the removed workspace roots.
- General backend dispatch/product modules: `index.ts`, `account.ts`, `native-account.ts`, `ranked.ts`, `fastfold-dispatch.ts`, `postflop-runtime-config.ts`, `preflop-datasets.ts`, plus shared `ranked-rules.ts`.
- The UI-reachable `agent-baseline.json` and brand image. Retained JSON dependencies described below are unaffected.

This boundary deliberately leaves those application behaviors to their dedicated tests/reviews. MW3 source receipts no longer detect their isolated changes; they still bind the retained numerical generation/verification/delivery/runtime closure. The dedicated backend `mw3-transport.ts`, shared approval registry, browser validation and `mw3-hand.ts` execution remain protected. If a retained module later imports an excluded `.tsx`/`.css` file, collection and verification fail until that dependency is refactored or the boundary is explicitly reviewed.

## AST dependency guard and its bound parser

A regex could miss valid commented imports or no-substitution template literals. The dependency collector now uses the already lock-pinned **`@babel/parser` 7.29.7** implementation, with its original **512,666-byte** JavaScript body unchanged. The standalone ESM adaptation is **512,795 bytes (about 0.49 MiB)**; its exact **1,086-byte MIT license text** (in a supported JSON source record) and package URL, integrity, upstream SHA-256 and adaptation SHA-256 are recorded alongside it. This one vendored implementation is necessary because the strict captured-parent loader forbids loading an unrecorded `node_modules` parser. The installed TypeScript 7 compiler provides no JavaScript AST API here. There is no package or filesystem fallback.

Exactly four new verification dependencies are bound by every manifest:

- `scripts/postflop-ai/mw3-source-dependencies.mjs`
- `scripts/postflop-ai/vendor/babel-parser-7.29.7.mjs`
- `scripts/postflop-ai/vendor/babel-parser-7.29.7.license.json`
- `scripts/postflop-ai/vendor/babel-parser-7.29.7.provenance.json`

Supported dependency syntax includes ESM imports/re-exports, TypeScript type imports/exports (including `import("...").Type` and declaration files), TypeScript external module references, dynamic string-literal imports and dynamic templates without substitutions. Escapes in literal specifiers are decoded by the parser. Comments, ordinary strings and regex literals are not imports. Rooted/absolute filesystem paths, backslash paths, non-`node:` URL references, query/fragment-bearing specifiers, extensionless relative imports, unsupported syntax and unresolved computed import expressions fail closed. This static analyzer does not claim to discover arbitrary `eval`, user-defined loaders or arbitrary CommonJS `require` calls.

The only computed-import exception is the existing strict bootstrap in `scripts/verify-mw3-local-d1.mjs`. It requires that exact repository path, complete SHA-256 `e3959bbb7026fa34fdee7bf402f53a65fb17d987e4c062e89eb7cd5148e45f51`, the exact expression `pathToFileURL(join(captured.root, PARENT_ENTRY)).href`, and the fixed `PARENT_ENTRY` declaration targeting `apps/frontend/scripts/ci/mw3-local-d1-oracle.mjs`. The fixed target is traversed and bound too. Changing the path, source bytes, expression/root or target rejects the exception. The exact source binding retains the already reviewed `captured.root` and immutable-buffer loader semantics; it is not a generic computed-import allowance.

Regression tests cover the previously missed valid syntax, escaped paths, type imports, invalid/unresolved targets, the four bootstrap-exception conditions, and a real retained-TS → excluded-TSX → helper-TS bridge. Importing the ordinary excluded helper directly instead makes it protected. Captured-parent replay asserts that both the extraction module and vendor parser execute from the recorded buffers.

## Two specification corrections requiring review

1. The actual saved inventory has **16 subjects**, including the pilot, not 15. Renewal must cover all 16 manifests and receipts, preserving 112 saved numerical files, 16 original compressed archives and 32 delivery pins byte-for-byte.
2. A blanket exclusion of non-input JSON is unsafe and conflicts with the explicitly retained package/lock/configuration files. All reachable JSON dependencies remain protected exceptions: recipes/profiles, game and gate configuration, exact-source compatibility inventory/review/evidence, shared runtime datasets and locale imports. The conservative type/declaration graph also reaches `types.ts` → `table-profile.ts` → `i18n.ts` → locale JSON. Those files are retained with the existing declaration policy; they are not claimed to execute on every verification-parent import. Runtime JSON such as the compatibility inventory must remain available to the strict captured-parent loader. No source fallback or loader bypass is added. The three MW3 input JSON files remain in the separate, fully verified `inputs` inventory. A broader runtime/localization decoupling is a separate refactor.

The source-scope tests explicitly enforce both corrections and the retained protected boundaries. This change therefore decouples `.tsx`/`.css` edits, not every possible presentation-related `.ts` or `.json` edit.

## HU remains separate

`reviewed-postflop.mjs` has `postflop-trial.ts` as its consumer root and retains its current traversal. Editing that receipt-bound collector would change the HU-after-multiway review identity. Per the requested exception, neither that collector nor `configs/hu-postflop-after-multiway.review.json` is changed here. HU scope work requires a separate PR.

## Review and evidence

The protected-edge guard changes the receipt-bound collector, so all 16 source manifests and independent receipts require another source-context renewal. Earlier source-only receipts and test totals apply to the earlier collector, not this revision. The implementation author must not approve this renewal. The 112 numerical files, 16 archives, 32 pins and HU scope remain unchanged; no numerical regeneration is required or authorized.

Implementation and source-context acceptance are separate tasks. New manifests may be collected with the official collector only after committing the source. A different reviewer must independently verify the final source, original numerical bytes and 32 pins, then issue the fresh receipts. Historical versions remain in Git; no full historical manifest/receipt copies are added. A compact prior-hash ledger is sufficient.

The new source-scope test is included in MW3 CI, and that read-only workflow also runs for draft changes targeting the PR44 branch. Existing checks and their opt-in behavior are retained. Required validation includes official committed-inventory restoration, MW3 frontend/backend contracts, frontend/backend type checking and temporary CSS/RankedStats mutations that must preserve numerical verification. Protected source, input, archive, manifest, receipt and pin mutations must still fail closed. Any real-D1 or browser claims must be separately evidenced; historical runs are not re-labelled.
