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

Use `--run-once` instead of `--watch` to claim at most one job. Both global limits are capped at 100 **per explicit bridge invocation**, cumulatively across its jobs; each job is separately capped at 4 decisions and 8 provider responses. Failed attempts count against the response limit. Cache hits use neither a provider process nor a response budget. The provider remains the local authenticated Codex app-server, fixed to `gpt-6.1-sol` / `medium`; there is no API-key fallback.

An initial pinned heartbeat advertises owner readiness before the first claim. Heartbeats continue every 30 seconds while idle and during in-flight provider work. A lost heartbeat/lease, changed pins, provider uncertainty, invalid cache, or exceeded budget stops processing; the bridge does not retry generation or move on to another job after failure. Stopping the bridge does not automatically fail over to another model or API.

The production destination is strictly `https://api.reysonai.com`; redirects, URL credentials, alternate ports/paths and query strings are rejected. Explicit `--allow-loopback-test` permits only an HTTP IP-literal loopback origin with a port, for isolated testing, not a production bypass.

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
