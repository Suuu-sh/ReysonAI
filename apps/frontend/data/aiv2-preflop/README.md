# AIv2 preflop samples

This directory contains the Git-managed, non-production AIv2 sample catalog. It currently contains **only** `opening-ranges/UTG_open.json`: 169 hand classes and 1,326 concrete two-card combos. Its presence does not mean that the remaining positions/spots are available or approved.

## UTG_open provenance

- Method: `llm-range-wide-combo-v3`; model: `gpt-6-sol`; reasoning effort: `high`.
- Strategy frequencies and combo mixes come from the saved sample identified by `metadata.final_hash`, `metadata.source_hash`, and `metadata.analysis_hash`. English hand reasons were generated after the finalized frequencies (`reason_generated_after_finalization: true`).
- The Japanese `text_ja` values were backfilled locally as translations of the saved English `text`; they were **not** generated simultaneously with the English reasons. `metadata.reason_localization` records this distinction. English text and strategy were preserved.
- This is a local AI estimate, not GTO/solver output. It has not passed the independent data review required for production and must not be used to enable the AIv2 production catalog.

## Source and runtime

- Generation prompt and checkpoint handling: `apps/frontend/scripts/generate-aiv2-preflop.ts`.
- Range/reason schema validation: `apps/frontend/scripts/aiv2-preflop.ts`.
- Local preview route: `apps/frontend/scripts/local-datasets.ts`; it reads this fixed tracked path so a fresh checkout does not depend on ignored `.local` files.
- The ignored `.local/aiv2-preflop/` directory remains resumable authoring state; it is not the preview source of truth and is not copied to this directory automatically.

## Extending the sample catalog

For each additional spot, save its complete final range and concrete combo data under the matching dataset path here. Generate the English and Japanese reasons together in one Phase 4 JSON response (`text` and `text_ja` for every hand and combo reason), validate both, and preserve method/model/prompt/final hashes. Do not alter finalized frequencies to write translations. For older English-only reason checkpoints, the prompt hash/schema change refreshes only the reason phase; it does not rerun the strategy. Add explicit provenance if any existing English reason is translated afterward.

Adding a file here only expands the local sample catalog after the fixed preview loader and tests are intentionally updated. Do not treat sample coverage as production approval or publish it into `src/estimated/aiv2` without its separate review gates.
