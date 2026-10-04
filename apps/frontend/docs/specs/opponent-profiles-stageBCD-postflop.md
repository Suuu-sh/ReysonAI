# 仕様：相手像モード 段階B・C・D ポストフロップ（Astra 向け）

この依頼文そのものがユーザーとメインの Claude からの指示です。確認のために止まらず、最後まで作業してください。
作業は `development` から切った専用ブランチで行い、コミット・push して、`development` 向けのプルリクエストを作るところまで行うこと（下書き PR にする。マージ・本番デプロイ・本番 D1 への取り込みはしない）。他の人の変更は巻き戻さない。

リポジトリ: `Suuu-sh/ReysonAI`（作業はフロントエンドの `apps/frontend` が中心）。

前提：段階A（相手像ごとの相手側プリフロップデータ `src/estimated/profiles/<profile>/villain/*.json`）はマージ済み・本番配信済み（PR #28）。

対象局面（2026-10-04 更新）：
- 均衡型でポストフロップ方針がある全局面（`scripts/postflop-ai/spots.mjs` の到達可能な局面。44＋リンプ4bet、`hu-postflop-after-multiway-preflop.md` がマージされていればスクイーズ・コールド4bet後の局面も含む）。
- 相手像では SB がオープンにフラットコールするため、均衡型では到達しない「SB がコールしたシングルレイズドポット」が到達可能になる（段階A の PR で列挙49・標準到達45と報告済み）。これらも相手像モードの局面として作る。均衡型の画面には出さない。

## 0. 最初に必ず読む

- `AGENTS.md`、`src/estimated/AGENTS.md`、`docs/specs/opponent-profiles-plan.md`
- `docs/postflop-policy-knowledge.md`（方針づくりのナレッジ。全部守る）、`docs/postflop-defence.md`、`docs/postflop-ai-pilot.md`

## 1. 決まっている考え方（変えない）

- 設定は2つで、掛け算でデータを作らない。
  - **卓の状況**（プリフロップ）：今ある `src/estimated/table-profile.ts`（コール頻度・3bet頻度 × 少ない/標準/多い、9通り）。自分のプリフロップの打ち方を変える。
  - **相手の傾向**（ポストフロップ）：`standard`（均衡型・今のもの）/ `nit` / `station` / `lag` / `maniac`。HU の相手1人に効く。
- ポストフロップの方針は「手の強さ × ボード × 流れ」ごとのルールなので、レンジが変わってもそのまま使える。**レンジは毎回プリフロップのデータから計算する。** 卓の状況の9通りのために方針を作り直さない。
- フロップに持ち込むレンジ：
  | | 自分の席 | 相手の席 |
  |---|---|---|
  | 相手の傾向 = standard | 卓の状況で調整したプリフロップ | 卓の状況で調整したプリフロップ |
  | 相手の傾向 = 相手像 | 卓の状況で調整したプリフロップ | `profiles/<profile>/villain/` のプリフロップ（卓の状況より相手個人を優先） |
- 相手像モードでは、両者とも **方針の頻度をそのまま使う**（AI が決めた頻度。EV で決めない）。計算（防御計算・EV）は「破綻チェック」と「計算上は○○の方がEVが高い」という補足表示だけに使う。standard は今の均衡型のまま（受け側は計算防御）。

## 2. 段階C：仕組み（先にやる）

1. **レンジの組み立てを差し替え可能にする**
   - `scripts/postflop-ai/browser-inputs.mjs` の `buildInputs(spotId, datasets)` と `scripts/postflop-ai/inputs.mjs` の `loadInputs` に、オプション `{ tableProfile, opponentProfile, opponentSeat }` を足す。
   - `tableProfile` は `applyTableProfile` / `adjustOpeningSpot`（`table-profile.ts`）を、レンジの元になるプリフロップの各スポットに当ててから `seatRows` を作る。
   - `opponentProfile` が standard 以外なら、`opponentSeat`（`ip` / `oop`）の行だけ `profiles/<profile>/villain/` のデータから作る。
   - オプションが無いときの結果（`seatRows`・`fingerprint`）は今と完全に同じにする（既存テストと保存済み方針がそのまま通ること）。
2. **方針の有効性を「局面の形」で判定する**
   - 今は保存方針の `metadata.source_hash` が入力の `fingerprint`（レンジを含む）と一致しないと読み込めない（`generate.mjs` の `loadCandidate`、`src/estimated/postflop-compute.ts`）。
   - レンジを含まない `structure_hash`（スポット・ツリー・ポット・スタック・サイズ・`gameConfig`・`flopConfig()`）を新設し、レンジを差し替えた入力では `structure_hash` の一致で読み込めるようにする。標準レンジのときの厳密な一致（`source_hash`）と監査は今のまま残す。
   - 差し替えたレンジで計算した表示には「卓の状況／相手の傾向に合わせて調整」と分かる印を返す。
3. **相手像の方針ファイル**
   - 置き場所：`.local/postflop-ai/profiles/<profile>/<slug>-villain-policy.json`・`-villain-later-policy.json`（相手の打ち方）と `<slug>-exploit-policy.json`・`-exploit-later-policy.json`（自分の対策）。形式は既存の方針と同じ（`validatePolicy` / `validateLaterPolicy` が通る）。
   - 相手の席は villain 方針、自分の席は exploit 方針を使う。ノード名は IP/OOP で決まっているので、席から使う方針ファイルを選ぶ。
