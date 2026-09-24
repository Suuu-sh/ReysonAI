# EQR / Call EV review — 2026-09-24

## 前提と読み方

- EQR はユーザー指定の仮定値。ソルバー実装後に置換する。勝率は相手の保存レンジに対する固定シード12,000回のモンテカルロ。EV も仮定モデルであり、均衡解ではない。
- EV = equity × EQR × raked(total pot after call) − incremental call cost。レーキ5%、上限3BB。
- 削除数は EV < −0.05bb で call を0へ変更したハンドクラス数。コンボ%は削除した到達頻度加重コールコンボ ÷ 当該局面の到達コンボ ×100（割合の減少pt）。3bet応答はRFI頻度、4bet応答は元3bet頻度、SB-vs-isoはlimp頻度で加重する。
- 境界EVの50%制限、強さ順／ポジション整合の削減、既存の過剰フォールド監査を満たすための最小限のプラスEVコール追加は別項目。既存の3bet・4bet・5bet・squeeze・iso／limp-reraise頻度とRFI配分は変更していない。
- 新しい監査 `ev-capacity-conflict` は、許されるコールを全て使っても旧auto-profit基準に達しないことを証明した場合だけの警告。未使用の合法コールがある場合は従来通りerror。均衡未達の解決ではなく、指定条件の両立不能を可視化したもの。

## 局面ごとの負EVコール削除

| 局面 | ハンド数 | 削除コンボ | コンボ% | 境界制限数 |
|---|---:|---:|---:|---:|
| HJ_vs_UTG | 0 | 0.00 | 0.00 | 0 |
| CO_vs_UTG | 2 | 0.40 | 0.03 | 0 |
| BTN_vs_UTG | 5 | 5.40 | 0.41 | 2 |
| SB_vs_UTG | 0 | 0.00 | 0.00 | 0 |
| BB_vs_UTG | 24 | 27.60 | 2.08 | 0 |
| CO_vs_HJ | 3 | 1.00 | 0.08 | 0 |
| BTN_vs_HJ | 6 | 8.60 | 0.65 | 0 |
| SB_vs_HJ | 0 | 0.00 | 0.00 | 0 |
| BB_vs_HJ | 29 | 32.00 | 2.41 | 0 |
| BTN_vs_CO | 19 | 18.20 | 1.37 | 2 |
| SB_vs_CO | 0 | 0.00 | 0.00 | 0 |
| BB_vs_CO | 39 | 81.60 | 6.15 | 11 |
| SB_vs_BTN | 0 | 0.00 | 0.00 | 0 |
| BB_vs_BTN | 46 | 169.60 | 12.79 | 13 |
| BB_vs_SB | 96 | 275.80 | 20.80 | 7 |
| UTG_vs_HJ_three_bet | 26 | 24.65 | 11.60 | 0 |
| UTG_vs_CO_three_bet | 22 | 18.65 | 8.78 | 1 |
| UTG_vs_BTN_three_bet | 20 | 17.80 | 8.38 | 0 |
| UTG_vs_SB_three_bet | 38 | 51.75 | 24.35 | 1 |
| UTG_vs_BB_three_bet | 40 | 58.45 | 27.51 | 0 |
| HJ_vs_CO_three_bet | 33 | 33.50 | 10.74 | 1 |
| HJ_vs_BTN_three_bet | 27 | 26.15 | 8.38 | 1 |
| HJ_vs_SB_three_bet | 41 | 76.00 | 24.36 | 0 |
| HJ_vs_BB_three_bet | 43 | 83.00 | 26.60 | 0 |
| CO_vs_BTN_three_bet | 21 | 31.00 | 7.97 | 1 |
| CO_vs_SB_three_bet | 25 | 39.65 | 10.19 | 0 |
| CO_vs_BB_three_bet | 28 | 51.85 | 13.33 | 0 |
| BTN_vs_SB_three_bet | 37 | 77.70 | 13.68 | 0 |
| BTN_vs_BB_three_bet | 40 | 88.70 | 15.62 | 0 |
| SB_vs_BB_three_bet | 32 | 35.57 | 8.48 | 0 |
| HJ_vs_UTG_four_bet | 2 | 0.24 | 0.45 | 0 |
| CO_vs_UTG_four_bet | 2 | 0.20 | 0.37 | 0 |
| BTN_vs_UTG_four_bet | 1 | 0.16 | 0.29 | 0 |
| SB_vs_UTG_four_bet | 1 | 0.16 | 0.26 | 0 |
| BB_vs_UTG_four_bet | 1 | 0.10 | 0.18 | 0 |
| CO_vs_HJ_four_bet | 0 | 0.00 | 0.00 | 0 |
| BTN_vs_HJ_four_bet | 0 | 0.00 | 0.00 | 0 |
| SB_vs_HJ_four_bet | 0 | 0.00 | 0.00 | 0 |
| BB_vs_HJ_four_bet | 0 | 0.00 | 0.00 | 0 |
| BTN_vs_CO_four_bet | 0 | 0.00 | 0.00 | 0 |
| SB_vs_CO_four_bet | 0 | 0.00 | 0.00 | 0 |
| BB_vs_CO_four_bet | 0 | 0.00 | 0.00 | 0 |
| SB_vs_BTN_four_bet | 0 | 0.00 | 0.00 | 0 |
| BB_vs_BTN_four_bet | 0 | 0.00 | 0.00 | 0 |
| BB_vs_SB_four_bet | 0 | 0.00 | 0.00 | 0 |
| BB_vs_UTG_HJcall | 41 | 127.90 | 9.65 | 13 |
| BB_vs_UTG_COcall | 36 | 118.20 | 8.91 | 13 |
| BB_vs_UTG_BTNcall | 27 | 78.70 | 5.94 | 10 |
| BB_vs_HJ_COcall | 35 | 104.20 | 7.86 | 12 |
| BB_vs_HJ_BTNcall | 31 | 88.50 | 6.67 | 8 |
| BB_vs_CO_BTNcall | 40 | 139.60 | 10.53 | 10 |
| SB_vs_BB_iso | 70 | 99.04 | 50.76 | 4 |

