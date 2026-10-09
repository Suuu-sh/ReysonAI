# ReysonAI authenticated MCP (development MVP)

**Draft review status:** Final independent security validation is incomplete because its final recheck was stopped by an execution restriction. The completed local test results below are author-run verification, not final independent security approval. Do not merge, enable the endpoint, create live OAuth grants, or deploy this draft until that validation and the activation gates are complete.

This package is **not deployed**. It implements a read-only remote MCP endpoint that requires a ReysonAI account and explicit per-client consent. Authenticated access is currently free. There is no payment/subscription integration, paid-status bypass, pricing decision, or anonymous mode.

## Tools and data boundaries

- `list_range_coverage`: lists the actual published D1 dataset hashes and supported exact spot IDs. A dataset being published does not mean this adapter supports it.
- `get_saved_range`: reads an exact stored spot, or one canonical hand and its saved explanation. Seven opening/HU/limp dataset families are supported (70 spots in the checked-in source fixture). Multiway/squeeze/cold/continuation families are catalog-only until their dedicated authorization-independent data adapters are reviewed. Unreachable placeholders and missing spots do not become substitute recommendations.
- `list_postflop_coverage`: reads the published postflop release index and actual D1 spot, policy, and saved flop-base rows. It can list released spots, canonical flop-board keys present for one spot, and exact action histories present in one stored flop base. A published turn/river policy is reported separately; it is not an exact saved turn/river range.
- `get_saved_postflop_range`: reads one exact saved flop base for a published spot, board, and stored action history. Full-range output contains the 169 hand classes; a canonical `hand` argument includes only that hand's reached combo rows. Action frequencies are aggregated from the stored combo mixes with the stored reach weights. Missing bases/histories, and hands with no saved reach, return unavailable status without on-demand policy evaluation or substitution.
- `get_my_learning_history`: available only with the additional history scope. Returns the token owner's bounded synced learning facts. It cannot accept a user ID, read another account, access unsynced browser data, expose profiles/custom names/raw snapshots, change learning data, rank players, solve games or make payments.

The data are saved AI estimates for education, not verified GTO, live-game advice, a poker-strength assessment or a profit guarantee. Postflop reads use the same published D1 spot/policy release and canonical Brotli flop bases as the public `/v1/postflop/*` read routes. The adapter verifies the postflop policy-index hash, saved policy hashes, release-to-D1 spot geometry and board counts, each compressed flop-base hash, base format version, action history, and response bounds. It does not evaluate saved policies, run a solver, or access an unpublished stage. Turn/river policy presence is disclosed, while exact turn/river range output remains unavailable because those ranges are not materialized in the published storage format. No old two-spot SDK, solver job route or unpublished strategy is exposed.

## Architecture

The package is deliberately separate from `apps/backend`. Its lockfile, test-only Wrangler config and CI do not edit or deploy the existing API Worker. The disabled production template and exact route ownership, deployment, approval, and rollback plan are documented in [PRODUCTION.md](./PRODUCTION.md). Only `/mcp`, `/oauth/mcp/*`, `/.well-known/oauth-authorization-server`, and `/.well-known/oauth-protected-resource/mcp` are assigned to MCP; `/v1/*`, `/health`, and every other path stay on the existing API Worker.

The runtime composes the official `@cloudflare/workers-oauth-provider` authorization and resource roles, plus `createMcpHandler` from `agents/mcp/server` and `@modelcontextprotocol/server` v2. The server is stateless per request and supports ordinary legacy Streamable HTTP clients without protocol sessions. Dependencies are pinned to the Agents release's exact SDK peer requirement, not an incompatible newer server SDK.

The existing account cookie is `__Host-reysonai` with `Path=/; HttpOnly; Secure; SameSite=Lax`, no Domain. This lets a top-level HTTPS consent page on the exact API origin read the existing D1 session. The web cookie is accepted **only for consent/connection management**, never as an MCP credential. Google tokens, native refresh/access tokens and browser session tokens are never passed through to MCP or stored in OAuth props. Props contain only the account ID, grant ID and refresh revision; each MCP request checks that account still exists.

Signed-out users open the existing ReysonAI sign-in page in another tab, sign in there, then return/reload the consent page. This MVP does not change the current Google callback or add an unreviewed return-to redirect. Real-browser verification of this flow remains an activation gate.

