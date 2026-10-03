# Account menu and settings

- On 2026-09-27 the user asked for an account menu (reference: a typical app account dropdown) with a subscription page, log out, language and appearance. The sidebar profile chip opens an upward menu (placed with fixed coordinates because the sidebar clips overflow): アカウント, サブスクリプション, 外観, 言語 (EN / 日本語 submenu), ログアウト.
- Settings live under the アカウント section with tabs account / subscription / appearance / language (`アカウント#tab`).
- Accounts and billing do not exist: sign-in stays a disabled 準備中 control, the Plus plan is read from `src/site/content*.ts` pricing and shown as provisional with no working purchase button, and ログアウト only removes this browser's local profile (optionally also practice data under `solveaai.trainer.*`).
- Appearance preferences are real and local: range display mode (shared with the range view's key), four/two-colour trainer cards, and reduced motion, applied as `<html data-cards / data-motion>`. The light theme is shown as 準備中.
- Language uses the existing `i18n.ts` locale; native language names are marked `translate="no"` so the English surface translator leaves them as 日本語 / English.
