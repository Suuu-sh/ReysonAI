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

`apps/frontend/src/estimated/**/*.json` が正本で、D1 `reysonai` はその配信用の写しです。アプリは同梱せず、
`VITE_API_BASE` の Worker から先読みします（未設定なら Vite の同じ形のローカル経路）。

- `GET /v1/preflop/datasets` データセット名とハッシュの一覧
- `GET /v1/preflop/datasets/<name>` JSON 本文（例: `opening-ranges`, `reasons/BB_vs_BTN`）。ETag 付き

## 公開ポストフロップ計算設定（version 1）

`GET /v1/postflop/runtime-config?version=1` は、公開 Web が既に使用している計算設定と固定参照表のみを返します。
保存済みのスポット方針・ハンドレンジは引き続き既存 D1 API から取得します。この endpoint は新しい戦略を生成しません。

- 本文は `JSON.stringify({ schemaVersion: 1, kind: "ai_estimate_not_gto", modelVersion: "reysonai-postflop-runtime-v1", configs: { game, stage2, pilot }, references: { flop: { oop_checks, oop_leads }, later } })`。
- `game` / `stage2` / `pilot` はそれぞれ既存の `configs/cash-6max-100bb.json`、`configs/multiway-preflop-stage2.json`、`apps/frontend/scripts/data/postflop-ai-pilot.json`。
- `oop_checks` / `oop_leads` は Web 共有 `policy.mjs` の `referencePolicyFor`、`later` は `later-policy.mjs` の `referenceLaterPolicy` の既存出力。そのまま参照し、設定・頻度・計算式を再作成しません。
- UTF-8 本文は **30,221 bytes**、SHA256 は **`26beae01badcf7010c43376b0b394e06868361813f88817cee7c5bfa7611ef0b`**。ETag はこのハッシュを二重引用符で囲んだ値です。
- 成功と `304` は `Cache-Control: public, max-age=300, s-maxage=3600, must-revalidate`。条件付き GET は strong / weak / list / `*` の `If-None-Match` に対応します。
- GET 以外（HEAD / OPTIONS を含む）は `405` / `Allow: GET`。version の省略・重複・未対応値や追加の query key は `400`。エラーは `no-store`。固定ハッシュが変わった場合は `503` で停止します。
- 環境変数・アカウント・D1・R2・既存の dataset cache へアクセスしません。ファイル名、ユーザー、spot を受け取る経路はなく、認証情報を必要としない公開 CORS (`*`, credentials なし) の読み取り専用 API です。ブラウザから独自ヘッダーを送る preflight は提供しません。

Native は本文の schema / model version / SHA256 と形を検証した後で計算を初期化してください。
未配信、取得失敗、ハッシュ不一致では明示的に停止し、別の設定や参照戦略へ fallback しません。
参照表は保存済み candidate の代用品ではなく、既存 Web の計算で使う比較・再 raise 参照です。

この v1 の本文は byte-stable な契約です。将来入力や参照関数を変える場合は新しい契約 version と
対応クライアントを独立にレビューし、既存 v1 利用者を黙って別モデルへ移行させないでください。
本番 API の配信と exact body / ETag の確認が完了するまで、依存する Mobile を配信しないでください。
PR の作成は本番配信を意味しません。この endpoint 自体に migration、D1 書込み、新サービスは不要です。

契約・分離テスト: `npm run test:runtime-config`。CI は既存の Web/native 認証テストも再実行します。

## ポストフロップAI方針（D1）

Worker は D1 `reysonai` を読んで返すだけです。表示の計算（盤面・ターン/リバー・根拠・
手ごとのEV）はブラウザで行います。計算は1回17〜63msかかり、Workers Free の CPU 上限 10ms を超えるためです。

- `GET /v1/postflop/spots` 公開中のスポットと方針ハッシュ
- `GET /v1/postflop/spot?spot=<id>` `{ kind, spot, candidate, laterCandidate, report }`（公開時のファイルをそのまま返す）
- `GET /v1/postflop/flop?spot=<id>&flop=<canonical>` フロップの基礎データ（Brotli）

ポストフロップのEVは出しません（2026-10-01 決定。`/v1/postflop/hand-ev` と `postflop_hand_ev` テーブルは廃止、マイグレーション 0006）。

どれも AI 推定で、GTO ではありません。ローカルでは apps/frontend の Vite の `/local-postflop-spot` と `/local-postflop-flop` が同じ本文を返します。

公開手順（1・3行目は apps/backend、2行目は apps/frontend で実行）:

```bash
npx wrangler d1 migrations apply reysonai --remote
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
