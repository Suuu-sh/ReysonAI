# Product language QA — 2026-09-27

## Sidebar backdrop QA — 2026-09-28

- At a 1100px viewport, collapsing and reopening the docked sidebar leaves the backdrop hidden and the range workspace at normal brightness. The sidebar remains in the layout rather than covering it.

- Fresh `/app` visit: English onboarding selected by default; level descriptions and controls are English.
- Existing profile: English range workspace, trainer, session list/detail, and player analysis checked in the local browser.
- Selected preflop hand: English AI reasoning uses the saved equity, action frequencies, and EV facts; no strategy dataset changed.
- Trainer answer: English feedback and study note checked. Flop trial: English board/hand explanation checked on a saved representative board.
- Language menu: English/Japanese choices visible; choosing Japanese reloads the Japanese UI and sets `lang="ja"`.
- Build, full UI tests, and Sites packaging tests are run before delivery; unrelated in-progress changes are preserved.

## Turn / river trial QA — 2026-09-28

- Local `/app` browser walkthrough on the persisted BTN-open / BB-call SRP and representative A♠ 7♦ 2♣ flop: selected K♥ turn and 3♠ river, completed flop Bet 33% → Call and turn Check → Check, then verified 169-hand AI-estimated matrices, selected-hand facts/action bars, and the river bet response heading.
- Used-card options were disabled in both single-card dialogs. Fold/all-in stop states and chip replay parity are covered by the postflop-trial tests.
- At 1280×720, the river matrix and selected-hand detail fit in the viewport; the action path remains horizontally scrollable. Restored the browser's default viewport after verification.
- Browser preview is open on local `/app`; no local strategy files were changed.

## App copy cleanup QA — 2026-09-29

- Opened the production preview at local `/app` in English and checked the range workspace and player-analysis screen in the browser.
- The requested source scan has no user-facing matches for AI-estimate, GTO, or unverified disclaimers outside comments, `src/site/`, and `src/admin/`.
- `npm test`: 282 passed. `npm run test:sites`: 5 passed. `npm run build`: passed and emitted the client, server, and hosting artifacts.

## Per-action betting table (2026-10-01)
- At betting decisions (first/lead nodes and facing-bet nodes with a raise option) the hand detail now shows one compact table: shown frequency, opponent folds, your equity when called, and the exact class EV, with the best-EV action marked. A single combo shows the same table without EV (EV stays hand-class only).
- "Your equity when called" is the hero's equity against the part of the opponent's range that continues, using the defence's own equity measure (exact on river, all rivers on turn, the defence's 300 seeded runouts on flop); check uses the whole range. It is computed by a pure shared function (`flopBetTable`, and inside `explainLaterCombo`) used by the browser and the local middleware; the stored flop base is unchanged.
- The "Betting plan" size lines were replaced by 2-4 sentences built from the table (fold share, who calls, EV, when the shown strategy's main action trails the best EV by more than 0.3bb, and when the top EVs are close). Facing-a-bet reasons are unchanged. The table scrolls horizontally inside its own wrapper on narrow screens.
