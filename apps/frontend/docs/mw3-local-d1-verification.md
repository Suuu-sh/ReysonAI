# Strict MW3 saved-delivery LOCAL D1 verification

The additive helper `scripts/verify-mw3-local-d1.mjs` verifies a single spot's exact saved flop/later delivery in an isolated, disposable local database. It never generates a strategy, creates an independent acceptance receipt, edits the shared approved-policy registry, executes remotely, installs dependencies, uploads artifacts, or deploys anything.

## Required inputs and runtime

All five flags are mandatory:

```sh
node scripts/verify-mw3-local-d1.mjs \
  --manifest ../../artifacts/postflop/mw3-<spot-slug>.manifest.json \
  --archive ../../artifacts/postflop/mw3-<spot-slug>.tar.gz \
  --receipt ../../configs/mw3-<spot-slug>.review.json \
  --sql ../../artifacts/postflop/mw3-<spot-slug>.sql \
  --wrangler "$WRANGLER_4147"
```

Run from `apps/frontend`. The saved manifest, materialized archive, separate acceptance receipt and SQL must be inside the checkout. A Git LFS pointer is not an archive payload. The receipt must already have passed separate independent review and match the exact saved manifest bytes, archived artifact identities, evidence and delivery pins. Missing, stale, unapproved or byte-mismatched input stops the gate before any D1 import. A preservation snapshot alone does not confer approval.

Provide the existing `bin/wrangler.js` entry for Wrangler **4.147.0**. There is no `npx`, download or installation fallback. The verifier checks its installed package metadata and exact declared/installed Miniflare **5.20261001.0-alpha** and workerd **1.20261001.1** and esbuild **0.28.1** dependencies resolved through Wrangler's actual `createRequire` resolution, then checks the executed Wrangler version. It requires Linux and Node >=22.20. Direct Miniflare 4.20260515 cannot substitute for this pinned Wrangler proof.

The manifest/archive/receipt/SQL are each read once, under byte limits, into captured raw bytes. Existing snapshot and independent-receipt gates validate those same bytes. The reviewed SQL is regenerated only as packaging from those validated saved artifacts and must be byte-identical, including comments, Unicode and line endings. Every reviewed source file is hash-checked and captured into the isolated directory. The actual transport route, shared empty registry and MW3 schema use captured bytes. Historical setup migrations are separately bound to the exact reviewed Git tree and recorded as fixture provenance. Pinned esbuild compiles only captured runtime sources with explicit tsconfig, records the emitted bundle hash and actual source-input ledger, and Wrangler loads that bundle with `no_bundle`. Captured source, compiled bundle, local wrapper/config and runtime resolution pins are rechecked before command/worker startup and final PASS; later live-checkout edits cannot become runtime inputs. No strategy generation or real materialization belongs in Actions. CI may consume already saved, reviewed, materialized inputs and invoke this helper.

## Gates established only by a complete successful run

1. Exact saved snapshot, receipt and complete SQL identity; exact installed/executed runtime pins.
2. One complete saved SQL file per `wrangler d1 execute ... --local --file ... --json` invocation. No split imports or reduced-coverage mode exists.
3. Two exact repeated imports, with equality of every header, ordered part body, per-part SHA-256, full payload SHA-256, byte count and part count.
4. Equality of schema and row-value hashes for all 18 current unrelated application tables, each seeded with a preservation row. A separately labelled unrelated synthetic MW3 delivery must also survive unchanged. Added application tables fail closed until their preservation coverage is explicitly updated.
5. Both immutable-part and immutable-header conflicts must cause the exact intended completed NOT NULL SQL error. Before each probe, earlier flop rows are removed and a late later-stage row is made deliberately conflicting. Importing the *same exact full reviewed file* would repair early rows before hitting the conflict. Whole-database equality against the pre-failure ledger demonstrates that those repairs rolled back, along with every unrelated row and schema object. The original child exit status, timeout/interruption flags and command identity must match the exact saved resource record, and parent-side owned-group cleanup must be complete. A child killed after printing NOT NULL still fails. Timeout, signal, empty output, zero launcher status without completed JSON, an unexpected SQL error or an incomplete rollback is a failure.
6. Actual `routeMw3Transport` restoration of every manifest/part and reconstruction of the exact saved flop/turn/river policy, with ETag/304, malformed-query, missing-part and POST rejection checks.
7. The actual shared empty build registry still rejects the imported hashes on ordinary `/v1/mw3/*` routes. For restoration only, an ephemeral localhost worker exposes an explicitly named `/__mw3_local_oracle/v1/mw3/*` namespace with the reviewed delivery pins. These local pins do not edit the registry or grant production publication approval.
8. Worker shutdown, a fresh pinned Wrangler worker process over the same persisted local state, identical full-database hashes and repeated exact API restoration.

The fixed dummy binding and config allow no remote database, other resources, credentials or assets. Each supervised command creates its own recorded session/process group. Python handles TERM/INT, kills/waits in finally, and writes both child output streams directly to separate files, including success warnings. The parent independently checks and, if necessary, terminates only that command's recorded group after abnormal supervisor exit. No live process-group members may remain; zombie-only entries cannot execute or retain D1 locks. Every subprocess receives a credential-free environment with isolated HOME, disabled dotenv loading and disabled telemetry. The worker binds to 127.0.0.1. Only the isolated localhost worker process group is stopped.

## Evidence and failure handling

Each invocation retains its own `.local/verify-mw3-d1-*` directory, including captured exact SQL, labelled synthetic setup/probe SQL, captured reviewed source/schema ledgers, compiled bundle/source-input identity, command arguments, complete success/failure stdout/stderr logs, original child exit/owned-group cleanup records, waited-command resource measurements, worker logs, persisted database and `result.json`. Failure logs and state are never automatically removed. A failed result lists only gates actually reached; it cannot be promoted to a pass. The strict import has a 10-minute command deadline and a 3 GiB waited-command RSS ceiling; exceeding either fails without reducing the import scope.

RSS telemetry is the Linux RUSAGE_CHILDREN maximum for each waited Wrangler command, including inherited child maxima, not simultaneous process-tree aggregate RSS. The verifier reports its own Node maximum separately. The local proof does not establish remote D1 atomicity or production readiness.

## Focused checks

```sh
node --test tests/mw3-local-d1.test.mjs
```

These tests use visibly labelled synthetic fixtures and SQLite reference transactions to check the verifier's contracts. They do not constitute strict Wrangler evidence, a real saved-snapshot gate, independent strategy acceptance, LFS acceptance, or publication approval. The real CLI has no fixture-receipt or verification-bypass option.

At preparation, the helper and focused tests are **unrun** while local Node remains reserved for the coordinated acceptance work. The real strict gate additionally remains blocked on the final accepted saved archive/receipt/SQL. Do not claim any of the eight gates passed until the final inputs complete the actual pinned runtime run.

Official command reference: [Cloudflare D1 Wrangler execute](https://developers.cloudflare.com/d1/wrangler-commands/#d1-execute). Exact dev flags were checked against the installed 4.147.0 CLI source; future runtime versions require a separate pin update and new proof.