## 種類別集計

コンボ%は各種類の到達コンボを合算した分母で加重。実戦での各経路の発生率ではない。

| 種類 | 削除数 | 削除コンボ% |
|---|---:|---:|
| response | 269 | 3.12 |
| three_bet | 473 | 14.19 |
| four_bet | 7 | 0.06 |
| multiway | 210 | 8.26 |
| iso_response | 70 | 50.76 |

## BB_vs_SB：SB 3.5BB openへの応答

継続率：43.74% → 25.02%。コール必要勝率は2.5 / 6.65 = 37.59%。BBはSBに対してIP。

| ハンド | コール前→後 | 3bet（不変） | 素の勝率 | EQR | 実現後勝率 | Call EV |
|---|---:|---:|---:|---:|---:|---:|
| J4o | 15 → 0% | 0% | 33.75% | 0.75 | 25.31% | −0.82bb |
| 72o | 5 → 0% | 0% | 29.71% | 0.75 | 22.28% | −1.02bb |
| Q6s | 60 → 10% | 5% | 41.58% | 0.9 | 37.42% | −0.01bb |
| A5s | 40 → 50% | 45% | 50.67% | 1 | 50.67% | +0.87bb |
| KQs | 15 → 25% | 70% | 57.15% | 1.05 | 60.01% | +1.49bb |
| 99 | 15 → 25% | 70% | 62.19% | 1 | 62.19% | +1.64bb |

## EV ≥ +0.3bb なのにコール0：全件

到達不能行は除外。レイズ100%の手も依頼通り含む。コールEVのみではレイズとの優劣は判定できず、全件が修正対象とは限らない。括弧内はCall EV / Fold率。

