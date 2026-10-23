# v6: one scene / one response

One-scene trial and provider checks passed. Active priority: basic HU only; retain but do not reuse old v5 candidates.

For one decision, submit structural conditions, full action history, previously generated participant action ranges, own per-seat reach and legal actions exactly once. Return all169 frequency rows plus English/Japanese reasons in the SAME JSON response. There are no separate analysis/candidate/review/reason turns. Only invalid output gets one bounded corrective response; transport/quota errors do not initiate automatic new generation calls. Corrections stay in that scene's provider session. Sessions are fresh between scenes; worker processes may be reused.

The v6 namespace is `candidates/aiv2-preflop/llm-range-single-response-v6`; old v5 artifacts/checkpoints remain untouched. `--reuse-validated-v5` explicitly copies only dependency-closed numerically validated v5 artifacts, unchanged with ORIGINAL method/model/provenance. The separate adoption receipt and counts `existing_reused` versus `new_single_pass` prevent relabelling old work as v6. Reuse is not independent strategic review or publication approval.

Commands, from frontend:

- Offline inventory: `node scripts/aiv2-single-pass-runner.ts --domain`
- Durable state: `node scripts/aiv2-single-pass-runner.ts --status`
- Authorized one-scene trial (no v5 reuse): `node scripts/aiv2-single-pass-runner.ts --all --confirm-full-quota --limit=1 --concurrency=1`
- Current authorized resume: `node scripts/aiv2-single-pass-runner.ts --all --confirm-full-quota --scope=basic-hu --concurrency=10`
- `basic-hu` contains 325 targets across five basic families and five contexts, plus 20 dependency-only cold-three-bet histories. Other completed scenes remain saved but new out-of-scope scenes are not dispatched. The scoped audit runs before completion; it is not GTO proof.
- Runtime concurrency accepts 1..10. Explicit whole-file runtime-only compatibility receipts preserve original strategy source identity; unknown runner changes fail closed.

`--limit` is the TOTAL completed actionable count, not newly requested calls. Successful v6 output is reused only with byte-identical prompt/context/schema/model/version/implementation identity. A failed node is eligible on explicit next invocation, not endlessly resubmitted inside the same invocation. SIGTERM drains accepted calls and stops new phases/leases. Never start duplicate runner processes. No paid API/model fallback.

GitHub data saves occur every100 new-method completed actionable scenes. Old438 v5 candidates are not counted or reused. Partial saved checkpoint is allowed at real stop/quota. Production100-scene publication is a separate reviewed dependency-closed allowlist; numeric validation is not GTO proof or proof of strategic quality. Missing scenes must remain unavailable, not silently replaced by old AI. No main merge/deploy is performed by this runner. Per-player reach products are an approximation, not the exact card-removal-conditioned joint deal distribution; unresolved history assumptions remain explicit.
