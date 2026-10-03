# 仕様：相手像モード 段階A プリフロップ（Astra 向け）

この依頼文そのものがユーザーとメインの Claude からの指示です。確認のために止まらず、最後まで作業してください。
git commit / push はしないこと（コミットはメインの Claude が確認後に行う）。他セッションの未コミット変更は巻き戻さない。

作業ディレクトリ: `/Users/yota/Projects/Products/ReysonAI/apps/frontend`（このフォルダ1つ・`development` から切ったブランチで作業。別フォルダや worktree は作らない）

全体計画は `docs/specs/opponent-profiles-plan.md`。この段階はデータだけで、画面は変えない。

## 0. 最初に必ず読む

- `AGENTS.md`、`src/estimated/AGENTS.md`、`../../.claude/agents/range-author.md`（レンジ作成の手順とトークン節約の決まり。全部守る）
- `docs/specs/opponent-profiles-plan.md`

## 1. 作るもの

4つの相手像 `nit` / `station` / `lag` / `maniac` それぞれについて、**相手側のプリフロップデータだけ**を作る。目的は、ポストフロップで相手がフロップに持ち込むレンジを作ること（画面には表として出さない）。自分側の対策データ（exploit）は作らない。プリフロップの自分の打ち方は、今ある「卓の状況」（`table-profile.ts`）で調整する決まり（2026-10-04 ユーザー決定）。

置き場所：`src/estimated/profiles/<profile>/villain/<dataset>.json`（既存と同じ形式・同じスポット ID・同じサイズ）

対象データセット：`opening-ranges`、`preflop-ranges`、`three-bet-responses`、`four-bet-responses`、`five-bet-responses`、`limp-responses`、`limp-deep-responses`

- 意味は「その相手像の人がその席に座っていたら、こう打つ」。フロップに着いた時点の相手のレンジは、そのスポットまでの相手側の各判断を掛け合わせて作る（段階C で使う）。
- 理由文は作らない。代わりに `src/estimated/profiles/<profile>/villain/meta.json` に、相手像の説明（日英）と、データセットごとの方針の要約（1〜3文）を書く。

## 2. 頻度の決め方（重要）

- **AI（あなた）が判断して頻度を決める。** call EV の自動補完（`apply-call-ev.mjs` の auto-fill）や EV ルールの違反判定で頻度を決めない・変えない。相手像データは EV ルールの対象外にする（既存の均衡型データには従来どおり適用）。
- 決め方は generator 方式に揃える：新規 `scripts/generate-opponent-profiles.py` に、相手像 × データセットごとの手札グループ頻度を明示し、`npm run build:estimates` の流れで出力する。**JSON を直接編集しない。**
- 目安（コンボ加重の構成。外れるなら理由を結果報告に書く）:
  - オープン（RFI 合計）：nit = 均衡型の約0.6倍、station = 約1.1倍（リンプしがちな席は limp を増やしてよい）、lag = 約1.4倍、maniac = 約1.8倍（100% は超えない）。
  - オープンへの応答：nit はコールも 3bet も狭い。station はコールが約2倍・3bet は約0.3倍。lag はコール約1.2倍・3bet 約1.6倍。maniac はコール約1.5倍・3bet 約2.5倍（ブラフ多め）。
  - 3bet / 4bet を受けたとき：nit は大きく降り、続けるのは強い手だけ。station はコールが多く降りない。lag はコールと 4bet が多め。maniac はオールインが多い。5bet・リンプの木も同じ傾向。
  - 相手像は実在の打ち手の癖を表すので、均衡型のような「強さの順序」が多少崩れてよい（例：station は弱いスーテッドでも広くコール）。ただし同じ相手像の中で、ある判断で持っていない手が後の判断で出てこないこと（レンジの流れ）は守る。
- 監査（`src/estimated/audit.ts`）は相手像データに **構造の検査だけ** 適用する：頻度の合計100、到達しない手の扱い、レンジの流れ、サイズの整合。強さの順序の逆転は警告として報告するだけでよい。

## 3. 登録

- 新しいデータの読み込み：`src/estimated/datasets.ts` から `profiles/<profile>/<role>/<dataset>` の名前で読めるようにする（既存の reasons と同じ仕組み）。
- pipeline / build-estimates に相手像データを追加（理由文の生成対象には入れない）。
- 既存の均衡型データ・理由文は 1 行も変えない（pipeline の差分で確認）。

## 4. 完了条件

- 4相手像 × 7データセット（相手側のみ）、全スポット・全169ハンドと meta.json がそろっている。
- `npm run pipeline -- --max-iterations 1`：均衡型データに変化なし、監査の違反0（相手像データは構造検査）。
- `node --test tests/*.test.mjs` 全件成功（`npm run build` 後）。相手像データの網羅（ID・169ハンド・meta.json）と「均衡型データが変わっていない」ことのテストを追加。
- コンボ加重の構成が上の目安に沿っている（外れは理由つきで報告）。

## 5. 最後に返すもの（`docs/specs/opponent-profiles-stageA-preflop.result.md`）

- 変更ファイル一覧
- 相手像 × スポットごとの構成（コンボ加重）と、均衡型との比較
- 代表的な局面（例：BTN オープン → BB コールで、相手が BB のとき／BTN のとき）で、フロップに持ち込むレンジの強さの分布が相手像ごとにどう違うか
- 監査・テストの結果、判断に迷った点
