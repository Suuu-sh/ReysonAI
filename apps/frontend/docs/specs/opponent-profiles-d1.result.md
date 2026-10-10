# 相手像ポストフロップ方針：CI → D1 配信経路

実施日: 2026-10-08。対象ブランチ: `feature/opponent_profiles_postflop`。

## 実装

- 生成済み960件を `scripts/data/postflop-ai/profiles/{nit,station,lag,maniac}/` にバイト一致でコピー。各プロフィール60局面 × 2役割 × flop/later = 240件。`.gitattributes` の既存LFS対象はプリフロップarchiveのみなので、追加JSONは通常のGit保存対象とし、既存ルールは変更していません。生成レポートは `.local/` に残しています。
- `inputs.mjs` の `artifactPaths` は公開場所を出力先にし、`readArtifact` は公開ファイル優先、存在しなければ旧 `.local/postflop-ai/profiles/` を参照。公開ファイルが壊れている場合は旧候補で隠しません。`generate-profiles.mjs` も共通の `artifactPaths` を使うため出力先が公開場所になります。`generate.mjs` は有効な旧候補を検証後にバイト一致で移し、providerを呼ばず再利用できます。
- 追加専用 `apps/backend/migrations/0012_postflop_profile_policies.sql` を追加。`postflop_profile_policies` の列は `profile, spot_id, role, stage, metadata_json, policy_json, published_at`、主キーは `(profile, spot_id, role, stage)`。metadataとraw policyを別々に保存し、既存テーブルは変更しません。
- `scripts/publish-d1.mjs --only postflop` に相手像方針の全件DELETE → INSERTを追加。生成済み単位はvillain/exploit × flop/laterの4ファイルを要求し、identity、geometry、policy hash、flop/later linkageを `resolveFlopCandidate` / `resolveLaterCandidate` で確認します。部分生成、不正JSON、null/false、未登録ファイル、古い候補は失敗。完全に未生成のマルチウェイ後HUは許容し、標準方針で補いません。
- JSON値ごとの `MAX_VALUE_BYTES = 90_000` を維持。相手像policyを分割する新形式は導入せず、制限超過はSQL出力・実行前にエラーにします。`postflop-profiles` のdataset versionを追加し、policyだけでなくmetadata変更でもキャッシュhashが変わります。
- `.github/workflows/deploy-worker.yml` に0012のpaths triggerと、そのファイルだけを適用するステップを追加。APIのdeploy、方針import、client deployより先に適用します。既存の `--only postflop --require-all` が標準＋相手像を配信し、CIで候補生成やreceipt更新は行いません。
- Workerの `GET /v1/postflop/profile-policy?profile=&spot=&role=&stage=` を追加。4つのselectorを検証し、保存済みJSONをそのまま返します。未生成は `404 / PROFILE_POLICY_MISSING / not_generated`。既存CORSと版キャッシュを利用し、専用経路の版は `postflop-profiles`、標準とflop-baseのキャッシュスコープは維持します。
- フロントは本番APIから4つの役割・stageの候補を取得し、既存のブラウザ計算へ渡します。局面のgeometryは同梱registryを利用し、標準方針の取得・代用はしません。flopの404は段階Bの準備中、laterの404は `laterPolicyError` を通じて後続streetの準備中へ流します。codeのないJSON 404も準備中に統一。ローカル経路、個別consumerのabort、標準経路は維持します。

## 確認結果

`apps/frontend` で実行:

```sh
npm run typecheck
npm run build
node --test --test-force-exit \
  tests/postflop-profile-browser.test.mjs tests/postflop-browser-client.test.mjs \
  tests/postflop-profile-state.test.mjs tests/postflop-profile-ui.test.mjs
node --experimental-strip-types --test --test-concurrency=1 \
  tests/postflop-publish-d1.test.mjs tests/postflop-profile-generation.test.mjs \
  tests/postflop-profile-candidates.test.mjs tests/postflop-profile-batch.test.mjs
node --experimental-strip-types scripts/publish-d1.mjs \
  --only postflop --require-all --out /tmp/reysonai-profile-postflop.sql
```

- typecheck / build: 成功。既存のlocale重複キー・大きいchunkの警告あり。
- browser/client/profile state/UI: 34件成功。JSON 404の回帰を追加後、profile-browser単独18件とtypecheckも成功。
- publisher/generation/candidates/batch: 45件成功。最終のnull/false・metadata版更新回帰を含むpublisher単独8件も成功。
- `apps/backend` の `npm test`: 24件成功、失敗・skipなし。入力検証、複合キーの役割/stage/profile分離、保存JSONのpass-through、404、CORS、版キャッシュを確認。
- 実CLI: 標準85局面＋相手像960行のSQL生成成功。960ファイルすべて旧 `.local` とバイト一致を確認。

| サイズ | 最大値 |
| --- | ---: |
| 相手像policy JSON | 25,297 bytes |
| 相手像metadata JSON | 635 bytes |
| 相手像INSERT文 | 26,127 bytes |
| SQL全体の各statement | 27,600 bytes |

### ローカルDB・接続確認の境界

Wrangler 4.147.0で、認証情報を引き継がない隔離dummy設定と `/private/tmp/` の専用stateを使い、`d1 execute DB --local --persist-to ...` を試しました。しかし環境の `listen EPERM: operation not permitted 127.0.0.1` で起動できませんでした。**実際のローカルD1確認は未完了です。** CLIのlocal flag / persistence仕様は[Cloudflare公式資料](https://developers.cloudflare.com/d1/wrangler-commands/)を確認しています。

代わりにNode SQLiteへ実際のmigrationと21,138,293-byteの配信SQLを投入し、実Worker＋フロント取得関数をSQLite adapter経由で接続して確認しました（HTTPサーバーやD1実機ではありません）。

- 960行すべてのmetadata/policyが公開候補と一致し、各プロフィール240行・60局面、サイズ制限内。
- 複合主キー、migrationの再適用、DELETE/INSERTの再投入、無関係なsentinelデータの保持。
- 4プロフィール計16回の実フロント取得と、ブラウザinput/候補resolverへの接続。標準取得による代用なし。
- 標準経路の200、未生成局面の404/CORS/準備中、later片側欠損の準備中。

この確認は成功。実行記録は `/private/tmp/reysonai-profile-d1-EX42s1/sqlite-route.result.json` にあります。

## 未実施・後続事項

- ブランチ操作、commit、push、stash/reset/checkout、リモートD1、workflow起動、本番deployは行っていません。新規ファイルは未commitの作業ツリーにあります。既存の `.wrangler/`、`output/` と他作業は巻き戻していません。
- `configs/multiway-preflop-stage2.review.json` は未編集。実施前後のSHA-256は `90c7c859a007d5c2373a6f2710991cbb64397f8189e3e2c8292b3aee56b724c8` で一致。
- receiptのsource identityだけを読み取り確認すると、workflow/publisher/inputs/generateの5ソース変更と、import graphの3ソース追加が不一致になります。**現在のままではCIのreceipt一致ゲートは通りません。** 指示どおり一致ゲートを回避せず、receiptの再審査・更新はClaude側の後続作業です。`--only postflop --require-all` 自体の検証は成功しています。
- 本番配信・ブラウザ実画面は未確認。receipt更新後にmainマージの既存CIを通す配信経路を実装した段階です。
