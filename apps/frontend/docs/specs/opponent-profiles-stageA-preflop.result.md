# 相手像モード Stage A 実装結果

## 範囲とベース

- ベース: `development` の `9a787954ecd49546d119e80c226afce8347c141a`（tree `b26b0fe97187be43b3b3016f615c12cf2b69edfc`）。接続済み GitHub API の全ファイルハッシュ・Git tree/commit を検証したクラウド側の独立コピー。
- ブランチ: `feat/opponent-profiles-stage-a`。既存の作業フォルダや他セッションの未コミット変更には触れていない。
- 最新のユーザー確認に従い、マルチウェイ段階2とは別のクラウドフォルダ・別ブランチで作業した。仕様書に残る Mac / 1フォルダ指定は今回の明示指示で置き換えられた。
- この成果物は Stage A のデータのみ。UI、ポストフロップ計算・方針、プリフロップ exploit データは作っていない。
- commit / push / PR / デプロイは行っていない。独立 Astra レビューは別工程で行う。

## 作成内容

4相手像 × 7データセット = 28ファイル、280局面、47,320ハンド行（各局面169行）。相手像ごとに日英の名前・説明、7データセットの方針要約、ソース指紋を持つ `meta.json` を加えた。

対象は `opening-ranges`、`preflop-ranges`、`three-bet-responses`、`four-bet-responses`、`five-bet-responses`、`limp-responses`、`limp-deep-responses`。保存先は `src/estimated/profiles/{nit,station,lag,maniac}/villain/`。

Astra が29の明示的な手札群ごとに頻度を指定した。RFIは席別5列、オープンへの応答はBB対BTNを基準とする手札群別call/3betと明示的な席補正、3bet/4bet/5betとリンプ系列は専用の手札群頻度表。単独オープンに対するQQ/AK（loose系はJJ/TT/AQも）の継続は保護し、席補正で減らしたレイズ分を意図せぬプレミアムのフォールドにしない。JSONを直接手編集していない。外部チャート・ソルバー頻度・外部ベンチマークで調整していない。

既存データから使うのはschema、スポットID、席・履歴の参照ID、固定サイズなどの形だけ。標準の保存頻度やcall EVからプロフィール頻度を決めない。全データは6max / 100BB / ante 0 / rake 5% cap 3BB / no flop no drop、既存と同じ固定raise-toサイズ。

## 主要な設計

1. `generate-opponent-profiles.py` は `ESTIMATES_DIR` のステージングにのみ出力し、`src/estimated` およびその配下を直接指定すると拒否する。
2. 自分の前段のアクションを掛け合わせて到達率を作る。例: 5bet応答は「自分のopen × 自分の4bet」、SBのリンプ4bet応答は「自分のlimp × 自分のlimp-reraise」。相手が同じ手札を持つ確率は掛けない。
3. 到達率0はfold100のplaceholder。レイズ頻度0の行のサイズはnull。全169ハンド、整数0〜100、合計100、同じID・サイズ・参照を検査する。
4. `audit.ts` から公開する `auditOpponentProfiles` は専用の構造監査。既存の均衡型audit / call-EV / auto-fillは変えず、プロフィールに適用しない。強さ順の逆転だけは警告。現データは構造エラー0、強さ順警告0。
5. プロフィールの5bet equityは未計算を表すnull。標準の `equity_vs_shove_pct`、`shove_range_combos` や理由文をコピーして、別レンジの数値として見せない。サイズ由来の必要勝率はそのまま保持する。理由文は生成対象外。
6. `dataset()` / `loadDataset()` で `profiles/<profile>/villain/<dataset>` をlazy-loadできる。ローカルとAPIの名前検査は4相手像・villain・7ファイル/metaだけを追加許可する。パストラバーサル、不正エンコーディング、unknown profile、exploitは拒否する。公開自体は実行していない。
7. `build:estimates` は通常データ生成後に相手像を生成し、通常監査とプロフィール構造監査・ソース指紋が通った後に同時保存する。`pipeline` の差分対象にも28データを加えた。均衡型の理由文生成ループに相手像を混ぜていない。`npm run build:estimates -- --profiles-only` では同じ監査ゲートを通しつつ相手像だけを更新でき、既存のデータ・理由文を保存し直さない。

