# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Current visual and data source
- Use the user's 2026-09-22 black/pink SolveaGTO image as visual direction, not the earlier GTOWizard screenshot.
- The single Estimated Range view must load only the persisted JSON datasets under `src/estimated/preflop-ranges.json` (responses), `src/estimated/opening-ranges.json` (RFI), `src/estimated/three-bet-responses.json` (original opener facing a 3bet), and `src/estimated/four-bet-responses.json` (original 3bettor facing the opener’s 4bet). Switch spot type within this view. Do not render a separate saved-range or API view, and never substitute client-generated provider output or mock strategies when a dataset is missing or invalid.
- Keep the estimated-range status visible in the page metadata, but do not add a separate warning banner above the range.
- No postflop, billing, or on-demand solve controls in this milestone.
- Prefer a compact desktop layout fitting the default results view within one screen (verified at 1280×720); keep dense Combo tables internally scrollable and never hide the experimental warning.
- Keep the primary navigation in the top header with `プリフロップ` centered as the active area. Future product areas may appear as clearly disabled `準備中` placeholders, while hand details and calculation metadata remain out of the top-level navigation.

## Durable UI feedback
- On 2026-09-23 the user asked to combine the range settings and seat/action path into one selection surface. Keep it a compact, original SolveaGTO-style expandable panel rather than copying GTOWizard's separate cards verbatim.
- The 2026-09-23 selection feedback uses a GTOWizard-like horizontal seat/action path: compact summary by default, expandable seat actions, and a highlighted acting seat. Preserve SolveaGTO's black/pink visual language and limit choices to persisted estimated-range spots; do not invent strategies.
- Range-table action colors must keep `raise` and `call` visually distinct; avoid assigning both actions near-identical pink hues.
- The Estimated Range view does not need an all-hand action-frequency panel; keep the selected-hand action breakdown instead.
- Range-table action strips should be ordered left to right as all-in, raise, call, then fold.

## Confirmed four-bet response scope (2026-09-23)
- Work directly on `development`; preserve existing changes. The missing repository-root AGENTS.md is replaced by the user-provided session rules, as confirmed by the user.
- All four estimated datasets use 6-max, 100BB, 2.5BB open and ante_bb=0. Existing frequencies are unchanged when normalizing ante metadata.
- The saved JSON sizes take precedence over the different Solver sizing multipliers, as confirmed by the user. The only 5bet branch is existing `all_in`, total 100BB; do not invent a non-all-in 5bet size.
- Show the original 3bettor as Hero, distinguish it from the opener acting in the 3bet-response view, and keep unreachable 3bet=0 hands visibly non-recommendations.
- Missing or malformed four-bet JSON must render an error, not a mock or another strategy. Keep the spot selector usable to recover.
- Run all UI tests (`node --test tests/*.test.mjs`), build and Sites tests; verify the browser and record results in the repository-root design-qa.md.
