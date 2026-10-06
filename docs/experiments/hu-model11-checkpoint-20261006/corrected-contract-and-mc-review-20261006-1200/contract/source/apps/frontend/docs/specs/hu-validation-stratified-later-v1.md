# 新HU検証契約 v1: 全1,755フロップ＋層別100フロップ起点の後半監査

契約ID: `hu-validation-stratified-later-v1`。2026-10-06のユーザー承認に基づく範囲変更を固定する。状態は**静的仕様・選択一覧の準備済み、実行器への組込みと数値検証は未実施**。この文書・JSON・Pythonの成功は方針の受入、検証完了、大量計算開始を意味しない。参照実装は `4b6b39a613afe72a2362f85aa93a305cd61b3586`。

## 変更範囲と実行順

1. 先に1試行を高速化し、同条件での旧モデルとの差、変更前後の時間・メモリ、重い処理、数値一致を確認できた範囲を報告する。その報告前に大量計算を始めない。モデルを変えた差と結果不変の実装高速化を区別し、短い測定から未測定の全量速度を断定しない。
2. 代表Monte Carloは既存12フロップ × `standard/passive/aggressive` × 両席 × 各10,000試行、72セル／720,000組の比較へ戻す。seed `solveaai-postflop-ai-v1`、cache batchは現行64を基準とし、512への変更は数値再現・境界の検証後に別途決める。代表ボード一覧、両席、評価ボットを維持する。720,000件を生成し、整合性・独立照合を明示した範囲で行う。fresh720,000件の全量再計算は自動追加しない。旧audit --allが要求する全量fresh replay合格とは称さない。64試行の過去確認はsanity／回帰であり、720,000試行と同等ではない。モデル11のstrict/composite識別・completion proof全体の検証・unresolved計上を変えない。二つのソースを比較する場合も各ソースに証跡を帰属させ、既存レポートを書き換えて新ソースの結果にしない。
3. フロップのバランス監査は全1,755正規化クラスを維持する。**後半だけ、下記の固定100フロップを起点に監査する。全ボードではない。** 各起点で従来どおり4ターン × 各3リバーを選ぶ。後半起点を1,755→100へ減らすことは旧仕様からの変更として結果報告に必ず書く。他のカバレッジを削らない。
4. 数値のエラー判定・警告しきい値と解釈を維持する。10,000試行から新しい「強さ」「EVが正だから受入」などの条件を導入しない。警告・相手モデルとの不一致・未解決・標本誤差を残し、既存の独立した局面別方針レビューを継続する。

旧45件の保存物と、旧契約で受け入れた新HU5件の成果物・受入証跡は元のバイト列・スコープのまま保存する。5件は `oldcontract` として区別し、本契約や別ソースへ自動昇格しない。旧`all-boards/full/street=all`、1,755行全ての後半coverageを要求するcompanion、既存lane wrapperを100件用と読み替えない。本仕様は新しい識別子の監査として追加し、旧validatorを弱めない。

全工程の一律再実行を要求するものではない。旧5件の全1,755フロップ／全ストリート証跡も、実行ソース・両方針・入力レンジ・各ボード／runoutの完全一致を検証できれば、フロップ1,755件と選択後半100件の根拠として参照しうる。その場合は元の証跡と旧contractを保持し、抽出・再利用を検証した新しい照合証跡を追加して、既存計算を新規実行と数えない。最適化によってソースが変わった場合は、別途レビューされた厳密な数値一致・identity再結合の証明が必要で、短い64試行の回帰一致だけを全量一致の証明にしない。再利用可能性と新契約での最終受入は別である。旧MCが64試行なら各10,000試行条件は満たさず、不足分の正式証跡と範囲を明示した独立照合を揃える。fresh全量再計算は必須としない。既に適格な10,000試行証跡がある場合も、元ソースへの帰属と照合範囲を保持する。

## 既存分類の意味

新しい分類は作らない。`scripts/postflop-ai/model.mjs` の `boardTexture` と `boardHeight` をそのまま使う。

- `paired`: 3枚のランクが重複。ペアとトリップスを含み、スート・連結性より優先する。
- `monotone`: 上記以外で3枚とも同じスート。
- `wet`: 上記以外でツートーン、または最大ランク−最小ランクが4以下。後者はレインボーでも該当する。
- `dry`: 残りのレインボー。
- 高さは最高ランクで区切り、Q/K/A=`high`、9/T/J=`mid`、2〜8=`low`。

