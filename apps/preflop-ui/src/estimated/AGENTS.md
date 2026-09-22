# Confirmed scope (2026-09-22)

The user confirmed a single JSON estimated-range screen, with no API-view switch or JSON-download button. Use the persisted dataset directly, not an API-error fallback. Preserve the black/pink styling, selected-hand breakdown, and raise/call/fold order. Show non-GTO status and unspecified rake in metadata, not a separate warning banner.

`preflop-ranges.json` is the persisted source of truth for all 15 response spots and 2,535 estimates. `opening-ranges.json` adds 5 RFI spots (UTG/HJ/CO/BTN/SB), 845 records, at 100BB and 2.5BB. Display persisted values and reasons exactly; do not generate frequencies at runtime or synthesize EV. UTG can be the opening Hero, but cannot respond to a prior opener. BB cannot open an unopened pot. SB RFI is simplified to raise-or-fold without limping. Keep historical SDK estimates separate from these datasets.

`three-bet-responses.json` contains all 15 original-opener responses to a later player's 3bet (2,535 records). Here Hero is the original opener, and the other seat is explicitly labeled 3bettor. Show fold/call/four_bet and the raise-to 4bet size. The received 3bet size must match the corresponding persisted response spot. Rows with zero RFI frequency are unreachable in this path and explicitly labeled as such (fold=100 placeholders, not real recommendations). These are independently authored estimates, not a jointly solved strategy. Cold 4bets, squeezes and responses to 4bets remain out of scope.

The range selection bar should expose the available dataset dimensions (spot type, effective stack, open size, opener, and Hero). Keep unavailable values visible but disabled so the limits of the persisted data are discoverable without allowing invalid selections.

For responses to an open, show the opener's persisted RFI range on the left and Hero's response range on the right. Synchronize selected hands for comparison, keep action filters independent, and keep Hero details in an expandable section below the matrices (with selected-hand frequencies always visible in its summary). On narrow screens stack opener before Hero. The opening-only view remains a single matrix.
