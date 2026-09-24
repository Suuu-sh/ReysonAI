# レンジ生成で LLM の判断に頼っている箇所

調査日: 2026-09-25 / 対象: `apps/preflop-ui/scripts/`, `src/estimated/`

## 全体像

| 区分 | 中身 | 決め方 |
|---|---|---|
| 計算で決まる | 勝率（モンテカルロ）、コールの EV 判定、5bet all-in へのコール、レーキ・サイズ、監査、理由文 | スクリプト |
| LLM が決める | レイズ系の頻度すべて、オープンレンジ、EQR の値、バランス調整 | 手書きの頻度表・定数 |

コールは EV で「削る・足す」ができるが、**レイズの頻度はどこでも計算していない**。ここが最大の弱点。

## LLM 判断の箇所（重要度順）

### 1. レイズ系の頻度（3bet / 4bet / all-in / squeeze / iso） — 重要度: 高
- `scripts/data/response-mixes.json`（`[hand, call, three_bet]`）、`generate-three-bet-responses.py`（TIGHT_OOP など）、`generate-four-bet-responses.py`、`generate-multiway-responses.py`、`generate-limp-responses.py` の profile。
- `apply-call-ev.mjs` は「Aggressive frequencies unchanged」。レイズ vs コールの境目、ブラフ候補（A5s 等）の選択が全て手書き。
- 影響: アプリの主な表示（何でレイズするか）の根拠が数値で説明できない。

### 2. EQR の値 — 重要度: 高
- `scripts/eqr.py` / `src/estimated/eqr.js`: ハンド種別×IP/OOP の係数（例 suited_connected IP 1.10 / OOP 0.92）、`MULTIWAY_EQR 0.90`、`BB_BEHIND_EQR 0.85`、`CALLER_BEHIND_EQR 0.90`。
- 全コールの EV がこの仮定に比例して動く。ポストフロップ実装までは検証手段がない。

### 3. オープンレンジ（RFI） — 重要度: 中
- `generate-opening-ranges.py` の profile。外部ベンチマーク（±3pt）で合計頻度だけ確認している。ハンド単位の選択は LLM。

### 4. EV 判定のしきい値 — 重要度: 中
- `apply-call-ev.mjs` の −0.05 / +0.05 / +0.10bb、3bet されたオープナーの +0.50bb。人が決めた余裕幅。

### 5. バランス調整 — 重要度: 中
- 「AA/KK/AKs を 10% フラット」「EV でコール 100% になる手に 5% の軽い 3bet」など（response-mixes.json の method に記載）。監査の range-capped / over-segregated を消すための手調整。

### 6. 監査のしきい値 — 重要度: 低
- `src/estimated/audit.js` の各チェックの基準値。判定ロジック自体はコード。

## やった方がいいこと

1. **レイズの EV を計算する**（最優先）
   - レイズ EV = 相手のフォールド率 × ポット + (1 − フォールド率) × コール/4bet された後の EV。相手の応答レンジは既にデータにあるので、プリフロップ内で近似できる（コール後は仮定 EQR）。
   - まずは「監査・警告」として、レイズ EV < コール EV のハンドや、レイズ EV が大きいのにレイズ 0% のハンドを列挙する。いきなり頻度を自動で書き換えない。
2. **頻度表を「ルール＋例外」にする**
   - 手書きの 169 ハンド表を、「EV 上位 N% をバリュー、ブロッカー条件でブラフ、比率 X:Y」のようなルールから生成し、LLM は例外だけ書く。新局面（スクイーズ対応など）も少ない入力で作れ、トークンも減る。
3. **EQR の感度を見る**
   - EQR を ±5% 動かしたとき、どのハンドの判断がひっくり返るかを出すスクリプト。仮定に敏感なハンドだけ注意して見ればよくなる。
4. **しきい値・調整の根拠を1か所に集める**
   - EV のしきい値やバランス調整の値を設定ファイルにまとめ、理由を併記する。
5. **ポストフロップで EQR を置き換える**（長期）
   - `docs/postflop-solver-plan.md` と接続。2 の仕組みがあれば、EQR 更新だけで全体を作り直せる。
