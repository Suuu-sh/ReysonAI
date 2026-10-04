# 3人 SRP 代表候補: authoring review / 未解決事項

更新: 2026-10-04。対象は **CO_open_BTN_call_BB_call の第一候補だけ**。
著者: `gpt-6-astra`。この文書は著者自身による根拠・自己点検記録であり、独立レビューの承認ではない。
**AI推定、GTO・ソルバー解ではない。非公開候補。16経路展開や本番配信の承認はしていない。**

## 結論

- 専用authoring source `scripts/data/mw3-co-btn-bb-authored.mjs` を新規作成。
- `buildMw3PilotPolicies(inputs, probe)` は117 node / 1,209 contextを、flop 5,925 rules、turn/river 28,245 rulesに展開する。
- `validateMw3Policy` は両方PASS。全33,585 context × texture × tier overrideの実選択・合法キー・整数合計100・priority100選択・再生成一致を確認した。
- **重大な品質未解決**: 共有5-tierのmonsterがボード由来のtwo-pair/trips等も含む。pair/flush runoutの減速だけでは、既にpairedだったボードのblank riverを区別できない。構造PASSを品質解決扱いしない。16全量展開前に3人専用classifierを改善して再author/reviewすることを推奨する。
- 全1,755 flop構造gate、tuple条件付きjoint-defence診断、独立review、candidate archive保存は親側工程。ここではそれらが完了したとは主張しない。

## 入力と出所

- spot: `CO_open_BTN_call_BB_call`、postflop順序はBB → CO → BTN。
- オープン2.5BB、初期pot 8BB（SB dead blind 0.5BB込み）、各残りstack 97.5BB。
- CO: 保存RFI `CO_open`、加重389 combos。AA/KK等を全量含む。
- BTN: 保存first-call `BTN_vs_CO`、加重145.8 combos。AA/KK各10%を残すが、suited broadway・中小pair中心。
- BB: 保存second-call `BB_vs_CO_BTNcall`、加重250.1 combos。suited connectors・小pair・広いbroadwayを含み、AA/KKのcallはない。
- 上記combo数は各自のpreflop action頻度×combo数。joint deal確率でも、他プレイヤーの行動条件付き到達質量でもない。
- pin済み入力fingerprint: `c9828f0e54b8156bf64c12929efc2dfe55774b3339c980a009805271206a9117`。
- このfingerprint、spot、8BB/97.5BB geometryまたは117/1209 probe contractが違えばbuilderは停止する。他経路の方針として流用できない。
- HU `policy` / `later-policy` / `defence` / reference mixの読取・コピーはしていない。共有`model.mjs`から利用するものはtierラベルと分類契約のみ。equity、EV、MDF最適化による頻度の補正はない。

## authoringの意味

保存する完成物は全合法actionの明示mixであり、call/foldもそのまま使う。authoring sourceは以下の人間がレビュー可能な判断表と、オフラインの決定的展開だけを持つ。

1. BB lead / CO c-bet / BTN two-check stabごとに、12 shape-height × 5 tierのbet総頻度を別々に判断した。
2. street / live人数 / 前streetのline / **現在の**positionごとに、laterのbet総頻度を別々に判断した。
3. faced action / streetごとのcontinue総頻度とraise頻度を判断し、価格、後続応答、cold/invested、現在OOP/IP、残りSPR、ボードの条件に対する明示percentage-point差分を加えた。
4. bet総頻度を明示サイズ配分で整数化する。端数はlargest-remainder、同順位はaction順で決める。callはcontinue−raise、foldは100−continue。このオフライン表現は相手レンジのequity最適化や実行時頻度再配分ではない。
5. 各node × tierに全`any` / priority0を必ず保存する。ただし現geometryの全contextは、全7軸を指定したpriority100で覆う。priority100同士は完全に異なるselectorで排他的。同priorityの曖昧な重複を使わない。
6. flop: 33 nodes × 5 defaults + 96 contexts × 12 textures × 5 tiers = 5,925。
7. later: 84 nodes × 5 defaults + (476 turn + 637 river) contexts × 5 runouts × 5 tiers = 28,245。

元の役割をコピーして見かけだけ別席にしていない。例えばCOの同一`mw3_turn_middle_first`でも、3→2人後に現在firstならstrongのblank/aggressor/deep mixはcheck46 / bet33 31 / bet75 23。現在lastならcheck31 / bet33 40 / bet75 29になる。どちらも3人起点専用の判断である。

