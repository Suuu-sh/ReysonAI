# SolveaGTO Preflop v0.1

SolveaGTO は、独自計算した戦略の保存・配信を目指す Solver Platform です。現行Solverは固定ヒューリスティックによる実験モデルであり、Poker CFR/DCFRやGTO精度は未実装・未検証です。v0.1 の対象は **Cash / 6-max / 100BB / no ante の Preflop** に限定しています。

他社サービスの Range データは使用していません。Postflop Solver、Flop Solve、Trainer、Quiz、Potover 連携、認証、課金、Cloud/Kubernetes はこのリポジトリの対象外です。

## Architecture

```text
configs/*.json
       │
       ▼
preflop-worker ──► preflop-tree ──► solver-core (experimental)
       │                 │                    │
       │                 ▼                    ▼
       │          continuation trait     solution format
       │                 │                    │
       └──────────────► FileSolutionStore ◄────┘
                                      │
                                      ▼
                                  Rust API
                                      ▲
                                      │ HTTP
                              TypeScript SDK
```

責務は次のように分離しています。

- `crates/poker-core`: Card、Deck、1326 Combo、169 Hand Class、Combo Range。
- `crates/preflop-tree`: Config から生成する Preflop Game Tree と Action History 解決。
- `crates/continuation`: `ContinuationEvaluator` の差し替え境界。v0.1 は単純な強さベースの placeholder。
- `crates/solver-core`: SolverStrategy、実験的regret matching、Toy Game、変化量メトリクス。
- `crates/solution`: Solver 結果、Combo/Hand Aggregate、永続化 Repository の抽象化。
- `services/preflop-worker`: CLI Worker 実行エントリ（Job向けライブラリ分離は未実装）。
- `services/api`: 保存済み Solution の read-only 配信と、キャッシュミス時の計算 Job 登録。Solution 生成処理そのものは実行しません。
- `packages/solveagto-sdk-ts`: 外部アプリ向け TypeScript SDK。
- `apps/preflop-ui`: 黒・ピンク基調の独自 Preflop Explorer。169 Hand Matrix、Action Breakdown、Combo 詳細を確認できます。

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
cargo run --release -p solveagto-worker -- \
  solve configs/cash-6max-100bb.json
```

保存先は `solutions/` です。別の保存先は第 3 引数、または `SOLVEAGTO_SOLUTION_DIR` で指定できます。

```bash
cargo run --release -p solveagto-worker -- \
  solve configs/cash-6max-100bb.json /tmp/solveagto-solutions
```

Worker の責務は次の順序です。

```text
Config Load → Game Tree Build → Solver Start → Iterations → Solution Build → Solution Save
```

### ローカル Job Queue

`solveagto-worker` は、ローカルファイルを使ったJob Queueと常駐Workerにも対応しています。
Jobは設定内容をJSONに埋め込んで保存するため、enqueue後に元のconfigを変更しても実行内容は変わりません。

```bash
# Jobを登録（既定: jobs/、結果: solutions/）
cargo run --release -p solveagto-worker -- \
  enqueue configs/cash-6max-100bb.json jobs solutions

# Workerを起動して、pending Jobを順番に処理
cargo run --release -p solveagto-worker -- \
  worker jobs

# 1件だけ処理（CIや動作確認向け）
cargo run --release -p solveagto-worker -- \
  worker jobs --once

# Job一覧・詳細確認
cargo run --release -p solveagto-worker -- list jobs
cargo run --release -p solveagto-worker -- status <job-id> jobs

# failed / interrupted Jobを再実行待ちへ戻す
cargo run --release -p solveagto-worker -- retry <job-id> jobs
```

Queueは `jobs/{pending,running,succeeded,failed}` にJobを保存します。
Jobの取得はファイル移動で原子的に行います。現段階ではローカルで1 Workerを動かす前提で、
Worker起動時に前回の `running` Jobを `pending` へ復旧します。将来Redis・Queueサービス・Render Workflowsへ置き換える境界は
`crates/job-queue` です。

計算は事前生成方式です。通常の API リクエストでは Solver は起動せず、保存済み Solution だけを読み取ります。

保存済みSolutionがない場合は、APIからJobを登録してWorkerに計算させられます。既存Solutionの `gameConfigHash` が現在のConfigと一致する場合、または同じSolutionのpending / running Jobがある場合は重複作成しません。重複判定は、v0.1では単一APIプロセス内のロックとローカルQueueを前提にしています。

```bash
# SolutionがなければJobを登録（既定のcash-6max-100bb-v1を対象）
curl -X POST http://127.0.0.1:3000/v1/preflop/jobs \
  -H 'content-type: application/json' \
  -d '{}'

# Jobの状態を確認
curl http://127.0.0.1:3000/v1/preflop/jobs/<job-id>
```

`POST /v1/preflop/jobs` は計算を同期実行しません。`pending` Jobを返し、常駐Workerが計算・保存します。保存完了後に同じリクエストを再実行すると `solutionAvailable: true` が返ります。`POST /v1/preflop/resolve` は引き続き保存済みSolutionのNode解決専用です。

### 3. API を起動

```bash
SOLVEAGTO_SOLUTION_DIR=solutions \
  cargo run --release -p solveagto-api
```

既定 URL は `http://127.0.0.1:3000` です。`SOLVEAGTO_API_BIND` で bind address を変更できます。

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

`packages/solveagto-sdk-ts` は runtime dependency のない fetch ベース SDK です。

```bash
cd packages/solveagto-sdk-ts
npm run build
```

利用例:

