# Corrective MCP Worker typecheck wiring review

- Review date: 2026-10-10 UTC
- Scope: Place the composed API Worker typecheck in the MCP CI workflow while keeping the frontend package bytes pinned to the development baseline.
- This is a source/workflow correction only. It does not renew strategy, numerical, saved-data, production, merge, or deployment approval.

## Finding and correction

The strict reviewed-data Actions jobs on PR #173 head `43742937dd0dc1097e4998dd862488edf4e08de4` failed because `apps/frontend/package.json` is a pinned MW3 input and its bytes had changed for typecheck wiring. The frontend package file is restored byte-for-byte to development's `0bdb9fcccece00cf207c1f7fd41ebe961f18587c` content: 2,514 UTF-8 bytes, SHA-256 `7aa07c287011bd5c2f303680bc6f3fa07203ddb7692ed53b38b8de0907222696`.

The browser project remains in `apps/frontend/tsconfig.json`; the Worker project remains in `apps/frontend/tsconfig.worker.json`. `.github/workflows/verify-mcp.yml` now starts when either frontend TypeScript configuration changes and runs `npx tsc --project ../frontend/tsconfig.worker.json --noEmit` from `apps/mcp`, after its `npm ci --ignore-scripts`. That reuses the MCP-local TypeScript compiler and installed Cloudflare Worker types to check the backend and MCP sources. Existing MCP typecheck, tests, build check, and composed API Worker dry-run remain in the workflow.

## Receipt boundary

The Stage 2 and Stage 3 package source rows are restored to the development-baseline identity. The existing Stage 2 renewal for `.github/workflows/deploy-worker.yml` remains because it records the MCP dependency installation required by the composed Worker. The new verification workflow and the frontend tsconfig files are outside these receipts' source records; the reviewed source graph confirms they do not alter the pinned MW3 data inputs. Stage 3 continues to bind the exact Stage 2 receipt.

The earlier package typecheck renewal is retained as historical review history and superseded by this correction. Stage 2/3 artifacts, archives, counts, and source fingerprints are unchanged.

## Validation boundary

The prior exact-head CI failure is the reason for this correction. Exact-head CI for the corrected workflow is pending when this report is written; no local compiler run was possible from the non-repository task workspace. No data generation, D1 operation, production configuration change, deployment, or merge was performed.
