# 3人ポストフロップ段階1：UTG nonblind / BTN-overcaller 独立品質レビュー

更新: 2026-10-04 23:53 UTC。対象profileをauthorしていない独立Astra reviewerによる、保存候補と完成gateの確認。

## 判定

| 保存候補 | 独立判定 | 数値・構造の必須修正 | 共同警告 |
| --- | --- | --- | --- |
| UTG_open_CO_call_BTN_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 32（overfold28 / overcontinue4） |
| UTG_open_HJ_call_BTN_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 39（overfold36 / overcontinue3） |

これはsource・保存mix・完成gateと安全条件の整合を認める限定判定であり、**均衡性、GTOへの近さ、最適性、利益、実戦相手への頑健性を認めない**。両経路はJs8s5d・2check後BTN125% betに共同続行11.665589 / 11.941728%しかなく、大きなoverfoldを残す。小さいbetへの不足とpaired boardのovercontinueも残る。

両経路ともUTG openerがoriginal first、CO/HJ first callerがmiddle、BTN second callerがlast。実potは両dead blindsを含む9BB。Blind-first経路や先行HJ→CO→BTNをrenameした承認ではない。特に両経路の各**97 positive / 11支持0**は正しいinventoryであり、他nonblindの99 / 9に揃えない。

Historical rationaleのconnector・pair下限の説明には下記errataを適用する。原profile・recipe・candidate・reportを変更せず、その説明だけから頻度再authorを要求しない。公開 `MW3_APPROVED_POLICIES` は空、candidate metadataは `candidate_pending_independent_review` のまま。本書はLFS、receipt、strict local D1、実ブラウザQA、公開registry、本番反映の承認ではない。

## 独立確認の方法・範囲

- 両経路の候補4本＋完成report10本、全14raw filesをbytes長とSHA-256で各inventoryと照合。両gate完成後にも全14本を再照合した。
- 現在のopening / first-response / multiway-responseの実source spotからfingerprint materialをPythonで独立再構成。各sourceの全positive行・頻度・weighted combosをprofileと照合。Stable-source inventoryのsource / seats / pot / stacksとも一致。
- 選択profile・context-judgments・emit・registryの4-file recipeを現物からhash。共通semantic13 / verification8も現物文字列から再計算して一致。
- 両候補、計**118,854 rules**を1本ずつ読み、全117-node grammar、合法action集合、整数0–100・sum100、重複identity、7selector domain、全node×9tier fallback、全具体context×texture×9tierを確認。各180flop初動anchorも保存bet総量と一致。
- 全具体ruleでoriginal roleとcurrent positionを照合。Absolute/current nuts、board_locked、board_shared、river draw安全条件を全rule確認。
- 各経路の108 joint eventsを欠落・重複なく照合。各positive eventの20,000 samples、seed、alias、cent丸め後MDF、確率・差・Hoeffding区間・warningを独立集計。11支持0の理由を実source・ruleと照合。
- Later選出規則をPythonで再構成し、**236 actual boardsの完全な配列・順序**を両経路reportと照合。各turn45 / river191。
- 両経路計24boards・240,000 handsのboard順・design/holdout・seed/sample・wins/ties・action/terminal・stack/rake会計、各replay参照simulation object hashを独立確認。

**Node、npm、tests、esbuild、policy compile、geometry probe、全ボードaudit、joint sampling、simulation/replayはreviewer側で起動していない。** 保存gateの検証とgate再実行を混同しない。全chip-state witnessはspot固有witnessをreplay照合するemitterの読取と、同identityの完成gateに依拠する。全stateの独立再探索や別showdown evaluatorでの全hand再評価ではない。

CO経路gate完了通知は23:40:57 UTC、HJ経路は23:50:58 UTC。HJのreport受入れは完成通知と完成inventory到着後に行った。読取local HEADは `6bbdf6befb7eca1cddaa45db7fc46201f56e9832`、tree `0112d060c0c37bb96105cb73db6187f8c740c261`。Local exact bytesの確認であり、手元にないremote commit objectの独立検証ではない。このHEADでreviewerが全量gateを再走したという意味でもない。

## 固定identity