## Authorization contract

- Canonical issuer is the explicitly configured HTTPS `MCP_ORIGIN`; resource/audience is exactly `${MCP_ORIGIN}/mcp`.
- Every MCP request needs an independently issued, unexpired bearer token. Cookie-only, Google/native/web tokens and invalid audience fail closed. No shared response cache or token/history logging is used.
- Authorization-code flow requires S256 PKCE even for confidential clients. Exact registered redirect URIs are validated by the provider. After provider validation and before issuance, a primary-D1 atomic single-use claim keyed only by account/grant IDs prevents concurrent or stale-KV code redemption. Replays revoke the entire grant. A failed issuance after claiming requires a new authorization; it never reuses a consumed code.
- Scopes: `reysonai:ranges:read` (baseline), `reysonai:history:read` (optional own history), `offline_access` (optional discovery scope for continuing access). The consent page names the client, callback hostname and data categories. It always explains the connection's maximum 30-day authorization; no silent consent is remembered.
- Provider consent transactions bind the form to the browser. An additional HMAC proof binds it to the exact account session and presented scope set, preventing account-switch and scope-expansion form reuse. HTML is escaped; framing, scripts, external resources, referrers and caching are disabled.
- Each tool rechecks scope, expiry, account existence and the entitlement adapter. Unknown entitlement configuration denies access. `MCP_ACCESS_MODE=authenticated_free` is the explicit current policy; any future paid adapter needs a separately reviewed implementation.
- Tokens live for 5 minutes; only explicitly approved `offline_access` receives a refresh token with a fixed 30-day maximum. Omitting or unchecking it produces no refresh token. The provider rotates refresh tokens and implements RFC 7009 revocation at the token endpoint. Each validated refresh atomically compares/increments the authoritative D1 revision in encrypted grant props; stale KV cannot restore an older refresh generation. A detected generation replay revokes the grant family. Concurrent retries that race may require reconnecting rather than retaining a potentially replayed grant. Refresh tokens are strictly single-use: a post-validation primary-D1 SHA-256 claim overrides the provider's unlimited previous-token recovery. Reusing a consumed refresh token revokes the grant family, including an older token rejected by the provider after client authentication. A lost refresh response requires a new login/consent connection; automatic retry must not reuse the consumed token. `/oauth/mcp/connections` lets the logged-in user revoke only their own grants with a same-origin session-bound form.
- OAuth payloads are held in KV, which is eventually consistent. All provider grant-deletion paths (web revoke, RFC 7009 disconnect, reauthorization replacement and authorization-code replay) first create a durable D1 revocation tombstone. Individual access-token revocations also have token-hash-specific tombstones, while leaving the separately authorized refresh grant intact. Every provider token/grant read and each tool call checks the primary D1 tombstone; delayed KV refresh writes cannot restore access. Tombstones survive account deletion. New requests fail closed if D1 is unavailable; a tool already executing when revocation commits may finish. This storage seam depends on the pinned provider key format and is regression-tested. Never expire tombstones before all associated token/grant lifetimes have elapsed.
- Signing out of the website does not revoke an independently authorized MCP connection. The connection page makes that distinction explicit.
- Request bodies, tool schemas, data sizes, SQL projections and pagination are bounded. Invalid origins are rejected by exact scheme/host/port, not just by CORS.

## Client compatibility and setup (not executed)

Both current OpenAI and Claude documentation support predefined OAuth clients:

- [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth) documents predefined clients, PKCE, resource discovery, and token endpoint methods. Use the custom/user-defined OAuth client settings exposed by the intended ChatGPT surface and copy its **exact callback URI from that connection's management UI**.
- [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) offers **Use your own OAuth client**; [connector management](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities) documents client ID/secret fields.

This MVP intentionally does not expose public DCR, enable CIMD, fetch arbitrary client metadata/JWKS URLs, or auto-provision clients. An administrator must create a distinct narrowly scoped client in the dedicated OAuth namespace with the verified callback URI, `authorization_code` and `refresh_token`, `response_types=[code]`, and the intended supported token authentication method. Use the provider's `OAuthHelpers.createClient()` through an approved administrative environment. There is **no public client-creation route**. The test-only entry is never a deployment entry.

