# Design QA — Persisted Estimated Ranges (2026-09-23)

## Remove redundant weakness tab (2026-09-27)
- Removed the dedicated 弱点 item from the sidebar. Strengths and weaknesses remain in プレー分析, and its existing detail link still opens the detailed review screen.
- Browser verification at `http://127.0.0.1:5174/app`: the sidebar shows レンジ分析 / トレーナー / セッション / プレー分析 without 弱点; プレー分析 → 弱点の詳細を見る still opens the review details. All 212 UI tests, typecheck, build, 4 Sites tests and lint passed. The existing large-chunk build warning remains.

## Practice sessions and hand history (2026-09-27)
- Added a セッション destination with a dated practice list, status filtering, and a detail view of the exact saved answer log. In-progress sessions can be resumed; completed named drills and review attempts keep their hand logs locally. Existing summary-only attempts explicitly say their per-hand history was not recorded.
- Browser verification at `http://127.0.0.1:5174/app`: opened an interrupted one-answer session, saw its saved Q5o hand and verdict, resumed it, finished it, and confirmed the completed hand history remained after reloading. The narrow viewport stayed readable with horizontal scrolling for the table.
- All UI tests, typecheck, production build, Sites tests, and lint passed. The existing Vite large-chunk warning remains.

## ReysonAI Score trend (2026-09-27)
- Added a compact policy-alignment card below the existing four-quadrant map. Each practice answer is compared with the saved AI estimate for the same preflop spot/hand; a 10-answer rolling mean makes progress visible without calling it a GTO score or EV loss.
- Checked the running `/app` at the current narrow viewport with 31 locally saved answers: the card showed 91%, its trend line and explanatory limits without horizontal overflow. Targeted and full UI tests, typecheck, production build, and Sites tests passed. The existing large-chunk warning remains.

## Practice style map (2026-09-27)
- Added the requested 2×2 TAG/LAG/tight-passive/loose-passive map to プレー分析. A pink point marks the user's saved practice-answer deviations from the same-question AI estimate; a data-waiting state avoids inventing a position before enough answers exist.
- Checked the running app with 30 distinct answered questions: the point appears near the baseline centre, matching the current 「基準に近い」 label. The chart states that these are preflop practice tendencies rather than real-play VPIP/PFR.

## Practice player analysis (2026-09-27)
- Added a separate プレー分析 destination alongside トレーナー. It compares each chosen action with the saved AI estimate for the exact sampled spot/hand, deduplicates review repeats, and waits for diverse evidence before showing tentative NIT/TAG/LAG-style labels.
- Verified the empty state and its drill-library link in the running app. The page explicitly limits claims to practice choices rather than real-play VPIP/PFR or GTO; all answer history stays local to the browser.

## Unified range-navigation label (2026-09-27)
- Renamed the shared preflop/postflop workspace destination to `レンジ分析`, and changed its browser title to the street-neutral `Range Analysis`. The route and action-path flow are unchanged.
- Expanded sidebar checked in the running app: `レンジ分析` is visible and active. Verification passed: 191 app tests, typecheck, production build, and 4 Sites tests; the existing large-bundle warning remains.

## Short postflop EV status (2026-09-26)
- Removed the long EV/EQR/self-play explanation beneath the postflop action bars. The calculation and values are unchanged; a short visible `AI推定・未検証` label preserves the experimental status.
- Browser check: expanded AKo on a representative flop shows the short label and no old paragraph. All 177 UI/data tests, typecheck, build, and 4 Sites tests passed; the existing bundle-size warning remains.

## Preflop EV notation aligned with the flop detail (2026-09-26)
- BB vs BTN AKo was checked in the running `/app` view. Its saved assumed EQR, raw win rate, and model call EV now appear in a compact summary; the call row shows the signed EV at the right, while raise/fold show `—` because their EVs were not computed.
- The AI reason remains visible below the action bars without repeating the call-EV fact. RFI and missing-EV paths retain frequency-only bars; no policy-average or best-action claim was added.
- Verification: 177 UI/data tests, typecheck, production build, and 4 Sites tests passed. The existing large-chunk build warning remains.

## ReysonAI brand rename (2026-09-23)
- Updated the UI wordmark/title, SDK exports and package paths, Rust crate/binary identifiers, environment-variable prefix, storage/queue keys, deployment resources, scripts, tests and documentation.
- Kept GTO terminology where it describes poker methodology or validation status. The project folder, Git remote and externally provisioned resources were not renamed or migrated.
- Verification: 47 UI tests, production build, 4 Sites tests, 8 SDK tests, 5 Edge API tests, Rust workspace tests and API-job / solution-promotion E2E checks passed. The build still reports the existing large-bundle warning.

## Remove redundant “Take action” control (2026-09-23)
- Removed the generic action placeholder from the seat choices and pending summaries. The seat name remains the control for switching the response position; Fold, Call, and raise buttons remain the available actions.
- Verification: all 51 UI tests passed, the production build passed, and all 4 Sites tests passed. The build still reports the existing large-bundle warning.

## Remove unreachable-hand cell label (2026-09-23)
- Removed the repeated “対象外” text from unreachable matrix cells while keeping their distinct visual treatment and an explanatory tooltip; the selected-hand detail still explains why no recommendation is shown.
- Browser check: in the 4bet-response view, the K8o cell shows only the hand label; its accessible hint explains that no recommendation is available.
- Verification: all 51 UI tests passed, the production build passed, and all 4 Sites tests passed. The build still reports the existing large-bundle warning.

## 5bet label wording (2026-09-23)
- Changed the visible all-in choice and collapsed summary to `5bet 100BB`; the underlying choice remains the existing 100BB all-in branch.
- Verification: all 50 UI tests passed, the production build passed, and all 4 Sites tests passed. The build still reports the existing large-bundle warning.

## Collapsible navigation sidebar (2026-09-23)
- Replaced the top navigation header with a left sidebar containing the brand, grouped navigation, and explorer metadata. The desktop sidebar can collapse to an icon rail; the toggle and each icon-only destination have accessible labels.
- On narrower screens the sidebar starts collapsed, and expansion overlays the workspace instead of squeezing it. Browser verification covers expanded/collapsed desktop states and the narrow layout.
- Verification: `node --test tests/*.test.mjs` passed all 47 tests; the production build and separate Sites run also passed (4 tests). Build reports the existing large-bundle warning.

## Multiway-ready selection update (2026-09-23)
- Added Call and Fold to response-seat choices. Browser check: BTN opener + SB call + BB acting displayed three participant columns; changing SB back to Fold removed SB and restored the two saved heads-up matrices.
- Each participant starts with a clear pending-data state. On supported paths, a separate user-triggered local AI estimate may be cached outside the persisted datasets; it is unverified and is not a solver/GTO result. No heads-up frequencies are reused for multiway estimates.
- The non-GTO status remains visible. Unsupported paths stay pending; generated local data never overwrites saved heads-up estimates.

## Unified selection panel update (2026-09-23)
- Source: user screenshot showing two disconnected selection surfaces; intended change is one cohesive, expandable ReysonAI panel rather than exact screenshot replication.
- The compact six-seat path remains visible; the top control expands seat choices. Fixed conditions are in metadata, without a duplicate dropdown row.
- Inspected the rendered compact state in the local browser and corrected a narrow-screen toggle overflow. The responsive path remains horizontally scrollable.
- Final result: passed for the requested unified selection surface.

## Seat/action selection update (2026-09-23)
- Replaced the opener/Hero dropdowns with a six-seat action path. The compact path shows actions in one row; the expand control reveals seat choices and highlights the acting seat.
- Seat changes select persisted opener/response combinations; unsupported branches remain pending rather than generating substitute strategy frequencies.
- Local browser verification: the initial BTN → BB path rendered, expansion worked, and selecting UTG raise changed the visible matchup and opener range to UTG vs BB. Narrow viewport keeps the action path horizontally scrollable.
- All 38 UI tests, production build and Sites tests passed. Existing large-bundle warning remains.
- Final result: passed for the supported estimated-range selection scope.

This report supersedes the historical API Explorer/mock-data checks. The current UI uses saved estimated JSON only; API, SDK and Solver remain separate systems.

## Current scope and sources
- Black/pink single estimated-range view with opening, open-response, 3bet-response and 4bet-response selections.
- Four persisted datasets: 5 opening spots plus 15 spots in each response dataset; 8,450 hand records total.
- Four-bet path: opener 2.5BB → later Hero 3bet → opener 4bet → original 3bettor Hero responds. Three-bet response Hero remains the opener.
- Existing JSON controls raise-to sizes, not the separate Solver multipliers. Five-bet is `all_in`, total 100BB only. Ante metadata normalized to zero with user approval.
- Estimates only, with no GTO/EV claim, competitor chart reuse, runtime generation or API fallback.

## Automated verification
- `npm run build` and `npm run test:sites` pass in `apps/frontend`; Sites client/server/hosting outputs are present.
- `node --test tests/*.test.mjs`: 37 tests pass (including Sites tests).
- New data checks cover every one of the 15 spots, IDs, source sizes, 169 unique canonical hands, frequency totals, legal all-in size and zero-3bet reachability.
- Every spot is mutation-tested for malformed sizes/IDs/hands/frequencies, invalid reasons and unreachable continuation. Missing JSON, malformed syntax and corrupted upstream data fail closed.
- Server-rendered UI tests verify Hero roles, sizes, all-in labels and absence of matrix/bars on errors.
- Rust workspace tests, TypeScript SDK tests (8) and Edge API tests (5) pass.

## Browser verification — local app at port 4173
- All 15 opener/Hero combinations selected and checked in the four-bet view; Hero remains the original 3bettor.
- BTN/BB shows 12BB 3bet → 26.5BB 4bet. AKo: all-in 85%, call 15%, fold 0%, total 100BB all-in.
- UTG/HJ shows 8BB → 22BB, AA shows all-in 90%, call 10%.
- Changing opener from UTG with Hero HJ to SB automatically selects the only legal Hero BB; BB opener and earlier Hero seats stay disabled.
- AA (6 combos) and AKo (12 combos) details reflect saved values.
- 72o shows 「対象外（到達不能）」 and its saved explanation; no recommendation bars or fold=100 frequency display. Matrix uses marked/striped cells without action strips.
- Temporarily replaced the new JSON with malformed syntax: explicit error, zero matrices. Then temporarily removed it: explicit 「データなし」 error, zero matrices. The selector still switched to valid 3bet data. Restored the exact saved file and verified normal four-bet display again. No fixture remains in the application.
- Existing opener-range focus and 「両方のレンジを表示」 comparison recovery verified; comparison returns to two matrices.
- Internal screenshot inspected at 1280×720: matrix, selected-hand frequencies, raise-to sizes and non-GTO metadata visible. Longer conditions remain in the existing internally scrollable details column.
- Narrow default in-app viewport inspected: the action path scrolls horizontally, while matrix and stacked detail layout remain usable. Temporary viewport override reset.
- Local server remains running with the four-bet view open for user inspection.

## Boundaries
- No claim of exact reference-image fidelity or GTO strategy quality.
- Vite reports the existing large-bundle warning; build succeeds. All persisted data is bundled, without lazy-loading optimization in this change.
- Non-all-in 5bet, cold 4bet, squeezes, callers, and the opener’s response to a 5bet are out of scope.
## Seat-driven preflop path (2026-09-23)
- Removed the spot, stack and open-size dropdown row; fixed 100BB/2.5BB conditions remain in metadata. The six seat blocks now carry saved 3bet, 4bet and 5bet all-in steps, replacing the separate conditional follow-up row.
- Browser at `http://127.0.0.1:5173/`: BTN open → BB 3bet 12BB → BTN 4bet 26.5BB → BB 5bet all-in 100BB was navigable through the seat blocks. The unsupported post-all-in response displayed a pending state and no range matrix.
- Tests: 45 passed; production build passed. The existing large-bundle warning remains.

