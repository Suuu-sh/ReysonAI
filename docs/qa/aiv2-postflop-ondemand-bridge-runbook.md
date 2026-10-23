# Saved postflop v2 owner bridge

## Scope and prerequisites

The outbound Mac owner bridge accepts only explicitly queued authenticated-user jobs from the configured production broker. It does not create user requests, run a model on public reads/cache hits, replace saved decisions, or approve poker strategy as GTO. Deployment, broker enrollment, source pins, account access, and secret provisioning must be completed separately before enabling it.

The three frozen generation/store files must stay byte-identical to the deployed implementation pin. The bridge checks implementation, preflop-source and revision pins before claiming, before generating, and before completing. It reuses the existing same-session generator: one normal response, at most one numerical/schema correction. No semantic-review regeneration occurs.

## Owner secret

Provision the broker bearer directly into a private regular file, for example:

`/Users/yota/Projects/Secrets/ReysonAI/aiv2-ondemand-bridge.secret`

Keep the directory private and file permissions **0600**. Do not put its contents into command arguments, source files, terminal output, chat, Git, or environment dumps. The bridge reads this file internally; it never logs its contents. Symlinks, group/world-readable files, whitespace-containing tokens, and undersized tokens are rejected.

## Explicit bounded start

From `/Users/yota/Projects/Products/ReysonAI`, run:

```sh
node /Users/yota/Projects/Products/ReysonAI/apps/frontend/scripts/aiv2-postflop-ondemand-bridge.ts \
  --origin=https://api.reysonai.com \
  --bearer-file=/Users/yota/Projects/Secrets/ReysonAI/aiv2-ondemand-bridge.secret \
  --source-dir=/Users/yota/Projects/Products/ReysonAI/apps/frontend/candidates/aiv2-postflop/llm-postflop-ondemand-v2/source-snapshot \
  --watch --confirm-local-generation --max-decisions=100 --max-calls=100
```

The recommended `--source-dir` selects the frozen two-node preflop source snapshot, whose filtered manifest and byte-identical saved source files permit clean-checkout replay without relying on the changing live v6 manifest. The original store reader still validates its method, completion/origin attestations and content hashes. Omission uses the legacy live source location and is not recommended for production.

Use `--run-once` instead of `--watch` to claim at most one job. Both global limits are capped at 100 **per explicit bridge invocation**, cumulatively across its jobs. Each job reserves a structural path bound: `maxDecisions = 1 + action-token count`, excluding dealt-card tokens, up to 32 decisions; `maxProviderCalls = 2 × maxDecisions`, up to 64 responses. A root request reserves 2 calls; the first child reserves 4. This covers missing ancestors rather than permanently failing deep requests under a fixed small per-job limit. The legacy/public broker daily reservation cap is 96 calls, separate from the bridge's actual consumed-call limit. Explicit immutable operator scopes use their separately validated manifest budgets, described below. Failed attempts count against the actual response limit. Cache hits use neither a provider process nor an actual response budget. The provider remains the local authenticated Codex app-server, fixed to `gpt-6.1-sol` / `medium`; there is no API-key fallback.

An initial pinned heartbeat advertises owner readiness before the first claim. Heartbeats continue every 30 seconds while idle and during in-flight provider work. A lost heartbeat/lease, changed pins, provider uncertainty, invalid cache, or exceeded budget stops processing; the bridge does not retry generation or move on to another job after failure. Stopping the bridge does not automatically fail over to another model or API.

Each claim sends the bridge's remaining global call/decision capacity. The broker only leases a job whose full structural reservation fits that remaining capacity. If pending jobs exist but none fit, `{job: null, budgetBlocked: true}` makes the bridge exit cleanly without leasing/failing a target or invoking a provider; the local journal stays idle. Owner-online availability subsequently expires with the broker heartbeat window (90 seconds). Starting another bounded bridge invocation remains an explicit operator decision, not an automatic restart.

The production destination is strictly `https://api.reysonai.com`; redirects, URL credentials, alternate ports/paths and query strings are rejected. Explicit `--allow-loopback-test` permits only an HTTP IP-literal loopback origin with a port, for isolated testing, not a production bypass.

## Opt-in bounded parallel generation

Default `--concurrency=1` preserves the original serial owner. Explicit `--concurrency=2 --watch` allows at most two leased jobs inside **one** bridge process, with the same shared `worker.lock`; never launch a second owner. `--run-once` still claims at most one job. Unscoped values outside 1–4 fail before any request. Explicit `--concurrency=3` or `--concurrency=4` raises the same single-owner scheduler bound only after the smaller real run has been validated; neither the default of one nor explicit two is changed. For a separately approved four-root trial use `--max-decisions=4 --max-calls=8`. Existing settled `parallel-owner-v1` journals remain compatible across these concurrency settings; unresolved entries still block restart or require explicit upload-only recovery, never generation replay. For a first two-root trial use `--max-decisions=2 --max-calls=4`; each root reserves one decision/two calls, including its possible correction. Existing broker account/daily quotas remain unchanged.

Claims are serialized and subtract all active jobs' remaining structural reservations before advertising capacity. Providers, metrics/provenance, lease heartbeats and durable journal entries are isolated per job. Boards containing the same three cards serialize to avoid duplicate ancestor writes. Any uncertain lane/claim/lease stops new claims and all new provider responses, including corrections; already-started responses drain without being saved/published after that stop. No automatic retry is added.

After deliberately stopping an **idle** serial owner, a scalar `idle`/`complete`/acknowledged `failed` journal can start the parallel owner safely. The parallel journal is one atomically replaced `parallel-owner-v1` envelope with per-job entries, aggregate counters and a `claim_pending` marker. Never display it: job entries contain lease capabilities. Unresolved claims/running/failure-upload entries block either serial or parallel restart. A lost completion retains its exact per-job payload. Use the same command with `--concurrency=2 --retry-completion` for explicit **upload-only** retry; every pending payload is locally validated before any upload, and no claim/provider is created. Unresolved non-completion entries require manual review rather than an upload retry. Keep this journal and its temporary file private and out of Git.

