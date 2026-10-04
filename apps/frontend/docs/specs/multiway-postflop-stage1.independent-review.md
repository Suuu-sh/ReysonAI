# 3人ポストフロップ段階1：代表V4の独立レビュー

更新: 2026-10-04 19:00 UTC。

## 判定

**CO_open_BTN_call_BB_call の保存済みV4を、限定されたAI推定の代表候補として受け入れる。** このレビュー範囲で、頻度の再authorを必須とする未修正の論理破綻・保存不整合は見つからなかった。残り15経路の**個別authorと独立レビュー**へ進める。

ただし、共同防御の39警告は実質的な弱点として残る。とくにチェック後の大きいbetへの過剰fold傾向を了承した、限定的な受入れである。均衡性、最適性、GTOへの近さ、利益、実戦相手への頑健性の承認ではない。警告を消すための機械的なcall補充やHU defenceへの置換は承認しない。

この文書は本番公開・LFS配信・最終release receiptではない。候補の `candidate_pending_independent_review` metadata、空の公開registry、未接続の本番routeは変更していない。共通HU基盤統合後の意味hash確定、最終receipt、Range/Agent接続、全体QAは別gateとして残る。

## 今回実際に行ったこと

- 保存済みflop/later候補、全5report、proof inventory、author recipe、構造監査実装を読み取り確認した。
- 軽いPython処理でraw file SHA-256、保存policyのcompact JSON SHA-256、全reportのidentity、現在のimplementation/verification/recipe SHA-256を独立再計算した。現在の3つのpreflop source spot・geometry・sizing・rake・classifier identityからsource materialも別実装で再構成し、source hash一致を確認した。
- 全61,506 rulesの整数0–100・合計100・node grammarに対する合法action集合・重複selector identity・9tier fallback・具体contextのselectorを確認した。
- 保存reportから共同警告の分布、自己対戦の勝敗数、chip集計、replayの対象hashを再集計した。
- このターンではNode、全probe、policy compile、simulation、joint sampling、全board gateを起動していない。保存reportの検証と、過去の独立semantic reviewを併用した判断である。
- 頻度・author recipe・runtime実装・既存候補を変更していない。

## 固定identityと現物照合

対象は100BB・3人SRP・開始pot 8BB・残りstack各97.5BB、CO open → BTN call → BB callのみ。

| 項目 | SHA-256 |
| --- | --- |
| Source | `9826ec09f4b8420f866c8ac656e6f755966423c2d843bcb604eff97dbd6a89c3` |
| Implementation | `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113` |
| Verification sources | `0f35a9371c0220d1a41587c51f6d90698f9294d3f0706c841b58b31bed4d19d6` |
| Author recipe | `ae196be62d212769fb27a1b1f6619ffd4c7f6488f5d0c3c132efd13eade42798` |
| Flop policy | `3682c70f1cd131a825d67dc564bb45706d5b8885c0de4ef6bfe8493fe13fef06` |
| Later policy | `d840d8174ff3ad1fe983e5fbd0696b9c28296f5e4d8af394b12d76e070b18582` |
| Raw flop artifact | `660ed0e712cce29d863a0bceecc59b5e94d4334e2be2b0261251ab3c80578718` |
| Raw later artifact | `0db36c711160d8e2f818818edc9812ba192c73aed2c636f4b9f85229739d14a9` |

候補の実ファイルは `.local/postflop-ai/mw3/co-btn-bb-mw3-srp-v1-policy.json` と `co-btn-bb-mw3-srp-v1-later-policy.json`。サイズは2,588,625B / 12,187,418B、合計14,776,043B。metadataのmodelは `gpt-6-astra`、authorは `mw3-co-btn-bb-authored-v4`、schemaは3。全値がinventoryと一致した。

V4はclassifierの意味を変更している一方、保存mixの数値はV3と同じである。そのためpolicy hashがV3と同じであること自体は不整合ではない。**sourceとimplementation hashも必ず照合すること**。policy hashだけで旧classifierとの組合せを許可してはいけない。

### Report bytes

保存先: `.local/postflop-ai/mw3/pilot-gate/v4-9826ec09f4b8-4ec6b527f8e2-0f35a9371c02/`。

