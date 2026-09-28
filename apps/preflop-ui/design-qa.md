# Product language QA — 2026-09-27

## Sidebar backdrop QA — 2026-09-28

- At a 1100px viewport, collapsing and reopening the docked sidebar leaves the backdrop hidden and the range workspace at normal brightness. The sidebar remains in the layout rather than covering it.

- Fresh `/app` visit: English onboarding selected by default; level descriptions and controls are English.
- Existing profile: English range workspace, trainer, session list/detail, and player analysis checked in the local browser.
- Selected preflop hand: English AI reasoning uses the saved equity, action frequencies, and EV facts; no strategy dataset changed.
- Trainer answer: English feedback and study note checked. Flop trial: English board/hand explanation checked on a saved representative board.
- Language menu: English/Japanese choices visible; choosing Japanese reloads the Japanese UI and sets `lang="ja"`.
- Build, full UI tests, and Sites packaging tests are run before delivery; unrelated in-progress changes are preserved.
