# MCP/API consolidation source-only review

- Review date: 2026-10-10
- Reviewer: independent read-only source-only reviewer (`/root/source_only_review`)
- Reviewed PR head: `9c69754f46061e5ccc8dea281c6770402cc94f98`
- Scope: workflow source identity, dependency installation order, tracked deployment configuration, and rollback documentation. This is not a numerical strategy review or production authorization.

## Findings

The PR changes one Stage 2 reviewed source path: `.github/workflows/deploy-worker.yml`. The exact change adds MCP source/package lock paths to the workflow trigger and runs `npm ci --ignore-scripts` in `apps/mcp` before both verification and deployment. The old receipt records 17,820 bytes / SHA-256 `5a7804310fbee8aa0b781bdc9b37f8c6fc6319c8f21acfe94bcda943a6e08318`; the PR file is 18,213 bytes / SHA-256 `3a9243cb6d964fb0201a5d51c6bd31a65c3d4352dea59e3a6d07345d3dcb7df9`.

`.github/workflows/verify-fastfold.yml` is not in the Stage 2 reviewed source graph. It now installs MCP dependencies before the reviewed-payload restore and FastFold checks. The exact-head CI job confirmed that install step succeeds. The composed API Worker dry-run is in `verify-mcp.yml`, where MCP install precedes the dry-run and exact-head CI passed it.

The Stage 3 source graph also binds `.github/workflows/deploy-worker.yml` and `configs/multiway-preflop-stage2.review.json`. After the Stage 2 receipt is renewed, the Stage 3 receipt must rebind those two source records and its derived `content_sha256`.

The accompanying plan now names tracked `apps/backend/wrangler.jsonc` as the source of truth for an approved `OAUTH_KV` binding and non-secret MCP variables so ordinary config-based redeploys retain them. Secrets remain in Cloudflare Worker Secrets and out of source. The plan requires a just-in-time sanitized rollback snapshot from the latest active API version, and retains the standalone MCP Worker through OAuth refresh/revocation, authenticated MCP, API/account, ranked, and FastFold checks.

## Exact-head validation observed

- [MCP workflow run #83](https://github.com/Suuu-sh/ReysonAI/actions/runs/38045180429): typecheck, 68/68 tests (0 skipped), build check, composed API Worker dry-run, and API/account contract step all passed. The API contract suite reported 37 passed and one expected skip because local generated postflop artifacts are absent.
- [FastFold workflow run #168](https://github.com/Suuu-sh/ReysonAI/actions/runs/38045180442): MCP dependency installation passed; the next reviewed-payload restore step stopped on stale source identity, so FastFold tests did not run.
- [Three-player contract run #109](https://github.com/Suuu-sh/ReysonAI/actions/runs/38045180434) and [reviewed-data run #389](https://github.com/Suuu-sh/ReysonAI/actions/runs/38045180450) stopped at the same stale Stage 2 source identity guard before their downstream checks.

## Renewal boundary

Only the exact workflow source record and derived receipt content hashes should change. Preserve Stage 2's 1,888 artifact records, 1,747,857-byte archive and SHA-256 `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`, counts (3115/1611/1504/272259), continuation fingerprint `b3538b0c44f04016e57d6eb76802665cf405d65f87e856b9860ed8a479065e53), and all existing review history. Preserve Stage 3's 1,805 artifact records, 2,436,451-byte archive and SHA-256 `930d88207c2aa31430eb28570f7d90e064bb3680c40203d5e860bfe9289eac7b`, counts (16132/1801/5621/8710/304369), fingerprint `a3b44b0e1fdf14e306d33335cdfa93196e214342a3500bd7883745da1cf522d6`, and all existing review history.

This narrow review does not approve production settings changes, deployment, route migration, merge, Worker deletion, or new strategy/data generation. Re-run exact-head CI after the source-only receipt renewal.