| Report | Raw file SHA-256 |
| --- | --- |
| all-flops | `8a99bac81a26ae00079d85c48e622a9ed3b5ddf231ae5420b1dd04a1bb284ca8` |
| later-runouts | `ea1a32284514c4276708ff6fa9b6b2cffa9ca9d3ef444495d05fe5e70bf2c317` |
| joint-defence | `9a81d70f726d3222a62242877f506405370a17962bf02f90b648fb0aa79310cf` |
| simulation | `087acf5b37e7d89db9e457635e726af3f5253208263a12d0c7e9ccda6d56cdf4` |
| simulation-replay | `136441f619437c337574c7f67d92df5c5e5ab202b17f1c491d1d9e420205fc2c` |

全5本のraw hashとsource/implementation/flop/later identityが一致した。保存simulationをcompact JSON化したhashも、replay reportが指す `0220c34d5115d0557408c318d6d511b9ce27fa6e0b62c1d0be80278da0db9c5e` と一致した。raw file hashとJSON object hashは別値であり、混同しない。

## 構造・分類・保存profileの判断

### 構造整合

- Flop: 33 nodes、96 concrete contexts、10,665 rules。297 fallback＋10,368 priority100 rules。
- Turn/river: 84 nodes、1,113 concrete contexts、50,841 rules。756 fallback＋50,085 priority100 rules。
- 全117 nodesに9tier fallbackがある。具体overrideのselectorはすべて明示され、`any`に落としてcontextを省略していない。
- 全61,506 rulesで整数範囲・合計・合法action集合・重複identityの問題0。
- 保存全1,755flop reportは57,253,626 source combo-context、構造error0、明示selector欠損0、raw warning0。
- Later reportは236 actual boards（turn45 / river191）、error0・明示selector欠損0・raw warning0。

構造監査はpreflop sourceで支持されるcombo tierと幾何学contextの組合せを調べる。**実際のpolicy historyに沿ったjoint reachの証明ではない。** Later236は代表flopからrunout textureを網羅した標本であり、全turn/river card組合せを網羅したという意味ではない。

### 分類の重要な修正を維持

先の独立reviewで見つけた不正履歴の黙示切捨て、浮動小数による不可能raise、cent丸め、board-onlyのmonster混同、使わないkicker、共有boardだけが完成する偽draw、codecの型coercionは修正済み。

現在は公開boardだけの役と私有札の寄与を区別し、`board_locked` / `board_shared` を先に判定する。現在nutsはHero2枚を除いた全合法相手2枚の最大rankと比較する。range equityや将来保証とは区別されている。

V4の `absolute_nuts` は、private royal、またはflop/turnのfull house以上のcurrent nutsで、将来の相手rank上界が現在のHero rank以下と証明されたもの。B枚のcurrent boardのうち相手best-fiveが最低B−2枚を含む必要条件を使い、Hero2枚除外後のSF/quads/full house候補を保守的に最大化する。候補集合を広げた上界なので、positive certificateのno-loss主張は妥当。同着はあり得る。falseから敗北可能を逆推論しない。Riverのnon-royal nuts profileは変えていない。

### 実保存mixの確認

- `absolute_nuts` の全facing ruleはfold0。
- River `nuts` の全2,821 facing rulesはfold0。
- `board_locked` はcheck/call100、bet/raise/fold0で、保証されたshareを捨てたり無意味にrakeを増やしたりしない。
- `board_shared` はvalue bet/raiseを出さない。Riverのcall率は残人数・価格・履歴ごとの明示的な推定であり、board共有という理由だけでnutsとして扱わない。
- 現在nutsのflop/turnには最大5% / 8%のfoldが残るが、将来no-loss証明が得られたhandは別tierへ分離されている。これらの少量foldはredraw/freerollへの著者判断で、証明された将来敗北可能性や最適fold率ではない。
- BBのflop leadを抑え、COのc-betとBTNの2check後stabを分離している。Turn/riverはline・残人数・実position・SPR・runoutに反応し、OOP defenderのdonkを控える。3→2人後も専用profileを使用する。
- 受け側も保存call/fold/raiseを直接使う。HU defence、EV最適化、MDF floorで数値を上書きしていない。

これらは3人ポットの慎重な出発点として一貫している。固定tier内のすべてのcomboが適切に扱われることや、相手の値打ち/bluff構成に最適に反応することまで意味しない。

## 共同防御の39警告：明示的に残す弱点

90 betting events × 20,000合法3人tuples、計1,800,000 accepted samples。別の18 eventは保存方針でbet支持0であり、missing-data errorではない。BBの125% lead12件と、paired flop上のCO/BTN125%各3件が該当する。