共通: 100BB、2.5BB open、2人call、各残stack97.5BB、5% rake・cap3BB、pot9BB。外側でfoldする3席のholecardsとfold条件は未モデル化。

| 項目 | UTG → CO → BTN | UTG → HJ → BTN |
| --- | --- | --- |
| Source | `e1328f1fc8ad265f473579189abf32246e4b7bf5bdd2cdc108bea1b2b59f15ed` | `bf2cc8a36a97c8b77c2ee525d9bebfb774814f3e21b1aea53cb46c1b21c45e8e` |
| Recipe | `afbaf72c98a7dce197069521282a22c6a82ead413f299a692fb4d8b502eeecce` | `7b047aa33e8cbb7b1386a68423c9877d23459c57b8584262d654d137b93b9281` |
| Flop policy | `5b7868e198248e206b68b42934d11ae51a250695f3e80da609192bfce5fc4527` | `89473138898d53835332a3777235f611216427e2d653adc8808dfaafb3bc11d8` |
| Later policy | `20925575ef96ecf8af3bc94e84bf390a1a8a411acd8d0699f1a685233db05297` | `8bdb93150f6528eb7613fae8a91a61a2f443a34ca6848526f63fb89063c0a287` |
| Generated at | `2026-10-04T23:33:02.653Z` | `2026-10-04T23:43:05.216Z` |

