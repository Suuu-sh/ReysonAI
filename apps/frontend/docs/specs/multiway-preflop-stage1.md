# 仕様：マルチウェイ・プリフロップ 段階1（Astra 向け）

この依頼文そのものがユーザーとメインの Claude からの指示です。確認のために止まらず、最後まで作業してください。
git commit / push はしないこと（コミットはメインの Claude が確認後に行う）。他セッションの未コミット変更は巻き戻さない。

作業ディレクトリ: `/Users/yota/Projects/Products/SolveaGTO/apps/frontend`

## 0. 最初に必ず読む

- `AGENTS.md`、`src/estimated/AGENTS.md`（特に 2026-09-25 の multiway / squeeze、2026-10-02 の cold call 割引の項）
- `../../.claude/agents/range-author.md`（レンジ作成の手順。このファイルの「要点」「トークン節約」を全部守る）

要点（抜粋）:
- 前提は `configs/cash-6max-100bb.json`（6max・100BB・レーキ5%上限3BB・固定サイズ）。ハンドごとにサイズを変えない。
- レンジは `scripts/generate-*.py` の generator に手札グループごとの頻度を書き、`npm run build:estimates` で出力する。**JSON を直接編集しない。**
- コールは call EV（`src/estimated/call-ev.ts` / `scripts/apply-call-ev.mjs` / `scripts/call_policy.py` の共有ポリシー）で判断する。
- 監査（`src/estimated/audit.ts`）: 降りすぎ・流れ・強さの順序と逆転・EVマイナスのコールは違反ゼロ。バランス（range-capped / over-segregated）は警告ゼロを目指す。受け身アクションをキャップしすぎない・分離しすぎない。
- 外部ソルバーの値を写さない（ベンチマークはオープンのみ）。
- 確認は `npm run range -- check <spot ...>`、構成は `npm run range -- list <filter>` / `view <spot>`。大きな JSON を丸ごと読まない。
- 最後に1回だけ `npm run pipeline -- --max-iterations 1` で公開し、理由文（`reason-facts.mjs` → `compose-reasons.mjs`）も再生成されることを確認する。
- UI ファイル（`src/estimated/RangeWorkspace.tsx` ほか range-author.md に列挙のもの）は触らない。

## 1. 作るもの（優先順。1a を終えてから 1b）

管理画面 `src/admin/coverage.ts` の「期待スポット」に対して未作成のもの。ID はそのファイルの命名に合わせる。

### 1a. 既存 generator の拡張

1. **コーラー1人のマルチウェイ応答（残り8）** — `scripts/generate-multiway-responses.py` → `multiway-responses.json`
   - `CO_vs_UTG_HJcall`, `BTN_vs_UTG_HJcall`, `BTN_vs_UTG_COcall`, `BTN_vs_HJ_COcall`（ヒーローが非ブラインド。後ろにまだプレイヤーがいる）
   - `BB_vs_UTG_SBcall`, `BB_vs_HJ_SBcall`, `BB_vs_CO_SBcall`, `BB_vs_BTN_SBcall`（SB がコーラー、BB が最後）
   - アクションは既存と同じ fold / call / squeeze。スクイーズサイズは既存ルール（`sizing_rules.py`）に従う。
   - 非ブラインドのヒーローは後ろに残る人数でコールを割り引く（2026-10-02 の `COLD_CALL_SQUEEZE_EQR` と同じ考え方を流用）。
   - SB がコーラーになるには、SB の「オープンへの応答」にコールがあることが前提。現状 SB は 3bet-or-fold なので到達しない。その場合は到達不能（fold=100 プレースホルダー）として既存の unreachable の扱いに揃え、理由文もそれに合わせる。
2. **スクイーズへの応答（残り24）** — `scripts/generate-squeeze-responses.py` → `squeeze-responses.json`
   - 現在 `SQUEEZERS = ['BB', 'SB']`。非ブラインド（CO / BTN）がスクイーズした履歴と、1a-1 で増えるマルチウェイ履歴に対応する応答を追加する。期待 ID は coverage.ts の `squeeze` カテゴリ（`{O}_vs_{S}_squeeze_{C}call` / `{C}_vs_{S}_squeeze_{O}fold` / `{C}_vs_{S}_squeeze_{O}call`）。
   - スクイーズした側の後ろに残るプレイヤーは、スクイーズに対して全員フォールドした前提で良い（既存の SB スクイーズで BB が降りた扱いと同じ）。その前提を AGENTS.md に1行書く。

### 1b. 新しい generator

3. **コーラー2人以上のマルチウェイ応答（15）** — 新規 `scripts/generate-multiway2-responses.py` → `multiway2-responses.json`（新データセット）
   - ID は coverage.ts の `multiway_two_callers`（`{hero}_vs_{opener}_{c1}call_{c2}call`）。
   - アクション fold / call / squeeze。スクイーズサイズは既存のスクイーズ規則をコーラー2人分に拡張（`sizing_rules.py` に関数を追加。既存値は変えない）。
4. **コールド4betへの応答（40）** — 新規 `scripts/generate-cold-four-bet-responses.py` → `cold-four-bet-responses.json`
   - ID は coverage.ts の `cold_four_bet`（オープナーの応答、3bettor の応答）。
   - アクション fold / call / 5bet（100BB オールイン）。4bet サイズは既存の `four_bet_to` に従う。
5. 新データセットを pipeline に登録する: `scripts/pipeline.mjs` の `files`、`scripts/build-estimates.mjs`、`src/estimated/audit.ts`、`scripts/reason-facts.mjs` / `compose-reasons.mjs`（理由文の型を追加）、`scripts/lib/reason-context.mjs`（fingerprint の元データ）、`src/admin/coverage.ts`（`file` と `data` を設定して未モデル化を解除）、`src/estimated/datasets.ts` の読み込み対象。既存データセットの実装を手本にする。

## 2. 守ること

- ヘッズアップの既存データ（opening / preflop-ranges / three-bet / four-bet / five-bet / limp / limp-deep）の頻度を変えない。pipeline の差分で、これらが変わっていないことを確認する。
- 新しい局面のレンジは、その局面に到達するレンジ（前のアクションの保存頻度）と矛盾しないこと（到達しない手は unreachable）。
- 理由文は全ハンド（169）にあること。保存頻度と一致すること。

## 3. 完了条件

- `npm run pipeline -- --max-iterations 1`：監査の違反0、benchmark ±3pt 超え0（オープンは変えていないので変化なし）。
- `node --test tests/*.test.mjs` が全件成功。新データセットごとに「期待 ID が全部ある」「全ハンド169」「理由ファイルがある」テストを追加。
- 管理画面（`src/admin/coverage.ts` の `coverageCatalog()`）で、コーラー1人 20/20、スクイーズ 60/60、コーラー2人以上 15/15、コールド4bet 40/40。

## 4. 最後に返すもの（`docs/specs/multiway-preflop-stage1.result.md` に書く）

- 変更ファイル一覧
- 局面ごとのアクション構成（コンボ加重の fold / call / raise %）
- 監査・benchmark・テストの結果
- 判断に迷った点、前提を置いた点（例：スクイーズ後ろの全員フォールド）