## engine / selectorの確認済み意味

- `line`: 直前に完了したstreetの最後のaggressorが自分ならaggressor、他人ならdefender、いなければchecked。flopは全席checkedなので、COのpreflop aggressor属性は独立role profileで表す。
- `response=cold`: **そのstreetで**まだチップを入れていない最初の応答。前street callerという意味ではない。`invested`: そのstreetですでにbet/call/raiseして再応答している。既投資をsunk-costのcall理由にはしない。
- `behind` node: pending responseが残る。現在IPのBTNでもBBの応答が後ろに回る場合があり、IPだからclosingとは扱わない。
- `players`: 現在liveの2または3。foldした席をHUレンジに置き換えない。
- `position`: 現在liveのfirst/middle/last。2人時はfirst/lastのみ。
- `price`: immediate incremental call ÷ (現在pot + call − 5%/3BB-cap rake)。仮想的な後続callを足さない。cheap ≤20%、standard ≤1/3、expensive >1/3。33%と75%betはどちらもstandardになり得るので、nodeのfaced sizeも使う。
- `spr`: call後の最小残りstack ÷ call後pot。shallow ≤1、medium ≤3、deep >3。all-in応答は残りSPR=0になっても、その理由だけで自動callにしない。
- `first_low_spr`: 最大125%サイズが残りstackの67%以上になるチップ条件。`spr=shallow`と同義ではなく、mediumを含む。shallowではcheck/shove、medium low-SPRではcheck/33/shove中心とし、同額へmergeするサイズを別の小さい実ベットと誤認しない。

## 戦略判断

### まだ3人いるとき

- BBは広いovercall rangeを持ち、OOPかつ2人を通す必要があるので先頭checkを強く残す。低いwet boardの強いhand/drawだけ少しleadが増える。
- COは高いdry boardのpremium優位を反映するが、BTNが後ろに残るためHUのような広いc-betを前提にしない。
- BTNは2チェックを見た最後の席としてstabを増やす。ただしwet/monotoneではairを大きく絞り、中位handの大型betを使わない。
- 後続responseがあるとdraw/mediumを追加で絞る。3人closingは既に他の1人が続行しているため、単に「閉じるからHUのように広く守る」としない。改善した価格はpriceで別に扱う。
- フロップのwet drawをセミブラフraiseに残す一方、冷たい複数人raise、river、危険runoutほど抑制する。blockerを識別できないため3人riverのraiseがvalue-onlyになる場合は残す。HUの「全raiseに必ずブラフ」を機械的に強制しない。

### 2人になった後・later

- 3人起点の限定された到達rangeとdead chipsを保ったまま、現在のOOP/IP差でcheck/bet・draw/mediumの続行を変える。
- previous defenderからOOP leadする頻度は全tierで小さく、turnはmonster≤24 / strong≤12%、riverはmonster≤20 / strong≤9%。現在lastのchecked-to defenderはこれとは別に扱う。
- blankで前aggressorのvalue/draw barrelを残し、overcardは無条件の全range有利と決めつけず、主にstrong/mediumを減速する。pair/straight/flush threatではmonsterも含めた大型betを減らす。
- riverのdraw tierは実カードでは発生しないがschemaのため明示check100 / fold100を入れる。airのriver callは0であり、少量のbluff-raise以外はfold。
- チップが入った再応答の微調整は、選択された到達rangeが違うという限定的判断。call価格は常にincremental priceを使い、投資済みだからcallする設計にはしない。

### 代表boardのraw preflop-weighted first-action診断

これは自分のpreflop頻度だけで重み付けした各席の平均。前の席がcheckしたというjoint条件付きの実到達率ではない。

| Board | BB bet | CO bet | BTN bet |
|---|---:|---:|---:|
| As7d2c | 3.62% | 26.16% | 34.54% |
| 8h7h6c | 14.95% | 22.90% | 32.95% |
| KhKd2s | 6.19% | 24.45% | 34.94% |
| QsQhQd | 16.00% | 48.00% | 58.00% |

最後の行は下記のclassifier問題を露出している。見た目の席別頻度が違うことだけで品質を承認しない。

