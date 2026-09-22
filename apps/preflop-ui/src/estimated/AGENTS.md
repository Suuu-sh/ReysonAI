# Confirmed scope (2026-09-22)

The user confirmed a single JSON estimated-range screen, with no API-view switch or JSON-download button. Use the persisted dataset directly, not an API-error fallback. Preserve the black/pink styling, selected-hand breakdown, and raise/call/fold order. Show non-GTO status and unspecified rake in metadata, not a separate warning banner.

`preflop-ranges.json` is the persisted source of truth for all 15 response spots and 2,535 estimates. `opening-ranges.json` adds 5 RFI spots (UTG/HJ/CO/BTN/SB), 845 records, at 100BB and 2.5BB. Display persisted values and reasons exactly; do not generate frequencies at runtime or synthesize EV. UTG can be the opening Hero, but cannot respond to a prior opener. BB cannot open an unopened pot. SB RFI is simplified to raise-or-fold without limping. Keep historical SDK estimates separate from these datasets.

The range selection bar should expose the available dataset dimensions (spot type, effective stack, open size, opener, and Hero). Keep unavailable values visible but disabled so the limits of the persisted data are discoverable without allowing invalid selections.