- **HJ_vs_UTG**: AA (+2.63bb / F0%), AKs (+1.44bb / F0%), A9s (+0.40bb / F100%), A8s (+0.32bb / F100%), KK (+2.11bb / F0%), AJo (+0.44bb / F100%), 66 (+0.42bb / F100%)
- **CO_vs_UTG**: AA (+2.61bb / F0%), AKs (+1.43bb / F0%), A9s (+0.41bb / F100%), A8s (+0.32bb / F100%), KK (+2.15bb / F0%)
- **BTN_vs_UTG**: AA (+2.64bb / F0%), AKs (+1.43bb / F0%), KK (+2.13bb / F0%)
- **SB_vs_UTG**: AA (+2.02bb / F10%), AKs (+1.10bb / F10%), AQs (+0.89bb / F20%), AJs (+0.72bb / F60%), ATs (+0.57bb / F80%), AKo (+0.67bb / F20%), KK (+1.65bb / F10%), KQs (+0.44bb / F60%), AQo (+0.48bb / F65%), QQ (+1.37bb / F10%), JJ (+1.15bb / F15%), TT (+0.92bb / F40%), 99 (+0.71bb / F60%), 88 (+0.55bb / F75%), 77 (+0.38bb / F90%)
- **BB_vs_UTG**: AA (+2.22bb / F0%), KK (+1.82bb / F0%)
- **CO_vs_HJ**: AA (+2.63bb / F0%), AKs (+1.57bb / F0%), A7s (+0.44bb / F90%), A6s (+0.39bb / F90%), A5s (+0.42bb / F50%), A4s (+0.35bb / F65%), KK (+2.24bb / F0%), ATo (+0.51bb / F100%)
- **BTN_vs_HJ**: AA (+2.66bb / F0%), AKs (+1.55bb / F0%), KK (+2.25bb / F0%)
- **SB_vs_HJ**: AA (+2.06bb / F5%), AKs (+1.20bb / F5%), AQs (+1.04bb / F5%), AJs (+0.92bb / F35%), ATs (+0.80bb / F60%), A9s (+0.44bb / F90%), A8s (+0.39bb / F90%), A7s (+0.36bb / F90%), AKo (+0.76bb / F15%), KK (+1.68bb / F5%), KQs (+0.61bb / F35%), KJs (+0.55bb / F60%), KTs (+0.42bb / F75%), AQo (+0.58bb / F40%), QQ (+1.47bb / F5%), QJs (+0.35bb / F60%), QTs (+0.32bb / F75%), AJo (+0.50bb / F80%), JJ (+1.23bb / F5%), ATo (+0.35bb / F100%), TT (+1.08bb / F20%), 99 (+0.86bb / F35%), 88 (+0.71bb / F60%), 77 (+0.58bb / F75%), 66 (+0.41bb / F90%), 55 (+0.36bb / F90%)
- **BB_vs_HJ**: AA (+2.19bb / F0%), KK (+1.88bb / F0%)
- **BTN_vs_CO**: AA (+2.65bb / F0%), AKs (+1.59bb / F0%), AQs (+1.44bb / F0%), AKo (+1.14bb / F0%), KK (+2.33bb / F0%), QQ (+1.96bb / F0%)
- **SB_vs_CO**: AA (+2.09bb / F5%), AKs (+1.20bb / F5%), AQs (+1.15bb / F5%), AJs (+1.03bb / F5%), ATs (+0.95bb / F5%), A9s (+0.61bb / F70%), A8s (+0.47bb / F70%), A7s (+0.40bb / F75%), A6s (+0.35bb / F75%), A5s (+0.34bb / F25%), A4s (+0.31bb / F40%), AKo (+0.78bb / F10%), KK (+1.75bb / F5%), KQs (+0.76bb / F5%), KJs (+0.71bb / F25%), KTs (+0.56bb / F45%), AQo (+0.68bb / F10%), KQo (+0.32bb / F30%), QQ (+1.56bb / F5%), QJs (+0.45bb / F25%), QTs (+0.38bb / F45%), AJo (+0.59bb / F30%), JJ (+1.34bb / F5%), ATo (+0.46bb / F85%), TT (+1.14bb / F5%), 99 (+0.94bb / F5%), 88 (+0.76bb / F25%), 77 (+0.68bb / F45%), 66 (+0.53bb / F70%), 55 (+0.41bb / F70%)
- **BB_vs_CO**: AA (+2.21bb / F0%), AKs (+1.48bb / F0%), KK (+1.95bb / F0%), QQ (+1.75bb / F0%)
- **SB_vs_BTN**: AA (+2.07bb / F0%), AKs (+1.37bb / F0%), AQs (+1.29bb / F0%), AJs (+1.19bb / F0%), ATs (+1.10bb / F0%), A9s (+0.75bb / F30%), A8s (+0.70bb / F30%), A7s (+0.61bb / F65%), A6s (+0.56bb / F65%), A5s (+0.49bb / F0%), A4s (+0.45bb / F15%), A3s (+0.41bb / F30%), A2s (+0.34bb / F30%), AKo (+0.86bb / F5%), KK (+1.76bb / F0%), KQs (+0.89bb / F0%), KJs (+0.86bb / F0%), KTs (+0.79bb / F0%), AQo (+0.85bb / F5%), KQo (+0.45bb / F5%), QQ (+1.62bb / F0%), QJs (+0.69bb / F0%), QTs (+0.60bb / F0%), AJo (+0.70bb / F5%), KJo (+0.41bb / F35%), JJ (+1.46bb / F0%), JTs (+0.48bb / F0%), J9s (+0.34bb / F55%), ATo (+0.63bb / F35%), TT (+1.28bb / F0%), T9s (+0.31bb / F55%), 99 (+1.07bb / F0%), 88 (+0.93bb / F0%), 77 (+0.80bb / F30%), 66 (+0.64bb / F50%), 55 (+0.60bb / F50%), 44 (+0.44bb / F75%), 33 (+0.33bb / F75%)
- **BB_vs_BTN**: AA (+2.24bb / F0%), AKs (+1.59bb / F0%), AQs (+1.49bb / F0%), KK (+1.97bb / F0%), QQ (+1.84bb / F0%), JJ (+1.65bb / F0%)
- **BB_vs_SB**: なし
- **UTG_vs_HJ_three_bet**: AA (+6.29bb / F0%), KK (+3.85bb / F0%)
- **UTG_vs_CO_three_bet**: AA (+6.31bb / F0%), KK (+3.99bb / F0%)
- **UTG_vs_BTN_three_bet**: AA (+6.27bb / F0%), KK (+3.83bb / F0%)
- **UTG_vs_SB_three_bet**: なし
- **UTG_vs_BB_three_bet**: なし
- **HJ_vs_CO_three_bet**: AA (+6.27bb / F0%), KK (+4.22bb / F0%)
- **HJ_vs_BTN_three_bet**: AA (+6.26bb / F0%), KK (+4.36bb / F0%)
- **HJ_vs_SB_three_bet**: なし
- **HJ_vs_BB_three_bet**: なし
- **CO_vs_BTN_three_bet**: AA (+6.39bb / F0%), KK (+4.97bb / F0%)
- **CO_vs_SB_three_bet**: なし
- **CO_vs_BB_three_bet**: なし
- **BTN_vs_SB_three_bet**: なし
- **BTN_vs_BB_three_bet**: なし
- **SB_vs_BB_three_bet**: AA (+7.37bb / F0%), KK (+5.69bb / F0%)
- **HJ_vs_UTG_four_bet**: A5s (+0.89bb / F95%), A4s (+0.49bb / F100%), T9s (+0.66bb / F100%), 98s (+0.79bb / F100%), 88 (+2.62bb / F100%), 77 (+3.04bb / F100%)
- **CO_vs_UTG_four_bet**: A5s (+0.67bb / F95%), T9s (+1.12bb / F100%), 98s (+0.99bb / F100%), 88 (+3.21bb / F100%), 87s (+0.97bb / F100%), 77 (+3.12bb / F100%), 76s (+1.11bb / F100%), 66 (+3.38bb / F100%), 55 (+3.11bb / F100%)
- **BTN_vs_UTG_four_bet**: A7s (+0.32bb / F100%), A6s (+0.71bb / F100%), A5s (+0.64bb / F95%), QTs (+0.33bb / F100%), J9s (+0.36bb / F100%), T9s (+0.94bb / F100%), T8s (+0.70bb / F100%), 98s (+0.62bb / F100%), 97s (+0.55bb / F100%), 88 (+3.15bb / F100%), 87s (+1.41bb / F100%), 77 (+3.03bb / F100%), 76s (+1.37bb / F100%), 66 (+3.07bb / F100%), 65s (+1.48bb / F100%), 55 (+2.59bb / F100%), 54s (+0.92bb / F100%)
- **SB_vs_UTG_four_bet**: ATs (+1.17bb / F100%), 99 (+2.54bb / F100%), 88 (+2.54bb / F100%), 77 (+2.28bb / F100%)
- **BB_vs_UTG_four_bet**: ATs (+1.18bb / F100%), 99 (+2.77bb / F100%), 88 (+1.96bb / F100%)
- **CO_vs_HJ_four_bet**: A9s (+1.87bb / F100%), A8s (+1.98bb / F100%), A7s (+1.91bb / F100%), A6s (+1.55bb / F100%), A5s (+1.83bb / F95%), A4s (+1.71bb / F100%), A3s (+0.99bb / F100%), A2s (+1.10bb / F100%), KJs (+1.10bb / F100%), KTs (+0.55bb / F100%), AQo (+2.13bb / F100%), QTs (+0.88bb / F100%), AJo (+0.78bb / F100%), J9s (+1.00bb / F100%), T9s (+1.49bb / F100%), 98s (+1.38bb / F100%), 88 (+4.24bb / F100%), 87s (+1.68bb / F100%), 77 (+3.84bb / F100%), 76s (+1.90bb / F100%), 66 (+3.95bb / F100%), 65s (+1.55bb / F100%), 55 (+3.84bb / F100%), 54s (+1.40bb / F100%), 44 (+3.55bb / F100%), 33 (+3.02bb / F100%), 22 (+2.78bb / F100%)
- **BTN_vs_HJ_four_bet**: A9s (+1.99bb / F100%), A8s (+2.05bb / F100%), A7s (+1.93bb / F100%), A6s (+1.85bb / F100%), A4s (+1.38bb / F95%), A3s (+1.07bb / F100%), A2s (+1.08bb / F100%), KTs (+0.66bb / F100%), QTs (+1.04bb / F100%), AJo (+0.92bb / F100%), J9s (+0.64bb / F100%), T8s (+0.94bb / F100%), 97s (+1.26bb / F100%), 87s (+1.70bb / F100%), 86s (+1.50bb / F100%), 77 (+4.00bb / F100%), 76s (+1.95bb / F100%), 75s (+0.99bb / F100%), 66 (+4.18bb / F100%), 65s (+1.85bb / F100%), 64s (+0.75bb / F100%), 55 (+3.89bb / F100%), 54s (+1.62bb / F100%)
- **SB_vs_HJ_four_bet**: A9s (+1.87bb / F100%), A8s (+1.72bb / F100%), A7s (+1.63bb / F100%), A6s (+1.53bb / F100%), A3s (+0.81bb / F100%), A2s (+0.93bb / F100%), KJs (+1.08bb / F100%), KTs (+0.93bb / F100%), QJs (+0.81bb / F100%), AJo (+1.11bb / F100%), JTs (+0.81bb / F100%), T9s (+0.49bb / F100%), 98s (+1.18bb / F100%), 88 (+4.16bb / F100%), 87s (+1.35bb / F100%), 77 (+4.04bb / F100%), 76s (+1.00bb / F100%), 66 (+3.98bb / F100%), 65s (+0.88bb / F100%), 55 (+3.45bb / F100%), 54s (+0.87bb / F100%)
- **BB_vs_HJ_four_bet**: A9s (+1.71bb / F100%), A8s (+1.85bb / F100%), A4s (+0.97bb / F95%), A3s (+0.95bb / F100%), A2s (+0.62bb / F100%), KJs (+1.00bb / F100%), QTs (+0.36bb / F100%), AJo (+1.37bb / F100%), T9s (+0.41bb / F100%), 98s (+0.73bb / F100%), 97s (+0.74bb / F100%), 88 (+3.65bb / F100%), 87s (+1.32bb / F100%), 86s (+0.77bb / F100%), 77 (+3.63bb / F100%), 76s (+0.71bb / F100%), 75s (+0.52bb / F100%), 64s (+0.64bb / F100%), 53s (+0.55bb / F100%)
- **BTN_vs_CO_four_bet**: A9s (+3.89bb / F100%), A8s (+3.64bb / F100%), A7s (+2.98bb / F100%), A6s (+3.28bb / F100%), A4s (+3.00bb / F95%), A3s (+2.72bb / F100%), A2s (+2.86bb / F100%), KTs (+3.10bb / F100%), KQo (+1.70bb / F100%), QTs (+2.33bb / F100%), AJo (+3.65bb / F100%), KJo (+0.70bb / F100%), J9s (+1.77bb / F100%), ATo (+2.67bb / F100%), T8s (+1.66bb / F100%), 97s (+1.91bb / F100%), 87s (+2.30bb / F100%), 86s (+1.88bb / F100%), 77 (+4.83bb / F100%), 76s (+2.55bb / F100%), 75s (+2.03bb / F100%), 66 (+4.93bb / F100%), 65s (+2.09bb / F100%), 64s (+1.63bb / F100%), 55 (+4.86bb / F100%), 54s (+2.09bb / F100%), 53s (+1.66bb / F100%), 44 (+4.49bb / F100%), 33 (+4.13bb / F100%), 22 (+3.92bb / F100%)
- **SB_vs_CO_four_bet**: A9s (+2.05bb / F100%), A8s (+1.72bb / F100%), A7s (+2.09bb / F100%), A6s (+1.57bb / F100%), A3s (+1.27bb / F100%), A2s (+0.87bb / F100%), KTs (+1.61bb / F100%), QTs (+0.32bb / F100%), ATo (+0.35bb / F100%), T9s (+0.82bb / F100%), T8s (+0.42bb / F100%), 98s (+0.92bb / F100%), 97s (+0.33bb / F100%), 87s (+1.09bb / F100%), 86s (+0.63bb / F100%), 77 (+3.90bb / F100%), 76s (+1.00bb / F100%), 75s (+0.55bb / F100%), 66 (+3.71bb / F100%), 65s (+1.60bb / F100%), 55 (+3.51bb / F100%), 54s (+0.84bb / F100%), 44 (+3.05bb / F100%), 33 (+3.36bb / F100%), 22 (+2.81bb / F100%)
- **BB_vs_CO_four_bet**: A9s (+1.60bb / F100%), A8s (+1.71bb / F100%), A7s (+1.58bb / F100%), A6s (+1.05bb / F100%), A4s (+1.30bb / F95%), A3s (+0.93bb / F100%), A2s (+0.74bb / F100%), KJs (+1.78bb / F100%), KTs (+1.06bb / F100%), QTs (+0.67bb / F100%), AJo (+1.06bb / F100%), J9s (+0.44bb / F100%), T9s (+0.84bb / F100%), 98s (+0.62bb / F100%), 97s (+0.54bb / F100%), 88 (+3.40bb / F100%), 87s (+1.00bb / F100%), 86s (+0.55bb / F100%), 77 (+3.42bb / F100%), 76s (+1.33bb / F100%), 65s (+1.01bb / F100%), 64s (+0.41bb / F100%), 54s (+0.98bb / F100%)
- **SB_vs_BTN_four_bet**: A8s (+3.63bb / F100%), A7s (+3.19bb / F100%), A6s (+3.05bb / F100%), KJo (+0.48bb / F100%), J9s (+1.26bb / F100%), ATo (+2.59bb / F100%), T8s (+1.42bb / F100%), 97s (+1.33bb / F100%), 87s (+1.81bb / F100%), 86s (+1.10bb / F100%), 76s (+2.02bb / F100%), 75s (+1.65bb / F100%), 65s (+1.90bb / F100%), 64s (+1.20bb / F100%), 55 (+4.43bb / F100%), 54s (+1.32bb / F100%), 53s (+0.93bb / F100%), 44 (+4.34bb / F100%), 33 (+4.22bb / F100%), 22 (+3.55bb / F100%)
- **BB_vs_BTN_four_bet**: A8s (+3.70bb / F100%), A7s (+2.94bb / F100%), A6s (+2.81bb / F100%), A3s (+2.45bb / F100%), A2s (+2.08bb / F100%), KQo (+1.17bb / F100%), KJo (+0.31bb / F100%), J9s (+1.52bb / F100%), ATo (+2.34bb / F100%), T8s (+1.34bb / F100%), 97s (+0.98bb / F100%), 87s (+1.53bb / F100%), 86s (+1.20bb / F100%), 76s (+1.51bb / F100%), 75s (+0.59bb / F100%), 66 (+4.21bb / F100%), 65s (+1.39bb / F100%), 64s (+0.98bb / F100%), 55 (+4.03bb / F100%), 54s (+1.50bb / F100%), 53s (+0.90bb / F100%), 44 (+4.01bb / F100%), 43s (+0.66bb / F100%), 33 (+3.22bb / F100%), 22 (+3.24bb / F100%)
- **BB_vs_SB_four_bet**: A7s (+4.21bb / F100%), A6s (+3.61bb / F100%), A3s (+3.34bb / F100%), A2s (+3.71bb / F100%), K9s (+0.70bb / F100%), K8s (+0.34bb / F100%), K7s (+0.44bb / F100%), KJo (+1.36bb / F100%), QJo (+0.45bb / F100%), J9s (+2.52bb / F100%), ATo (+3.71bb / F100%), T8s (+2.39bb / F100%), 97s (+2.67bb / F100%), 86s (+3.05bb / F100%), 75s (+2.48bb / F100%), 65s (+3.76bb / F100%), 64s (+2.26bb / F100%), 54s (+3.18bb / F100%), 53s (+2.30bb / F100%), 44 (+6.18bb / F100%), 43s (+2.34bb / F100%), 42s (+1.28bb / F100%), 33 (+5.85bb / F100%), 32s (+1.25bb / F100%), 22 (+4.80bb / F100%)
- **BB_vs_UTG_HJcall**: AA (+2.65bb / F0%)
- **BB_vs_UTG_COcall**: AA (+2.61bb / F0%)
- **BB_vs_UTG_BTNcall**: AA (+2.56bb / F0%)
- **BB_vs_HJ_COcall**: AA (+2.58bb / F0%)
- **BB_vs_HJ_BTNcall**: AA (+2.51bb / F0%)
- **BB_vs_CO_BTNcall**: AA (+2.58bb / F0%), KK (+2.14bb / F0%)
- **SB_vs_BB_iso**: なし

