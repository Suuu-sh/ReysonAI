# 3人ポストフロップ段階1：HJ / SB-first・nonblind の独立品質レビュー

更新: 2026-10-04 22:58 UTC。対象profileをauthorしていない独立Astra reviewerによる実保存物の確認。

## 判定

| 保存候補 | 独立判定 | 数値・構造の必須修正 | 共同警告 |
| --- | --- | --- | --- |
| HJ_open_BTN_call_SB_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 32（overfold31 / overcontinue1） |
| HJ_open_CO_call_BTN_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 39（overfold37 / overcontinue2） |

この受入れはsource・実保存mix・完成gateの整合と安全条件を確認した判断であり、**均衡性、GTOへの近さ、最適性、利益、実戦相手への頑健性を認めない**。両方ともJs8s5d・2check後のBTN125% betに大きくoverfoldし、共同続行は16.49% / 11.62%しかない。小さいbetへの弱点も残る。警告数だけで既存経路より良い・悪い、問題が解消したとは結論しない。

HJ→CO→BTNは今回初めて品質受入れする**nonblind-only**経路。HJ openerがfirst、CO first callerがmiddle、BTN overcallerがlastであり、blind-first候補の承認や役割を流用していない。99 positive joint events / 9支持0は、この役割差を反映した正しいinventoryである。Blind-firstの90 / 18へ揃えない。

Historical rationaleの「connectorsなし」は下記errataを必要とするが、実支持の欠落やdraw一律排除はなく、この誤文だけを理由に頻度再authorは要求しない。Recipe-pinned profile・candidate・reportは保持する。公開 `MW3_APPROVED_POLICIES` は空、metadataは `candidate_pending_independent_review` のまま。本書はLFS実体、receipt、strict local D1、実ブラウザQA、公開registry、本番反映の承認ではない。

## 独立確認の方法と境界

- 保存候補4本＋完成report10本の**全14ファイル**を、それぞれのraw bytes長・SHA-256でproof inventoryと照合。両gate完了後にも全14本を再照合した。
- 現在の3 preflop source spot、実seat順、dead blinds、pot/stack、sizing/rake、classifier4からsource materialをPythonで再構成。Profile・stable-source inventory・候補と一致した。両経路全6sourceのpositive support配列とweighted combosも実sourceから独立照合した。
- 選択profile＋context-judgments＋emit＋registryの4-file recipe、semantic13ファイル、generic verification8ファイルを現物文字列からhashし、一致を確認した。
- **全120,411 rules**を、一度に大きいpolicyを1本だけ読み、117-node grammar、合法action集合、整数0–100・sum100、重複identity、7selector domain、全nodeの9tier fallback、全具体contextのtexture×9tierについて検証。各180のflop residual-tier初動anchorも保存bet総量と一致した。
- 全original roleと現在position、absolute/current nuts、board安全tierを確認。SB/nonblindのcontext差をpot・cent丸め・SPRから具体的に検討した。
- 各108 joint eventsを欠落・重複なく照合し、20,000 accepted samples/event、支持0理由、cent丸め後MDF、確率・差・区間・警告を再集計。支持0は該当初動の全9tierで保存bet125が0であることも確認した。
- Laterの選出規則を軽いPythonで再構成し、**236 actual boardsの完全な配列・順序**を両reportと照合。各turn45 / river191。
- 24board・計240,000 handsの保存simulationについて、別Pythonでboard順・design/holdout・seed・sample・勝敗・action/terminal・rake/stack会計を確認。両replayが参照するexact simulation object hashも再計算した。

**Node、npm、tests、esbuild、policy compile、geometry probe、all-board audit、joint sampling、simulation/replayは本reviewでは起動していない。** 保存実gateを検証したことと、reviewerが実gateを再実行したことを混同しない。全chip-state witnessは、spot固有witnessをreplay検証するemitterの読取確認と同identityの完成gateに依拠する。全stateの独立再探索や、全handの別showdown evaluator評価ではない。

