# 3人ポストフロップ段階1：最終UTG 3経路の独立品質レビュー

更新: 2026-10-05 00:21 UTC。対象profileをauthorしていない独立reviewerによる、保存候補と完成gateの確認。

## 判定

| 保存候補 | 独立判定 | 数値・構造の必須修正 | 共同警告 |
| --- | --- | --- | --- |
| UTG_open_HJ_call_CO_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 32（overfold28 / overcontinue4） |
| UTG_open_CO_call_SB_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 37（overfold25 / overcontinue12） |
| UTG_open_HJ_call_SB_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 37（overfold26 / overcontinue11） |

**全3経路の完成gate受領後、全21raw filesを再照合。計181,395rules・540初動anchor、各1,755flop / 236later / 108joint slots、計5,520,000 accepted joint tuples、360,000hands＋同じ全量replayを確認した。数値・構造の必須修正なし。**

本判定はsource・保存mix・完成gateと安全条件の整合を認める限定判定。**均衡性、GTOへの近さ、最適性、利益、実戦相手への頑健性の承認ではない。** 大きなoverfoldと一部overcontinueを残す。構造PASS、勝数、replay一致を均衡的防御の証明として読まない。

UTG→HJ→COはpot9BB、UTG openerがoriginal first、HJ first callerがmiddle、CO second callerがlast。後二経路はpot8.5BB、SB second callerがfirst、UTG openerがmiddle、CO/HJ first callerがlast。異なるsourceとoriginal roleを単純renameして受け入れない。

Historical rationaleには下記の必須説明errataを適用し、原profile・recipe・候補・reportのbytesを維持する。本書はLFS、release receipt、strict local D1、実ブラウザQA、公開registry、本番反映の承認ではない。

## 独立確認の方法と境界

- 完成通知とexact proof inventoryを受けた経路だけ、候補2本＋report5本の全7raw filesを現物のbytes長とSHA-256で照合した。未完成gateの存在だけでは受け入れない。
- Current opening / first-response / multiway-responseの実source spotからfingerprint materialを別Pythonで再構成。各sourceの全positive行・頻度・weighted combosをprofileと照合した。選択profile・context-judgments・emit・registryの4-file recipe、semantic13 / verification8を現物文字列から再計算した。
- Policyは大きいJSONを1本ずつ読み、全117-node grammar、合法action集合、整数0–100・sum100、重複identity、全7selector domain、node×9tier fallback、全具体context×texture×9tierを確認した。各180flop residual-tier初動anchorも保存bet総量と照合した。
- 各artifactが60,000rules以下であること、全具体ruleのoriginal role / current positionと、absolute/current nuts、board_locked、board_shared、river draw安全条件を確認した。
- 各108 joint eventsの完全inventory、全positive eventの20,000 samples、seed、alias、cent丸めMDF、確率・差・Hoeffding区間・warningを独立集計。支持0は該当sourceと保存tier別mixで確認した。
- Later選出規則をPythonで再構成し、236 actual boardsの**完全配列・順序**、turn45 / river191と照合した。
- 各12boards×10,000handsのboard順・design/holdout・seed/sample・wins/ties・action/terminal・stack/rake会計と、replay参照simulation object hashを別Pythonで確認した。

**ReviewerはNode、npm、tests、esbuild、policy compile、geometry probe、all-board audit、joint sampling、simulation/replayを起動していない。**

最終読取local HEADは `d1af49c0136991251e26898e05e70f91111fd48c`、treeは `fb0dd34d5882ca295eb38aa937ccf72b8ccc6a81`。Local exact bytesの検証であり、remote commit objectの独立検証や、このHEADでreviewerが全量gateを再走したという意味ではない。並行D1 delivery実装のGOは別reviewであり、本書はその操作を動作承認しない。

保存証拠の独立検証とgate再実行を混同しない。全chip-state witnessはspot固有witnessをreplay照合するemitterの読取と同identityの完成gateに依拠する。全stateの独立再探索、別showdown evaluatorでの全hand再評価ではない。

## 固定identityと実source

共通100BB、2.5BB open、2人call、各残stack97.5BB、5% rake・cap3BB。Nonblindのdead blindsはSB0.5＋BB1、SB-firstでは外側BB1。外側でfoldする3席のholecardsとそのfold条件は未モデル化。

