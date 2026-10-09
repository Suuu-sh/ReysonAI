# 相手像ポストフロップ 段階D：生成の仕組み

対象: `feature/opponent_profiles_postflop` / `apps/frontend`。実際のLLM生成は実行していません。ブランチ操作・commit・push・stash・reset・checkout、本番公開・D1書き込みも行っていません。既存のリポジトリ直下 `.wrangler/`、`output/` と他作業は保持しています。

## 実装

- `scripts/postflop-ai/generate.mjs`: `promptFor` / `promptForLater` に `{ profile, role }` を追加。villainは相手像自身の打ち方、exploitはその相手像への対策。4相手像を区別し、標準の非搾取・均衡ブラフ比率の助言だけを明示的に上書きします。合法アクション、整数頻度合計、全フォールバック、ボード高さ、OOP/IPの区別、後続のline/texture上書き・全tierの低いドンク頻度は維持します。
- 役割ファイルはどちらも通常の**完全な方針スキーマ**。両側のノードを同じ役割として記述し、段階Cの合成時に相手席へvillain、もう一方へexploitを選びます。席を切り替えた際に片側だけ標準方針になることを避けます。
- `generation-options.mjs`: 段階Bの `defaultOpponentSeat` を共有。既定は最後のプリフロップアグレッサー、すべてのSBリンプ分岐ではBB。`loadInputs` / `buildInputs` の相手像入力をそのまま要約に使い、標準レンジを代用しません。
- `cli.mjs`: `generate` / `generate-later` に `--profile`、`--role`、`--force`、任意の `--opponent-seat ip|oop` を追加。役割・相手像・入力・候補の整合性を確認してから生成。後続は**同じ役割のflop候補**を参照します。
- `generate-profiles.mjs`: 全flopジョブの完了後にlaterを開始し、同時実行数を制限。失敗しても残りを続行し、失敗したflopへのlater依存はスキップ。入力を実際に組み立てて到達可能性を判定し、標準の `spot.reachable` だけでは除外しません。
- `audit-all-boards.mjs`: `--profile`、`--table-profile <call>,<three_bet>` に対応。相手像の未生成、入力の到達不能、不正／古い候補を区別。標準の監査結果を相手像／非標準卓の結果で上書きしません。

相手像監査は全1,755フロップでカード除去後のroot到達を確認し、到達不能なボードは別集計。段階Cの方針構造チェック・役割別助言も使います。助言はボード非依存のルール単位で、レンジ加重の品質評価や全ターン／リバー分岐の網羅ではありません。レポートにもこの境界を明示します。未生成を成功には数えません。

### 保存・再実行

```text
.local/postflop-ai/profiles/<profile>/<slug>-villain-policy.json
.local/postflop-ai/profiles/<profile>/<slug>-exploit-policy.json
.local/postflop-ai/profiles/<profile>/<slug>-villain-later-policy.json
.local/postflop-ai/profiles/<profile>/<slug>-exploit-later-policy.json
```

段階Cの `profileArtifactKey` と同じキー。metadataに `profile` / `role` / `structure_hash` / `source_hash`（生成に用いた相手像入力のfingerprint）を記録。laterの `flop_policy_hash` は役割別flopのハッシュです。

有効な既存候補はLLMを呼ばず再利用し、batchではスキップとして記録。不正／古い候補は失敗で、勝手に上書きしません。`--force` は相手像のローカル候補のみを明示的に再生成。生成失敗・形式不正では既存ファイルを保ちます。標準の生成コマンド、プロンプト、候補JSON形式は維持し、標準候補への `--force` は拒否します。

実行結果は `.local/postflop-ai/profiles/generation-report.json` の `successes` / `failures` / `skips` と集計に残ります。失敗があればCLI終了コード1。再実行でレポートは更新されるため、実行ごとの記録が必要ならコピーして保存してください。

## Claudeが後で実行するコマンド

