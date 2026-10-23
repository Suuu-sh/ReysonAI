# Operator-only 50-lane ramp and all-physical-flop coverage — design, not activation

## Status and authority

The finite operator-only 50-lane backend, enqueue CLI and scoped bridge changes have now been implemented and reviewed locally. They are not yet deployed, and no real 50-lane run has occurred. This document itself changes no backend, bridge, provider, quota, deployment, runtime journal or saved artifact. It does not authorize a new model call, an automatic campaign, paid API fallback or replay of the four uncertain jobs. All strategy/GTO/production approval remains false.

The requested coverage domain is **every one of the 22,100 distinct physical three-card flops**, preserving actual suits, plus each reachable BTN decision after the actual BB `check`. It is not a representative ten-board sample, a fixed-private-hand runout set, a suit-isomorphism substitute, or every later action/turn/river decision. The latter would require an additional scope and budget.

The offline planner already expresses this domain in:

- `/Users/yota/Projects/Products/ReysonAI/apps/frontend/scripts/aiv2-postflop-flop-coverage.ts`
- `/Users/yota/Projects/Products/ReysonAI/apps/frontend/tests/aiv2-postflop-flop-coverage.test.ts`

Its existing deterministic 22,100-board enumeration and tests should be reused, not rerun merely for this document. A plan is not execution or completed coverage.

## Implemented ceilings — not yet deployed or live-50 verified

| Boundary | Reviewed implementation |
|---|---|
| Local owner concurrency | Legacy/unscoped remains 1–4; explicit `operatorBatchId` scope permits at most 50, with the same shared worker lock |
| Outstanding jobs | Public at most 16, operator at most 50, combined at most 66; admission is atomic |
| Operator enqueue list | At most 50 explicit targets; no discovery or automatic expansion |
| Operator batch/invocation budget | At most 100 decisions / 200 calls; full structural reservation and cumulative single-worker accounting |
| Running jobs | Combined atomic server ceiling 50; legacy generic claim ceiling remains four |
| Per-job reservation | Full ancestor bound unchanged: root 1 decision / 2 calls, one-check child 2 / 4 |
| Application daily reservation | Public-only 96 calls/day unchanged; operator admissions instead use finite immutable per-batch reservations, with no application operator daily restriction |
| Public account allowance | Three newly created public jobs per account/day unchanged; operator provenance does not consume public allowance |

Fifty roots reserve 50 decisions / 100 possible calls. Fifty one-check targets reserve 100 decisions / 200 possible calls **even if their parents are cached**. These are finite per-batch ceilings, not actual completed calls, token usage, unlimited campaign authority or a subscription capacity guarantee. External provider/subscription quotas remain authoritative: stop on quota/transport uncertainty, with no paid fallback or automatic successor batch.

No official provider capacity or safe 50-way rate is established here. A healthy current account-usage display does not establish the cause of the earlier uncertain calls or a guarantee that 50 will work.

## Completed single-target continuation and preserved uncertainty

The two previously unclaimed check children, `8c8h2d ["check"]` and `Jc8d5s ["check"]`, have each completed in a separate bounded single-target run. The **1 + 1 gate has actually passed**. This does not retry, resolve or diagnose the four earlier `uncertain_provider_outcome` entries: preserve their original private journal, hashes and `call_in_flight` markers. Attempted calls are not proof of accepted/completed turns; there is no automatic retry, refund or fallback.

Those continuations used the legacy queued-only one-shot path after a fresh exact-queue audit. Legacy behavior remains limited to four concurrent jobs. Future 50-lane invocations require the new explicit batch scope; neither an empty queue nor a new runtime directory authorizes failure replay.

## Implemented code/API boundary

The following contract is implemented and independently reviewed locally, awaiting the normal development → main release and deployment verification. No command here is an instruction to start a provider.

### Explicit finite operator scope

The owner-only immutable batch binds the existing real operator account, exact batch ID, current source identity, ordered explicit targets and structural `maxDecisions`/`maxCalls`. Admission accepts at most 50 targets, 100 decisions and 200 calls. This campaign's enqueue CLI remains limited to `[]` or `["check"]`.

Same ID with different content conflicts; identical submission returns existing states without resetting budgets. Complete canonical cache results can be reused without requeueing. Failed targets, physical card-order aliases, or queued/running targets owned by another batch/public scope fail closed; a new batch ID cannot revive uncertain work. Whole-list preflight is backed by atomic admission checks and postinsert ownership verification.

