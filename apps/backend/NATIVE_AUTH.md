# Native Google account bridge

Status: implementation for review, disabled by default (`AUTH_NATIVE_ENABLED=false`). No live migration, deployment, Google account sign-in, new OAuth client/scope, or secret copy is performed by this change. The existing confidential Google Web client, `openid email` scopes and exact HTTPS callback remain unchanged.

## Contract

Native JSON endpoints are under `https://api.reysonai.com/v1/account/native/`. Native fetches use `credentials: 'omit'`; never send Cookie or Origin. Native endpoints do not return CORS permission. An Origin header is never accepted as native proof. All timestamps are integer Unix seconds.

| Method / path | Request | Response |
|---|---|---|
| GET config | None | `{enabled,redirectId:'reysonai-mobile',redirectUri:'reysonai://auth/callback'}` |
| POST start | `{codeChallenge,state,redirectId:'reysonai-mobile'}` | `{url,attemptId,expiresAt}` |
| GET authorize | Open exactly the returned `url` in the system auth browser | Separate native OAuth cookie, then Google redirect |
| POST exchange | `{code,codeVerifier,state,redirectId:'reysonai-mobile'}` | `{token,expiresAt,user:{id,email,verified:true}}` |
| POST cancel | `{attemptId,codeVerifier,state,redirectId:'reysonai-mobile'}` | `{ok:true}`; idempotent, including after exchange |
| GET session | `Authorization: Bearer <token>` | `{user:{id,email,verified:true},expiresAt}` |
| GET data | Same Bearer | `{data,version}` |
| POST data | Same Bearer and `{data,version,importLocal?,consent?}` | `{ok:true,version}` |
| POST logout | Same Bearer and `{}` | `{ok:true}` |

`attemptId` and one-use `code` are 64 lowercase hexadecimal characters. Session token is `rn1_` plus 64 lowercase hexadecimal characters. App state is 43–128 base64url characters. PKCE verifier is 43–128 RFC7636 unreserved characters; the S256 challenge is 43 base64url characters. The app must generate independent random 32-byte verifier and state values. No plain-PKCE mode exists.

Attempts expire after 600 seconds. Application codes expire after 60 seconds and cannot outlive their attempt. Native sessions expire after seven days with no refresh. Expired or revoked sessions return 401 `sign_in_required`. Exchange failures return 400 `invalid_grant` without distinguishing missing/expired/replayed/wrong-proof codes. Data conflict returns 409 `data_conflict`. Local import requires explicit consent, and the existing Web account allowlist excludes ranked data.

The fixed callback is `reysonai://auth/callback?code=<one-use-code>&state=<app-state>`. A provider denial/failure after validated browser state returns only `error=google&state=<app-state>`. Untrusted/expired/replayed browser state returns a generic JSON error instead of reflecting a redirect. The app must validate scheme, host, path, singular state/code parameters and the active attempt before exchange. A killed app discards its in-memory verifier and starts again.

## Security boundaries

- `account.ts` remains byte-identical. Browser cookies, Origin/CSRF checks and Web data semantics are unchanged.
- A separate native OAuth state cookie (`__Host-reysonai-native-oauth`) prevents native login from replacing Web OAuth or session cookies.
- App challenge/state/fixed redirect ID are stored before opening the browser, bound to the server-generated Google state, and cannot be replaced during callback or exchange.
- Native callback state is atomically deleted before provider exchange. The same strict Google signature/issuer/audience/authorized-party/expiry/iat/nonce/verified-email validator runs. Identity remains Google's `sub`, never email.
- Exchange atomically claims the code and creates the typed, hashed session in a D1 transaction. Racing exchange has only one winner. Failed insert rolls back the claim.
- Cancel atomically invalidates the attempt, deletes pending OAuth state and revokes a native session from a racing exchange. Clients must also ignore late callbacks and best-effort revoke any late received token. Logout affects only the presented native session.
- Native bearer credentials never authenticate Web cookie endpoints, and Web cookies or tokens never authenticate native endpoints. No Google token or reusable application token enters a redirect URL.
- JSON bodies are stream-bounded at 4 KB, except account snapshots at 500 KB. Per-route HMAC-IP limits apply to all native operations (30 per 15 minutes for auth, 300 for session/data/logout). Raw IPs are not stored.
- Callback/authorize responses are `no-store`, `no-referrer`, have a restrictive CSP, and contain no external page resources. Application code contains no credential/URL logging. HTTP access-log and crash/analytics collectors outside this source must exclude full authorization/callback URLs, query strings, response Location, authorization/cookies and request/response bodies before enablement. Never turn on raw auth debugging.
- The native flow requires HTTPS even for development. Local HTTP Web login remains unchanged. Configure an isolated HTTPS test environment through a separately reviewed process when needed; do not copy production secrets.

## Additive D1 migration and operations still pending

1. Review this implementation and the native app together. Check the exact native callback registration, system-browser cancellation and SecureStore behavior on iOS and Android. Custom schemes can be intercepted by other installed apps; S256 prevents a code interceptor from exchanging a legitimate app's code. Verified universal/app links are a future hardening option requiring separately reviewed domain association.
2. Confirm migration 0007 is already present and obtain the normal database recovery reference. Apply only reviewed `migrations/0008_native_accounts.sql` to the intended D1 binding after deployment approval. It adds three native tables/indexes and does not alter browser tables or existing data. Do not use an unscoped migration/publishing command that also applies unrelated pending migrations or strategy data.
3. Deploy the reviewed Worker with the feature flag false first. Verify Web account behavior remains intact. No Google configuration or secret change is required by this bridge.
4. Confirm edge/access logs, analytics, crash breadcrumbs and mobile deep-link routing redact authorization/callback URLs and tokens. This repository cannot prove external logging configuration.
5. Only after an independent security review and approved device/account validation, explicitly enable `AUTH_NATIVE_ENABLED=true` in the intended environment. Do not include real-user data writes in a smoke test without approval.
6. Rollback can disable the native flag without changing browser cookies or deleting account data. Existing native sessions remain stored until expiry unless explicitly revoked, but are rejected while the flag is off. Keep the additive schema on rollback.

Not covered: account deletion/retention policy, authoritative ranked scoring, silent token refresh, new Google clients/grants, store release or production enablement.

## Verification

From `apps/backend`: `npm run check`, `npm run test:account`, `npm run test:account-local`, `npm run test:account-native`. Authentication tests use an in-memory SQLite database, controlled clock, ephemeral signing keys and mocked Google HTTP only. They cover exact expiry, replay, wrong challenge/state/redirect, concurrent exchange, transaction rollback, provider rejection, cancellation, same-email/different-sub isolation, shared Web snapshots, conflict/import rules, logout and transport separation. The dedicated PR workflow runs these checks with no live secrets or deploy step.

References: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch, https://developers.google.com/identity/openid-connect/openid-connect, https://www.rfc-editor.org/rfc/rfc8252, https://www.rfc-editor.org/rfc/rfc9700.html.
