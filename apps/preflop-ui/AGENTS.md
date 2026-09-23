# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Current visual and data source
- Use the current black/pink SolveaAI branding direction, not the earlier GTOWizard screenshot.
- The single Estimated Range view must load only the persisted JSON datasets under `src/estimated/preflop-ranges.json` (responses), `src/estimated/opening-ranges.json` (RFI), `src/estimated/three-bet-responses.json` (original opener facing a 3bet), and `src/estimated/four-bet-responses.json` (original 3bettor facing the opener’s 4bet). Switch spot type within this view. Do not render a separate saved-range or API view, and never substitute client-generated provider output or mock strategies when a dataset is missing or invalid.
- Keep the estimated-range status visible in the page metadata, but do not add a separate warning banner above the range.
- No postflop, billing, or on-demand solver controls in this milestone. This does not prohibit the specifically user-approved local Codex AI-estimate buttons for missing multiway and post-5bet response ranges; those are experimental estimates, not solver jobs, and must remain explicit-click, local-only controls inside the missing participant range panel as defined in `src/estimated/AGENTS.md`.
- Prefer a compact desktop layout fitting the default results view within one screen (verified at 1280×720); keep dense Combo tables internally scrollable and never hide the experimental warning.
- Keep primary navigation in a collapsible left sidebar, with `プリフロップ` clearly marked as active. Future product areas may appear as clearly disabled `準備中` placeholders, while hand details and calculation metadata remain out of the top-level navigation.

## Durable UI feedback
- On 2026-09-23 the user requested that unsupported branches show their missing-range state inside the participant's range-table slot, not as a separate full-width notice above the tables. Keep other participants' relevant decision ranges visible where available.
- On 2026-09-23 the user asked to move the top navigation into a collapsible sidebar. Keep the expanded desktop sidebar labeled, and retain an icon-only rail with accessible labels when collapsed; default it to collapsed on narrower screens.
- On 2026-09-23 the user asked for a reset control and a shorter, more compact expanded action selector. Reset returns to the default BTN-open / BB-response setup, clears calls/folds and reopened actions, closes hand detail, and preserves whether the selector is expanded. Lay out action choices horizontally when space permits instead of giving each seat a tall vertical stack.
- On 2026-09-23 the user said the generic “Take action” control is redundant when the concrete action buttons are available. Do not show that label; use the seat name to select the response position.
- On 2026-09-23 the user requested range tables for every still-participating position at every stage. Show them side by side while no detail is focused, remove folded positions, and let a hand selection prioritize that position's table plus its detail. A clear close control must restore all participant tables. For a later betting stage without a stored range, label any earlier displayed table as historical rather than presenting its frequencies as a current response.
- On 2026-09-23 the user clarified that a reopened action must append a new position block after BB, not overwrite the opener's original block. The appended opener block must offer working Fold / Call / 4bet choices after a 3bet, and later responses append in chronological order.
- On 2026-09-23 the user replaced the redundant spot/stack/open-size dropdown row with a seat-driven action path. Keep fixed 100BB/2.5BB assumptions in metadata; let position blocks navigate saved open → response → 3bet response → 4bet response, show 5bet all-in and unsupported continuations as explicitly pending, and do not render a separate follow-up row.
- On 2026-09-23 the user required action-path sizes and chronology to match the selected preflop history. After an open, never present another seat's 2.5BB raise as a current response; distinguish changing the opener from facing the open, and use persisted raise-to sizes for recorded 3bet/4bet history.
- On 2026-09-23 the user chose to show all actions in every range matrix. Do not show a per-action display dropdown; keep all action colors and the legend visible together.
- On 2026-09-23 the user requested a future multiway-estimate path. The selector may record calls and render one column per active participant, removing folded seats. The first caller with no earlier call uses the regular saved open-response range as a historical decision; later callers and the current multiway response remain explicitly pending unless a local estimate is supported. Never reuse heads-up frequencies for those later decisions or synthesize values.
- Show reopened betting as additional position blocks after the six initial seats, in poker action order. Multiway follow-up ranges stay explicitly pending rather than borrowing heads-up frequencies; do not add a separate next-action row.
- On 2026-09-23 the user asked to combine the range settings and seat/action path into one selection surface. Keep it a compact, original SolveaAI-style expandable panel rather than copying GTOWizard's separate cards verbatim.
- On 2026-09-24 the user asked to remove the separate “データの条件” card from hand details and keep the game-format editor and action reset as icon-only controls beside “推定レンジ”. Keep both controls accessible with labels/tooltips.
- On 2026-09-24 the user asked to make the action-path seat cards narrower. Keep them compact (104px desktop / 92px narrow view) while preserving readable action labels and horizontal scrolling for longer paths.
- The 2026-09-23 selection feedback uses a GTOWizard-like horizontal seat/action path: compact summary by default, expandable seat actions, and a highlighted acting seat. Preserve SolveaAI's black/pink visual language and limit choices to persisted estimated-range spots; do not invent strategies.
- Range-table action colors must keep `raise` and `call` visually distinct; avoid assigning both actions near-identical pink hues.
- The Estimated Range view does not need an all-hand action-frequency panel; keep the selected-hand action breakdown instead.
- Range-table action strips should be ordered left to right as all-in, raise, call, then fold.

## Confirmed four-bet response scope (2026-09-23)
- Work directly on `development`; preserve existing changes. The missing repository-root AGENTS.md is replaced by the user-provided session rules, as confirmed by the user.
- All four estimated datasets use 6-max, 100BB, 2.5BB open and ante_bb=0. Existing frequencies are unchanged when normalizing ante metadata.
- The saved JSON sizes take precedence over the different Solver sizing multipliers, as confirmed by the user. The only 5bet branch is existing `all_in`, total 100BB; do not invent a non-all-in 5bet size.
- Keep that action's UI label concise as `5bet 100BB`; do not include “All-in” in the displayed wording.
- Show the original 3bettor as Hero, distinguish it from the opener acting in the 3bet-response view, and keep unreachable 3bet=0 hands visibly non-recommendations without an “対象外” text label inside each matrix cell. Preserve the patterned cell style.
- Missing or malformed four-bet JSON must render an error, not a mock or another strategy. Keep the spot selector usable to recover.
- Run all UI tests (`node --test tests/*.test.mjs`), build and Sites tests; verify the browser and record results in the repository-root design-qa.md.
