# 2人のシングルレイズポット：ポストフロップAI推定の初版

これは**AI推定・GTOではない・代表12ボードのみ**のローカル実験です。Wizard型ソルバー、均衡解、全フロップの公開戦略ではありません。プリフロップレンジ、EQR、公開データには反映しません。人が詳細レポートを確認するまで候補は非公開で、開発用アプリ内のローカル試作画面でのみ読み取れます。既存の [`postflop-solver-plan.md`](../../../docs/postflop-solver-plan.md) とは別です。

## 入力・実行順

正本は `src/estimated/opening-ranges.json` の `BTN_open`、`src/estimated/preflop-ranges.json` の `BB_vs_BTN`、`configs/cash-6max-100bb.json` です。100BB、BTN 2.5BBオープン、BBコール、フロップ5.5BB、アンティなし、レーキ5%・上限3BB。各ハンドクラスの保存頻度を実際の2枚組へ展開し、ボードと両者のカード重複を除去します。

`apps/frontend` で、次の順に**明示実行**します。

```sh
npm run postflop-ai:generate
npm run postflop-ai:simulate
npm run postflop-ai:audit
```

生成はローカルのCodex接続を使い、8ボードのカード・テクスチャとブロッカー除去後のレンジ特徴だけを提示します。残る4ボードは伏せた検証用です。候補は盤面テクスチャと自分の手札特徴に対する整数アクション頻度だけを持ち、相手の非公開カードを参照できません。20個の必須フォールバックと任意のテクスチャ上書きルールを検証してから、各有効コンボへ展開します。候補と入力・方針ハッシュは `.local/postflop-ai/` に保存され、既存候補を自動再生成・上書きしません。入力が変われば停止します。再生成する場合は既存候補とレポートを別途退避してから、明示的に実行してください。

フロップはBBチェック→BTNチェック/33%/75%ベット→BBフォールド/コール/3倍チェックレイズ→BTNフォールド/コールだけです。ターン・リバーは候補に含めず、比較双方に共通の固定50%ポット継続方針を使います。独立した標準・受動的・攻撃的な固定相手に対し、同一配札・ランアウト・乱数で候補と基準方針を比較します。局面別のレーキ後EV差と、ペア差分の95%信頼区間を記録します。信頼区間は多重比較補正しておらず、利益・最適性の証明ではありません。

監査の必須条件は合法アクション、頻度合計、カード重複なし、入力・方針ハッシュ、保存レポートの固定シード完全再実行、チップ保存とレーキ計算です。フォールド時は未コール額を返してからレーキを計算します（シミュレーション版2）。EVの大小と相手別の弱点は**警告**に留めます。詳細な候補・対戦結果はGit管理外の `.local/postflop-ai/` に保持します。

## 開発用アプリで試す

プリフロップの行動が完了して複数人がフロップへ進むと、同じ行動履歴の終端に「フロップへ進む」が現れます。押すと監査済みの代表12ボードを選ぶモーダルが開き、選んだ3枚は行動履歴内のコンパクトなフロップブロックに並びます。ブロックを押すとボードを変更できます。プリフロップ履歴とレンジ表示領域は同じワークスペースに残り、画面を占めるカード選択パネルはありません。BBチェック以降の行動もプリフロップと同じ横並びブロックに追加します。行動ブロック全体または選択済みアクションを押すとその判断へ戻り、対応する169ハンド表と選択ハンドの頻度に切り替わります。代表12ボード以外の戦略は表示しません。標準設定の2人のシングルレイズポット・3betポット・4betポット・SBのリンプポット（下の一覧）だけがローカル保存候補を読み取り専用で表示できます。画面からの再生成・公開・永続データ変更はありません。他のプリフロップ経路は「未収録」と表示します。候補ファイルがない、または入力ハッシュが古い場合も表示を停止します。

## 全シングルレイズポットへの汎用化（2026-09-26）

対象を、BTNオープン→BBコールから「1人がオープン（2.5BB、SBは3.5BB）し、後ろの1人だけがコール、他は全員フォールド」の2人ポット全15局面へ広げました。局面は `scripts/postflop-ai/spots.mjs` が `preflop-ranges.json` の15応答から作ります（id は `{O}_open_{C}_call`）。IP/OOP はポストフロップ順（SB, BB, UTG, HJ, CO, BTN）、フロップのポットは 2×オープン額＋残りのブラインド、スタックは 100−オープン額です。オープナーのレンジは保存済みのオープン頻度、コーラーは保存済みのコール頻度です。ただしSBの対オープン応答は3bet-or-foldで保存されている（コール頻度が全ハンド0%）ため、`{O}_open_SB_call` の4局面は一覧にだけ載せ `reachable: false` とし、入力・生成・画面表示の対象外です（`--all` でも飛ばします）。実際に生成・表示できるのは11局面です。

