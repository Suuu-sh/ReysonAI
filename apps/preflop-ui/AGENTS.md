# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Current visual and data source
- Use the user's 2026-09-22 black/pink SolveaGTO image as visual direction, not the earlier GTOWizard screenshot.
- The default AI Estimated view may use the deterministic provider output from the shared TypeScript range provider. BTN Open and BB response data are explicit structured per-hand answers for this milestone; show the selected hand's beginner-friendly reason in a separate block. The saved-Solution view must display only saved API results and never substitute mock strategies on missing data or failure.
- Keep the AI Estimated / unverified-GTO warning visible for AI-generated ranges and provisional saved solutions.
- No postflop, billing, or on-demand solve controls in this milestone.
- Prefer a compact desktop layout fitting the default results view within one screen (verified at 1280×720); keep dense Combo tables internally scrollable and never hide the experimental warning.
- Keep the primary sidebar centered on `プリフロップ`. Future product areas may appear as clearly disabled `準備中` placeholders, while hand details and calculation metadata remain out of the top-level navigation.

## Durable UI feedback
- Range-table action colors must keep `raise` and `call` visually distinct; avoid assigning both actions near-identical pink hues.
