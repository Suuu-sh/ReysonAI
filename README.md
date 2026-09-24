# SolveaAI Preflop v0.1

SolveaAI は、独自計算した戦略の保存・配信を目指す Solver Platform です。現行Solverは外部サンプリングCFR/DCFRの実験実装ですが、ContinuationとGTO精度は未検証です。v0.1 の対象は **Cash / 6-max / 100BB / no ante の Preflop** に限定しています。

ブランド識別子（SDK／package 名、環境変数、キュー・デプロイ名、R2 bucket の既定値）は SolveaAI 名に統一されています。既存の起動設定や外部リソースは自動移行されないため、利用環境側も新しい識別子へ更新してください。

他社サービスの Range データは使用していません。Postflop Solver、Flop Solve、Trainer、Quiz、Potover 連携、認証、課金、Cloud/Kubernetes はこのリポジトリの対象外です。

## Architecture

```text
ローカルUI ──► ローカルRust API ──► Redis Streams ──► 常駐Local Solver Worker
    │                 ▲                                      │
    │                 │                                      ▼
    │                 └─────── 保存済みSolution ◄──── Promote / 検証
    │                                                        │
    │                                                        ▼
    │                                           Cloudflare R2へ成果物公開
    │
本番UI ──► Cloudflare External API Worker ──► Cloudflare R2
                         │
                         └── ローカル環境へは接続しない
```

責務は次のように分離しています。

- `crates/poker-core`: Card、Deck、1326 Combo、169 Hand Class、Combo Range。
- `crates/preflop-tree`: Config から生成する Preflop Game Tree と Action History 解決。
- `crates/continuation`: `ContinuationEvaluator` の差し替え境界。v0.1 は単純な強さベースの placeholder。
- `crates/solver-core`: SolverStrategy、external-sampling CFR/DCFR、Combo単位のregret/reach/strategy sum、Toy Game、Exploitability推定。
- `crates/solution`: Solver 結果、Combo/Hand Aggregate、永続化 Repository の抽象化。
- `crates/job-queue`: `JobQueue`境界とFile / Redis Streams実装。Fileは単体実行、Redisはkind用。
- `services/preflop-worker`: CLI Worker 実行エントリ（Job向けライブラリ分離は未実装）。
- `services/internal-api`（Internal API）: 保存済み Solution のread-only配信。ローカル生成モードでのみRedis/File QueueへJobを登録し、Solution生成処理そのものは実行しません。
- `packages/solveaai-sdk-ts`: 外部アプリ向け TypeScript SDK。
- `apps/preflop-ui`: 黒・ピンク基調の独自 Preflop Explorer。169 Hand Matrix、Action Breakdown、Combo 詳細を確認できます。
- `apps/solveaai-external-api`（External API）: 本番UI向けのCloudflare Worker。R2の検証済み成果物だけを読み取り、ローカルAPI・Redis・Solverへ接続しません。

### Action History と Node ID

Action History の canonical key が Node の論理的な一意性です。たとえば `BTN:R2.5|SB:F|BB:C` です。Node ID は同じ History から決定的に生成されるため、別プロセスのメモリアドレスや DB sequence に依存しません。

API の `BTN raise` だけの入力は、未参加プレイヤーの fold を implicit transition として補完し、`heroPosition` の decision node まで進めます。したがって次のリクエストは BB の decision node を返します。

```json
{
  "solutionId": "cash-6max-100bb-v1",
  "heroPosition": "BB",
  "actions": [
    { "position": "BTN", "action": "raise", "sizeBb": 2.5 }
  ]
}
```

## Quick start

### 1. Rust build and tests

```bash
cargo check --workspace
cargo test --workspace
```

### 2. Solution を生成

```bash
cargo run --release -p solveaai-worker -- \
  solve configs/cash-6max-100bb.json
```

保存先は `solutions/` です。別の保存先は第 3 引数、または `SOLVEAAI_SOLUTION_DIR` で指定できます。

```bash
cargo run --release -p solveaai-worker -- \
  solve configs/cash-6max-100bb.json /tmp/solveaai-solutions
```

Worker の責務は次の順序です。

```text
Config Load → Game Tree Build → Solver Start → Iterations → Solution Build → Structural Validation → Solution Save
```

Workerは保存前にConfig hash、反復数、1326 Combo、169 Hand、Action frequency、有限値を検証します。
検証を通過した成果物にも `validation.status=provisional` と `gtoVerified=false` を付けます。
これは表示可能な構造検証を通過した状態であり、postflop継続価値や厳密なGTO検証を通過した意味ではありません。
本番配布用Artifactへ昇格する際にも同じ検証を再実行します。

