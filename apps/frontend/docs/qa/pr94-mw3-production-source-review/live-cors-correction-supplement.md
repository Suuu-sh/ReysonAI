# MW3 live CORS verifier correction supplement

Status: author-prepared evidence for independent review; not an approval.

Base: current `main` at `737d6fdac9619733b6d3a344d03ed14b688af06f` (PR #139).

## Finding and correction

The live verifier previously required `Access-Control-Allow-Credentials: true` on every response. That rejected the public preflop dataset and MW3 manifest/part endpoints when they correctly returned the exact allowed `Access-Control-Allow-Origin` and no credentials header. The backend only enables credentialed CORS for `/v1/account/`, `/v1/ranked/`, and `/v1/fastfold/`. The public frontend dataset and MW3 consumers use ordinary `fetch` without `credentials: "include"`.

The verifier now keeps the exact origin check for public endpoints, requires the public credential header to be absent, and continues requiring both exact origin and `Access-Control-Allow-Credentials: true` on the anonymous FastFold history rejection response. It does not change backend CORS behavior, allowed origins, authentication, credentials, workflow gates, SQL/data, or reviewed source receipts.

The earlier simulated complete-consumer fixture returned `Access-Control-Allow-Credentials: true` on every response. It therefore did not exercise the distinction between public and cookie-authenticated routes; its simulated payload pass is not evidence of live CORS acceptance.

## Exact files and local verification

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `apps/frontend/scripts/mw3-production-delivery.mjs` | 14155 | `9265df771c21a8b59a37a9180988bc7a0863cf456f1b3e8d8123bc443393635a` |
| `apps/frontend/tests/mw3-production-delivery.test.mjs` | 8816 | `1361954e1c059ca692c114c20891a615231555d355f010397d12434d0e942eae` |
| `apps/backend/tests/index.test.mjs` | 8840 | `16f58d1d328cbd402abcfb7aca0fc38da012d84960cafbf4c29bb144fe5de17a` |

`node --test tests/mw3-production-delivery.test.mjs` passed 9/9 tests and `node --experimental-strip-types --test tests/index.test.mjs` passed 6/6 tests on Node.js v25.8.1. The frontend contract tests confirm that correct public headers pass, an origin mismatch fails, unexpected public credentials fail, and authenticated CORS fails when credentials or exact origin are missing. The backend test calls the actual Worker router: public dataset reads return the exact allowed origin with no credentials header; a mismatched origin receives no CORS grant; anonymous FastFold history returns 401 with credentialed CORS for the allowed origin and no grant for a mismatched origin. The existing live-flow fixture now uses the correct public header shape. `git diff --check` passed. No GitHub Actions run was requested to avoid consuming the repository's limited CI quota; pinned Node.js CI remains pending.

No live HTTP request, production D1 read/write, or deployment was run for this correction. After independent review of the exact PR head, a separate read-only live validator run should verify all 16 source fingerprints, 32 manifests and 1,552 parts without rerunning the import workflow.
