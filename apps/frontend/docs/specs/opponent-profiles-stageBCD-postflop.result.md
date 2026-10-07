# 相手像ポストフロップ 段階C 1–5 実装結果

対象: `feature/opponent_profiles_postflop` / `apps/frontend`。段階Cの1–5のみ。
画面（C6／B）、段階Dの相手像方針生成、LLM呼び出し、commit／push／ブランチ操作、本番公開／D1書き込みは行っていない。
作業前から存在するリポジトリ直下の `.wrangler/`、`output/` は変更対象外。

## 変更ファイル

### 入力・方針選択
- `scripts/postflop-ai/types.ts`: オプション／調整情報の型。
- `scripts/postflop-ai/browser-inputs.ts`: `buildInputs(spotId, datasets, options)`。
- `scripts/postflop-ai/inputs.mjs`: `loadInputs(spotId, options)`、席別方針ファイルと配信アダプター。
- `scripts/postflop-ai/input-options.ts`: 入力差し替え、幾何の検証、構造ハッシュ。
- `scripts/postflop-ai/candidate-source.ts`: 入力整合性、villain／exploitの席別合成、配信キー。
- `scripts/postflop-ai/generate.mjs`: 既存候補ローダーの構造照合／席別読み込み。将来の標準候補のメタデータに構造ハッシュを記録。調整入力での生成は明示的に拒否する（生成機能の拡張は段階D）。
- `scripts/postflop-ai/local-view.mjs`: 読み取り専用ローカルAPIの入力オプション・調整印・未生成エラー。
- `src/estimated/postflop-compute.ts`: ブラウザー計算の入力オプション・席別候補・調整印。調整時は標準flop-baseを使わない。

### mix・補足facts・構造チェック
- `scripts/postflop-ai/defence.ts`: 相手像モードの計算防御／上限／下限／SPR制限を無効化。合法化した方針頻度で到達レンジも計算する。
- `scripts/postflop-ai/profile-reference.ts`: 頻度に使わない計算上の補足facts。
- `scripts/postflop-ai/flop-ui-facts.ts`: フロップの補足facts。
- `scripts/postflop-ai/explain.mjs`: 研究／ローカル説明経路の補足facts。
- `scripts/postflop-ai/explain-later.ts`: ターン／リバーの補足facts。
- `scripts/postflop-ai/balance.mjs`: 相手像の構造エラーと行動警告。

### テスト・記録
- `tests/postflop-profile-inputs.test.mjs`
- `tests/postflop-profile-candidates.test.mjs`
- `tests/postflop-profile-mix.test.mjs`
- `tests/postflop-profile-balance.test.mjs`
- `tests/fixtures/profile-mix-cases.json`
- 本ファイル。

## 設計判断

### 1. レンジの差し替え

`options = { tableProfile, opponentProfile, opponentSeat }`。相手像は `standard / nit / station / lag / maniac`、相手席は `ip / oop`。standard以外では相手席を必須とする。

- オプション無し／明示した標準オプションは従来と同じ `seatRows` と `fingerprint`。BTN→BBの固定ハッシュおよび既存の全HU入力整合性テストで確認。
- 卓設定はプリフロップの各到達因子に `adjustOpeningSpot`／`applyTableProfile` を適用してから積を作る。
- 相手像では相手席の因子のみを `profiles/<profile>/villain/<dataset>` から読む。相手像と卓設定を掛け算しない。自分の席は卓設定のレンジを維持する。
- SRP／3bet／4bet／リンプ深部／登録済みhistory型HUを同じ因子方式で扱う。追加historyの相手像データが存在しない場合は明示エラー。標準レンジを代用しない。
- 相手像でのみ到達するSBフラットも入力として扱える。画面の利用条件・設定UIは変更していない。

### 2. 構造ハッシュと旧候補

`structure_hash` はスポット識別・履歴・席・ツリー・ポット・スタック・サイズ・`gameConfig`・従来の `flopConfig()` を含み、レンジ因子とレンジ由来の到達統計を含めない。

- 標準時は従来通り `source_hash === fingerprint` を要求。監査の厳密な入力／レポート照合は変更しない。
- 差し替え時は保存候補の `structure_hash` を照合。
- 旧候補に構造ハッシュが無い場合は、その完全な `source_hash` が現在の入力または標準入力の完全ハッシュ（`baselineFingerprint`）に一致する時だけ入力から構造を認証する。任意の古いハッシュを現在の構造として承認しない。
- 構造変更、方針本文のハッシュ不一致、席別のflop↔later参照不一致は拒否。
- 差し替えた計算結果に `adjusted: { tableProfile, opponentProfile }` と `structure_hash` を返す。保存済み候補ファイルは書き換えない。

