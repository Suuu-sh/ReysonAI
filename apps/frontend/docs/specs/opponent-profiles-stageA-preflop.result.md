# 相手像モード Stage A 実装結果

> 初回実装記録に、2026-10-04のDraft PR #28レビュー修正を追記。最新のNIT構成は下の修正節と比較表を参照。

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
| nit | 18.43 | 2.29 | 0.44 | 0.21 |
| station | 84.48 | 2.56 | 2.02 | 0.23 |
| lag | 49.33 | 17.74 | 1.18 | 1.61 |
| maniac | 67.38 | 31.67 | 1.61 | 2.87 |

目安との差・判断:

- nitのRFIは0.6倍目安に近いが早い席はさらに絞る。初回のBB対BTN約10%継続はレビューで狭すぎると判断されたため、BB対CO/BTN/SBは約20%まで主にスーテッド・ペアのコールで広げた。3betと3bet以降の強いレイズへの応答は元のタイト・パッシブな像を維持する。
- stationのRFIは約1.1倍、SBはraise 34.25%に加えてlimp 42.96%。「開く幅」だけでは見えない、受け身で広く参加する像として別々に指定した。非ブラインドのcallは約2.4〜3.0倍となる例がある。QQ/AK/JJ/TT/AQを位置補正だけでフォールドにしないことも優先した。3betは約0.2〜0.35倍で、極端に受け身な像を優先した。
- lagは代表のBB対BTNがほぼcall1.2倍 / 3bet1.6倍。早いオープンへのBB 3betは約1.9倍となる。非ブラインドのcallはプレミアムの継続保護により約1.5〜1.9倍となる例がある。共通の手札群モデルのため、低い標準値に対する厳密な倍率合わせはしていない。
- maniacは多くの応答で3bet約2.8〜3.4倍、BB対BTNは2.87倍。2.5倍目安より高い箇所がある。非ブラインドのcallも約1.9〜2.3倍となる例があり、強い手の継続と極端に広い参加を優先している。弱い手を含む攻撃的参加と過剰継続を優先しており、最適化や実測母集団の再現ではない。
- SBの標準応答はcall0だが、相手像は少量のnitのflatやstationの広いflatを含む。「0の2倍」を守ると相手の癖を表せないため意図的に独立させた。これにより、標準で到達しない4つのSB-callフロップ経路が相手像では到達しうる。後続Stage C/Dは仕様書に書かれた44方針をそのまま使えると仮定せず、新しく到達する4経路を明示的に扱う必要がある。なお最新コードのPOSTFLOP_SPOTSは追加のリンプ4bet-callを含む49列挙 / 45到達で、B–D仕様の44局面という数とも既に差がある。現Stage AはUIを開放しない。
- 深いノードでは同じ手札群の条件付き判断を席によらず共有し、席による違いは固定サイズと前段の到達レンジに反映する。細かな相手位置への適応を解いたものではない。

BTN open → BB callでBBが相手像のときの持ち込みレンジは、標準554.30コンボに対しnit244.40、station1120.26、lag654.10、maniac893.40。対ランダム勝率の加重平均を説明用の強さ指標にすると標準54.33%、nit57.98%、station50.34%、lag51.20%、maniac48.60%。この指標は実際の相手レンジ対勝率、特定ボード上の強さ、またはEVではない。

## 2026-10-04 Draft PR #28 レビュー修正：NITのブラインド防御

修正前の公開head `2ed13e295a7a3eef94a63526f789846a08cae26f` とクラウド作業フォルダの全treeが一致することを確認してから作業。この修正も既存のDraft PR #28でレビューする。ユーザーの再確認までDraftを維持し、ready化 / merge / deployは行わない。

`generate-opponent-profiles.py` にNIT専用の席×手札群call下限を明示した。EV補完や全プロフィール共通の係数変更ではない。追加したコールをfoldから移し、15局面すべての3bet頻度・サイズ、プレミアムの保護、RFI・3bet以降・リンプ系列を維持した。

| NIT局面 | call 修正前→後 % | 3bet %（不変） | 継続 修正前→後 % | 追加callのペア＋suited比率 |
|---|---:|---:|---:|---:|
| BB_vs_UTG | 5.20 → 11.08 | 1.46 | 6.67 → 12.55 | 84.77% |
| BB_vs_HJ | 6.09 → 13.68 | 1.69 | 7.78 → 15.38 | 86.17% |
| BB_vs_CO | 6.88 → 17.68 | 1.98 | 8.86 → 19.65 | 85.08% |
| BB_vs_BTN | 7.80 → 18.43 | 2.29 | 10.09 → 20.72 | 86.81% |
| BB_vs_SB | 6.47 → 17.83 | 2.13 | 8.60 → 19.96 | 84.15% |
| SB_vs_CO | 2.35 → 7.92 | 2.29 | 4.64 → 10.22 | 83.12% |
| SB_vs_BTN | 2.83 → 10.57 | 2.82 | 5.66 → 13.40 | 82.69% |

- BBの遅いオープンへの継続を約20%にし、早いUTG/HJには12.55% / 15.38%と狭める。BB対SBは元の3.5BBサイズを維持する。
- 低〜中ペア、suited ace、suited broadway、connector/gapperを主に増やした。BB対BTNの例では66はcall65%、76sは70%、A9sは70%、Q9sは60%。72o・K2o・Q2oなどの弱いoffsuitはfold100のまま。
- SBは後ろにBBがいるため同じ20%へ機械的には広げず、COに10.22%、BTNに13.40%。SB対UTG/HJの3.75% / 4.20%、非ブラインドの応答は、早いopenと後続席を考慮するタイトな像として点検して据え置いた。
- 7対象局面 / 692行のcall・foldのみ変更。全7データセットをgeneratorから再生成し、自分側の到達を再検査した。3betを変更していないので、NITの後続6データセットとmetaもバイト一致。
- station / lag / maniacの24ファイルと、標準JSON・理由文242ファイルは、公開headとバイト一致。
- [全280局面の比較表](./opponent-profiles-stageA-comparison.md) とBBがフロップに持ち込むレンジの強さ分布も再生成した。BB対BTNのNIT callレンジは103.40→244.40コンボ、対ランダム勝率の説明用平均は61.36→57.98%。

今回の確認:

- `npm run build:estimates -- --profiles-only`: PASS、構造監査・ソース検査のfindings 0。
- `node --test tests/opponent-profiles.test.mjs tests/estimated-audit.test.mjs`: **25/25 PASS**（専用9＋既存監査16）。BBの19〜22%継続、主なpair/suitedコール、弱いoffsuitのfold、BB/SBの席別段階、公開済み3bet全行のSHA-256一致を追加検証。
- `npm run typecheck` / `git diff --check`: PASS。
- 全体テストは今回繰り返していない。ユーザーからのレビュー結果は499 pass / 1既知flaky（`postflop-flop-base.test.mjs` のboard-worker determinism）で、以前この環境でSIGKILLになった2ファイルはユーザー環境では成功したとの報告。これは著者が今回再実行した結果ではない。
- 独立Astra再レビュー: **重大指摘なし**。別担当が25/25テストを再実行し、692行のcall/foldのみ変更、追加callの82.69〜86.81%がpair/suited、3bet全行不変、後続の自分側到達、標準・他プロフィール不変、比較表の再生成一致を確認。レビューはread-only。

B–Dの49列挙 / 45標準到達＋プロフィールSB経路の扱いは引き続き後続作業で、この修正に含めない。

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
