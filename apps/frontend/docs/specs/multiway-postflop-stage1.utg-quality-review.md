# 3人ポストフロップ段階1：UTG / BTN・CO / BB の独立品質レビュー

更新: 2026-10-04 22:06 UTC。対象方針をauthorしていない独立reviewerによる保存物レビュー。

## 判定

| 保存候補 | 独立判定 | 修正必須の数値・構造blocker | 残る共同警告 |
| --- | --- | --- | --- |
| UTG_open_BTN_call_BB_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 36（overfold35 / overcontinue1） |
| UTG_open_CO_call_BB_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 36（overfold34 / overcontinue2） |

この受入れは、保存mixとsourceの整合、全量gateの保存証拠、分類安全条件、再現・会計検証を確認した判断である。**均衡性、最適性、GTOへの近さ、利益、実戦相手への頑健性を認めるものではない。** Ks8d3cで2check後の33% betに共同続行が約41%しかない実質的弱点は残り、既存3経路よりこの最悪差は少し大きい。警告36件という総数だけで既存39 / 37 / 39件より改善したとは言わない。

UTG→CO→BBのhistorical author rationaleには「suited-connector flatsなし」という説明誤りがある。実sourceとprofileのsupport配列にはJTsが正しく含まれ、保存方針でもdrawを排除していない。下記の**明示的errataをもって説明を訂正し、この誤文だけによる頻度再authorは要求しない**。元recipe-pinned JSON、候補、reportを書き換えて過去証跡を再表示することはしない。

候補metadataは `candidate_pending_independent_review` のまま、公開 `MW3_APPROVED_POLICIES` は空のまま。これは品質判定の文書であり、公開registry、release receipt、archive/LFS/D1、ブラウザQA、本番反映の承認ではない。未レビューの別経路へ受入れを延長しない。

## 実施した独立確認と実施していないこと

- 実保存候補4本と完成済みreport10本を、一度に大きいpolicyを1本だけ読み、14本全てのraw bytes長とSHA-256を独立照合。
- sourceの3 spot、実geometry、sizing、rake、classifier4からsource materialをPythonで再構成。保存fingerprint、profile、stable-source inventoryと一致。
- 選択profile＋context-judgments＋emit＋registryの4-file recipe、共通semantic13ファイル、generic verification8ファイルのhashを現在の文字列から再計算。
- 各61,506 rules、合計123,012 rulesのnode inventory、合法action、整数0–100・sum100、重複identity、9tier fallback、7selector domain、具体contextごとの全texture×9tierを確認。
- 各180件のflop residual-tier初動anchorを保存bet総量と照合。全保存ruleのabsolute/current nutsとboard安全tierを確認。
- 各108 joint eventsの完全inventory、90×20,000 accepted samples、18支持0、確率・MDF・差・区間・警告の再集計。
- 24board分、計240,000 handsの保存simulationについて、別Pythonでboard順・seed・勝敗・action/terminal/rake/stack会計を独立検証。Replay対象simulation object hashも照合。
- 方針頻度、source、実装、metadata、recipe、report、receiptは変更していない。書いた成果物はこのreview文書だけ。

**Node、npm、esbuild、test、probe、compile、MC、全board audit、simulation/replayはこのreviewでは起動していない。** 実gateを保存証拠から検証したことと、reviewerが再実行したことを混同しない。UTG→BTN→BB fullgate完了は21:53:27 UTC、UTG→CO→BBは22:01:46 UTC。後者は完了通知を受けてからreportを読んだ。

読取開始HEADは `a85bf69677a111cf9c4c03383781bec273c28cde`。最終照合時HEADは `8ce48ea746b78432970ec475ac0a82ec85f46c0b`。その差分は既存result文書1本だけで、数値・検証依存差分はない。ReportをこれらのHEADで再実行したという主張ではなく、現在の実bytes・依存hashの一致に基づく受入れである。

## 固定identity

両方とも100BB、UTG 2.5BB open、2人がcallする3人SRP。初期pot8BB、残りstack各97.5BB、5% rake・cap3BB。元roleはBB first、UTG middle、BTNまたはCO last。外側でfoldする3席のholecardsとそのfold条件は未モデル化。