## 重大な未解決: monsterのprivate-card寄与を区別できない

共有`handTier`はbest-fiveのcategory ≥ two-pairをすべてmonsterにする。これはHUを変えず流用した既存抽象化だが、3人用の固定call/foldでは特に重大。

実カードで確認:

- `KhKd2s + 3c3d`: Kと3のtwo-pairでmonster。
- `KhKd2s + AhKs`: Kのtripsでmonster。
- `KhKd2s + 2c2d`: 2 full of Kでmonster。
- `QsQhQd + 7c6c`: board tripsしかなくてもmonster。
- `AsAdKcKd2h + 7c6c`: boardだけのA/K two-pairでもmonster。river textureは**blank**なのでpair減速ruleは選ばれない。

全1,755 canonical flopに対する分類診断:

- pairedまたはtrips: 325 classes（18.52%）。そのうちtripsは13 classes（0.74%）で、合法な全private handがmonsterになる。
- これはisomorphism classの個数比。実deal確率ではない。
- 325 classesに対し、各seatのsource支持comboをcard removal後に合計したraw own-preflop weightでは、monster比率はBB 40.01%、CO 39.10%、BTN 43.94%。
- そのmonster質量のうち、paired boardとrankが一致しないpocket pairによるtwo-pairがBB 48.50%、CO 46.88%、BTN 54.75%。すべてが弱いとは限らないが、topset/fullhouseと同じ意思決定になる量が大きい。
- 本候補の`AsAdKcKd2h` / 3人 / checked / deepでは、全rangeがmonsterになりBB bet32%、CO bet45%、BTN bet68%。76とfullhouseの同一mixは、守りを多少抑えるだけでは直らない。

### 3人専用classifierの最小改善案

共有HU `model.mjs` /既存HU hashは変更しない。3人用だけで次を識別し、新identityで再生成する。

1. 私有札がmade categoryを改善しないboard-made valueを、通常のmonsterから外す。five-card boardとの比較だけではflop/turnに足りないため、board rank multiplicityとprivate rank参加を明示する。
2. paired board + private pocket pairのtwo-pairを、private trips/fullhouse/quadsと分離。underpair / overpairも少なくともstrong/mediumへ分ける。
3. genuine two-pair / set / straight / flush / fullhouse等と、board-only rankを区別。flush/straightもboard-onlyおよび弱い一枚参加を考慮する。
4. nut/weak draw、nut-suit blocker、top-pair kickerの区分は次の改善。今回のschemaを維持する最小修正なら既存5 tierへの3人専用reclassificationが可能だが、十分性は新例・全board・joint診断で再レビューする。

これは「後でできればよい」参考メモではなく、第一候補の品質限界。既存tierに合わせた頻度抑制で解決済みとは記録しない。

## その他の限界と次のgate

- `runoutTexture`は新しい1枚の最優先featureだけ。既に4-flushだったboardにoff-suit blankが来た状況等を区別できず、ボード全体の危険性を保持しない。
- 同じnode/contextに、bettorのidentity、先行bet-callの詳細、異なるpot geometry、異なる到達rangeが合流する。全合法stateのcoverageは、各合流に対して正しいstrategyの証明ではない。
- 5 tiersではtop-pair kicker、nut draw vs gutshot、showdown valueを持つdraw、private blockersを区別できない。
- 合法性とsum100は保証できるが、共同MDFや全player戦略の均衡は保証しない。2人のmarginal fold率を後から掛けた値でjoint防御を合格扱いしない。
- `mw3-actions.mjs`による同額サイズaliasの集約は、saved mixを変えず観測行動のreachを確率和で扱う。joint診断はその同じobservable-action解釈で行う。
- allin / riverでHUのbluff capや防御下限は適用しない。戦略の偏りは警告・reviewとして報告する。
- 33,585 overrideすべては実geometryのcontextとtexture/tierの直積。river drawのようにcard上不可能なtierもschema coverageとして含める。policy-reachableなhistory確率の推定ではない。

## このauthoring作業で実行した確認