### 3. 相手像方針／D1配信の設計

ローカルファイルは指定通り:

```text
.local/postflop-ai/profiles/<profile>/<slug>-villain-policy.json
.local/postflop-ai/profiles/<profile>/<slug>-exploit-policy.json
.local/postflop-ai/profiles/<profile>/<slug>-villain-later-policy.json
.local/postflop-ai/profiles/<profile>/<slug>-exploit-later-policy.json
```

両ファイルを既存の完全な方針スキーマで検証し、ノードのIP/OOP役割から相手席にvillain、他方にexploitのルールを選ぶ。合成はメモリ内だけで、元の候補ペアを `profileCandidates` に保持して席別ハッシュ参照を再検証できるようにする。

欠損は `PROFILE_POLICY_MISSING`。ローカルHTTPは404／`state: "not_generated"`。standardや他方の席の方針へフォールバックしない。

配信側の追加契約は `useArtifactSource({ ranges, artifact, profileArtifact(key) })`。`profileArtifactKey` がファイル名と同じ `profiles/<profile>/<slug>-<role>-{policy|later-policy}` キー（拡張子無し）を作る。旧アダプターにこの読み取り関数が無い場合も「未生成」とする。

現在の本番D1 `postflop_policies` は `(spot_id, stage)` で、stageにflop／later制約がある。その既存キー・ルート・監査を変更せず、将来は上記の `artifact_key` を主キーにした独立の相手像方針テーブル／配信を追加する設計とした。例えば `postflop_profile_policies(artifact_key, spot_id, profile, role, stage, policy_hash, metadata_json, policy_json)`。ブラウザー側の計算APIは役割別ペアも既に受け取れる。本作業ではDBマイグレーション、公開HTTPエンドポイントの追加、取り込み、公開はしていない。

### 4. 頻度と補足factsの分離

相手像の両席で `withRaise`／`effectiveMix` の合法化だけを通す。コール／フォールドの上書き、ブラフ上限、防御上下限、リバー大SPRのallin移し替えはしない。到達レンジも同じ頻度を使う。

`profile_reference` は別のキャッシュ／計算モードから得る補足:

- `shown_mix`: 合法化後の相手像方針（百分率）。
- `balanced_mix`: 同じ差し替えレンジ・合成方針に通常の計算防御を適用した反実仮想の頻度。独立した均衡方針やGTOではない。
- `action_ev_bb`／`max_ev_action`: 明示した「一段の勝率×実現率・ショーダウン」モデルでの比較。相手の継続はレイズも含めてコール扱い、将来のベット／再レイズはモデル化しない。実際のスタック上限・増分コスト・レーキと、既存の勝率／実現率計算を利用。
- 全合法アクションを評価できた時だけ最大アクションを返す。不足時はnull、評価済み／未対応アクションと理由を返す。

この補足から頻度や到達レンジを変更しない。標準モードには追加しない。旧hand-EV／exact-EV研究モジュール、EV画面、EV API／worker／DBは復活させていない。

### 5. 相手像用チェック

`checkProfileBalance(inputs, flopPolicy, laterPolicy, { requestedPaths })`。既存のflop／laterチェックも相手像ではここへ分岐。

- error: 非合法アクション、頻度合計／スキーマ／必須フォールバックの破綻、明示したpending decisionが終端・合法化・ゼロ到達／カード非互換により到達不能。
- warn: monsterの95%以上fold、airの50%以上allin、nit／station相手席のairが50%以上bet／raise。
- 警告は方針ルール単位の助言で、レンジ加重の品質評価ではない。通常のゼロ頻度分岐は構造エラーにしない。MDF目標やno-overrides条件を相手像の公開要件に使わない。

## 検証

- 追加focused tests: 入力8、候補10、mix／facts9、構造チェック9の計36件成功。独立レビューで見つかった「baseline無しのundefined同士の一致」「未コール額に対するレーキ」を修正し、回帰テストを追加。
- `npm run typecheck`: 成功（最初の型エラーを入力IDの必須ガードで修正後）。別作業commit `4f505fb7` が入った後の現行チェックアウトでも再確認して成功。
- `npm run build`: 成功。同じ別作業commit後の現行チェックアウトでも成功。`dist/client/index.html`、`dist/server/index.js`、`dist/.openai/hosting.json` を確認。
- `node --test tests/*.test.mjs`: 最終差分で完走、789件中764 pass／24 fail／1 skip（376.85秒）。追加36件は全て成功。全件成功ではない。失敗の内訳は下記。初回は786件中765 pass／20 fail／1 skip（483.85秒）。
- `node scripts/postflop-ai/cli.mjs audit --all`: 固定seedの全局面監査を最後まで実行し、85/85到達可能局面PASS、終了コード0。標準レンジでcallが0の `UTG_open_SB_call`、`HJ_open_SB_call`、`CO_open_SB_call`、`BTN_open_SB_call` の4局面は既存仕様通りskip。助言警告は合計348件（均衡ヒューリスティック／研究用EV比較を含む）。警告はエラーや公開承認ではない。方針ファイルは書き換えていない。
- `git diff --check`: 成功。

