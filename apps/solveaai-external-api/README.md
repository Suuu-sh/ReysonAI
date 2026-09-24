# SolveaAI External API

Cloudflare Worker上で動作する、本番用の読み取り専用APIです。

## 責務

- 本番UIからのSolution一覧・詳細・Resolveリクエストを処理する
- Cloudflare R2の検証済み成果物だけを読む
- Solver、Redis、ローカルAPIへ接続しない
- Job登録 route を持たない

ローカルUIは引き続き `/api` を使います。Viteの開発proxyまたはkindのNginxが
ローカルRust APIへ転送し、ローカルRedisとローカルSolver Workerが処理します。

本番UIでは `VITE_SOLVEAAI_API_BASE_URL` をこのWorkerのURLに設定します。

## 推定レンジ（R2不要）

`apps/preflop-ui/src/estimated/*.json` のAI推定レンジ（GTOではない）をWorkerに同梱して配信します。
R2への公開は不要で、`wrangler dev` ではローカルのJSONを、`wrangler deploy` ではデプロイ時点のJSONを返します。
JSONを更新したら再デプロイしてください。

| Route | 内容 |
| --- | --- |
| `GET /v1/estimated/datasets` | データセット一覧（opening / open-responses / three-bet-responses / four-bet-responses / five-bet-responses / limp-responses） |
| `GET /v1/estimated/spots` | 全スポットの目次。hero、正規化した履歴 `history`、選択肢 `options` を含み、ハンド頻度は含まない |
| `GET /v1/estimated/datasets/{dataset}/spots/{spotId}` | 169ハンドの頻度。`frequencies` は `fold` / `call` / `check` / `raise_<sizeBb>` / `all_in` をキーにした0〜1の値 |

`reachable: false` は、前段で自分が選んだアクションの頻度が0%のため、そのスポットに到達しないハンドです（例：3betしないハンドの4bet応答）。推奨として扱わないでください。

ローカル起動:

```bash
npx wrangler dev --port 8790
```

## R2の成果物

Workerは、次の2ファイルをR2バケットから読み込みます。

```text
manifest.json
solutions/<solutionId>.json
solutions/<solutionId>/summary.json
solutions/<solutionId>/nodes/index.json
solutions/<solutionId>/nodes/<nodeId>.json
```

ローカルで `solveaai-promote` を実行した後、リリース成果物を公開します。

```bash
bash scripts/publish-solution-r2.sh release/solveaai solveaai-solutions
```

成果物を先に、`manifest.json`を最後にアップロードします。Workerが未配置の
Solutionをmanifest経由で参照しないようにするためです。

本番UIの一覧・Resolve・Node取得は分割済みのedge artifactを使います。大きな
Solution全体JSONは互換用に残しますが、通常のリクエストごとに全体を読み込みません。

## Cloudflare設定

`wrangler.jsonc` のR2バケット名と、`ALLOWED_ORIGIN`を本番UIのOriginに合わせます。

```jsonc
{
  "r2_buckets": [
    {
      "binding": "SOLUTIONS",
      "bucket_name": "solveaai-solutions"
    }
  ],
  "vars": {
    "ALLOWED_ORIGIN": "https://app.example.com"
  }
}
```

デプロイ:

```bash
npx wrangler deploy
```

## ローカルテスト

R2をモックした契約テストを実行します。

```bash
npm test
```