```bash
cargo run --release --bin solveaai-promote -- \
  configs/cash-6max-100bb.json \
  solutions/cash-6max-100bb-v1.json \
  release/solveaai
```

`release/solveaai/solutions/*.json` と `manifest.json` だけを本番の読み取り専用APIへ配布します。
Solver、Worker、Redisは本番へ配置しません。

Cloudflare R2へ公開する場合は、成果物を先に、`manifest.json`を最後にアップロードします。

```bash
bash scripts/publish-solution-r2.sh release/solveaai solveaai-solutions
```

### ローカル Job Queue

`solveaai-worker` は、ローカルファイルまたはRedis Streamsを使ったJob Queueと常駐Workerにも対応しています。
Jobは設定内容をJSONに埋め込んで保存するため、enqueue後に元のconfigを変更しても実行内容は変わりません。

```bash
# Jobを登録（既定: jobs/、結果: solutions/）
cargo run --release -p solveaai-worker -- \
  enqueue configs/cash-6max-100bb.json jobs solutions

# Workerを起動して、pending Jobを順番に処理
cargo run --release -p solveaai-worker -- \
  worker jobs

# 1件だけ処理（CIや動作確認向け）
cargo run --release -p solveaai-worker -- \
  worker jobs --once

# Job一覧・詳細確認
cargo run --release -p solveaai-worker -- list jobs
cargo run --release -p solveaai-worker -- status <job-id> jobs

# failed / interrupted Jobを再実行待ちへ戻す
cargo run --release -p solveaai-worker -- retry <job-id> jobs
```

Queueは `jobs/{pending,running,succeeded,failed}` にJobを保存します。
Jobの取得はファイル移動で原子的に行います。現段階ではローカルで1 Workerを動かす前提で、
Worker起動時に前回の `running` Jobを `pending` へ復旧します。

kindではRedis StreamsとConsumer Groupを使います。未ACKのJobはlease期限後に別Workerが再取得し、
Solution単位のactive keyで複数APIプロセスからの重複登録を防ぎます。

```bash
SOLVEAAI_QUEUE_BACKEND=redis \
SOLVEAAI_REDIS_URL=redis://127.0.0.1:6379/ \
  cargo run --release -p solveaai-worker -- worker
```

計算は事前生成方式です。通常の API リクエストでは Solver は起動せず、保存済み Solution だけを読み取ります。

保存済みSolutionがない場合は、生成モードを明示的に有効にしたローカルAPIからJobを登録してWorkerに計算させられます。既存Solutionの `gameConfigHash` が現在のConfigと一致する場合、または同じSolutionのpending / running Jobがある場合は重複作成しません。

```bash
SOLVEAAI_ENABLE_GENERATION=true \
SOLVEAAI_QUEUE_BACKEND=file \
SOLVEAAI_SOLUTION_DIR=solutions \
  cargo run --release -p solveaai-internal-api
```

```bash
# SolutionがなければJobを登録（既定のcash-6max-100bb-v1を対象）
curl -X POST http://127.0.0.1:3000/v1/preflop/jobs \
  -H 'content-type: application/json' \
  -d '{}'

# Jobの状態を確認
curl http://127.0.0.1:3000/v1/preflop/jobs/<job-id>
```

`POST /v1/preflop/jobs` は計算を同期実行しません。`pending` Jobを返し、常駐Workerが計算・保存します。保存完了後に同じリクエストを再実行すると `solutionAvailable: true` が返ります。`POST /v1/preflop/resolve` は引き続き保存済みSolutionのNode解決専用です。`SOLVEAAI_ENABLE_GENERATION` の既定値は `false` で、無効時はJob route自体を公開しません。

### 3. API を起動

```bash
SOLVEAAI_SOLUTION_DIR=solutions \
  cargo run --release -p solveaai-internal-api
```

既定 URL は `http://127.0.0.1:3000` です。`SOLVEAAI_API_BIND` で bind address を変更できます。
本番APIはこの読み取り専用モードで起動し、Redis、Worker、Solverを配置しません。

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/v1/preflop/solutions
curl http://127.0.0.1:3000/v1/preflop/solutions/cash-6max-100bb-v1
curl http://127.0.0.1:3000/v1/preflop/nodes/<nodeId>
curl http://127.0.0.1:3000/v1/preflop/nodes/<nodeId>/hands/AA
```

Resolve:

```bash
curl -X POST http://127.0.0.1:3000/v1/preflop/resolve \
  -H 'content-type: application/json' \
  -d '{
    "solutionId": "cash-6max-100bb-v1",
    "heroPosition": "BB",
    "actions": [
      { "position": "BTN", "action": "raise", "sizeBb": 2.5 }
    ]
  }'
