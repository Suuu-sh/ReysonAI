# Finite root campaign coordinator — locally implemented, not live verified

The coordinator reuses the existing enqueue-only CLI and launches one existing scoped bridge child at a time. It never directly creates a provider or modifies the four frozen generation/provider files. No scheduler/recurring automation is used. The parent alone may launch it; source implementation is not launch authorization.

## Explicit finite launch (parent only)

```sh
node --experimental-strip-types apps/frontend/scripts/aiv2-postflop-campaign.ts \
  --origin=https://api.reysonai.com \
  --bearer-file=<existing-private-0600-file> \
  --source-dir=<frozen-source-snapshot-directory> \
  --operator-user-id=<existing-real-account-id> \
  --broker-snapshot=<parent-fresh-private-broker-snapshot> \
  --max-decisions=22100 --max-calls=44200 \
  --batch-size=16 --max-concurrency=16 \
  --reviewer-task=/root/parallel_safety_review \
  --confirm-finite-campaign
```

The two positive finite total budgets are mandatory (ceilings 22,100 decisions / 44,200 calls); these example totals are not an instruction to launch. Root-only physical domain is 22,100, never a representative sample. One wave is at most 50 explicit roots; default 16. Start at two concurrent lanes, increasing 2→4→8→16 only after two independently reviewed stable scopes at each level, with observed overlap, valid numerical/provenance accounting and zero transport retries. Fifty concurrent lanes are prohibited. A smaller final wave cannot establish a higher-capacity ramp.

The initial broker snapshot must match current pins, have `recordedAt` no older than 60 seconds, and include historical failed/queued/unknown exclusions. Existing local saved/unknown data, every snapshot board and prior terminal-journal board are excluded. Before each wave, all six card-order aliases receive fresh owner-status probes; existing complete, queued, running or failed targets are excluded, never regenerated. Unknown data or source drift stops admission. Atomic server conflict/partial/uncertain admission stops the campaign, not a blind retry.

Only the coordinator may own this session. Do not run another manual bridge while its campaign lock exists, including during independent review. Its global private `ondemand-bridge/campaign.lock` prevents a second coordinator; the unchanged bridge `worker.lock` protects each child. Neither stale lock is automatically deleted. Restart/resume and completion-uncertainty repair remain explicit parent-reviewed operations, not automatic campaign behavior.

## Independent review checkpoint — not self-approval

After child exit and lock release, exact complete entries, new cache artifacts, actual attestations/correction provenance and fresh broker completion must agree. Then the process writes:

`.local/range-dashboard/operator-campaigns/<campaignHex64>/waves/<batchHex64>.review-request.json`

The private request binds `campaignId`, `batchId`, all source pins, exact new artifact byte hashes/decision IDs, actual call/decision/attestation counts, repair/retry counts, observed peak, and the child-journal raw hash. All strategy/production/GTO approval flags stay false. During `review_wait`, generation workers are inactive and **no new enqueue or provider request occurs**. A filesystem event, not periodic generation automation, resumes receipt checking.

A separate independent reviewer—not the coordinator or its implementation author—must inspect the exact new artifacts and representative English/Japanese factual statements. It writes the sibling `<batchHex64>.review.json`, mode 0600, with exactly these fields:

```json
{
  "schema_version": 1,
  "kind": "independent-root-wave-review",
  "campaignId": "<exact-request-campaign>",
  "batchId": "<exact-request-batch>",
  "requestSha256": "<SHA256-of-exact-request-file-bytes>",
  "artifactRecordsSha256": "<exact-request-artifactRecordsSha256>",
  "reviewerTask": "/root/parallel_safety_review",
  "reviewedAt": "<actual-review-UTC-time-after-request>",
  "numericProvenancePass": true,
  "representativeFactsNoError": true,
  "approved": false,
  "production_strategy_approved": false,
  "gto_verified": false
}
```

This is a schema, **not a preapproved receipt**. Do not mechanically fill PASS values. A factual/numerical/provenance issue requires a negative independent finding and campaign halt, preserving the original data; it does not authorize semantic repair or regeneration. Identity/hash mismatch, stale/extra fields or a negative receipt stop the campaign. After receipt acceptance, artifact bytes are rechecked before the next wave. Local trusted reviewer identity is operationally enforced; this is hash-bound evidence, not a cryptographic signature or GTO approval.

Private `campaign.json` preserves cumulative spent/reserved budgets, exclusions and `ready/running/review_wait/halted/done` state. Owner-process metadata retains actual child PID/start/batch/concurrency and separately records coordinator PID/campaign phase; an alive coordinator waiting for review is not an active generation worker. Any child failure, unresolved upload/claim, source change, quota event or budget exhaustion prevents new work; owned child shutdown drains before releasing ownership. Paid/model fallback is absent. Confirmed heartbeat reconfirmation resets ramp stability; it does not invent an earlier cause or refund an attempt.

## Local validation

Only focused temporary-file/mock tests and targeted TypeScript checks apply. Tests use synthetic independent-review fixtures, not real independent artifact approval, and start no real provider/queue operation. A real campaign and its future checkpoints require separate parent launch and actual reviewer evidence.

## Completed-wave status size correction and explicit fresh restart

The existing owner-status endpoint returns full saved results for completed jobs, not just a summary. The coordinator's prior 128KiB client bound was incompatible: the first real completed16-wave's locally reconstructed job results totalled about7.8MB. The corrected reader is bounded at32MiB, derived from at most16 jobs and the server's1,800,000-byte owner-completion input cap plus JSON framing. It still verifies exact pins/requested IDs/statuses/duplicates and immediately projects only `id/board/path/status`. Raw results are neither persisted nor logged. Timeout/auth/redirect guards remain unchanged. This identifies that campaign's status-size failure only; earlier heartbeat/completion transport causes remain unresolved.

