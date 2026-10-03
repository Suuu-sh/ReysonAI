# フロントエンドの本番デプロイ

`deploy-worker.yml` は、フロントエンド・ビルド設定・同ワークフローの変更が `main` に入ったときに実行します。GitHub Actions の **Deploy ReysonAI frontend → Run workflow** からも実行できます（`main` のみ）。

## 初回設定

リポジトリの **Settings → Secrets and variables → Actions** に次の repository secrets を登録してください。

- `CLOUDFLARE_API_TOKEN`: 対象アカウントの Worker と対象ドメインをデプロイできる Cloudflare API トークン。
- `CLOUDFLARE_ACCOUNT_ID`: 本番 Worker がある Cloudflare アカウント ID。

トークンの値はリポジトリやログに記載しないでください。必要な権限は [Cloudflare の GitHub Actions 設定手順](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) を参照してください。

## 対象と確認

- Node.js 22 で `apps/frontend/package-lock.json` に従って依存関係をインストールし、`npm run build` を実行します。
- Wrangler 4.147.0 と `apps/frontend/wrangler.jsonc` で `reysonai` Worker と `dist/client` をデプロイします（`reysonai.com` / `www.reysonai.com` / `app.reysonai.com`）。
- バックエンド Worker、D1 マイグレーション、Worker secrets の更新は行いません。
- 実行中のデプロイは新しい push で中断しません。待機中の実行は最新のものに置き換えます。

変更は `development` で確認後、`main` に取り込みます。取り込み後は Actions の成功と、本番画面への反映を確認してください。Secrets が未設定の場合はデプロイ前にエラーになります。