形はpairedness/suitedness/connectednessの全組合せではなく、この優先順で作る既存の粗い4区分。フロップの連結性ではAを低いカードに置き換えないので、例えばA32レインボーは`dry_high`になる。別の手札特徴やrunout分類にあるwheel判定はここへ混ぜない。

## 固定抽出

- 母集団: `flop-isomorphism.mjs:canonicalFlops` と同じ全1,755スート同型フロップ。全22,100通りの生フロップに全24スート置換を適用し、高ランク優先・同ランクは低スート優先に並べた数値tupleの最小を採る。文字列最小ではない。
- 後半起点の抽出seed: `hu-model11-later-stratified-v1-20261006`。Monte Carlo／runoutのseedは変えない。
- 非空区分を `SHA256(UTF8(seed + NUL + "allocation" + NUL + stratum))` の昇順に並べる。digest同値なら入力文字列の昇順。同じ順序で区分を一周するたび1件ずつ配分し、100件で止める。母数に達した区分は飛ばし、残りへ再配分する。空区分には配らない。
- 各区分内で `SHA256(UTF8(seed + NUL + "board" + NUL + stratum + NUL + boardId))` の昇順（同値時は入力文字列順）から割当数を重複なしで選ぶ。選択後の表示一覧はASCII順。言語固有の乱数器・locale順序に依存しない。
- 現行母集団では12区分すべて非空、最小13件で不足区分はない。96件を各8件とし、seed順の先頭4区分に1件ずつ追加する。以下の各8〜9件、合計100件となる。

| 形×高さ | 母集団 | 抽出 |
|---|---:|---:|
| dry_high | 148 | 9 |
| dry_mid | 67 | 9 |
| dry_low | 13 | 9 |
| wet_high | 516 | 8 |
| wet_mid | 273 | 8 |
| wet_low | 127 | 8 |
| monotone_high | 166 | 8 |
| monotone_mid | 85 | 8 |
| monotone_low | 35 | 9 |
| paired_high | 135 | 8 |
| paired_mid | 99 | 8 |
| paired_low | 91 | 8 |
| 合計 | 1,755 | 100 |

機械可読一覧: [`hu-later-stratified-100-v1.json`](../../scripts/data/hu-later-stratified-100-v1.json)。SHA-256: `162dea6bcc503fd317e13ffe5c4588f1841876ba4502ac1af66a99f64bf79534`。契約JSON: [`hu-validation-stratified-later-v1.json`](../../scripts/data/hu-validation-stratified-later-v1.json)。

### 固定100件一覧

- **dry_high (9)**: Ac9d4h, AcJd7h, AcTd3h, AcTd5h, Kc8d5h, Kc9d8h, KcTd2h, KcTd5h, QcTd5h
- **dry_mid (9)**: 9c7d3h, 9c8d2h, 9c8d3h, Jc4d3h, Jc9d4h, Jc9d5h, JcTd2h, JcTd6h, Tc3d2h
- **dry_low (9)**: 7c6d2h, 8c3d2h, 8c4d2h, 8c4d3h, 8c5d2h, 8c5d3h, 8c6d2h, 8c6d3h, 8c7d3h
- **wet_high (8)**: Ac8c6d, AcKdQh, Kc5c4d, Kc8c7d, KcQd6d, Qc7d5d, Qc7d6c, Qc8d6c
- **wet_mid (8)**: 9c8d4d, 9c8d6d, Jc4d2c, Jc5c2d, Jc6d3d, Jc7c6d, Tc9c3d, Tc9d4d
- **wet_low (8)**: 6c3d2c, 7c3d2d, 7c5d4c, 7c6c4d, 8c4d3c, 8c6c3d, 8c6d4c, 8c7d6h
- **monotone_high (8)**: Ac6c3c, Ac9c6c, AcJc2c, Kc4c3c, Kc7c6c, KcTc2c, QcJc5c, QcJc6c
- **monotone_mid (8)**: 9c4c2c, 9c6c3c, Jc7c6c, Jc9c5c, Jc9c6c, Tc6c5c, Tc7c3c, Tc8c7c
- **monotone_low (9)**: 6c5c3c, 7c5c2c, 7c5c3c, 8c3c2c, 8c4c2c, 8c5c2c, 8c6c3c, 8c7c2c, 8c7c3c
- **paired_high (8)**: Ac7c7d, AcAd2c, AcAdQh, AcQcQd, KcTdTh, Qc4c4d, QcQd6c, QcTcTd
- **paired_mid (8)**: 9c5d5h, 9c7d7h, Jc9d9h, JcJd4c, JcJdJh, JcJdTc, Tc4d4h, TcTd8c
- **paired_low (8)**: 4c2d2h, 4c4d2h, 6c3c3d, 6c5d5h, 6c6d3h, 7c7d5c, 8c2d2h, 8c3c3d