A halted campaign is not automatically resumed or adopted. If its already-saved wave is independently reviewed and the parent freshly verifies every broker job complete, preserve its original `campaign.json`, child journal and static review evidence unchanged. Do not manufacture a past checkpoint request or receipt. After the parent verifies no live owner/locks/unresolved journal entries, capture a new private broker snapshot no older than60 seconds and explicitly launch a new campaign with the corrected reader. Its new random nonce creates a different campaign ID. Local validated artifacts, all fresh snapshot boards and the completed prior journal entries exclude those saved targets; no provider replay is needed.

To retain the same cumulative grant, explicitly subtract known spent calls/decisions from the new grant. For a prior16-call/16-decision wave, an original22,100/44,200 grant leaves22,084 decisions /44,184 calls. Unused structural reservations are not attempts; uncertain attempts must never be assumed unused or refunded. This is a parent-authorized fresh run, not a self-starting recovery path. Failed/queued/unknown historical targets remain excluded.

## Explicit expired-lease quarantine (parent-only, never a retry)

`owner/fail` can mark only a still-running job with the matching original token and **unexpired** lease failed. An expired lease is rejected409; do not POST it just to probe or retry. Already failed jobs have their lease hash cleared and are not a replay-success path. Quarantine is not a database terminalization, successful result, refund, completion retry or regeneration.

When the parent has positively verified both old processes exited, no worker lock, exact halted campaign/journal bytes, expired running lease and no saved broker result, it may create a separate0600 JSON artifact with exactly this schema (fill actual evidence, never fictional values):

```json
{
  "schema_version": 1,
  "kind": "operator-expired-lease-quarantine",
  "authorizedBy": "operator",
  "recordedAt": "<actual UTC ISO time>",
  "originalCampaignId": "<64hex>",
  "originalCampaignSha256": "<raw original campaign.json SHA256>",
  "originalBatchId": "<64hex>",
  "originalJournalSha256": "<raw original global journal SHA256>",
  "pins": {"revision": "<64hex>", "implementationHash": "<64hex>", "sourceHash": "<64hex>"},
  "ownerPid": 12345,
  "coordinatorPid": 12346,
  "jobs": [{"id": "<exact uncertain job64hex>", "board": "AsTs4s", "path": [], "status": "running", "leaseUntil": 1, "hasResult": false, "checkedAt": "<actual fresh DB-read UTC ISO time>"}],
  "approved": false,
  "production_strategy_approved": false,
  "gto_verified": false
}
```

`leaseUntil` is the actual positive epoch-ms value, not the example1. It must precede the real DB observation. No bearer, lease token, raw completion, raw log or prompt belongs in this artifact. The original campaign must be halted, batch/pins exact; unknown claims, pending completions, saved decisions on the uncertain entry or a live/unknown PID reject quarantine. Every `failure_pending` entry must be exactly covered and have uncertain outcome, at least one consumed attempt, zero saved decisions and no completion payload. PID signal0 proves absence only when it returnsESRCH; permission errors remain fail-closed. This is explicit operator evidence, not a cryptographic signature or independent strategy approval.

Use the parent-created file only after independent source/security review:

- Add `--quarantine-file=<private-proof-file>` to the fresh campaign. Both coordinator and scoped bridge startup validate the original raw hashes and evidence; generic/unscoped or the original batch is forbidden.
- The **original global journal stays byte-for-byte unchanged**. New child journals live at the fixed private `ondemand-bridge/quarantines/<originalJournalSha256>/bridge-journal.json`. The key is the original journal hash, not the proof hash, so editing a proof cannot select a fresh empty runtime to evade another unresolved outcome.
- The derived runtime still enforces the normal previous-journal guard and shared worker lock. An unresolved outcome in that derived runtime stops again; no recursive quarantine escape is implemented.
- All original journal boards are permanently excluded, including card-order aliases. New owner metadata contains `quarantineJournalSha256` only to select this fixed monitoring path; the monitor never treats original uncertainty as live work or success.
- Historical spent/uncertain calls remain spent. The parent supplies the separately accounted remaining finite budget; no automatic refund occurs. Normal database claim expiry can later mark an expired running row failed, but no claim is issued merely to force expiry.

Initial concurrency remains2 by default. The parent may explicitly select `--initial-concurrency=8` after separately confirmed prior stability; only2 or8 initial values are accepted and neither may exceed `--max-concurrency` (ceiling16). It starts with zero new stability credit; two new fully observed reviewed stable scopes are still required before8→16. No live launch is implied by this documentation.

After each accepted independent receipt and exact artifact rehash, the coordinator refreshes the existing offline full-physical-flop coverage plan once, writing the existing fixed0600 plan atomically. This is not a per-second cache audit, provider call, queue action or new approval. The last actually observed global broker snapshot/timestamp is retained; successful local artifact recounting never fabricates fresh whole-DB evidence. A failed recount/write keeps the prior plan, records only `coverage_refresh_failed` in the private campaign, resets ramp stability and allows bounded work at the current level; the old plan remains visibly stale rather than inventing counts.

For the currently authorized recovery the parent must preserve the original hashes and actual evidence, validate the proof using the read-only helper, then capture a fresh broker snapshot and launch only after no owners/locks are present. The invocation adds `--quarantine-file=<parent-created0600proof> --initial-concurrency=8` to the normal finite CLI, with the explicitly supplied remaining `--max-decisions=21573 --max-calls=43638 --batch-size=16 --max-concurrency=16` and the configured independent reviewer. These are remaining bounds, not a refund or authority to retry `AsTs4s`. Until the parent actually launches, generation remains stopped.
