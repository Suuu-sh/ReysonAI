# Explicit postflop operator root batches

## Boundaries

`apps/frontend/scripts/aiv2-postflop-operator-batch.ts` is **enqueue-only**. It does not instantiate a provider, start/stop a bridge, acquire/remove its `worker.lock`, claim a lease, or generate a response. It calls only the bearer-authenticated `POST /v1/aiv2/ondemand/owner/operator-batch` endpoint, not the ordinary authenticated-user daily request API. Operator entries use an explicitly named existing account, with separate batch provenance; no synthetic account or quota-disguising login is created. Broker global outstanding/daily call caps and the separate bridge invocation caps still apply.

A batch is 1–16 explicit unique flop card sets, **root paths only**. Required independent `maxCalls`/`maxDecisions` limits must cover two possible responses and one decision per root, each capped at 100. There is no all-board discovery, unlimited queue, automatic generation, regeneration or model fallback. The existing frozen source reader verifies the supplied source snapshot, and the request and receipt bind implementation/source/revision pins. Poker outputs remain AI estimates, not independently validated GTO.

## Explicit enqueue

Prepare the owner bearer in the existing private regular 0600 file. Never print it, include it in command arguments, or read it into chat. Substitute the existing real operator account ID for `EXISTING_ACCOUNT_ID` below; do not invent a user or expose an email address.

```sh
node /Users/yota/Projects/Products/ReysonAI/apps/frontend/scripts/aiv2-postflop-operator-batch.ts \
  --origin=https://api.reysonai.com \
  --bearer-file=/Users/yota/Projects/Secrets/ReysonAI/aiv2-ondemand-bridge.secret \
  --source-dir=/Users/yota/Projects/Products/ReysonAI/apps/frontend/candidates/aiv2-postflop/llm-postflop-ondemand-v2/source-snapshot \
  --operator-user-id=EXISTING_ACCOUNT_ID \
  --boards=9s8s6d,AhKd7c --max-decisions=2 --max-calls=4 \
  --confirm-local-generation
```

The result contains only the deterministic batch ID, returned job IDs, accepted/queued and per-status counts, explicit caps and submission status. Previously existing failed/complete jobs are not described as newly queued. A local `already_submitted` result replays the saved receipt and is not a live status refresh. Enqueueing is not proof of generation. Run the separately authorized single bridge owner with the corresponding caps; staged ramp-up requires verifying the smaller run first. Never start multiple bridge processes to increase parallelism. The operator CLI does not increase the bridge concurrency limit.

## Submission uncertainty and idempotency

Before the single POST, the CLI durably records the exact manifest in `/Users/yota/Projects/Products/ReysonAI/.local/range-dashboard/operator-batches/<batch-id>.json` with mode 0600. Its deterministic batch ID binds the account, boards/order, source/implementation/revision and both budgets. A per-manifest submission lock prevents competing local submitters. It never automatically clears a stale lock.

- A validated 202 receipt records `submitted`; repeating the exact normal command returns `already_submitted` **without a network request**.
- Network loss, 5xx, invalid JSON or a mismatched receipt preserves `submission_pending`. A normal repeat refuses. Inspect the broker state before rerunning the **identical command plus `--retry-submission`**. The server enforces exact batch idempotency; the CLI does not automatically retry or choose a fresh batch ID.
- A validated quota-limited 429 receipt records `partially_submitted` and the exact accepted subset. Some jobs may already be queued. Do not blindly enqueue a different batch. Only an explicit identical `--retry-submission` may ask for the remainder after capacity is available.
- Explicit 4xx rejection is recorded as `rejected`; it is not automatically retried. A pin mismatch must be investigated, not worked around by changing the declared pins.

Journal data never includes the bearer or lease capabilities, but retain its private permissions and keep it, its temporary file and lock out of Git. Operator submission is independent of the bridge completion journal: `--retry-submission` only enqueues idempotently; it is **not** a retry of generation or completion upload.
