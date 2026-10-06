# Model11 explicit numerical execution checkpoint

This is an additive offline diagnostic adapter, based on e82610dc808ce8bcf6908a7057e3d639f2f12e25. It is not a model11 policy acceptance, production adoption, completed quality gate or mass-generation facility. At source-checkpoint creation, no new Node test or simulation has run. Every result requires fresh execution. Lost positive-reroute and post8d6 evidence is not recovered proof.

## Actual consumer contract

- `createModel11Execution` consumes the complete unchanged `{metadata,policy}` flop/later envelopes. The effective factory validates source construction, payload hashes, linked flop hash, frozen pilot configuration and the exact balanced-vs-balanced belief.
- Each candidate decision takes only `{board,path}`, actor own combo, and random number. Board means revealed board only; path means earlier public actions only. There is no opponent-hole, future-runout, future-history or actual-profile input to candidate inference.
- `sample` uses `sampleEffectiveAction` on the exact law returned by `createEffectiveDefence`. Full `NODES`/`LATER_NODES` label order, final-label remainder and physical pooling are retained. Return the sampled original label to the unchanged engine, which records its public physical class. Effective reach uses that same physical law at its original prefix.
- The actual reference uses `referenceActionLaw` and an independently verified reference descriptor. Its profile never changes the candidate belief. Actual-reference decisions do not query candidate reach. A reference terminal action can settle even if its observation has zero candidate-model likelihood, because no subsequent candidate inference is needed.
- If a later candidate decision needs a zero-model-likelihood history, the typed `off-model-observed-action` is retained. Simulation reports attempted/completed/unresolved counts and sets every paired EV metric to null whenever a cell has unresolved trials. It neither substitutes model10 nor reports survivor-only EV. Invalid numeric contracts, underflow and other errors remain failures.
- A completed single trial has a mean and `sampleCount:1`, but `ci95:null` and `insufficient-samples-for-ci`. Larger-sample intervals are normal-approximation diagnostics, not acceptance evidence.
- Every output carries the execution identity, immutable belief, original envelope provenance and exact plan identity. Model11 model identity remains separate from the saved policies' model10 authoring provenance. No envelope or acceptance status is relabeled.

## Explicit entry paths

1. `execution-model11.mjs`: candidate law/range/sample and separate actual-reference sample.
2. `simulation-model11.mjs`: actual candidate-versus-reference engine execution. Baseline remains the unchanged reference `playHand`. Deal seed/order, runout sampling, 24 random values, settlement and full action order are inherited. Explicit profiles/heroes allow a single paired trial before larger resource studies.
3. `balance-model11.mjs`: complete positive-own-reach action/tier/support summaries for requested prefixes; optional per-combo laws and both full realization vectors. These are not joint public probabilities or blocker-conditioned hero posteriors. Typed off-model rows remain in coverage.
4. `auditModel11Boards`: routes each declared board/prefix plan through that identical summary. It rejects duplicate physical prefixes and requests attached to the wrong flop. No implicit 1,755-board, all-history or later-runout coverage is claimed.
5. `evaluate-model11.mjs`: reads explicit envelope paths and a mode-specific plan, writes only a new `--output` path with exclusive creation. Modes are `simulation`, `balance`, `boards`. This is the minimal actual evaluation entry for an existing authored candidate or an explicitly prepared revision.

Existing `generate` / `generateLater` still create saved policy bytes using their unchanged model10 guidance. `model11AuthoringPrompt` exports a separately hashed prompt with effective-history and fixed-belief guidance; it does not invoke generation or save new policy envelopes. A future authoring/revision workflow must explicitly preserve its new prompt provenance and submit its artifact pair to `evaluateModel11`; an exported prompt alone does not complete that workflow.

## Consumers deliberately outside this checkpoint

- Range and deterministic views must obtain combo laws and own-realization weights through this same request contract before adoption. They must preserve physical pooling and zero-reach semantics rather than render model10 values with a model11 label.
- Agent currently filters actions/order and supports profile overrides. It requires an independently reviewed full-order adapter, or a separately versioned filtered-order law. Its current overrides cannot enter the balanced belief.
- UI facts need effective-prefix context for reached equity, cap provenance, defence and blocker explanations. Current model10 facts are not reused under a model11 label.
- Flop bases, later caches, worker envelopes and database identities need model identity, belief identity, action-order/sampler contract, both artifact hashes, full public-prefix/reveal identity and numerical schedule. Model10 cached results cannot be relabeled. Cache lifetime can alter work only; global-table RSS behavior still needs measurement.
- MW3 typed common-core migration is independent. These fixed `.mjs` modules may be merged semantically only after separate equivalence proof.

## Next small scope: bridge the existing quality gates without weakening them

