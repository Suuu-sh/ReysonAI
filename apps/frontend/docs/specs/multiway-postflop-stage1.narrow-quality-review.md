# 3人ポストフロップ段階1：UTG / HJ / BB・CO / BTN / SB の独立品質レビュー

更新: 2026-10-04 22:26 UTC。対象profileをauthorしていない独立Astra reviewerによる実保存物の確認。

## 判定

| 保存候補 | 独立判定 | 数値・構造の必須修正 | 共同警告 |
| --- | --- | --- | --- |
| UTG_open_HJ_call_BB_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 40（overfold38 / overcontinue2） |
| CO_open_BTN_call_SB_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 27（overfold26 / overcontinue1） |

これはsource・保存mix・実gateの整合と安全条件を確認した限定受入れであり、**均衡性、GTOへの近さ、最適性、利益、実戦相手への頑健性を認めない**。UTG→HJ→BBはKs8d3c・2check後の33% betに共同続行38.82%しかなく、直前のUTG→BTN/CO→BBの約41%よりさらに防御が薄い。SB経路も同じ33% betに51.28%、125% betには17.61%で、大きなoverfoldを解消していない。警告数27を既存BB経路より高品質という証拠にしない。

CO→BTN→SBは今回初めて保存物を品質受入れするSB-first経路。先行5候補は全てBB-firstであり、その受入れをSBへ移植していない。HJとSBのhistorical author rationaleにある「suited connectorsなし」は広すぎるため、下記errataを適用する。実source支持の脱落や、それを根拠にしたdraw一律排除は見つからず、**説明訂正は必要だが、この誤文だけによる頻度再authorは要求しない**。

公開 `MW3_APPROVED_POLICIES` は空、metadataは `candidate_pending_independent_review` のまま。この文書はrelease receipt、LFS実体送信・復元、strict local D1、実ブラウザQA、公開registry、本番反映の承認ではない。

## 独立確認の方法と境界

- 実保存候補4本＋完成report10本の全14ファイルを、raw bytes長とSHA-256で各proof inventoryと照合。
- 現在の3 preflop source spot、実seat順、pot/stack、sizing、rake、classifier4からsource materialをPythonで再構成。両profile・stable-source inventory・候補と一致。
- 選択profile、context-judgments、emit、registryの4-file recipe、semantic13ファイル、generic verification8ファイルを実文字列から別途hash化。
- 全122,490 rulesを、一度にpolicyを1本だけ読み、node grammar、合法action集合、整数0–100・sum100、重複identity、7selector domain、9tier fallback、各具体contextの全texture×tierについて検証。各180のflop残余tier初動anchorも保存bet総量と一致。
- 全original roleと現在positionの整合を確認。全absolute/current nutsとboard安全tierを検証。SBの少ないcontext数をBBの数に合わせず、実geometry依存の差を検討。
- 各108 joint eventの重複なし完全inventory、90×20,000 accepted samples、18の明示的支持0、確率・cent丸め後MDF・差・区間・警告分類を再集計。支持0は全9tierの保存bet125が0であることまで別途確認。
- 236 later boardの選出規則を軽いPythonで再構成し、全actual boardと順序を照合。turn45 / river191。
- 計24board・240,000 handsの保存simulationについて、別Pythonでseed・sample・勝敗・action/terminal・stack/rake会計を確認。両replayが指すsimulation object hashも再計算。

**Node、npm、tests、esbuild、policy compile、geometry probe、all-board audit、joint sampling、simulation/replayはこのreviewでは起動していない。** Source/rule/reportの読取・hash・軽い会計検証のみ。個々のhandを独立solverや別showdown evaluatorで再評価したものではない。全合法chip-state witnessの成立は、読取確認したspot固有witness検証を含むemitterと、同identityの完了gateの証拠に依拠する。reviewerが全stateを再探索したとは主張しない。

UTG→HJ→BB gateは22:15:04 UTC、CO→BTN→SB gateは22:23:11 UTCに完了。SBは最終replay MATCHと終了identityを確認してからreportを読み、完成inventory到着後にraw hashesを照合した。読取対象HEADは `99e16d211d0e56664eff5cba5c87cc254c3804a8`。このHEADで全量gateを再実行したという意味ではなく、実bytesと依存identityの一致が再利用根拠である。

## 固定identity

共通: 100BB、2.5BB open、2人call、残stack各97.5BB、5% rake・cap3BB。外側でfoldする3席のholecardsとfold条件は未モデル化。