buildには既存のlocale JSON重複キーと大きなbundleの警告がある。無関係なコピー・配信・画面は変更していない。

## 未解決／対象外

### 全件テストの失敗

全件成功の完了条件は未達。テストを削除・skip化して通す変更や、画面を旧仕様へ戻す変更は行っていない。

- 未変更のUI／旧パス検査17件: `compare-heading`（6px固定→現行CSS変数）、`learning-access`（旧JSX文字列）、`play-style-layout`（4言語＋旧CSS構造の5件）、`player-analysis-ui`（旧クイズ形式のRanked fixture）、`postflop-trial`（公開方針の現行パスが `scripts/data/...` なのに旧 `.local/...` を期待）、`ranked-card-layout`（4言語）、`site-surface`（4件）。これらのテストと関連画面／CSSは本作業では変更していない。最初の4ファイルに絞った再現でも21件中13 pass／8 fail。
- 環境制限1件: `postflop-flop-base` のHTTP/Brotli試験が `listen EPERM`。ローカルサーバー起動も同じsandbox制限で拒否。
- 本作業のソース変更に伴う審査証跡2件: `reviewed-preflop-archive`／`reviewed-preflop`。標準postflopのファイルもプリフロップ審査の静的import graphに含まれているため、新規 `input-options.ts` 等と変更済みローダーが既存receiptと一致しない。これは既存UI不整合とは別の、本作業で生じる審査更新要件。
- 最終再実行で増えた別作業由来の検査3件: `account` のappearanceオブジェクト検査2件、`estimated-ui` の行列色の旧HTML検査1件。実行中の2026-10-08 00:36に別作業のcommit `4f505fb7`（appearance設定に行列スタイルを追加）が同じブランチに入ったことを読み取り確認。これらの変更は巻き戻さず、本作業でcommit／ブランチ操作はしていない。
- 実行時間検査1件: `postflop-later-hand-ev-ondemand` のnarrow 4bet試験は2秒の上限に対して2429.9ms。全件テストと全局面監査が並行する高負荷下の時間アサーション。該当1件だけの診断再実行は1131.5msで成功したが、全件実行の失敗数は変わらない。研究用EVモジュールは本作業で変更していない。

`configs/multiway-preflop-stage2.review.json` の審査ハッシュを単に更新して通すことはしない。`docs/specs/multiway-preflop-stage2.storage.md` は改めてのローカル検証・審査を要求している。データ／既存方針の書き換え・再生成を行わず、審査receiptの正当な更新を後続課題として明示した。このreceiptは今回の許可された書き込み範囲（frontend）外にもある。

検証ログ: `/private/tmp/reysonai-opponent-profiles-tests-final.log`、`/private/tmp/reysonai-opponent-profiles-tests.log`、`/private/tmp/reysonai-opponent-profiles-baseline-failures.log`、`/private/tmp/reysonai-opponent-profiles-timing-diagnostic.log`、`/private/tmp/reysonai-opponent-profiles-build-current.log`、`/private/tmp/reysonai-opponent-profiles-build-final.log`、`/private/tmp/reysonai-opponent-profiles-audit.log`。

- 段階Dを実行していないため、実際の4相手像×全局面の方針・代表局面比較・全1,755ボード品質評価は未生成／未実施。テストの小さな方針は実データの代わりに公開しない。
- 現在存在しない追加history用の相手像プリフロップ因子は、生成されるまで明示的に未対応。
- 公開D1経路への相手像キーの実装／マイグレーション／公開は後続作業。今回は読み取り契約と計算側の受け口のみ。
- EV補足は上記限定モデル。完全な後続方針木のEVやソルバー最適応答とは異なる。
- ローカル起動を `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` で試したが、環境のsandboxにより `listen EPERM`。画面実装は今回の対象外で、ブラウザーの新規サーバー確認はできていない。

---

# 相手像ポストフロップ 段階B（画面）実装結果（2026-10-08）