1. Keep existing `balance.mjs` aggregation, findings and thresholds. Introduce a limited optional factory injection with the unchanged default. Supply a model11 request-only facade for the four strategy-dependent surfaces: `context`, `rangeItems`, `observableMix`, `requirement`. The context/requirement outputs must derive from effective opponent support, current geometry and the same capped law; do not fake non-null contexts just to retain rows.
2. Retain exact representative path/runout selection, canonical physical deduplication, base-unreachable proofs and per-street coverage. Preserve all balance checks: required authored line/texture overrides (`error`); copied OOP/IP fallbacks; monster checking (5% range / 8% checks), non-monster raises (3% frequency / 3% non-monster), river air/size difference (15 points, 5% underbluff-frequency condition), overfold (15 points under MDF), and non-monster overcall with its existing dynamic allowance. Re-derive only their strategy-dependent quantities from the model11 law, not different thresholds. A typed off-model path must be an explicit unresolved gate blocker, never an inherited null/skip.
3. Provide a model11 representative audit with exact 12-board × 3-profile × 2-seat cells (72 minus proved-unreachable cells), 10,000 paired trials per cell, unchanged seed/deal/reference baseline and expanded policy legality checks. Require all attempted trials resolved. Preserve below-reference warnings and independently repeat deterministic numerical outputs. Exclude elapsed/RSS/cache-work telemetry from deterministic equality; hash the numerical payload separately. Preserve reference-versus-reference zero-drift sanity.
4. Provide a separately versioned model11 all-board identity and all-1,755-flop, all-street audit using the same balance facade. Preserve zero-error requirement, warnings, requested/evaluated/proved-unreachable counts, four representative turns and three rivers per turn, all existing path coverage, per-board immutable checkpoints and final completeness checks. Include off-model counts explicitly; no `errors:0` result is sufficient if unresolved coverage remains.
5. Keep model10 report/acceptance loaders strict. The new representative/all-board acceptance contract, source graph, artifact identities, replay receipts and independent review must be separately versioned before publication or candidate acceptance. Existing 1/407 and original45 remain untouched.

## Fresh tests and bounded first measurements

The ten exact original envelopes are selected by `tests/fixtures/model11-execution-artifacts.json` (444,714 bytes total). Eight are the six-real-case sources; two are the BTN witness pair. They are ignored local inputs, copied without mutation from the recovered worktree. The new helper verifies file size/SHA256 before using each envelope. Source bundles do not contain ignored inputs; preserve/restore the matching fixture archive too.

`postflop-model11-execution.test.mjs` has independent selectors for contract rejection/one-sample CI, unchanged reference labels including real aliases, computed-call sampling→next-prefix realization, hidden-deal/profile isolation, balance/board summary parity, forced off-model actual hand plus non-vacuous incomplete-report nulling, cache-policy parity, six fresh full current-prefix tiny controls, and one recreated above-ratio positive-reroute control. Tiny controls compare every eager current law including base-supported zero-own-reach combos and both full vectors. They do not replace the separate post-allin unavailable-equity/sign and terminal-call controls. Positive reroute requires strictly positive realized source allin mass, checks reroute then per-label cap/passive transfer then declared pooling, full eager laws and both vectors. It does not target a lost historical numeric value or cover the within-limit medium-tier branch.

Run only one process at a time after the parent schedules the shared Node lane. From `apps/frontend`, the first cheap contract selector is:

```sh
timeout -k 5s 60s node --max-old-space-size=512 --test --test-name-pattern='^model11 adapter contracts ' tests/postflop-model11-execution.test.mjs
```

First actual single-paired-trial feasibility command (new output directory must already exist):

```sh
timeout -k 5s 180s node --max-old-space-size=512 scripts/postflop-ai/evaluate-model11.mjs \
  --spot BTN_open_SB_3bet_BB_call_BTN_fold \
  --flop .local/postflop-ai/btn-open-sb-3bet-bb-call-btn-fold-hu-v1-policy.json \
  --later .local/postflop-ai/btn-open-sb-3bet-bb-call-btn-fold-hu-v1-later-policy.json \
  --plan tests/fixtures/model11-one-trial-plan.json \
  --output .local/hu-model11-execution-runs/one-trial.json
```

Use `model11-one-prefix-plan.json` or `model11-one-board-plan.json` with the identical CLI to exercise the numerical summaries, each as its own bounded run and new output path. Each is one requested prefix, not full balance coverage.

Focused controls, one selector per process/receipt:

```sh
MODEL11_EVIDENCE_DIR=.local/hu-model11-execution-runs/factor timeout -k 5s 180s node --max-old-space-size=512 --test --test-name-pattern='^model11 actual sampling ' tests/postflop-model11-execution.test.mjs
MODEL11_EVIDENCE_DIR=.local/hu-model11-execution-runs/tiny-1 timeout -k 5s 180s node --max-old-space-size=512 --test --test-name-pattern='^fresh adapter tiny case 1 ' tests/postflop-model11-execution.test.mjs
MODEL11_EVIDENCE_DIR=.local/hu-model11-execution-runs/reroute timeout -k 5s 180s node --max-old-space-size=512 --test --test-name-pattern='^fresh positive reroute ratio ' tests/postflop-model11-execution.test.mjs
```

Initial resource envelope: one Node process, 512 MiB V8 old heap, 60 seconds for source-contract checks and 180 seconds per numerical diagnostic. RSS is not bounded by the V8 heap limit; the source/dataset graph, typed arrays and shared rank tables count separately. Full base-support canonical priming occurs at facing prefixes, so cost does not scale only with simulated hands. Record source/fixture hashes, stdout/stderr hashes, exit/timeout status, elapsed time, RSS, builds/cache statistics and attempted/completed/off-model counts. Expected runtime/RSS are currently unknown. Inspect the first result before choosing further cases or a larger batch. Do not infer 72×10,000 or 1,755-board feasibility from this checkpoint.
