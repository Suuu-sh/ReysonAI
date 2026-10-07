# Independent Astra review: strict Mw3 LOCAL D1 oracle

Reviewed: 2026-10-04 21:36 UTC, including subsequent limited test evidence.
Fixed implementation: `065673ffeb2d6cc7d37e779f88313aaf355632ac`.
Reviewer: `gpt-6-astra`, independent of the helper implementation.

## Decision and limits

**Static GO; all 19 focused synthetic tests subsequently passed. No remaining static blocker was found in the revised helper. The real strict D1 gate is still unrun.**

This review does **not** establish a strict D1 pass, accepted archive, independent policy receipt, LFS delivery, remote atomicity or publication approval. The reviewer did not execute Node, Wrangler, esbuild, workerd, D1, policy generation or simulation. Static work used source/Git inspection, hashes and Python syntax compilation of the embedded supervisor/cleanup strings. The coordinating implementer subsequently obtained a short shared-machine slot and reported syntax checks, 19/19 synthetic tests and installed runtime-pin inspection complete at 21:35:49 UTC; the reviewer read and hashed the resulting logs below without rerunning them. The prior storage CI is separate evidence. The real helper invocation remains unrun.

Scope: the additive `scripts/verify-mw3-local-d1.mjs`, `tests/mw3-local-d1.test.mjs` and `docs/mw3-local-d1-verification.md`, relative to base `13f6f76`. The reviewer changed no implementation, shared HU helper or numerical/policy source. This document is a review record, not an acceptance receipt.

## Findings closed