## Finite, explicit operator-batch scope (up to 50 lanes)

The default remains **one lane**, and an unscoped owner remains limited to **four lanes / 100 calls / 100 decisions**. Only an explicit `--operator-batch-id=<64-lowercase-hex>` permits up to **50 lanes / 200 calls / 100 decisions**. Fifty is an application ceiling, **not** a claim about official account/service concurrency capacity. A rollout must still be explicitly authorized and verified in bounded stages. Do not multiply owner processes or alter the frozen model/generator pins to reach it.

For an already-created, immutable, explicitly authorized operator batch, the additional bridge arguments are:

```sh
--operator-batch-id=EXACT_BATCH_ID --watch --concurrency=50 \
  --max-decisions=100 --max-calls=200 --confirm-local-generation
```

Keep the existing origin, private bearer file and frozen source-directory arguments. The scope contains only that batch's predeclared jobs. Each claim sends the exact batch ID **and** revision/implementation/source pins, plus remaining aggregate capacity after all in-flight structural reservations. Both the response and every claimed job must echo that exact batch ID before any provider is created; the server also enforces membership and running caps. Fifty `check` child paths structurally reserve 100 decisions / 200 calls, even if cached parents reduce actual work. Per-job limits, numerical-only correction rules, same-board serialization, single shared `worker.lock`, per-job evidence, diagnostic redaction and uncertainty stop/drain remain unchanged.

A scoped watch is finite: it never idles waiting for future additions or falls into another batch/user queue. A server `scopeComplete: true` stops after local lanes safely drain; this means no queued/running work remains, **not** factual/strategy/GTO approval. A failed scope is rejected as `operator_scope_failed`, never reported as clean completion and never replayed. When another owner lease remains but there is no local work, the bridge exits `scope_pending` for manual reconciliation rather than polling forever. `--run-once` still claims at most one job. A capped invocation may finish without proving full-scope completion; consult `scopeComplete` and a fresh owner-status check.

The private journal records the chosen batch ID and scope state. Explicit upload-only completion retry must keep the **same** `--operator-batch-id`; switching scope or omitting a prior scope is rejected. Failed, queued, unknown or uncertain outcomes are not permission for automatic generation retry, model fallback or a new replacement batch.

## Lock, journal and interruptions

The bridge shares the candidate store's `worker.lock` with the original local worker, so two owners cannot run together. It does **not** reclaim stale locks automatically. Do not configure automatic process restarts. After a crash, first establish that the previous owner process has stopped and inspect the broker job state; expired in-flight work remains failed/uncertain, never automatically requeued. Removal of a stale lock is a deliberate operator action after that investigation, not a retry instruction.

The journal lives under the ignored runtime directory `/Users/yota/Projects/Products/ReysonAI/.local/range-dashboard/ondemand-bridge/`, separate from candidate artifacts. `bridge-journal.json` and its temporary journal contain scoped lease capabilities and are written with 0600 permissions. They and the store's `worker.lock` are operational files, not publishable candidate artifacts; exclude them from Git/staging. Never display the raw journal in chat/log output. The owner bearer itself is not stored in the journal.

If a completion acknowledgement is lost, the journal retains the exact validated completion payload. A normal restart refuses to generate. After checking this condition, an operator can explicitly retry **only the upload**:

```sh
node /Users/yota/Projects/Products/ReysonAI/apps/frontend/scripts/aiv2-postflop-ondemand-bridge.ts \
  --origin=https://api.reysonai.com \
  --bearer-file=/Users/yota/Projects/Secrets/ReysonAI/aiv2-ondemand-bridge.secret \
  --source-dir=/Users/yota/Projects/Products/ReysonAI/apps/frontend/candidates/aiv2-postflop/llm-postflop-ondemand-v2/source-snapshot \
  --retry-completion
```

This path revalidates current source pins and the exact cached snapshot, does not claim a job or create a provider, and sends only the identical completion payload. Broker idempotence requires the same lease and result. Other uncertain states require operator investigation, not a model retry or an acknowledgement bypass.

## Verification boundary

Focused tests use temporary stores, test-only credentials and mock providers/network. They cover pins, origin/redirect policy, owner readiness, cached zero-call publication, heartbeats while work is pending, bounded accounting, interruption, lock/secret permissions and upload-only replay. They do not demonstrate a deployed job, real model call, working owner credentials, or independent strategy quality. The separately saved factual review remains `approved: false` and does not rewrite cache text or frequencies.

## Private failure diagnostics (serial and parallel)

The private, atomically replaced `0600` bridge journal now has a `diagnostics` section. `first_failure` keeps the first allowlisted error code, phase, UTC time and elapsed milliseconds; later sibling or failure-upload errors cannot replace it. Per-job diagnostic metrics keep only allowlisted status/error codes, expected model/effort, valid thread/turn UUIDs and bounded timing/session-turn numbers (at most64 metrics per job). Unknown codes become `unclassified_failure`; raw messages, stderr, prompts, outputs, bearer/lease capabilities and arbitrary metric extras are never copied into diagnostics. The existing operational journal still contains lease capabilities: never display or commit the whole journal.

These diagnostics do not authorize retry, fallback, quota refund or increased concurrency. Calls remain attempted/possibly-consumed until separately attested. On uncertainty, the original stop-new-work/drain behavior, worker lock, global reservations and upload-only retry boundaries are unchanged. Old runs without diagnostic evidence cannot be retroactively classified from these new fields.