- `node --check scripts/data/mw3-co-btn-bb-authored.mjs`: PASS。
- `loadMw3Inputs` / `probeMw3Hand`: 31,653 unique chip states、117 nodes、1,209 contexts（代表1pot）。全3初期potの独立geometry review数と混同しない。
- builder内の`validateMw3Policy`、flop/laterともPASS。
- 12 flop texture実board、turn/riverそれぞれ5 runout実boardを用い、全context × tierの`selectMw3Rule`を実行: **33,585 checks PASS**、33,585 distinct priority100 rules、fallback選択0、合法action順・integer sum100一致。
- 同inputs/probeでbuilderを2回実行し、JSON byte sequence一致。
- SHA-256（`mw3Sha` / JSON.stringify policy）:
  - flop: `a2b34e77fd998d2eb05c848fee0f8ae4ee9941e9e38137effdcf6359d0320f12`
  - later: `883bf82991a20b4d7c9e455c45fce58df3b9a7508cf1d2648f6c4c86499d306c`
- 上記paired/trips分類診断は全1,755 classを確認したが、**policy全1,755 gateとは別**。
- npm build、全suite、shared data変更、archive保存、publish、HU監査はこのworkerでは実行していない。親工程の結果で追記する。

再生成の最小呼び出し（保存は親のhash付きcandidate/archive工程で行う）:

```js
import { loadMw3Inputs } from './scripts/postflop-ai/mw3-inputs.mjs';
import { probeMw3Hand } from './scripts/postflop-ai/mw3-tree.mjs';
import { buildMw3PilotPolicies } from './scripts/data/mw3-co-btn-bb-authored.mjs';
const inputs = loadMw3Inputs('CO_open_BTN_call_BB_call');
const probe = probeMw3Hand(inputs.spot);
const { flop, later } = buildMw3PilotPolicies(inputs, probe);
```

---

# V2 authoring review: private contribution / current nuts / shared board

更新: 2026-10-04。上記V1の根拠・数値・hashは履歴として保存し、本節以降が8-tier候補の記録である。V1保存artifactは親側の`archive-v1`に保全されている。V2も未公開・独立quality review前の候補。

## 新しい契約と根拠

- source fingerprint: `6adc8a5f853d488f68edd4dbae4cdfbeb9d459a234dca8584f078f46652edd9d`。
- policy schema 2、classifier version 2。
- tier順: `nuts, monster, strong, draw, medium, air, board_shared, board_locked`。
- classifierは親が実装した`mw3-hand-features.mjs`。既存HUの`handTier` / `hand-features.mjs`は変更していない。
- 私有札のmade-hand寄与を確認し、paired boardに付いた弱いpocket pairや共有tripsをmonsterから外す。最高unpaired side-cardに対するpair、および実際のbest-fiveへ入る最高private kickerをstrong/mediumへ分ける。
- 公開boardごとに全合法2枚のbest-five scoreを一度評価し、score降順・同scoreはcard昇順でcacheする。Heroの2枚と重ならない先頭pairが実際に可能なopponentの最大score。Hero scoreがそれ以上なら**現時点の**blocker-conditioned nuts。equity、EV、相手range、相手の実際の伏せ札を見ない。
- public upper-bound一致の`guaranteedPrivateNuts` factはpositive-onlyのまま保持。tierはより厳密な`blockerConditionedNuts`を使うので、4-flushの一枚nut flushや`AAKK2 / AK`の既知false-negativeを解消する。
- 分類の優先順はboard_locked → board_shared → nuts → residual 5 tiers。`playsBoard`はriverの全categoryで判定する。
- board_lockedは全合法holdingが公開boardと同点になることを厳密確認する。公開royal、3-flushのないBroadway straight、quads＋最高可能kicker等。private nutsと混同しない。

## V2の実際のauthor判断

追加3tierはV1のmonsterをコピーしていない。authoring sourceの`NUTS_FLOP_BET` / `NUTS_LATER_BET` / `NUTS_SIZES` / `NUTS_RESPONSE` / `BOARD_SHARED_CALL`で専用判断を明示した。8tierに展開した完成mixを保存し、consumerはその頻度を直接使う。

### Nuts