| 最初のbet actor / size | overfold | overcontinue | 警告なし |
| --- | ---: | ---: | ---: |
| BB / 33 | 2 | 0 | 10 |
| BB / 75 | 1 | 1 | 10 |
| CO / 33 | 3 | 0 | 9 |
| CO / 75 | 2 | 0 | 10 |
| CO / 125 | 8 | 0 | 1 |
| BTN / 33 | 7 | 0 | 5 |
| BTN / 75 | 6 | 0 | 6 |
| BTN / 125 | 9 | 0 | 0 |

最悪例は **Js8s5d、BB check → CO check → BTN bet125**。共同続行12.828888%、参考MDF44.444444%、差−31.615556pt。保存Hoeffding 99.9%区間は11.450401–14.207375%。これはevent単位の区間であり、90比較全体のfamilywise区間ではないが、この大きな差は通常のsampling noiseで消えない。唯一のovercontinueは **Th9h8c、BB bet75** で、共同続行73.850145%、参考MDF57.142857%、差＋16.707288pt。

### 警告の意味と受入れ理由

1. これは、実際のbettorの保存betで条件付けた合法tupleについて、各responderが順にfoldする経路を評価した診断である。別々に平均したfold率を掛けた値ではない。
2. 参考MDFはrake非考慮の `P/(P+new wager)`。複数人の将来play、equity realization、rangeのvalue偏重を解いた均衡値ではない。
3. したがって、MDFとの差だけから具体的なhandの正しいcall率やany-two bluffの利益を確定できない。一方、大きなbetやBTN stabに対する**広範な防御の薄さ**を示す、無視できない感度警告である。
4. 本仕様は共同MDF逸脱をwarningとし、合法性・頻度合計・分岐整合と区別している。今回の代表候補はその契約で受け入れる。38件のoverfoldを解消済み、均衡型の頑健な防御、品質問題0とは記述しない。
5. このjoint検査は代表12flopでの最初のbetだけである。raise後、turn/river、全1,755flopのjoint防御までPASSしたと拡張しない。

他spotへの展開では同じwarning分類・同等sample数・具体例を維持する。警告が増えたり極端になった場合は、source range・tier分類・saved profileのどこに原因があるかを著者が確認する。警告数の目標に合わせた自動frequency調整はしない。

## 自己対戦・再現性・配信証拠

- 12代表boards × 10,000、120,000 hands。
- 単独勝利: BB31,041、CO39,834、BTN46,208。Tie2,917。合計120,000。
- Fold終端61,919、all-in経験2,857。両者は重複し得る。
- 保存値を再集計したrake合計88,705.96899999099BB。各boardの `全席finalStackTotals + rake − 300.5BB × samples` の最大絶対誤差は約1.155×10⁻⁷BB。
- 既存の別実装report validatorは本番simulatorを再利用せず、board/sample/seed/勝敗/action上限/rake/chip集計を検査する。ただし、集計検証は全handの独立再評価や別solverによる戦略比較ではない。
- 同じengineによる全量replayが完全一致した保存reportを確認した。同じ不具合を共有する可能性はあるため、独立アルゴリズムの証明とは呼ばない。
- 保存inventoryでは実候補2本を315,306B / 1,241,712Bのlossless codecへ変換し、20 / 78 partsからbrowserの全117node verifierを通して元policy JSONへ復元済み。今回そのcodec実行は繰り返していない。raw候補hashと先のcodec/承認境界reviewに整合する証拠として扱う。

勝利回数や全120,000hand完走は、強さ・収益・GTO精度を証明しない。固定boardごとのsamplesは全flopの自然な発生確率で重み付けしたものでもない。

## 残余弱点

1. **粗いhand分類。** 同じtier内のkicker、draw quality、blocker、range内の位置、相手の現在rangeへの勝率を区別しない。特にunlocked `board_shared` は共有high-cardと共有full houseを同じtierへまとめる。
2. **履歴の圧縮。** line、人数、position、cold/invested、price/SPR bucketは持つが、過去の全actionと各相手のrange構成をpolicy selectorには持たない。同じcontextへ異なる経路が合流する。
3. **共同防御の不足傾向。** 上記38overfoldは残存し、BTN125%の検査対象9boardはすべて警告である。
4. **将来no-loss certificateは十分条件。** すべてのfuture lockを網羅していない。negative certificateを敗北リスクの証明として説明してはいけない。
5. **範囲と重み付け。** 元の3参加者の合法tupleを扱うが、外側でforced foldした3席のholecardsとそのfold条件は未モデル化。画面のown-action reach-weighted頻度とjoint-conditioned診断も別物である。
6. **Later/joint品質の観測範囲。** Later236は代表texture標本。Jointはflop最初のbet90 eventsで、全street/raise分岐の共同品質診断ではない。
7. **Release検証は別。** 共通HU基盤統合、最終全tests/build/HU auditと照合不変、実Range/Agentのフロップ→リバーブラウザQA、LFS実体送信・復元・receipt・本番承認は未完了。