| 項目 | UTG → HJ → BB | CO → BTN → SB |
| --- | --- | --- |
| Original first / middle / last | BB / UTG / HJ | SB / CO / BTN |
| 開始pot / 外側dead blind | 8BB / SB 0.5BB | 8.5BB / BB 1BB |
| Source | `3d53be2b1a7c90f5950be69b82850ef81fa535e3442d836368e914fdf55b2862` | `3573dde6357353f3d848b0370205de4cc99ee11ced39267b35e65927bc235e0d` |
| Recipe | `1384b24a402a17611575102fea3c10d572fc0cdc03d0929f12c8b52c9b1b5813` | `30e3416551c935278df47fdf600eeb0e6735e36d7abe3393686a2389b4fd672e` |
| Flop policy | `92cdeb04b45c836e4f6e266bc3b985ef463386544423140ed8a661a60f30c2fc` | `20fb64ba62887d36b0280c0b9c49b87d735713ec70f8797de22d0530654ee2bb` |
| Later policy | `c7039fc8732099fa9d5e2d34eb938fc7e9342baa2c0a3ec789050abe2b3f0840` | `214f4e53cea61b08d0941f6eaf083950eb24eeee95a7cab36f5dd6ba28bc7211` |
| Replay対象simulation object | `f94ec95be3b892e88a0ca979d5ea36356a8fe955f67e6eb6aeb01181a690003e` | `e762d27fac0eff5debd9e716656ab2db11a6d7bb6e0c793a0b03c355ebc74d21` |