HJ→BTN→SB gateは22:40:56 UTC、HJ→CO→BTNは22:51:39 UTCに完了。後者のreport受入れは完成通知と完成inventory到着後。読取対象local HEADは `d26b10eac581febbd1e85815fbd6483a288e4955`、treeは `4b1d4ee946ffc062134e4caa34a45b5d3d877096`。本reviewはlocal exact bytesを保証範囲とし、手元にないremote commit objectの独立確認は主張しない。Semantic13 / verification8のhash一致が数値証拠の再利用根拠であり、このHEADで全量gateを再走したという表記ではない。

## 固定identityと実ファイル

共通: 100BB、2.5BB open、2人call、各残stack97.5BB、5% rake・cap3BB。外側でfoldする3席のholecardsとfold条件は未モデル化。

| 項目 | HJ → BTN → SB | HJ → CO → BTN |
| --- | --- | --- |
| Original first / middle / last | SB / HJ / BTN | HJ / CO / BTN |
| Semantic first / middle / last | second caller / opener / first caller | opener / first caller / second caller |
| 開始pot / 外側dead blinds | 8.5BB / BB 1BB | 9BB / SB 0.5BB＋BB 1BB |
| Source | `380bee458c9d5e112d268dab4e0d4ef201a45a58babe78234c5e6af0c91f6235` | `278b706399c3efc7907abdc072b0060e2f40e188cb6b4fa05a633544ef86080d` |
| Recipe | `dd65eb138113527256fba1932130f53aab47337d41820fca779165fd572597ad` | `dd0aceb21f102ef7cc5013f5bf801b445f9d1ecdb7f0fd0b26012b04e53b72e1` |
| Flop policy | `2b74e501f33fb5713bca56c692ff5834ace14ac146dbbe8dc73fbdc4cf3156e5` | `4d70d9c413145446820b4c528c98dad9f3b87f7968230bc4e7ac5b29c98645de` |
| Later policy | `2bcb06e852bc7de9a4dcf47b37016be0fea2d413e925971a921d0131d22b3234` | `c6c3a9dbba07d11d6ae3534f6c580fc7c5aa0c7ebc6094a3bd5eab80794e590c` |
| Replay対象simulation object | `fd044bf499be79ee5f98db09e47ca6a222929632f1b286e8e3cdca65239afbbc` | `6b7070ac1d5b2155015c889b02515628057ecbb2401170ef5e9eabf2a64d5a90` |

