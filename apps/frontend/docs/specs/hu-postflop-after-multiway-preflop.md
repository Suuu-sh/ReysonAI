# 仕様：スクイーズ・コールド4bet 後に2人になったポットのポストフロップ（Astra 向け）

この依頼文そのものがユーザーとメインの Claude からの指示です。確認のために止まらず、最後まで作業してください。
git commit / push はしないこと（コミットはメインの Claude が確認後に行う）。他セッションの未コミット変更は巻き戻さない。

作業ディレクトリ: `/Users/yota/Projects/Products/ReysonAI/apps/frontend`（このフォルダ1つ・`development` から切ったブランチで作業。別フォルダや worktree は作らない）

## 0. 背景と最初に読むもの

- ヘッズアップのポストフロップ方針は、今は「オープン→コール」「オープン→3bet→コール」「オープン→3bet→4bet→コール」「SBリンプの木」の流れだけ（`scripts/postflop-ai/spots.mjs`）。
- プリフロップの途中で3人目がいて、そのあと降りて2人でフロップに行く流れ（スクイーズ後、コールド4bet後など）は方針が無い。Agent戦（`src/agent/hand.ts` の `postflopSpotFor`）とレンジ画面（`src/estimated/postflop-trial.ts` の `flopSpotFor`）では、全ストリートがチェックだけになっている。
- プリフロップのレンジは揃っている：`multiway-responses.json`、`multiway2-responses.json`、`squeeze-responses.json`、`cold-three-bet-responses.json`、`cold-four-bet-responses.json`、`continuation-responses.json`（段階2。`node scripts/restore-reviewed-preflop.mjs` で展開）。
- 必ず読む：`AGENTS.md`、`src/estimated/AGENTS.md`、`docs/postflop-policy-knowledge.md`（方針づくりのナレッジ。全部守る）、`docs/postflop-defence.md`、`docs/postflop-ai-pilot.md`。

## 1. 対象（2人でフロップに行き、オールインで終わっていない流れ）

優先順に作る。A を終えてから B。

### A. 段階1のデータで決まる流れ
| 系統 | 流れ | 2人になる組 |
|---|---|---|
| スクイーズ・オープナー降り | O オープン → C コール → S スクイーズ → O フォールド → C コール | C 対 S（S がアグレッサー） |
| スクイーズ・コーラー降り | O オープン → C コール → S スクイーズ → O コール → C フォールド | O 対 S（S がアグレッサー） |
| コールド3bet・オープナー降り | O オープン → T 3bet → X コールドコール → O フォールド | T 対 X（T がアグレッサー）※ X がコールドコールした後に O が降りる経路がデータにあれば |
| コールド4bet | O オープン → T 3bet → F コールド4bet → O フォールド → T コール ／ O コール → T フォールド | T 対 F ／ O 対 F（F がアグレッサー） |
| コーラー2人のスクイーズ | O オープン → C1・C2 コール → S スクイーズ → 1人だけコール、他は降り | その1人 対 S |

### B. 段階2（`continuation-responses.json`）で決まる流れ
- スクイーズやコールド4bet の後の 4bet / 5bet でコールして2人でフロップに行く流れ（オールインでないもの）。
- 実際に何本あるかは、データから列挙して結果報告に書く。数が多い場合は、到達頻度（その流れに入る確率）が上位の流れから作り、残りは「方針なし」として明示する。

到達しない流れ（片方のレンジが空・頻度0）は作らない。

## 2. 作るもの

1. **局面の定義**：`scripts/postflop-ai/spots.mjs` に新しい種類を足す（例：`kind: "sqp"`（スクイーズポット）、`"c4bp"`（コールド4betポット）など）。
   - ID は流れが分かる名前にする（例：`UTG_open_HJ_call_BB_squeeze_HJ_call`）。
   - `geometry` でポット・有効スタック・IP/OOP・アグレッサー・ツリー（最後のアグレッサーが OOP なら `oop_leads`、それ以外は `oop_checks`）を決める。
   - 既存44局面＋リンプ4betの定義と ID は変えない。
2. **レンジの組み立て**：`scripts/postflop-ai/browser-inputs.mjs` の `buildInputs` と `inputs.mjs` に新しい種類を足す。
   - 2人それぞれのレンジ＝その流れで、その人が取った全アクションの保存頻度の積（カードの重複を除く）。降りた人のレンジは、デッドカードとしては扱わない（既存局面と同じ扱い）。
   - 照合値（fingerprint）は既存局面と同じ作り方。既存局面の照合値は変えない。
3. **方針の生成**：`docs/postflop-policy-knowledge.md` の手順どおり。
   - フロップ方針と、ターン・リバー方針。
   - ボードの高さのルール、ドンクベットの扱い、OOP と IP を分ける、など。
   - 生成モデルは `node scripts/postflop-ai/cli.mjs generate --spot <id> --model gpt-6-astra`（`generate-later` も同様）。
   - スクイーズポットはSPRが低め（スタックの割にポットが大きい）。生成時に見せるレンジ要約と指示文に、それを反映させる。
4. **つなぎ込み**：
   - Agent戦：`src/agent/hand.ts` の `postflopSpotFor` が、新しい流れの局面を返す。
   - レンジ画面：`src/estimated/postflop-trial.ts` の `flopSpotFor` と `completedFlopContext` が、新しい流れでも「フロップへ進む」を出し、方針を読む。
   - 方針の無い流れは、今どおり「方針なし（チェックで進む）」の表示のまま。
5. **配信**：`scripts/postflop-ai/publish-d1.mjs`（`publish:d1 --only postflop`）の対象に新しい局面が入ること。ただし本番へのデプロイ・D1 への取り込みは実行しない（ローカル D1 での確認まで）。

## 3. 完了条件

- 新しい全局面で `node scripts/postflop-ai/cli.mjs audit --spot <id>` が PASS。
- `node scripts/postflop-ai/audit-all-boards.mjs --spot <id> ...`（全1,755フロップ）で error 0。警告の件数と多いものの代表例を報告。
- 既存局面（44＋リンプ4bet）の方針・照合値・監査結果が変わらない（`audit --all` の既存分が PASS のまま）。
- `npm run typecheck`・`npm run build`・`node --test tests/*.test.mjs` が全件成功。追加テスト：
  - 新しい流れが `postflopSpotFor` / `flopSpotFor` で正しい局面になる（代表ケース：UTG オープン → HJ コール → BB スクイーズ → UTG フォールド → HJ コール）。
  - 新しい局面のレンジが、プリフロップの保存頻度の積と一致する（数ハンドの抜き取り）。
  - 既存局面の照合値が変わっていない。
- ブラウザで、Agent戦とレンジ画面の両方で、スクイーズ後の流れがフロップからリバーまで普通に打てることを確認（手順かスクリーンショットを結果報告に）。
- ナレッジ `docs/postflop-policy-knowledge.md` に、この局面群の方針づくりで分かったことを追記。

## 4. 最後に返すもの（`docs/specs/hu-postflop-after-multiway-preflop.result.md`）

- 作った局面の一覧（ID・流れ・ポット・スタック・ツリー・到達頻度）と、作らなかった流れとその理由
- 変更ファイル一覧
- 監査と全ボード点検の結果
- 判断に迷った点
