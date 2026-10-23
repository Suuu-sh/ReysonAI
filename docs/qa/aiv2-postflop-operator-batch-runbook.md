# Explicit postflop operator batches

## Boundaries

`apps/frontend/scripts/aiv2-postflop-operator-batch.ts` is **enqueue-only**. It does not instantiate a provider, start/stop a bridge, acquire/remove its `worker.lock`, claim a lease, or generate a response. It calls only the bearer-authenticated `POST /v1/aiv2/ondemand/owner/operator-batch` endpoint, not the ordinary authenticated-user daily request API. Operator entries use an explicitly named existing account, with separate batch provenance; no synthetic account or quota-disguising login is created. The reviewed implementation separates public admission (three per user/day, 96 reserved calls/day, 16 outstanding) from finite private operator batches (50 outstanding globally, at most 100 decisions / 200 reserved calls per immutable batch; no application operator daily restriction). Combined outstanding is at most 66 and combined running at most 50; separate bounded bridge invocation caps and external provider/subscription quotas still apply. Quota or uncertainty stops work, without paid fallback.

A batch is 1–50 explicit unique flop card sets. Omitting `--path` preserves **root paths** (`[]`); the only optional follow-up is the exact `--path=check` (`["check"]`). Every request in one batch uses that explicitly selected path. Required independent `maxCalls`/`maxDecisions` limits must cover the full structural ancestor bound: `boards × (1 + path length)` decisions and twice that many possible responses, with at most 100 decisions and 200 calls. Cached parents do not reduce the reservation. There is no all-board discovery, unlimited queue, automatic generation, regeneration or model fallback. The existing frozen source reader verifies the supplied source snapshot, and the request and receipt bind implementation/source/revision pins. Poker outputs remain AI estimates, not independently validated GTO.

The 50-lane implementation is locally reviewed, **not yet deployed or real-50 verified**. Two separately bounded single-target continuations actually passed (1 + 1); the new scoped 2/4/8/16/50 ramp remains pending. This runbook is not permission to start a new wave.

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

The result contains only the deterministic batch ID, returned job IDs, accepted/queued and per-status counts, explicit caps and submission status. Existing complete canonical results may be reused but are not newly queued. Failed canonical targets, physical card-order alias conflicts and pending targets from another batch/public scope fail closed; a new batch ID must not retry old uncertain/failed generation. A local `already_submitted` result replays the saved receipt and is not a live status refresh. Enqueueing is not proof of generation. Run the separately authorized single bridge owner with the corresponding caps; staged ramp-up requires verifying the smaller run first. Never start multiple bridge processes to increase parallelism. The operator CLI does not start a bridge. After the reviewed release is deployed, more than four lanes requires the explicit bridge `--operator-batch-id=<returned-batch-id>` scope; unscoped legacy claims remain capped at four.

## Explicit BTN child after observed BB check

After independently verifying the saved BB roots, the following **separately authorized** command requests only the BTN node after `check` for the same six boards. It does not discover/follow additional actions or streets. No other path, repeated check, dealt card or bet flag is accepted; malformed/duplicate `--path` flags fail instead of falling back to a root request.

```sh
node /Users/yota/Projects/Products/ReysonAI/apps/frontend/scripts/aiv2-postflop-operator-batch.ts \
  --origin=https://api.reysonai.com \
  --bearer-file=/Users/yota/Projects/Secrets/ReysonAI/aiv2-ondemand-bridge.secret \
  --source-dir=/Users/yota/Projects/Products/ReysonAI/apps/frontend/candidates/aiv2-postflop/llm-postflop-ondemand-v2/source-snapshot \
  --operator-user-id=EXISTING_ACCOUNT_ID \
  --boards=9s8s6d,AhKd7c,Qs7s2s,JsJd4c,7s5h3d,Ts9d4c \
  --path=check --max-decisions=12 --max-calls=24 \
  --confirm-local-generation
```

Six child paths reserve **12 decisions / 24 responses**, even when their six BB ancestors are already cached. The actual new-work count can be smaller but is not assumed when leasing. The exact path is included in the batch and job identities, private submission journal and receipt validation, so a child submission cannot replay a root submission. After the scoped release is deployed, run the single bridge separately with the exact `--operator-batch-id=<returned-batch-id>` and explicitly approved `--concurrency=4 --max-decisions=12 --max-calls=24`. Scoped claims require current pins and remaining budgets, select only queued members of that batch, and never public/other-batch/failed work. A failed member fences further claims (`scopeFailed`); preserve uncertainty rather than retrying. Settled scope completion exits finitely, while externally running members do not count as complete. Legacy unscoped watches require an explicit stop after the intended targets finish; do not leave an open-ended owner running. This CLI never starts or automatically stops that bridge.

## Submission uncertainty and idempotency

Before the single POST, the CLI durably records the exact manifest in `/Users/yota/Projects/Products/ReysonAI/.local/range-dashboard/operator-batches/<batch-id>.json` with mode 0600. Its deterministic batch ID binds the account, boards/order, explicit path, source/implementation/revision and both budgets. A per-manifest submission lock prevents competing local submitters. It never automatically clears a stale lock.

- A validated 202 receipt records `submitted`; repeating the exact normal command returns `already_submitted` **without a network request**.
- Network loss, 5xx, invalid JSON or a mismatched receipt preserves `submission_pending`. A normal repeat refuses. Inspect the broker state before rerunning the **identical command plus `--retry-submission`**. The server enforces exact batch idempotency; the CLI does not automatically retry or choose a fresh batch ID.
- A validated quota-limited 429 receipt records `partially_submitted` and the exact accepted subset. Some jobs may already be queued. Do not blindly enqueue a different batch. Only an explicit identical `--retry-submission` may ask for the remainder after capacity is available.
- Explicit 4xx rejection is recorded as `rejected`; it is not automatically retried. A pin mismatch must be investigated, not worked around by changing the declared pins.

Journal data never includes the bearer or lease capabilities, but retain its private permissions and keep it, its temporary file and lock out of Git. Operator submission is independent of the bridge completion journal: `--retry-submission` only enqueues idempotently; it is **not** a retry of generation or completion upload.