| 局面 | IP | OOP | ポット | スタック |
|---|---|---|---|---|
| UTG_open_HJ_call / UTG_open_CO_call / UTG_open_BTN_call | HJ / CO / BTN | UTG | 6.5BB | 97.5BB |
| UTG_open_SB_call / UTG_open_BB_call | UTG | SB / BB | 6 / 5.5BB | 97.5BB |
| HJ_open_CO_call / HJ_open_BTN_call | CO / BTN | HJ | 6.5BB | 97.5BB |
| HJ_open_SB_call / HJ_open_BB_call | HJ | SB / BB | 6 / 5.5BB | 97.5BB |
| CO_open_BTN_call | BTN | CO | 6.5BB | 97.5BB |
| CO_open_SB_call / CO_open_BB_call | CO | SB / BB | 6 / 5.5BB | 97.5BB |
| BTN_open_SB_call / BTN_open_BB_call | BTN | SB / BB | 6 / 5.5BB | 97.5BB |
| SB_open_BB_call | BB | SB | 7BB | 96.5BB |

ツリーは当初、全局面で従来どおりでした（のちに OOP がレイザーの局面は先打ちツリーへ変更。下の「3betポットと、OOPのレイザーが先に打てるツリー」参照）。従来のツリーは（OOPチェック→IPチェック/33%/75%→OOPフォールド/コール/3倍チェックレイズ→IPフォールド/コール、ターン・リバーは固定モデル）。方針の場面名 `btn_*` は IP、`bb_*` は OOP の判断を指します（互換のため名前は変えていません）。生成物は `.local/postflop-ai/{o}-{c}-srp-v1-{policy,report,hand-ev}.json`（BTN/BB は従来の `btn-bb-srp-v1-*` のまま、入力ハッシュも不変）。

```sh
npm run postflop-ai:spots                              # 局面一覧と生成物の有無
npm run postflop-ai:generate -- --spot CO_open_BTN_call
npm run postflop-ai:simulate -- --spot CO_open_BTN_call
npm run postflop-ai:audit -- --spot CO_open_BTN_call
npm run postflop-ai:hand-ev -- --spot CO_open_BTN_call
npm run postflop-ai:audit -- --all                     # 全局面を順番に（失敗した局面は飛ばして最後に一覧）
```

`--spot` を省くと BTN_open_BB_call。生成は既存候補があれば再利用し、上書きしません。新しい候補はローカル Codex の `gpt-6-luna`・推論の強さ `max` で作り（`--model`／`POSTFLOP_AI_MODEL`、`--effort`／`POSTFLOP_AI_EFFORT` で変更可）、`metadata.model`・`reasoning_effort` に記録します。開発用アプリでは、標準設定でこの15経路のどれかを完了すると、その局面の候補を読み取り専用で表示します（API は `spot` パラメータ付き）。3人以上・3bet/4betポット・リンプポットは未収録のままです。

## 3betポットと、OOPのレイザーが先に打てるツリー（2026-09-26）

`three-bet-responses.json` の15局面（オープナー O → 3bettor X → O コール、他は全員フォールド）を追加しました。id は `{O}_open_{X}_3bet_call`、生成物は `.local/postflop-ai/{o}-{x}-3bp-v1-*`。ポット = 2×3bet額＋残りのブラインド、スタック = 100−3bet額（サイズは保存データの `three_bet_size_bb`）。X のレンジは `preflop-ranges.json` の three_bet 頻度、O のレンジはオープン頻度 × 3betへのコール頻度（ハンドクラスごとの積）です。

| 局面 | IP | OOP | ポット | スタック | ツリー |
|---|---|---|---|---|---|
| UTG/HJ/CO の open → HJ/CO/BTN の 3bet（6局面） | 3bettor | オープナー | 17.5BB | 92BB | OOPチェック |
| UTG/HJ/CO/BTN の open → SB の 3bet（4局面） | オープナー | SB | 25BB | 88BB | OOP先打ち |
| UTG/HJ/CO/BTN の open → BB の 3bet（4局面） | オープナー | BB | 24.5BB | 88BB | OOP先打ち |
| SB_open_BB_3bet_call | BB | SB | 21BB | 89.5BB | OOPチェック |

フロップのツリーは `scripts/postflop-ai/tree.mjs` にあり、プリフロップ最後のレイザーが OOP なら「OOP先打ち」（`oop_leads`）、そうでなければ従来の「OOPチェック」（`oop_checks`）です。