Scoped `owner/claim` requires `operatorBatchId`, all three current pins and explicit remaining decision/call budgets. Atomic selection only leases queued jobs in that exact immutable batch, never public, other-batch, failed or stale-revision jobs. A failed member fences further scoped claims and reports `scopeFailed`; a settled empty scope reports `scopeComplete`, while work still running elsewhere does not. No automatic catch-all watch follows scope completion.

Ordinary browser authentication/origin/CSRF checks, per-account daily three, public rate limits and public-only budget semantics remain unchanged. Public request fields cannot classify jobs as operator work.

### Selected finite accounting policy

The operator budget decision is **made and implemented**, not unresolved:

- Public admission remains at 16 outstanding, 96 reserved calls/day and three new jobs per user/day.
- Operator admission has no application daily reservation cap; each immutable batch is explicitly bounded to at most 200 reserved calls / 100 decisions, with at most 50 operator jobs outstanding globally.
- Combined outstanding storage is at most 66. Atomic combined running capacity is at most 50 across public and operator work; public occupied slots reduce available operator slots. Legacy generic claim remains limited to four combined running jobs.
- One explicit bounded worker shares cumulative reservations/counters across its lanes. No automatic next batch, multiple-owner workaround or unrestricted all-22,100 enqueue is introduced.

Full structural reservations are admitted atomically without weakening the immutable batch trigger. Attempts are recorded before provider dispatch; failed/expired/uncertain attempts are not assumed unused or automatically refunded. Provider/subscription quota remains a stop condition, not a promise of capacity. Existing canonical jobs and historical evidence are preserved.

### One owner, uncertain outcomes preserved

Retain the shared local worker lock. A stronger backend owner-epoch lease should fence another machine/invocation rather than relying solely on a local filesystem lock. Do not shard into several owners or runtime directories to simulate 50 lanes.

Keep per-job providers, request attestations and sanitized diagnostics isolated. Scope cumulative counters and reservations across all lanes in that owner. The only existing same-node correction remains the fixed bounded numerical/schema/coverage correction; factual-review findings do not trigger semantic regeneration.

On the first provider/transport/lease/pin uncertainty, stop new claims, new turns and corrections synchronously, preserve the first sanitized cause, drain already-started work, and do not save/publish responses arriving after the stop. Keep unresolved claims/completions fenced. No paid API/model fallback, quota refund, forced purchase or hidden retry.

A scope-complete operator invocation must exit when every explicit target is terminal or blocked, even if structural ancestor reservations exceed actual new cache work. Do not wait indefinitely for unrelated future queue arrivals.

## Physical coverage and parent conditioning

Maintain a finite canonical physical-board ledger; never rewrite an existing artifact's original board/order, decision ID, history or policy hash. Card-order aliases can count as one physical flop only after exact frozen-reader input equivalence is proved. A permuted card string must not bypass a failed/queued target or create duplicate generation. The reviewed operator admission now rejects physical card-order alias conflicts; the offline planner still requires frozen-reader input equivalence before counting an alias as saved coverage.

Reuse the offline planner's distinctions: locally validated saved, missing, parent-pending, actual zero-check-reach, unknown/unvalidated, and blocked by failed/queued/running broker state. A remote `complete` label alone is not a locally validated saved artifact, and saved does not mean strategy/factual approval.

For each board:

1. Generate the normal BB root with all existing legal actions. Never force check to create BTN coverage.
2. Validate/preserve the exact root artifact and actual check reach.
3. Request the BTN child only if check has positive reached weight. Apply the actual BB combo-specific check frequency to BB's own reach; BTN's own reach is not multiplied by BB's same-combo marginal.
4. If check reach is zero, record that exact terminal coverage state without fabricating a child or regenerating the root.
5. Bind child identity to the exact parent decision/policy hash. Factual errors remain recorded separately without silently editing or regenerating either artifact.

The complete physical domain has 22,100 roots and at most another 22,100 reachable one-check children. At 50 targets per wave, a full unfilled domain would require 442 root waves and up to 442 child waves. These are inventory bounds, not a call authorization, duration estimate or proof that all children are reachable. Use existing valid cache entries; never redo them merely to match a new board-order convention.

## Measured ramp gates

The two single-target continuations have individually passed. The new scoped ramp stages **2 / 4 / 8 / 16 / 50 remain pending**; earlier small legacy runs do not establish this new ramp. No stage is entered automatically after a prior stage, and no real 50-way run has occurred.

