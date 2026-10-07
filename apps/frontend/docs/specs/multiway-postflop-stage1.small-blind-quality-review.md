# 3人ポストフロップ段階1：HJ/CO・UTG/BTN・SB-first の独立品質レビュー

更新: 2026-10-04 23:19 UTC。対象profileをauthorしていない独立Astra reviewerによる実保存物の確認。

## 判定

| 保存候補 | 独立判定 | 数値・構造の必須修正 | 共同警告 |
| --- | --- | --- | --- |
| HJ_open_CO_call_SB_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 30（overfold27 / overcontinue3） |
| UTG_open_BTN_call_SB_call V1 | **ACCEPTABLE：限定AI estimate** | 今回の範囲ではなし | 29（overfold26 / overcontinue3） |

両候補ともsource・保存mix・完成gateの整合と安全条件を確認した限定受入れ。**均衡性、GTOへの近さ、最適性、利益、実戦相手への頑健性の承認ではない。** 2check後の125% betに共同続行が約18% / 16%しかない大きなoverfoldが残る。小さいbetへの不足とpaired boardでの過剰続行もあり、警告件数30 / 29を品質改善や問題解消の証拠にしない。

SB-firstという共通形だけで先行SB候補の受入れを転記していない。今回SBは26.5 weighted combos / 12classesと24.1 / 10classesで、pair比率約65%、代表board上の単一class marginal比率は最大20.0% / 20.9%。粗いtier内の誤差が全体へ強く効くsourceである。実支持と各roleの保存頻度を個別に確認した。

Historical rationaleの「77–JJ」「no connectors」は下記の**必須説明errata**で訂正する。支持の欠落、drawの一律排除、これらの誤文から特定頻度の再authorを要する具体的欠陥は確認できなかった。Recipe-pinned profile・candidate・reportは保持する。公開 `MW3_APPROVED_POLICIES` は空、metadataは `candidate_pending_independent_review` のまま。本書は公開registry、release receipt、実LFS、strict local D1、実ブラウザQA、本番反映のGOではない。

## 実施した独立確認と境界

- 保存候補4本＋完成report10本、**全14現物**のbytes長とraw SHA-256を各proof inventoryと照合。UTG gate完成通知後に両方を再照合した。
- 現在の3 preflop source spot・seat順・dead blinds・pot/stack・sizing・rake・classifier4からsource materialを別Pythonで再構成。Profile・stable-source fingerprints・候補・全reportと一致。全6sourceのpositive support配列・実頻度・weighted combosも別途照合した。
- 選択profile、共通context-judgments、emit、registryの4-file recipe、semantic13ファイル、verification8ファイルを現物文字列からhashし、一致を確認した。
- 合計**121,968 rules**を一度に大きいpolicyを1本だけ読み、全117-node inventory、合法action集合、整数0–100・sum100、重複selector identity、7selector domain、9tier fallback、各具体contextの全texture×9tierについて確認。各180件、計360件のflop residual-tier初動anchorは保存bet総量と一致した。
- 全original roleと現在position、absolute/current nuts、board安全tierを確認。SB pot8.5BBのcent丸め・価格・SPRを検討し、BB/nonblind geometryをそのまま当てはめていない。
- 各108 joint eventsの完全inventory、90×20,000 accepted samples＋18支持0、cent丸めMDF、確率・差・区間・警告分類を独立に再集計。支持0は実該当初動の全9tierでbet125が0であることまで確認した。
- Laterの選出規則を軽いPythonで再構成し、両reportの**全236 actual boardsの配列・順序**と照合。Turn45 / river191。
- 計24board・240,000 handsの保存simulationについて、board順・design/holdout・seed・sample・勝敗・action/terminal・rake/stack会計を別Pythonで確認。両replayのexact simulation object hashも一致した。

**Node、npm、tests、esbuild、policy compile、geometry probe、all-board audit、joint sampling、simulation/replayは本reviewでは起動していない。** 完成済み実gateを保存証拠から検証したことと、reviewerが再実行したことは区別する。全chip-state witnessは、spot固有witnessをreplay検証するemitterの読取確認と同identityの完成gateに依拠する。全stateの独立再探索、別showdown evaluatorによる全hand再評価は行っていない。

