# Design QA — Persisted Estimated Ranges (2026-09-23)

## Multiway-ready selection update (2026-09-23)
- Added Call and Fold to response-seat choices. Browser check: BTN opener + SB call + BB acting displayed three participant columns; changing SB back to Fold removed SB and restored the two saved heads-up matrices.
- Each participant starts with a clear pending-data state. On supported paths, a separate user-triggered local AI estimate may be cached outside the persisted datasets; it is unverified and is not a solver/GTO result. No heads-up frequencies are reused for multiway estimates.
- The non-GTO status remains visible. Unsupported paths stay pending; generated local data never overwrites saved heads-up estimates.

## Unified selection panel update (2026-09-23)
- Source: user screenshot showing two disconnected selection surfaces; intended change is one cohesive, expandable SolveaGTO panel rather than exact screenshot replication.
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