共通implementation: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`。

共通verification: `92b946dfc5c87359dcb3e610e832e262c2d3ac366110f295968eca2f7392c088`。

Metadataはschema3、model `gpt-6-astra`、strategy `ai_estimate_not_gto`、author version1。Author taskは `mw3-utg-hj-bb-mw3-srp-v1-authored-v1` / `mw3-co-btn-sb-mw3-srp-v1-authored-v1`。各flop/later共通generated_atは `2026-10-04T22:07:00.252Z` / `2026-10-04T22:15:07.345Z`。

### 実ファイルのraw identity

元inventoryは `.local/postflop-ai/mw3/remaining-thirteen-run-v1/UTG_open_HJ_call_BB_call.proof-inventory.json` と `CO_open_BTN_call_SB_call.proof-inventory.json`。下表はinventoryだけを転記して採用した結論ではなく、現物14本のhash・長さを独立確認した値。

| ファイル | UTG → HJ → BB bytes / raw SHA-256 | CO → BTN → SB bytes / raw SHA-256 |
| --- | --- | --- |
| Flop candidate | 2,588,612 / `8385834e6472a5df72e3fa0403071a5e773205d762bdac2d8e76c0d7bd40bcd4` | 2,485,638 / `3fc706750bde296880afbb450185329de95082453f6665828e9e2b33c41f8581` |
| Later candidate | 12,188,650 / `e5e763f0a2949e0c84911d957ff10a96155b69ab153a11c4d3ea9415ae61c586` | 12,161,873 / `1d2fe3b4ac8e1a3f88a8ce17ef0b032387e74820f27876d37bae6b2d58d8d0f9` |
| all-flops | 1,005 / `9141813c5769e7b416337c24259878a4208866d29d86b603f60262bd7223b52f` | 1,005 / `d1a555396e968c35dc3bcb472125c550ad2fc68f0b0e453f8ec2e57a76fca8d9` |
| later-runouts | 23,508 / `41c3a7d471c201ac4ebd4037d207136bd13e3fc074f9cfc8355468220b83a261` | 23,508 / `33881fd3a28615796b26febcb22a9d1b7062c47189c1aeae684621362a02bc27` |
| joint-defence | 80,594 / `12a44b158847abba0f1de330e480d0d8139770420ecab81bc556196a1a18128a` | 80,417 / `ebaeb785dc4ff872cf54b92baf1f02a4597d9b0c2354f915cd855dc9ae4f89ff` |
| simulation | 9,170 / `a6156a25cb84302b41e702767acf3adc00cb0a450a3cf313137d5a7b5736eb00` | 9,190 / `d166854ab0810c1aedf213e1b862387ed3867704624647e5bcb73cf3e7d4f71a` |
| simulation-replay | 817 / `db69ec084a88784c1df0da41654facd56e4ed8304169a1ebd5101c8779301a81` | 817 / `3851b9bcb3cc911a341a2892fb75294301dc8ab05b1896927344b31ad31a2d7c` |

Raw file hash、内側policy hash、simulation object hashはそれぞれ別物。Report directories:

- `.local/postflop-ai/mw3/gates/utg-hj-bb-mw3-srp-v1/v1-3d53be2b1a7c-4ec6b527f8e2-92b946dfc5c8-1384b24a402a/`
- `.local/postflop-ai/mw3/gates/co-btn-sb-mw3-srp-v1/v1-3573dde63573-4ec6b527f8e2-92b946dfc5c8-30e3416551c9/`

## SB固有geometry・全node/context・安全tier

| 構造 | UTG → HJ → BB | CO → BTN → SB |
| --- | ---: | ---: |
| Flop nodes / concrete contexts / rules | 33 / 96 / 10,665 | 33 / 92 / 10,233 |
| Turn contexts / rules | 476 / 21,798 | 482 / 22,068 |
| River contexts / rules | 637 / 29,043 | 629 / 28,683 |
| Later nodes / contexts / rules | 84 / 1,113 / 50,841 | 84 / 1,111 / 50,751 |
| Flop source combo-context count | 37,072,980 | 42,580,968 |

両方とも全117 nodesに9tier fallback（flop297 / later756）。Priority100は全7selectorを明示し、各contextにflop12 / later5 textures ×9tierが完全。全1,755flopと236laterでerror・gap・raw warningは0。

この構造監査は**幾何学context × source-supported combo tier**で、保存policy historyを経たjoint reachの証明ではない。SBとBBには50のBB-only / 44のSB-only contextがあり、同じnode名でもprice/SPR条件を置換していない。例として初回125% bet後、BB pot8ではbet10、call後pot28、残87.5でSPR3.125（deep）。SB pot8.5ではbet10.63、call後pot29.76、残86.87でSPR2.9190188（medium）。低SPR/all-inへのnode移行を含むcontext集合が変わる。

SBの初回33/75/125% wagerはcent単位で **2.81 / 6.38 / 10.63BB**。対応する参考MDFは **75.1547303 / 57.1236559 / 44.4328280%** であり、BBの75.1879699 / 57.1428571 / 44.4444444%をコピーしていない。初回33%へのrake後call priceもBB20.9258%、SB20.9483%で、いずれもstandard bucket。

- 全absolute_nuts facingとriver current nutsでfold0。現在nutsの最大foldはflop5% / turn8%。Classifier4のfuture no-loss十分条件とは区別し、certificate陰性から敗北可能を断定しない。Absoluteでもtieは可能。
- board_lockedはcheck/call100、fold/bet/raise0。board_sharedはbet/raise0。共有boardとprivate valueを混同しない。
- 3人時は現在positionと元roleが一致。3→2後は元firstはfirst、元lastはlast、元middleだけfirst/lastとなり、全具体ruleで整合。
- 元middleのturn blank・strong・aggressor・deep・残2人の実保存mixは、UTGが現在firstならcheck52/bet33:30/bet75:18、現在lastなら46/33/21。COでは54/29/17と48/32/20。元roleを捨ててHU方針へ切り替えていない。
- 診断もruntimeも保存mixを直接参照。HU defence、MDF floor、EV補正による自動frequency修復はない。

### 実保存頻度の例

Dry high初動。下表の各例はbet125=0。

| 条件 | UTG → HJ → BB | CO → BTN → SB |
| --- | --- | --- |
| First blind monster | check81 / bet33:6 / bet75:13 | check72 / bet33:8 / bet75:20 |
| Opener strong、blind check後 | check46 / bet33:40 / bet75:14 | check50 / bet33:37 / bet75:13 |
| Last caller air、2check後 | check95 / bet33:4 / bet75:1 | check88 / bet33:10 / bet75:2 |
| Blind medium、33 facing・3人behind・cold/deep/standard | fold86 / call14 / raise0 | fold70 / call29 / raise1 |
| Blind fold後、opener medium・残2人closing・現在first | fold65 / call35 / raise0 | fold66 / call34 / raise0 |

UTG/HJ/BBの低board coverage制約、狭いSBのoverpair支持、CO/BTNの異なるsourceを別anchorで扱い、単純seat renameではない。一方、mediumを強くfoldするmixが実共同deficitと整合しており、「構造PASSだから防御も良好」とは解釈しない。

## Joint defence：40 / 27警告の実質

各12代表flop ×3初動位置 ×3size =108 events。90 eventsに各20,000合法3人tuples、各1,800,000 accepted samples。残18は全first-blind bet125の12件と、paired3boardでmiddle/last bet125の6件。全9tierの該当保存bet125が0なので、支持0はsource samplerの不具合や未完eventの欠落ではない。Positive90 eventsのaccepted samplesは完成reportの証拠であり、reviewerが再samplingしたものではない。

| Bettor / size | UTG-HJ-BB overfold / overcontinue / 警告なし | CO-BTN-SB overfold / overcontinue / 警告なし |
| --- | --- | --- |
| First blind 33 | 0 / 0 / 12 | 4 / 0 / 8 |
| First blind 75 | 0 / 2 / 10 | 5 / 0 / 7 |
| Opener 33 | 3 / 0 / 9 | 2 / 0 / 10 |
| Opener 75 | 2 / 0 / 10 | 0 / 1 / 11 |
| Opener 125 | 7 / 0 / 2 | 4 / 0 / 5 |
| Last caller 33 | 9 / 0 / 3 | 2 / 0 / 10 |
| Last caller 75 | 8 / 0 / 4 | 2 / 0 / 10 |
| Last caller 125 | 9 / 0 / 0 | 7 / 0 / 2 |

最大deficitはいずれも **Ks8d3c（[47,25,4]）、blind check → opener check → last caller bet**。UTG経路は33%、SB経路は125%が最悪。

| Worst指標 | UTG → HJ → BB / HJ bet33 | CO → BTN → SB / BTN bet125 |
| --- | ---: | ---: |
| 共同続行 | 38.8168165% | 17.6141775% |
| 参考MDF | 75.1879699% | 44.4328280% |
| 差 | −36.3711534pt | −26.8186505pt |
| 保存99.9% Hoeffding区間 | 37.4383298–40.1953032% | 16.2356908–18.9926642% |

同じKs8d3c・2check後、SB経路のbet33も共同続行51.2782550%、差−23.8764753pt、区間49.8997683–52.6567417%。小さいbetでのdeficitも残る。UTG経路のbet75 / bet125は共同続行25.6827200 / 11.0280725%。大きい差を通常のsampling noiseとして片付けられない。

OvercontinueはUTG経路のBB bet75に2件: Th9h8cで73.9229560%（+16.7800989pt）、KcKd4hで76.1381700%（+18.9953129pt）。SB経路はTh9h8c、SB check後CO bet75で76.1843325%（+19.0606766pt）。

診断は先行checkと実bettorの保存betで条件付け、同一合法tuple内の逐次fold確率の積を平均する。平均fold率を独立に掛けたものではない。元参加者のfold済み札はblockerとして残し、外側3席のfold条件は未モデル化。MDFはrake非考慮の `P/(P+new wager)` という参考値で、各handへのcall目標、均衡防御、any-two bluffのEVではない。区間はevent単独であり90件同時の99.9%保証ではない。

**判断:** 頻度の合法性・source整合・安全tierは成立するが、防御の薄さは実質的な弱点である。仕様上joint偏差はadvisoryであり、この数値だけから具体的handの正しいcall率は得られない。警告を明示した限定estimateとして受け入れ、均衡的防御を要する用途には不十分とする。今回の警告だけを理由に、自動MDF補充、HU mix移植、EV最適化を加えることは認めない。初回flop bet以外、raise後、turn/river、全1,755flopのjoint防御まで検査済みとはしない。

## Sourceの狭さと説明errata

| Source | Weighted combos / positive classes | 22–JJ mass | 代表12boardでの最大単一class比率 |
| --- | --- | ---: | ---: |
| UTG open | 212.5 / 49 | 21.882% | 6.639% |
| HJ flat vs UTG | 56.7 / 27 | 47.090% | 10.647%（Th9h8c、77） |
| BB overcall UTG/HJ | 177.0 / 50 | 19.153% | 4.771% |
| CO open | 389.0 / 78 | 15.424% | 3.645% |
| BTN flat vs CO | 145.8 / 51 | 24.897% | 5.228% |
| SB overcall CO/BTN | 37.2 / 16 | 43.548% | 17.391%（Th9h8c、AQo） |

これは自分のpreflop action frequency×合法combo数によるmarginal質量。最大比率だけboard blockerを反映し、他席holecardsやpostflop historyには条件付けていない。12board全てでpositive class数は維持される。ただしSBでは1classが17.39%を占め得るため、coarse tier内の誤差がrange全体に強く効く。

UTG/HJ側: HJの77–JJは36.508%、22–66は10.582%。BBの22–66は4.746%で、既存UTG/BTN/BBの低pair支持をそのまま期待できない。SB側: 22–66は完全に0、77–JJ43.548%、QQ+8.065%。合わせて51.613%がpocket pair、残り48.387%がbroadway系。SBを「ほとんどpremiumだけ」とも「広いBBの少しtight版」とも説明しない。

### 必須の説明訂正。元recipe bytesは保持

1. UTG→HJ→BB profileのrationale/last notesとhistorical author文書の「HJにはsuited connectorsなし」は不正確。**HJ_vs_UTGはJTs45%、QJs60%、KQs55%、AKs10%をcall**する。JTsだけで1.8 weighted combos、HJ flatの約3.175%。不在なのはT9s以下の非broadway connector側であり、JTsをそこへ含めない。
2. CO→BTN→SBの「zero connectors」も全suited連結手の不在として読めば誤り。**SB_vs_CO_BTNcallはKQs50%、AKs20%をcall**する。QJs/JTs/T9s以下は0、22–66も0。KJs50%、AQs35%、AJs55%、ATs60%もあり、suited draw供給を一律0とはしない。AA/KKは各15%を保持。
3. これらは実source、source fingerprint、profileのpositive-support配列、保存gateに含まれる。両spot全6sourceの支持配列を実positive行と完全照合した。HJ lastのdry_high / wet_low draw初動betは17 / 19%、SB firstは8 / 15%で、説明誤りによるdrawの一律排除はない。
4. 誤文から特定頻度を変更すべき具体的根拠は得られないため、この文書のerrataを優先し、元profile・recipe・candidate・reportは書き換えない。将来recipeを変更する場合は新identityと必要なgateを用い、旧reportへ新hashを付け替えない。

保存joint summaryにはper-hand conditional mass / effective supportがない。したがって、bet/raise後のjoint rangeが少数handへ集中しないことを全面的に確認したとは言えない。とくにSB37.2/16classの受入れを、今後のSB17.9/8classやnonblind経路へ拡張しない。

## 240,000 handsの独立集計とreplay

各12board×10,000=120,000 hands。全board順・design/holdout・seed、wins+ties、action上限、fold/all-in終端整合、rake上下限、final stacksを独立確認。開始総chipsはBB経路300.5BB/hand、SB経路301BB/handなので、各boardのstack+rake目標も **3,005,000 / 3,010,000BB** と別々に検証した。

| 指標 | UTG → HJ → BB | CO → BTN → SB |
| --- | ---: | ---: |
| First blind wins | BB 29,875 | SB 47,340 |
| Opener wins | UTG 40,194 | CO 33,611 |
| Last caller wins | HJ 46,561 | BTN 35,781 |
| Ties | 3,370 | 3,268 |
| Fold terminals | 46,203 | 46,785 |
| All-in経験terminals | 2,130 | 2,409 |
| 総rake（BB） | 79,592.95349999228 | 89,045.84300000878 |
| 最大board chip集計絶対誤差（BB） | 1.2293458e−7 | 1.6158447e−7 |

Fold terminalとall-in経験は重複可能なので足してhand数と比較しない。両方の全量replayはMATCHで、対象simulation objectのexact hashも一致。これは **同じengineによるdeterministic replay** であり、独立solver・独立アルゴリズム・別評価器による全hand再評価ではない。会計の別実装検査やSBの勝数の多さも、最適性・収益性の証拠ではない。固定12boardは自然なflop頻度で重み付けしたものではない。

## 後工程と残余限界

- 今回2候補だけの限定受入れ。残り各source/geometry/original roles、1,755flop、236later、20,000/event、120,000 self-playと全量replay、独立品質reviewを維持する。
- 粗いhand tier、kicker/blocker/draw quality圧縮、board_shared内の役の差、履歴の圧縮、限定later/joint標本、外側fold条件なしが残る。構造PASSとpolicy joint reach、保存頻度と均衡性を区別する。
- UTG/HJのさらに大きいoverfold、SBの少数class集中は将来のauthor改善対象になり得る。改善するなら明示的な新author判断と対応する新証跡として扱う。
- 実Range/Agentのflop→riverブラウザQA、HU不変性の最終統合回帰、tests/typecheck/build、LFS現物・復元・receipt、strict local D1、公開registryと本番承認は別gate。D1 cleanupのdetached-child blockerが別作業で残っているとの親からの報告は数値証拠を変えないが、本reviewはその解消を確認していない。
- 本reviewが新規作成したものはこの文書のみ。Source、頻度、metadata、recipe、registry、receipt、元reportを変更していない。

**結論: 両候補は警告・上記errataと限界を残した限定AI estimateとしてACCEPTABLE。数値方針の必須修正なし。公開・均衡品質のGOではない。**