4. **相手像モードの計算**
   - `defence.mjs` の受け側計算（コール/フォールドの計算、ブラフ上限、防御の上下限、リバーオールインの SPR 制限）を、相手像モードでは使わない。方針の mix をそのまま両者に使う（`withRaise`・`effectiveMix` などの合法化だけ通す）。
   - 補足として、均衡型の計算結果（そのハンドの計算上の頻度・EV が最大のアクション）を facts に入れる。頻度には使わない。
5. **破綻チェック（相手像モード用）**
   - `balance.mjs` に相手像モードのチェックを足す。止める（error）のは構造の破綻だけ：合法でないアクション、頻度の合計、到達できない分岐。
   - 次は警告（warn）：モンスターがほぼ全部フォールドする、役なしがオールインを大量に打つ、など相手像の説明と矛盾する極端な挙動。
6. **画面（段階B）**
   - `src/estimated/postflop-trial.ts` の `pilotAvailable` が `isDefaultTable` を要求しているのを外し、卓の状況が標準以外でもポストフロップに進めるようにする（ポストフロップのログイン必須はそのまま）。
   - フロップ以降の画面に「相手の傾向」の選択（標準 / NIT / ステーション / LAG / マニアック）と「相手の席」の選択（既定：プリフロップの最後のアグレッサー。リンプポットは BB）を置く。見た目は既存の設定カード・セグメント（`display-mode-toggle`）に合わせる。
   - 選択は URL とセッションに保存（既存の `initialUrlState` の仕組みに揃える）。
   - 相手像モードでは、ハンド詳細に「この頻度は相手が○○の前提でのAIの判断」と、計算上 EV が最大のアクション（補足）を出す。

## 3. 段階D：方針の生成

- 相手像 4 × 44局面 × 2（villain / exploit）× 2（フロップ / ターン・リバー）。
- 生成は既存の `scripts/postflop-ai/generate.mjs` を拡張する：`promptFor` / `promptForLater` に相手像の役割（villain：その相手像の人の打ち方 / exploit：相手がその相手像だと知っているときの対策）を渡す。
  - villain の指示例：nit はベット頻度が低くブラフが少ない、レイズはほぼナッツ級。station はコールが多くレイズ・ブラフが少ない。lag はベット・レイズ・ブラフが多い。maniac はオーバーベット・オールイン・ブラフが非常に多い。
  - exploit の指示例：nit にはブラフを増やし、レイズされたら降りる。station にはブラフを減らしバリューを大きく薄く。lag には強い手でコールして引き込み、ブラフキャッチを広げる。maniac にはさらに広くブラフキャッチし、強い手はスタックを入れる。
  - 生成時に見せるレンジの要約は、その相手像の villain レンジで作る。
  - `docs/postflop-policy-knowledge.md` の指示文の決まり（全組み合わせのフォールバック、ドンクベットの扱い、ボードの高さ、OOP と IP を分ける）は相手像でも守る。
- CLI：`node scripts/postflop-ai/cli.mjs generate --spot <id> --profile <profile> --role <villain|exploit> --model <model>`（`generate-later` も同様）。既存の均衡型の方針・コマンドの動きは変えない。

## 4. 完了条件

1. 既存の均衡型（standard・卓の状況が標準）の表示・保存方針・監査が今と同じ（`postflop-ai:audit --all` が全局面 PASS、既存テスト全件成功）。
2. 卓の状況を変えても表示できる：`audit-all-boards.mjs` に `--table-profile <call>,<three_bet>` を足し、`call=high`、`call=low`、`three_bet=high` の3通りで、standard モードのフロップ全1,755ボード点検が error 0。
3. 相手像モード：4相手像 × 44局面の方針がすべて作られ、相手像モードの破綻チェックで error 0（全1,755フロップ、`--profile` オプション）。警告は件数と代表例を報告。
4. 画面：standard / 各相手像を切り替えて、フロップ〜リバーまで進めることをブラウザで確認（スクリーンショットを結果報告に貼るか、手順を書く）。
5. `npm run typecheck`・`npm run build`・`node --test tests/*.test.mjs` 全件成功。追加テスト：
   - オプション無しの `buildInputs` が今と同じ（`fingerprint`・`seatRows`）。
   - `tableProfile` で相手のレンジが変わる。
   - 相手像で相手の席のレンジだけ変わる。
   - 相手像モードでは方針の mix がそのまま使われる（防御計算が入らない）。
6. ナレッジ `docs/postflop-policy-knowledge.md` に、相手像の方針づくりで分かったことを追記。

## 5. 最後に返すもの（PR の本文にも要約を書く）（`docs/specs/opponent-profiles-stageBCD-postflop.result.md`）

- 変更ファイル一覧と、仕組みの説明（どこでレンジを差し替え、どこで方針を選び、どこで防御計算を外したか）
- 相手像ごとの代表局面（BTN オープン → BB コール、乾いた A ハイ・低いウェット）での、相手と自分の主な頻度の比較
- 点検結果（卓の状況3通り、相手像4つ）
- 判断に迷った点
