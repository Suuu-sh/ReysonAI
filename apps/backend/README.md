# ReysonAI Edge API

Cloudflare Worker上で動作するTypeScriptの読み取り専用APIです。

## 責務

- 公開済みSolutionの一覧・詳細・Resolveリクエストを処理する
- Cloudflare R2の検証済み成果物とD1の公開済み推定データ・方針を読む
- Solver、Redis、ローカルAPIへ接続しない
- Job登録 route を持たない

現在の `apps/frontend` は `VITE_API_BASE` を設定したビルドで、このAPIからD1の保存済み推定データ・方針を取得します。未設定のVite開発環境は同じ形のローカル経路を使います。
Rust SolverのR2成果物配信は、アプリ向けのD1推定データ配信とは別の経路です。

## R2の成果物

Workerは、次の2ファイルをR2バケットから読み込みます。

```text
manifest.json
solutions/<solutionId>.json
solutions/<solutionId>/summary.json
solutions/<solutionId>/nodes/index.json
solutions/<solutionId>/nodes/<nodeId>.json
```

ローカルで `reysonai-promote` を実行した後、リリース成果物を公開します。

```bash
bash scripts/publish-solution-r2.sh release/reysonai reysonai-solutions
```

成果物を先に、`manifest.json`を最後にアップロードします。Workerが未配置の
Solutionをmanifest経由で参照しないようにするためです。

一覧・Resolve・Node取得のレスポンスは分割済みのedge artifactを使います。大きな
Solution全体JSONは互換用に残しますが、通常のリクエストごとに全体を読み込みません。

## プリフロップのデータセット（D1）

`apps/frontend/src/estimated/**/*.json` が正本で、D1 `evionai` はその配信用の写しです。アプリは同梱せず、
`VITE_API_BASE` の Worker から先読みします（未設定なら Vite の同じ形のローカル経路）。

- `GET /v1/preflop/datasets` データセット名とハッシュの一覧
- `GET /v1/preflop/datasets/<name>` JSON 本文（例: `opening-ranges`, `reasons/BB_vs_BTN`）。ETag 付き

## ポストフロップAI方針（D1）

Worker は D1 `evionai` を読んで返すだけです。表示の計算（盤面・ターン/リバー・根拠・
手ごとのEV）はブラウザで行います。計算は1回17〜63msかかり、Workers Free の CPU 上限 10ms を超えるためです。

- `GET /v1/postflop/spots` 公開中のスポットと方針ハッシュ
- `GET /v1/postflop/spot?spot=<id>` `{ kind, spot, candidate, laterCandidate, report }`（公開時のファイルをそのまま返す）
- `GET /v1/postflop/flop?spot=<id>&flop=<canonical>` フロップの基礎データ（Brotli）

ポストフロップのEVは出しません（2026-10-01 決定。`/v1/postflop/hand-ev` と `postflop_hand_ev` テーブルは廃止、マイグレーション 0006）。

どれも AI 推定で、GTO ではありません。ローカルでは apps/frontend の Vite の `/local-postflop-spot` と `/local-postflop-flop` が同じ本文を返します。

公開手順（1・3行目は apps/backend、2行目は apps/frontend で実行）:

```bash
npx wrangler d1 migrations apply evionai --remote
npm run publish:d1 -- --execute remote
npx wrangler deploy
```

`--execute` を付けなければ `apps/frontend/.local/reysonai-d1.sql` を作るだけです。`--execute local` と
`npx wrangler dev --local` でローカル確認できます。ハンド別EVは D1 の1文100KB制限に収めるため
盤面×履歴ごとの行に分けて保存し、Worker で元のファイル形に戻します。
アプリ側は `VITE_API_BASE=https://<worker>` を付けてビルドすると Worker を使います。

## Cloudflare設定

`wrangler.jsonc` のR2バケット名と、`ALLOWED_ORIGIN`をAPI利用者のOriginに合わせます。

```jsonc
{
  "r2_buckets": [
    {
      "binding": "SOLUTIONS",
      "bucket_name": "reysonai-solutions"
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