## Appended 3bet response block (2026-09-23)
- Reopened betting now appends a new block after BB instead of rewriting the original opener card. On BTN open → BB 3bet 12BB, the seventh block is BTN's 3bet response with separate Fold, Call and 4bet 26.5BB controls.
- Browser verification: selecting Call in that seventh block marks Call while preserving the original BTN raise and BB 3bet blocks. Later 4bet/all-in and unsupported continuation blocks remain in chronological order.

## Participant range tables and closable detail (2026-09-23)
- Opening shows the opener table; heads-up 3bet and 4bet stages now show both still-participating positions. Earlier-decision tables are explicitly labeled as historical, not as the current response. Folded positions are omitted. Multiway participants use saved local estimates when available and otherwise retain explicit pending cards.
- Selecting AA in the BTN table of the four-bet stage focused that table and showed BTN's hand detail. Clicking 「詳細を閉じる」 restored the BTN and BB tables in the local browser at `http://127.0.0.1:5173/`.
- All 45 UI tests pass, including updated two-table assertions for later stages. Production build and Sites packaging pass. Existing Vite bundle-size warning remains.

## Compact action selector and reset (2026-09-23)
- Added an always-visible 「リセット」 control. Browser check returned the action path to BTN open / BB response, cleared later actions and detail focus, and left the selector expanded.
- Expanded actions now flow inline within each seat block and wrap as needed; reduced block padding and control spacing. Visual check confirmed the path is noticeably shorter while preserving available controls.
- UI tests: 45 passed; production build and Sites packaging passed. The existing Vite bundle-size warning remains. Local app remains open at `http://127.0.0.1:5173/`.

## Inline unsupported-range status (2026-09-23)
- Removed the full-width warning above the results. A missing 5bet response now occupies the opener's range panel, while the original 3bettor's saved 4bet response remains visible and is labeled as the 5bet decision.
- Unsupported squeeze branches place pending states in each affected participant's range slot; no prior heads-up response is shown as a current response. Verified the all-in path in the local browser and added server-rendered coverage for both all-in and squeeze pending states.

## In-panel local AI estimate button (2026-09-23)
- Moved the multiway local-generation control into Hero's missing-range panel and added the same explicit-click control to the original opener's missing response panel after a 100BB 5bet all-in. The separate banner above the matrices is gone.
- The all-in response uses only call/fold for the opener and carries the exact saved open/3bet/4bet sizes into its cache identity. Validated all 169 canonical rows, integer frequencies, legal action set, and scenario identity; generated estimates remain in ignored local cache and never update persisted range JSON.
- Rebranded session-storage keys migrate from the previous SolveaGTO-era key, so an in-progress selection survives the app rename and reload.
- Verification: 51 UI/data tests passed; production build passed; Sites tests passed (4). The local preview and read-only local estimate-status endpoint are reachable at `http://127.0.0.1:5173/`. No Codex estimate was initiated during verification. Existing Vite large-bundle warning remains.

## Vertically organized position/action selector (2026-09-23)
- Expanded position/action blocks now flow in a compact, vertically ordered responsive grid rather than one long horizontal strip. Seat order and acting-seat emphasis are preserved; action choices stay inline on desktop and wrap into two columns on narrow screens.
- Browser check at `http://localhost:5173/` showed a balanced 3-by-2 seat layout at desktop width with the range table still visible below it; the selector remains short. The collapsed summary layout is unchanged.
- Verification: all 51 UI/data tests and 4 Sites tests passed; production build passed. Vite still reports its existing large-bundle warning.

## Range settings controls and hand details (2026-09-24)
- The game-format editor and reset are now icon-only buttons immediately beside “推定レンジ”; both retain accessible labels and hover titles. The redundant “データの条件” hand-detail card remains removed.
- Browser verification at `http://localhost:5173/`: both icons sit in the heading row; opening AKo details shows its AI reason and mix, with no “データの条件” card or hand-JSON link.
- Verification: `node --test tests/*.test.mjs` passed (64 tests), `npm run build` passed, and `npm run test:sites` passed (4 tests). Vite still reports a large-chunk warning.

## Narrower action-path seat cards (2026-09-24)
- Reduced action-path seat cards from 128px to 104px on desktop and from 112px to 92px on narrow screens, keeping all action controls readable and the full path horizontally scrollable.
- Verified the live preview at `http://localhost:5173/` after the CSS update; the initial action cards are more compact and remain operable.
- Verification: `node --test tests/*.test.mjs` passed (64 tests), `npm run build` passed, and `npm run test:sites` passed (4 tests). Vite still reports a large-chunk warning.

## Remove bottom footer labels (2026-09-24)
- Removed the footer strip and its “ReysonAI v0.1” / “AI生成ソリューション” labels from both app shells. The separate estimate context/status row was removed in a later iteration to enlarge the range tables.
- Browser verification at `http://localhost:5173/` shows the range tables ending without the footer labels.
- Verification: `node --test tests/*.test.mjs` passed, `npm run build` passed, and `npm run test:sites` passed. Vite still reports its existing large-chunk warning.

## Remove estimate context strip and enlarge matrices (2026-09-24)
- Removed the full spot-summary/count/status row between the action path and range tables. The action path remains the spot selector; range tables now start directly below it and take the recovered height.
- Browser verification at `http://localhost:5173/` confirmed the context strip is absent and the range tables occupy the freed vertical space.
- Verification: all 69 UI/data tests passed, `npm run build` passed, and `npm run test:sites` passed (4 tests). Vite still reports its existing large-chunk warning.

## UTG response path through BB (2026-09-24)
- After UTG raises, every later seat through BB remains selectable in the action path, including direct action selection at a later seat.
- Browser verification at http://127.0.0.1:5173/: selected UTG Raise 2.5BB, confirmed HJ/CO/BTN/SB/BB were present, then selected BB Call 2.5BB; HJ, CO, BTN and SB changed to Fold and the path completed with two players seeing the flop.