```

### 4. TypeScript SDK

`packages/solveaai-sdk-ts` は runtime dependency のない fetch ベース SDK です。

```bash
cd packages/solveaai-sdk-ts
npm run build
```

SDKのテストも実行できます。

```bash
npm test
```

利用例:

```ts
import { SolveaAIClient } from "@solveaai/sdk";

const solveaAI = new SolveaAIClient({
  baseUrl: "http://127.0.0.1:3000",
});

const spot = await solveaAI.preflop.resolve({
  solutionId: "cash-6max-100bb-v1",
  heroPosition: "BB",
  actions: [
    { position: "BTN", action: "raise", sizeBb: 2.5 },
  ],
});
```

保存済み Solution がない場合に Job を登録し、状態を確認する例です。
SDKはSolverを実行せず、Rust APIのJob Queueを利用します。

```ts
const job = await solveaAI.preflop.createJob({
  solutionId: "cash-6max-100bb-v1",
});

if (job.jobId) {
  const status = await solveaAI.preflop.getJob(job.jobId);
  console.log(status.status, status.solutionAvailable);
}
```

### 5. Preflop UI

UIの開発サーバーを起動します。推定レンジ画面は保存JSONのみを使うため、APIやSolverの起動は不要です。

```bash
cd apps/preflop-ui
npm install
npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

UIは `推定レンジ` の単一画面です。正本は
対オープンは `apps/preflop-ui/src/estimated/preflop-ranges.json`、オープンは
`apps/preflop-ui/src/estimated/opening-ranges.json`、3bet後の応答は
`apps/preflop-ui/src/estimated/three-bet-responses.json`、4bet後の応答は
`apps/preflop-ui/src/estimated/four-bet-responses.json` で、表示時のAPI通信やSolver実行はありません。
データが不正な場合はエラーを表示し、モックや別の戦略で補完しません。

- 6-max / effective stack 100BB / 全オープナー2.5BB / アンティなし（全JSONのante_bb=0に統一）
- 「局面」でオープン／対オープン／3bet後の応答／4bet後の応答を選択 → ポジション選択 → 169ハンドから頻度・サイズ・理由を確認
- 対オープンはUTG / HJ / CO / BTN / SB / BBの順序に基づく15局面、2,535件
- オープンは先行者全員フォールドのUTG / HJ / CO / BTN / SB、5局面・845件
- 3bet後の応答は15局面・2,535件。Heroは元のオープナー、後続相手は3bettor
- オープン時のHeroはオープナーと同じ。SBも2.5BBのraise-or-foldで、リンプは含めない
- 対オープンは単独オープンへの初回応答。こちらではUTGはオープナーのみ
- 対オープン画面は左にオープナーのRFI、右にHeroの対応レンジを表示。同じハンドの選択を同期し、フィルターは左右独立。どちらかのハンドを選ぶと選択した側のレンジだけを残して詳細を横に表示し、「両方のレンジを表示」で比較に戻れる（狭い画面では縦並び）
- 3bet後は他の全員がフォールドした場面のfold / call / four_bet。受ける3betサイズは既存対オープンJSONと一致させる
- 4bet後の応答は15局面・2,535件（全データ合計8,450件）。Heroは元の3bettorで、オープナーの4betに応答する
- 4bet後はfold / call / all_in（5betオールイン、合計100BB）。非オールイン5bet、コールド4bet、リンプ対応、スクイーズは対象外
- 一般知識による推定値。GTO計算・EV計算・レーキ調整は未実施
- 3bet・4betサイズは追加額ではなく合計投入額。該当レイズ頻度0ではサイズなし
- API画面への切替やJSONダウンロードボタンは表示しない

