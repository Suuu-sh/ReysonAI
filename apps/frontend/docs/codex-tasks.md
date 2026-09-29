# Codex に任せるタスク一覧

作成日: 2026-09-25 / 背景: [llm-decision-points.md](llm-decision-points.md)

共通ルール（全タスク）:
- cwd は `apps/frontend`。`src/estimated/*.json` を直接編集しない（生成は `npm run build:estimates` / `npm run pipeline`）。
- UI ファイル（RangeWorkspace.tsx 等、range-author.md に列挙）は触らない。
- 他セッションの未コミット変更を戻さない。commit / push / reset はしない。
- 完了条件は `npm test` が通ること＋各タスクの確認コマンド。

## A. 3bet 周りの EV モデル強化（先にやる）

1. **3bet ポットの EQR を分ける**
   - `src/estimated/eqr.ts` / `scripts/eqr.py` に 3bet 側・コール側の係数を追加（初期値は仮定、根拠コメント必須）。`scripts/lib/raise-ev.mjs` と 3bet 応答の call EV で使う。
   - 確認: `npm run raise-ev` の結果の変化を報告。
2. **後ろのプレイヤーを raise-ev に入れる**
   - 3bet 後に残る人のコールド 4bet / コールを、保存済みデータがあれば使い、なければ固定の割合（定数化）で近似。IP の 3bet が過大評価されないこと。
   - 確認: `npm run raise-ev -- CO_vs_HJ BTN_vs_UTG`。
3. **raise-ev を監査に組み込む（警告）**
   - `audit.ts` に advisory チェック `raise-ev-mismatch`（margin 0.5bb、局面ごとの件数）。blocking にしない。`npm run range -- check` にも表示される。
4. **4bet / スクイーズ / アイソ への拡張**
   - raise-ev と同じ方式で、3bet に対する 4bet、multiway のスクイーズ、limp へのアイソの EV を比べる。

## B. 手書き頻度を減らす（ルール＋例外）

5. **3bet レンジとフォールド率の連動**
   - オープナーの 3bet へのフォールド率から、3bet 側のブラフ量（または逆）を決める生成ルール。ブラフ候補は raise-ev の上位（ブロッカー持ち）から選ぶ。
   - 確認: raise-ev の under/over が各局面で 0.5bb 以内に収まる件数が増えること、監査違反ゼロ。
6. **頻度表をルール＋例外形式に移行**
   - `response-mixes.json` と各 generator の profile を「EV 順位・カテゴリで決めるルール」＋「例外リスト」に置き換える。まず 1 局面（BB_vs_BTN）で試し、差分を `range check` で報告。
7. **しきい値・手調整の設定ファイル化**
   - `apply-call-ev.mjs` の −0.05/+0.05/+0.10/+0.50bb、バランス調整（AA 10% フラット等）を `configs/` か `scripts/data/` の1ファイルに集め、理由を併記。挙動は不変（出力 JSON が変わらないことを確認）。

## C. 確認ツール

8. **EQR 感度スクリプト**
   - `npm run eqr-sensitivity [spot]`: EQR ±5% で call/fold・raise/call の判断が変わるハンドを列挙（数行出力）。
9. **range view に数値表示**
   - `npm run range -- view <spot> --hand AKs` で勝率・EQR・call EV・raise EV を1行表示。
10. **range check に raise-ev の差分**
    - check の出力に、変更前後の raise-ev 警告件数を追加。

## D. 新局面

11. **スクイーズへの対応（オープナー・コールした人）**
    - 4bet 応答の生成を汎用化（サイズ・人数を引数に）し、それでスクイーズ対応を生成。検証・監査・理由文まで。UI への追加は別タスク。

## E. 運用

12. **codex の更新確認**: `brew upgrade codex` 後に gpt-6-astra で MCP が動くこと（ユーザー作業）。

おすすめ順: 12 → 1 → 2 → 3 → 5 → 7 → 8 → 6 → 4 → 9 → 10 → 11