- BBはnutsでもチェックを十分残し、CO c-betとBTN stabは別のbet頻度・サイズを持つ。
- turn/riverはlive人数・現在OOP/IP・前streetのlineごとに独立profile。previous defenderから先頭leadを無条件100%にしない。
- river facingは全node/context/textureでfold0。raiseが合法ならcall/raiseを混ぜ、後ろにもう1人残るとovercallを受けるためcallを増やす。raise不可ならcall100。
- flop/turnのcurrent nutsは最終勝利を保証しない。現候補は普通の33/75/125%betへfold0、expensive raise/allinの一部に少量foldを残す。実到達contextでの最大foldはflop5%、turn8%。先頭betもcheckを残し、現在nutsだからすべてのサイズをjamにしない。
- 安全な共有boardと異なり、私有nutsのbetを一律checkへ抑えない。現在のnut flushがflush runoutだから旧monsterの大きな減速を受ける、という誤りを避けた。

### Board locked

- 全合法action keyを保存したうえで、firstはcheck100、facingはcall100、raise0。
- 誰も上回れない共有役での誤foldと、不必要なpot/rake拡大を避ける。
- flop/turnでは実カード上このtierは発生しないが、schemaの全node × tier coverageとして同じ明示mixを保存する。

### Board shared

- firstはcheck100、raise0。私有札が一切改善していない共有役を強いvalue handとしてbet/raiseする挙動を止めた。
- riverのcallはfaced action × live人数 × priceを専用表で判断。3人closingは既に他の1人が続行しているため、2人closingとは区別する。cold/investedと前streetのlineも小さく考慮。
- 2人・33%・standard価格の基準call45%、3人では30%。より大きいbet/raiseやexpensive価格ほど絞る。これは共同MDFを満たすための機械的補正ではない。
- ただし共有high-cardから共有fullhouseまで同じtierに入るため、専用化だけで防御の品質を解決したとは扱わない。詳細は残限界節。
- flop/turnでは実カード上発生しない。schema上のfirst check100、facing fold100は不可能classに対する明示行であり、実handへimplicit fallbackとして使わない。

### Residual 5 tiersの再判断

- 小pocket pairやboard-owned tripsが外れたpaired monsterは、V1よりprivate valueとしてbet/raiseをやや増やした。例CO paired-high monster bet48→57%、配分は旧33/75=82/18から65/35へ。
- strongにはpaired-boardのgood bluff-catcherも入るため、CO paired-high strong bet42→34%、BTN50→44%へ抑えた。BBはcheck中心を維持する。
- paired textureでのmonster continue減点を−10→−4、raise減点を−12→−6。共有役をmonsterと誤認していたことへの過大な一律減速を一部戻した。
- later pair-runoutのmonster bet減点はturn−15→−8、river−20→−12。flush/straight threat、strong/mediumの脆さ、後続responseのリスクは継続する。
- low-SPRでは新nutsもcheck/shove、または33/shoveの明示配分。sourceで実行時equity補正を追加していない。

## V1 → V2の具体例

以下はCO、3人、checked line、firstはdeep、facingは75% / standard / 後続responseありの同一context比較。値は保存mixそのもの。

| Board / hand | Tier V1 → V2 | First bet V1 → V2 | Facing V2 fold / call / raise |
|---|---|---:|---|
| KhKd7s / QcQd | monster → strong | 48 → 34% | 34 / 65 / 1 |
| KhKd7s / 2c2d | monster → medium | 48 → 12% | 100 / 0 / 0 |
| KhKd2s / AhKs | monster → monster | 48 → 57% | 5 / 57 / 38 |
| KhKd2s / Kc2d | monster → nuts | 48 → 66% | 0 / 58 / 42 |
| QsQhQd / 7c6c | monster → medium | 48 → 12% | 100 / 0 / 0 |
| QsQhQd / AhKc | monster → strong | 48 → 34% | 34 / 65 / 1 |
| AhKh8h3h2c / QhJd | monster → nuts | 28 → 76% | 0 / 32 / 68 |
| AsAdKcKdJh / 7c6c | monster → board_shared | 28 → 0% | 88 / 12 / 0 |
| AcKdQhJsTc / 7c6c | monster → board_locked | 28 → 0% | 0 / 100 / 0 |

上位private kickerを残すことで、QQQ上のAKまで弱いairに落として全foldする逆方向のgross errorを避ける。一方、同じQQQ上の76は高いprivate kickerやpocket pairに負けやすく、75%への3人cold responseを大きく減らした。

### Raw own-preflop weighted first-action比較

前節と同じく他人のcheckを条件付けていない診断値。joint reachではない。

