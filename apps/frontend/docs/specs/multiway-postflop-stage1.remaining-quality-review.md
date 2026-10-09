# 3人ポストフロップ段階1：新15経路の個別品質レビュー

更新: 2026-10-04 21:23 UTC。独立レビュー: Astra。今回の受入れ対象は先頭2経路のみ。

## 判定

**HJ_open_BTN_call_BB_call / HJ_open_CO_call_BB_call の保存済みV1を、限定されたAI estimate候補として受け入れる。** 実保存値・source・意味・reportの不一致、分類の安全条件違反、再authorを必須とする未修正の論理破綻は見つからなかった。残13経路は、既にレビューした各自のauthor profileから個別compileし、同じ全量gate・独立品質レビューへ進めてよい。

この判断は37件 / 39件の共同防御警告を弱点として残した受入れである。とくにdry high boardで2check後の33% betへの過剰foldが大きい。均衡性・最適性・GTOへの近さ・利益・実戦相手への頑健性を認定しない。警告数を下げるためのMDF floor、HU defence、EVによる自動補充は加えない。

候補metadataの `candidate_pending_independent_review` は変更していない。この文書は候補品質の記録であり、公開registry、release receipt、LFS/D1、本番反映の承認ではない。残13の実保存物は今回の受入れに含まない。

## 検証方法と証拠範囲

実保存の候補4本・report10本を読み、軽いPython処理で次を独立照合した。Node、compile、probe、joint sampling、simulation、全board auditは再実行していない。

- 14ファイルのraw bytes長とSHA-256、保存policyのcompact JSON hash、全reportのidentity。
- 現在の3 preflop source spot・geometry・sizing・rake・classifier4からsource materialを別実装で再構成。
- 選択profile・共通context・emit・registryの4ファイルからrecipe hash、意味13ファイルと検証8ファイルからそれぞれのhashを再計算。
- 各61,506 rulesの合法action集合、整数0–100、総和100、node inventory、重複、9tier fallback、各具体contextの全texture×tier。
- Joint reportの108 event全体、sample数、確率・MDF・差・区間・警告区分を再照合。
- 各自己対戦reportの12board、seed、勝敗・終端・action数・chip/rake集計を別Pythonで再検証。Replayが指すsimulation object hashも照合。
- 著者profileのsource支持と実保存mixの代表条件を照合し、source側のhand-class集中を集計。

全て一致した。元の実gate実行は `.local/postflop-ai/mw3/first-two-run-v1.master.log` に記録された2026-10-04 20:53:38–21:09:59 UTC。今回の読取開始時HEADは `37ba8e3b6cec0ef3e46a716ccb39e309fdcb8e0c` だが、reportをこのHEADで再実行したとは扱わない。再利用の根拠は下記の実bytesと依存hash一致である。

## 固定identity

両方とも100BB、HJ 2.5BB open、2人がcallする3人SRP。初期pot8BB、残りstack各97.5BB、5% rake・cap3BB。元の役割はBB first、HJ middle、BTNまたはCO last。

| 項目 | HJ → BTN → BB | HJ → CO → BB |
| --- | --- | --- |
| Source | `6762971b2c93bc1d26aec6a2e82cc9292a03fb22e6cc497c9b0e346ae3f9df45` | `23bc49a7a78a03506d6f0d73dfd541dc5cc81397b26a7338f47810f7326843c2` |
| Recipe | `6ed2c1b57e8db6a86a5b25ece5211aa118c03e5282ac78747b5ac4df5db6ebd2` | `ca64537c3042dfc07605e82c48abeaea06dbb4f3d1a801e6c07bf54508e0e4e7` |
| Flop policy | `6f6a824c47368119bfe3ac6761e0ac5993f9eec3a352d505ce949e5c0b76b593` | `ddee6d15195c7b205e52b0c2d8da2dc32258ac1a1cdaeb61f3213877a65e4b0f` |
| Later policy | `764e2765a604e30c5e981b481946918de916004e135d7b98619aa9670185b33c` | `c97fae4f58b39daaab0497253ae27e84b48527b492ccb687dffccd70c87d7403` |
| Replay対象simulation object | `77c50bcce50afbe4204acf9f2a25d27a94efb90290e5143c133cf531bbb79865` | `001709aec6184ec0411b0481f2ad452ade9577087224862206a5cb1a67a2f028` |