## Ante in detailed settings (2026-09-24)
- Removed ante from the basic game-settings page and the action-path summary. Added a dedicated “より詳細な設定” subpage with a back action; ante remains “アンティなし” and “アンティあり” is locked because only no-ante ranges are currently authored.
- Browser verification at `http://localhost:5173/`: opened the settings dialog and confirmed it contains no ante field; navigated to “より詳細な設定” and confirmed the no-ante option is selected while ante-enabled is disabled.
- Verification: all 72 UI/data tests passed, `npm run build` passed, and `npm run test:sites` passed (4 tests). Vite reports the existing large-chunk warning.
- Verification: node --test tests/*.test.mjs passed (69 tests), npm run build passed, and npm run test:sites passed (4 tests). Vite still reports its existing large-chunk warning.

## Action-block range focus (2026-09-24)
- Selecting a position header focuses that decision's range matrix together with the immediately preceding block's matrix. Prior decisions are labeled historical; unsupported responses remain pending. Clicking the selected header again restores the full participant view. Choosing an action continues to update the path and returns to the full relevant participant ranges.
- Browser verification at `http://127.0.0.1:5173/`: selected the BB position header and confirmed BB's open-response matrix plus SB's historical open-response matrix; the selected state is announced accessibly.
- Regression verification at `http://localhost:5173/`: UTG Raise → HJ Call → CO Call → BTN Fold → SB Call with BB pending showed UTG, HJ, CO, SB and BB panels without a reload; the folded BTN panel stayed hidden. Selecting BB prioritizes SB and BB while the other current participants remain visible.
- Verification: all 72 UI/data tests passed, `npm run build` passed, and `npm run test:sites` passed (4 tests). Vite reports the existing large-chunk warning.

## Action-block rewind and range visibility (2026-09-24)
- Clicking a decision block's position or its highlighted action now rewinds the action path to that decision, clears later choices, preserves earlier callers, and presents the selected decision's related range table(s). Re-clicking the position only clears the range priority.
- Browser verification at `http://localhost:5173/`: from UTG Raise → HJ Call → CO Call → BTN Fold → SB Call, five participants were shown immediately (UTG/HJ saved tables; CO/SB/BB pending) without reloading. Clicking CO returned the path to CO with HJ's prior call retained and displayed UTG's opening table, HJ's historical response table, and CO's pending range panel.
- Follow-up after the user reported the path still did not rewind: clicking the highlighted HJ Call action itself returned the actor to HJ before the call, cleared subsequent choices, and displayed the UTG and HJ tables.
- Follow-up: clicking any blank/background area in the HJ decision card (not only its “HJ” heading) now rewinds to HJ. Explicit action buttons keep their existing choice/rewind behavior and do not trigger the card click a second time.
- Verification after the full-block click change: `npm test` passed (76 tests), `npm run build` passed, and `npm run test:sites` passed (4 tests). In Chrome, clicking HJ's stack area (outside the HJ label and action buttons) rewound to HJ and showed its opening range; choosing HJ Raise still advanced to CO, and clicking the selected Raise rewound to HJ. The existing Vite large-chunk warning remains.

## SB limp action path (2026-09-24)
- The unopened SB block now offers Fold / Call 1 / Raise 3.5. Selecting Call 1 shows BB's saved limp response with Check / Raise 3.5 and displays the SB opening and BB response ranges side by side.
- Browser verification at `http://127.0.0.1:5173/`: selected SB Call 1 and confirmed the BB Check / Raise choices and both participant range tables. The BB raise branch exposes SB's saved Fold / Call 3.5 / Raise 10.5 responses; the unsupported BB response to a limp-reraise remains pending.
- Focused UI tests passed (12). Full `npm test` had 95/98 passing; three existing tests failed because unrelated, uncommitted SB opening/reason data changes in the working tree no longer match their saved test/reason expectations. Production build and Sites tests passed. Vite still reports its existing large-bundle warning.

## SB limp balance / data-only verification (2026-09-24)
- Produced by Codex (gpt-6-astra) in a separate worktree and chosen over the parallel gpt-6-luna run; merged by Claude. The user-prohibited UI files and `tests/estimated-ui.test.mjs` are unchanged. Implementation follows the supplied specification; Claude's final review is pending.
- Added advisory `range-capped` / `over-segregated` checks across all 73 spots (7 datasets), using a reproducible 169-hand random-opponent equity table, incoming reach-weighted combos and a fractional top decile. Existing consistency checks remain publication gates.
- SB_open: raise 32.68%, limp 14.71%, fold 52.60%; AA/KK/AKs limp 20%, middle hands mix raise/limp. Strong-hand share inside limps is 7.62%; pure-action share is 38.31%. Both balance warnings are zero for SB_open.
- Regenerated the limp path; BB iso width narrows from 27.71% to 18.23%, and SB's strong limps can both call and reraise. Updated SB-dependent reasons, later-street reachability and saved table-profile adjustments; non-SB profile entries are unchanged.
- Full warning list: `range-capped` — 1 finding, `BB_vs_SB_limp` (check); `over-segregated` — 1 finding, `BB_vs_SB_limp`. All other spots: zero balance warnings. Left these warnings for Claude rather than making additional balance fixes. Blocking consistency findings: zero.
- Verification: `npm run build:estimates` passed with the two advisory warnings; `npm test` passed (105/105); `npm run benchmark` reports zero deviations beyond ±3pt for all five opens; `npm run build` passed with the existing large-chunk warning.
- Review packets now include SB limp and both limp-response nodes. Full audit and handoff: `apps/frontend/.local/review/range-balance-2026-09-24.{md,json}`; packet canary answers remain separate.

## Reyson service site (2026-09-25)
- Added a separate service site at `/`, retaining the existing estimated-range workspace at `/app`. The landing preview shows an interactive 13×13 matrix and K7s decision from the saved BTN-open and BB-vs-BTN data. A small generated projection keeps the marketing bundle independent of the larger app datasets.
- Desktop (1280px), tablet (768px), and mobile (390px) were visually checked in the local browser. The mobile document stays within its viewport; the matrix remains readable with horizontal overflow available where needed. Spot switching changed K7s to BB-vs-BTN Call 85%, the mobile menu navigated to Pricing, and the free CTA opened the existing onboarding at `/app` with Japanese document language.
- Planned natural-language adjustments, advanced training, accounts, paid features, and provisional ¥680 pricing are explicitly identified as unavailable. The mixed-frequency comparison is labeled illustrative rather than competitor data.
- Verification: `npm run lint`, `npm run typecheck`, `npm test` (142 passed), `npm run build`, and `npm run test:sites` (4 passed). Vite still warns about large existing product-app chunks; marketing and product routes are split.

## Japanese service site (2026-09-25)
- Added `/ja` with a language switch while keeping `/` English and `/app` Japanese. All marketing sections, saved-range preview explanations, provisional pricing, accessibility labels, document language, title and description are localized.
- Browser verification at desktop/tablet and 390px mobile: Japanese hero and pricing remain within the viewport; the BB-vs-BTN preview shows K7s Call 85% in Japanese, mobile navigation reaches `/ja#pricing`, and the planned/billing caveats remain explicit.
- English switching returns to `/` with English title and document language; `/app` still opens the original Japanese onboarding. Lint, TypeScript check, 143 tests (including locale-shape parity), build and 4 Sites tests pass. The pre-existing product-app bundle warning remains.

## Clean hero range matrix (2026-09-25)
- Replaced the hero preview's narrow, full-height mixed-frequency stripes with one solid color per hand's dominant action. Saved frequencies are unchanged; every cell's Japanese/English accessible label and hover title still list its nonzero action breakdown, while the selected-hand panel shows the dominant frequency.
- Browser verification on `/ja`: both BTN-open and BB-vs-BTN retain 169 interactive hands, show only three solid action colors and no gradient backgrounds; the BB-vs-BTN Q5s label reports Raise 5% / Call 95%. The 390px mobile matrix remains legible and within the viewport.
- `npm run lint`, `npm run typecheck`, `npm test` (143 passed), `npm run build`, and `npm run test:sites` (4 passed). The existing large-chunk build warning remains.

## Hero preview display modes (2026-09-26)
- Added a localized Simple / Standard switch beside the preview spot switch. Simple shows each hand's dominant action without visible percentages; Standard keeps the solid cell background and adds a slim horizontal frequency strip only for mixed hands plus a complete frequency breakdown for the selected hand. Both use the saved projection without modifying strategy values.
- Browser verification on `/ja` and `/`: switching modes updates the 169-cell matrix and selected-hand detail; K6s in the BTN-open Standard view shows Raise 75% / Fold 25%, and A5s in BB-vs-BTN shows Raise 60% / Call 40%. The choice survives reload and language switching. At 390px the controls fit on one row; at 320px they wrap cleanly and the matrix remains horizontally scrollable without page-level overflow.
- `npm run lint`, `npm run typecheck`, `npm test` (143 passed), `npm run build`, and `npm run test:sites` (4 passed). The pre-existing large-chunk warning remains.

## App matrix display aligned with site (2026-09-26)
- The `/app` 13×13 matrix now fills each reachable hand with its dominant-action color in both modes. Standard adds a 3px bottom strip only for mixed hands; Simple shows no strip. Unreachable patterned cells, adjustment outlines, selected-hand detail and action ordering remain unchanged.
- Browser verification at 1280×720 on an isolated localhost origin: BTN-open and BB-response tables fit side by side; K6s has a solid Raise background and a 75%/25% bottom strip in Standard, while Simple has zero strips across the displayed tables. The original 127.0.0.1 browser profile was not changed for this verification.
- Regression test covers mixed, pure, unreachable and Simple matrix cells. `npm run lint`, `npm run typecheck`, `npm test` (151 passed), `npm run build`, and `npm run test:sites` (4 passed). The existing large-bundle warning remains.

## Inline flop card selection and actions (2026-09-26)
- The completed preflop path remains in the same `/app` workspace. Three individual card selectors prevent duplicate cards. An audited representative 12-board set unlocks the read-only AI candidate; any other board stays explicitly unrecorded.
- Flop Check / Bet / Fold / Call / Raise choices append to the same horizontal action-block history, and the current decision's 169-hand matrix uses the existing result area. The separate postflop sidebar page was removed.
- Browser verification at `http://127.0.0.1:5173/app`: selected `As 7d 2c`, saw the BTN flop matrix, chose Bet 33%, saw the BB response block, and rewound with the BTN position. The app returned HTTP 200 after the change.
- Focused postflop tests passed (7/7); typecheck, production build and Sites tests passed. Full `npm test` passed 159/160; the remaining pre-existing 4bet UI expectation for the exact “既存3bet頻度0%” title no longer matches the separately updated saved range data. No postflop test failed. Vite still reports its large-chunk warning.

## Flop card selection modal (2026-09-26)
- The full-width inline card selector was removed. A modal now offers the 12 audited boards; the chosen three cards appear in one clickable block after the preflop actions and before the flop decisions. The redundant preflop-only "終了" block is omitted after entering the flop. Clicking the card block reopens the modal.
- Browser verification at `http://127.0.0.1:5173/app`: the completed BTN→BB path opened the modal, `As 7d 2c` appeared in the compact row block, and the BTN flop range remained visible. The obstructing inline selection panel was absent.
- Focused postflop tests passed (9/9); typecheck, production build and Sites tests passed. The full run passed 171/172; its sole failure was the existing 4bet UI title assertion after separate saved-data changes. Vite still reports its large-chunk warning.

## Automatic Turn and River card selection (2026-09-29)
- Completing an eligible Flop or Turn action now opens the next street's card-selection modal without clicking the board block. The board block still reopens it after dismissal; dismissing an unchanged pending street does not immediately reopen it.
- Browser verification on `/app`: BTN open → BB call → Flop `As 7d 2c` → Check opened Select turn. Closing it left the pending Turn view stable; reopening and selecting `Kh`, then Check → Check opened Select river.
- Typecheck, all 286 UI tests, production build, and all 5 Sites tests passed.

## Turn/River combo-level hand detail (2026-09-30)
- Turn and River now use the Flop detail structure: an entire-range summary, a hand-class Average, and selectable exact suit combinations. Each combo retains its own reachable weight, tier, action mix, and exact-combo explanation; hand-class EV is suppressed while a combo is selected.
- Browser verification on `/app`: Turn showed the suit grid; selecting `A♥ K♠` displayed that exact combo and its numeric explanation. After Turn Check → Check, the River card modal opened automatically. Selecting `2♦` showed the River entire-range and hand-average panels plus reachable suit combinations.
- `npm run typecheck`, all 286 UI tests, `npm run build`, and all 5 Sites tests passed. The local preview remained available at `http://127.0.0.1:5173/app`.

## Resume interrupted trainer drills (2026-09-27)
- The trainer now autosaves the current question, selected answer, score, streak and elapsed practice time in browser storage. Leaving the table or reloading the app keeps the draft; the drill library marks it `途中保存` and offers `続きから`. Completing or explicitly ending a drill removes the draft; review drills remain outside per-drill accuracy records.
- Browser verification at `http://127.0.0.1:5174/app`: answered a question, returned to the library, and resumed the same hand with its answer/verdict intact. Reloading the app retained the draft and `続きから` entry.
- `npm test` passed (202/202), `npm run build` passed, and `npm run test:sites` passed (4/4). The existing Vite large-bundle warning remains.

## Player-analysis summary card removal (2026-09-27)
- Removed the redundant large tendency/count summary; the four-quadrant map now follows the page heading directly. Action comparisons and guidance remain.
- Browser verification at `http://127.0.0.1:5173/app`: the map and comparison sections were visible, while the summary card and its three counts were absent.
- Typecheck, build, all 202 UI tests and all 4 Sites tests passed. The pre-existing large-bundle warning remains.

## Player-analysis strengths and weaknesses (2026-09-27)
- Added compact strength/weakness cards beneath the action comparison, using the same graded browser-local answer history as the detailed 弱点 page. Established highlights require five answers; weak groups with three or four answers are explicitly provisional. The weakness card also lists pending review hands and links to the detailed page.
- Browser verification at `http://127.0.0.1:5173/app`: the existing 31-answer history showed strong groups, provisional weak groups, two review hands, and a working link to 弱点. The removed large summary card stayed absent.
- Typecheck, all 205 tests, build and all 4 Sites tests passed. The existing large-bundle warning remains.

## Same-URL service-site language switch (2026-09-28)
- The header language button changes English/Japanese copy on `/` without navigating to `/ja`, and remembers the choice for reloads and the product app. The visible heading, document language, title, and description update together.
- Browser verification covered both directions and reload persistence. All 238 tests, the production build, Sites tests, lint, and typecheck passed.

## Single service-site URL (2026-09-28)
- The Japanese-language route was retired. The stored language preference alone determines whether `/` shows English or Japanese. The former `/ja` route and its descendants return 404 rather than redirecting or serving the site, in both local development/preview and the published Sites worker.
- Browser verification before the strict 404 follow-up: selecting Japanese and reloading stayed on `/` with Japanese copy and metadata. Switching back to English also stayed on `/`.
- Strict-route verification at `http://127.0.0.1:5174`: `/ja`, `/ja/`, `/ja/pricing`, and `/%6a%61` returned 404 with no redirect; `/` and `/app` still returned 200. The Sites worker test also confirms the retired route is blocked before static serving or app fallback. Full tests, build, Sites tests, lint, and typecheck passed.

## Admin sidebar link (2026-09-28)
- Added an accessible Admin link in the `/app` primary sidebar, with a visible label when expanded and an icon plus accessible name when collapsed. It navigates to the existing `/admin` dashboard rather than creating another app section.
- Browser accessibility inspection at `http://127.0.0.1:5174/app` showed the English “Admin dashboard” link targeting `/admin`. Both `/app` and `/admin` returned HTTP 200. All 244 UI tests, the production build, 5 Sites tests, lint, and typecheck passed. The existing large-chunk build warning remains.

## Admin TODO priorities (2026-09-28)
- The Admin backlog is ordered P1 BTN versus BB, P2 other heads-up (including SRP/3bet/4bet and SB limp), then P3 multiway. Every enumerated preflop and postflop row has a priority badge; the TODO table sorts by priority and street and offers a priority filter.
- The roadmap states that spot/policy-file counts are not a claim of full board or action-branch coverage. Browser inspection on `/admin` showed P1 TODO rows above P2/P3, with P1 3bet and 4bet flop/turn-river copies still marked TODO rather than done.
- Full verification passed: 245 UI tests, production build, 5 Sites tests, lint, and typecheck. The existing large-chunk build warning remains.

## Browser-side postflop compute layer (2026-09-29)
- Added `browser-inputs.mjs` and `postflop-compute.ts` without switching `PostflopTrial.tsx`; each compute entrypoint receives its datasets and saved candidates directly. The browser bundle dependency graph does not include Node built-in imports; a Vite library build of the compute entry emitted zero `node:` imports.
- JSON parity coverage compares browser calculations with the existing Node route functions for BTN-open / BB-call and HJ-open / BTN 4bet-call, including input fingerprints, flop board, flop explanation, turn view, turn explanation, and on-demand hand EV. `.local` candidates were present and both spot pairs ran (not skipped).
- Verification: the requested four postflop test files passed (38/38); full `node --test tests/*.test.mjs` passed (284/284); `npm run build` passed and emitted all Sites artifacts with zero `node:` imports in `dist/client` JS; `npm run test:sites` passed (5/5). Browser smoke opened local `/app` and confirmed the range-analysis workspace loads. `PostflopTrial.tsx` remains unchanged.

## Turn/river card-picker layout (2026-09-30)
- Replaced the rank-major 52-card wrap with four labeled suit rows. The dialog now shows the existing board, preserves unavailable-card and selected-card states, and wraps each suit into two rank lines on narrow screens.
- Browser verification on `/app`: completed BTN open → BB call → flop A♠ 7♦ 2♣ → turn K♠ → river. The river dialog showed four suit groups, the four used cards disabled, and a readable desktop layout. A 390px viewport also showed all four groups without horizontal clipping.
- Verification: 24 postflop-trial tests, typecheck, all 286 UI tests, production build, and 5 Sites tests passed.

## Working-tree verification and current documentation (2026-10-01)
- Reviewed and retained the existing local-account implementation; no real authentication, sync or billing was added. Verified the English account menu and Settings page in the local browser without modifying the existing profile or practice history.
- Full existing frontend suite passed 318/318. Added three storage regressions for selective practice export/cleanup, appearance/range persistence, and profile-only logout; focused account suite passed 7/7.
- Configured typecheck and lint passed, production build and all 5 Sites packaging tests passed. Typecheck currently covers site/backend only, not the complete product UI; lint also has an explicit limited file list.
- Updated README, postflop pilot guide, backend introduction and later-policy instructions to match arbitrary-board runtime support, representative-only authoring/audit, fail-closed later policies, local settings and D1 delivery. Preserved compatibility identifiers and did not regenerate/publish strategies.
- Kept unrelated perf/equality.mjs, .claude/launch.json and old apps/preflop-ui/.vite cache uncommitted and unchanged. App remains running at http://127.0.0.1:5173/app.

## Exact per-hand EV (2026-10-01)
- Replaced the sampled per-hand action EV with an exact expectation over opponent combos, later-street mixes and runouts; the EV panel and explanations now say "expected value when both players follow the shown strategy" and no longer mention samples or self-play. Repeated and precomputed vs on-demand requests are identical.
- Validated against high-sample Monte Carlo (3 river, 3 turn, 2 flop decisions) and an independent enumeration; the 12-board BTN_open_BB_call hand-EV regenerated in 61 s (was 43m50s). Turn and flop on-demand budgets are not met (1.5 s and 4.8 s cold); details in apps/frontend/docs/postflop-flop-base.md.

## Content-preserving service-site polish (2026-10-03)
- Scope: `/` only. The existing marketing copy, EN/日本語 translations, section order, prices, persisted preview data and `/app` behaviour are unchanged. Removed the obsolete sharp hero styling rather than layering new overrides over it.
- Balanced the hero typography/column widths; restored consistent rounded panels and controls; increased small-label/fold-hand contrast; tightened comparison spacing; grouped FAQ rows; aligned pricing cards/actions while keeping Plus visibly provisional and unavailable.
- Fixed two existing UI regressions: `#drill` now targets the outer scroll track so returning from Ranked resets to Training, and the matrix minimum width now wins over the fieldset reset (316px chart in a 266px scroll container at 320px viewport).
- In-app browser QA: English and Japanese hero at 1440×900, Japanese at 1280×900, mobile at 390×844 and 320×720; no document-level horizontal overflow. Verified preview Standard BB/A5s = 3bet 60%, call 40%, fold 0%; menu navigation; comparison, analysis and pricing; FAQ opening; Training navigation from the Ranked slide and J9o raise feedback = 75%/fold 25%. Reset the temporary viewport after QA. All existing reduced-motion gates remain intact; OS reduced-motion was not changed.
- Verification: configured typecheck and lint passed; production build and 5 Sites tests passed; 8 focused site tests passed (including 5 new regressions). The existing full suite ran 381 tests: 380 passed, one local HTTP-listener check was blocked by sandbox `EPERM`. That exact test passed when rerun with local listening permitted. Existing large-chunk build warning remains.
- Concurrent postflop source edits in the working tree were neither reverted nor staged as part of this UI change.

## Sharp service-site treatment (2026-10-03)
- Supersedes the rounded visual treatment above, following the user's request for a cooler rather than cute-looking service site. Scope remains `/` only: copy, translations, section order, prices, preview strategy data and product logic are unchanged.
- Introduced shared 4px panel / 2px control-and-badge geometry throughout desktop and mobile layouts; flat charcoal surfaces, fine neutral borders, heavier Inter headings, monochrome primary CTAs and a cooler comparison background. Pink remains a small brand/interaction accent; data colours still convey the original actions. Removed soft panel shadows and reduced the matrix entrance/hover scaling instead of layering a second theme on top.
- Preserved app-matching playing cards, oval poker tables, circular seats/chips, the scroll scenes and reduced-motion gates. Replaced the outdated rounded-style instruction in the frontend SSoT.
- In-app browser QA: English hero, pricing and analysis at 1440×900; Japanese hero, menu and Training at 390×844; chart at 320×720. No document horizontal overflow. At 320px the chart remains 316px wide inside its 266px scrolling container. J9o Raise feedback still shows Raise 75% / Fold 25%, with Next enabled. Reset the temporary viewport and restored English after checks; the local preview remains running.
- Verification: configured typecheck and lint passed; final production build and all 5 Sites packaging tests passed; focused locale, preview and surface tests passed 9/9, including the new geometry/physical-card regression. Existing large-chunk build warning remains.
- Full frontend suite completed: 387 tests, 386 passed, one unrelated offline postflop timing assertion exceeded its 2s budget (9.87s) during concurrent heavy test runs. That exact narrow-4bet test passed alone in 1.02s; no solver code or timing threshold was changed. The full run is not recorded as an all-pass result.

## Mobile service-site audit and fixes (2026-10-03)
- Scope: the existing service site `/`, following the user's screenshot of the cropped "Know why" preview. Keep the sharp styling, all marketing copy, translations, frequencies, physical poker objects and product logic unchanged. Browser evidence was captured in this run, not inferred from the previous hero-only check.
- Confirmed issue: the mobile How-it-works frame was fixed at 340px. At 390px, the cards extended 42–49px above it and the explanation card 46px below it. Replaced the fixed height with content-driven scenes and 28px/20px padding. At 320px the final English scene is 510px tall; Japanese is 692px, allowing the full explanation to be read by normal page scrolling. All three scenes' card, seat, chart and legend bounds fit their frames.
- Confirmed issue: the persona section used desktop pinning on tall phones and hid inactive tabs. Pinning now uses the same ≥961px / ≥600px rule as Training/Ranked. Mobile visitors can select all three tabs, and only the active preview contributes height. Removed the obsolete pinned-mobile CSS; constrained long persona labels to their content column.
- Confirmed issue: narrow analysis KPIs clipped/ellipsized labels such as ReysonAI Score and Play-style map. At ≤560px, KPIs use two columns with a full-width play-style card; captions wrap without ellipsis. Small header/preview/CTA controls are at least 44px high across the mobile/tablet breakpoint.
- Confirmed issue: at 844×320 landscape, the menu extended below the viewport (bottom 374px). It now has a dynamic-viewport height limit and internal scrolling; final bottom is 320px, client height 255px / content 309px. Selected the final Pricing item successfully and confirmed the menu closes.

### Checked steps
1. Header and hero — healthy after touch-target fixes. Menu/language/spot/display controls work; Standard BB/A5s remains 3bet 60%, Call 40%, Fold 0%. At 320px the 316px matrix scrolls inside its 266px container, not the document.
2. Personas — healthy after desktop-only pinning and active-panel sizing. Tested reason/free tabs, complete long reasons and benefit labels, and the existing `/app` link.
3. How-it-works — fixed cropped cards and explanations; table seats and colour legends also checked. Both languages can show the complete A5s reason.
4. Training and Ranked preview — healthy in the stacked mobile layout. J9o Raise feedback remains Raise 75% / Fold 25%, with Next enabled. No practice data or ranking logic changed by this task.
5. Analysis — fixed KPI label clipping; map, tendencies and sample labelling remain visible.
6. Comparison and pricing — healthy as mobile stacked rows/cards, with all text retained, Free available and Plus still planned/disabled.
7. FAQ, final CTA and footer — healthy; expanded the first FAQ and verified the existing final app link and disclaimer layout.

### Verification and limits
- Browser viewport matrix: EN and 日本語 at 320×720, 375×667, 390×844, 430×932, 768×1024 and 960×720. Measured document width equals viewport width throughout; no visible prose/heading/label clipping, inline-scene overflow or KPI horizontal text overflow. Intentionally collapsed inactive persona details and horizontally scrolling chart cells were excluded from clipping findings. Also checked 844×320 landscape and 1440×900 desktop scroll scenes.
- Internal evidence: `/tmp/reyson-mobile-audit/01-en-why-before.png`, `02-en-why-after-320.png`, `03-en-analysis-after-320.png`, `04-ja-why-after-390.png` and `measurements.json`. Saved screenshots were kept internal per user preference.
- Configured typecheck and lint, final production build, 5 Sites packaging tests and 10 focused site tests passed. Added a regression for growing mobile scenes, desktop-only pinning, wrapping KPIs, scrollable landscape menu and 44px controls. Existing large-chunk build warning remains.
- Full frontend run completed: 388 tests, 387 passed, one existing offline narrow-4bet timing assertion took 2.35s against its 2s budget. The exact test passed alone in 1.49s; no solver source or thresholds were modified. This full run is not an all-pass result. The viewport override was reset, English restored and the corrected Why preview left open in the running local app.
- This is a browser responsive-layout check, not a claim of complete accessibility compliance or real-device Safari/Android testing. OS text enlargement and reduced-motion settings were not changed; existing reduced-motion gates remain intact.
- Concurrent trainer/rank-badge source and assets in the working tree are unrelated and are not staged as part of this service-site fix.

## Compact mobile comparison (2026-10-03)
- User request: make the mobile comparison section shorter while retaining its content. No edits to either marketing-copy source, prices, comparison claims, disclaimers or strategy data.
- Replaced the repeated branded cards at ≤720px with paired comparison columns and a shared row title above each pair. Both service names appear once in the sticky table header, which stays at 64px below the site header while the rows scroll. All seven rows and the full approach/trademark note remain visible; nothing is collapsed, abbreviated or hidden. Removed obsolete per-cell `data-label` attributes and generated repeated labels rather than keeping a second rendering mode.
- Tightened only mobile section/description/table spacing and typography; native desktop table styling is unchanged. At 390px English, table height fell from 1409px to 871px (~38%); entire section from 1859px to 1231px (~34%), with all text retained.
- Browser QA: English and Japanese at 320×720, 375×667, 390×844, 430×932 and 720×900. All seven rows remain present, document width equals viewport width, and no header/data-cell text overflows its column. Scrolled to the final rows and verified the sticky header stays at top 64px, with disclaimer visible below. At 1440×900 the original three-column `table-row` layout remains, and the browser exposes the native table. This is browser layout testing, not real-device or full screen-reader certification.
- Added regressions for the compact mobile columns/shared row headings/sticky header and exact preservation of every English/Japanese comparison string and disclaimer.
- Verification: configured typecheck/lint, production build, all 5 Sites packaging tests and all 13 focused site tests passed. Full frontend run: 395 tests, 394 passed; the existing offline narrow-4bet timing assertion took 7.15s against its 2s budget during parallel testing. It passed alone in 0.96s; no solver code or thresholds were changed. The full run is not an all-pass result. Existing bundle-size warning remains. Viewport override reset, English restored and the compact comparison left open in the local app.

## 2026-10-03 — Remove redundant selected-hand rows
- Removed Open size (total) and Total frequency from preflop selected-hand details, including local-estimate frequency totals; saved datasets, action bars, call EV and other sizes are unchanged.
- Removed unused total calculation and avoid an empty stats block for opening/limp details.
- Verification: estimated UI tests 16/16; production build passed; Sites tests 5/5; diff whitespace check passed. Full suite was started before fixing a test-source variable and is not used as a passing result.
- Browser: localhost:5173/app, BTN AKo Standard detail shows action percentages and saved reasoning without either removed row. App left open.

## 2026-10-03 — Approved ReysonAI abstract brand icon
- Adopted the user's selected non-letter abstract pink symbol via a shared BrandIcon for the app sidebar/onboarding and service-site header/footer/comparison. Playing-card suits remain unchanged.
- Related tests passed 29/29; Sites tests passed 5/5; production build passed (existing bundle-size warning only).
- Browser verified the app icon loads at 30px and all three service-site symbols load at 24/18/24px. Visually checked both pages; app remains open at localhost:5173/app.

## Expanded service-site canvas (2026-10-03)
- User request: give content more prominence across every section instead of leaving large margins. Layout work does not rewrite marketing claims, pricing, saved strategy data, or product behavior. Concurrent approved ReysonAI naming/concept/icon work was retained and committed separately during this work; no older branding was restored.
- Shared responsive gutters now use a 1520px canvas (previously 1280px). Ordinary sections are content-driven rather than forced to a full viewport; desktop section spacing is 64px and mobile/tablet spacing 48px (previously 88/96px). Larger desktop headings and lead copy, closer two-column gaps, expanded How scenes and trainer objects, full-width pricing cards, and reduced final-CTA spacing keep the existing sharp treatment.
- At 1440×900, Training preview grows from 649×439px to 730×571px (~30% taller), while its heading grows from 34px to 40px in Japanese. Pricing expands from its former 1000px cap to 1368px. Dedicated Training/Ranked scroll transitions remain; poker-table sizing is height-aware on short desktops. Persona pinning now requires ≥961px wide and ≥840px tall: shorter desktops use an ordinary interactive section so the longest translated preview cannot become trapped below the viewport. Removed obsolete short-screen pinning styles.
- Browser geometry checks covered all sections in EN/日本語 at 320×740, 390×844, 961×600 and 1440×900; additional Japanese checks at 768×1024, 1137×721, 1280×600/800 and 961×741/800/840. Document width equals viewport width; final section checks have no horizontal overflow. Found and fixed the narrow ranked preview's intrinsic-width overflow via wrapping rank KPIs and min-width:0 on the shared mock/copy. At 961×840 the pinned persona wrapper fits exactly; at 1280×800 it is unpinned. Training and Ranked both fit the 1280×600 pinned stage.
- Visually inspected hero, trainer/table controls, Ranked transition, full Why explanation/card at 320px Japanese and 390px English, analysis, comparison and pricing. Mobile How scenes have identical scroll/client heights in all three steps; comparison retains all seven paired rows and one sticky service-name header. Trainer Fold displayed the saved 25/75% mix and Next advanced; Sample and planned/estimate disclaimers remain. Screenshots are internal, not attached to the reply.
- Verification: configured typecheck/lint, production build, all 5 Sites packaging tests and all 12 focused site/preview tests passed. Added shared-canvas/content-driven sizing regression and updated persona-height and narrow-rank wrapping checks. Full frontend run during the work: 395 tests, 393 passed, 2 failed (localhost listen blocked by sandbox; existing offline narrow-4bet timing budget exceeded under parallel load). Both exact failures passed in an isolated run with localhost access. The full run is not an all-pass result; solver sources/thresholds are unchanged. Existing bundle-size warning remains.
- Browser responsive-layout testing is not real-device Safari/Android or full accessibility certification. Reduced-motion guards remain unchanged. Local preview stays running; temporary viewport overrides are reset after verification.

## Pinned comparison with scroll-driven row reveal (2026-10-03)
- User feedback: fit this comparison in one desktop screen, remove the large gap above its heading, and reveal each row as the visitor scrolls rather than highlight the current row. Scope is comparison layout/animation only; its seven claims, translations, native table semantics and complete disclaimer are retained. Concurrent pricing/branding/storage edits are not part of this change.
- With motion enabled at ≥961px wide / ≥600px tall, the stage pins 64px below the header on a 240vh track. Content starts 24px below that header; the table fills the remaining height between heading and note. Scroll cumulatively reveals rows 1 through 7 with a small upward fade; reverse scrolling reverses the reveal. Returning through #compare resets the sequence. Locale changes re-evaluate scroll position and retain stable row keys. Removed the rejected row-highlight styling instead of layering over it.
- Browser QA: EN/日本語 at 961×600, 1137×721 and 1440×900; EN/日本語 at 320×740; EN at 390×844. No document or cell text horizontal overflow. At 961×600 the disclaimer ends at y=576; at 1440×900 it ends at y=876. At 1137×721 the visible row counts advanced 1,2,3,4,5,6,7 while the stage stayed at y=64 and the note stayed in view. Inspected the full seven-row final stage and both desktop locales. At 320/390px the ordinary paired mobile table keeps all seven rows readable without desktop scroll-driven hiding; the sticky mobile heading remains at y=64.
- Added regressions for motion/media guards, cumulative row reveal, RAF cleanup, stable keys, full-stage sizing and preservation of every comparison string in both locales. Configured typecheck/lint and focused site/preview/locale tests passed 15/15; production build and all 5 Sites tests passed. Existing large-chunk warning remains.
- Full frontend run completed: 398 tests, 397 passed, one offline board-worker deterministic-file equality assertion failed. That exact test passed alone (1/1); the full run is not recorded as all-pass. No generator, solver source, saved strategy data or test threshold was changed by this UI task.
- Internal evidence saved in /tmp/reyson-comparison-qa/desktop-first-row.png and desktop-all-rows.png. These screenshots are not attached to the reply. Reduced-motion behavior checked through source guards and non-animated server-rendered fallback, not by changing OS settings; browser checks are not real-device or full accessibility certification.
- Later working-tree recheck encountered concurrent pricing/copy/storage tests: 18 tests, 15 passed and 3 failed outside the comparison assertions (Japanese hero expectation and the storage-key rename). Comparison-specific tests passed separately; the earlier 15/15 result predates those concurrent edits. Unrelated changes are preserved, not reverted or included in this comparison commit. The local server responds on port 4173; the previously errored browser tab was replaced with a fresh working preview, and temporary viewport overrides were reset.

## Live decision-studio hero — selected concept 3 (2026-10-03)

**Findings**
- No actionable P0/P1/P2 differences remain after the short-viewport fix below. The English-first headline, Japanese supporting copy, asymmetrical chart layout, saved-range colors, dealt trainer cards, selected-hand frequencies and full-width explanation rail align with the selected visual target and user feedback.
- No focused-region comparison was needed: at the matched viewport the complete hero, including the fine chart labels, cards, action frequencies and CTA, was legible in the full-view side-by-side comparison.

**Open Questions**
- None for this request. Native OS reduced-motion settings were not changed; the existing reduced-motion logic and responsive behavior are covered by source tests, but a real-device Safari/Android pass was not part of this hero change.

**Implementation Checklist**
- [x] Match selected design 3 while retaining the existing brand icon and persisted range strategies.
- [x] Use “Don't just play. Understand why.” in both locales; descriptions, controls and disclosures remain localized.
- [x] Start on A5o; retain the 169-cell interactive matrix, simple/standard frequencies and both range modes.
- [x] Add a localized pause/resume control; manual chart/mode interaction takes over and pauses the tour. Automatic hand changes are not sent to a live region.
- [x] Verify desktop, short desktop and narrow mobile layouts; retain the 316px horizontally scrollable matrix on the narrowest screens.
- [x] Production build, configured typecheck, configured lint, focused site tests (24/24), and Sites packaging tests (5/5) passed. Existing >500KB product-app bundle warning remains.
- [x] Production-preview console check returned no errors.

**Comparison evidence**
- Source visual truth: `/Users/yota/.codex/generated_images/01a100c6-6973-7f23-8d59-c23df8cba55a/exec-baf06d67-6224-4f39-82e1-21ec32741ac4.png` (1487 × 1058 px). This is the selected concept 3 with the user's English-headline revision.
- Implementation: `/private/tmp/reyson-hero-qa/implementation-ja-1488x1056-final.png` (1488 × 1056 px, browser-rendered screenshot, CSS viewport 1488 × 1056, devicePixelRatio 1). Reference normalization for the side-by-side composite was a negligible 1px width / 2px height rescale; no content crop or browser chrome was included.
- Full-view comparison: `/private/tmp/reyson-hero-qa/comparison-ja-1488x1056.jpg` (source and implementation side by side; selected state: Japanese locale, BTN Open, Simple, A5o, autoplay paused). Full screenshot uses the same 1488 × 1056 CSS viewport; source raster is at its native 1487 × 1058 px.
- Short-height check: `/private/tmp/reyson-hero-qa/implementation-ja-1280x720.jpg` (1280 × 720 px; CSS viewport 1280 × 720; DPR 1). The hero detail rail ends at y=707 and playback controls at y=706, within the 720px viewport; no document-level horizontal overflow.
- Interaction state: Japanese explanatory copy/controls with the explicitly requested English headline; BTN Open / Simple / A5o; saved strategy gives Raise 100% / Fold 0%; hand tour is paused after manual selection. The prior production browser pass also checked Standard, BB-vs-BTN frequencies, pause/resume, locale persistence and the existing app/how-it-works links.
- Typography: Inter-based bold headline with the same three-line hierarchy and English phrase; Japanese paragraph/control text wraps cleanly. Spacing/layout: two-column hero, 13 × 13 matrix and full-width lower detail rail preserve the reference's composition. Colors/tokens: charcoal/black surfaces, white copy and restrained pink raise accent remain consistent; saved action colors are unchanged. Image/asset fidelity: product trainer cards and existing brand mark are reused, not approximated with replacement artwork. Copy/content: only the requested hero title is English on the Japanese page; the remaining visible hero text is Japanese.

**Comparison history**
- First short-height comparison at 1280 × 720 found a P2: the detail/playback rail ended at y=733, placing the lower playback control partly below the viewport. Changed the short-height `.site-hero-main` vertical padding from 16px to 8px, rebuilt, and recaptured. Post-fix evidence shows the rail ending at y=707 and playback at y=706; the controls fit fully in the 720px viewport. No other P0/P1/P2 issue was found in the final matched-size comparison.

**Follow-up Polish**
- No remaining P3 items identified for the selected hero.

**final result: passed**

## Action-path height stability — 2026-10-04

- Compared both supplied screenshots: the requested target is the shorter pre-action row, about 120 CSS px tall. The completed path must not stretch every card when the pink Continue to flop button appears.
- Desktop expanded paths now keep that 120px baseline. The End card uses size containment so its label/button cannot determine the row height; End and the pot share a compact first line, with the complete result and wrapping button below. Longer settings and postflop action lists can still grow naturally. Narrow layouts retain horizontal scrolling with a stable 44px baseline and a non-wrapping CTA without the old top margin.
- No range values, action transitions, localization strings, button handlers, or focus styles changed. Added an English/Japanese markup/CSS regression using the product copy translator for completed and incomplete paths, with and without the continuation callback.
- Passed: focused action-path/UI tests (23/23), configured typecheck, production build, and Sites packaging tests (7/7). Build retains the existing large-product-chunk warning.
- Configured lint still reports seven errors in unchanged `ProductApp.tsx` and `site/ServiceSite.tsx` (hook dependencies, button type, SVG title and array-index keys). This is not recorded as a clean lint pass.
- Browser verification is blocked: offline Chromium could not launch in the available shell sandbox, and its supported escalated runner failed during environment mounting. No localhost proxy or tunnel was used. EN/日本語 component fixtures were generated, but no rendered screenshots or measured end/no-end desktop/mobile geometry are claimed. Final visual acceptance remains unverified.
- The first concurrent build was terminated (exit 137); the build passed on a standalone retry. The serial aggregate run completed with 456 tests: 444 passed, 4 failed test files, and 8 skipped. The failed files were `postflop-hand-ev`, `postflop-later-hand-ev-ondemand`, `postflop-performance`, and `postflop-trial`; the runner reported `test failed` for these child processes without individual assertion details. A standalone diagnostic rerun of `postflop-trial` passed all 26 tests. The aggregate is not recorded as all-pass, and the remaining three failures were not changed or waived for this CSS task.

**Status: implementation and focused checks complete; rendered visual acceptance blocked and aggregate failures remain.**

## 2026-10-04 — Chinese/Spanish, mobile tabs, and flop-picker cleanup

- Base: verified development commit `3c5bbd1cd807d52a1a12b2fc27b1992df91072fe`. Reconciled only its three-file delta (`agent.css`, `trainer.css`, `DrillLibrary.tsx`) from the earlier pinned `546635a`; three-way merged the overlapping drill library and preserved the newer ranked/Agent visuals.
- Added English/Japanese/Simplified Chinese (`zh-CN`)/Spanish (`es`) locale metadata and authored interface/site/explanation dictionaries. Browser default stays English; locale storage and routes remain shared and unchanged. Account locale loads update the document language/title and presentation observer. Guest locale switching still works if the account service is offline; authenticated save failures do not discard unsaved records.
- Removed sidebar/profile-popover language choices. Settings → Language offers all four native names; first-run onboarding and the service-site header use compact selectors. Onboarding values survive a language reload without leaking drafts into another account/profile or a later editor.
- At widths ≤650px, a fixed five-destination bottom navigation replaces the sidebar: Range, Trainer, Sessions, Stats, Settings. Added active-route semantics, focus styles, safe-area/content clearance, and a raised sticky drill footer. Sign-in gates keep navigation. Desktop/tablet sidebar behavior is retained.
- Removed the screenshot's “Quick picks · 12 representative flops” section from the flop dialog. Manual 52-card suit rows, random flop, three-card validation, and the representative-board strategy data remain intact.
- Explanations localize authored templates before interpolation. Stored strategy keys, numerical frequencies/facts/EV, cards, records, user names and custom drill titles are not rewritten. Brand names and the intentionally English service-site headline remain unchanged. Current UI narratives, glossary definitions, auth, practice, stats and marketing copy are covered; no legacy/offline strategy datasets were regenerated.

Verification:
- Final production build passed with `NODE_OPTIONS=--max-old-space-size=384`; expected Vite large-chunk warning remains. Sites output includes `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
- `npm run typecheck` passed. `npm run test:sites`: 7 passed.
- Broad sequential sweep excluding three compute-heavy test files: 478 passed, 8 existing fixture-dependent skips, 0 failed (75 files). A full attempt included process failures in `postflop-flop-base.test.mjs`, `postflop-hand-ev.test.mjs`, and `postflop-performance.test.mjs`; isolated hand-EV retry confirmed SIGKILL, including with a 384MB Node heap cap. These checks are not claimed as passed.
- Final targeted regression rerun after locale/profile/name protections: 86 passed, 0 failed. Includes all four locales, persistence/reload, offline guest switching, settings/native names, sidebar language absence, bottom-tab route access, cross-account draft isolation, manual/random flop selection, and preserved user-authored names.
- The locale suite also checks 234 generated flop/turn/river narratives for English prose fallback and unchanged action identities/frequencies, plus unchanged saved preflop numeric facts and translation placeholders.
- `git diff --check` passed. Copy/main lint passed. Aggregate `npm run lint` retains seven diagnostics (four in ProductApp, three in ServiceSite), reproduced on untouched files from the pinned base; no new diagnostic remains.
- Visual browser QA is unverified: the cloud browser blocked the loopback preview with `ERR_BLOCKED_BY_CLIENT`, and the separately available native cloud Chromium QA windows crashed/disappeared before the local preview could be inspected. No tunnel/network workaround, user-computer access, remote publication, merge or deployment was used.


## 2026-10-04 — Localization review corrections

- Corrected a P1 in the legacy DOM translator: CJK detection had mistaken already-localized Chinese for Japanese and replaced shared characters/fragments (for example, `范围分析` became `范围 min析`). Translation now uses the observer's explicit locale, recognizes authored target copy, and replaces source tokens atomically. Kana-free legacy fragments are accepted only when every CJK character belongs to a known source token; unknown Chinese prose is preserved. Numerical strategy data is unchanged.
- Session lists, detail headings and hand-history accessible labels now localize stock preset, review and ranked titles explicitly while preserving custom titles and renamed presets. Stored session/drill records remain unchanged.
- The mobile action picker explicitly translates the trigger, accessible labels, Close control and action options inside its `document.body` portal. Selecting an option still dispatches its original action identity and amount.
- Added jsdom as a test-only dependency and five DOM regressions: all authored Chinese/Spanish values (including interpolated/composed forms) remain idempotent; real MutationObserver initial/repeated scans preserve Chinese and protected private text; actual trainer JSX fragments still translate; four-locale session list/detail click flows preserve titles; a 390px action portal opens, closes and selects correctly without any root observer. This is DOM/interaction testing, not rendered browser geometry or screenshot verification.
- Post-fix verification: 101 targeted tests passed, configured typecheck passed, production build passed, Sites packaging tests 7/7 passed, and `git diff --check` passed. Configured lint still reports the same seven baseline errors in ProductApp/ServiceSite. Existing large-chunk warning remains. The three earlier resource-limited compute-heavy suites and visual-browser limitations described above remain unverified; no broader all-pass claim is made.

## 2026-10-05 — Drill animals and Ranked Stats
- Drill Stats: shared animal artwork in the style KPI/map and roster; existing 30 distinct-question / 10 open / 10 response / 3 spot classifier preserved. Agent VPIP/PFR baseline not reused.
- Ranked Stats: readiness-gated tab, server-confirmed rating/peak, weighted practice score, match count/change and history; individual action/animal analysis explicitly unavailable. New ranked answers excluded from local drill history; old untagged data limitation disclosed.
- Browser QA: actual `/stats` guest sign-in gate preserved. Component rendering verified with a temporary, non-production fixture at 1280×720 and 390×844; drill animals, ranked table and unavailable-action copy visible; no document overflow at 390px. Existing `.ranked-stats` CSS collision found and resolved with a scoped class. Fixture removed after verification. Actual authenticated server stats not tested (local authentication unavailable).
- Focused tests cover sample-gated animal mapping, server-only stats, readiness gate and ranked-answer separation. Typecheck/build and analysis/ranked UI/workflow/Sites tests pass. Build retains existing bundle-size and translation duplicate-key warnings. No production verification performed.

## 2026-10-05 — Range leading card: board/settings switch
- Matched the user's Cash 100bb / 6max / rake screenshot to `RangeWorkspace`'s leading action-path card, not the marketing preview.
- Preflop keeps the existing game-settings card. Postflop defaults to Board with an immediate Board / Settings toggle; cards edit their existing street dialog and reflect only currently visible street blocks. Reset returns to preflop. Four-language control labels are included.
- Verification: `npm --prefix apps/frontend run typecheck` passed; `node --test tests/range-context-card.test.mjs` passed 3/3 (transition/switch/edit/reset, turn/river/pending/rewind/reentry, four locales); frontend production build passed. Existing trainer CSS syntax and bundle-size warnings remain outside this change.
- Browser: actual guest preflop screen preserved; isolated live component fixture verified five-card Board and Settings switching at desktop / 390px. Fixture removed afterward. Authenticated postflop end-to-end could not be verified because the available local browser is Guest; no sign-in bypass was used.

## 2026-10-05 — Ranked / Agent shared table UI
- Base: `b42490b`. Extracted presentation-only `PokerTable`, seats, chips and action buttons for both local Agent and server-ranked FastFold; preserved Agent reveal timing/history/style drawer and actual ranked opponent types. Mobile uses the same portrait layout. Lobby/loading/error screens remain scrollable (fixed-height clipping corrected).
- Server authority, authentication, version/CAS, idempotent retry and account isolation are unchanged; no local ranked engine/scoring fallback. Uncertain delivery also disables Back until reconciled.
- Focused checks: `node --test tests/fastfold-ui.test.mjs tests/fastfold-app-integration.test.mjs tests/poker-table-ui.test.mjs` — 12 distinct cases passed (affected fixes rerun individually); `npm run typecheck`, `npm run build`, and `git diff --check` passed from `apps/frontend`. Existing translation duplicate-key / large-chunk warnings remain.
- Browser QA: implementer inspected shared Ranked at 1280×800 and 320px; six seats, five board cards and actions stayed within width. Parent CUA inspected existing Agent with its real local engine and Ranked with explicitly marked synthetic visual-only state. Actual authenticated Worker flow was exercised separately by the ephemeral SQLite/cookie integration test, not claimed as a production browser match. Temporary preview remains at localhost:5199; no app authentication bypass.
- Limits: PvP queue / waiting in Agent play not implemented; not deployed to production; remote CI unverified.

## 2026-10-05 — Ranked Exit / fixed 15-minute break
- Base: `57421d1`. Unified the table Back control as a single Exit: authenticated server break → `/learn/trainer/ranked/waiting`, same-hand Resume, or terminal Leave now. Reload restores the server deadline; no client-created/extended deadline, account logout, Agent-table redirect, or local ranking settlement.
- Countdown uses serverNow plus monotonic elapsed time, with focus/visibility reconciliation. At expiry, only server-confirmed session termination navigates to the trainer list with replace; offline/uncertain delivery locks actions and offers retry with the retained request identity/body. Existing account isolation and version/CAS protections remain.
- Focused checks from `apps/frontend`: `node --test tests/fastfold-ui.test.mjs tests/route.test.mjs`, `node --test tests/fastfold-app-integration.test.mjs tests/trainer-release-status.test.mjs` (integration fixture corrected and rerun alone), and `node --test --test-name-pattern='uncertain Exit|offline expiry' tests/fastfold-ui.test.mjs`: 23 distinct affected cases passed. `npm run typecheck`, `npm run build`, and `git diff --check` passed; existing duplicate-translation-key / large-chunk warnings remain.
- Browser QA: implementer checked the waiting room at 320px without horizontal overflow; waiting actions have 44px minimum height. Parent CUA verified actual Trainer routing with the explicitly labeled test-only synthetic server: Exit → waiting 15:00 → Resume same hand/cards/board → Exit → test-only expiry → trainer list, never Agent. Deadline/skew/boundaries are primarily covered by unit/server-clock tests; the authenticated ephemeral Worker/SQLite/cookie integration separately covers break/reload/resume/expiry. Synthetic visual evidence is not a production match; localhost:5199 preview remains available.
- Limits: expiry is enforced on the next server request, not a closed-tab alarm. PvP queue / Agent waiting remain unimplemented. PR #70 is not merged; production behavior and remote CI are unverified.

## 2026-10-06 — Six-human ranked queue / public profiles
- Base: `29932c8`. Actual ranked entry now uses the separate human season: no legacy Agent-ranked auto-resume; no hand before six authenticated people reserve and all six accept. While waiting, the existing local Agent engine runs explicitly unrated, without reading/writing saved Agent history. Acceptance occurs at the current practice hand completion boundary and waits for an open profile to close. Seated heartbeat renews player lease, not the table turn deadline.
- Shared seat plates are bounded with compact type names/ellipsis and full titles; seat and side avatars open the shared focus-trapped profile Dialog. Behind-modal numeric action shortcuts are suppressed. Human profiles use server-public anonymous names and observed samples, showing unknown for insufficient data. Waiting Agents use existing colored animal artwork and disclose balanced preflop / partial postflop. All seven ranks remain; sidebar min-content clipping was found at 1040px and fixed with min-width:0 and a bounded two-column ladder.
- Human Exit leaves other players running (existing all-ins remain eligible for settlement), then enters the fixed server-clock 15-minute break. Resume returns to the queue, not the departed hand. Server-confirmed expiry/leave returns to the trainer list. Same-body/ID retry, account isolation, table/player version separation, hidden cards and future-board boundaries remain server-authoritative.
- Focused checks: 38 distinct affected cases passed: human UI 10, shared/local Agent 4, legacy FastFold UI 14, leaderboard 5, readiness 4, and actual Trainer/Worker six-cookie SQLite integration 1. Commands: `node --test tests/human-ranked-ui.test.mjs tests/trainer-release-status.test.mjs tests/ranked-ui.test.mjs tests/fastfold-ui.test.mjs`; `node --test tests/poker-table-ui.test.mjs`; `node --test tests/fastfold-app-integration.test.mjs`; corrected endpoint/new boundary/CI/heartbeat cases were run individually. Final `npm run typecheck` (including backend/kernel), `npm run build`, and `git diff --check` passed. Scoped CI now registers human UI and shared-table tests; remote CI is not claimed passed. Existing duplicate-translation-key and large-chunk warnings remain.
- Browser QA: implementer inspected 1280×720 desktop and 320px waiting portrait (scrollWidth equals viewport; all seat plates within width), and post-fix 1040px sidebar right edge 1006px / width 247.6px. Parent CUA manually checked actual Trainer routes at 1040×666 with explicitly labeled TEST ONLY synthetic account/server/people: 1/6 unrated Agent → profiles/Escape focus return/blocked behind-modal key 1 → five synthetic people added (no instant human hand) → genuine local hand end/accept → all accept/human table → unknown public profile → Exit 15:00 break → Resume queue → Exit/test expiry → `/learn/trainer`, never Agent. The authenticated six-user Worker integration is separate evidence, not a production browser match. Temporary localhost:5199 preview stays running with visible add-people/all-accept/expire/reset controls.
- Limits: production six-human gameplay and production CPU/load remain unverified; synthetic preview is not matchmaking evidence. No deployment or Git operation was performed by the frontend implementer. Independent read-only review of the separately implemented multiplayer kernel found no confirmed P1/P2 issue; its successful tests were not rerun.

## 2026-10-06 — Profile blocks at the top of the poker sidebar
- Base: `1070e93` (PR #72 follow-up). Seat and sidebar-avatar clicks now show one common compact profile block as the first child of the existing sidebar in normal Agent practice, unrated ranked-waiting practice, and human ranked play. Close/person switching, four locales, actual policy scope and unknown/insufficient public human samples are retained; all seven rank tiers remain. This is not a modal, does not trap focus, and does not stop play or hand-boundary acceptance. Focused controls ignore betting shortcuts; separate real dialogs retain their guards. No server authority, authentication, scoring or queue logic changed.
- Focused verification: `node --test --test-name-pattern='profile|waiting Agent holds' tests/poker-table-ui.test.mjs tests/human-ranked-ui.test.mjs` passed 5 cases; `node --test tests/fastfold-app-integration.test.mjs` passed 1 actual authenticated six-cookie Worker/queue integration case. Configured `npm run typecheck`, `npm run build` and `git diff --check` passed. Existing translation duplicate-key and large-chunk build warnings remain.
- Browser: parent CUA at 1224×722 confirmed seat ORION → first-sidebar block → sidebar VEGA switches the same block → Close removes only the profile, retaining queue/rank lists; no dialog was present and Agent turns continued. Own 320×700 checks confirmed normal real-engine Agent, waiting Agent and synthetic human profiles are visible first in their sidebar, without document horizontal overflow (320px document width; profile widths 292/272/272px). With the waiting Agent profile still open, its hand completed and acceptance advanced; the synthetic all-accepted human table showed its public unknown-sample block and retained the rank ladder.
- Visual preview is explicitly TEST ONLY synthetic account/server/people at `http://localhost:5199/learn/trainer/ranked/play`; normal Agent uses its real local engine at `http://localhost:5199/?mode=agent`. This is distinct from the real authenticated test above, not production six-person gameplay. Latest profile behavior in production and final-head remote CI are unverified; CI began on the preceding head only. Preview server remains available for review.

## 2026-10-06 — Unavailable departed-seat profile integrity
- Nullable server-public `rating`/`hands` and explicit `unavailable` seats render owned departed-player copy in all four locales; actual player names remain protected. Clicking a tombstone shows the existing sidebar-first unavailable block without an opponent request or invented identity/statistics. A real profile returning 404 also shows unavailable, not zero samples, and late failures cannot replace another selected profile. Six-person start eligibility, waiting Agent behavior, hand actions and rank ladder are unchanged.
- One focused four-locale departed-seat/404 regression passed (`node --test --test-name-pattern='departed nullable' tests/human-ranked-ui.test.mjs`); configured frontend/backend runtime typecheck passed. No repeated broad suite/build or production visual claim for this small DTO/error-state follow-up. Existing duplicate-key warning remains.
- Backend owner separately reports its real SQLite deletion-consistency regression 1/1 passed (no skip) and scoped typecheck passed: cascade and prior results, current owner/once-only overlapping settlement, remaining-five/all-in conservation, raw-ID removal and foreign-key consistency. This repairs a new-schema inconsistency not reachable through the current user API; no retirement endpoint was added and source-bound policy data is unchanged.

## Fixed mobile gameplay — 2026-10-06
- Agent, unrated human-queue practice, human Ranked and compatible legacy FastFold share selectable nonmodal details panels. Desktop retains the profile as the first sidebar block; no game/scoring/API/history changes.
- Scoped frontend checks: 32 passed across shared mobile-details cases, human-ranked-ui, poker-table-ui and fastfold-ui; both TypeScript checks and production build passed. The two mobile cases were then moved into CI-registered poker-table-ui.test.mjs and its focused integration run passed 2/2. Existing duplicate-copy/chunk warnings remain. Final CSS refinements were rebuilt in the local preview.
- Parent CUA verified synthetic human play at 320×568 (Profile/Rank open) and 650×360: six separate seat plates, visible board/hero cards, all current actions 44px high, no document overflow. Rank panel retained seven tiers with contained scrolling. Tall portrait cards increased to 30×42 / hero 38×52 following 390×844 QA.
- Parent CUA additionally verified 390×844 normal Agent with Profile open and Exit → library, plus desktop 1280×720 first-sidebar profile placement with zero dialogs. Mobile current actions remained usable during profile inspection.
- Preview is visibly TEST ONLY at localhost:5199, using actual Trainer shell and gameplay components with synthetic account/server/people. This is not proof of six authenticated humans or live ranked end-to-end behavior. Parent owns release and authenticated production checks.

## Mobile profile integration wait — 2026-10-06
- PR #74 CI run 37347409852 exposed a test timing assumption: the immediately rendered Loading profile block was mistaken for a resolved public profile. The existing actual-Trainer integration now waits for server-returned Unknown content with its existing settle helper, retaining the original profile/sidebar assertions. No product, request, gate or timing behavior changed.
- Reran only `node --experimental-strip-types --test tests/fastfold-app-integration.test.mjs`: 1/1 passed, zero skips. Its ephemeral authenticated six-cookie/SQLite flow still covers unrated Agent completion → six-human acceptance → server handoff/profile → action → break/reload/resume/expiry. Existing duplicate-copy warning remains; this is not a production gameplay claim.

## Full-width gameplay / profile and history modals — 2026-10-06
- Latest user correction supersedes the earlier sidebar-first profile/nonmodal details layout: normal Agent, waiting Agent, human Ranked and shared legacy FastFold now use optional shared Dialog profiles/history/controls, with body portals and no reserved sidebar or details-tab row. Opponent cards remain caller-hidden until legitimate reveal; the compact top-right rail uses actual hero cards and recorded signed bb results. Practice hand-boundary acceptance is not paused by inspection.
- Parent CUA: at 650×360, all six hole-card groups contained two cards, no group intersected another seat's plate, and actions were 44px high at y209–286 across the full 638px gameplay width. At 320×568, the profile backdrop covered the full 320×568 viewport, the dialog measured 296×337.5, document size stayed 320×568, and Escape restored the original avatar's focus. At 390×844, synthetic human flop play retained all six card pairs, actual fixture hero AK and four 44px actions without document overflow. Normal Agent naturally folded/dealt the next hand and showed its actual 4♦3♥ / 0 bb history chip. At 1280×720, gameplay was full-width with no details lane; optional controls retained all seven rank tiers. Parent read-only review reported no blockers.
- Verification: configured TypeScript checks and production build passed; 35/35 scoped cases passed in `human-ranked-ui`, `poker-table-ui`, `fastfold-ui`, `dialog` and actual-Trainer `fastfold-app-integration`; `git diff --check` passed. Tests retain six-human/all-accept, exact uncertain-request retry, sign-out isolation, hidden-card and ephemeral waiting-history assertions, plus modal focus/backdrop/shortcut/unknown-profile/late-reply coverage. Existing duplicate-copy and large-chunk warnings remain.
- Browser preview at localhost:5199 is explicitly TEST ONLY, using the actual Trainer shell with synthetic account/server/people; normal Agent uses its real local engine. The separate authenticated six-user ephemeral Worker/SQLite integration is test evidence, not a production browser match. No production gameplay, deployment or remote-CI success is claimed; parent owns release. No commit/push by implementer.

## Left-aligned gameplay history rail — 2026-10-06
- Follow-up to the full-width modal layout: current hero hand stays first on the left, followed by only the newest three completed hands; the ellipsis remains an independent 44px control at the far right. Shared behavior remains in `GameplayDetails`; existing modal, hidden-card and result handling are unchanged.
- CUA verified normal Agent after three genuine local folds: current hand plus exactly three recent chips fit at 320px without colliding with the right control. Short portrait human flop table separates the top-center plate/cards below the rail and above the board. At 650×360, history begins after Exit/title, Leaderboard and ellipsis occupy the right without overlap; 390×844 and desktop 1280×720 remained clear. Human preview state was explicitly synthetic; no live ranked behavior is claimed.
- Verification: `node --test --test-name-pattern='history rail keeps' tests/poker-table-ui.test.mjs` passed; all 8 `poker-table-ui.test.mjs` cases also passed before final CSS-only tuning. `npm run typecheck` and final `npm run build` passed; existing duplicate-copy and large-chunk warnings remain. `git diff --check` passed. No commit/push; parent owns release.

## Mobile gameplay bottom tabs — 2026-10-06
- CUA on the explicitly TEST ONLY local preview at 320×568: gameplay hides the bottom tabs, reclaims their reserved padding, and keeps all three actions at least 44px high.
- At 650×360, tabs remain hidden and actions stay visible/full-width near the bottom; Back to Trainer restores the tab bar and its normal clearance after gameplay ends.
- Scope is gameplay routes with `.game-details`; library and break views retain normal navigation. This preview is not live or production evidence.
- Focused table UI tests, frontend typecheck, and direct Vite production bundling passed; no commit or push by implementer.

## 2026-10-07 — Service-site audience scroll gap
- Reproduced on `https://reysonai.com` and local baseline at 1280×720, continuous scrollY=720: the 300vh audience section inherited desktop flex centering, placing its sticky wrapper at y=872 while the section began at y=152.
- Scoped `.site-audience.is-scrolly` to block layout, preserving the existing sticky scenes and mobile/reduced-motion flow.
- Local browser after fix, same continuous scroll position: wrapper y=153, heading y=282, audience grid opacity=1. Forward/backward scrolling also kept the sticky content visible. Screenshots captured internally only.
- Targeted `tests/site-surface.test.mjs`: 22 passed. Production build and Sites worker test results recorded in the PR.

## 2026-10-07 — Phone scroll storytelling follow-up
- Phone audience now uses the same scroll-selected sticky personas at viewport heights ≥740px; How-it-works cards stack/pin using native document scrolling. Short screens remain ordinary flow. Training/ranked/agent and the long comparison remain naturally scrollable on phones so their controls and copy are not clipped.
- Motion polish: shorter 18px reveals and a subtle persona settle; no decorative progress bars, touch/wheel interception, or new scroll containers. Reduced-motion continues to disable scrolly state and animation; mobile scene pinning is gated by `.has-motion`.
- Chrome responsive QA: 390×844, English and Japanese, beginner/budget scenes, complete Free CTA and note reachable; an observed oversized translated/card layout uses ResizeObserver to let the sticky top move upward rather than trap content. PageDown exited audience normally and pinned the next scene at y=80.
- 375×667: audience/How-it-works/Training all normal flow. 1280×720: audience uses block layout and existing Training horizontal scrolly remains enabled. Internal screenshots only.

## 2026-10-07 — Phone hero heading over live range
- At widths ≤560px, layer the existing single heading over the live chart using grid placement and a legibility scrim. The overlay has `pointer-events: none`; all saved range cells remain keyboard/tap targets. Paragraph, actions, and note follow below the chart without a duplicate heading. Desktop CSS remains outside this override.
- Targeted overlay regression test: 1 passed. Production build passed; diff check passed.
- Parent browser review: 390×844 English overlay readable over the top matrix; 375×667 Japanese retains the existing English heading with Japanese body/CTAs usable below; 1280×720 English desktop preserves separate left copy/right matrix with no overlay. Physical Safari remains unverified.

## 2026-10-07 — Revised phone hero: decorative square backdrop
- Supersedes the earlier heading-only overlay: all existing heading/body/actions/free note are centered together over a subdued decorative chart. Understand why is larger/pink; Don't just play is smaller/muted. The matrix keeps aspect-ratio 1 independently of the hero content height.
- Phone chart wrapper uses media-synchronized `inert` plus `aria-hidden`; hidden matrix buttons are not focusable. Desktop media restores the original interactive chart. Selected-hand detail content remains unchanged.
- Disable chart/cell entrance animations on the mobile backdrop so animation fill modes cannot override its .18 opacity or cause a diagonal reveal. Restore copy align-self:center instead of desktop end-alignment.
- Parent visual QA: 390×844 English centered composition/square backdrop; 375×667 Japanese text/CTAs/free note fit with square backdrop; 1280×720 desktop preserves separate copy/chart. Desktop clicking and physical Safari were not interactively verified. Media restoration inspected in code.
- New decorative/square guard test and hostname SSR regression passed; production build and diff check passed.

## 2026-10-07 — Flush square phone hero
- Remove viewport-height spacing and the 16px outer inset on phones. The hero main is full-width with aspect-ratio 1, no external padding/margin, and compact centered typography/spacing. All copy still overlays the decorative square; CTA target remains 44px and no text clipping is introduced.
- Parent visual QA: 390px English and 375px Japanese show all copy inside the full-width square, with Selected hand immediately below. Measured 375px Japanese: hero width=375, height=375, bottom=439; following detail top=439 (zero gap).
- Targeted square/decorative guard test and build passed; diff check passed. Physical Safari remains unverified.

## 2026-10-07 — Final headline and matrix edge alignment
- Reset the matrix scroll wrapper's desktop focus-ring padding/margins only in the inert mobile background; keep normal 2px internal cell gaps. This removes the below-header/right-edge strip without changing the square or desktop focus-ring space.
- Final shared English headline/tagline: Don't just play. Understand the reason. First line is larger white; second line muted gray on mobile. Update English headline/footer literals across locale copies and existing English metadata without rewriting translations.
- Parent QA: 390px English matrix x=0,y=64,width=390,height=390,right=390,bottom=454, matching the hero exactly; 375px Japanese copy/CTAs fit. 1280px desktop longer headline fits its left column without overflow.
- Targeted edge/copy tests and production build passed; diff check passed. Physical Safari still unverified.

## 2026-10-07 — Compact phone Selected hand / Why panel
- Only at ≤560px: reduce decorative card width, hand heading, frequency-row spacing, panel padding and Why spacing; remove the invisible spacer row. Keep all frequencies/explanations, Explore CTA minimum 44px, and playback controls. Desktop and square hero untouched.
- Parent visual QA: 390px English Selected hand/Why/CTA/playback fit below the 390px square within the 844px viewport. 375px Japanese remains readable without overflow; CTA is reachable through normal scrolling. No exact percentage height reduction claimed.
- Focused compact-panel regression test, production build and diff check passed. Physical Safari remains unverified.

## 2026-10-07 — Flat SVG suits on service-site cards
- Site variant only: use existing Phosphor filled Spade/Heart/Diamond/Club SVGs in the existing suit slot. SVG is aria-hidden/non-focusable; original suit text remains visually hidden. Trainer, Agent and text variants preserve their exact previous markup. Rank, gradients, colors and responsive sizes unchanged.
- Parent browser QA: 390px mobile heart rendered flat; SVG viewBox=256 and aria-hidden confirmed. 1280px desktop layout preserved. Four different filled suit shapes and site-only behavior covered by six focused shared-card tests.
- Focused tests, production build and diff check passed. Actual iPhone rendering is not verified; no claim of device testing.

## 2026-10-07 — Hide phone analysis sample
- At ≤560px hide only `.site-analysis .site-dash` with display:none. Keep the analysis heading, explanation, points and truthful practice-data note unchanged. Existing single-column phone grid has no remaining sample slot/gap; desktop sample remains in the DOM and restores normally.
- Parent DOM QA: 390px sample display:none,height=0; 1280px display:block,height≈458px. No visual analysis-screen claim: viewport resizing shifted the screenshot to another section.
- Focused hide-scope test, production build and diff check passed. No merge/deploy.

## 2026-10-07 — Ranked preview matches current Human FastFold
- Current source truth: TrainerPage routes ranked play to HumanRankArena. human-api status gate requires human-fastfold-v1/six_verified_humans/6 players/shadow comparison/no applied penalty; humanRankState adapts server records only. HumanRankArena displays current rating, rated hands, net bb and bb/100, plus queue participation and RankLadder. TrainerHome uses unrated Agent practice while waiting.
- Replace site-only quiz scoring/quota/Peak/pips with a visibly non-live sample: rating/tier, 120 hands, +18bb and +15bb/100, example 2/6 human queue, shared tier thresholds and Legend top-10-Masters rule. Sample values are coherent illustrations, not fetched server data; availability still requires verified sign-in/server readiness and no AI penalty is applied. Update all four locale ranked copies; actual app/backend untouched.
- Parent 390px English screenshot and scrolling: sample metrics/Legend/queue/shadow caveats fit with no horizontal overflow. Desktop existing layout retained; no new desktop visual check claimed.
- Locale/surface tests: 38 passed. Update three stale hero-title expectations from the previously authorized reason-copy revision. Build/diff check passed; no merge/deploy.

## 2026-10-07 — Trim ranked sample and label rewards as planned
- User narrowed the sample to Human FastFold title, rating/rated-hands card and rank ladder. Remove result/bb100/queue panels and their unused copy/CSS. Keep Sample/not-live label; move availability/illustration/shadow caveats into the section explanation.
- Add general rank-based rewards planned text in all four locales, with contents/distribution conditions to be announced. Current main/development contains no reward allocation/granting implementation. A separate unpublished historical preview is not treated as an authoritative offering; publish no exact allocation, Plus entitlement, cash/physical prize or issued-benefit claim.
- Parent 390px English visual review: planned reward text visible and mock contains only requested card/ladder, no result/queue, fits without horizontal overflow.
- Locale/surface tests: 38 passed. Production build and diff check passed; no merge/deploy.

## 2026-10-07 — Reconcile desktop PR107 with mobile PR106
- User-authorized integration of exact PR107 head ae698e61c277c22e2288ec845b21efb6407e2ebc into PR106; PR107 branch is untouched. Resolve ServiceSite.tsx, site.css and four locale conflicts individually: preserve desktop viewport-height saved-range/random-tour/legend work and latest reason wording, phone square inert backdrop/compact detail/playback, SVG suits, hidden phone analysis sample and truthful trimmed ranked/rewards-planned copy.
- Responsive Explorer mounts one desktop or phone tree based on the same ≤560px media query; phone does not mount the desktop legend or additional estimate line, desktop does not mount the phone detail/focus targets. New shared saved preflop/postflop datasets and frequency/reach tests remain intact.
- Locale/surface/shared-card tests: 48 passed; additional targeted responsive single-tree DOM guard: 1 passed. Production build passed (existing chunk-size warning). Diff check passed.
- Attempted focused browser QA through CUA: IAB unavailable; fresh Chrome preview creation timed out and reset the kernel. No new 390/1280 rendered verification or actual iPhone claim. Responsive appearance remains unverified for this integration; prior standalone mobile screenshots do not prove the merged version.
- No merge to development/main or deployment. PR106 now includes PR107 ancestry: review/merge ordering must account for this overlap rather than merging conflicting versions independently.

- Parent merged visual QA: 390px phone preserved; 1280px desktop saved-range/legend layout visible. Longer retained reason tagline initially clipped; desktop mark now scales to copy-container width, with phone inheriting its existing size. Final targeted desktop visual recheck pending.
