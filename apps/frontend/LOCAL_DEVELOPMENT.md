# Local Google sign-in

Real Google OAuth is the default; no fake account or authentication skip exists.

## One-time setup

- Create a separate Google OAuth web client for development. Allow origin `http://localhost:5173` and redirect URI `http://localhost:8787/v1/account/google/callback`.
- Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `AUTH_RATE_LIMIT_KEY` in the ignored `apps/backend/.dev.vars`, using this development client, not the production client. Never commit or print this file. Do not put backend secrets in any `VITE_*` variable.
- Use an already installed Wrangler CLI. Set `WRANGLER_BIN` to its absolute `wrangler/bin/wrangler.js` path. No installation is performed by the startup script.

## Start / stop

From `/Users/yota/Projects/Products/SolveaGTO/apps/frontend`:

```sh
WRANGLER_BIN=/absolute/path/to/wrangler/bin/wrangler.js npm run dev:account
```

Open `http://localhost:5173/app` (not the computer's LAN IP or `127.0.0.1`). Sign in with Google. Google Workspace/custom-domain accounts are supported. Learn requires a real Google session; Range Analysis remains available to guests. `Ctrl+C` stops both servers.

The startup script uses only `wrangler.local.jsonc`, `--local`, and local D1 persistence at `apps/backend/.wrangler/local-state`. It initializes the account schema if absent, then starts API port 8787 and Vite port 5173. There are no remote D1 bindings or production IDs in the local config. Local profiles, preferences, practice, drafts and sessions are distinct from production account records. Importing browser guest data still requires explicit consent.

The API health endpoint is `http://localhost:8787/health`; a configured anonymous session returns `{ "user": null }` from `/v1/account/session`. HTTP 503 means configuration is incomplete; a connection failure is shown separately. Keep both servers running during the Google redirect.

Development authentication accepts only loopback HTTP API bases. Production builds always use `https://api.reysonai.com`, regardless of development environment values. Published strategy datasets are not copied into local D1 by this command. The startup clears inherited `VITE_API_BASE` for strategy data so the existing Vite local dataset middleware serves it; account authentication independently defaults to localhost:8787.
