# 仕様：相手像モード 段階A プリフロップ（Astra 向け）

この依頼文そのものがユーザーとメインの Claude からの指示です。確認のために止まらず、最後まで作業してください。
git commit / push はしないこと（コミットはメインの Claude が確認後に行う）。他セッションの未コミット変更は巻き戻さない。

作業ディレクトリ: `/Users/yota/Projects/Products/ReysonAI/apps/frontend`（このフォルダ1つ・`development` から切ったブランチで作業。別フォルダや worktree は作らない）

全体計画は `docs/specs/opponent-profiles-plan.md`。この段階はデータだけで、画面は変えない。

## 0. 最初に必ず読む

- `AGENTS.md`、`src/estimated/AGENTS.md`、`../../.claude/agents/range-author.md`（レンジ作成の手順とトークン節約の決まり。全部守る）
- `docs/specs/opponent-profiles-plan.md`

## 1. 作るもの

4つの相手像 `nit` / `station` / `lag` / `maniac` それぞれについて、HU の全プリフロップ判断のデータを2種類作る。

| 種類 | 意味 | 置き場所 |
|---|---|---|
| `villain` | その相手像の人がその席で実際にどう打つか（相手の戦略） | `src/estimated/profiles/<profile>/villain/<dataset>.json` |
| `exploit` | 相手がその相手像だと分かっているときの、こちらの打ち方（対策） | `src/estimated/profiles/<profile>/exploit/<dataset>.json` |

対象データセット（既存と同じ形式・同じスポット ID・同じサイズ）:
`opening-ranges`、`preflop-ranges`、`three-bet-responses`、`four-bet-responses`、`five-bet-responses`、`limp-responses`、`limp-deep-responses`

- `exploit` の各スポットは「その局面までの相手の行動は `villain` のデータどおり」という前提で作る。例：`exploit/preflop-ranges` の BB_vs_BTN は、BTN が `villain/opening-ranges` の BTN_open どおりにオープンしてきた前提での BB の応答。
- `exploit/opening-ranges` は「後ろの全員がその相手像」の前提でのオープン。
- 理由文：`src/estimated/profiles/<profile>/<villain|exploit>/reasons/<spot>.json`。既存の理由文と同じ形式で、全169ハンド。文面には「相手が○○なので」という対策の根拠を入れる（例：NIT の 3bet は QQ+/AK 中心なので JJ でもフォールド寄り、ステーションにはブラフを減らしバリューを厚く）。

## 2. 頻度の決め方（重要）

- **AI（あなた）が判断して頻度を決める。** call EV の自動補完（`apply-call-ev.mjs` の auto-fill）や EV ルールの違反判定で頻度を決めない・変えない。相手像データは EV ルールの対象外にする（既存の均衡型データには従来どおり適用）。
- 決め方は generator 方式に揃える：新規 `scripts/generate-opponent-profiles.py`（または既存 generator に相手像の上書き層を足す）に、相手像 × データセットごとの手札グループ頻度を明示し、`npm run build:estimates` の流れで出力する。**JSON を直接編集しない。**
- 目安（コンボ加重の構成。外れるなら理由を結果報告に書く）:
  - `villain` のオープン（RFI 合計）：nit = 均衡型の 約0.6倍、station = 約1.1倍（リンプしがちな席は limp を増やしてよい）、lag = 約1.4倍、maniac = 約1.8倍（ただし 100% は超えない）。
  - `villain` の 3bet：nit = 約0.4倍（QQ+/AK 中心）、station = 約0.3倍でコールが約2倍、lag = 約1.6倍、maniac = 約2.5倍（ブラフ多め）。4bet/5bet も同じ傾向。
  - `exploit`：nit 相手 → スチールを広げ、3bet/4bet されたら大きく降りる。station 相手 → ブラフ 3bet を減らしバリュー寄り、アイソ・バリューを厚く。lag 相手 → 守りを広げ、強い手のトラップ（コール）とバリュー 4bet を増やす。maniac 相手 → さらに広く守り、強い手はオールインまで行く、ブラフはほぼしない。
- 監査（`src/estimated/audit.ts`）は、相手像データにも **構造の検査だけ** 適用する：頻度の合計100、到達しない手の扱い、レンジの流れ（前の行動で持っていない手が後で出てこない）、サイズの整合。強さの順序の逆転は警告として報告するだけでよい（相手像は意図的に崩れることがある）。
- 補足用に、各スポット・各ハンドの「均衡型の自動判定だとこうなる（call EV）」を facts に入れる（段階B の「計算上は○○がEV高」表示用）。頻度には使わない。

## 3. 登録

- 新しいデータの読み込み：`src/estimated/datasets.ts` から `profiles/<profile>/<role>/<dataset>` の名前で読めるようにする（既存の reasons と同じ仕組み）。
- pipeline / build-estimates / reason-facts / compose-reasons / reason-context（fingerprint）に相手像データを追加。
- 既存の均衡型データ・理由文は 1 行も変えない（pipeline の差分で確認）。

## 4. 完了条件

- 4相手像 × 2種類 × 7データセット、全スポット・全169ハンドがそろっている。
- `npm run pipeline -- --max-iterations 1`：均衡型データに変化なし、監査の違反0（相手像データは構造検査）。
- `node --test tests/*.test.mjs` 全件成功（`npm run build` 後）。相手像データの網羅（ID・169ハンド・理由ファイル）と「均衡型データが変わっていない」ことのテストを追加。
- コンボ加重の構成が上の目安に沿っている（外れは理由つきで報告）。

## 5. 最後に返すもの（`docs/specs/opponent-profiles-stageA-preflop.result.md`）

- 変更ファイル一覧
- 相手像 × 種類 × スポットごとの構成（コンボ加重）と、均衡型との比較
- 代表ハンドの理由文の例（各相手像 3つ）
- 監査・テストの結果、判断に迷った点