## 構成と均衡型との比較

全280局面のコンボ加重構成、均衡型との比較、BTN/BBのフロップ持ち込みレンジは [opponent-profiles-stageA-comparison.md](./opponent-profiles-stageA-comparison.md)。`node scripts/summarize-opponent-profiles.mjs` で再生成できる。深い判断は自分の到達率×コンボで加重している。

RFIの均衡型に対する倍率:

| 相手像 | UTG | HJ | CO | BTN | SB |
|---|---:|---:|---:|---:|---:|
| nit | 0.57 | 0.54 | 0.57 | 0.60 | 0.56 |
| station | 1.05 | 1.06 | 1.13 | 1.13 | 1.08 |
| lag | 1.37 | 1.40 | 1.42 | 1.42 | 1.42 |
| maniac | 1.84 | 1.79 | 1.83 | 1.84 | 1.81 |

BB対BTNのオープン応答:

| 相手像 | call % | 3bet % | call / 標準 | 3bet / 標準 |
|---|---:|---:|---:|---:|
| standard | 41.80 | 11.03 | 1.00 | 1.00 |
| nit | 7.80 | 2.29 | 0.19 | 0.21 |
| station | 84.48 | 2.56 | 2.02 | 0.23 |
| lag | 49.33 | 17.74 | 1.18 | 1.61 |
| maniac | 67.38 | 31.67 | 1.61 | 2.87 |

目安との差・判断:

- nitは意図的にかなり弱気のモデル。RFIの0.6倍目安に近いが早い席はさらに絞り、オープンへの応答は均衡型の約2割程度まで狭めた。大きなレイズに対して強い手しか残さない癖を表す。
- stationのRFIは約1.1倍、SBはraise 34.25%に加えてlimp 42.96%。「開く幅」だけでは見えない、受け身で広く参加する像として別々に指定した。非ブラインドのcallは約2.4〜3.0倍となる例がある。QQ/AK/JJ/TT/AQを位置補正だけでフォールドにしないことも優先した。3betは約0.2〜0.35倍で、極端に受け身な像を優先した。
- lagは代表のBB対BTNがほぼcall1.2倍 / 3bet1.6倍。早いオープンへのBB 3betは約1.9倍となる。非ブラインドのcallはプレミアムの継続保護により約1.5〜1.9倍となる例がある。共通の手札群モデルのため、低い標準値に対する厳密な倍率合わせはしていない。
- maniacは多くの応答で3bet約2.8〜3.4倍、BB対BTNは2.87倍。2.5倍目安より高い箇所がある。非ブラインドのcallも約1.9〜2.3倍となる例があり、強い手の継続と極端に広い参加を優先している。弱い手を含む攻撃的参加と過剰継続を優先しており、最適化や実測母集団の再現ではない。
- SBの標準応答はcall0だが、相手像は少量のnitのflatやstationの広いflatを含む。「0の2倍」を守ると相手の癖を表せないため意図的に独立させた。これにより、標準で到達しない4つのSB-callフロップ経路が相手像では到達しうる。後続Stage C/Dは仕様書に書かれた44方針をそのまま使えると仮定せず、新しく到達する4経路を明示的に扱う必要がある。なお最新コードのPOSTFLOP_SPOTSは追加のリンプ4bet-callを含む49列挙 / 45到達で、B–D仕様の44局面という数とも既に差がある。現Stage AはUIを開放しない。
- 深いノードでは同じ手札群の条件付き判断を席によらず共有し、席による違いは固定サイズと前段の到達レンジに反映する。細かな相手位置への適応を解いたものではない。

