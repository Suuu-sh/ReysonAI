# MCP integration in `reysonai-api`

**Status:** development draft only. This proposal changes code and tests; it does not change production bindings, variables, compatibility settings, Worker Routes, database schema/data, KV contents, credentials, or Worker deployments. It does not delete `reysonai-mcp`.

## Read-only baseline and recovery record

Snapshot checked 2026-10-10 UTC. The production code paths reviewed are on main `f8282b48a5db08265431071b8c1792046f161d89` (PR #168) and development `a9ee6d735f8174cc55dc135975fa220e94604758`. The API/MCP source paths this change composes are identical on those refs. This PR targets development only and does not include the separate main/development synchronization work.

The deployment/version values below are a historical read-only snapshot, not a cutover rollback target. Immediately before any later production operation, recapture the sanitized settings and routes from the then-current 100% active API version and verify the dedicated MCP Worker is still available. Use that latest active API version as the rollback point; never rely on this earlier version ID.

The following metadata was read without requesting or recording any secret values:

| Resource | Current safe state |
| --- | --- |
| Zone | `reysonai.com`, active, Free Website plan |
| API Worker | `reysonai-api`; compatibility date `2026-09-22`; usage model `standard`; latest deployment `03b7ada9-aef5-40f6-b539-32315d751707`; version `03e29332-efe4-4f36-a353-17c7c63b94ab` at 100% |
| Dedicated MCP Worker | `reysonai-mcp`; compatibility date `2026-10-07`; `nodejs_compat`; usage model `standard`; latest deployment `b279a8a3-cdc4-4f0b-81b4-e5767aa7fb67`; version `f1ea9ee8-61e5-40c6-a8c6-60212d303168` at 100% |
| API bindings | `DB` (D1), `SOLUTIONS` (R2), `FASTFOLD_RUNTIME` (Durable Object), plus existing plain-text and secret binding names |
| MCP bindings | `DB` (same configured D1), `OAUTH_KV` (the existing OAuth namespace), and existing MCP/auth plain-text variables |
| Current MCP routes | `api.reysonai.com/mcp`, `api.reysonai.com/oauth/mcp/*`, `api.reysonai.com/.well-known/oauth-authorization-server`, and `api.reysonai.com/.well-known/oauth-protected-resource/mcp` all target `reysonai-mcp` |
| Safe MCP policy variables | `MCP_ENABLED=true`, `MCP_ACCESS_MODE=authenticated_free`, `MCP_ORIGIN=https://api.reysonai.com`, `MCP_ALLOWED_ORIGINS=https://app.reysonai.com`; the existing `AUTH_ENABLED` and `AUTH_APP_URL` are enabled and point to the app origin |

Secret binding values, OAuth client credentials, cookie contents, KV records, D1 rows, and user history were not read or recorded. The API's existing account/session D1 remains the MCP identity source; the existing MCP OAuth KV and the `mcp_*` revocation state must be reused intact.

## Code integration boundary

The Cloudflare-only `apps/backend/src/worker.ts` entry dispatches only `/mcp`, `/oauth/mcp` and its descendants, and the MCP OAuth metadata paths to the existing stateless MCP handler before calling `apps/backend/src/index.ts`. This happens before the API's generic `OPTIONS`, CORS, and routing logic, allowing MCP to keep its origin/host validation, no-store responses, OAuth issuer and protected-resource metadata. Existing `/health`, `/v1/*`, the API Custom Domain, and the `FastFoldRuntime` export remain on the existing API code path. Node-only route tests continue importing `index.ts` directly and do not load Cloudflare runtime modules.

The integration reuses the MCP handler, OAuth provider, D1 binding, and KV namespace; it adds no OAuth scope, identity provider, client registration endpoint, strategy generator, database migration, or stored data. The isolated OAuth runtime test exercises this composition with the API Worker's current compatibility date and no compatibility flags. A missing MCP setting or binding fails closed as `mcp_not_configured`.

## Proposed settings for a later approved migration

No active Wrangler configuration is changed by this draft. Before the route cutover, prepare and independently review these settings on the existing API Worker:

**Durable configuration source:** after separate operation-time approval, record `OAUTH_KV` and the non-secret MCP variables in the tracked `apps/backend/wrangler.jsonc`, using the exact existing namespace and approved values. The normal deployment already uses `wrangler deploy --config wrangler.jsonc`; this tracked config must remain the source of truth for every later deployment. Dashboard-only bindings or vars can be lost or reset by a later config-based deploy, so do not use the Dashboard as the sole configuration record. Keep secret values in Cloudflare Worker Secrets, managed separately from source and configuration; never copy them into this repository. No binding, variable, or secret is changed by this draft.

- Retain its existing `DB`, `AUTH_ENABLED`, and `AUTH_APP_URL` bindings/values. Do not replace the D1 binding or API Custom Domain.
- Add `OAUTH_KV` using the exact namespace already bound to `reysonai-mcp`. After explicit operation-time approval, record its non-secret namespace ID in tracked `apps/backend/wrangler.jsonc` as the durable binding configuration. Keep credentials, secret values, and KV contents out of source.
- Add `MCP_ENABLED=true`, `MCP_ACCESS_MODE=authenticated_free`, `MCP_ORIGIN=https://api.reysonai.com`, and `MCP_ALLOWED_ORIGINS=https://app.reysonai.com`. Keep authenticated access free and retain existing client registrations/grants.
- Review compatibility before any API deployment. The current API uses `2026-09-22` with no compatibility flags; the standalone MCP uses `2026-10-07` and `nodejs_compat`. Validate the combined Worker in an isolated staging environment, then request explicit operation-time approval for any required compatibility update. Do not silently change the live API setting.
- Keep the zone on its current Free plan. Do not create a new KV namespace, change OAuth scope, create credentials, migrate D1, or modify authentication/security policy as part of this code draft.

## Staged cutover and rollback

1. Immediately before the approved cutover, refresh the sanitized rollback snapshot from the latest production state: active API version and traffic percentage, binding names/types, non-secret settings, all four MCP route records, and the dedicated MCP Worker version/settings. Do not record secret values or OAuth/KV contents. Keep the dedicated Worker available.
2. Merge/release this code only after the independent review. Keep the current four Worker Routes pointing to `reysonai-mcp` while the API configuration is prepared and tested in isolation.
3. With a separate operation-time approval, add the existing OAuth KV binding and approved non-secret MCP variables to `apps/backend/wrangler.jsonc`, then deploy with that tracked config. Keep `MCP_ENABLED` fail-closed until the composed API has passed staging OAuth, account-session, MCP tool, and ordinary API tests.
4. After the API is ready, remove only the four route records above. The unchanged `api.reysonai.com` Custom Domain on `reysonai-api` then receives those paths. Do not add a broad `api.reysonai.com/*` route or alter `/v1/*`, `/health`, or `FastFoldRuntime`.
5. Verify OAuth discovery, consent, token exchange/refresh/revocation, authenticated MCP tools, API health, account/session, postflop/preflop reads, ranked, and FastFold on the same external URL. Keep the old Worker and its deployment available through the rollback window and until these checks pass.
6. Roll back by restoring the four route records to `reysonai-mcp`; do not delete or rewrite D1/KV data. Roll back to the API version captured in the just-in-time snapshot, not the historical version listed above. Deleting `reysonai-mcp` is a separate final operation and must wait until route, OAuth, and API verification are complete, the rollback window has passed, and explicit deletion approval is obtained.

This PR performs none of the production cutover, route changes, configuration changes, or deletion steps above.
