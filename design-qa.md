# Design QA — Persisted Estimated Ranges (2026-09-23)

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
- `npm run build` and `npm run test:sites` pass in `apps/preflop-ui`; Sites client/server/hosting outputs are present.
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
- Review packets now include SB limp and both limp-response nodes. Full audit and handoff: `apps/preflop-ui/.local/review/range-balance-2026-09-24.{md,json}`; packet canary answers remain separate.

## Solvea service site (2026-09-25)
- Added a separate service site at `/`, retaining the existing estimated-range workspace at `/app`. The landing preview shows an interactive 13×13 matrix and K7s decision from the saved BTN-open and BB-vs-BTN data. A small generated projection keeps the marketing bundle independent of the larger app datasets.
- Desktop (1280px), tablet (768px), and mobile (390px) were visually checked in the local browser. The mobile document stays within its viewport; the matrix remains readable with horizontal overflow available where needed. Spot switching changed K7s to BB-vs-BTN Call 85%, the mobile menu navigated to Pricing, and the free CTA opened the existing onboarding at `/app` with Japanese document language.
- Planned natural-language adjustments, advanced training, accounts, paid features, and provisional ¥680 pricing are explicitly identified as unavailable. The mixed-frequency comparison is labeled illustrative rather than competitor data.
- Verification: `npm run lint`, `npm run typecheck`, `npm test` (142 passed), `npm run build`, and `npm run test:sites` (4 passed). Vite still warns about large existing product-app chunks; marketing and product routes are split.

## Japanese service site (2026-09-25)
- Added `/ja` with a language switch while keeping `/` English and `/app` Japanese. All marketing sections, saved-range preview explanations, provisional pricing, accessibility labels, document language, title and description are localized.
- Browser verification at desktop/tablet and 390px mobile: Japanese hero and pricing remain within the viewport; the BB-vs-BTN preview shows K7s Call 85% in Japanese, mobile navigation reaches `/ja#pricing`, and the planned/billing caveats remain explicit.
- English switching returns to `/` with English title and document language; `/app` still opens the original Japanese onboarding. Lint, TypeScript check, 143 tests (including locale-shape parity), build and 4 Sites tests pass. The pre-existing product-app bundle warning remains.
