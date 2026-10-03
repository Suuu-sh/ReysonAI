# Google-only accounts (2026-10-04)

Google OAuth client and encrypted Worker secrets are configured; migration0007
has been applied. The API and frontend were deployed with `AUTH_ENABLED=true`.
Live Google consent → callback → signed-in account display succeeded on2026-10-04.
No real-user preference/history writes were made during that validation. No passwords, Resend, Supabase,
or Google refresh/access tokens are stored. Google Workspace/custom-domain Google
accounts are supported: no `hd` or Gmail-domain restriction. Account ownership is
Google's stable `sub`, **never email**; matching emails do not merge accounts.

## Required configuration

`migrations/0007_accounts.sql` has been applied to the API D1 binding `DB`.
It replaced the earlier **unapplied** password-auth draft before application; never
use the rewritten draft to alter an existing password schema. Google Cloud Web application OAuth client:

- Authorized JavaScript origin: `https://reysonai.com`.
- Exact authorized redirect URI:
  `https://api.reysonai.com/v1/account/google/callback`.
- Consent screen supports external Google accounts, scopes `openid email` only.
  Google console currently remains Testing (branding publication is pending).
  The basic-identity-only `openid email` scope exception permits any Google user
  without a test-user allowlist; do not describe the branding as fully published.
  Reassess test-user restrictions if any non-basic scope is added.

Worker secrets only (never tracked/front-end variables or logs):

- `GOOGLE_CLIENT_SECRET`: web application's client secret.
- `AUTH_RATE_LIMIT_KEY`: independent random secret, at least32 bytes of entropy.

Non-secret Worker vars:

- `GOOGLE_CLIENT_ID`: same web application OAuth client's ID.
- `GOOGLE_REDIRECT_URI`: exact callback URL above.
- `AUTH_APP_URL`: `https://reysonai.com`.
- `ALLOWED_ORIGIN`: exact approved frontend origins, comma separated; no wildcard.
- `AUTH_ENABLED`: `true` for configured live validation; `false` disables accounts.

Frontend `VITE_API_BASE` points to `https://api.reysonai.com`.

## Browser contract

All endpoints use `/v1/account/`. POST requires exact allowed Origin and JSON;
fetches include credentials. POST `google/start` `{}` returns `{url}` and an
HttpOnly OAuth-state cookie; navigate to that URL. Do not initiate login using a
GET link. Google redirects to GET `google/callback`, which consumes a ten-minute
single-use state tied to that browser cookie and exchanges the code server-side
with PKCE. Success redirects to `/app#account-signed-in`; Google denial/invalid
state or identity redirects to `/app#account-error=google`. ID-token RSA signature,
Google issuer, exact audience/authorized party, expiry/issuance time, verified
email and nonce are checked against Google's fixed JWKS endpoint. There is no
client-supplied-token login endpoint. OAuth code and token bodies must not be logged.

GET `session` -> `{user:null}` or `{user:{id,email,verified:true}}`.
POST `logout` `{}` revokes the session and clears cookies. Session cookies are
host-only Secure/HttpOnly/SameSite=Lax, expire in seven days; only their hashes are
stored. State nonce/state hashes are stored; the temporary PKCE verifier stays
server-side and is deleted upon callback/expiry. Expired sessions/state/rate buckets
are cleaned during mutations and callbacks.

GET `data` -> `{data,version}`; POST
`{data,version,importLocal?:true,consent?:true}` -> `{ok:true,version}`.
Stale versions return409, local import without explicit consent400. Snapshots are
bounded at500KB and allow exactly profile, locale/appearance/display-mode, and
history/drills/drafts/review-sessions trainer keys. Identity always comes from the
session. Stored practice records are untrusted learning data, not certified scores.

**Ranked is not synchronized.** Rank keys are rejected. Server-issued challenges,
server scoring/replay protection and an authoritative ranked ledger remain absent;
do not publicly enable ranked or trust client ratings using snapshot storage.

## Verification

`npm run test:account` tests signed mock Google JWTs and SQLite: exact origin/CORS,
PKCE, state-cookie binding/single-use replay, audience/issuer/nonce/expiry/signature
rejection, verified custom-domain Google identity, distinct-sub ownership with the
same email, explicit migration consent, save conflicts, rank exclusion and logout.
Automated tests use no live credentials. Separately, deployed Google consent,
callback and the signed-in email display were validated successfully. Mock SQLite
validated isolation/conflicts; live cross-account isolation, real preference/history
writes and production CPU observations remain unverified.

Before calling all account persistence verified: check live cross-account/guest
isolation, real persistence, migration/conflict/logout UX and observe Workers
free-tier CPU usage. Add account deletion/data-retention policy and operational
monitoring before calling this a complete production account service.

Sources: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect),
[Google token reference](https://developers.google.com/identity/openid-connect/reference),
[Google PKCE](https://developers.google.com/identity/protocols/oauth2/native-app#step1),
[OAuth security best practice](https://www.rfc-editor.org/rfc/rfc9700.html),
[Google production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview),
[Google Testing/basic-scope exception](https://support.google.com/cloud/answer/15549945).
