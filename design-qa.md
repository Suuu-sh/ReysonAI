# Design QA — API Explorer (2026-09-22)

Reference: /Users/yota/Downloads/0e138cf6-b544-4566-b692-af5731915919.png

Replaces the previous report, whose mock-data and completed-QA claims are no longer applicable.

## Verified
- Vite production build and Sites packaging tests pass.
- Rust workspace tests pass; new solution-scoped API isolation test passes.
- Three UI data tests pass (169 labels, combo-weighted aggregates, no synthetic empty values).
- In-app browser: API loading, error/retry recovery, saved 1326 combos / 169 classes.
- Hand selection AA renders 6 actual rows; AKo renders 12 actual rows.
- At 319 CSS px, document width is 319 (no page-level horizontal overflow); matrix and tables scroll locally.
- Real source is a locally saved one-iteration experimental worker result, not competitor data.
- Black/pink palette, navigation, settings, matrix and detail panels implemented.

## Intentional scope differences from source
- Only preflop and saved results; no solve-on-request, billing or unavailable navigation.
- Experimental warning is always present; no made-up equity, recommended actions or percentages.
- Matrix uses frequency strips rather than painting all cells.
- Source's BTN opening strategy is unavailable in the existing tree; UI displays only existing nodes.

## Remaining verification
- Desktop 1536x1024 paired visual comparison was not completed in the available narrow in-app viewport.
- No claim of full screenshot fidelity or completed design sign-off.
- Large-file server reads remain a backend performance limitation.

final result: blocked (desktop paired visual verification outstanding)
