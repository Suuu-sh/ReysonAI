# Stage 3 browser acceptance procedure

Status: partially executed on exact head `0d0be207` on 2026-10-05. The required preflop paths passed; the unsupported postflop screen remains NOT RUN. The later typed-development integration has separate source/type/unit evidence and is not represented as a new browser pass. A passing mounted/SSR test is not a substitute for this browser check.

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

## Result record — 2026-10-05

- Commit: `0d0be207c8775e0f1615a9984f308fbf8230932f`.
- Environment: authorized isolated Mac checkout and supported browser control; no production data/authentication. Both reviewed archives were restored and verified before the run.
- Required Stage1/2 path: PASS, including UTG AA 25% call / 75% four-bet, HJ AA 30% call / 70% all-in, pot 51BB, four participant tables, URL reload, rewind to UTG call and reset.
- Saved Stage3 root: `s3_squeeze_extra_UTGo2p5_HJc2p5_COf_BTNf_SBs13_to_BB`. BB entrant call/raise branches, participant comparison, reload/rewind/reset: PASS.
- Rare three-caller root: PASS in Japanese, English, Simplified Chinese and Spanish. Saved-data recovery after one localhost 503: PASS.
- Unsupported Stage3 postflop consumer: NOT RUN. Enter flop reached the Guest sign-in gate, so the downstream no-policy screen and absence of a borrowed HU request were not observed. No fake session or authentication bypass was introduced.
- Separate isolated evidence: Stage3 no-HU-fallback test 1/1, learning access 8/8, local-account boundary 3/3; these are not authenticated browser E2E. The representative two-player Stage3 terminal retains CO/BTN with `pilotAvailable=false` and `spotId=null`.
- Screens were visually inspected. PNG export was denied by browser security, and no alternate route was used; no saved screenshot file is claimed.
- Cleanup: isolated checkout remained clean; only QA-owned servers were stopped. Later continuation is blocked because the existing Mac task no longer exposes supported browser/CUA controls.

The remaining browser case must be observed in a supported test environment before calling browser acceptance complete. No credentials were created, accessed or requested for this report.