| Board | BB V1 → V2 bet | CO V1 → V2 bet | BTN V1 → V2 bet |
|---|---:|---:|---:|
| As7d2c | 3.62 → 3.62% | 26.16 → 26.30% | 34.54 → 34.58% |
| 8h7h6c | 14.95 → 15.14% | 22.90 → 23.08% | 32.95 → 33.23% |
| KhKd2s | 6.19 → 5.19% | 24.45 → 22.87% | 34.94 → 32.16% |
| QsQhQd | 16.00 → 9.95% | 48.00 → 32.14% | 58.00 → 45.42% |
| AsAdKcKd2h | 32.00 → 13.30% | 45.00 → 22.57% | 68.00 → 36.97% |
| AsAdKcKdJh | 15.00 → 5.48% | 28.00 → 13.57% | 51.00 → 23.57% |

V1のriver `AAKK2`では全rangeがmonsterだった。V2ではprivate A/Kによる本物のfullhouse、Q kicker、低いprivate kicker等に分かれるため、raw全range betも低下する。`AAKKJ`の真のboard_shared質量はBB57.63%、CO46.73%、BTN50.35%で、この質量のfirst betは0。

## V2自己点検

- `node --check` PASS、`validateMw3Policy`両street envelope PASS。
- 117 nodes / 1,209 contextsを維持。
- flop: 33 × 8 defaults + 96 × 12 × 8 overrides = **9,480 rules**。
- later: 84 × 8 defaults + 1,113 × 5 × 8 overrides = **45,192 rules**。各envelopeの50,000上限内。
- 実board代表12 flop textures、turn/river各5 runout featuresで全**53,736 override**を実選択。全件priority100、fallback選択0、action order/key一致、整数sum100。
- board_lockedの**6,717** selector選択でcheck100/call100を確認。
- river nuts facingの**2,785** selector選択でfold0を確認。
- board_sharedの**6,717** selector選択でfirst check100 / raise0を確認。
- 上記にはschemaの直積としてcard上発生しないtierも含む。全53,736に実hand supportがあるという意味ではない。
- 同一inputs/probeでの再生成JSON一致。
- 確定policy SHA-256:
  - flop: `890bbb589b5e0186c3669862543ddc9cd38984be82a36e6199b5511cafcbcccf`
  - later: `de5a744fbb011e2bb7d2a03b11f8050c75bcd7768f762fde8f54d45da3693d1a`
- V2候補保存・全1,755 gate・後段board点検・20,000 tuple joint診断・独立reviewは親が担当する。この自己点検をそれらの代わりにはしない。

## V2の残限界 / 独立reviewで止めずに見逃してはいけない点

1. **Current nutsと将来lockの区別不足**。少量foldを残した現在nuts tierには、私有royal flushも入る。実例`AhKhQh / JhTh`、`mw3_flop_middle_vs_raise2_behind`、expensiveではfold3 / call97。turn `AhKhQhJc / JhTh`、同等raise2/expensiveではfold8 / call92。どちらもroyalは将来負けないため、このfoldは不適切。flop/turnを無条件stack-offにしない要件と8tierの粒度が衝突している。private future-lockの追加区分か、current nutsの全facing fold0を別の戦略判断として採用する必要があり、親へ先に報告した。riverのnuts誤foldは解消済みだが、全streetの絶対nuts誤foldを解消したとは言わない。
2. **board_shared内の強弱差**。`playsBoard`が共有high-card、pair、straight、flush、fullhouse等を一つにまとめる一方、policyは新しいriver1枚のfeatureしか見ない。call表は透明な暫定判断であり、共有fullhouseの過剰foldと共有high-cardの過剰callを同時に精密修正できない。first check100は共有役valuebetの誤認を止めるが、共有役をbluffへ回す戦略も抑えるため、under-bluffは別途診断する。
3. nutsは唯一勝つhandとは限らず、opponentとtieするnutsも含む。nutsを強いvalueとしてbet/raiseする一律頻度は、split-pot構造の細部を捉えない。
4. fullhouseの上下、低い一枚flush、nut draw / weak draw、top-pair kicker、bettor identityと詳細historyの合流は依然coarse。exact current rank classifierの導入はequityや均衡戦略の導入ではない。
5. 正規化・選択・合法性PASSと、共同防御の妥当性・全board品質・公開承認は別である。既知の限界を警告0という理由だけで解決済みにしない。
