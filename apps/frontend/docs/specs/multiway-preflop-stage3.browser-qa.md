# Stage 3 browser acceptance procedure

Status: prepared, not yet executed against the final Stage 3 revision. Record the exact commit, browser, date, result and screenshot locations below after the run. A passing mounted/SSR test is not a substitute for this browser check.

## Environment

Use the authorized isolated checkout, not another task's working folder. Restore the saved Stage 2 and Stage 3 archives with their read-only restore commands. The Stage 3 LFS payload must be present and match the approved receipt before testing. Do not generate strategies on this machine or edit expanded JSON.

Start the normal Vite development server with an empty `VITE_API_BASE` so its existing same-origin `/v1/preflop/datasets` middleware reads this exact checkout. Do not point a pre-release Stage 3 client at production data or import production D1. Use an available local port and the browser authorized for this task. A blocked browser security/access route must not be bypassed.

## Required Stage 1/2 path

1. Open `/analyze/ranges`, reset the range selection, and use the default cash six-max 100BB format and default opponent profile.
2. Choose UTG open to 2.5BB, HJ call to 2.5BB, CO call to 2.5BB, then BTN squeeze to 14.5BB.
3. Leave SB and BB at their explicit default folds. They are additional-entrant choices in Stage 3, so do not accidentally choose one for this Stage 1/2 check.
4. At UTG's response, verify the saved decision is `sq2_UTGo2p5_HJc2p5_COc2p5_BTNs14p5_SBf_BBf__to_UTG`. Four live participant tables should be visible: UTG, HJ, CO and BTN. Select AA; the saved UTG mix is 25% call / 75% four-bet to 30BB. If this opens the focused hand-detail view, close that detail to return to the synchronized participant comparison before taking the screenshot.
5. Choose UTG four-bet to 30BB. Verify the next actor is HJ, the pot is 51BB, and the options are fold, call to 30BB or all-in to 100BB. The exact saved decision is `sq2_UTGo2p5_HJc2p5_COc2p5_BTNs14p5_SBf_BBf__UTGr30__to_HJ`. Its AA mix is 30% call / 70% all-in. All four participant tables remain available and the selected hand is synchronized.
6. Save a screenshot containing the complete action path, HJ response and participant tables. Copy the actual browser URL, reload it, and verify the same actor, sizes, path and selected hand are restored after source loading.
7. Rewind to UTG's response and select call instead. Confirm the old four-bet and its downstream choices disappear. Reset and verify the complete history clears.

## Stage 3-specific checks

After the final candidate is installed, select a saved additional-entrant root from the complete coverage report. Record its exact root and decision IDs rather than substituting a different history. Check call/raise, all current participant tables, rewind/reset, URL reload, and an absent-source retry.

For a three-caller rare root, choose UTG open, HJ call, CO call, BTN call, then inspect SB. The UI must say that the whole-history reach upper bound is below 0.01%, expose no invented strategy, and offer no local-generation replacement. Recheck that state in Japanese, English, Simplified Chinese and Spanish.

Any unsupported Stage 3 postflop terminal must remain unavailable; it must not load a policy belonging to an existing Stage 2/HU history.

## Result record

- Commit: pending
- Browser and environment: pending
- Required path and screenshots: pending
- Stage 3 saved root and IDs: pending
- Reload/rewind/reset/missing-data/language checks: pending
- Failures and fixes: pending