共通implementation: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`。

共通verification: `92b946dfc5c87359dcb3e610e832e262c2d3ac366110f295968eca2f7392c088`。

Metadataはschema3、model `gpt-6-astra`、strategy `ai_estimate_not_gto`、author version1。Author taskは `mw3-utg-co-btn-mw3-srp-v1-authored-v1` / `mw3-utg-hj-btn-mw3-srp-v1-authored-v1`。Raw file hashと内側policy hash、simulation object hashは別物。

### CO経路の全7raw files

Inventory: `.local/postflop-ai/mw3/remaining-thirteen-run-v1/UTG_open_CO_call_BTN_call.proof-inventory.json`。

Report directory: `.local/postflop-ai/mw3/gates/utg-co-btn-mw3-srp-v1/v1-e1328f1fc8ad-4ec6b527f8e2-92b946dfc5c8-afbaf72c98a7/`。

| ファイル | bytes | 現物raw SHA-256 |
| --- | ---: | --- |
| Flop candidate | 2,251,486 | `6dab08ad97c19f35572623be3fe082ef9248a82d7cf06a59aeb2e6cd65b74ebc` |
| Later candidate | 12,024,892 | `f91e89fe62bcfddb9b75675225a6b5154b4e5f1f818daab69c7f6166b9e2cea9` |
| all-flops | 1,006 | `f26d2e1d257ddd6db29ee588120c0afe76e37bf7bed76fe50266ab9eee032dc9` |
| later-runouts | 23,509 | `fff6d46fe2be45ff74fd93411bc38760c1694c1b8ca72072963eecbc0dcaa113` |
| joint-defence | 85,758 | `cc3cd883fb5c8913d507dc686af4a888e2acf211d242e35904ff94a68c404d26` |
| simulation | 9,210 | `0cbda603d3150895f1a58f7ac204f6632fd7ad9393de66a21d2c36f4ec54d421` |
| simulation-replay | 818 | `e3e1e58328af6bb56e73cbf4b667d64cd47edffe85089192b93169eecc1de42b` |

### HJ経路の全7raw files

Inventory: `.local/postflop-ai/mw3/remaining-thirteen-run-v1/UTG_open_HJ_call_BTN_call.proof-inventory.json`。

Report directory: `.local/postflop-ai/mw3/gates/utg-hj-btn-mw3-srp-v1/v1-bf2cc8a36a97-4ec6b527f8e2-92b946dfc5c8-7b047aa33e8c/`。

| ファイル | bytes | 現物raw SHA-256 |
| --- | ---: | --- |
| Flop candidate | 2,251,462 | `894aca33cdd2c4821a15a360703a7778ca2d9205047ea306e95720a52429a55b` |
| Later candidate | 12,025,005 | `894a4209ee8ce53245757dd80cc954a3ef7ca56ad673ecec24ba735d3b4382c6` |
| all-flops | 1,006 | `33339e7a6e32a5608bd31609b2e92b395ae6814f0571ce777bd1fdf24a055cf3` |
| later-runouts | 23,509 | `c8f8e1580778946c3c9c24599fbc381d8ada987f10e7fca691ba3d6c0d718412` |
| joint-defence | 85,833 | `9f4a853c19907b5daeb3483963700ac55d713b7306f3cf3d1f322ff6c7049cd0` |
| simulation | 9,198 | `441eafab7ced1857a98449c33f4d0bc63b81a559b1b161ec43850a515dc87703` |
| simulation-replay | 818 | `052da9a3a616e65d2b550d199d130cfe113a90eb0f857fd727d3d6378c7cf185` |

## Nonblind geometry・全context・安全条件

両保存候補は同じ9BB / 97.5BB geometryを使い、各flop33 nodes / 83 contexts / 9,261 rules、turn475 contexts / 21,753 rules、river623 contexts / 28,413 rules。Later84 nodes / 1,098 contexts / 50,166 rules。各全117 nodesに9tier fallback（297＋756）、全具体contextにflop12 / later5 textures ×9tier。各全1,755flopのsource combo-context countはCO経路22,554,330、HJ経路22,556,868、error / gap / raw warningはいずれも0。各236laterもerror / gap / raw warning0。

これは**幾何学context × source-supported combo tierの構造監査**であり、保存policy historyを経たjoint reachの証明ではない。Later236も全turn/river組合せの総当たりではない。

- 両dead blindsはSB0.5＋BB1BB。初回33 / 75 / 125% wagerは2.97 / 6.75 / 11.25BB。参考MDFは75.1879699 / 57.1428571 / 44.4444444%。33%へ最初にcallする価格はrake後20.9258085%でstandard。
- 初回33% bet→3倍raiseではraise-to8.91BB。未投資のcold responderがcallするとpot29.79・残88.59、SPR2.9738167で**medium**。8.5BBのSB-firstでは同条件SPR3.1618743でdeepとなる。保存各roleの `vs_raise1_behind / cold / standard` はnonblind medium contextを持つ。Blind-first geometryの無条件転記ではない。
- 3人時はoriginal role＝現在position。3→2後もoriginal firstはfirst、original lastはlast、original middleだけfirst / lastになる。全具体ruleで一致し、HU profileへ切り替えない。
- 全absolute_nuts facingとriver current nutsでfold0。Current nutsの最大foldはflop5 / turn8%。Classifier4の現在nutsと将来no-loss十分条件を区別し、certificate陰性を将来敗北可能の断言にしない。Absoluteでもtieはあり得る。
- board_lockedはcheck / call100、fold・bet・raise0。Board_sharedはbet・raise0。River drawはcheck / fold100。Board-onlyとprivate valueを混同しない。
- Residual monsterの最大foldはCO経路flop37 / later63%、HJ経路36 / 62%。Monsterは現在nutsと同義ではなく、2pair以上を広く含むcoarse tierである。全monsterの安全・収益性を証明した値ではない。

### 実保存mixとroleの判断

Bet表記は33 / 75 / 125順。これらは範囲内tierの条件付き頻度で、range全体のbet率ではない。

| Original role / context / tier | CO経路 | HJ経路 |
| --- | --- | --- |
| UTG first / dry_high / monster | check47、bet15・32・6 | check49、bet15・30・6 |
| UTG first / dry_high / strong | check64、bet27・9・0 | check66、bet25・9・0 |
| CO/HJ middle / dry_high / strong | check77、bet19・4・0 | check80、bet16・4・0 |
| BTN last / dry_high / air | check96、bet3・1・0 | check95、bet4・1・0 |
| UTG first / wet_low / strong | check89、bet5・6・0 | check91、bet4・5・0 |
| BTN last / wet_low / monster | check35、bet10・48・7 | check39、bet10・44・7 |

UTG firstはblind donkではなくopener c-bet。CO/HJ middleはUTG check後、BTNの応答を残すfirst-caller probeである。BTNは30.8 / 33.8 combosの狭いsecond callerで、93.7-comboのBTN first-flatや広いHU BTNへ置換していない。Wet-lowの高いmonster bet頻度から、実rangeに大量のmonsterが存在するとは推論しない。

Dry_high / bet33 facing / cold / standard / deepのmediumは、UTG・3人behindでCO経路fold81/call19、HJ経路fold83/call17。UTG fold後の元middle・2人closing/current firstではCO fold66/call34、HJ fold64/call36（すべてraise0）。受け側にも保存mixが直接使われ、HU defence、MDF floor、EVでの頻度補正はない。

元middleのturn blank / strong / aggressor / deep / 残2人ではCOがcurrent firstでcheck55/bet33:28/bet75:17、current lastで49/32/19。HJはfirst58/26/16、last52/30/18。実role・source・現在positionの違いを保持する。ただし全contextを別々に最適化した出力ではなく、shared author context priorsで展開したAI estimateである。

### 相手のoriginal identityを常に分離しないselectorの限界

`mw3PolicyContextKey` と `selectMw3Rule` は、自分のoriginal-role nodeとline・人数・現在position・response・price・SPR・textureを使う。残った相手がoriginal middleかlastかは直接別selectorではない。

例えばCO経路で「UTG check → CO bet33 → BTN fold → UTG call」と「UTG check → CO check → BTN bet33 → UTG call → CO fold」は、次turnでUTG original/current first、2人、defender、pot14.94・残94.53、SPR6.3273092/deepへ合流する。相手はCO flat68.8とBTN overcall30.8という別sourceでも、blank/strongなら同じcheck92/bet33:5/bet75:3。HJ経路の同型は相手56.7 / 33.8でもUTG check93/bet33:4/bet75:3へ合流する。

Runtimeの生存seat/sourceとjoint tupleは別に保持されるが、**policyは異なるremaining-opponent identitiesを同一bucketへ圧縮し得る**。Exactな相手別最適応答・joint reachを解いたとは言えない。これは明示する抽象化限界で、今回schema拡張・数値修正を要求する根拠ではない。

## 共同防御：各97 positive / 11支持0、32 / 39警告

各12代表flop×3初動位置×3size=108 events。各97×20,000=1,940,000、両経路計3,880,000 accepted joint tuples。全positive rowsのseed・samples・確率・MDF・差・区間・警告を独立再集計した。

### 両経路共通の11支持0の内訳。すべて同じ理由ではない

1. KcKd4h / 8c8d2h / 5s5d4cの3paired boards、各first / middle / last bet125で9件。対応初動の**全9tier**のbet125が0。
2. 6h5h2d、2check後のBTN bet125。BTN sourceは88–AAと限られたA/K broadwayで、66 / 55 / 22、低い2pair / straightを作るholdingsがない。合法sourceにはstrong・draw・airがあっても、それらのwet_low bet125は0。保存wet_low nuts12%、monster7%は**非zeroだが、このBTN sourceにはそのtier支持がない**。
3. AhKh4h、2check後のBTN bet125。支持suited handsはすべてAまたはKを含み、Ah / Khがboardにあるため、どの支持classにも合法な2枚heart holdingがない。Source内のset / 2pairはcurrent nutsではなく、monotone_high monster bet125は0。唯一非zeroのnuts3%はこのsourceに支持がない。

すべてreasonは `No policy-supported mw3 range at this history`。追加2件を「全9tierのbet125が0」と誤記せず、支持0をmissing report / sampling failureと混同しない。97 / 11を99 / 9へ正規化しない。

| Original bettor / size | CO経路 overfold / overcontinue / 警告なし | HJ経路 overfold / overcontinue / 警告なし | 各支持0 |
| --- | --- | --- | ---: |
| First33 | 0 / 1 / 11 | 1 / 1 / 10 | 0 |
| First75 | 0 / 2 / 10 | 0 / 2 / 10 | 0 |
| First125 | 4 / 0 / 5 | 4 / 0 / 5 | 3 |
| Middle33 | 0 / 0 / 12 | 2 / 0 / 10 | 0 |
| Middle75 | 0 / 1 / 11 | 2 / 0 / 10 | 0 |
| Middle125 | 6 / 0 / 3 | 8 / 0 / 1 | 3 |
| Last33 | 6 / 0 / 6 | 7 / 0 / 5 | 0 |
| Last75 | 5 / 0 / 7 | 5 / 0 / 7 | 0 |
| Last125 | 7 / 0 / 0 | 7 / 0 / 0 | 5 |

両経路の最大deficitはJs8s5d / 2check後BTN bet125。

| Worst指標 | CO経路 | HJ経路 |
| --- | ---: | ---: |
| 共同続行 | 11.6655890% | 11.9417280% |
| 参考MDF | 44.4444444% | 44.4444444% |
| 差 | −32.7788554pt | −32.5027164pt |
| 保存99.9% Hoeffding区間 | 10.2871023–13.0440757% | 10.5632413–13.3202147% |

Ks8d3c / 2check後BTN bet33もCO経路48.4736680%（MDF75.1879699%、差−26.7143019pt、区間47.0951813–49.8521547%）、HJ経路50.1882555%（差−24.9997144pt、区間48.8097688–51.5667422%）。同boardの75 / 125%への共同続行はCO31.5498025 / 14.0473660%、HJ32.7893885 / 14.2145240%。Overbetだけの問題でも、通常のsampling noiseで片付く差でもない。

CO経路のovercontinue4件:
- UTG first / Th9h8c / bet75：74.4874280%、+17.3445709pt
- UTG first / KcKd4h / bet33：93.6174870%、+18.4295171pt
- UTG first / KcKd4h / bet75：82.4076920%、+25.2648349pt
- CO middle / KcKd4h / bet75：74.9747210%、+17.8318639pt

HJ経路のovercontinue3件はすべてUTG first:
- Th9h8c / bet75：73.9358460%、+16.7929889pt
- KcKd4h / bet33：91.4218600%、+16.2338901pt
- KcKd4h / bet75：78.7349105%、+21.5920534pt

警告39対32という件数だけで相対品質・改善を判定しない。First callerとBTNのsource、条件付きbet支持、保存mixが異なる。

診断は先行checkとbettorの実保存betで条件付け、同一合法3人tuple内の逐次fold確率積を平均する。独立に平均したfold率の積ではない。Original参加者のfold済み札はblockerとして保持されるが、外側3席のfold条件は未モデル化。区間はevent単独の99.9%で、97件同時の99.9%保証ではない。

**品質判断:** Overfold / overcontinueは実質的な残弱点。MDFはrake非考慮 `P/(P+new wager)` のadvisoryで、各handの適正call率・均衡防御・any-two bluffのEVを確定しない。仕様のwarning契約に従い限定estimateとして受け入れるが、均衡的防御を必要とする用途には不十分。警告件数を目標にしたMDF補充やHU移植はしない。初回flop bet以外、raise後、turn/river、全1,755flopのjoint防御は検査済みではない。

## Source集中と必須説明errata

| Source | Weighted combos / positive classes | 22–JJ mass | 代表12boardで最大単一class marginal比率 |
| --- | --- | ---: | --- |
| UTG open（共通） | 212.5 / 49 | 21.882% | 6.639%（KcKd4h、AQo） |
| CO flat vs UTG | 68.8 / 29 | 42.733% | 8.763%（QsJd5c、77） |
| BTN overcall UTG/CO | 30.8 / 13 | 41.883% | 14.201%（AhKh4h、TT） |
| HJ flat vs UTG | 56.7 / 27 | 47.090% | 10.647%（Th9h8c、77） |
| BTN overcall UTG/HJ | 33.8 / 14 | 36.391% | 14.533%（Th9h8c、AQo） |

自分のpreflop frequency×合法combo数のmarginal質量。最大比率だけboard blockerを反映し、他席holecardsやpostflop historyで条件付けていない。12board全てで各sourceのpositive class数は維持される。狭いBTN overcallerの集中によりcoarse tier誤差の影響が大きい。保存joint summaryはper-hand conditional mass / effective supportを持たず、bet/raise後に少数holdingへ集中しないことを全面的に証明していない。

### 正しい説明。原recipe bytesは保持

1. CO経路rationaleの「41.9% 77–JJ」「zero22–66/connectors」は不十分。**BTN_vs_UTG_COcallのpair支持は88–AA、77以下は0**。88–JJ41.883%、QQ+14.610%。「77–JJ」のgroup sum自体は合うが、77支持があるとは説明しない。**AKs30%、KQs60%をcall**し、全suited連結手不在ではない。QJs / JTs / T9s以下は0。
2. HJ経路BTNも**88–AA**。88–JJ36.391%、QQ+13.314%、77以下0。AKs30%、KQs55%をcall。AQo35%が加わり、offsuit Axのmassは23.077%（CO経路11.688%）となる。33.8は30.8より広いが、wide BTN first-flatへ置換してよい意味ではない。
3. First callerを同じ「connector不在」と説明しない。**CO_vs_UTGはAKs10%、KQs60%、QJs65%、JTs50%**、**HJ_vs_UTGはAKs10%、KQs55%、QJs60%、JTs45%**をcallし、両方T9s以下は0。CO pocket支持は33–AA（22は0）、HJは44–AA（22 / 33は0）。
4. 実positive support・頻度は全6sourceともprofileに欠落なく収録され、source fingerprintとgate対象に含まれる。BTN dry_high draw betはCO17 / HJ18%、wet_lowは両18%。Drawを一律排除していない。Historical rationaleの広すぎる表現だけから特定頻度の修正が必要とは結論しない。

今後の説明では本errataを優先する。Historical recipeは誤文を含む履歴として保持する。将来recipeを変更する場合は新identityと必要なgateを用い、既存reportに新hashを付け替えない。

## 計240,000 handsの会計とreplay

各12board×10,000（design8 / holdout4）、全board順・seed/sample・wins+ties・action上限・fold/all-in終端・rake上下限・final stacksを独立確認。開始chipsは301.5BB/hand、各boardのstack+rake目標は3,015,000BB。

| 指標 | CO経路 | HJ経路 |
| --- | ---: | ---: |
| UTG first wins | 32,775 | 32,871 |
| CO/HJ middle wins | 32,628 | 33,617 |
| BTN last wins | 51,185 | 50,006 |
| Ties | 3,412 | 3,506 |
| Fold terminals | 45,158 | 43,085 |
| All-in経験terminals | 2,579 | 2,207 |
| 総rake（BB） | 94,036.93749999323 | 90,559.26749999278 |
| 最大board chip集計絶対誤差（BB） | 1.6530975699424744e−7 | 1.6577541828155518e−7 |

両replayはMATCH。参照simulation objectの独立再計算hashはCO経路 `fd7e57ba7a6700aecc8bfa05c4f5e65dfcb300bf7c6f798d75650b4f91331911`、HJ経路 `0c986edfd515af390be1a112b5367816f1718bb516712992658e6fd5dbf63a6b`。両reportの全236later board配列のcompact JSON hashは `a62aff1544632fa489e8caffe67487ff0e650e08427cb124b7d1d080213fa936`、完全なactual board一覧は上記later-runouts reportに保持される。

Fold terminalとall-in経験は重複可能なので足してhand数と比較しない。Replayは**同じengineによるdeterministic replay**であり、独立solver・独立アルゴリズム・別評価器による全hand再評価ではない。勝数、rake、会計整合、完走数は戦略の強さ・利益・GTO精度を証明しない。固定12boardsは自然flop確率による重み付き標本でもない。

## 後工程と残余限界

- 本書の受入れは上表でACCEPTABLEとした候補に限定する。未完成gate、未review経路へ承認を延長しない。
- 粗いtier内のkicker/blocker/draw quality、board_shared内の役の差、historyと相手original identityの圧縮、限定later/joint標本、外側fold条件なしを残す。
- 大きなjoint deficitとpaired-board overcontinue、tight BTN集中は将来のauthor改善対象になり得る。改善は新author判断・対応証拠として扱い、自動frequency repairは入れない。
- 実Range/Agentのflop→riverブラウザQA、HU不変性の最終統合回帰、tests/typecheck/build、LFS現物送信・復元・receipt、strict local D1、公開registry、本番承認は別gate。Cloud URL security-policy blockerを回避しておらず、private Mac QA handoff準備をQA済みと扱わない。
- 本reviewが書いた成果物はこの文書だけ。Source、policy、metadata、recipe、registry、receipt、元report、他者の変更は編集していない。

**結論: 両候補は警告・errata・抽象化限界を伴う限定AI estimateとしてACCEPTABLE。数値・構造の必須修正なし。均衡品質・公開のGOではない。**
