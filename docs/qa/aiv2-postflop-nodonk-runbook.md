# Explicit no-donk flop scope — user rule, not a solver finding

The user explicitly requested no BB flop first-action donks: BB checks with probability1 without a model call, then BTN is the first generated node. This is **a user-imposed action-space restriction**, not an LLM response, solved equilibrium or GTO approval. It does not forbid BB betting on later streets. All approval/GTO flags stay false.

## Identity and immutable separation

- New method `llm-postflop-nodonk-v1`, version `user-rule-no-donk-flop-bb-check-v1`.
- New core/store/generate-only CLI have separate source identities. The original frozen four files, old results and old model attestations remain unchanged.
- `NO_DONK_RULE` is content-hashed and included in config and the BTN input upstream. The explicit BB-check history entry cites a user instruction, **not** an old model decision ID or fabricated provider attestation. The first generated model prompt states this restriction.
- The deterministic root has `kind:user-rule-policy`, authority user-instruction, probability1, providerCalls0 and provider_attestation null. No fake 169-cell model artifact or provider receipt is created for it. There is no need to generate22,100 BB roots.
- Both exact1326-combo preflop ranges are board-filtered once by the same validated frozen preflop reader, then copied bit-for-bit after the rule check. No multiplication by100/100, rounding, narrowing, opponent-weight multiplication or chip/pot change is used.
- First model path is exactly `['check']`, actor BTN. Missing rule provenance or a root[]/donk model target is rejected. Later nodes use the normal generated-parent reach conditioning and legal-path validation.
- New cache is `apps/frontend/candidates/aiv2-postflop/llm-postflop-nodonk-v1/`, kind `attested-nodonk-cache-v1`. Old root/BTN caches are not relabeled or imported, even where frequencies happen to agree. New config/input/prompt/schema/implementation/source/revision hashes are separate.

## API and owner bridge

Existing `/v1/aiv2/ondemand/` remains the historical independent scope. New `/v1/aiv2/nodonk/` has the same status/scene/requests and private owner endpoints, using separately configured `AIV2_NODONK_ENABLED`, `AIV2_NODONK_IMPLEMENTATION_HASH`, `AIV2_NODONK_SOURCE_HASH`. It shares the existing private owner bearer, account authentication, HTTPS/no-Origin owner requirement, public daily3/96, operator finite limits, claim/lease expiry, atomic global running/outstanding bounds and failed-job fences. No schema migration or extra credential is added. New scope remains disabled until explicitly configured through the normal reviewed release path.

Authenticated root scene GET (`path=[]`) returns only explicit `status:user_rule`/userRule and no model scene. Root[] and first donk POST admission are400 **before any queue insertion**. BTN `path=['check']` reserves one decision/two maximum provider calls. New revision separates all dedup/lease/result identities from the old scope.

Parent-only explicit bounded enqueue (replace normal private arguments, never print their values):

```sh
node --experimental-strip-types apps/frontend/scripts/aiv2-postflop-nodonk-operator-batch.ts \
  --origin=https://api.reysonai.com --bearer-file=<private0600file> \
  --source-dir=<validated-frozen-preflop-source> --operator-user-id=<existing-operator-id> \
  --boards=AhKd7c --path=check --max-decisions=1 --max-calls=2 --confirm-local-generation
```

The corresponding parent-only single bounded worker adds `--scope=no-donk-v1` to the existing bridge command, uses the exact returned operator batch ID and the same explicit1/2 budgets. No new provider adapter or API fallback is introduced: `gpt-6.1-sol/medium` and actual app-server attestation are unchanged. A shared original worker lock prevents a legacy and new-scope owner from running concurrently. Its private journal is separate at `.local/range-dashboard/ondemand-nodonk/bridge-journal.json`, and the existing previous-journal uncertainty guard applies there. No legacy quarantine evidence can be used with the new scope. Do not delete or rewrite old uncertainty to launch this scope.

The historical root campaign/planner is **not** a no-donk campaign: do not launch it to generate BB roots or relabel old root coverage as new BTN coverage. This patch enables explicit bounded BTN batches and on-demand descendants; a future automatic BTN catalogue coordinator requires its own scoped review before launch. The existing independent new-artifact review is still required after any real trial. Current monitor's legacy journal selector is not evidence that the separate no-donk worker is live.

## Validation and release boundary

Offline focused tests cover exact reach/chip preservation, honest user-rule provenance, independent identities and root rejection,169-cell generated BTN save/read, new-prefix bridge uploads with one mocked provider turn, and broker auth/root-zero-queue/new revision/one-decision reservation. Selected legacy claim/cache-hit/auth tests guard default behavior. Scripts/tests TypeScript checks apply to the current combined worktree. None of these tests execute a real provider, queue, lease write or deployment.

UI integration stays on the existing solver page with explicit new source identity and BTN-first check path; the user-rule/no-GTO explanation must be visible. No old model-derived BB policy may be displayed as the new root. Implementation/review/PR/release/live trial are separate milestones. Parent alone decides actual deployment configuration, bounded queue admission and provider execution after independent review.