共通implementation: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`。

共通verification: `92b946dfc5c87359dcb3e610e832e262c2d3ac366110f295968eca2f7392c088`。

Flop/later metadataはschema3、model `gpt-6-astra`、author version1。生成時刻はそれぞれ `2026-10-04T20:53:41.276Z` / `2026-10-04T21:01:41.397Z`。Author taskは `mw3-hj-btn-bb-mw3-srp-v1-authored-v1` / `mw3-hj-co-bb-mw3-srp-v1-authored-v1`。

### 実ファイルhash

完全path・bytes・identityは `.local/postflop-ai/mw3/first-two-proof-inventory.json` にあり、その一覧から実ファイルを開いて独立検証した。候補は `.local/postflop-ai/mw3/<slug>-policy.json` と `<slug>-later-policy.json`。

| ファイル | HJ → BTN → BB raw SHA-256 | HJ → CO → BB raw SHA-256 |
| --- | --- | --- |
| Flop candidate | `bdbf6d3bab4cedccb6ad2b58fe3cffc0ef3922a0cac63006ce7dc2cbfeb1ec2a` | `113fddefcedabb8f36243491f0095b58cc2e5468c5c7ac6e19a325c78faac813` |
| Later candidate | `ba643e6498a4c13f2f65916e7e685d508ef49ad5ed65c4ca786724a4107180b0` | `4e584f57668c78d48a221277cdcfce2ddfe5e5a8845e403a4bcb686e4cdff33f` |
| all-flops | `f5c631b3f9bf1f478838b0901e491877bc47766cb0693fe48657ad4aa223ad08` | `6113b0c56555f0c469aba181745a856c529fde3e21b4269a144dfd97444ecf7a` |
| later-runouts | `6bd77eca5e7784731e2255985ec8918fbdc2ea86b7642afef1f8a3ec98ffe65a` | `e8b543ba99c57ec7dc44b3d14da1a1780a55aabc25e8a306d40ac91e063b6f5d` |
| joint-defence | `fbf183a79a554bc5d571f020d2f0e72cbf01857399098262464d87d8726d8ae5` | `54710b466326e6dab1d121cc6804ca4e839f71ca6bff76720d51979a00094188` |
| simulation | `872c83cb82e922d7b0a259823e1bb9cff613373b21c10f0bcecd28303126262b` | `f86c769cad86021febeee2f0d3dbf7b47c6b7eee53d5e21af64513e72cb2bb2e` |
| simulation-replay | `d6747f149c91ca4ebcb22982093e7f6f8c98264cfb289d51f623f147f2742048` | `5af2295c46190554daefde4594a425a4e5dad8bc40769e33f8c2db4634f1fd24` |

Report directoriesはそれぞれ:

- `.local/postflop-ai/mw3/gates/hj-btn-bb-mw3-srp-v1/v1-6762971b2c93-4ec6b527f8e2-92b946dfc5c8-6ed2c1b57e8d/`
- `.local/postflop-ai/mw3/gates/hj-co-bb-mw3-srp-v1/v1-23bc49a7a78a-4ec6b527f8e2-92b946dfc5c8-ca64537c3042/`

候補のbytesはBTN経路2,588,525 / 12,187,549、CO経路2,588,562 / 12,187,952。Raw file hashとpolicy/object hashを混同しない。

## 構造と実保存profile

両経路ともflop33node・96具体context・10,665 rules（297 fallback）、later84node・1,113具体context・50,841 rules（756 fallback）。各具体contextはflop12textureまたはlater5texture×9tierが完全である。7selectorを全て明示したpriority100とall-any priority0を保存し、重複なし。

全1,755flop reportのcombo-context数は50,920,110 / 47,555,730、構造error・明示selector gap・raw warningは全て0。Laterは236 board、内訳turn45・river191で、同じくerror/gap/raw warning0。

全保存ruleでabsolute_nuts facingはfold0、river nutsもfold0、board_lockedはcheck/call100、board_sharedはbet/raise0。現在nutsの最大foldはflop5%・turn8%で、既存classifier4の将来no-loss証明が成立するhandとは別tierである。3→2後も元のroleを維持した専用保存mixを使う。

実dry_high初動の例:

| 条件 | HJ → BTN → BB | HJ → CO → BB |
| --- | --- | --- |
| BB monster | check75 / bet33:7 / bet75:18 | check77 / bet33:7 / bet75:16 |
| HJ strong、BB check後 | check46 / bet33:40 / bet75:14 | check48 / bet33:38 / bet75:14 |
| 最後席air、2check後 | check84 / bet33:13 / bet75:3 | check88 / bet33:10 / bet75:2 |

いずれもこの例のbet125は0。広いBBのdonk、HJのc-bet、最後席のstabが同じprofileに潰れていない。CO flatの密なpair支持に対する個別anchor差も保存物へ反映されている。

## 共同防御警告の判断

各経路は代表12flop×3初動位置×3bet sizeの108 eventsを重複なく扱う。そのうち90 events×20,000合法tuples=1,800,000 accepted samples。18 eventsは保存bet支持0で、BBの125% lead全12件と、paired flop上のHJ/最後席125%各3件。欠落eventを無言で捨てたものではない。

| Bettor / size | BTN経路 overfold / overcontinue / 警告なし | CO経路 overfold / overcontinue / 警告なし |
| --- | --- | --- |
| BB 33 | 2 / 0 / 10 | 1 / 0 / 11 |
| BB 75 | 1 / 1 / 10 | 0 / 1 / 11 |
| HJ 33 | 3 / 0 / 9 | 3 / 0 / 9 |
| HJ 75 | 1 / 0 / 11 | 2 / 0 / 10 |
| HJ 125 | 8 / 0 / 1 | 8 / 0 / 1 |
| 最後席 33 | 5 / 0 / 7 | 7 / 0 / 5 |
| 最後席 75 | 7 / 0 / 5 | 8 / 0 / 4 |
| 最後席 125 | 9 / 0 / 0 | 9 / 0 / 0 |

最悪deficitは両方とも **Ks8d3c（内部ID [47,25,4]）、BB check → HJ check → 最後席 bet33**。継続率は43.0757705% / 41.8584280%、参考MDF75.1879699%との差は−32.1121994 / −33.3295419 percentage points。99.9% fixed-sample Hoeffding区間は41.6973–44.4543% / 40.4799–43.2369%。この大きな差を通常のsampling noiseとして扱えない。

同じeventの既存CO→BTN→BB V4は継続44.6708900%、差−30.5170799ptであり、新2本はこの弱点を解消していない。最大deficitだけが大きいbetに限定されるという説明も不正確である。

保存mixからも慎重なmedium防御が見える。Dry high・33 facing・deep・coldで、BBが3人behindの場合のmedium続行は22% / 20%、そのBBがfoldしHJが2人closingとなる場合は39% / 37%。前者のfold/call/raiseは78/21/1と80/20/0、後者は61/38/1と63/36/1である。初回33% betのrake後call priceは約20.926%なので、ここはcheapではなくstandard bucketを使う。これは保存方針の明示的な弱点であり、runtimeの価格bucket取り違えではない。

Overcontinueは各1件、Th9h8cでBB bet75。継続73.6148490% / 73.6226330%、参考MDF57.1428571%との差+16.4719919 / +16.4797759pt。

診断は実bet支持でbettorを条件付け、同一合法tuple内の逐次fold確率を扱う。独立平均fold率の積ではない。一方、MDFはrakeを無視した参考値であり、3人の各handが従うcall目標、最適防御、任意のbluffのEVを証明しない。区間は各event単独のもので、90件同時の99.9%保証ではない。このため大きなoverfoldを残弱点として明記しつつ、限定AI estimateとして受け入れる。均衡性を求める用途なら、この受入れでは足りない。

## Source集中と測れていない集中

| Source | Weighted combos / hand classes | 22–JJ比率 | 代表12boardでの最大単一hand-class比率 |
| --- | --- | --- | --- |
| HJ open（共通） | 312.0 / 64 | 18.269% | 4.593% |
| BTN flat vs HJ | 121.6 / 49 | 30.839% | 6.235% |
| BB overcall HJ/BTN | 244.4 / 62 | 22.463% | 4.774% |
| CO flat vs HJ | 83.1 / 38 | 38.628% | 6.639% |
| BB overcall HJ/CO | 225.2 / 59 | 22.247% | 3.699% |

上表は自分の保存preflop frequency×合法combo数で算出したmarginal mass。最大比率だけboard blockerを反映し、他席holecardsやpostflop行動では条件付けていない。12boardとも各sourceのpositive hand-class数は維持され、この2経路の元rangeが8hand級の少数classへ潰れる事実はない。

ただし、bet/raise履歴で絞った後のjoint conditional rangeが少数handへ集中しないことまでは確認できない。今回の保存joint summaryにはper-hand massやeffective supportがないため、その値を捏造・推定して受入れ根拠には使わない。Rare tierや大きいbet、後続のtight SB/nonblind spotでは、coarse tier内のhand差が全体判断へ強く影響し得る。

## 自己対戦・replayのaccounting

各12board×10,000=120,000手。全board順・design/holdout区分・seed・samplesを照合し、勝ち+tie=各10,000、action/terminal bounds、rake bounds、stack+rake=各3,005,000BBを確認した。

| 指標 | HJ → BTN → BB | HJ → CO → BB |
| --- | --- | --- |
| BB wins | 30,900 | 30,760 |
| HJ wins | 40,057 | 39,088 |
| 最後席 wins | 45,937 | 46,951 |
| Ties | 3,106 | 3,201 |
| Fold terminals | 57,764 | 54,175 |
| All-inを経験したterminals | 2,790 | 2,585 |
| 総rake（BB） | 87,255.78199999133 | 84,512.00949999156 |
| 最大board chip集計誤差（BB） | 1.15950e−7 | 1.19210e−7 |

Fold terminalとall-in経験は重複可能なので足して手数と比較しない。全量replayは保存simulationとMATCHで、対象object hashも一致した。同じengineのdeterministic replayであり、独立solver・独立評価器による戦略品質の検証とは表記しない。勝数・rake・chip保存も最適性の証拠ではない。

## 残13と公開前の条件

残13は各source/geometry/roleへ固定した個別profileを使い、同じ1,755flop、later236、joint20,000/event、12×10,000 self-playと全量replayを維持する。BB8BBの結果をSB8.5BB/nonblind9BBへ移植しない。特にnonblind4経路のfirst=opener、SB最狭17.9 combos/8handの意味を保持し、各警告と支持の狭さを個別に判断する。今回2本の警告数やsource集中値を合格閾値にしない。

共通の限界は、coarse hand tiers、board_shared内の役の差、compressed history、実policy到達とは異なるraw構造監査、代表236 later boardに限った検証、初回flop betだけのjoint診断、外側forced-fold3席のholecards未モデル化。実action後のjoint hand集中を全て確認済みとは言わない。

Consumer/公開は別gateを維持する。今回review中、Rangeのtext→card IDだけが`shdc`、共通runtime/表示が`cdhs`という不一致を検出した。これはexact combo blocker表示の欠陥で、先のconsumer static GOをその点で訂正した。共有cardIds使用と52枚roundtrip・全street blocker回帰への修正を静的確認したが、修正後の実test/browser確認は別途必要。保存gateは元から共通parseCardsを使うため、上記2戦略の保存証跡には影響しない。実browser QA、承認receipt、LFS/D1、公開registry・本番反映をこの品質受入れで代替しない。