## 整合性の追加調整

同一行の複数ステップは初期→最終にまとめて表示。

- **BB_vs_CO**: J4s call 35→10% (−0.05bb; strength/nesting ceiling)
- **BB_vs_SB**: Q6s call 50→10% (−0.01bb; strength/nesting ceiling), AA call 0→10% (+3.19bb; positive-EV auto-profit protection), KK call 0→10% (+2.68bb; positive-EV auto-profit protection), QQ call 0→10% (+2.33bb; positive-EV auto-profit protection), AKs call 0→10% (+2.19bb; positive-EV auto-profit protection), JJ call 0→10% (+2.13bb; positive-EV auto-profit protection), AQs call 0→10% (+2.00bb; positive-EV auto-profit protection), TT call 10→20% (+1.91bb; positive-EV auto-profit protection), AJs call 35→45% (+1.84bb; positive-EV auto-profit protection), ATs call 35→45% (+1.71bb; positive-EV auto-profit protection), AKo call 10→20% (+1.66bb; positive-EV auto-profit protection), 99 call 15→25% (+1.64bb; positive-EV auto-profit protection), KQs call 15→25% (+1.49bb; positive-EV auto-profit protection), AQo call 30→40% (+1.45bb; positive-EV auto-profit protection), 88 call 30→40% (+1.44bb; positive-EV auto-profit protection), A9s call 60→70% (+1.30bb; positive-EV auto-profit protection), AJo call 40→50% (+1.29bb; positive-EV auto-profit protection), KJs call 55→65% (+1.25bb; positive-EV auto-profit protection), ATo call 50→60% (+1.18bb; positive-EV auto-profit protection), 77 call 50→60% (+1.17bb; positive-EV auto-profit protection), KTs call 65→75% (+1.15bb; positive-EV auto-profit protection), A8s call 60→70% (+1.14bb; positive-EV auto-profit protection), A7s call 75→85% (+1.06bb; positive-EV auto-profit protection), 66 call 60→70% (+1.05bb; positive-EV auto-profit protection), A6s call 75→85% (+0.91bb; positive-EV auto-profit protection), QJs call 55→65% (+0.90bb; positive-EV auto-profit protection), A5s call 40→50% (+0.87bb; positive-EV auto-profit protection), 55 call 60→70% (+0.87bb; positive-EV auto-profit protection), QTs call 65→75% (+0.85bb; positive-EV auto-profit protection), KQo call 40→50% (+0.84bb; positive-EV auto-profit protection), A4s call 50→60% (+0.80bb; positive-EV auto-profit protection), A3s call 55→65% (+0.77bb; positive-EV auto-profit protection), KJo call 50→60% (+0.73bb; positive-EV auto-profit protection), 44 call 70→80% (+0.71bb; positive-EV auto-profit protection), 33 call 70→80% (+0.69bb; positive-EV auto-profit protection), KTo call 60→70% (+0.66bb; positive-EV auto-profit protection), 22 call 70→80% (+0.65bb; positive-EV auto-profit protection), A2s call 55→65% (+0.65bb; positive-EV auto-profit protection), JTs call 55→65% (+0.61bb; positive-EV auto-profit protection), J9s call 55→65% (+0.54bb; positive-EV auto-profit protection), T9s call 60→70% (+0.48bb; positive-EV auto-profit protection), QJo call 50→60% (+0.47bb; positive-EV auto-profit protection), K9s call 55→65% (+0.43bb; positive-EV auto-profit protection), QTo call 60→70% (+0.38bb; positive-EV auto-profit protection), 98s call 60→65% (+0.33bb; positive-EV auto-profit protection), K8s call 60→65% (+0.32bb; positive-EV auto-profit protection), T8s call 60→65% (+0.30bb; positive-EV auto-profit protection), 97s call 60→65% (+0.26bb; positive-EV auto-profit protection), 87s call 60→65% (+0.24bb; positive-EV auto-profit protection), JTo call 30→35% (+0.24bb; positive-EV auto-profit protection), K7s call 60→65% (+0.22bb; positive-EV auto-profit protection), 86s call 60→65% (+0.22bb; positive-EV auto-profit protection), A9o call 35→40% (+0.20bb; positive-EV auto-profit protection), Q9s call 55→60% (+0.20bb; positive-EV auto-profit protection), 76s call 60→65% (+0.19bb; positive-EV auto-profit protection), 54s call 60→65% (+0.18bb; positive-EV auto-profit protection), 65s call 60→65% (+0.16bb; positive-EV auto-profit protection), K6s call 60→65% (+0.15bb; positive-EV auto-profit protection), 75s call 60→65% (+0.12bb; positive-EV auto-profit protection), A8o call 35→40% (+0.12bb; positive-EV auto-profit protection), K5s call 60→65% (+0.10bb; positive-EV auto-profit protection), Q8s call 60→65% (+0.08bb; positive-EV auto-profit protection), 64s call 60→65% (+0.07bb; positive-EV auto-profit protection)
- **UTG_vs_HJ_three_bet**: JJ call 75→90% (+1.12bb; positive-EV auto-profit protection), AKo call 35→40% (+0.75bb; positive-EV auto-profit protection), AQs call 65→80% (+0.51bb; positive-EV auto-profit protection), TT call 60→95% (+0.47bb; positive-EV auto-profit protection), 99 call 45→100% (+0.06bb; positive-EV auto-profit protection)
- **UTG_vs_CO_three_bet**: JJ call 80→90% (+1.13bb; positive-EV auto-profit protection), AKo call 35→40% (+0.92bb; positive-EV auto-profit protection), TT call 65→95% (+0.66bb; positive-EV auto-profit protection), AQs call 65→80% (+0.64bb; positive-EV auto-profit protection), 99 call 50→95% (+0.34bb; positive-EV auto-profit protection), 88 call 30→75% (+0.09bb; positive-EV auto-profit protection)
- **UTG_vs_BTN_three_bet**: JJ call 80→90% (+1.28bb; positive-EV auto-profit protection), AKo call 35→40% (+1.00bb; positive-EV auto-profit protection), AQs call 65→80% (+0.88bb; positive-EV auto-profit protection), TT call 70→90% (+0.85bb; positive-EV auto-profit protection), 99 call 55→70% (+0.52bb; positive-EV auto-profit protection), 88 call 40→55% (+0.27bb; positive-EV auto-profit protection), ATs call 40→55% (+0.20bb; positive-EV auto-profit protection), 77 call 20→35% (+0.18bb; positive-EV auto-profit protection), AJs call 55→70% (+0.17bb; positive-EV auto-profit protection)
- **HJ_vs_CO_three_bet**: JJ call 65→70% (+1.99bb; positive-EV auto-profit protection), AQs call 60→65% (+1.23bb; positive-EV auto-profit protection), TT call 70→85% (+1.19bb; positive-EV auto-profit protection), 99 call 65→95% (+0.77bb; positive-EV auto-profit protection), AJs call 70→85% (+0.71bb; positive-EV auto-profit protection), ATs call 60→90% (+0.55bb; positive-EV auto-profit protection), 88 call 50→90% (+0.49bb; positive-EV auto-profit protection), 77 call 40→80% (+0.23bb; positive-EV auto-profit protection), 66 call 25→65% (+0.21bb; positive-EV auto-profit protection), KQs call 70→85% (+0.11bb; positive-EV auto-profit protection), AQo call 40→75% (+0.05bb; positive-EV auto-profit protection)
- **HJ_vs_BTN_three_bet**: JJ call 65→70% (+1.89bb; positive-EV auto-profit protection), AQs call 60→65% (+1.52bb; positive-EV auto-profit protection), TT call 75→85% (+1.51bb; positive-EV auto-profit protection), AJs call 70→85% (+1.00bb; positive-EV auto-profit protection), 99 call 70→85% (+0.94bb; positive-EV auto-profit protection), 88 call 60→75% (+0.71bb; positive-EV auto-profit protection), 77 call 40→50% (+0.64bb; positive-EV auto-profit protection), ATs call 60→70% (+0.61bb; positive-EV auto-profit protection), AQo call 40→50% (+0.42bb; positive-EV auto-profit protection), KQs call 70→80% (+0.33bb; positive-EV auto-profit protection), 66 call 25→35% (+0.32bb; positive-EV auto-profit protection), 55 call 25→35% (+0.19bb; positive-EV auto-profit protection), KJs call 60→70% (+0.16bb; positive-EV auto-profit protection), 44 call 10→20% (+0.06bb; positive-EV auto-profit protection)
- **HJ_vs_BB_three_bet**: 66 call 50→10% (+0.09bb; strength/nesting ceiling)
- **BB_vs_HJ_BTNcall**: K7s call 50→10% (−0.05bb; strength/nesting ceiling)