この節は上の段階Cの記録に対する追加結果です。対象は同じ `feature/opponent_profiles_postflop` / `apps/frontend`。ブランチ操作・commit・push・stash・reset・checkoutは実施していません。既存の `.wrangler/`、`output/` と並行作業は保持しています。

## 変更ファイル

- `src/estimated/postflop-trial.ts`: 標準卓であることをpilotの条件から除外。到達可能な保存局面・ポット形状は引き続き必要。
- `src/estimated/postflop-profile-state.ts`: 選択値の検証と既定の相手席（最後のプリフロップアグレッサー、リンプポットはBB）。
- `src/estimated/RangeWorkspace.tsx`: 相手像／席のURL優先復元・既存のper-tab session保存・計算設定の受け渡し。ログイン要件と対応ゲーム形式の制限は維持。
- `src/estimated/range-url.ts`: `opponent_profile` / `opponent_seat` の往復と非標準卓でのストリート復元。標準／自動席は省略して従来URLの互換性を維持。
- `src/estimated/PostflopProfileSettings.tsx`: 既存セグメントに合わせた相手像／席の設定カード、未生成表示／標準に戻すボタン、相手前提・調整印・任意の限定モデル補足。
- `src/estimated/PostflopTrial.tsx`: フロップ〜リバーとハンド詳細／レンジfactsの全計算へオプションを渡す。設定ごとの読込／表示の無効化で、切替中に旧方針を表示しない。
- `src/estimated/ranges.css`: 設定カードだけに限定したスタイル。モバイルは折り返しと44pxボタン、キーボードfocus。カラーストライプなし。
- `src/estimated/postflop-browser.ts`: 相手像・席・卓の状況別の読込、villain／exploit候補、相手席のプリフロップ因子読込、取消しと欠損時の再読込。
- `src/estimated/postflop-api.ts`: 本番の標準専用D1ルートに相手像を要求しないガード。
- `scripts/postflop-ai/local-view.mjs`: 既存の読み取り専用middlewareで、フロップ方針が利用可能なら後続方針欠損だけではフロップを遮断しない。
- `src/locales/copy.ts` / `src/locales/opponent-profile-copy.json`: 既存の翻訳辞書の仕組みに追加（ja/enは保存済みmeta、zh-CN/esは所有文言の翻訳）。
- `tests/postflop-profile-state.test.mjs` / `tests/postflop-profile-browser.test.mjs` / `tests/postflop-profile-ui.test.mjs`: 新規回帰テスト。
- `tests/postflop-trial.test.mjs`: 非標準卓のpilotが利用可能になる、今回の仕様変更に該当する1箇所の期待値だけを更新。
- `AGENTS.md`: 今回の相手設定・装飾・欠損表示・限定補足の継続ルール。
- 本結果ファイル。

## 読込・表示の境界

- ローカルは既存の `/local-postflop-spot` を使用。`opponentProfile` / `opponentSeat` / `tableProfile` を渡し、段階Cのローダーが `.local/postflop-ai/profiles/<profile>/<slug>-{villain,exploit}-{policy,later-policy}.json` を読みます。生成要求やLLM呼出しはしません。
- 標準以外の卓でも標準候補を構造照合して、プリフロップから計算し直した到達レンジへ適用します。調整時に標準flop-baseは読み込まず、差し替えレンジを使います。
- 相手像選択時は両役割の候補が必要。`PROFILE_POLICY_MISSING` は「この相手像の方針は準備中です」と明示し、標準への復帰は利用者のボタン操作だけ。相手像の選択は勝手に変更しません。
- フロップの両方針があり後続だけ欠損なら、フロップは表示可能。ターン／リバーへ進むと同じ未生成状態になります。古いハッシュ／不正形式は未生成とは区別してエラーのままです。
- 本番D1の相手像配信は未実装のため未生成扱い。標準D1方針を相手像の代わりに読ませません。DB・公開エンドポイント・公開方針は変更していません。
- ハンド詳細の `profile_reference.max_ev_action` は存在する場合だけ限定モデルの補足として表示。方針頻度は変えず、EV数値表・EV API・研究用hand-EVモジュールは復活させていません。

## 画面の操作手順

