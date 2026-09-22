# Confirmed scope (2026-09-22)

The user explicitly approved adding a separate JSON estimated-range screen while preserving the existing API-only screen and its uncommitted changes. This supersedes the earlier single-view restriction for this addition. Never use this JSON as an automatic fallback for API errors. Preserve the black/pink styling, selected-hand breakdown, and raise/call/fold order. Show non-GTO status and unspecified rake in metadata, not a separate warning banner.

`preflop-ranges.json` is the persisted source of truth for all 15 response spots and 2,535 estimates. Display its values and reasons exactly; do not generate frequencies at runtime or synthesize EV. UTG is only an opener in this response-only scope. Keep historical SDK estimates separate from this dataset.