| Identity | UTG → BTN → BB | UTG → CO → BB |
| --- | --- | --- |
| Source | `3effc9977afa66aa817c2e1c697f6789a593bdf3418741ab33fe34236dd5b7f2` | `4ca502b9b4c22ca9d67058d9be52c52539549f2442cfb08983296d09afacd95d` |
| Recipe | `d89bb2631ca4b0dd5dae504f33da5ada2d89d3f501845ca29e38f210ed262b06` | `b216e439bce6361c4f67925141ef92879329df8e0de4af2dd5ceba16be339db3` |
| Flop policy | `5405d51426d387f652d4447e0afc54186c2a6ed22637083d9aed3e628824be70` | `e8ad7a1aa002559e51f485ef68f4163ce9ba5955be5d0bcc7b83f4250bda48ef` |
| Later policy | `282afaf9fa0cecc7ae680a18707a1aa71a16bb4fc7dd15463031d7fddfe898aa` | `a9aea007ce66ddaae4d08843e6280f777d10f38aa4c353aa737e8a22e21bb772` |
| Replay対象simulation object | `a3dbede7b878ddb4d0441a006aa90916ec5f88df6d89bb9f3a6a6c2589f338a8` | `b4d54b7bf2338f3e713868871ed4ef5c88100ae8b62eefedc54d82673352696e` |

