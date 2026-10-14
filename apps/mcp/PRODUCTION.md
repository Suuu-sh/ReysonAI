# Production handoff (not deployed)

**Status:** prepared only. This file does not create resources, migrate D1, register OAuth clients, change Cloudflare routes, or deploy a Worker. `MCP_ENABLED` remains `false`; access stays `authenticated_free`.

## Configuration and observed Cloudflare state

`wrangler.production.jsonc` is the disabled production configuration. Its `OAUTH_KV` ID is the deliberately invalid sentinel `__REQUIRED_PRODUCTION_KV_NAMESPACE_ID__`. The production config is not deployable until an approved dedicated namespace is created and its actual ID replaces that sentinel. The sentinel is not a Cloudflare ID. No secret or OAuth client credential belongs in this file.

The existing production API config is `apps/backend/wrangler.jsonc`: it binds D1 `reysonai` and declares `api.reysonai.com` as a Custom Domain. A read-only Cloudflare check on 2026-10-08 confirmed the active `reysonai.com` zone, the `api.reysonai.com` Custom Domain attached to `reysonai-api` in `production`, no existing Worker Route matching that hostname, and no deployed Worker named `reysonai-mcp`. It also confirmed D1 `reysonai` ID `5f3bd3a1-21c2-4367-9345-011990574b9d`, matching the repository config. A read-only query found none of the three MCP authorization tables in that D1; no migration has been applied. No KV namespace named for MCP/OAuth exists in the connected account.

Cloudflare documents that a Worker Route can run before a Custom Domain and that the Custom Domain Worker receives the request when no earlier route handles it. The scoped path routes below therefore preserve the existing API Custom Domain for every unmatched path. They must not be widened to `api.reysonai.com/*`.

| Exact Worker Route | Destination | Existing API behavior |
| --- | --- | --- |
| `api.reysonai.com/mcp` | `reysonai-mcp` | Only the MCP Streamable HTTP endpoint moves to MCP. |
| `api.reysonai.com/oauth/mcp/*` | `reysonai-mcp` | Only the MCP OAuth namespace moves to MCP. |
| `api.reysonai.com/.well-known/oauth-authorization-server` | `reysonai-mcp` | Only the MCP authorization-server metadata path moves to MCP. |
| `api.reysonai.com/.well-known/oauth-protected-resource/mcp` | `reysonai-mcp` | Only MCP protected-resource metadata moves to MCP. |

`/v1/*`, `/health`, and all other paths have no MCP route and remain on `reysonai-api`. The route table is currently empty for this host, so the four patterns do not collide with an existing Worker Route. Adding them is still a Cloudflare routing change and requires approval from the zone/account owner. The API Custom Domain must remain attached to `reysonai-api`.

The production `DB` binding reuses the existing `reysonai` database above, which is where the current account session and range data live. The reviewed MCP schema extension is `migrations/0001_mcp_revocations.sql`; it creates only `mcp_revocations`, `mcp_code_redemptions`, and `mcp_refresh_redemptions`. It has not been applied. Do not apply it without explicit data-owner approval and a recoverable pre-change snapshot.

The intended OAuth namespace is a new dedicated KV namespace named `reysonai-mcp-oauth`, bound as `OAUTH_KV`. Its production ID is unknown because the namespace does not exist yet; do not reuse an unrelated namespace or infer an ID.

## OAuth client callback values

No ChatGPT or Claude OAuth client has been registered, and no callback URL has been confirmed. For each client, obtain the exact callback URI from that specific connector's own OAuth client setup UI and register that exact value through the approved administrative `OAuthHelpers.createClient()` process. Do not use a guessed callback, copy another connector's callback, expose client secrets in chat/CLI history/Git, or add callbacks to Worker variables. Client IDs, confidential secrets, and grants are not created by this handoff.

## Required approvals and prerequisites