Credential generation, storage and client-secret entry require their appropriate action-time confirmation/secure handoff. Do not paste secrets into commits, chat, shell history or this document. Public `none` clients still require PKCE; confidential clients use `client_secret_basic` or `client_secret_post` as selected in the actual client UI. No client credentials have been created here. A live ChatGPT/Claude connection has not been tested.

## Activation gates

Before calling this usable or live, obtain the required approvals and verify all of the following:

1. Review and merge the single development PR; do not auto-merge or promote to main.
2. Keep the canonical API origin at `https://api.reysonai.com` and verify same-origin route ownership, account cookie behavior, CORS, existing account availability and the selected data D1 binding. Do not replace the existing API Custom Domain or route unrelated API paths to MCP.
3. Explicitly approve/create the dedicated OAuth KV resource, bindings, route/security configuration and any persistent client credentials. Apply the reviewed `migrations/0001_mcp_revocations.sql` extension to the selected account D1 only after the documented approval and snapshot. The committed `wrangler.test.jsonc` contains dummy test IDs and `MCP_ENABLED=false`; it is only for dry-run checks. `wrangler.production.jsonc` is a disabled template with an intentionally invalid KV ID sentinel until the approved namespace exists. Follow [PRODUCTION.md](./PRODUCTION.md); no resource, migration, OAuth client or route has been created by this PR.
4. Register the intended client's exact callbacks through the official provider helper after approval. Complete secure client configuration in the target client, and then user login + consent. Do not substitute a static bearer token for OAuth.
5. Review edge abuse/rate limiting and OAuth KV consistency/availability for the intended traffic and revocation expectations. Do not enable request-body/header logging for these routes. Use sanitized aggregate telemetry only.
6. Run staging integration with separate test accounts: signed-out, consent cancel/replay/switch, PKCE mismatch, audience/expiry/scope mismatch, explicit own-history consent, no cross-account content, refresh/revoke, actual metadata/tool scan, unsupported spot, and existing API smoke tests. Only then request production activation approval.

## Local verification

```sh
cd apps/mcp
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build:check
```

The runtime test bundles a **test-only** entry into `.local/tests` and runs the real pinned OAuth provider and MCP SDK inside local workerd, with in-memory D1/KV and synthetic identities/sessions/clients. All fixture requests use manual redirects, and outbound HTTP is blocked in that fixture and no production credential is used. Unit tests also cover all seven actual saved range families. The test harness uses Miniflare's exported v4-options conversion bridge shipped with the pinned Wrangler runtime.

`npm run build:check` is only `wrangler deploy --dry-run` against the disabled dummy config. It creates no Worker, route, database, OAuth namespace or grant. For restricted shells, point `XDG_CONFIG_HOME` and `WRANGLER_LOG_PATH` at writable temporary directories before this local command.

## Official implementation references

- [Cloudflare MCP handler API](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/)
- [Cloudflare OAuth provider](https://github.com/cloudflare/workers-oauth-provider)
- [Authorization server API](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/authorization-server.md)
- [Consent page](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/consent-page.md)

These docs were checked on 2026-10-07. Package types and actual runtime tests are the implementation reference for the pinned versions.

### Verification at the initial checkpoint

- 30 MCP tests pass, including real workerd OAuth and both 2025/2026 MCP protocol lanes.
- 16 existing account/local/native/data tests pass unchanged.
- TypeScript strict typecheck and disabled-config Wrangler dry-run pass.
- Security source review identified and corrected missing offline-access gating and KV-only revocation races; targeted regression tests cover both. A second independent review found stale-KV authorization-code replay; an authoritative single-use claim and concurrent/stale-snapshot tests now cover it. The same review found stale-KV refresh generation rollback; D1 refresh CAS and regression coverage address that boundary too.
- These are local/staging-fixture results, not live Google login, distributed Cloudflare deployment or ChatGPT/Claude UI validation.

The server SDK remains at the Agents-compatible 2.0.0. The unused mandatory OAuth-client peers are pinned via overrides to client 2.2.0 and legacy SDK 1.31.0, the official fixes for [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h). The advisory excludes MCP servers, but the patched peers avoid leaving known affected client packages in this package's lockfile. Full typecheck, both protocol lanes, Worker bundling and production-dependency audit are rerun with these overrides. Do not add outbound OAuth client functionality without a separate review.