```ts
import { SolveaGTOClient } from "@solveagto/sdk";

const solvea = new SolveaGTOClient({
  baseUrl: "http://127.0.0.1:3000",
});

const spot = await solvea.preflop.resolve({
  solutionId: "cash-6max-100bb-v1",
  heroPosition: "BB",
  actions: [
    { position: "BTN", action: "raise", sizeBb: 2.5 },
  ],
});
```

### 5. Preflop UI

別ターミナルで API を起動した状態で、UI の開発サーバーを起動します。

```bash
cd apps/preflop-ui
npm install
npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

UIはTypeScript SDKと同一オリジンの `/api` proxy経由で保存済みデータを取得します。
仮データへのフォールバックはありません。空・読み込み中・失敗を区別し、失敗時は再試行できます。

- Solution選択 → 局面タイプ・オープン位置・対応位置で局面設定 → 169ハンド選択
- 初期Configではオープンを2.5BBだけ生成。2BB/3BBは計算量を抑えるため生成しない
- Open対応、3bet pot（Open → 3bet後のOpen側）、4bet pot（Open → 3bet → 4bet後の3bet側）
- サイズ別アクション頻度、選択ハンドの戦略加重EV、実際のCombo別頻度/EV
- 全Comboの頻度は等重み集計（到達レンジ加重ではない）
- エクイティは未計算。現行Solverの結果には常時「実験モデル・GTO精度未検証」と表示
- 終端ノードは戦略なしとして表示
- 読み取り専用。ブラウザ操作でSolverを起動しない

新しい取得ルート（Solution間で同一nodeIdが衝突しない）:
```text
GET /v1/preflop/solutions/{solutionId}/nodes
GET /v1/preflop/solutions/{solutionId}/nodes/{nodeId}
```

一覧はComboを含まない軽量な応答。詳細は選択ノードだけを返します。
現在のFileSolutionStoreはリクエスト毎にファイル全体を読み込むため、大規模運用前に索引・キャッシュが必要です。
本番配信では `/api` をRust APIへ転送する設定が別途必要です（Vite proxyは開発専用）。

UIの集計テスト:
```bash
node --test apps/preflop-ui/tests/data.test.mjs
```

## Solution format

Solution metadata は `solutionId`、`solverVersion`、`continuationModelVersion`、`gameConfigHash`、`createdAt`、`iterations`、`convergence` を持ちます。Decision node ごとに Combo 1326 件の frequency/EV を保存し、同時に 169 Hand Aggregate を保存します。

JSON は API と v0.1 の file store の transport format です。Domain model は JSON API に直接依存していないため、将来 `MessagePack`、binary format、Object Storage に差し替えられます。

## Solver status — not GTO

`CfrStrategy` は局面・Comboごとの固定評価式にregret matchingを適用しています。
相手の戦略、反実仮想到達確率、ゲーム木の再帰的評価が未実装のため、
名前やバージョン文字列にCFR/DCFRがあっても本来のPoker CFR/DCFRではありません。
Matching Penniesテストも均衡初期値から開始するため、十分な収束検証ではありません。
当初のv0.1完成条件はまだ満たしていません。UI/APIの動作検証とSolver精度の検証を混同しないでください。

## Known v0.1 limitations

- Tree は v0.1 の single-open / response / 3-bet / 4-bet / all-in の事前生成に限定しています。
- `SimpleContinuationModel` は postflop solve ではありません。
- FileSolutionStore と FileJobQueue は開発・kind用の単純な保存先です。複数APIレプリカでの重複排除、水平Worker、object storage、DB index は後続フェーズです。
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

起動すると、ローカルのkindクラスタへAPI、Worker、UIをデプロイします。`solveagto-precompute` JobはSolutionが存在しない場合だけ現在のConfigから実際のSolutionを計算し、`.kind/data/solutions`へ保存します。既存のSolutionがあれば計算をスキップします。

```bash
bash scripts/kind-up.sh
open http://127.0.0.1:30080/
```

構成:

```text
kind / Docker
├── solveagto-ui       : NodePort 30080
├── solveagto-api      : ClusterIP 3000
├── solveagto-worker   : file-backed Job Queue worker
└── solveagto-precompute: initial Solution Job
```

kindのNodeへ `.kind/data` をマウントする開発専用構成です。SolutionとJobのファイルはクラスタを削除しても `.kind/data` に残ります。クラスタだけを削除する場合は次を実行します。

```bash
bash scripts/kind-down.sh
```

Jobの進捗は次で確認できます。

```bash
bash scripts/kind-status.sh
kubectl --context kind-solveagto --namespace solveagto logs job/solveagto-precompute -f
```

この構成は学習・ローカル検証用であり、本番のKubernetes運用、外部公開、複数Workerの安全な共有ストレージを扱うものではありません。


### 局面設定
- 初期値はBTN vs BB / 2.5 BB。オープンサイズは初期UIでは2.5BB固定です。
- Open対応は、オープン位置と対応位置を選びます。
- 3bet potは、`BTN open → BB 3bet → BTN` のように、3bet後のオープン側を表示します。
- 4bet potは、`BTN open → BB 3bet → BTN 4bet → BB` のように、4bet後の3bet側を表示します。
- データがなくても局面タイプと位置を設定できます。該当する保存済みNodeがない場合は結果を表示しません。
- その他の席はfoldとしてresolveします。multiway履歴入力はこのUIには含みません。
- サイズ・スタック・3bet/4bet倍率の正本は `configs/cash-6max-100bb.json`。初期Configのopen_sizes_bbは `[2.5]` です。
- SDKの `preflop.resolve` で取得し、400/404は該当データなし、通信・サーバーエラーは取得失敗として区別します。
- 局面変更時に前の結果を非表示にし、古いレスポンスで上書きされないようにします。閲覧操作によるSolveは行いません。