以下は**未実行の手順**です。`claude` CLIの認証済み環境で実行。`--model gpt-6-luna --effort max` への変更も可能です。卓の9通りごとの方針生成は不要です。

### パイロット：BTN_open_BB_call、4相手像×2役割×flop/later（16ファイル）

```sh
cd /Users/yota/Projects/Products/ReysonAI/apps/frontend
node scripts/postflop-ai/generate-profiles.mjs \
  --profiles nit,station,lag,maniac --roles villain,exploit \
  --spots BTN_open_BB_call --stage both --concurrency 4 \
  --model claude-sonnet-5-5 --effort max

for profile in nit station lag maniac; do
  node scripts/postflop-ai/audit-all-boards.mjs \
    --spot BTN_open_BB_call --profile "$profile" --street all --workers 4
done
```

単体生成の例（先に同役割のflopを生成）:

```sh
node scripts/postflop-ai/cli.mjs generate \
  --spot BTN_open_BB_call --profile nit --role villain \
  --model claude-sonnet-5-5 --effort max
node scripts/postflop-ai/cli.mjs generate-later \
  --spot BTN_open_BB_call --profile nit --role villain \
  --model claude-sonnet-5-5 --effort max
```

### 全登録局面

```sh
node scripts/postflop-ai/generate-profiles.mjs \
  --profiles nit,station,lag,maniac --roles villain,exploit \
  --spots all --stage both --concurrency 4 \
  --model claude-sonnet-5-5 --effort max

for profile in nit station lag maniac; do
  node scripts/postflop-ai/audit-all-boards.mjs \
    --profile "$profile" --street all --workers 4
done
```

現在の登録は89局面（標準の到達可能85＋標準ではSBコール0の4局面）。相手像入力で到達しない局面はスキップ、未保存の相手像プリフロップ因子は失敗として記録。スクイーズ／コールド4bet等の追加historyの相手像因子は先に用意する必要があります。別の局面や標準レンジでは補いません。

SBフラット4局面は既定の「相手＝アグレッサー」だと自分側のSB標準コールが0です。**相手をSB（OOP）に明示した別実行**で生成できます。必須の既定席を勝手に変更することはありません。

```sh
node scripts/postflop-ai/generate-profiles.mjs \
  --profiles nit,station,lag,maniac --roles villain,exploit \
  --spots UTG_open_SB_call,HJ_open_SB_call,CO_open_SB_call,BTN_open_SB_call \
  --opponent-seat oop --stage both --concurrency 4 \
  --model claude-sonnet-5-5 --effort max

for profile in nit station lag maniac; do
  node scripts/postflop-ai/audit-all-boards.mjs \
    --spot UTG_open_SB_call --spot HJ_open_SB_call \
    --spot CO_open_SB_call --spot BTN_open_SB_call \
    --profile "$profile" --opponent-seat oop --street all --workers 4
done
```

監査の標準出力先は従来の `.local/postflop-ai/all-boards-audit/`。相手像／非標準卓はその下の `profiles/<profile>/call_<call>__three_bet_<three_bet>/`、明示席はさらに `opponent_ip/` または `opponent_oop/` に分離。`summary.md` / `summary.json` と局面別JSONに未生成数・警告・エラー・到達不能数を残します。

### 標準方針を卓設定で点検

卓の値は内部ID `low / normal / high`（CLIは `standard` も `normal` の別名として受理）。次は方針を生成せず、差し替えレンジで全1,755フロップを点検します。

```sh
node scripts/postflop-ai/audit-all-boards.mjs --profile standard --table-profile high,normal --street flop --workers 4
node scripts/postflop-ai/audit-all-boards.mjs --profile standard --table-profile low,normal --street flop --workers 4
node scripts/postflop-ai/audit-all-boards.mjs --profile standard --table-profile normal,high --street flop --workers 4
```

## 確認結果

