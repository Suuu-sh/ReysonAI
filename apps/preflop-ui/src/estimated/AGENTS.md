# Confirmed scope (2026-09-22)

The user confirmed a single JSON estimated-range screen, with no API-view switch or JSON-download button. Use the persisted dataset directly, not an API-error fallback. Preserve the black/pink styling, selected-hand breakdown, and raise/call/fold order. Show non-GTO status and unspecified rake in metadata, not a separate warning banner.

`preflop-ranges.json` is the persisted source of truth for all 15 response spots and 2,535 estimates. Display its values and reasons exactly; do not generate frequencies at runtime or synthesize EV. UTG is only an opener in this response-only scope. Keep historical SDK estimates separate from this dataset.

The range selection bar should expose the available dataset dimensions (spot type, effective stack, open size, opener, and Hero). Keep unavailable values visible but disabled so the limits of the persisted data are discoverable without allowing invalid selections.