1. Complete the separate independent security validation and record its approval. Its final test is currently stopped by a platform restriction; this handoff is not a replacement, and that test must not be rerun through another route. Ordinary local checks do not satisfy this gate.
2. Obtain the repository maintainer's review and merge approval for PR125 into `development`. Keep the PR Draft until the independent review and documented gates are satisfied; do not promote to `main` as part of this handoff.
3. Obtain Cloudflare account/zone-owner approval to create the `reysonai-mcp-oauth` KV namespace and bind its returned ID to `OAUTH_KV`.
4. Obtain data-owner approval for the exact three-table extension on D1 `reysonai` (`5f3bd3a1-21c2-4367-9345-011990574b9d`) and take a recoverable snapshot before applying it.
5. Obtain Cloudflare routing approval for the four exact patterns in `wrangler.production.jsonc`, retaining the API Custom Domain and not routing `/v1/*` or `/health` to MCP.
6. Assign a staging API/app origin with a matching host-only login cookie, plus isolated staging D1 and KV resources. Use separate test accounts; never point staging at the production D1 or OAuth namespace.
7. Have the OAuth administrator obtain and verify each intended connector's callback URI, then register only the approved client methods, redirect URI, scopes, and credentials using a secure administrative handoff. Do not create user grants until an account signs in and explicitly consents.
8. Obtain a final product/security approval to enable the endpoint. Preserve login-required access and the current free `authenticated_free` policy. Any pricing or anonymous-access change needs a separate reviewed decision.

## Gated deployment sequence (not executed)

Run these steps only after their listed approvals. This change intentionally leaves the production config disabled and the KV ID sentinel unresolved.

1. Provision the approved dedicated KV namespace and update only the sentinel in `wrangler.production.jsonc` with its returned production ID. Keep secrets out of Git. Review the final diff and confirm `MCP_ENABLED` is still `false` and `MCP_ACCESS_MODE` is still `authenticated_free`.
2. In staging, bind only staging resources and matching staging origins; apply the same reviewed SQL extension to staging D1, then run the documented auth, consent, PKCE, scope, refresh, revoke, metadata, unsupported-spot, and existing-API checks with synthetic accounts. The production D1 migration is not part of `wrangler deploy`.
3. After security and route-owner approval, apply `migrations/0001_mcp_revocations.sql` once to the existing production D1 target. One explicit command from `apps/backend/` is:

   ```sh
   npx wrangler d1 execute reysonai --remote --file=../mcp/migrations/0001_mcp_revocations.sql --config=wrangler.jsonc
   ```

   Verify the three `mcp_*` tables using read-only SQL. Do not run this command as part of this preparation task.
4. After all gates and staging sign-off, deploy the Worker/config from `apps/mcp/` with `MCP_ENABLED=false`:

   ```sh
   npx wrangler deploy --config=wrangler.production.jsonc
   ```

   This command is a production operation: the four configured routes are attached by the deployment. Before running it, confirm the zone still has the same API Custom Domain and no conflicting routes. Verify the MCP paths reach `reysonai-mcp`, while `/v1/*` and `/health` still reach `reysonai-api`.
5. Register the approved connector clients using their UI-confirmed callback values and secure secret handoff. Validate with separate authorized staging/test accounts first; never use an admin or production account for staging.
6. Enable production only with a separate recorded approval by setting `MCP_ENABLED=true` for `reysonai-mcp` through the approved Cloudflare release procedure. Do not commit `true` to this config. Confirm login, consent, bearer audience/scope enforcement, free access, existing API health, and privacy-safe telemetry before announcing availability.

## Rollback

1. For an MCP application or security issue, immediately set `MCP_ENABLED=false` and publish that disabled Worker configuration. Keep the four routes in place while confirming the Worker fails closed; `/v1/*`, `/health`, and other API paths continue to the existing API Custom Domain.
2. If the route itself must be removed, first disable MCP, then remove only the four exact MCP Worker Routes (or deploy a reviewed config with only those route entries removed). Confirm `api.reysonai.com` still has its `reysonai-api` Custom Domain and verify `/v1/*` and `/health`. Do not delete or replace the Custom Domain.
3. Preserve the D1 tables, KV namespace, and all revocation/code/refresh tombstones. Do not drop the migration or delete the namespace as a rollback: the durable revocation state must survive a disabled service. Keep the disabled config and prior Worker version identifiers in the restricted release record; do not use an unreviewed rollback that could reactivate `MCP_ENABLED`.
4. For suspected credential exposure, disable the endpoint and have the OAuth administrator rotate/revoke only the affected client/grants through the approved secure process. Keep the endpoint disabled pending a new independent security review and explicit reactivation approval.

## Local verification boundary

`npm run typecheck` checks the source types, and `npm run build:check` dry-runs only `wrangler.test.jsonc` with dummy IDs and `MCP_ENABLED=false`. A static configuration check should assert the production route list and fail-closed variables while confirming the KV sentinel remains unresolved. Do not deploy, run remote D1 commands, create KV resources, or modify Cloudflare routes during local verification.