## 後半のサンプリングとカウント

選んだ100フロップの各4ターン×各3リバーは、既存 `balance.mjs:representativeRunouts` のseed `${config.seed}|balance|${board.id}` と乱数消費順をそのまま維持する。フロップを除いたdeckから4ターンを先に取り除き、その残りから各ターンの3リバーを引くという既存仕様も変えない。通常の「各ターンを除いた48枚」へ置き換えることも別変更なので行わない。

公称400ターンボード、1,200リバーrunout。各局面の正確な保存live rangeに照らし、到達不能は証明と件数を別に保存する。selected-but-unreachableは選択済み100件に残し、別ボードへ置換しない。未抽出1,655フロップの後半は`not-evaluated-by-design`とし、clean、PASS、到達不能、完了件数に混ぜない。到達不能のため後半が実行されなかった場合も、可能と証明された数値評価と区別して集計する。

後半は抽出済み／実評価／到達不能／未解決を段階ごとに分け、未抽出を別欄にする。flopの1,755件、later起点の100件、ターン400件、リバー1,200件は異なる分母。警告は発生回数と固有ボード数を分け、区分ごとの母数・抽出数・実評価数も報告する。Monte Carlo中に通ったボードをバランス監査の追加coverageと数えない。

## 証跡と組込みの最小要件

実行器の改修は別途必要。既存のフロップ／後半評価関数を使い、全フロップと選択後半のstageを本契約に束ねる最小の入口を追加する。新たな汎用検証基盤は作らない。

- contract ID/version、manifestの正確なバイトhash、seed、100件一覧、ソース実行identity、両方針identity、保存レンジ／入力identity、street別coverageを全結果・checkpoint・resumeへ結び付ける。初回実行と再開時に一覧の欠落・余分・重複・置換・改変を拒否する。
- 旧全量checkpointを新契約へ名前だけ変えて使わない。明示的に証明されていない旧成果を新しい計算の完了件数へ足さない。
- 選択外フロップでは後半のpolicy計算を呼ばない。全1,755フロップの評価と、100件×従来runoutが同時に保たれることを確認する。
- 実行status、終了コード、ソースの前後一致、各段階の証跡を保持する。static/Python選択auditの成功を数値PASSへ変換しない。新入口について、改変リスト拒否・フロップ全件・後半exact100件・到達不能／未解決の計上を検証してから全量を実行する。

一覧の再生成／完全一致照合はPython標準ライブラリだけで行える（policy/equity計算、Node起動なし）。リポジトリrootから:

```sh
python apps/frontend/scripts/postflop-ai/verify-stratified-later-selection.py --repository . --manifest apps/frontend/scripts/data/hu-later-stratified-100-v1.json
```

このコマンドは固定参照commitのGit blobを読み、全生フロップを独立に列挙し、分類・12区分の母数・割当・100件一覧・manifest全バイトを再現する。source commitを保持していないcheckoutでは検証できないため、参照ソースを取得してから実行する。実行中のpolicyの正しさや強さを測るものではない。

## 報告の必須文と制約

「フロップは全1,755正規化クラスを対象にし、ターン／リバーは形×高さで均等に固定抽出した100フロップを起点に監査した。後半は全ボードではない。これは旧仕様から後半の起点を縮小した変更である。」に加え、seed、一覧リンク／hash、区分別の母数・抽出・実評価・到達不能、各stageの実行statusと警告を載せる。未完了なら「監査した」を「計画している／完了した範囲は…」へ変え、実行済みと書かない。

100/1,755は約5.70%の後半起点で、未抽出ボード上の問題を見逃しうる。均等区分抽出は小さい区分を厚く見る設計で、自然なカード出現頻度・各局面の到達頻度・1,755クラスの構成比とは違う。100件の単純な警告率を全体の警告率と扱わない。抽出数比から計算時間の削減率や方針品質を保証しない。10,000試行と明示した範囲の独立照合はこの固定評価ボットに対する推定・再現性の確認であり、未知の相手への強さ、最適性、GTOは保証しない。