- `npm run typecheck`: frontend／runtimeとも成功。
- `npm run build`: 成功。`dist/client/index.html` / `dist/server/index.js` / `dist/.openai/hosting.json` を確認。既存のlocale JSON重複キー・500KB超bundleの警告は残ります。
- 追加テスト **45件成功**: `postflop-profile-generation` 13、`postflop-profile-batch` 14、`postflop-profile-all-boards` 18。生成はすべて注入したモックのみ。個別担当による確認と、変更したケースだけの再確認で最終差分を検証しました。
- 標準プロンプトは**変更前に固定した10局面×flop/laterの文字列とbyte一致**。SRPの両ツリー、3bet、4bet、リンプ、スクイーズ／コールド4betのhistoryを含みます。
- 保存先・metadata、両役割を実際に保存したモックJSONから `resolveFlopCandidate` / `resolveLaterCandidate` が読み取れること、再利用／force、失敗時の既存ファイル保持、batchのphase barrier・並列上限・到達不能・欠損・失敗継続・依存スキップを確認。モックの保存ファイルは個別に削除済みです。
- 既存focused回帰 **50件成功**: `postflop-profile-candidates` 10、残り `postflop-ai` / `postflop-later` / `postflop-profile-inputs` / `postflop-profile-mix` / `postflop-profile-balance` の40。標準候補の厳密なsource照合、相手像mix／補足facts、入力・構造チェックを保持。
- 実ローダーによる未生成smoke: NIT／BTN_open_BB_call／flopで `PROFILE_POLICY_MISSING`、未生成1、boards=0、監査の終了コード1を確認。出力は `/private/tmp/reysonai-opponent-profiles-stageD-audit-smoke/` に分離し、生成・board workerは起動していません。
- `git diff --check`: 成功。ブランチは指定の `feature/opponent_profiles_postflop` のままです。

検証ログ: `/private/tmp/reysonai-opponent-profiles-stageD-typecheck.log`、`/private/tmp/reysonai-opponent-profiles-stageD-build.log`、`/private/tmp/reysonai-opponent-profiles-stageD-regression.log`、`/private/tmp/reysonai-profile-all-boards-tests.log`。

## 未実施／境界

- 実際のLLM方針生成、実方針の全1,755フロップ品質監査、代表局面の頻度比較、実画面での相手像方針確認は未実施。モック方針は実データとして残していません。
- 公開D1への相手像配信・取り込みは段階B/Cと同じく後続作業。ローカル生成・点検は公開や最適性の証明ではありません。
- EVで頻度を決定する処理、hand-EV研究計算、flop-base生成、画面変更は追加していません。
- 全件テスト、標準85局面の固定seed全件監査、実方針の全ボード監査は再実行していません。本依頼の生成機構に対する追加テストと影響範囲の回帰だけを確認しています。

## 実行結果（2026-10-08, Claude）

- 生成: gpt-6.1-sol / effort high。60個の局面 slug（HU 後のマルチウェイ履歴を含む）× 4相手像 × villain/exploit × flop/later = 960ファイル（`.local/postflop-ai/profiles/`、未公開）。一時的な認証切れ2件は個別に再生成。
- 未対応: マルチウェイ後HU 25局面は相手像の `multiway-responses` プリフロップデータが無いため生成不可（段階Aの拡張が必要）。相手像レンジで到達しない64件はスキップ。
- 破綻チェック（全1,755フロップ・flop+later）: 4相手像とも error 0。警告は maniac の air-allin 87件（river_ip_first 63・river_oop_first 24）のみ。
- 卓の状況（call=high / call=low / three_bet=high）の standard 全ボード点検: 85局面 error 0。警告 413〜414件は標準卓の 413件と同水準（overcall・value-only-raise が中心）。
- 傾向（BTN_open_BB_call、ルール単純平均）: 相手BTNのCベット 標準46% / NIT15 / station18 / LAG52 / maniac73。自分BBの対75%フォールド 標準40 / 対NIT57 / 対station38 / 対LAG32 / 対maniac23。
- 残課題: D1 配信経路（相手像キー）、マルチウェイ後局面の相手像プリフロップデータ。
