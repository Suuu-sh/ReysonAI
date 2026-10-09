# Independent MW3 protected-edge review

Result: **PASS for the reviewed source-context renewal. No remaining blocking findings.** Final installed-inventory verification and exact-head remote CI remain required.

- Repository: Suuu-sh/ReysonAI, Draft PR96 targeting PR44 (`codex/multiway-postflop-stage1`)
- Reviewed remote commit: `eeb9a9d8228009abf0dbfeb30343ef2b1025b31a`
- Reviewed source tree: `f39c0b8db644fbf55f4e84283cd3286d125f3f76`
- Independent reviewer: actual `gpt-6-astra`, `/root/verify_mw3_guard_revision`
- Separate implementation author: `/root/fix_mw3_review_guard`
- Remote tree identity was checked independently through the official GitHub Git commit API.

## Resolved findings

The initial guard rejected simple import strings but missed valid comment-separated static/dynamic imports and template-literal imports. The independent reviewer reproduced these bypasses and withheld renewal. The author replaced regex extraction with a pinned TypeScript/JavaScript AST parser. Independent review then caught an unsupported license-file inventory path and silently omitted rooted/file-URL imports. The final source resolves both without relaxing the archive schema or strict loader.

The vendored parser's original 512,666-byte JavaScript body and exact 1,086-byte MIT license match the existing lock-pinned upstream package. The 512,795-byte standalone ESM adaptation, JSON license wrapper, provenance and dependency extractor are all receipt-bound. No live node_modules fallback is permitted by the captured parent.

Retained sources may not import excluded TSX/CSS: the edge rejects before filtering, including type imports, re-exports, comments, escaped literals and literal dynamic templates. A real TS→UI→helper bridge rejects, while a direct import of the ordinary helper makes that helper protected. Computed imports, rooted/absolute/URL paths, query/fragment targets and extensionless relative paths fail closed. The sole computed bootstrap exception requires its exact path, complete SHA, expression and fixed target. Arbitrary eval, user-defined loaders and arbitrary CommonJS require are outside the explicitly documented static-analysis contract.

## Exact source scope

Against PR44, each of all 16 subjects removes the same 96 original paths: 23 TSX, 6 CSS and 67 others (59 TS, 3 d.mts, 3 mjs, 1 JSON and 1 PNG). The removed non-UI modules are explicitly listed and are no longer bound by numerical approval; they are not claimed to be presentation-only.

The robust guard adds exactly four verification dependencies. Relative to the previous accepted numerical scope, no source paths are removed: the pilot grows from 132 to 136, and each other subject from 133 to 137. The collector is the only changed previously retained source. Conservative type/declaration and required JSON dependencies remain protected. HU collector and receipt are unchanged.

## Independent verification

- Official saved-byte collection and current verification passed for all 16 subjects, reproducing each original canonical gzip byte-for-byte.
- All 112 numerical/evidence files totaling 235,515,283 bytes, 16 archives, 32 pins, recipes/profiles/inputs, inherited evidence, 561 joint warnings and seven limitations per subject are unchanged.
- Node 22.20.0 frontend contracts: 236 total, 235 passed, zero failed, one existing opt-in actual-Wrangler startup skip.
- Node 22.20.0 backend contracts: 6/6 passed. Frontend/backend and runtime typechecks passed.
- The CI-pinned 256 MiB old-space synthetic memory fixture passed with the existing limits unchanged.
- Temporary comments in gameplay-mobile.css and RankedStats.tsx preserved current verification for every subject; exact original bytes were restored.
- Fourteen protected-source/input/parser mutations rejected. Archive, manifest and historical-receipt reuse mutations rejected.
- Eight additional independent escape/import probes rejected for every subject, covering repository escapes, symlinks, generated paths, relative node_modules, rooted/file-URL imports, TypeScript import-equals and namespace re-exports.
- Fresh receipt-hash and both delivery-pin mutation checks rejected for all 16 subjects.
- All 16 generated SQL statement bodies are identical; only the receipt-derived comments change.

This is a source-context-only review. No strategy generation, new simulation, renewed quantitative-quality judgment, actual-D1 execution, browser/live-auth E2E, merge, main modification or production operation was performed. Historical quality/D1/browser evidence remains historical. These are reviewer-authored provenance receipts, not cryptographic signatures.

## Installation

Use `install/` and verify every file against `install-plan.json`. The package contains exactly 16 new manifests, 16 independently authored receipts, 16 SQL files and compact review evidence. It contains no replacement archives, inputs, recipes, registry or runtime source files, and no full historical manifest/receipt copies.

Install on the existing PR96 branch, keep it Draft and target PR44. Then run the official committed-inventory restore/verify, 32-pin parity, frontend/backend MW3 tests, typechecks and final UI/protected mutation checks. Verify CI for the exact final remote head before reporting completion. Do not merge or deploy.
