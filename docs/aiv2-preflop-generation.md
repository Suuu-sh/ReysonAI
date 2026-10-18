# Local AIv2 preflop candidate generation

**Never publishes or overwrites reviewed AI/GTO.** GPT-6.1 Sol / medium,
authenticated local Codex only, four concurrent ready DAG nodes/provider calls.
No alternate model, API-key reading or separately billed API fallback.

## Exact restart and progress

Run from the same local checkout/cache:

```sh
cd /Users/yota/Projects/Products/ReysonAI/apps/frontend
node scripts/generate-aiv2-preflop.ts --all --confirm-full-quota --concurrency=4 --adopt-identical-prompts --refresh-changed-prompts --resume-verified-complete --migrate-compatible-v4 --retry-failed
```

Check before starting; **do not start a duplicate process**:

```sh
cd /Users/yota/Projects/Products/ReysonAI/apps/frontend
node scripts/generate-aiv2-preflop.ts --status --compact
```

- `generated_completed / generated_total`: actionable policies only (target 2,100).
- `remaining_actionable`: includes failed, running and unattempted policies.
- `compatible_migrated_completed` versus `native_generated_completed`: explicit provenance.
- `placeholders_completed / placeholders_total`: 16 structural unreachable placeholders, never generated-policy progress.
- Legacy `completed` includes placeholders; do not report it as generated policies.
- Each node exposes its current phase and phase states. Invalid responses retain only response hashes and structural field/count/length diagnostics.
- Quota/auth/model-capability failures stop new work and drain in-flight calls; successful phases persist. Individual validation failures block descendants, not independent nodes.

The local process writes its log to
`apps/frontend/.local/aiv2-preflop/llm-range-wide-combo-v5/all-run.log`.
It is a non-TTY app-owned process, not a foreground browser task. Do not alter system sleep settings or create another runner. Keep the app/computer available.

## Domain and real histories

13 base and 28 villain-profile tables: 2,100 actionable nodes plus 16 placeholders.
The v5 graph has 16,538 source-backed edges. Complete chronological actor/action/
raise-to history is passed to each model phase and retained in each candidate.
Intervening folds are resolved to their actual matching conditional decision
when that table exists. Profile predecessors are explicitly profile/base namespaced.
Source existence, exact prefix, seat, legal action, size and acyclicity are checked
before calls. Genuine semantic aliases reuse policy; no artificial aliases are forced.

**Remaining modeled boundary:** 1,040 unresolved fold-event occurrences across
756 table nodes correspond to 51 distinct decision states absent from the catalog.
Those events remain explicit `source:null` structural assumptions, never invented
100% or model-generated policies. See `history-assumptions.json` in the candidate
directory. Full table coverage is not proof those auxiliary decisions were solved.
Per-player conditional action products are not an exact card-removal-conditioned
joint deal distribution; never multiply another player's same-combo action frequency
into the hero's reach or call this solver/GTO equilibrium.

## Persisted phases and independent estimates

Each actionable node has four separate validated checkpoints:
1. Whole-range analysis.
2. New 169-class/1,326-physical-combo candidate policy.
3. Strategic reevaluation using actual own-reach/combo-weighted candidate aggregates.
4. Post-final English reasons and faithful Japanese translations in the same response.

Analysis output uses a strict JSON schema retaining the existing compact limits:
summary <=500 characters, 1..8 themes <=180 characters, <=12 concrete blocker notes.
Up to three attempts use precise structural validation feedback; constraints are
not loosened. Other phases retain bounded schema retries. No legacy frequencies,
reasons, EV/equities or solver claims are supplied as generation targets.

Candidate files are under:
`apps/frontend/candidates/aiv2-preflop/llm-range-wide-combo-v5`.
Compact output stores new 169-class rows, concrete exceptions, per-seat reach and
bilingual reasons—not 1,326 repeated rows. Files are candidates, not selectable production data.

Checkpoints are local under:
`apps/frontend/.local/aiv2-preflop/llm-range-wide-combo-v5/all-checkpoints`.
Preserve this ignored directory for exact local resume; a fresh Git clone alone
does not contain all intermediate analysis/candidate checkpoints.

## Cache identity and v4 archive

Prompt/context/model/effort/version and implementation hashes lock phase identity.
`--adopt-identical-prompts` permits only the same model/effort/method and identical
base prompt, retaining prior identity. `--refresh-changed-prompts` archives changed
checkpoints and actually regenerates their phases. Successful v5 replay checks all
four prompts/results, final rows and reach before preserving original source identity.

The old v4 run is superseded and retained as an isolated archive. Of its 56 complete
new-model candidates, 55 require regeneration with explicit full histories.
Only empty-history base UTG may migrate, and only when all four prompts/results
replay exactly. Original v4 generation provenance remains explicit; it is not
reported as a fresh v5 model call. The old GPT-6 Sol sample is not part of this cache.

A running progress snapshot is not full completion. Final per-table files and
global coverage/upstream/semantic equality audit are written only after every
required node passes. Completion remains an estimated candidate, not deployment,
independent validation, measured EV or solver/GTO certification.
