# TypeScript source layout

All tracked JavaScript source, configuration, tests, and tooling have moved to
TypeScript. Node commands use explicit `.ts` imports and require Node >=22.20.0.
Browser/Worker/SDK build artifacts remain JavaScript; generated `.js` and `.mjs`
filenames are not source files and must not be rewritten to `.ts`.

## Checks

- `npm --prefix apps/frontend run typecheck`: existing strict application/runtime
  checks, strict scripts, frontend tests/configuration, historical QA harnesses,
  and frontend Node tooling.
- `npm --prefix apps/frontend run typecheck:repository`: after installing frontend
  and MCP dependencies, emit the SDK and check the complete repository tooling
  plus both runtimes (does not require pre-existing ignored SDK build outputs).
- `npm --prefix apps/frontend test`: frontend test suite.
- `npm --prefix apps/frontend run build`: Vite client and compiled Sites Worker.
- `npm --prefix apps/mcp run typecheck`: strict MCP runtime.
- `npm --prefix apps/mcp test`: MCP tests.
- `npm --prefix packages/reysonai-sdk-ts test`: emitted SDK compatibility.
- `node --test scripts/ci/typescript-sources.test.ts`: prevent tracked JS source
  from returning and preserve strict runtime checks.

Tests and historical replay harnesses retain permissive fixture boundaries for
intentionally partial/malformed inputs; this does not relax the original strict
application/runtime checks. Historical harnesses may load a selected checkout's
runtime dynamically, rather than assert compatibility with today's types.

Historical source names/bytes, receipts, and numerical dataset approvals remain
historical evidence. TypeScript migration reviews cover source equivalence only,
not new strategy validation, data publication, or deployment authorization.

## Verification status (2026-10-16)

Repository-wide type checking, frontend build, emitted JavaScript Worker smoke,
and the local range-screen browser check passed. Existing strict runtime checks
remain enabled. Independent source-only reviews cover 22 MW3 identity pairs and
34 policy-source records, without renewing strategy or publication approvals.

The first complete frontend run had 1,290 passing / 127 failing / 2 skipped cases;
subsequent targeted checks fixed migration-time import/fixture failures and verified
new review guards. The expensive complete numerical suite was not rerun. Genuine
old publication/source-graph/author-recipe receipts can still reject the changed
raw source bytes. Those gates are not bypassed and production is not updated.

Final targeted migration checks: 38 passed / 3 failed; the three failures are the
unrenewed full-source receipts (ranked and reviewed preflop) and MW3 raw author
recipe SHA binding. New isolated overlay regressions passed 16/16, including
stale old-JS-file reappearance. These checks do not assert release readiness.