オープンJSONは `python3 apps/preflop-ui/scripts/generate-opening-ranges.py` で再生成できます。
手作業のヒューリスティックを展開するだけで、対オープンデータとの同時均衡計算は行いません。
RFIの一般概念は [Upswing Poker](https://upswingpoker.com/preflop-open-strategy-rfi-explained/) を参考に確認し、チャートや頻度は転用していません。

3bet後のJSONは `python3 apps/preflop-ui/scripts/generate-three-bet-responses.py` で再生成できます。
依存順は既存対オープンJSON・オープンJSON → 3bet後のJSON生成 → 相互参照・頻度・サイズ検証 → UI表示です。
既存RFIのopen=0のハンドはこの経路に到達しないため、169件形式上はfold=100とし、理由に対象外と明記します。
それ以外の頻度は「既にオープンした条件下」の値であり、オープン頻度を再乗算しません。
4betサイズはIP/OOP別の単一非オールインサイズを推定し、別のオールイン枝やサイズ間混合は収録していません。
位置によるサイズの考え方は [Upswing Pokerのサイズ解説](https://upswingpoker.com/podcast/ep29-pfr-sizing/) を参考にし、頻度は独自の概算です。

4bet後のJSONは `python3 apps/preflop-ui/scripts/generate-four-bet-responses.py` で再生成できます（Python 3とNode.jsが必要）。
依存順は既存対オープンJSON・オープンJSON → 3bet後JSON → 4bet後JSONの作成・共通バリデーターによる検証 → 保存 → UI表示です。
生成スクリプトは編集時専用で、ブラウザーでは実行しません。局面ごとの既存3bet／4betサイズをそのまま参照します。
Solver設定のサイズ倍率とは異なることをユーザー確認済みで、保存JSONのサイズを優先します。
合法応答は `crates/preflop-tree/src/lib.rs` の `ensure_four_bet_response` に合わせたfold / call / all_inのみです。
callは4bet額まで、5betオールインは追加額ではなく合計100BBです。各行のall_in=0ではall_in_size_bb=nullにします。
元の3bet頻度0%のハンドは既存規約どおりfold=100の形式的レコードとし、理由に「対象外」を明記します。
画面ではこの値を推奨として描画せず、斜線セル・「対象外」と到達不能の説明を表示します。
それ以外は既に3betした条件下の頻度で、元の頻度を再乗算しません。
頻度は独自のハンド群別概算であり、前段レンジとの同時均衡・相手カード除去・EVは未計算です。競合チャートは転用していません。
欠損ファイル・JSON構文エラー・不正データではエラーを表示し、戦略を補完せず、他の局面への切り替えは維持します。

UI・データ検証（全15局面と異常系を含む）:
```bash
cd apps/preflop-ui
npm run build
npm run test:sites
node --test tests/*.test.mjs
```

API/SDK自体は独立して利用できます。以下はUIではなくAPIの取得ルートです。

新しい取得ルート（Solution間で同一nodeIdが衝突しない）:
```text
GET /v1/preflop/solutions/{solutionId}/nodes
GET /v1/preflop/solutions/{solutionId}/nodes/{nodeId}
```

一覧はComboを含まない軽量な応答。詳細は選択ノードだけを返します。
現在のFileSolutionStoreはリクエスト毎にファイル全体を読み込むため、大規模運用前に索引・キャッシュが必要です。
本番配信では `VITE_SOLVEAAI_API_BASE_URL` をCloudflare External API WorkerのURLに設定します。
ローカルのRust APIやRedisを本番UIから経由させません。

UIの集計テスト:
```bash
node --test apps/preflop-ui/tests/data.test.mjs
```

## Solution format

Solution metadata は `solutionId`、`solverVersion`、`continuationModelVersion`、`gameConfigHash`、`createdAt`、`iterations`、`convergence`、`validation` を持ちます。`validation` は構造検証の結果と、現時点でGTO検証済みかどうかを明示します。現行Workerの `status` は `provisional`、`exploitabilityStatus` は `sampled_estimate`、`gtoVerified` は `false` です。Decision node ごとに Combo 1326 件の frequency/EV に加えて、actionごとの `regret`、`strategySum`、`counterfactualReach` を保存し、同時に 169 Hand Aggregate を保存します。

JSON は API と v0.1 の file store の transport format です。Domain model は JSON API に直接依存していないため、将来 `MessagePack`、binary format、Object Storage に差し替えられます。

## Solver status — accuracy boundary

`solver-core` は `cfr-v0.2-external-sampling` / `dcfr-v0.2-external-sampling` として、
Preflop Treeのheads-up branchを対象に、次を実装しています。

- private Comboのカード重複を除いたChance sampling
- 相手ノードの現行Strategyによる外部サンプリング
- Counterfactual Reach Probabilityを使ったRegret更新
- 現行StrategyとStrategy Sumの分離
- DCFRの正負Regret discount
- Combo単位のRegret / Strategy Sum / Counterfactual Reach保存
- 決定論的サンプルによるBest Response / Exploitability推定

ただし、これはまだGTO Wizard相当の完成Solverではありません。6-max全員を同時に扱う
Multi-player CFR、正確なPreflop Equity、dead cardを含む全Chanceの列挙、Postflopの
Continuation Solver、厳密なExploitability計算は後続フェーズです。したがってUI上の結果は
引き続き「実験モデル」として扱い、GTO戦略として断定しないでください。

## Known v0.1 limitations

- Tree は v0.1 の single-open / response / 3-bet / 4-bet / all-in の事前生成に限定しています。
- `SimpleContinuationModel` は postflop solve ではありません。
- Exploitability はv0.2では決定論的サンプルによる推定値です。全1326×1326のChanceとBest Responseをまだ完全列挙していません。
- FileSolutionStore は開発・kind用の単純な保存先です。本番配布前に生成済みSolutionを検証し、読み取り専用の配布先へ昇格します。
- Redis Streams Queueはローカルkind専用です。本番APIはJob routeを公開せず、RedisとWorkerを必要としません。
- `solutions/*.json` は 1326 Combo × Node を含むため大きくなります。圧縮・binary format は SolutionRepository の交換対象です。

### データがない場合の表示
- 動作確認用の1反復データはローカルの `solutions/experimental/` に退避済みです。APIの通常一覧は保存先直下のみを読み、これを配信しません。
- 保存結果なし／局面の戦略なしではマトリクス・頻度・EVパネルを描画しません。
- ハンド詳細はAPIに実際のComboがある場合だけ表示します。欠損EVはゼロ補完せず非表示です。
- 再取得開始時には以前の一覧と結果を消去し、失敗時に古い値を残しません。

### 6. kind ローカル環境

Kubernetesの学習とAPI・Worker・Jobの接続確認用に、kind構成を用意しています。kindはクラウドサービスではなく、DockerコンテナをNodeとしてローカルKubernetesを起動するツールです。

前提:

- Docker DesktopまたはDocker Engine
- `kind`
- `kubectl`

起動すると、ローカルのkindクラスタへRedis、API、Worker、UIをデプロイします。起動スクリプトがAPIへ生成Jobを登録し、WorkerがRedis Streamsから取得して `.kind/data/solutions` へ保存します。既存のSolutionが現在のConfigと一致する場合は再計算しません。

```bash
bash scripts/kind-up.sh
open http://127.0.0.1:30080/
```

構成:

```text
kind / Docker
├── solveaai-ui      : NodePort 30080
├── solveaai-internal-api : RedisへJob登録／Solution配信
├── solveaai-redis   : Redis Streams、Consumer Group、Job状態
└── solveaai-worker  : Redisから取得してSolution生成
```

kindのNodeへ `.kind/data` をマウントする開発専用構成です。SolutionとRedis AOFはクラスタを削除しても `.kind/data` に残ります。クラスタだけを削除する場合は次を実行します。

```bash
bash scripts/kind-down.sh
```

Jobの進捗は次で確認できます。

```bash
bash scripts/kind-status.sh
kubectl --context kind-solveaai --namespace solveaai logs deployment/solveaai-worker -f
```

Consumer Groupの分散処理を確認する場合はWorkerを増やせます。

```bash
kubectl --context kind-solveaai --namespace solveaai scale \
  deployment/solveaai-worker --replicas=2
```

この構成は学習・ローカル検証用です。Redis Consumer Groupによる複数Workerは検証できますが、
本番Kubernetes、外部公開、Redis HA、multi-node共有Solution Storageは扱いません。


### 局面設定
- 初期値はBTN vs BB / 2.5 BB。オープンサイズは初期UIでは2.5BB固定です。
- Open対応は、オープン位置と対応位置を選びます。
- 3bet potは、`BTN open → BB 3bet → BTN` のように、3bet後のオープン側を表示します。
- 4bet potは、`BTN open → BB 3bet → BTN 4bet → BB` のように、4bet後の3bet側を表示します。
- データがなくても局面タイプと位置を設定できます。該当する保存済みNodeがない場合は結果を表示しません。
- その他の席はfoldとしてresolveします。multiway履歴入力はこのUIには含みません。
- サイズ・スタックの正本は `configs/cash-6max-100bb.json`。オープンは `open_sizes_bb`（2.5BB）、UIと推定データの3bet・スクイーズ・4betは `fixed_raise_to_bb` の固定BB値（3bet IP 8 / OOP 12、スクイーズ IP 12 / OOP 13（コーラー1人追加ごとに+2.5）、4bet IP 26 / OOP 20）。`*_multiplier` はRustソルバー用です。
- SDKの `preflop.resolve` で取得し、400/404は該当データなし、通信・サーバーエラーは取得失敗として区別します。
- 局面変更時に前の結果を非表示にし、古いレスポンスで上書きされないようにします。閲覧操作によるSolveは行いません。
