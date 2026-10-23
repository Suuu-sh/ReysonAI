# Isolated Luna vs saved Sol research

Not a production model switch, strategy approval, benchmark or billing estimate. Existing generation continues unchanged. Only the parent may execute actual calls. No paid API fallback; both API-key environment variables are removed by the isolated authenticated app-server adapter. Plan usage/quota is shared with ongoing generation; quota/auth/capability/transport failure stops without retry or alternate model.

## First trial, then at most two more

From repository root, parent first runs **only**:

```sh
node --experimental-strip-types apps/frontend/scripts/research/aiv2-luna-comparison.ts --board=AhKd7c --confirm-isolated-research
```

After independent inspection of this real response/attestation/numerical coverage/representative EN+JA facts, parent may separately run the same command for `9s8s6d`, then `Qs7s2s`. No loop, batch, queue, production-cache write or automatic promotion. Each invocation owns exactly one node, concurrency1, at most two turns. Only invalid JSON or numerical/schema/coverage invalidity permits one correction in the same thread; factual disagreement never triggers regeneration. A timeout/uncertain failure is never replayed.

Three saved BB root inputs are selected, not claimed representative of all22,100 boards:

| Board | Texture | exact saved input hash |
|---|---|---|
| AhKd7c | high-card rainbow | dab7578991cfd845d4f5b19811409b62d1b07761bf5ab76fda60f8c592d04bc6 |
| 9s8s6d | connected two-tone | 0cda7b0aaa3962d5f352a0c4b1ffdda0f938a30bb74ce4c572f08edf83fcb28b |
| Qs7s2s | monotone | 83379ec99aea1be6a86642e651c5a27f2e8bb18adae6dfc1f67424a07971e255 |

Runner validates actual saved Sol envelope, input, source/prompt/schema provenance and current frozen implementation. Base input/prompt/schema/decision_id are reused **exactly**; only requested model differs (`gpt-6-luna`, `medium`). Actual `thread/start` response must confirm model+effort and turn/start sends both explicitly; rerouting/tools are forbidden. Separate model-bound research key prevents interpreting Luna data as a Sol production artifact. Saved outputs use an explicitly research-only envelope, never the production artifact metadata/model label. Unchanged core numerical validators ensure exact positive physical-combo coverage, legal integer frequencies sum100 and169 rendered hand cells. This is not semantic correctness or GTO proof.

Private outputs: `.local/research/aiv2-luna-comparison/<hash-of-model-and-baseline-rawSHA>.json` (0600). An exclusive process-restart attempt reservation (not fsync/power-loss durability) is written **before** creating the provider; any existing file blocks another attempt, including an ambiguous failed attempt. Never delete a reservation to retry. Input baseline hash is rechecked before final save. Raw research response is stored only in this private output, never logs. No secrets or app-server stderr are saved. Console reports only status/board/model/input hash/call count. Original cache and current worker runtime are never written.

Compare reach-weighted action percentages, per-physical-combo total variation,169 hand cells and actual EN/JA explanations. Independent factual review remains pending until performed; all approval/GTO flags false. Timings are historical Sol vs new Luna observations (not controlled simultaneous speed benchmarks). Token comparison uses `tokenUsage.last` per turn, never cumulative `total`; absent fields remain unknown. Qs7s2s baseline has two actual calls (one correction); the other two baselines have one. Include both baseline turns when comparing actual usage. One sample per board does not establish model quality, capacity, cost or reliability.