1. `/app` または `/analyze/ranges` を開き、必要に応じてログイン。ゲーム設定で対応形式（Cash / 6-max / 100BB / no ante等）は維持したまま「卓の状況」のコール頻度／3bet頻度を変更。
2. BTNオープン → BBコールなど保存済みHUのプリフロップを完了し、「フロップへ進む」で3枚選択。非標準卓でも保存済みポストフロップへ進める。
3. フロップ画面の「相手の傾向」で標準／NIT／コーリングステーション／LAG／マニアックを選択。「相手の席」で表示された実席（IP/OOP）を選択。未指定の既定はBTNオープン→BBコールならBTN、BTN→BBの3bet→コールならBB、すべてのリンプポットならBB。
4. URLに非標準なら `opponent_profile=nit` 等、明示席なら `opponent_seat=oop` 等が追加される。再読込／共有URLで復元し、URL指定がなければ同じタブのセッション設定から復元する。
5. 方針未生成なら準備中の説明と「標準に戻す」が表示され、標準のレンジ／ハンド詳細で代用しない。戻すボタンを押した場合だけ標準を再表示。
6. 対応する生成済み相手像方針がある場合、アクション列からターン／リバーへ進む。任意のハンド・正確なスートコンボの詳細で相手像の前提、結果の `adjusted` に応じた調整印、存在する最大EVアクション補足を確認する。
7. Settings → Languageで日本語／English／简体中文／Españolを変更。すべての新しいラベル・説明・未生成表示も切替対象。モバイルではセグメントを折り返し、相手席を次の行に配置する。

## 検証結果

- `npm run typecheck`: 最終の翻訳修正後も成功（frontend＋runtime）。
- `npm run build`: 最終差分で成功。`dist/client/index.html`、`dist/server/index.js`、`dist/.openai/hosting.json` を確認。既存の `product-direct.json` の重複キー警告と500KB超bundle警告は残る。
- 新規回帰テスト: **23/23成功**（state 6、browser 10、UI 7）。非標準卓のpilot、全種の既定席、全相手像×明示／自動席のURL往復、欠損時に標準方針へ代用しないこと、フロップのみ生成済みの場合、四言語、React/jsdomでの切替・復帰、調整入力でのbase無効化、モバイルCSSを確認。最後の翻訳修正は該当テストだけ追加確認し、既に成功した無関係なテストは別担当で再実行していない。
- `tests/postflop-*.test.mjs` 全27ファイルを分担して実行: **203件中201 pass / 2 fail / 0 skip**。全件成功ではない。親は、担当が既に成功確認した新規テスト・browser-client・publish-d1を除く残り22ファイルを `node --test --test-concurrency=2` で実行（173件中171 pass / 2 fail、161.5秒）。担当の10件新規browser＋既存7件、6件state、7件UIの結果と合算。
- 変更対象の既存 `tests/range-url.test.mjs`: **14/14成功**。先行の5件と未実行だった9件に分けて確認。
- `git diff --check`: 成功。最終のブランチ名は `feature/opponent_profiles_postflop`。ブランチ・commit・push操作はしていない。

### 残った2件の無関係な失敗

1. `tests/postflop-flop-base.test.mjs:113`: `local flop middleware serves stored Brotli with content-encoding, decoded by fetch`。既存HTTP試験が `listen EPERM: operation not permitted 127.0.0.1`。サーバーlisten権限の制約で、段階Cの結果にも記載済み。
2. `tests/postflop-trial.test.mjs:63`（assertionは92行）: `every saved open response and 3bet response becomes a heads-up flop spot`。旧テストは `.local/postflop-ai/btn-bb-srp-v1-policy.json` を期待するが、現行の公開候補の正しいパスは `scripts/data/postflop-ai/policies/btn-bb-srp-v1-policy.json`。段階Cの結果にも記載済み。今回の相手像読み込みとは別の既存パス検査で、方針ファイルやテストを無関係に変更して通す対応はしていない。

ログ: `/private/tmp/reysonai-opponent-profiles-stageB-typecheck.log`、`/private/tmp/reysonai-opponent-profiles-stageB-build.log`、`/private/tmp/reysonai-opponent-profiles-stageB-tests.log`、`/private/tmp/reysonai-opponent-profiles-stageB-suite-list.txt`。担当のfocused testsは各ツール実行結果で確認。

## 未解決／対象外

- 段階Dの方針生成・全ボード品質監査・D1公開は今回の範囲外。現時点のローカル `profiles` 方針ファイルは確認できておらず、実データの相手像モードは未生成表示が正常な状態。テスト用候補はメモリ内だけで、方針ファイルを新規公開していません。
- ローカル起動 `npm run dev:guest -- --host 127.0.0.1 --port 5182 --strictPort` はsandboxの `listen EPERM` で失敗。既存previewへブラウザを開く試行もブラウザ許可が拒否されたため、それを回避していません。実ブラウザでのレンダリング／320pxや390pxの実レイアウト／実方針のフロップ〜リバー操作は未確認。代わりにReact/jsdomの操作回帰とCSS制約テストを実施し、上の手順を残しました。
