# SolveaAI Edge API

Cloudflare Worker上で動作する、本番用の読み取り専用APIです。

## 責務

- 本番UIからのSolution一覧・詳細・Resolveリクエストを処理する
- Cloudflare R2の検証済み成果物だけを読む
- Solver、Redis、ローカルAPIへ接続しない
- Job登録 route を持たない

ローカルUIは引き続き `/api` を使います。Viteの開発proxyまたはkindのNginxが
ローカルRust APIへ転送し、ローカルRedisとローカルSolver Workerが処理します。

本番UIでは `VITE_SOLVEAAI_API_BASE_URL` をこのWorkerのURLに設定します。

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