Execution logsでHJ→CO→SBは23:01:33 UTC、UTG→BTN→SBは23:13:46 UTCのDONEを確認。後者のreport受入れは完成通知・完成inventoryの後。開始HEADは `d26b10eac581febbd1e85815fbd6483a288e4955`、最終照合HEADは `666c722a30ec776471910d343446b9d3bebf893f`（tree `c8c41fabe55b1e568ab45f700a4e030a28c5daca`）。その間の変更はresult/review文書、acceptance-evidenceの限界記述と対応testであり、数値13・検証8・対象recipeは現在hash一致。Contract-cache release helperも数値13/検証8の外側で、key/probe/contract内容は変えていない。これらのHEADで全量gateを新規再走したという主張ではない。

## 固定identityと現物

共通: 100BB、2.5BB open、2人call、開始pot8.5BB、各残stack97.5BB、外側dead blindはBB1BB、5% rake・cap3BB。Original first/middle/lastはSB/HJ/COとSB/UTG/BTN。Semantic roleは両方second caller/opener/first caller。外側でfoldする3席のholecardsとそのfold条件は未モデル化。

| Identity | HJ → CO → SB | UTG → BTN → SB |
| --- | --- | --- |
| Source | `d9d3209ec4900d28ca2d8259c813c5bd48d4019528f2123cc6ed168e22c8cbb1` | `2aa18f5793aa280d843bd3f175f391cc3409186c21e08bcc7b63570aab558858` |
| Recipe | `b1ca0839a10036b61b42ebf305a93829b9349604f09e12daacb6ebf770b35c4a` | `44ca4712c2382d8b16a564dcfd5f03fe7876d682252f1a9b551427fa200feb54` |
| Flop policy | `78a92f687a5a4fcc623ae4b91608d12eead3592c8ab9b07244e1b2858a8a33fa` | `c608d2b4eeaf2c9419f27fb7fa9ed818ee07ecb370e704db92268fcb806612d7` |
| Later policy | `1382306ac507d03a34e8222e9543e809c6fdd164470df7eaafafe76f69fb2586` | `2616b7536253785714314be66ae6084d7ae8004dbf8773cf5e183b22bc7396f7` |
| Replay対象simulation object | `2f2fd6bd73315fc2860376ea221fa14435661467aa468af4bf8c23b56b0e04f1` | `45df209c1ea19df2ddc20bf90cb723571c3b4f47c916c01934d965f6a8b8e69c` |