| Identity | UTG → HJ → CO | UTG → CO → SB | UTG → HJ → SB |
| --- | --- | --- | --- |
| Source | `f8d9dc162bd8bb8e401972747dba8e8ce8b8d244d7419af718376ad368d08734` | `552657bcc5e1dd53785ecd44d152a9367e1296ec7e7263ef90d5b5b47394af60` | `ced4f58d35c1636ee9b4197eef7c636823e8dd0a2f4718f39a3d0b84f5f267c9` |
| Recipe | `def619c6d11acd0123b5cb5bc0f16520b5db22d014c6f6b339dd4fdec238b34a` | `225612c4fa36dc9b18bc57289d833197724283d21c4f533f8d09a26d08238172` | `92de70d45436d61c09f9bf7d341fb86080260fbc8d99604bacade06275c0b632` |
| Profile raw SHA-256 | `70b309ca3b89bccf3b763cd574ec215a67f158b46b44cde455b275f295b22c2c` | `943a541efbfe3c6fdf65d7f5f9a81b686789aef55d5f1787d5d7ba1935adb1bd` | `e92b4159625d2b29c3c53194352da75a05e1649634f29c4c820b1e522a2ddbd0` |

共通implementation（semantic13）: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`。

共通verification（generic gate8）: `92b946dfc5c87359dcb3e610e832e262c2d3ac366110f295968eca2f7392c088`。

全3profileについて、実source positive supportと上記source/recipe/semantic/verification hashの独立再構成は一致。 `stable-source-fingerprints.json` のseat順・pot・stackとも全3件一致。最終検証時のsource全JSON raw hashesも保持されている:

- opening-ranges: `236225dbae1c8aa2e2e7af8a449555f27ef80fed878114408c0e7338b89d0f0b`
- preflop-ranges: `fdc83f2ed78e0690e148b39fa23b8edc0bf204fe1a3f1ca4c4e6ea9377da2b55`
- multiway-responses: `db5e05912bff4d58f845dfd3caec3e2d5292b5a914579ee96c47112836e3c912`

Profile statusは `authored_pending_compile_and_independent_review`、候補metadataはschema3 / model `gpt-6-astra` / strategy `ai_estimate_not_gto` / author version1 / `candidate_pending_independent_review`を保持する。Raw bytes、内側policy hash、simulation object hashは別物。

### Source集中と必須説明errata

| Source | Weighted combos / positive classes | 実pair支持 | 代表12boardで最大単一class marginal比率 |
| --- | --- | --- | --- |
| UTG open | 212.5 / 49 | 22–AA | 6.639%（KcKd4h、AQo） |
| HJ flat vs UTG | 56.7 / 27 | 44–AA | 10.647%（Th9h8c、77） |
| CO flat vs UTG | 68.8 / 29 | 33–AA | 8.763%（QsJd5c、77） |
| CO overcall UTG/HJ | 24.6 / 11 | 99–AA | 17.647%（QsJd5c、AKo） |
| SB overcall UTG/CO | 17.9 / 8 | 99–AA | 28.283%（QsJd5c、TT） |
| SB overcall UTG/HJ | 17.9 / 8 | 99–AA | 28.283%（QsJd5c、TT） |

これは自分のpreflop frequency×合法combo数の**marginal質量**。最大比率だけboard blockerを反映し、他席holecardsやpostflop historyで条件付けていない。全sourceで12boards全てのpositive class数が維持される。わずか8classのSBではcoarse tier内の誤差がrange全体に大きく効く。保存joint summaryにはper-hand conditional mass / effective supportがなく、bet/raise後の少数holding集中を全面的に否定する証拠ではない。

1. CO_vs_UTG_HJcallの「37.8% 77–JJ」「no22–66/connectors」はそのまま説明に使わない。**88以下は0、99–JJが37.804878%、QQ+が18.292683%。** AA20 / KK20 / QQ35 / JJ55 / TT55 / 99:45%をcallする。AKs30 / AQs55 / AJs45 / AKo30 / KQs50%も支持する。全suited連結手不在ではなく、QJs / JTs / T9s以下が0。
2. 両SB sourceは完全に同じ8class / frequency。**AA20 / KK20 / QQ30 / JJ55 / TT70 / 99:50 / AKs30 / AQs50%。** 88以下は0。99–JJ58.659218%、QQ+23.463687%、pair全体82.122905%。「77–JJ」group合計は数値上合っても77 / 88の支持はない。「no connectors」をAKsまで含む全連結手不在と読めば誤り。KQs以下のsuited連結手とoffsuit全classは0。
3. HJとCOのfirst-call sourceへSBの狭さを転記しない。HJはAKs10 / KQs55 / QJs60 / JTs45%、COはAKs10 / KQs60 / QJs65 / JTs50%をcall。両方T9s以下は0。HJの22 / 33は0、COの22は0。22–JJ質量はHJ47.090%、CO42.733%。Historical「CO42.8%」より正確には42.733%で通常1桁丸めは42.7%。
4. Profileの実positive支持配列・頻度はsourceと全て一致する。誤文によるhand脱落やdraw一律排除は確認していない。説明の誤りだけで特定頻度の再authorを必須としない。SB sourceが同じでも対面HJ56.7とCO68.8が異なり、SB/UTG/lastのanchorも別である。

以上を今後の説明で優先し、historical recipeのbytesは変更しない。将来recipeを変更する場合は新identityと必要なgateを用い、既存reportへ新hashを付け替えない。

## Geometry、selector、安全条件

Nonblind9BBの33 / 75 / 125% wagerは2.97 / 6.75 / 11.25BB。SB-first8.5BBではcent丸めで2.81 / 6.38 / 10.63BB。参考MDFはそれぞれ75.1879699 / 57.1428571 / 44.4444444%と75.1547303 / 57.1236559 / 44.4328280%。33%へのrake後call priceは20.9258085%と20.9482630%でstandard。

Nonblindで33% bet→3倍raiseはraise-to8.91BB。未投資cold responderのcall後pot29.79、残88.59、SPR2.9738167でmedium。SB-firstの対応SPR3.1618743はdeep。逆にSB-firstの初回125% betへのcall後はpot29.76、残86.87、SPR2.9190188でmedium。BB8BB geometryを流用しない。Emitterは各spotのseat / node / selectors / pot / call / actionsをそのspotのwitnessからreplay照合する。

- 全3人contextはoriginal role＝current position。3→2後もoriginal firstはfirst、lastはlast、middleだけfirst / lastへ変わる。元seat/source/dead chipsを保持し、HU profileへ切り替えない。
- 全absolute_nuts facingとriver current nutsはfold0。Flop/turnのcurrent nutsはfuture no-lossと別。最大foldはflop5 / turn8%。Classifier4は両private blockersを除外した現在rankと、将来no-loss十分条件を分ける。Certificate陰性は将来敗北可能の断言ではなく、陽性でもtieはあり得る。
- board_lockedはcheck/call100、fold/bet/raise0。board_sharedはbet/raise0、riverだけ明示call caution。Early-streetのshared行は構造上のcard-unreachable fallbackであり、private valueの代用ではない。River drawはcheck/fold100。
- Monsterは広いresidual tierで2pair以上を含み、nutsと同義ではない。保存最大foldを後述し、monster全体の安全性・収益性の証明としない。
- 受け側も保存mixを直接使用する。HU defence、MDF floor、EV修正、警告件数を目標にしたfrequency補充はない。Cold/investedは現在streetの投入有無で、投資済み額をcallの理由にしない。Behind/closing、3人closingと2人closingを区別する。

### Structural coverageとjoint reachの違い

全1,755flop監査は**geometry context×source-supported combo tier**の構造監査。保存policy historyを経たjoint reachの証明ではない。Later236は実際のboardをrunout textureごとに選ぶ限定coverageで、全turn/river card組合せの総当たりではない。全236board順序のcompact JSON hashは `a62aff1544632fa489e8caffe67487ff0e650e08427cb124b7d1d080213fa936`。Actual一覧は各完成later-runouts reportに保持する。

### Remaining-opponent identityの圧縮

`mw3PolicyContextKey` / `selectMw3Rule` は自分のoriginal-role nodeとline / texture / 人数 / current position / response / price / SPRを使う。残った相手がoriginal middleかlastかは別selectorではない。

Nonblindの「UTG check → HJ bet33 → CO fold → UTG call」と「UTG check → HJ check → CO bet33 → UTG call → HJ fold」は、next turnのUTG original/current first、2人、defender、pot14.94・残94.53、SPR6.3273092/deepへ合流する。相手sourceはHJ56.7とCO24.6でも、blank/strongは同じcheck94 / bet33:4 / bet75:2。

SB-firstの同型もSBを残してopenerまたはlastがfoldすると、pot14.12・残94.69、SPR6.7060907/deepへ合流する。Runtimeのlive seats/sourceとjoint tupleは残るが、**policyは異なるremaining-opponent identitiesを同一bucketへ圧縮し得る**。Exactな相手別最適応答やhistory全体に条件付けた均衡戦略を得たとは言えない。現行抽象化の限界であり、今回のschema拡張や数値修正を必須化する根拠ではない。

## UTG → HJ → CO：完成gateと判定根拠

Coordinatorの完成通知は2026-10-04 23:59:37 UTC。完成proof inventoryを受領後、全7現物を独立にhash・長さ照合した。

Inventory: `.local/postflop-ai/mw3/remaining-thirteen-run-v1/UTG_open_HJ_call_CO_call.proof-inventory.json`。

Report directory: `.local/postflop-ai/mw3/gates/utg-hj-co-mw3-srp-v1/v1-f8d9dc162bd8-4ec6b527f8e2-92b946dfc5c8-def619c6d11a/`。

Flop policy hash: `d6ee35e17d0287de2150fade7b14a1eb32dd047a866d67e33510240fe83a9205`。

Later policy hash: `e67aaaf82ed04e6c290675cc2f6dc68c33bb9ef751d84ada53ebc171eb9e3f0e`。

Generated at: `2026-10-04T23:51:29.566Z`。Author task: `mw3-utg-hj-co-mw3-srp-v1-authored-v1`。

| ファイル | bytes | 現物raw SHA-256 |
| --- | ---: | --- |
| Flop candidate | 2,251,518 | `f00be89ae73a93574d3ed750ec0bc3de5f83615b52037e36e75c2b2bc505d31a` |
| Later candidate | 12,024,940 | `c3a9af55d41a44cd86ec7a86a230a71dffdfdf8b71b2ba6918b09a48c98b5abc` |
| all-flops | 1,005 | `3d2b0ac71309e086eba4321adb369198663b5eb821afd05ee02d2697648d741f` |
| later-runouts | 23,508 | `2ba2ae982793218816e2f85daa7859fd86327adb81d45e36f9959fe2f837322f` |
| joint-defence | 84,884 | `c7ffb2b4218c16f1077b074003d17de5b56d5dce6e899a732418a3a7262f377f` |
| simulation | 9,148 | `94a0ff0e64bfb396c2eed5d84aa42d8d26b17b29d86b3c1c5c4032782c9d0e8c` |
| simulation-replay | 817 | `c6f2532c82ff6b4b8755fd1f50c1468382277b24ffe16272259ed27015f41a02` |

### 全ruleと保存mix

Flop33 nodes / 83 contexts / 9,261 rules。Turn475 contexts / 21,753 rules、river623 / 28,413。Later84 nodes / 1,098 contexts / 50,166 rules。全117 nodesと9tier fallback（flop297 / later756）、各具体contextにflop12 / later5 textures×9tierが完全。全59,427rulesと180初動anchorを独立確認した。全1,755flopのcombo-context countは21,666,498、error / gap / raw warning0。全236laterも同0。Residual monster最大foldはflop39 / turn53 / river66%。

保存初動mix（betは33 / 75 / 125順）:
- UTG opener first、dry_high monster: check52 / bet14・29・5、strong: check69 / bet23・8・0
- HJ first caller middle、dry_high strong: check83 / bet14・3・0
- CO second caller last、dry_high air: check97 / bet2・1・0
- UTG wet_low strong: check93 / bet3・4・0、CO wet_low monster: check39 / bet10・44・7

UTG firstはblind donkではなくc-bet。HJ middleはopener check後、狭いCOを残すprobe。COは24.6-combo second callerであり、同じCOの68.8-combo first callerや広いBTNで代用しない。Wet-lowのmonster内bet頻度をrange全体のmonster質量と混同しない。

Dry_high / bet33 facing / cold / standard / deepのmediumはUTG3人behindでfold86 / call14、UTG fold後の元middle HJ・2人closing/current firstでfold68 / call32（raise0）。HJのturn blank / strong / aggressor / deep / 残2人はcurrent firstでcheck61 / bet24・15、current lastで55 / 28・17。全contextを独立最適化した結果ではなく、source別anchorを共通author context priorsで展開したAI estimateである。

### 96 positive / 12支持0、32警告

108 slots全てを照合。96×20,000＝1,920,000 accepted joint tuples。支持0を97/11や99/9に正規化しない。

- KcKd4h / 8c8d2h / 5s5d4cの3paired boards、各first / middle / last bet125で9件。初動の全9tierでbet125が0。
- 8s7d6c、2check後CO bet125。CO sourceのpairは99以上で88 / 77 / 66は0、T9s等のstraightや低い2pair支持もない。合法supportにはoverpair/draw/airがあっても、wet_lowのそれらのbet125は0。Nuts12% / monster7%は非zeroでも、そのtierのsource支持がない。
- 6h5h2d、同CO bet125。66 / 55 / 22と低い2pair / straightを作るholdingsが支持されず、同じsource-tier理由。
- AhKh4h、同CO bet125。Suited支持は全てAかKを含み、Ah / Khがboardにあるので合法な2枚heart holdingがない。Set / 2pairはcurrent nutsではなくmonotone_high monster bet125は0。唯一nonzeroのnuts3%にsource支持がない。

全理由は `No policy-supported mw3 range at this history`。追加3件を「全9tierのbet125が0」と誤記しない。欠落reportやsampling失敗を支持0に置換したものではない。

| Bettor / size | overfold / overcontinue / 警告なし | 支持0 |
| --- | --- | ---: |
| First33 | 0 / 1 / 11 | 0 |
| First75 | 0 / 2 / 10 | 0 |
| First125 | 3 / 0 / 6 | 3 |
| Middle33 | 1 / 0 / 11 | 0 |
| Middle75 | 0 / 1 / 11 | 0 |
| Middle125 | 5 / 0 / 4 | 3 |
| Last33 | 7 / 0 / 5 | 0 |
| Last75 | 6 / 0 / 6 | 0 |
| Last125 | 6 / 0 / 0 | 6 |

最悪はJs8s5d、2check後CO bet125。共同続行10.6413235%、MDF44.4444444%、差−33.8031209pt、保存99.9%区間9.2628368–12.0198102%。Ks8d3c・同CO bet33でも46.9308485%、MDF75.1879699%、差−28.2571214pt、区間45.5523618–48.3093352%。同boardの75 / 125%続行は29.9948485 / 11.3181270%。Overbetに限定されず、通常のsampling noiseでは説明できない。

Overcontinue4件はKcKd4hのUTG first bet33:94.9556720%（+19.7677021pt）、同bet75:85.0367680%（+27.8939109pt）、HJ middle bet75:76.2010400%（+19.0581829pt）、5s5d4cのUTG first bet75:72.7620955%（+15.6192384pt）。

### 120,000hands会計とreplay

各12boards×10,000、design8 / holdout4。WinsはUTG31,387 / HJ31,800 / CO53,308、ties3,505、fold terminals39,310、all-in経験2,068。総rake87,434.01149999216BB。開始総chips301.5BB/hand、各board目標3,015,000BB。最大board chip集計絶対誤差1.6903504729270935e−7BB。全seed/sample、action上限、勝敗、rake/stackの会計条件を独立確認。

Replay MATCH。再計算simulation object hashは `fd78fb3561b4511e2cd679b287bdc3c3f103d51f5b15f33f3f87f52a7e3de95b`。

## UTG → CO → SB：完成gateと判定根拠

Coordinatorの完成通知は2026-10-05 00:07:55 UTC。完成inventory受領後、全7現物をhash・長さ照合した。

Inventory: `.local/postflop-ai/mw3/remaining-thirteen-run-v1/UTG_open_CO_call_SB_call.proof-inventory.json`。

Report directory: `.local/postflop-ai/mw3/gates/utg-co-sb-mw3-srp-v1/v1-552657bcc5e1d-4ec6b527f8e2-92b946dfc5c8-225612c4fa36/`。

Flop policy hash: `8c86933a924941071673fb70a6767b5c99a8db402fd5348a7c9a915d7b2574d0`。

Later policy hash: `1968323969e89f53b7c792bccbf81ef7ea10555e19392b63d38a3e1b5b26b46d`。

Generated at: `2026-10-04T23:59:46.949Z`。Author task: `mw3-utg-co-sb-mw3-srp-v1-authored-v1`。

| ファイル | bytes | 現物raw SHA-256 |
| --- | ---: | --- |
| Flop candidate | 2,485,757 | `26d359eae1cd2063036ef0bf9cb200db8e74fdcb95e61a82f5c8ac4e1c864ee2` |
| Later candidate | 12,162,781 | `490e6befd9d6105b9a390150b893fc511c94165b206761e8a3548c7273b7b129` |
| all-flops | 1,005 | `0cbf0f5b4e7a4f9f52a48c8526e2e8b70295058cf095b39f7d8fdb85f1ba70dc` |
| later-runouts | 23,508 | `42439ee711164ffe130ecacca1834cd25071bfcd20fae1d0dd5c12f0be9ad926` |
| joint-defence | 80,598 | `68a86a81b96b4d0f0c1e7ad22ee63f5d21c46f5e9bd93d2a8409cedc87e8c383` |
| simulation | 9,139 | `db2dc19038b13543f3891af0b55adfe2e6ef770d62c307e08c1b926fb637434e` |
| simulation-replay | 817 | `bb7c59645f3ea72a4eabcd0e68a2d2b129a770bcdba7f28c3f03af2e015c61c1` |

### 全ruleと保存mix

Flop33 nodes / 92 contexts / 10,233 rules。Turn482 contexts / 22,068 rules、river629 / 28,683。Later84 nodes / 1,111 contexts / 50,751 rules。全117nodes、9tier fallback297＋756、各concrete context×全texture×9tier、計60,984rulesと180初動anchorを独立確認。全1,755flopのcombo-context count24,473,028、236laterと共にerror / gap / raw warning0。Residual monster最大foldはflop37 / turn51 / river64%。

保存初動mix（betは33 / 75 / 125順）:
- SB first dry_high monster: check77 / bet7・16・0、strong: check92 / bet6・2・0、draw: check95 / bet3・2・0
- UTG opener middle dry_high strong: check57 / bet32・11・0
- CO first caller last dry_high air: check96 / bet3・1・0
- SB wet_low strong: check85 / bet7・8・0、draw: check89 / bet4・7・0
- UTG wet_low strong: check90 / bet5・5・0、CO wet_low strong: check82 / bet8・10・0

SBは82.12%がpairでもcheck-heavyを維持。低boardのmonster/draw行が存在することは、各boardで17.9-combo sourceがそのtierを広く持つ意味ではない。COは68.8-combo first callerで、先の24.6-combo CO overcallerとは別。SBの同じ8hand sourceを理由に次HJ経路と同じpolicyとみなさない。

Dry_high / bet33 facing / cold / standard / deepのmediumはSB3人behindでfold75 / call25、SB fold後のUTG2人closing/current firstでfold72 / call28（raise0）。UTGのturn blank / strong / aggressor / deep / 残2人はcurrent firstでcheck61 / bet24・15、lastで55 / 28・17。Remaining-opponentがUTG212.5かCO68.8かを圧縮するSB next-turn defender/blank/strongはcheck89 / bet33:7 / bet75:4。

### 90 positive / 18支持0、37警告

108slotsを照合。90×20,000＝1,800,000 accepted joint tuples。18支持0はSB firstのbet125が12boards全て0、paired3boardsでUTG / COのbet125各3件。**該当初動の全9tierでbet125が0**まで確認した。すべて同reasonで、非zero betを持つが実source tierがないnonblind追加3件とは理由を分ける。

| Bettor / size | overfold / overcontinue / 警告なし | 支持0 |
| --- | --- | ---: |
| First33 | 3 / 0 / 9 | 0 |
| First75 | 4 / 0 / 8 | 0 |
| First125 | 0 / 0 / 0 | 12 |
| Middle33 | 1 / 4 / 7 | 0 |
| Middle75 | 1 / 6 / 5 | 0 |
| Middle125 | 4 / 0 / 5 | 3 |
| Last33 | 3 / 0 / 9 | 0 |
| Last75 | 3 / 2 / 7 | 0 |
| Last125 | 6 / 0 / 3 | 3 |

最悪はKs8d3c、2check後CO bet125。共同続行13.9429625%、MDF44.4328280%、差−30.4898655pt、区間12.5644758–15.3214492%。同boardのCO bet33にも48.0671535%、差−27.0875768pt、区間46.6886668–49.4456402%。75%続行は30.8664140%。

12overcontinueはpairedだけではなく、SBのoverpairが残るwet boardsにもある。Referenceとの差であり、すべて誤callと断定しないが、先行SB経路の「過剰続行3件」を転記してはならない。

| Board | Bettor / size | 共同続行 | MDFとの差 |
| --- | --- | ---: | ---: |
| Th9h8c | UTG middle33 | 91.6165990% | +16.4618687pt |
| Th9h8c | UTG middle75 | 80.8573395% | +23.7336836pt |
| Th9h8c | CO last75 | 75.0125360% | +17.8888801pt |
| 8s7d6c | UTG middle75 | 73.9175850% | +16.7939291pt |
| 6h5h2d | UTG middle75 | 74.9894100% | +17.8657541pt |
| KcKd4h | UTG middle33 | 94.5548670% | +19.4001367pt |
| KcKd4h | UTG middle75 | 81.8188290% | +24.6951731pt |
| KcKd4h | CO last75 | 73.9142750% | +16.7906191pt |
| 8c8d2h | UTG middle33 | 92.3137945% | +17.1590642pt |
| 8c8d2h | UTG middle75 | 76.5133775% | +19.3897216pt |
| 5s5d4c | UTG middle33 | 92.2764610% | +17.1217307pt |
| 5s5d4c | UTG middle75 | 77.0386050% | +19.9149491pt |

37warningsという件数と25overfold / 12overcontinueの両側を明示する。先行候補より良い・悪いという比較を件数だけからしない。

### 120,000hands会計とreplay

WinsはSB52,458 / UTG31,898 / CO32,824、ties2,820、fold terminals33,985、all-in経験1,707。総rake82,130.63700000923BB。開始総chips301BB/hand、各board目標3,010,000BB。最大board chip集計絶対誤差1.671724021434784e−7BB。全12boardsの順序・design/holdout・seed/sample・勝敗・action/terminal・stack/rake会計を独立確認。

Replay MATCH。再計算simulation object hashは `8471f97ee170abb5c57cbcc97e2ddd114650e24935ef5e53273f4ce9393c5852`。

## UTG → HJ → SB：完成gateと判定根拠

Coordinatorの完成通知は2026-10-05 00:18:01 UTC。完成inventory受領後、全7現物をhash・長さ照合。さらに全3経路の21raw files・3recipes・semantic13・verification8をまとめて再照合した。

Inventory: `.local/postflop-ai/mw3/remaining-thirteen-run-v1/UTG_open_HJ_call_SB_call.proof-inventory.json`。

Report directory: `.local/postflop-ai/mw3/gates/utg-hj-sb-mw3-srp-v1/v1-ced4f58d35c1-4ec6b527f8e2-92b946dfc5c8-92de70d45436/`。

Flop policy hash: `a1e92759270e9fd3f0911b080cd42b46898bf0e3749ea7c403f0f6768dd688c1`。

Later policy hash: `5c7413b2881aa52304ff3ebe7d2911dace4bb9a2deda13a7a838bc0fd03ac5d9`。

Generated at: `2026-10-05T00:09:46.891Z`。Author task: `mw3-utg-hj-sb-mw3-srp-v1-authored-v1`。

| ファイル | bytes | 現物raw SHA-256 |
| --- | ---: | --- |
| Flop candidate | 2,485,809 | `9821f092ac6a0046f87cea1fa98c5be8f281e483052dea603f60b439ea6d2f17` |
| Later candidate | 12,162,771 | `2be7100113c4612c4fccca9b74cd6d6c75dfed0da639590621438387eb7976ef` |
| all-flops | 1,005 | `6727aa87b55cefb991e55214fd4ee204e1e2d44f5f8a97a89387374edfa88f7d` |
| later-runouts | 23,508 | `5d5839c1a12fc8347b57329604fcf296f50e9521f5137d8fcf4fa58c74be0c10` |
| joint-defence | 80,539 | `327d9b2463c1e354e7f93868e62b76f286e5b806d08fbfe7c88bdea72e59d799` |
| simulation | 9,123 | `a29761d7537f0ad2b1fb826b317e07ca9d0e11505fca0d9001dccff68b123e5f` |
| simulation-replay | 817 | `739f564315d4a14a0f3a8136b80dfa02ffdb4d2e3822f7f7ee1cc807f797d8f3` |

### 全ruleと保存mix

Flop33 nodes / 92 contexts / 10,233 rules。Turn482 contexts / 22,068 rules、river629 / 28,683。Later84 nodes / 1,111 contexts / 50,751 rules。全117nodes、9tier fallback297＋756、全具体context×全texture×9tier、計60,984rulesと180初動anchorを独立確認。全1,755flopのcombo-context count24,021,324、236laterと共にerror / gap / raw warning0。Residual monster最大foldはflop39 / turn53 / river66%。

保存初動mix（betは33 / 75 / 125順）:
- SB first dry_high monster: check78 / bet6・16・0、strong: check93 / bet5・2・0、draw: check95 / bet3・2・0
- UTG opener middle dry_high strong: check60 / bet30・10・0
- HJ first caller last dry_high air: check97 / bet2・1・0
- SB wet_low strong: check86 / bet6・8・0、draw: check90 / bet4・6・0
- UTG wet_low strong: check92 / bet4・4・0、HJ wet_low strong: check82 / bet8・10・0

SBのsourceはCO経路と同じでも、SB / UTG / lastの判断は完全一致ではない。対面HJはCOより狭く、HJのdry_high draw bet13%とCO16%、wet_low draw13%と16%など異なる。共通context priorsを持つsource別AI estimateであり、2つの独立solver最適解という意味ではない。

Dry_high / bet33 facing / cold / standard / deepのmediumはSB3人behindでfold77 / call23、SB fold後のUTG2人closing/current firstでfold74 / call26（raise0）。UTGのturn blank / strong / aggressor / deep / 残2人はcurrent firstでcheck64 / bet22・14、current lastで58 / 26・16。Remaining-opponentがUTG212.5かHJ56.7かを圧縮するSB next-turn defender/blank/strongはcheck90 / bet33:6 / bet75:4。

### 90 positive / 18支持0、37警告

108slots全体を照合。90×20,000＝1,800,000 accepted joint tuples。18支持0はSB firstのbet125全12boards＋paired3boardsのUTG/HJ bet125各3件。該当初動の全9tierでbet125が0であることを現物で確認。欠落や不完全samplingではない。

| Bettor / size | overfold / overcontinue / 警告なし | 支持0 |
| --- | --- | ---: |
| First33 | 4 / 0 / 8 | 0 |
| First75 | 3 / 0 / 9 | 0 |
| First125 | 0 / 0 / 0 | 12 |
| Middle33 | 1 / 4 / 7 | 0 |
| Middle75 | 2 / 6 / 4 | 0 |
| Middle125 | 4 / 0 / 5 | 3 |
| Last33 | 3 / 0 / 9 | 0 |
| Last75 | 3 / 1 / 8 | 0 |
| Last125 | 6 / 0 / 3 | 3 |

最悪はKs8d3c、2check後HJ bet125。共同続行13.0029830%、MDF44.4328280%、差−31.4298450pt、区間11.6244963–14.3814697%。同boardのHJ bet33も46.9239960%、差−28.2307343pt、区間45.5455093–48.3024827%。75%への続行は29.2977755%。

| Board | Bettor / size | 共同続行 | MDFとの差 |
| --- | --- | ---: | ---: |
| Th9h8c | UTG middle33 | 91.2575445% | +16.1028142pt |
| Th9h8c | UTG middle75 | 80.6816340% | +23.5579781pt |
| Th9h8c | HJ last75 | 73.5413650% | +16.4177091pt |
| 8s7d6c | UTG middle75 | 73.7330540% | +16.6093981pt |
| 6h5h2d | UTG middle75 | 75.2428020% | +18.1191461pt |
| KcKd4h | UTG middle33 | 94.7035495% | +19.5488192pt |
| KcKd4h | UTG middle75 | 82.0548640% | +24.9312081pt |
| 8c8d2h | UTG middle33 | 91.9298205% | +16.7750902pt |
| 8c8d2h | UTG middle75 | 76.0980055% | +18.9743496pt |
| 5s5d4c | UTG middle33 | 92.0662775% | +16.9115472pt |
| 5s5d4c | UTG middle75 | 76.7471565% | +19.6235006pt |

CO/SB経路とwarning総数37は同じでも、こちらは26overfold / 11overcontinue。異なるsourceとmixによる診断であり、同じ戦略や同じ相対品質を意味しない。

### 120,000hands会計とreplay

WinsはSB52,528 / UTG32,218 / HJ32,476、ties2,778、fold terminals30,958、all-in経験1,605。総rake79,651.0715000098BB。開始総chips301BB/hand、各board目標3,010,000BB。最大board chip集計絶対誤差1.6763806343078613e−7BB。全12boardsのboard順・design/holdout・seed/sample・勝敗・action/terminal・stack/rake会計を独立確認した。

Replay MATCH。再計算simulation object hashは `a6156ff8531b4af0b79adb5354e38d34b0f9017dde01f5340b983813f7d1bc4f`。

## 共通品質判断と後工程

共同防御は先行checkとbettorの実保存betに条件付け、同一合法3人tuple内の逐次fold確率積を平均する。別々に平均したfold率の積ではない。元参加者のfold済み札はblockerとして残す一方、外側3席のfold条件は未モデル化。区間はevent単独の固定sample99.9% Hoeffdingで、全events同時の99.9%保証ではない。

MDFはrake非考慮 `P/(P+new wager)` のadvisory。各handの適正call率・均衡防御・any-two bluff EVを確定しない。Overfold/overcontinueは実質的な残弱点として明示する。仕様のwarning契約に沿う限定受入れであり、均衡的防御を必要とする用途には不十分。自動MDF補充・HU移植・EVでのfrequency修復はしない。初回flop bet以外、raise後、turn/river、全1,755flopのjoint防御まで検査したものではない。

同じengineによるdeterministic replayであり、独立solver・別アルゴリズム・別評価器による全hand再評価ではない。Fold terminalとall-in経験は重複可能。勝数、rake、会計整合、完走数は戦略の強さや利益を証明しない。固定12boardsは自然flop確率で重み付けした標本でもない。

粗いtier内のkicker/blocker/draw quality、board_shared内の役の差、historyと残存相手identityの圧縮、限定later/joint標本、外側fold条件なしを残す。狭いCO/SB集中と大きなjoint deficitは将来のauthor改善対象になり得るが、新しい判断・新しい証拠として扱う。

実Range/Agentのflop→riverブラウザQA、HU不変性の最終統合回帰、tests/typecheck/build、LFS現物送信・復元・receipt、strict local D1、公開registry、本番承認は別gate。本reviewの確認をそれらの完了へ拡張しない。

本reviewの編集対象はこの文書だけ。Policy、source、metadata、recipe、registry、receipt、元report、他者の変更は編集していない。公開 `MW3_APPROVED_POLICIES` は空、historical statusと候補metadataも維持した。

**結論: 全3候補は警告・errata・抽象化限界を伴う限定AI estimateとしてACCEPTABLE。均衡品質・公開・本番反映のGOではない。**
