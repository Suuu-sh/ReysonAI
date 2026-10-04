# Server-ranked practice deployment

Ranked is server-confirmed alignment with the saved AI estimate, not GTO, EV, win rate, or cheat-proof competitive play. Published estimates remain readable. Client answers are untrusted; client score, rating, frequency, timestamp and dataset submissions are rejected.

## Deployment prerequisites

- Existing production Google cookie authentication and its secrets must work. `0007_accounts.sql` must already exist; this release does not bulk-apply older/native migrations.
- Apply the additive, rerunnable `migrations/0009_ranked.sql`, deploy `src/index.ts`, then require `GET /v1/ranked/status` to return `enabled: true` before frontend publication. Missing schema or complete published `opening-ranges` / `preflop-ranges` inputs fails closed.
- `RANKED_ENABLED=true` is set in production and loopback config. `AUTH_NATIVE_ENABLED=false` stays explicit in production; native authentication is not part of this release.
- The workflow carries out the exact ranked migration and readiness gate. No remote migration/deployment was performed during implementation.

## Rules and data boundary

- Login is mandatory. First start explicitly discloses public participation. Public names are generated anonymous Player names; email/Google subject are never included in rankings.
- 20 server-issued questions; standard weighted difficulty and standard grading. Rating bands, K=12, initial rating=1000, minimum 3 matches and Master/top-10 Legend use `apps/shared/ranked-rules.ts`.
- SB limp is not an offered trainer action: condition frequencies on fold/open and exclude all-limp hands. Every match keeps an immutable policy snapshot, so later dataset publication cannot alter its result.
- At most 3 starts per UTC day, reset 00:00 UTC. Abandonment consumes a start. One active reservation per account expires after one hour. Returning to a reservation restarts its questions; answers are in-memory until the complete submission, not presented as persisted resumable answers.
- Exactly 20 action choices finalize once. The guarded SQLite status transition and trigger update rating/peak/count atomically. Same actions are an idempotent retry; a changed replay is rejected. Account ownership and session expiry are checked on every authenticated request.
- Weekly is the trailing 7 days, not a calendar week. Place is assigned against all qualified accounts before top-100 pagination; the current player's outside-top-100 place is included. Legend is Master plus top-10 place for the selected period. Unplaced users never become Legend.
- Browser ranked ratings/drafts, imports/exports and deleting practice history cannot edit authoritative rank. Existing local data is not silently imported. Account erasure cascades ranked rows; self-service erasure is not added here.
- Private history retains matches and the last 100 are returned. Stored match snapshots/actions and timestamps remain until account deletion; retention/purge policy beyond that needs a separate product decision.

## Focused verification

`node --experimental-strip-types --test tests/ranked.test.mjs` covers readiness/auth/consent, simultaneous starts/finalizations, forged/incomplete/changed submissions, daily cap and expiry, global placement/Legend beyond pagination, no-email exposure, no history-delete rating reset and account-delete cascade.

Client rank-store, trainer-release-status and ranked-ui tests cover shared thresholds, live-readiness guards, exclusion of local drafts/sample rows, and server-assigned placement/Legend.
