# SolveaGTO Preflop v0.1

SolveaGTO は、SolveaGTO 自身が計算した Poker GTO の Solution を保存・配信するための独立した Solver Platform です。v0.1 の対象は **Cash / 6-max / 100BB / no ante の Preflop** に限定しています。

他社サービスの Range データは使用していません。Postflop Solver、Flop Solve、Trainer、Quiz、Potover 連携、認証、課金、Cloud/Kubernetes はこのリポジトリの対象外です。

## Architecture

```text
configs/*.json
       │
       ▼
preflop-worker ──► preflop-tree ──► solver-core (CFR/DCFR)
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
- `crates/solver-core`: SolverStrategy、CFR/DCFR regret matching、Toy Game、収束メトリクス。
- `crates/solution`: Solver 結果、Combo/Hand Aggregate、永続化 Repository の抽象化。
- `services/preflop-worker`: 計算処理を CLI から分離した Worker 実行エントリ。
- `services/api`: 保存済み Solution の read-only API。Solution 生成はしません。
- `packages/solveagto-sdk-ts`: 外部アプリ向け TypeScript SDK。
- `apps/preflop-ui`: GTOWizard 系の Preflop Strategy UI。169 Hand Matrix、Action Breakdown、Combo 詳細を確認できます。

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

計算は事前生成方式です。通常の API リクエストでは Solver は起動せず、保存済み Solution だけを読み取ります。

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

UI は API の `/v1/preflop/solutions` を同一オリジンの `/api` proxy 経由で確認します。保存済み Solution がまだない場合は、画面操作を確認できる Preview data に自動で切り替わります。

実装済みの主な操作:

- 上部の Position chip を選択して BTN / SB / BB などの Spot を切り替え
- 169 Hand Matrix のセル選択
- Action card の Fold / Call / Raise / All-in フィルタ
- Strategy / Ranges / Breakdown タブ
- Hands / Filters の表示切り替え

## Solution format

Solution metadata は `solutionId`、`solverVersion`、`continuationModelVersion`、`gameConfigHash`、`createdAt`、`iterations`、`convergence` を持ちます。Decision node ごとに Combo 1326 件の frequency/EV を保存し、同時に 169 Hand Aggregate を保存します。

JSON は API と v0.1 の file store の transport format です。Domain model は JSON API に直接依存していないため、将来 `MessagePack`、binary format、Object Storage に差し替えられます。

## Solver note

v0.1 の `CfrStrategy` は、Combo × decision node の regret matching を行う交換可能な SolverStrategy です。`CfrStrategy::cfr()` と `CfrStrategy::dcfr()` を選べます。Toy Matching Pennies を別テストし、既知の mixed equilibrium に近づくことを確認しています。

Poker の完全な multi-player/postflop Nash solve はまだ実装していません。Continuation は trait のみを Solver に公開し、v0.1 の単純モデルを将来の flop subset、Postflop Solver、Neural Network に置き換えられる形にしています。

## Phase status

| Phase | 状態 | 内容 |
| --- | --- | --- |
| 1 | 完了 | Rust workspace / Monorepo / 責務境界 |
| 2 | 完了 | Poker Core、52 Card、1326 Combo、169 Hand Class、Range |
| 3 | 完了 | Config-driven 6-max Preflop Tree、Sizing、Node 解決 |
| 4 | 完了 | Toy CFR、既知の mixed equilibrium テスト |
| 5 | 完了 | Poker tree への CFR/DCFR 接続 |
| 6 | 完了 | ContinuationEvaluator boundary と placeholder model |
| 7 | 完了 | Solution 保存、Combo result、169 Hand Aggregate |
| 8 | 完了 | Preflop Worker と進捗表示 |
| 9 | 完了 | read-only Rust API と resolve |
| 10 | 完了 | TypeScript SDK |

## Known v0.1 limitations

- Tree は v0.1 の single-open / response / 3-bet / 4-bet / all-in の事前生成に限定しています。
- `SimpleContinuationModel` は postflop solve ではありません。
- FileSolutionStore は開発用の単純な保存先です。水平 Worker、Job Queue、object storage、DB index は後続フェーズです。
- `solutions/*.json` は 1326 Combo × Node を含むため大きくなります。圧縮・binary format は SolutionRepository の交換対象です。