## 残り15経路へ進む条件

1. **Spotごとに実sourceを確認して個別authorする。** Pilotのseat名やspot IDを置換しただけの方針を作らない。CO open / BTN flat / BB overcallのrange前提、8BB開始pot、元roleが固有の入力である。
2. **盲点となる4つのnon-blind経路を別に扱う。** HJ→CO→BTN、UTG→CO→BTN、UTG→HJ→BTN、UTG→HJ→COではopenerがfirstとなる。BB向けの低頻度leadをfirstへコピーし、CO向けc-betをmiddleへ置いたままにしてはいけない。Preflop aggressorの位置、caller構成、9BB potを反映した新profileが必要。
3. SB/BBのovercall経路でも、各openerのrange、最初のcallerのrange、blind別のrange、8/8.5BB potを再確認する。共通の117node形式はreuseできても、そのmixと全context inventoryが無条件に同じとは限らない。
4. 各候補で全node×9tier、合法action・sum100、全1,755flop、later runout coverage、joint warning診断、10,000hands×12board自己対戦とdeterministic replay、別実装report会計検証を維持する。Samplesやboard数を削って既存PASSと同じ名称にしない。
5. 警告は種類・件数・支持0イベント・最悪例・観測範囲をspot別に記録する。現在のrepresentative acceptanceを全15spotの事前承認へ拡大しない。
6. 共通HU基盤統合で意味が変わればstaleを維持し、source/implementation/verification hashを再確定して必要な検証を再実施する。不安定な基盤上の16本を最終承認artifactとして固定しない。
7. Missing/未author/staleは引き続き明示的な未収録。Runtime生成、HU代用、LFS/Actions上でのauthor、自動本番公開を追加しない。

## 結論の境界

この1spotについては、修正必須の未解決blockerなし、明記した弱点付きの代表AI estimateとして受入れ。残り15は個別author/reviewへ進行可能。

**公開可能な完成版16spot、均衡戦略、最終receipt、UI/Agent統合の承認は行っていない。** 保存された警告と未完了gateを残したまま、後工程へ引き継ぐ。

---

## Addendum：承認済みHU共通祖先のexact統合（2026-10-04 19:32 UTC）

### 判定

**この統合では、代表V4の数値証跡を再利用できる。** 旧代表の受入れ対象を上書きせず、統合後の数値依存が同一であることを別途確認した。統合だけを理由とする再author、全1,755flop/later再計算、120,000hands simulation/replayの再走は要求しない。

これは統合commitで重いgateを新規実行したという意味ではない。Node枠取得後の現在identity/contract/typecheck確認は未実行のまま残す。それらが一致・PASSすれば、確定した共通base上で残り15の個別authorを再開できる。本体で示した39警告と公開前gateは変わらない。

### 比較したsnapshot

| 対象 | Commit / tree |
| --- | --- |
| 旧Mw3 local | `8e593fd988cea890112b5f7af58256f433a5dd1c` |
| 数値実gateのstrategy remote checkpoint | `6ea71e39eff2e7d13cf6339f584e58d8b9d98afb` |
| 共有HU local | `3ab7ad54822d77d2a59821d24878eb47d19e4a76` |
| 共有HU tree | `0ef7e64db3717349b66d4bfa2adf4bba2dd1539f` |
| 統合local | `c7a04b7de45845018aa1e78dec19cfa68d3f998d` |
| 統合tree | `1c4d39e9ac6bf9f13125e8ebaf381953db533e3b` |

Git treeを独立に列挙し、共有847 tracked blobsのmode/type/object IDがすべて統合treeで保持されていることを確認。共有treeに対する追加はMw3の45 blobsだけで、45本すべて旧Mw3 snapshotのbytesを保持している。統合treeは892 files。manifestの結論をそのまま採用せず、Git object IDから再照合した。

### 11直接依存に加えて実際の推移依存を確認

Mw3のinputs、browser inputs、runtime、simulation、audit、policy、artifact、report validator、transport、gate、materializer、author recipeを入口に相対import/exportを辿り、ファイル名から読み込む3つのsource JSONも追加した。**数値・検証側の37ファイルすべてが旧→統合でbyte一致、未解決importは0。**

確認には、直接比較manifestの11ファイルだけでなく、次も含む。