共通implementation: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`。

共通verification: `92b946dfc5c87359dcb3e610e832e262c2d3ac366110f295968eca2f7392c088`。

保存metadataはschema3、model `gpt-6-astra`、strategy `ai_estimate_not_gto`。Author version1、taskは `mw3-utg-btn-bb-mw3-srp-v1-authored-v1` / `mw3-utg-co-bb-mw3-srp-v1-authored-v1`。各flop/later共通generated_atは `2026-10-04T21:45:25.441Z` / `2026-10-04T21:53:30.434Z`。

### 実ファイルのraw SHA-256

完全path・bytesの元inventoryは `.local/postflop-ai/mw3/remaining-thirteen-run-v1/UTG_open_BTN_call_BB_call.proof-inventory.json` と `UTG_open_CO_call_BB_call.proof-inventory.json`。Inventoryの結論を採用するだけでなく、その各pathの現物をhashした。

| ファイル | UTG → BTN → BB | UTG → CO → BB |
| --- | --- | --- |
| Flop candidate | `9df37fa4b4a1ed7137367b8e4f65531b21e363faa09b5f974c22d22eed3a7eaa` | `ddba7d708d76153237b16f55f7b96b60b2debd40873d8d19ba45bbccac3fa643` |
| Later candidate | `f01cba150ba7f85db4959266f2669849af3f8a76aea6c052f0151487f0bc315c` | `7bb9382790000baea490cd28dc8da7d745432a4a13161d0cda2638b7c826f577` |
| all-flops | `c5deba83fe1054bb04b5368dcdfd1a80c32f908f2d777cb2e26a8564a30e7b87` | `1c99e164bbefa3008c87b8b25916a8e2226c50691f3c6d9fd173d4fbd0ce6ab8` |
| later-runouts | `b83d6c2d7637d8645e54e3d19d97c0e16ced48ca93ec99a63c2dc7de5221e3f2` | `97fde14b70d9e5dfb687edfad92704a807a8c6d8d9fac6c90326dba9a8ffd1c1` |
| joint-defence | `64fd6658c8598ac3c20d05a330722e33797a88e5ca9ca349faf55c9cdf70263a` | `50d752f9bca075de50a190d683d047f26296b68506fba8c5c2625861c9f508fa` |
| simulation | `4bcbacf1f6c51bd63ccbc31869622cd4b9096781384df843544545e80c907a5c` | `636914f51018da6291e2c6fd5ac56a71786e622f506df2d3c2140b6ad3857d4e` |
| simulation-replay | `f9aead71a41a7effd6e7b0e5b4587d4ee135fa4359b0cff17a7f3baceeb55cc1` | `711dfb65eb716a0cf6540286261fc32aced126a280a49c28e20b07aa2026cfed` |

候補bytesはBTN経路2,588,506 / 12,187,880、CO経路2,588,569 / 12,188,318。Raw file hash、内側policy hash、simulation object hashは別物である。

Report directories:

- `.local/postflop-ai/mw3/gates/utg-btn-bb-mw3-srp-v1/v1-3effc9977afa-4ec6b527f8e2-92b946dfc5c8-d89bb2631ca4/`
- `.local/postflop-ai/mw3/gates/utg-co-bb-mw3-srp-v1/v1-4ca502b9b4c2-4ec6b527f8e2-92b946dfc5c8-b216e439bce6/`

## 構造・安全class・実保存mix

両経路ともflop33 nodes・96具体contexts・10,665 rules（297 fallback）、later84 nodes・1,113具体contexts・50,841 rules（756 fallback）。全117 nodesに9tier fallback。Priority100には7selectorを全て明示し、各contextはflop12 textures / later5 textures×9tierが完全。合法action集合、頻度整数・sum100、selector重複の問題0。

保存all-flopsは各1,755 boards、source combo-context数39,503,160 / 37,260,900。構造error、明示selector gap、raw warningは全て0。Laterは各236 actual boards（turn45 / river191）、同じくerror/gap/raw warning0。

これは全幾何学contextとsource-supported combo tierの構造監査であり、**保存policy historyを経たjoint reachの証明ではない**。236 later boardsも全turn/river組合せの総当たりではなく、代表flopから得るrunout texture標本である。

- 全absolute_nuts facingはfold0。River current nuts facingもfold0。
- board_lockedはcheck/call100、fold/bet/raise0。board_sharedはbet/raise0で、共有boardをprivate value扱いしない。
- current nutsの最大foldはflop5%・turn8%。Classifier4の将来no-loss certificateが成立するabsolute_nutsとは区別される。Certificate陰性を「将来必ず負け得る」の証明として説明しない。同着の可能性も残る。
- 全3→2 contextでoriginal roleを残す。例としてBTN経路のturn blank / strong / deep / aggressorで、元middleのUTGは現在firstならcheck46 / bet33:33 / bet75:21、現在lastならcheck40 / bet33:37 / bet75:23。残2人をHU profileへ切り替えない。
- 受け側も保存mixを直接使う。HU defence、MDF floor、EV補正、警告件数へ合わせたfrequencyの自動補充はない。

実dry_high初動（各bet125は下表の例では0）:

| 条件 | UTG → BTN → BB | UTG → CO → BB |
| --- | --- | --- |
| BB monster | check79 / bet33:6 / bet75:15 | check80 / bet33:6 / bet75:14 |
| UTG strong、BB check後 | check41 / bet33:44 / bet75:15 | check44 / bet33:41 / bet75:15 |
| 最後席air、2check後 | check90 / bet33:8 / bet75:2 | check93 / bet33:6 / bet75:1 |

BBのlead、UTGのc-bet、最後席のstabが別に保存され、より狭いCO flat側のair/medium抑制も反映されている。各180 flop anchorの保存bet総量一致を確認した。これだけで各hand/contextの最適頻度を証明するものではない。

## 共同防御：36警告ずつを残す

各代表12flop×3初動位置×3bet size=108 events。90 eventsは各20,000合法tuples、計1,800,000 accepted samples。18 eventsは保存bet支持0で、BB bet125の全12件とpaired flopでUTG/最後席bet125各3件。欠損eventを無言で除いたものではない。

| Bettor / size | BTN経路 overfold / overcontinue / 警告なし | CO経路 overfold / overcontinue / 警告なし |
| --- | --- | --- |
| BB 33 | 1 / 0 / 11 | 0 / 0 / 12 |
| BB 75 | 0 / 1 / 11 | 0 / 2 / 10 |
| UTG 33 | 4 / 0 / 8 | 3 / 0 / 9 |
| UTG 75 | 2 / 0 / 10 | 1 / 0 / 11 |
| UTG 125 | 8 / 0 / 1 | 8 / 0 / 1 |
| 最後席 33 | 6 / 0 / 6 | 7 / 0 / 5 |
| 最後席 75 | 5 / 0 / 7 | 6 / 0 / 6 |
| 最後席 125 | 9 / 0 / 0 | 9 / 0 / 0 |

両方の最大deficitは **Ks8d3c（[47,25,4]）、BB check → UTG check → 最後席 bet33**。

| 指標 | BTN経路 | CO経路 |
| --- | --- | --- |
| 共同続行 | 41.1279460% | 40.8065545% |
| 参考MDF | 75.1879699% | 75.1879699% |
| 差 | −34.0600239pt | −34.3814154pt |
| 保存99.9% Hoeffding区間 | 39.7494593–42.5064327% | 39.4280678–42.1850412% |

これは通常のsampling noiseで消える差ではない。既存CO→BTN→BBの44.6708900%、HJ→BTN→BBの43.0757705%、HJ→CO→BBの41.8584280%という同一eventの弱点が残り、今回UTG経路ではさらに低い。大きいbetだけの問題として説明しない。

実保存medium防御もこれに整合する。Dry high / bet33 facing / deep / cold / standardで、BBが3人behindのときfold/call/raiseは82/18/0と84/16/0。そのBBがfoldし、UTGが2人closing・現在firstとなると61/38/1と63/36/1。初回33% betへのrake後call priceは約20.926%で、cheapではなくstandard bucketである。Bucket取り違えを原因とする症状ではない。

OvercontinueはBB bet75で、BTN経路のTh9h8cは74.0351750%（差+16.8923179pt）。CO経路はTh9h8cで73.0729170%（+15.9300599pt）、KcKd4hで73.2864640%（+16.1436069pt）。いずれも参考MDF57.1428571%。

Joint診断は実際の保存betと先行checkで条件付け、同一合法3人tuple内の逐次fold確率を積にしている。独立に平均したfold率の積ではない。元3参加者のうちfold済みの札もblockerとして残すが、外側3席のfold条件は扱わない。

MDFはrake非考慮の参考 `P/(P+new wager)` であり、各handへのcall目標、均衡防御、任意のbluffのEVではない。区間もevent単独で、90件全体の同時99.9%保証ではない。仕様はこの逸脱をwarning扱いとするため、具体的な弱点を明記して限定estimateとして受け入れる。均衡的な防御を必要とする用途には不十分。Flop最初のbet以外、raise後、turn/river、全1,755flopのjoint防御を検査済みとはしない。

## Source集中とconnector説明のerrata

| Source | Weighted combos / positive hand classes | 22–JJ mass | 代表12boardでの最大単一hand-class比率 |
| --- | --- | --- | --- |
| UTG open（共通） | 212.5 / 49 | 21.882% | 6.639% |
| BTN flat vs UTG | 93.7 / 35 | 34.578% | 8.073% |
| BB overcall UTG/BTN | 199.4 / 53 | 24.824% | 4.814% |
| CO flat vs UTG | 68.8 / 29 | 42.733% | 8.763% |
| BB overcall UTG/CO | 186.1 / 51 | 25.148% | 4.480% |

自分のpreflop frequency×合法combo数によるmarginal質量で、最大比率だけboard blockerを反映した。他席のholecardsやpostflop historyに条件付けた値ではない。12board全てでpositive hand-class数は維持される。CO callerはBTNより狭くpair-heavyだが、8handしかない最狭SBのようなsourceではない。

保存joint summaryにはper-hand conditional massやeffective supportがない。したがって、特定bet/raise履歴のjoint rangeが少数handへ集中しないことを全て確認したとは言えない。Coarse tierに依存するこの限界を残す。

### 必須の説明訂正（この文書で明記、原recipe bytesは保持）

1. UTG→CO→BB profileのrationaleとlast-role notes、既存author設計文書の「COはsuited-connector flatsなし」は広すぎる。**CO_vs_UTGはJTs50%、QJs65%、KQs60%をcallする。** JTsだけで2.0 weighted combos、全CO flatの約2.907%。AKs10%もある。ここで不在なのは **T9s以下の非broadway suited connectors** であり、JTsはbroadwayに含む。
2. HJ_vs_UTGもJTs45%、QJs60%、KQs55%、AKs10%をcallする。「JTs以下を非broadway SCとする」先の説明自体が不正確だった。これらの保存支持を無視しない。
3. SBやnonblind overcallerについても「全suited connector不在」と「T9s以下不在」を混同しない。実例: SB_vs_HJ_BTNcallはKQs50%・AKs20%、BTN_vs_HJ_COcallはKQs60%・QJs40%・AKs30%、CO_vs_UTG_HJcallはKQs50%・AKs30%。最狭SBにもAKs30%がある。各経路の実positive-support手札を優先する。
4. 横断的な補助確認として、新15profileの全45 role support配列を現在の実sourceと照合し、完全一致を確認した。誤ったconnector説明によってsource手札が脱落した事実はない。これは未生成・未レビュー経路の品質受入れではない。

**数値再authorを要求しない理由:** 今回COのJTsは実range、fingerprint、profile supportに含まれ、全board auditとself-playのsourceにも含まれる。Last-role dry_high drawのbetは21%、wet_low drawは22%の保存anchorを持ち、drawを一律0にしたり、JTsを対象外扱いしたりしていない。COの下位connectorの少なさ、pair密度、BTNに比べたdraw/air抑制という限定的説明は実sourceと整合する。抽象tier頻度の最適性は未証明だが、誤文だけから特定の頻度を変更すべき根拠は得られない。未生成の他経路についても、今回のsource-support照合だけでanchor変更を要求する具体的欠陥は見つけていない。

原profileのrationaleは**誤りを含むhistorical rationale**として保持し、今後の説明・結果要約ではこのerrataを優先する。将来recipeそのものを編集する場合は新identityとして扱い、古いcandidate/reportへ新recipe hashを付け替えない。

## 自己対戦とreplayの独立会計確認

各12board×10,000=120,000 hands。全board順とdesign/holdout区分、sample/seed、勝数+tie=10,000、action上限、終端数、rake範囲、各boardのstack+rake=3,005,000BBを独立Pythonで確認した。

| 指標 | UTG → BTN → BB | UTG → CO → BB |
| --- | --- | --- |
| BB wins | 29,930 | 29,940 |
| UTG wins | 41,842 | 40,397 |
| 最後席 wins | 44,961 | 46,264 |
| Ties | 3,267 | 3,399 |
| Fold terminals | 52,487 | 49,218 |
| All-inを経験したterminals | 2,479 | 2,234 |
| 総rake（BB） | 85,102.9194999913 | 82,084.94349999182 |
| 最大board chip集計絶対誤差（BB） | 1.19209e−7 | 1.22469e−7 |

Fold terminalとall-in経験は重複可能。両者を足して手数と比較しない。全量replayはMATCHで、対象simulation object hashも一致した。これは**同じengineによるdeterministic replay**であり、独立solver、独立showdown evaluator、独立アルゴリズムでの全hand再評価ではない。会計の別実装チェックと、戦略の最適性は別である。勝数・rake・完走数も戦略の強さを証明しない。

## 後工程への条件

- 今回2候補の限定受入れ以外、別経路をaccepted/supportedへ進めない。個別source/geometry/original roles、同じ全量gate、独立reviewを維持する。
- Coarse hand tiers、board_shared内の役の強弱差、kicker/blocker/draw qualityの圧縮、履歴の圧縮、限定later/joint標本、外側forced-fold conditioningなしを残余限界として示す。
- 大きな共同overfoldは継続する品質リスク。自動MDF補充やHU copyを加えず、将来改善するなら新しいauthor判断と対応する証跡として扱う。
- 本reviewはsource/profileの読取りと保存reportの照合のみ。Consumer統合、HU不変性の最終回帰、tests/typecheck/build、実Range/Agentのflop→riverブラウザQAは別gate。ブラウザのsecurity-policy blockerや別途準備したMac QA archiveを、この品質受入れで解除・合格扱いしない。
- Archive/LFSの現物送信・復元、承認receipt、公開registry、D1・本番公開も別承認を維持する。

**結論: 両方とも警告と上記errataを伴う限定AI estimateとしてACCEPTABLE。方針頻度の必須修正はなし。公開・均衡品質のGOではない。**