BTN open → BB callでBBが相手像のときの持ち込みレンジは、標準554.30コンボに対しnit103.40、station1120.26、lag654.10、maniac893.40。対ランダム勝率の加重平均を説明用の強さ指標にすると標準54.33%、nit61.36%、station50.34%、lag51.20%、maniac48.60%。この指標は実際の相手レンジ対勝率、特定ボード上の強さ、またはEVではない。

## 検証

- `npm run pipeline -- --max-iterations 1`: PASS。converged、changed spots 0、findings 0。
- その後のpremium継続修正は `npm run build:estimates -- --profiles-only` で再生成・監査し、findings 0。最終専用テストと既存監査テストを再実行し24/24 PASS（専用8 + 既存監査16）。
- 既存の全tracked均衡型JSON・理由文: pinned HEADと差分0（バイト一致）。
- プロフィール専用テスト: 8/8 PASS。網羅、決定性、元データ不変、壊したデータの拒否、到達、警告とエラーの分離、Node/lazy loader、ローカル/APIルートを確認。
- バックエンド既存データセットテスト: 3/3 PASS。
- `npm run typecheck`: PASS（プロジェクト既存のtsconfig対象）。
- `npm run build`: PASS。既存の大きなchunk警告あり。Sites用成果物の生成だけで、公開していない。
- `npm run lint`: FAIL、7件。`ProductApp.tsx`のhook依存・button type、`ServiceSite.tsx`のSVG title・配列index key。両ファイルはpinned HEADから変更していない。Stage Aの対象外なので勝手に直していない。
- `node --test tests/*.test.mjs`: 最初の無制限並行実行は373 pass / 14 test-file failure / 8 skip。失敗ファイルはassertion詳細を返さず、Vite終了時のdependency-scan出力も混在。低並行度での確認結果は下に記録する。
- `node --test --test-concurrency=2 tests/*.test.mjs`: 450 pass / 5 test-file failure / 8 skip。当時の専用7テストと既存preflop/UIテストは成功。残る5ファイルのうち `postflop-trial.test.mjs` は単独実行で26/26成功。残る4ファイルの直列実行は16 pass / 2 fail。`postflop-flop-base` と `postflop-overcall` は成功し、`postflop-hand-ev.test.mjs` と `postflop-performance.test.mjs` はTAP上でSIGKILLによる終了を確認（assertion診断なし）。フルスイート成功とは報告しない。両ファイルとポストフロップ実装は本変更で触れていない。
- 8件のskipは未生成のローカルpostflop候補・fact artifactを必要とする既存テスト。Stage Aで勝手にそれらの方針を生成していない。
- 独立レビュー: author作業完了後、親タスクが別Astra担当へ依頼する。author自身による確認を独立レビューと呼ばない。

## 変更ファイル

- `scripts/generate-opponent-profiles.py`: 頻度の唯一の著者定義とstaging生成。
- `src/estimated/opponent-profiles.ts`: namespace/型、到達計算、構造監査。
- `src/estimated/audit.ts`: 専用監査のexport、プロフィール強さ警告の分類だけを追加。
- `scripts/lib/opponent-profile-build.mjs`: 28ファイル列挙、bundle読込、ソース指紋検査。
- `scripts/build-estimates.mjs` / `scripts/pipeline.mjs` / `scripts/audit-estimates.mjs`: staged生成・監査・差分・保存の登録。
- `src/estimated/datasets.ts`: namespace helperのexportと説明。
- `scripts/local-datasets.mjs` / `../backend/src/preflop-datasets.ts`: 限定された入れ子データ名と不正URI拒否。
- `src/estimated/profiles/*/villain/*.json`: 28データ + 4 meta。
- `tests/opponent-profiles.test.mjs`: 追加検証。
- `scripts/summarize-opponent-profiles.mjs`: read-only比較レポート。
- 本文書と`opponent-profiles-stageA-comparison.md`。
