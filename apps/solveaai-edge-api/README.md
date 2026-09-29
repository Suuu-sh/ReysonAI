# SolveaAI Edge API

Cloudflare Worker上で動作するTypeScriptの読み取り専用APIです。

## 責務

- 公開済みSolutionの一覧・詳細・Resolveリクエストを処理する
- Cloudflare R2の検証済み成果物だけを読む
- Solver、Redis、ローカルAPIへ接続しない
- Job登録 route を持たない

現在の `preflop-ui` は保存済み推定レンジを直接読み、このAPIを呼び出しません。
このWorkerは独立した実験・配信経路で、公開済みR2成果物だけを返します。

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

一覧・Resolve・Node取得のレスポンスは分割済みのedge artifactを使います。大きな
Solution全体JSONは互換用に残しますが、通常のリクエストごとに全体を読み込みません。

## ポストフロップAI方針（D1）

`/v1/postflop/{board|explain|later|later-explain|later-hand-ev|hand-ev}?spot=...` は、
preflop-ui のローカル表示（`/local-postflop*`）と同じ本文を D1 `solveaai-postflop` から返します。
計算コードは `apps/preflop-ui/scripts/postflop-ai` を共有し、ファイル読み込みだけを D1 の行に差し替えます。
`/v1/postflop/spots` は公開中のスポットと方針ハッシュの一覧です。AI推定でありGTOではありません。

公開手順（1・3行目は edge-api、2行目は preflop-ui で実行）:

```bash
npx wrangler d1 migrations apply solveaai-postflop --remote
npm run postflop-ai:publish-d1 -- --execute remote
npx wrangler deploy
```

`--execute` を付けなければ `.local/postflop-d1.sql` を作るだけです。`--execute local` と
`npx wrangler dev --local` でローカル確認できます。ハンド別EVは D1 の1文100KB制限に収めるため
盤面×履歴ごとの行に分けて保存し、Worker で元のファイル形に戻します。
アプリ側は `VITE_POSTFLOP_API=https://<worker>` を付けてビルドすると Worker を使います。

## Cloudflare設定

`wrangler.jsonc` のR2バケット名と、`ALLOWED_ORIGIN`をAPI利用者のOriginに合わせます。

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