共通implementation: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`。

共通verification: `92b946dfc5c87359dcb3e610e832e262c2d3ac366110f295968eca2f7392c088`。

Metadataはschema3、model `gpt-6-astra`、strategy `ai_estimate_not_gto`、author version1。Author taskは `mw3-hj-co-sb-mw3-srp-v1-authored-v1` / `mw3-utg-btn-sb-mw3-srp-v1-authored-v1`。各flop/later共通generated_atは `2026-10-04T22:53:30.583Z` / `2026-10-04T23:05:36.299Z`。

### Raw bytesとSHA-256

元inventoryは `.local/postflop-ai/mw3/remaining-thirteen-run-v1/HJ_open_CO_call_SB_call.proof-inventory.json` と `UTG_open_BTN_call_SB_call.proof-inventory.json`。以下はinventory転記だけでなく現物をhash・長さ照合した値。

| ファイル | HJ → CO → SB bytes / raw SHA-256 | UTG → BTN → SB bytes / raw SHA-256 |
| --- | --- | --- |
| Flop candidate | 2,485,694 / `c6623fe05f3ac9ecf48f187c8607efcf6a093d6cca4f1d3edee6c8bf589eada3` | 2,485,703 / `a4c9201c7bc9a56b505e1ff6368860a5d4c5243ed66099ea051b936f3ecce381` |
| Later candidate | 12,162,577 / `e7065606016f7bc89ca116cbb19abaa7baa8718e377066ce5df10e68ffd9cc71` | 12,162,609 / `641c221f964014593310b991c46f7a6acaa78ebffaebd4d4632fa930948db474` |
| all-flops | 1,004 / `1ca4772cde929a1a8bc9b15624ce6664f0af2d27f996f2b80d17860741bb17b0` | 1,006 / `7e46a9c3d11e5bf779fddb70a34a4bf00132a43f0491b7072e06268dc1ef7273` |
| later-runouts | 23,507 / `f920d860e4eadd9315be5afb894c34830c665e939abf9f3e64e20132567ae933` | 23,509 / `d534607a782befb937ebb2e2640f1d20f3774512b1dbc94309ef446ead446ac1` |
| joint-defence | 80,330 / `77eb44c8e92e8a1bc8dacec87f557dd23d0ad60d1d32e4393e96ca91d486e906` | 80,503 / `f1ab1e4007a56cafe6f2c5e41a98b4418e8ec316aa8db9cb5b04d5eb16d8cd70` |
| simulation | 9,147 / `eca74d7fe6c8e56b851f29186e0258cf587160b2f5af0a8ad440b82cc65a6543` | 9,194 / `3f4509cf0f72568ea6543d9302a8d86573cfb3a2e7eee7dc069a44ee8d761165` |
| simulation-replay | 816 / `f3f5083bf692219fc31fd8d7f812e334b15abd8741ffb0c4947a11585cf609f4` | 818 / `188147137b3349dfd0a84054aa95a944710dfb4189c4ad6cb8e244d1e5c961f4` |

Report directories:

- `.local/postflop-ai/mw3/gates/hj-co-sb-mw3-srp-v1/v1-d9d3209ec490-4ec6b527f8e2-92b946dfc5c8-b1ca0839a100/`
- `.local/postflop-ai/mw3/gates/utg-btn-sb-mw3-srp-v1/v1-2aa18f5793aa-4ec6b527f8e2-92b946dfc5c8-44ca4712c238/`

Raw file hash、内側policy hash、simulation object hashは別物。両reportの全236 `results[].board` を順にcompact JSON化したhashは `a62aff1544632fa489e8caffe67487ff0e650e08427cb124b7d1d080213fa936`。完全なactual board一覧は上記各 `later-runouts.json` に保持され、生成規則とも独立照合した。

## 全node/context・SB geometry・安全tier

| 構造 | HJ → CO → SB | UTG → BTN → SB |
| --- | ---: | ---: |
| Flop nodes / concrete contexts / rules | 33 / 92 / 10,233 | 33 / 92 / 10,233 |
| Turn contexts / rules | 482 / 22,068 | 482 / 22,068 |
| River contexts / rules | 629 / 28,683 | 629 / 28,683 |
| Later nodes / contexts / rules | 84 / 1,111 / 50,751 | 84 / 1,111 / 50,751 |
| Flop source combo-context count | 33,316,470 | 26,640,546 |

全117nodesに9tier fallback（flop297 / later756）。Priority100には全7selectorを明示し、各contextにflop12 / later5 textures×9tierが完全。全1,755flop、236laterでerror・gap・raw warningは0。共通geometryでcontext数が同じであることは、異なるsourceのpolicy joint reachが同じという意味ではない。

この監査は**幾何学context × source-supported combo tier**の構造監査で、保存policy historyを経たjoint reachの証明ではない。Later236は全turn/river card組合せの総当たりでもない。全witnessをPythonで再探索したとは主張しない。

初回33/75/125% wagerは **2.81 / 6.38 / 10.63BB**、参考MDFは **75.1547303 / 57.1236559 / 44.4328280%**。33%へのrake後call priceは20.9482630%でstandard bucket。125% betへのcall後はpot29.76BB、残86.87BB、SPR2.9190188でmedium。BB8BBの場合の同分岐SPR3.125/deepをコピーしていない。

- 全absolute_nuts facingとriver current nutsはfold0。Current nutsの最大foldはflop5% / turn8%。Classifier4の私有札寄与、現在nuts、将来no-loss十分条件、board-only tiersを分離する。Certificate陰性から将来敗北可能を断定せず、positiveでもtieはあり得る。
- board_lockedはcheck/call100、fold/bet/raise0。board_sharedはbet/raise0。共有boardの役をprivate valueとして扱わない。
- 全具体ruleで3人時はcurrent positionとoriginal roleが一致。3→2後は元firstがfirst、元lastがlast、元middleのみfirst/lastとなる。元seat/sourceはruntimeに残り、HU profileへ切り替わらない。
- 受け側も保存mixを直接使用。HU defence、MDF floor、EV修正、警告件数を目標にしたfrequency自動補充はない。

### 実保存mixと元roleの違い

Dry high初動。Bet表記は33 / 75 / 125の順。

| 条件 | HJ → CO → SB | UTG → BTN → SB |
| --- | --- | --- |
| SB first monster | check75 / bet7・18・0 | check76 / bet7・17・0 |
| SB first strong | check92 / bet6・2・0 | check92 / bet6・2・0 |
| Opener strong、SB check後 | HJ check56 / bet33・11・0 | UTG check52 / bet36・12・0 |
| Last first-caller air、2check後 | CO check94 / bet5・1・0 | BTN check94 / bet5・1・0 |
| SB draw / wet_low | check87 / bet5・8・0 | check88 / bet5・7・0 |

強いSBを理由に広いdonkや低boardの自動stealを作っていない。UTGの高board strongはHJよりbetが多い一方、wet_low strongはUTG13% / HJ14%で、一律にUTGを上乗せしたものでもない。Last COとBTNの一部anchorが同じでも、wet_low strongは24% / 20%、drawは19% / 20%などsource別の違いがある。共通author context priorsからの展開であり、全contextを独立に最適化したsolver出力ではない。

Dry high / bet33 facing / cold / standard / deepのmediumは、SBが3人behindならfold72/call28とfold74/call26。SBがfoldして元middleのopenerが2人closing・現在firstになるとHJ fold71/call29、UTG fold68/call32（全てraise0）。実mixにも薄い防御が残り、構造PASSを防御品質良好と読まない。

元middleのturn blank / strong / aggressor / deep / 残2人では、HJは現在firstでcheck60/bet33:25/bet75:15、現在lastで54/29/17。UTGはfirstで56/27/17、lastで50/31/19。元roleと現在positionの両方を維持した保存mixである。

### 相手のoriginal identityはpolicy selectorに常に分離されない

先のrole-quality-reviewの制約を維持する。`mw3PolicyContextKey` と `selectMw3Rule` は自分のoriginal-role nodeとline・texture・人数・現在position・response・price・SPRを使うが、残った相手が元middleかlastかを直接別selectorにはしない。

今回の具体例: 「SB check → HJ bet33 → CO fold → SB call」と「SB check → HJ check → CO bet33 → SB call → HJ fold」は、次turnでどちらもSB original first/current first、2人、defender、pot14.12BB、残94.69BB、SPR6.7060907/deepへ合流する。相手はHJ open312.0とCO flat83.1という異なるsourceでも、blank/strongなら同じcheck88/bet33:7/bet75:5を使う。UTG/BTNでも同様で、相手source212.5 / 93.7の違いはこのselectorを分離せず、SB blank/strongはcheck89/bet33:7/bet75:4。

Runtimeのlive seats/sourceやjoint tuplesが失われたという意味ではない。**Policyは異なるremaining-opponent identitiesを同じbucketへ圧縮し得る**。正確な相手別最適応答、history全体に条件付けた戦略を得たとは主張しない。これは現行抽象化の限界であり、今回schema拡張やfrequency修正を必須化する根拠ではない。

## 共同防御：30 / 29警告を残す

各12代表flop×3初動位置×3size=108 events。90 events×20,000合法3人tuples=1,800,000 accepted samples、両方計3,600,000。18支持0はSB firstのbet125全12boardと、paired3boardでopener/last各bet125。全9tierの保存bet125が0で、reasonは全件 `No policy-supported mw3 range at this history`。欠落eventや不完全samplingを隠したものではない。

| 元bettor / size | HJ-CO-SB overfold / overcontinue / 警告なし | UTG-BTN-SB overfold / overcontinue / 警告なし |
| --- | --- | --- |
| First 33 | 5 / 0 / 7 | 4 / 0 / 8 |
| First 75 | 4 / 0 / 8 | 3 / 0 / 9 |
| First 125 | 支持0：12 | 支持0：12 |
| Middle 33 | 0 / 1 / 11 | 2 / 1 / 9 |
| Middle 75 | 0 / 2 / 10 | 1 / 2 / 9 |
| Middle 125 | 5 / 0 / 4 | 5 / 0 / 4 |
| Last 33 | 3 / 0 / 9 | 2 / 0 / 10 |
| Last 75 | 3 / 0 / 9 | 2 / 0 / 10 |
| Last 125 | 7 / 0 / 2 | 7 / 0 / 2 |

Middle/last125には各3支持0を別に含む。両方の最悪deficitは2check後のlast bet125だが、boardは異なる。

| Worst指標 | HJ→CO→SB / As7d2c / CO bet125 | UTG→BTN→SB / Ks8d3c / BTN bet125 |
| --- | ---: | ---: |
| 共同続行 | 17.9774360% | 15.6431000% |
| 参考MDF | 44.4328280% | 44.4328280% |
| 差 | −26.4553920pt | −28.7897280pt |
| 保存99.9% Hoeffding区間 | 16.5989493–19.3559227% | 14.2646133–17.0215867% |

**Ks8d3c・2check後の33% bet**にも共同続行54.9019020% / 51.5446140%、差−20.2528283 / −23.6101163ptが残る。区間は53.5234153–56.2803887% / 50.1661273–52.9231007%。同boardの75%は39.0564135 / 34.3333625%、125%は18.2000420 / 15.6431000%。HJ経路では同boardのSB first bet33も51.8372365%（差−23.3174938pt）で、2check後やoverbetだけに限らない。

各3overcontinueはすべてSB check後のopener bet:
- Th9h8c / bet75: HJ73.5994775%（+16.4758216pt）、UTG72.4846040%（+15.3609481pt）
- KcKd4h / bet33: HJ92.8470085%（+17.6922782pt）、UTG91.1346600%（+15.9799297pt）
- KcKd4h / bet75: HJ80.1171045%（+22.9934486pt）、UTG76.7688020%（+19.6451461pt）

診断は先行checkとbettorの実保存betで条件付け、同一合法3人tuple内の逐次fold確率の積を平均する。独立平均fold率の積ではない。元参加者がfoldしても札はblockerとして残すが、外側3席のholecards/fold条件は未モデル化。区間は各event単独の固定sample Hoeffding 99.9%区間であり、90件同時の99.9%保証ではない。大きな差を通常のsampling noiseで片付けない。

**品質判断:** 過剰foldと一部過剰続行は実質的な残弱点。参考MDFはrake非考慮の `P/(P+new wager)` で、各handの正しいcall率、均衡防御、any-two bluffのEVを与えない。仕様のwarning契約に従い、弱点を明示した限定estimateとして受け入れる。均衡的防御が必要な用途には不十分。自動MDF補充、HU defence移植、EVでのfrequency修復はしない。初回flop bet以外、raise後、turn/river、全1,755flopの共同防御まで検査済みとはしない。

## Source集中と必須説明errata

| Source | Weighted combos / positive classes | 22–JJ mass | 代表12boardで最大単一class marginal比率 |
| --- | --- | ---: | --- |
| HJ open | 312.0 / 64 | 18.269% | 4.593%（AhKh4h、QJo） |
| CO flat vs HJ | 83.1 / 38 | 38.628% | 6.639%（Th9h8c、AQo） |
| SB overcall HJ/CO | 26.5 / 12 | 52.075% | 20.000%（AhKh4h、99） |
| UTG open | 212.5 / 49 | 21.882% | 6.639%（KcKd4h、AQo） |
| BTN flat vs UTG | 93.7 / 35 | 34.578% | 8.073%（Th9h8c、KQo） |
| SB overcall UTG/BTN | 24.1 / 10 | 48.548% | 20.896%（AhKh4h、TT） |

自分のpreflop frequency×合法combo数で算出したmarginal質量。最大比率だけboard blockerを反映し、他席holecardsやpostflop historyには条件付けていない。12board全てで各sourceのpositive class数は維持される。SBの強い集中を、先行SB37.2/16や34.6/14と同じ広さと説明しない。

SB_vs_HJ_COcallのpair支持は**88–AA**。88–JJ52.075%、QQ+12.453%、pair全体64.528%。SB_vs_UTG_BTNcallは**99–AA**。99–JJ48.548%、QQ+17.427%、pair全体65.975%。残りは限られたbroadway系だが、「premium pairだけ」「suited drawなし」ではない。過去HJ/BTN/SBと比べ今回HJ/CO/SBはATs50→0、AQo40→0、KQs50→40、88:65→50で、同じHJ openでも実overcallerが別sourceである。UTG/BTNはBB経路とopener/first-caller sourceが同じでも、SB24.1とBB199.4の違いを独立評価した。

### 訂正文。この説明を今後の要約で優先し、原recipe bytesを保存

1. HJ/CO/SB rationaleの「52.1% 77–JJ」は質量の大きさには整合するが、77支持があると読ませてはいけない。**77以下は0、88–JJが52.075%**。また「no connectors」「Do not invent suited-connector semibluffs」を全suited連結手不在として読めば誤り。**AKs20%、KQs40%をcall**する。QJs/JTs/T9s以下は0、AQs45%、AJs55%、AKo25%も支持される。
2. UTG/BTN/SBの「48.5% 77–JJ」「no 22–66/connectors」も不足。**88以下は0、99–JJが48.548%**。**AKs30%は支持**され、KQs以下のsuited連結手は0。AQs50%、AJs50%、AKo25%、AA/KK各20%、QQ30%を保持する。
3. Opener/first callerへSBの狭さを転記しない。**CO_vs_HJはJTs55%、QJs55%、KQs55%、T9s45%、98s30%**、**BTN_vs_UTGはJTs80%、QJs75%、KQs70%、T9s50%**をcallする。今回のSB sourceとは別。
4. 全6sourceの実positive行・頻度とprofile支持配列は一致。上記handはsource fingerprintと実gateに含まれ、保存SB draw betはdry_high7 / 6%、wet_low13 / 12%。誤文によるdraw一律排除やsourceからの手札脱落はない。具体的な数値・構造欠陥を示さずに再authorは要求しない。

原rationaleは誤りを含む履歴として保持し、新しい説明では本errataを優先する。将来recipeを変更する場合は新identityと必要なgateを用い、既存reportへ新hashを付け替えない。

保存joint summaryにはper-hand conditional mass / effective supportがない。したがって、bet/raise後に少数handへ集中しないことを全面的に確認したとは言えない。とくに10/12classのSBではcoarse tier内のkicker/blocker/draw quality差に敏感で、この限界を残す。

## 240,000 handsの会計とreplay

各12board×10,000=120,000 hands。全board順、design/holdout、seed/sample、wins+ties、action上限、fold/all-in終端、rake上下限とfinal stacksを独立確認した。両方とも開始総chipsは301BB/hand、各boardのstack+rake目標は3,010,000BB。

| 指標 | HJ → CO → SB | UTG → BTN → SB |
| --- | ---: | ---: |
| SB first wins | 50,147 | 49,073 |
| Opener middle wins | HJ31,611 | UTG33,668 |
| First-caller last wins | CO35,261 | BTN33,845 |
| Ties | 2,981 | 3,414 |
| Fold terminals | 39,549 | 38,234 |
| All-in経験terminals | 2,096 | 1,878 |
| 総rake（BB） | 84,340.21200000925 | 84,167.83600000922 |
| 最大board chip集計絶対誤差（BB） | 1.6530976e−7 | 1.6344711e−7 |

Fold terminalとall-in経験は重複可能なので、足してhand数と比較しない。両方の全量replayはMATCH、参照するexact simulation object hashも一致。**同じengineのdeterministic replay**であり、独立solver・独立アルゴリズム・別評価器による全hand再評価ではない。別実装の集計会計検証、SBの勝数、rakeや完走数も戦略の強さ・利益・GTO精度を証明しない。固定12boardは自然なflop確率で重み付けしたものでもない。

## 後工程と残余限界

- 先行9経路と今回2経路の限定受入れは、未reviewの残5経路への承認ではない。各実source/geometry/original roles、同じ全量gateと独立品質reviewを維持する。
- 粗いtier、board_shared内の役の差、kicker/blocker/draw qualityの圧縮、相手identityまで圧縮し得る7selector、限定later/joint標本、外側fold条件の未モデル化を残す。構造coverageとpolicy joint reach、保存mixと均衡性を区別する。
- 共同防御の大きなdeficit、paired boardのovercontinue、狭いSBのclass集中は将来author改善の対象になり得る。改良は新しいauthor判断と対応証拠として扱い、自動frequency repairは入れない。
- 実Range/Agentのflop→riverブラウザQA、HU不変性の最終統合回帰、tests/typecheck/build、LFS現物の送信・復元・receipt、strict local D1、公開registry、本番承認は別gate。Cloud URL security-policy blockerを回避しておらず、private Mac QA handoff準備をQA済みと扱わない。並行作業のD1 owned-process adapter実装も本書では動作承認していない。
- 本reviewが書いた成果物はこの文書だけ。Policy、source、metadata、recipe、registry、receipt、元report、他者の変更は編集していない。

**結論: 両候補は警告・errata・抽象化限界を伴う限定AI estimateとしてACCEPTABLE。必須の数値・構造修正なし。均衡品質・公開のGOではない。**