1. **Live-checkout runtime/schema race.** `captureRuntimeSources` now captures every reviewed source with exact size/SHA-256, requires the actual transport/empty registry/Mw3 schema, and binds the complete historical migration fixture to the reviewed Git tree. The isolated captured files produce the worker through pinned esbuild with explicit tsconfig. The actual input ledger and emitted bundle hash are recorded; Wrangler uses `no_bundle`. Captured sources, bundle, wrapper/config, SQL and runtime resolution are checked again before commands/worker startup and final PASS (`:101–157,267–294,520–541,590–599`).
2. **Killed child misclassified as completed SQL failure.** Rollback evidence now requires the original child's positive normal exit status, matching wrapper status, exact command/resource identity, no timeout/interruption, and completed independent group cleanup. A printed NOT NULL message followed by SIGKILL cannot satisfy it (`assertFinishedSqlFailure`, `:317–333`). Negative fixtures cover this distinction.
3. **Orphaned importers and discarded stderr.** The supervisor owns a fresh session/group, records its birth identity before unblocking TERM/INT, captures both child streams directly to files, and kills/waits in `finally`. The parent separately verifies or cleans only that recorded group after supervisor completion or failure. Missing or inconclusive process evidence fails closed; failure artifacts remain available (`:156–265`). The focused process fixtures subsequently passed; cleanup during the real pinned Wrangler gate remains to be exercised.
4. **Incorrect runtime dependency resolution.** Pins now follow the real `wrangler-dist/cli.js` lookup and Miniflare's own workerd lookup; their workerd entry/version must agree. Every lookup runs in a fresh bounded, credential-free process, so a previous successful lookup cannot hide a newly nested dependency. The directory argument passed to the shared environment helper is now correct. The new fixture includes changed dependencies after an initial lookup (`:62–86`). Node's in-process path caching is documented by its [v22.20 loader implementation](https://github.com/nodejs/node/blob/v22.20.0/lib/internal/modules/cjs/loader.js#L634-L638).
5. **Overbroad internal-table exclusion.** Schema snapshots use literal `sqlite_` and `_cf_` prefixes, rather than LIKE underscores that also matched application names. The added SQLite fixture uses a single-quoted SQL string (`databaseSnapshot`, `:344–354`).

## Other reviewed invariants

- The real CLI requires all saved inputs and an installed pinned runtime. It has no remote, reduced-scope, fixture-receipt or approval-bypass option. The manifest/archive/receipt/SQL are captured once, then existing snapshot/receipt validation and exact regenerated SQL-byte equality apply before any database import.
- The inspected installed Wrangler 4.147.0 implementation passes the complete local file's parsed statements to one `db.batch`. The helper never splits the reviewed delivery. Its immutable header and final-part conflict probes remove earlier flop rows first, making a partial commit observable by the complete before/after database ledger.
- Header/part/payload hashes, all 18 unrelated application tables, unrelated Mw3 rows, schema, foreign keys and database integrity are checked. Missing/extra/reordered/corrupt delivery rows cannot count as successful restoration.
- Fixed dummy D1 configuration, localhost binding, isolated HOME, disabled dotenv/telemetry and a credential-free subprocess environment remain in place. No production state, credentials, uploads or deployments are requested. Synthetic destructive probes target only the new disposable local database.
- The ordinary route remains sealed by the shared empty registry. Accepted-byte reconstruction uses an explicitly separate ephemeral localhost oracle namespace; it never edits or publishes the registry. Complete API reconstruction and a fresh-worker restart are required before PASS.
- State, stdout/stderr, SQL, source/bundle identity, process ownership and resource evidence are retained after failure. Reported RSS remains the waited-child maximum, not simultaneous aggregate process-tree memory. A local pass would not establish remote D1 behavior.

## Limited execution evidence

At the unchanged reviewed commit, the retained synthetic log reports **19 tests, 19 pass, 0 fail, 0 cancelled, 0 skipped**, including source mutation, nested package resolution after an initial lookup, successful stderr preservation, and killed/timed-out/interrupted-child fixtures. The installed-pins record confirms Wrangler 4.147.0, Miniflare 5.20261001.0-alpha, workerd 1.20261001.1 and esbuild 0.28.1; Wrangler and Miniflare resolve the same workerd entry. The implementer also reported successful `node --check`. No actual accepted archive, complete D1 import, Wrangler API worker or restart was run.

- `.local/mw3-d1-tests/synthetic-v1.log`: 2,330 bytes; SHA-256 `6889c10325fb66c80f84c6b823744c5a4e59ce7bdf20335ade4effc0407a6bed`
- `.local/mw3-d1-tests/actual-pins-v1.json`: 1,818 bytes; SHA-256 `906f30fb4f310097344f8a502d45e522a05833934b5eb53b1a4559869750b8db`

This update supersedes the preparation document's “focused tests unrun” status only. Its real-gate limitations still apply.

## Next executable gates

1. The first **19-test** run is complete. Repeat it against any later integration change or final CI source using `node --test tests/mw3-local-d1.test.mjs` from `apps/frontend`. The existing `postflop-mw3-*.test.mjs` glob does not include this file. Require zero skipped tests and preserve unexpected failure evidence.
2. Only after real, current, independently accepted archive/receipt/SQL inputs exist, execute the full helper with the verified installed Wrangler 4.147.0 / Miniflare 5.20261001.0-alpha / workerd 1.20261001.1 / esbuild 0.28.1 installation. No synthetic receipt may substitute for those inputs.
3. Require both complete imports, both observable conflict rollbacks, all unrelated-data checks, actual-route reconstruction, empty-registry rejection and restart persistence. Inspect retained command/runtime/source identities before recording a strict-local PASS.
4. Keep LFS clean-fetch acceptance, remote D1/publication authorization, final consumer/browser QA and the remaining strategy evidence gates separate. This review grants none of them.

## Exact reviewed bytes

- `scripts/verify-mw3-local-d1.mjs`: 46,427 bytes; SHA-256 `a2b2af9461e7cd066ffe5ca06a6a67d2cb3c68060c4417b084b5ef23d6290f13`
- `tests/mw3-local-d1.test.mjs`: 21,710 bytes; SHA-256 `d97c7d8e735cb1c999e879a3ddf55322d90af786d98d73d5a32f8fffc28e0df5`
- `docs/mw3-local-d1-verification.md`: 8,089 bytes; SHA-256 `bedde42e49da2a8ef77dbffbdfcf079c9b669fcd0414cf7f1e43306781a87acc`