| Stage: one owner | Root structural decisions / calls | One-check targets: decisions / calls |
|---|---:|---:|
| Single target 1, then single target 2 — actual PASS | Not a new root stage | 2 / 4 each |
| 2 simultaneous targets | 2 / 4 | 4 / 8 |
| 4 simultaneous targets | 4 / 8 | 8 / 16 |
| 8 simultaneous targets | 8 / 16 | 16 / 32 |
| 16 simultaneous targets | 16 / 32 | 32 / 64 |
| 50 simultaneous targets | 50 / 100 | 100 / 200 |

For every stage require explicit finite manifest/caps, healthy current pins/queue, no unresolved active ownership, and a safe stop plan. The scoped caps and finite budget policy are implemented/reviewed but not deployed; deployment verification and measured stage evidence are still required. The deployed legacy ceiling remains four.

Measure without storing prompts, outputs, credentials or process arguments:

- Peak aggregate process-tree RSS, owner RSS, child-process count, active lanes and host memory pressure; parent-only memory is insufficient for up to 50 app-server processes.
- Actual overlap, attempted/completed calls, corrections, durable cumulative reservation, completed decisions and per-job provenance separation.
- Sanitized first failure code/phase/timing, rejected/uncertain claims, lease heartbeat health, drain latency, process exit and lock release.
- Exact saved-scene reload with no extra generation and independent artifact/factual review at the agreed scope.

Do not invent a safe RSS threshold or provider throughput guarantee. Set a measured host resource ceiling before entering 8/16/50; memory pressure, any uncertain outcome, rate/auth/capability failure or identity drift halts the stage. Current healthy usage percentages do not retroactively diagnose prior uncertainty.

## Offline deterministic coverage and remaining proposals — no real model calls

Focused backend/CLI/scoped-bridge mock tests and targeted typechecks have passed for the reviewed implementation. The checklist below distinguishes required coverage and further resource/parent-conditioning proposals; it is not a claim that every item is newly tested or live-verified. Do not rerun historical numerical suites for reassurance:

1. **Scope/identity:** reject >50, malformed paths, unknown fields/pins, duplicate physical flops and altered replay manifests; unchanged public/root defaults remain covered.
2. **Budget arithmetic:** 50 roots reserve exactly 50/100; 50 one-check targets exactly 100/200. Cached ancestors never lower the structural claim reservation; independent caps reject insufficient budgets.
3. **Claim isolation:** seed public, other-batch, failed, expired, current queued and stale-revision jobs. Only the exact allowed current operator targets may be claimed; a different batch ID cannot revive failure.
4. **Atomic races:** simultaneous admission/claim attempts cannot exceed shared slots, per-batch reservation or the explicitly selected operator budget policy. Public daily three/96 are unchanged, and operator provenance never consumes per-user three.
5. **Synthetic 50-way barrier:** mock all 50 lanes and prove actual in-flight peak <=50, one owner, isolated thread/turn attestations and aggregate counters. A 49-slot budget cannot lease lane 50. This is not live capacity evidence.
6. **Uncertainty:** inject a failure while 50 mock turns are in flight. No sibling correction/new claim starts; all work drains, first cause survives upload errors, unknown codes are sanitized, and uncertain attempts are never refunded or requeued.
7. **Restart/ownership:** unresolved claim, running/failure-pending or completion uncertainty cannot be bypassed by a new runtime path/owner epoch. Preserve private diagnostic backups and exact immutable failure records; upload-only recovery never calls a provider.
8. **Parent conditioning:** test a mixed-check BB root, not only check100. Apply BB's actual check frequency to BB reach, leave BTN reach alone, bind exact parent hashes, and classify zero-check reach without a generated child.
9. **Full physical ledger:** reuse the existing 22,100 unique suit-preserving enumeration test; add alias/failure fencing, deterministic wave slicing, no repeat at boundaries, and unknown/blocked targets excluded. Never use a representative-board sample as completeness evidence.
10. **Finite completion/resources:** exit after explicit targets settle despite unused reservations; no automatic next wave, idle catch-all or paid fallback. Synthetic memory-pressure/stop signals block new turns and still release the owner after drain.

Existing offline enumeration, diagnostics and new scoped-worker mock successes are not live 50-way verification or completed physical coverage.

## Acceptance boundary

The finite operator budget/slot implementation and independent local review are complete; deployment and the new 2/4/8/16/50 measured ramp are not. Use normal development → main release lineage, source receipts and live verification, without bypassing gates. Distinguish implemented, tested, deployed, stage-verified, physically covered and strategy-approved states. Neither this document nor the two successful single-target continuations establishes real 50-way capacity, all-22,100 coverage or strategy approval.