- OOP先打ち：OOP が check/bet33/bet75（`oop_first`）。ベットには IP が fold/call/3倍レイズ（`ip_vs_33`・`ip_vs_75`）、レイズには OOP が fold/call（`oop_vs_raise`）。チェック後は従来の `btn_first` → `bb_vs_*` → `btn_vs_raise`。
- この規則により、シングルレイズポットでも SB_open_BB_call と、IP がコーラーの6局面（UTG/HJ/CO のオープンに後ろの非ブラインドがコール）が OOP先打ちになり、作り直しました。旧ツリーの候補・レポート・EV は `*.oop-checks.json` に退避しています（削除していません）。BB がコーラーの4局面（BTN_open_BB_call を含む）は従来のまま、入力ハッシュも不変です。
- 方針は局面のツリーの場面だけを持ち、必須のフォールバック規則はツリーごと（20／40件）に検査します。参照方針・固定相手も新しい場面に対応します。ベット・レイズは残りスタックで頭打ち（オールイン）、オールイン後のターン・リバーは配るだけです。

```sh
npm run postflop-ai:generate -- --spot BTN_open_BB_3bet_call
npm run postflop-ai:simulate -- --spot BTN_open_BB_3bet_call
npm run postflop-ai:audit -- --spot BTN_open_BB_3bet_call
npm run postflop-ai:hand-ev -- --spot BTN_open_BB_3bet_call
```

開発用アプリでは、標準設定で「オープン → 3bet → オープナーのコール」を完了すると、その3betポットの候補を読み取り専用で表示します。4betポット・リンプポット・3人以上は未収録のままです。

## 4betポットとリンプポット（2026-09-27）

- 4betポット（15）：O オープン → X 3bet → O 4bet（保存サイズ）→ X コール。id `{O}_open_{X}_4bp_call`、生成物 `{o}-{x}-4bp-v1-*`。ポット = 2×4bet額＋残りのブラインド、スタック = 100−4bet額。O のレンジ = オープン頻度 × 3betへの4bet頻度、X のレンジ = 3bet頻度 × 4betへのコール頻度。最後のレイザーは O なので、O が OOP なら先打ちツリー。

| 局面 | IP | OOP | ポット | スタック | ツリー |
|---|---|---|---|---|---|
| UTG/HJ/CO の open → HJ/CO/BTN の 3bet → 4bet 20（6局面） | 3bettor | オープナー | 41.5BB | 80BB | OOP先打ち |
| open → SB の 3bet → 4bet 26（4局面） | オープナー | SB | 53BB | 74BB | OOPチェック |
| open → BB の 3bet → 4bet 26（4局面） | オープナー | BB | 52.5BB | 74BB | OOPチェック |
| SB_open_BB_4bp_call（4bet 24） | BB | SB | 48BB | 76BB | OOP先打ち |
| SB_limp_BB_check（SB リンプ → BB チェック） | BB | SB | 2BB | 99BB | OOP先打ち（レイザーなし） |
| SB_limp_BB_iso_call（→ BB 3.5 → SB コール） | BB | SB | 7BB | 96.5BB | OOPチェック |
| SB_limp_BB_iso_SB_reraise_call（→ SB 10.5 → BB コール） | BB | SB | 21BB | 89.5BB | OOP先打ち |

- SPR が1〜2と低いので、ベット・レイズが残りスタックを超えるときはオールインに丸め、その後のターン・リバーは配るだけです（チップ保存の検査を通します）。画面の行動履歴には「All-in」と表示します。
- 開発用アプリでは、標準設定で 4bet へのコール、または SB のリンプからの上記3経路を完了すると、その局面の候補を読み取り専用で表示します。

## 初回ローカル結果（人の確認待ち）

- 入力ハッシュ `d6f1a644898caf7409be2dbbb2ffb0362e68f9a169284832703e5469b7578c41`、候補ハッシュ `d1c8f2f3aa9f00fd62fd8a5cf22e33634b709bb94359b06fed7f422c8cb6d7ac`。51ルールを生成。
- 12ボード × 3相手 × 2評価席 = 72比較。各比較10,000組の共通配札。33,088件の展開済みコンボ判断を監査し、整合性検査に合格。
- シミュレーション版2（未コール額返却後）で、候補が基準を下回る95%信頼区間の警告は11/72件（設計8ボード側6件、伏せた4ボード側5件）。特にペアボード `KcKd4h` のBBは3種類の相手すべてで平均 −0.0904〜−0.2356BB、伏せた `8c8d2h` のBBも3種類すべてで平均 −0.0646〜−0.1878BB。`8s7d6c` のBTN対攻撃的相手は −0.1059BB。
- この監査合格は**計算・データの整合性のみ**を意味します。相手方針は実戦人口を代表せず、推定の実力やGTO性を保証しません。ペアボードでの弱点を含む詳細を人が確認するまで、公開レンジには反映しません。