## 監査

- [warn] ev-capacity-conflict / UTG vs HJ 3bet: オープナーのフォールド率 71.2% > 損益分岐 66.7%（どの2枚でも3betで得をする）。ただし指定EV制約・固定レイズ下の最大継続率は28.85%。全ての合法コールを埋めても両立不能（均衡未達）。
- [warn] range-capped / BB_vs_SB_limp: BB_vs_SB_limp の check に強いハンドがほぼ含まれない（頻度 81.8%、上位10%の占有率 0.2% < 2%）
- [warn] over-segregated / BB_vs_SB_limp: 単一アクション100%のハンドが到達コンボの 86.9% > 85%（2つ以上のアクションを各10%以上使用）

## 変更ファイル群

- モデル／監査: `src/estimated/eqr.js`, `call-ev.js`, `call-equities.json`, `call-ev-report.json`, `audit.js`。
- 生成: `scripts/eqr.py`, `call_policy.py`, `apply-call-ev.mjs`, `data/response-mixes.json`, `lib/call-consistency.mjs`, 対象5生成スクリプト, `build-estimates.mjs`, `audit-estimates.mjs`。
- 理由: `reason-facts.mjs`, `compose-reasons.mjs`, `lib/reason-context.mjs`, 全58局面の `src/estimated/reasons/*.json`。旧手書きBB_vs_BTNテンプレートと旧render.pyは削除。
- データ: `preflop-ranges.json`, `three-bet-responses.json`, `four-bet-responses.json`, `multiway-responses.json`, `limp-responses.json`。
- テスト／説明: `tests/call-ev.test.mjs`, `tests/detailed-reasons.test.mjs`, `tests/multiway-responses.test.mjs`, `src/estimated/AGENTS.md`, 本レポートと生成スクリプト。
- 指定UIファイルは変更しない。git commitなし。
