# Design QA — Persisted Estimated Ranges (2026-09-23)

## Remove redundant weakness tab (2026-09-27)
- Removed the dedicated 弱点 item from the sidebar. Strengths and weaknesses remain in プレー分析, and its existing detail link still opens the detailed review screen.
- Browser verification at `http://127.0.0.1:5174/app`: the sidebar shows レンジ分析 / トレーナー / セッション / プレー分析 without 弱点; プレー分析 → 弱点の詳細を見る still opens the review details. All 212 UI tests, typecheck, build, 4 Sites tests and lint passed. The existing large-chunk build warning remains.

## Practice sessions and hand history (2026-09-27)
- Added a セッション destination with a dated practice list, status filtering, and a detail view of the exact saved answer log. In-progress sessions can be resumed; completed named drills and review attempts keep their hand logs locally. Existing summary-only attempts explicitly say their per-hand history was not recorded.
- Browser verification at `http://127.0.0.1:5174/app`: opened an interrupted one-answer session, saw its saved Q5o hand and verdict, resumed it, finished it, and confirmed the completed hand history remained after reloading. The narrow viewport stayed readable with horizontal scrolling for the table.
- All UI tests, typecheck, production build, Sites tests, and lint passed. The existing Vite large-chunk warning remains.

## Solvea AI Score trend (2026-09-27)
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

## SolveaAI brand rename (2026-09-23)
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
- Source: user screenshot showing two disconnected selection surfaces; intended change is one cohesive, expandable SolveaAI panel rather than exact screenshot replication.
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
- Rebranded session-storage keys migrate from the previous SolveaGTO key, so an in-progress selection survives the app rename and reload.
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
- Removed the footer strip and its “SolveaAI v0.1” / “AI生成ソリューション” labels from both app shells. The separate estimate context/status row was removed in a later iteration to enlarge the range tables.
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

## Solvea service site (2026-09-25)
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

## Turn/river card-picker layout (2026-09-30)
- Replaced the rank-major 52-card wrap with four labeled suit rows. The dialog now shows the existing board, preserves unavailable-card and selected-card states, and wraps each suit into two rank lines on narrow screens.
- Browser verification on `/app`: completed BTN open → BB call → flop A♠ 7♦ 2♣ → turn K♠ → river. The river dialog showed four suit groups, the four used cards disabled, and a readable desktop layout. A 390px viewport also showed all four groups without horizontal clipping.
- Verification: 24 postflop-trial tests, typecheck, all 286 UI tests, production build, and 5 Sites tests passed.