- `src/estimated/rake.ts` / `sizing.ts` と `configs/cash-6max-100bb.json` / `multiway-preflop-stage2.json`
- `flop-isomorphism.mjs`、source validators、`src/data.ts`
- Mw3のengine、classifier、policy、observable alias、history/joint sampler、runtime、simulationと別実装report validator
- materializer、gate、recipe、browser/codec/delivery経路

型検証/実行環境の補助確認として、frontend package.json/package-lock.json/tsconfig.jsonとbackend package.jsonも旧→統合で一致した。Node built-insの動作を今回実行して確認したわけではない。

現在のソース文字列からPythonで再計算したhashも旧gateと一致した。

- Implementation: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`
- Verification: `0f35a9371c0220d1a41587c51f6d90698f9294d3f0706c841b58b31bed4d19d6`
- Source materialを構成するコード・3source JSON・configはすべて一致しており、source identity `9826ec09f4b8420f866c8ac656e6f755966423c2d843bcb604eff97dbd6a89c3` を変更する差分はない。

統合後の現在の保存2候補・5reportもraw SHA-256を再計算し、旧proof inventoryと全7本一致した。詳細な37-file inventory、各旧/統合Git entry、現在の保存物hash、比較結果は `.local/postflop-ai/mw3/shared-integration-independent-review.json` に保存した。元の `shared-integration-manifest.json` / `shared-base-comparison.json` は変更していない。

### UI wrapperとHU dispatchの境界

- Mw3数値側から `RangeWorkspace`、`PostflopTrial`、`postflop-trial`、HU `engine` / `defence` / `observable-actions` / `street-state`、AgentのHU policyへ入るimportはない。
- Mw3は共有 `model.mjs` のboard texture/parse helperと、共有 `equity.mjs` のcombo/seed helperを利用するが、その両ファイルはbyte不変。hand tierは独自classifier、mixは独自saved policy、showdownは専用best-five evaluator、チップ状態はMw3 engineのまま。
- `Mw3RangeView` のpresentation側推移依存は20ファイル。そのうち変更は `reasons-primary.json` と `reasons-secondary.json` の2本だけで、旧translation値の変更/削除は0、新しいHU説明keyが5 / 16件追加されている。これらはMw3の数値依存に含まれない。
- Mw3 viewは検証済みviewを受け取って表示し、action callbackへ選択名を返す部品である。今回の共有wrapper変更が、その逆方向からsaved mixやsourceへ入る経路はない。未接続viewを実UI接続済みと扱わない。
- 共有HU側の `multiwaySpotFor` は「マルチウェイpreflopを経てHUになった履歴」のdispatchであり、Mw3 engineではない。共有catalog407件をPythonで確認し、全件のhistoryのlive集合が `{oop, ip}` の2席と一致した。CO open → BTN call → BB call の純3人履歴は一致しない。
- 共有runtime filesにMw3 runtime/viewへの参照は0。Agentは今も3人目になるcallを `no_multiway` で止め、HUの `[a, b]` showdownを使っている。**将来このcall制限だけを外してはいけない。** 3人のdecision/deal/settlementを明示的にMw3へ分岐させる作業とQAが必要。
- backend Mw3 transportは追加45本の不変部分で、共有indexへの登録はない。空registryの公開拒否境界もこの統合では変わっていない。

### 必要な再確認と再計算の条件

1. Node枠取得後、現在source/implementation/verification identity、保存2候補と5reportのhash、Node/browser入力一致を再確認する。旧reportは過去checkpointの実行証拠として保持し、統合commitで再実行した表記へ書き換えない。
2. 統合状態で予定のMw3 contract suite、backend transport tests、typecheckと対象browser bundleを確認する。これらは数値全量再計算とは別のmodule解決・contract・統合回帰gateである。
3. 現在の一致が確認できたら15spotの個別authorを再開してよい。Non-blind4経路への単純rename禁止、spotごとの新source/profileと全量品質gateは引き続き必要。
4. 今後37-file数値依存、source、classifier、sizing、evaluator、saved policyまたはgate logicが変わったら、変更の意味を再reviewし、stale検出を保持して影響する実gateを再実施する。今回の再利用判断を将来の差分へ延長しない。
5. Range/Agent接続・最終共有HU audit/照合・全tests/build・ブラウザQA・LFS実体/receipt/本番承認という既定のrelease gateは省略しない。

このaddendum作成中に使用したのはPython・Git・静的読取りのみ。Node/probe/compile/gate/simulationは起動していない。