共通implementation: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`。

共通verification: `92b946dfc5c87359dcb3e610e832e262c2d3ac366110f295968eca2f7392c088`。

Metadataはschema3、model `gpt-6-astra`、strategy `ai_estimate_not_gto`、author version1。Author taskは `mw3-hj-btn-sb-mw3-srp-v1-authored-v1` / `mw3-hj-co-btn-mw3-srp-v1-authored-v1`。各flop/later共通generated_atは `2026-10-04T22:32:52.410Z` / `2026-10-04T22:43:53.267Z`。

### Raw bytesとSHA-256

Inventoryは `.local/postflop-ai/mw3/remaining-thirteen-run-v1/HJ_open_BTN_call_SB_call.proof-inventory.json` と `HJ_open_CO_call_BTN_call.proof-inventory.json`。下表はinventoryの結論を採用しただけでなく、各pathの現物14本を独立にhashした値。

| ファイル | HJ → BTN → SB bytes / raw SHA-256 | HJ → CO → BTN bytes / raw SHA-256 |
| --- | --- | --- |
| Flop candidate | 2,485,682 / `de43414dd2986a182f241d686857fd6be0805237b17dede25b21c330f05482e2` | 2,251,477 / `bcf532047d39f1a45ce1dcbfa283d506075dd4f01538826fa0c1a6b8439fcdb5` |
| Later candidate | 12,162,258 / `d7655c789015d05fba56b525e09f6b4dde40cac9d4690ce3cb7111adc3e0ec28` | 12,024,624 / `23dfe0e6bae0748de9ca0efc73606599252301021eb1fff2cc0162069823cefa` |
| all-flops | 1,005 / `b5f25c9c269d3916ad9d5bf144e9ee21b9e23a2e0df010cd7f8aaeddc73cb770` | 1,005 / `967d7482e8c5b10621a74b2d1c5ef312d38cbb05899588befa31edb4bd043000` |
| later-runouts | 23,508 / `cff6bac2f9a17049f2896454f45c3739899fc35611a20aff99184cad1ac0e9e9` | 23,508 / `e20dbb1baca18153c2b9c438c90dd0ed7754f921dc95e9e4a5ae0893d6100451` |
| joint-defence | 80,498 / `cff4fa581277f0f072f4ac4d0bc973a3f0923a9e1c87b9ecb4b9fce499de7bf9` | 87,212 / `4161977d9e822faf695ae401e617924471b1c6b7d3756c9d715de4509c64f567` |
| simulation | 9,173 / `d49d1ac6a4ec75d47137af572eb2bad7d8393e95f7b005f5b1ca233019c9cebc` | 9,198 / `e5cffc126da8eb61151dad76654241f8ff3d1d0adc0d64b03367d35e696be423` |
| simulation-replay | 817 / `5ae480a67c55693b414d37ddbfc17f73e94e484ccb0fd4b5d8ac970b059e6166` | 817 / `97c7b346f6006971f70cd39526c263290e68e5ab376c0aa316b3e10656a7c364` |

Raw file hash、内側policy hash、simulation object hashは別物。Report directories:

- `.local/postflop-ai/mw3/gates/hj-btn-sb-mw3-srp-v1/v1-380bee458c9d-4ec6b527f8e2-92b946dfc5c8-dd65eb138113/`
- `.local/postflop-ai/mw3/gates/hj-co-btn-mw3-srp-v1/v1-278b706399c3-4ec6b527f8e2-92b946dfc5c8-dd0aceb21f10/`

両reportの全236 `results[].board` を順にcompact JSON化した配列hashは `a62aff1544632fa489e8caffe67487ff0e650e08427cb124b7d1d080213fa936`。完全なactual board一覧は上記各 `later-runouts.json` に保持されている。生成規則まで別途再構成して照合し、単に両report同士が同じと確認したものではない。

## Nonblind固有geometry・全context・安全tier

| 構造 | HJ → BTN → SB | HJ → CO → BTN |
| --- | ---: | ---: |
| Flop nodes / concrete contexts / rules | 33 / 92 / 10,233 | 33 / 83 / 9,261 |
| Turn contexts / rules | 482 / 22,068 | 475 / 21,753 |
| River contexts / rules | 629 / 28,683 | 623 / 28,413 |
| Later nodes / contexts / rules | 84 / 1,111 / 50,751 | 84 / 1,098 / 50,166 |
| Flop source combo-context count | 36,748,533 | 30,808,767 |

両方とも全117 nodesに9tier fallback（flop297 / later756）。Priority100は全7selectorを明示し、各contextにflop12 / later5 textures ×9tierが完全。全1,755flopと236laterでerror・gap・raw warningは0。

これは**幾何学context × source-supported combo tier**の構造監査であり、保存policy historyを経たjoint reachの証明ではない。Later236は全turn/river組合せの総当たりでもない。SBは合計1,203 contexts、nonblindは1,181で、48 SB-only / 26 nonblind-only。9BBに8.5BBのcontextをコピーしたものではない。

具体例: 初回33% betに3倍raiseが入り、cold responderにまだ他の応答席が残る場合。SB geometryではwager2.81・raiseTo8.43BB、call後pot28.17・残89.07、SPR **3.1618743（deep）**。Nonblindではwager2.97・raiseTo8.91、call後pot29.79・残88.59、SPR **2.9738167（medium）**。実保存の各role `vs_raise1_behind / cold / standard` にこの差が反映されている。全witnessをPythonで再探索したという意味ではない。

初回33/75/125% wagerはSB **2.81 / 6.38 / 10.63BB**、nonblind **2.97 / 6.75 / 11.25BB**。参考MDFはSB **75.1547303 / 57.1236559 / 44.4328280%**、nonblind **75.1879699 / 57.1428571 / 44.4444444%**。33%へのrake後call priceは20.9482630 / 20.9258085%で、両方standard bucket。PriceやSPRをblind経路から無条件に転記していない。

- 全absolute_nuts facingとriver current nutsでfold0。Current nutsの最大foldはflop5% / turn8%。Classifier4の将来no-loss十分条件と現在nutsを分離し、certificate陰性から将来敗北可能を断定しない。Absoluteでもtieはあり得る。
- board_lockedはcheck/call100、fold/bet/raise0。board_sharedはbet/raise0。Board-onlyとprivate valueを混同しない。
- 3人時は現在positionと元roleが一致。3→2後は元firstはfirst、元lastはlast、元middleだけfirst/lastとなり、全具体ruleで整合。HU profileへ切り替えない。
- 元middleのturn blank / strong / aggressor / deep / 残2人では、SB経路のHJは現在firstでcheck57/bet33:27/bet75:16、現在lastで51/30/19。NonblindのCOはfirstで51/30/19、lastで45/34/21。同じmiddle名でもsource/semantic/現在positionを保持する。
- **残った相手のoriginal roleは常に別selectorではない。** `mw3PolicyContextKey` と `selectMw3Rule` は自分のoriginal roleを含むnode＋line・人数・現在position・response・price・SPR・textureを見るが、相手が元middleかlastかを直接keyに持たない。例えばnonblindで「HJ check → CO bet33 → BTN fold → HJ call」と「HJ check → CO check → BTN bet33 → HJ call → CO fold」は、ともに次turnのHJが元first・現在first・2人・defender、pot14.94BB・残94.53BBのdeep contextへ合流する。同じturn texture/tierなら同じ保存mixを使う。Runtimeの生存seat/sourceとjoint tupleは別に保持されるが、policyはこの相手別差を解いていない。これは明示的なcontext-bucket抽象化の限界であり、正確な相手別joint reachや最適応答を得たとは主張しない。本reviewはschema拡張・数値修正を要求しない。
- 受け側も保存mixを直接使用。HU defence、MDF floor、EV補正や警告件数を目標にしたfrequency修復はない。

### 実保存頻度と役割の判断

Dry high初動、表中のbet表記は33 / 75 / 125の順。

| 元role / hand tier | HJ → BTN → SB | HJ → CO → BTN |
| --- | --- | --- |
| First monster | SB check73 / bet8・19・0 | HJ check43 / bet17・34・6 |
| First strong | SB check91 / bet7・2・0 | HJ check60 / bet30・10・0 |
| Middle strong、1check後 | HJ check52 / bet36・12・0 | CO check73 / bet22・5・0 |
| Last air、2check後 | BTN check91 / bet7・2・0 | BTN check94 / bet5・1・0 |

Nonblindのopener HJ firstはblind donkより明確にbetし、caller CO middleのprobeはc-betより慎重でsmall-size寄り。Tight BTN overcallerのair stabもwide first-flatから移植していない。一方、betしている割合の大小だけで適切性・value/bluff balanceが証明されるわけではない。Shared author context priorsによる展開であり、全contextを別々に最適化したsolver出力ではない。

Dry high / 33 facing / cold / standard / deepのmedium防御は、元first・3人behindでSB fold72/call27/raise1、nonblind HJ fold78/call22/raise0。元firstがfoldし、元middleが残2人closing・現在firstになるとHJ fold68/call32、CO fold63/call37。実mix自体が防御の薄さを示しており、構造PASSを防御品質良好と解釈しない。

## 共同防御：32 / 39警告を残す

各12代表flop ×3初動位置 ×3size =108 events。SB経路は90 events ×20,000 =1,800,000 accepted tuples。Nonblindは99×20,000 =1,980,000。合計3,780,000 accepted samples。Reviewerが再samplingしたものではなく完成reportの検証値。

- SBの18支持0: SB firstのbet125全12board＋paired3boardでmiddle/last各bet125。
- Nonblindの9支持0: paired3boardでfirst/middle/last各bet125。HJ firstの非paired bet125には支持があるため、blind-firstの12件を誤って除外していない。
- 全支持0は全9tierの該当保存bet125が0であることに整合。Reasonは全て `No policy-supported mw3 range at this history`。欠落eventや失敗したsamplingを隠したものではない。

| 元bettor / size | SB経路 overfold / overcontinue / 警告なし | Nonblind overfold / overcontinue / 警告なし |
| --- | --- | --- |
| First 33 | 5 / 0 / 7 | 1 / 0 / 11 |
| First 75 | 4 / 0 / 8 | 0 / 2 / 10 |
| First 125 | 支持0：12 | 5 / 0 / 4 |
| Middle 33 | 2 / 0 / 10 | 1 / 0 / 11 |
| Middle 75 | 1 / 1 / 10 | 1 / 0 / 11 |
| Middle 125 | 7 / 0 / 2 | 8 / 0 / 1 |
| Last 33 | 2 / 0 / 10 | 6 / 0 / 6 |
| Last 75 | 2 / 0 / 10 | 6 / 0 / 6 |
| Last 125 | 8 / 0 / 1 | 9 / 0 / 0 |

両方の最大deficitは **Js8s5d（[39,27,13]）、2check後BTN bet125**。

| Worst指標 | HJ → BTN → SB | HJ → CO → BTN |
| --- | ---: | ---: |
| 共同続行 | 16.4908400% | 11.6168015% |
| 参考MDF | 44.4328280% | 44.4444444% |
| 差 | −27.9419880pt | −32.8276429pt |
| 保存99.9% Hoeffding区間 | 15.1123533–17.8693267% | 10.2383148–12.9952882% |

**Ks8d3c・2check後BTN bet33**もSB49.5033280%（差−25.6514023pt、区間48.1248413–50.8818147%）、nonblind45.4322020%（差−29.7557679pt、区間44.0537153–46.8106887%）。同boardの75 / 125%への共同続行はSB35.2107590 / 17.0844765%、nonblind29.8678730 / 13.5790735%。大きいbetだけの問題ではなく、通常のsampling noiseで消える差でもない。

OvercontinueはSB経路でTh9h8c、SB check後HJ bet75の73.6309470%（+16.5072911pt）。NonblindはHJ first bet75でTh9h8c73.3027450%（+16.1598879pt）、KcKd4h73.2556475%（+16.1127904pt）。

診断は先行checkとbettorの実保存betで条件付け、同一合法3人tuple内の逐次fold確率の積を平均する。独立に平均したfold率の積ではない。元参加者のfold済み札はblockerとして残すが、外側3席のfold条件は未モデル化。区間はevent単独で、90 / 99件同時の99.9%保証ではない。

**品質判断:** 実質的なoverfold弱点が残る。MDFはrake非考慮の `P/(P+new wager)` によるadvisoryで、各handの適正call率、均衡防御、any-two bluffのEVを確定しない。仕様のwarning契約に従い、弱点を明示した限定estimateとして受け入れる。均衡的防御を要する用途には不十分。自動MDF補充やHU防御移植はしない。初回flop bet以外、raise後、turn/river、全1,755flopのjoint防御まで検査済みとはしない。

## Source集中と必須の説明errata

| Source | Weighted combos / positive classes | 22–JJ mass | 代表12boardで最大の単一class marginal比率 |
| --- | --- | ---: | ---: |
| HJ open（共通） | 312.0 / 64 | 18.269% | 4.593%（AhKh4h、QJo） |
| BTN flat vs HJ | 121.6 / 49 | 30.839% | 6.235%（Th9h8c、AJo） |
| SB overcall HJ/BTN | 34.6 / 14 | 42.486% | 17.082%（Th9h8c、AQo） |
| CO flat vs HJ | 83.1 / 38 | 38.628% | 6.639%（Th9h8c、AQo） |
| BTN overcall HJ/CO | 45.0 / 18 | 36.000% | 12.229%（Th9h8c、AQo） |

自分のpreflop frequency×合法combo数によるmarginal質量。最大比率だけboard blockerを反映し、他席holecardsやpostflop historyには条件付けていない。12board全てで各sourceのpositive class数は維持される。SB・BTN overcallerの集中が強く、coarse tier誤差がrange全体に効きやすい。保存joint summaryにはper-hand conditional mass / effective supportがなく、bet/raise後に少数handへ集中しないことを全面的に確認したとは言えない。

HJのSB overcall34.6/14は先行CO経路の37.2/16と別source。77とKJsが50→0になり、AQs35→45、AKo15→25、QQ20→25、JJ35→45、TT50→60等も違う。SBのpair支持は**88–AA**、88–JJ42.486%、QQ+9.538%、pair合計52.023%。Nonblind BTN overcallは77–JJ36%、QQ+9.333%で、first-flat BTN121.6ともSB34.6とも異なる。

### 必須の説明訂正。原recipe bytesは保持

1. HJ→BTN→SB rationaleの「No SB 22–66 or connectors」は、全suited連結手の不在として読めば誤り。**SB_vs_HJ_BTNcallはAKs20%、KQs50%をcall**する。QJs / JTs / T9s以下は0。22–66だけでなく77も0。AQs45%、AJs55%、ATs50%もあり、suited draw供給を一律0としない。
2. HJ→CO→BTNのlast notesにある「no small pairs/connectors」も広すぎる。**BTN_vs_HJ_COcallはAKs30%、KQs60%、QJs40%をcall**する。JTs / T9s以下は0、22–66も0だが77は45%。このBTNを広いfirst-flatとも、全suited connector不在とも説明しない。
3. CO_vs_HJ first callerはJTs55%、T9s45%、98s30%を含む。狭いBTN overcallerの説明をCO sourceへ持ち込まない。全6sourceのpositive支持はprofileに脱落なく収録されている。
4. これらのhandは実source、fingerprint、profile、gateの対象に含まれる。SB firstのdry_high / wet_low draw betは8 / 14%、nonblind BTN lastは22 / 23%。Drawを一律排除していない。誤文から特定頻度の修正が必要だとする具体的根拠は見つからなかった。

本errataを今後の説明・要約で優先する。Historical rationale自体は誤りを含む履歴として保持し、recipe/candidate/reportを書き換えて既存証跡を再表示しない。将来recipeを変更する場合は新identityと必要なgateを用いる。

## 240,000 handsの会計とreplay

各12board×10,000 =120,000 hands。全board順、design/holdout、sample/seed、wins+ties、action上限、fold/all-in終端、rake上下限、final stacksを独立確認。SB経路の開始総chipsは301BB/hand、nonblindは301.5BB/handであり、各boardのstack+rake目標は**3,010,000 / 3,015,000BB**。

| 指標 | HJ → BTN → SB | HJ → CO → BTN |
| --- | ---: | ---: |
| Original first wins | SB 46,941 | HJ 33,753 |
| Original middle wins | HJ 33,976 | CO 33,697 |
| Original last wins | BTN 35,621 | BTN 49,095 |
| Ties | 3,462 | 3,455 |
| Fold terminals | 43,307 | 51,068 |
| All-in経験terminals | 2,122 | 2,872 |
| 総rake（BB） | 85,872.58600000905 | 95,317.67649999358 |
| 最大board chip集計絶対誤差（BB） | 1.5925616e−7 | 1.6437843e−7 |

Fold terminalとall-in経験は重複可能なので足してhand数と比較しない。両方の全量replayはMATCHで、対象simulation objectのexact hashも一致。これは**同じengineによるdeterministic replay**であり、独立solver・独立アルゴリズム・別評価器による全hand再評価ではない。別実装の集計会計検証、勝数やrakeも、戦略の強さ・利益・GTO精度を証明しない。固定12boardは自然なflop確率で重み付けしたものでもない。

## 後工程と残余限界

- 今回2候補だけの限定受入れ。既存7経路の受入れと合わせても未review経路へ延長しない。残り各source・geometry・元role・全量gate・独立reviewを維持する。
- 粗いtier内のkicker/blocker/draw quality、board_shared内の役の差、履歴圧縮、限定later/joint標本、外側fold条件なしを残す。構造coverageとpolicy joint reach、保存mixと均衡性を区別する。
- Nonblind last125の9 / 9 overfold、両経路のsmall-bet deficit、tight source集中は将来のauthor改善対象になり得る。改善は新author判断と対応する新証拠として扱い、自動frequency repairを入れない。
- Range/Agentのflop→river実ブラウザQA、HU不変性の最終統合回帰、tests/typecheck/build、LFS実体送信・復元・receipt、strict local D1、公開registry、本番承認は別gate。本reviewはcloud URL security-policy blockerを回避しておらず、private Mac QA bundleをQA済みと扱わない。D1 detached-child修正も本書で承認しない。
- 本reviewが書いた成果物はこの文書だけ。Source、数値、metadata、recipe、registry、receipt、元report、他者の変更は編集していない。

**結論: 両候補とも警告とerrataを伴う限定AI estimateとしてACCEPTABLE。数値・構造の必須修正なし。公開・均衡品質のGOではない。**
