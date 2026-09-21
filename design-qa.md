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

## Compact layout follow-up
- Scope: density/one-screen adjustment, not a new full reference-image sign-off.
- In-app browser verified at 1280×720 after reducing sidebar, header, settings, panel and row spacing.
- DOM measurements: document 1280×720; results clientHeight/scrollHeight 415/415; matrix scroll region 327/327.
- Screenshot inspected: all 13 matrix rows, both summary cards, both hand-detail cards, warning and footer visible simultaneously.
- Combo EV tab: results remain 415/415; table clientHeight/scrollHeight 144/195, scroll confined to table.
- Returned preview to Results tab.
- Compact-layout acceptance: passed. Original exact-reference fidelity sign-off remains outside this follow-up.
