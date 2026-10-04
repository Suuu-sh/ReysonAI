# 3人SRP・段階1 実装記録（未完了）

更新: 2026-10-04 23:56 UTC。到達可能16経路のうち、独立品質受入れ済みは13/16、fullgate完了13、公開承認済み0。全16の個別Astra author profileと共通数値基盤の独立reviewは完了。残3は保存物品質の受入れ待ちで、UTG→HJ→COを検証中です。Range/Agent/APIの専用consumerは実装・静的review・focused testsまで完了し、実browser QAはcloudのURL security policyで停止。専用Mac QA archiveを準備済みです。正式archive/receipt、実strictD1、LFS配送、全体release gateは未完了です。下の時刻付き記録は履歴であり、現在の公開可否は冒頭と次節を優先してください。

## 現在の検証済み範囲

- UTG→CO→BTN / UTG→HJ→BTNも限定受入れ。独立Astraが14現物・118,854 rules・計240k handsを照合。両方の97 positive joint / 11支持0を実source/tierから説明し、他経路の99/9や90/18へ変更していない。共同警告32 / 39と最大約33ptの参考MDF不足を保持。`multiway-postflop-stage1.nonblind-utg-quality-review.md`参照。
- source checkpoint `6b3b2e397f1698639a4104e8fd001bc966e3ded3`は4CI全PASS。直前同一codeの`f12c707b`では150frontend＋6backend=156/156、skip0を確認済み。新D1 bootstrapは別worktreeで実依存.ts対応と真の最終応答故障fixtureを修正中で、これらは当該CIの証拠に含めない。

- HJ→CO→SB / UTG→BTN→SBを追加の限定受入れ。独立Astraが14現物・121,968 rules・計240k handsとreplay参照を照合。SB sourceは26.5 / 24.1 weighted combos、12 / 10classesと狭く、99/88下限などを実支持で個別確認した。共同警告30 / 29を保持し、2check後125%への継続は約18% / 16%と大きな不足が残る。詳細は `multiway-postflop-stage1.small-blind-quality-review.md`。
- 新D1 owned-process adapterの独立reviewは2件のNO-GOを検出。API workerの最終終了状態の検証と、親oracleが実評価したESM bytesへのsource拘束を修正中。旧synthetic PASSをこの境界の証明にしない。実strictD1は未実行。

- HJ→BTN→SB / HJ→CO→BTNを追加の限定受入れ。独立Astraが14files・120,411 rules・計240k handsとreplay参照を確認。初のnonblind-onlyはpot9BB、83 flop / 1,098 later contexts、99 positive joint events / 9支持0であり、blind-firstの90/18へ揃えない。詳細は `multiway-postflop-stage1.role-quality-review.md`。
- 3→2後の生存seat/source保持と、保存ruleが区別する状態を分ける。7-selector contextは相手の元MIDDLE/LAST identityを直接持たず、幾何が同じ履歴をまとめる場合がある。構造監査≠joint policy reach、外側fold条件未モデル化、相手identity抽象化の3条件を正式なevidence/receiptのlimitationsにも追加した。これは数値/元候補を変えず、今後の受入れ範囲を明確にする変更。

- UTG→HJ→BB / CO→BTN→SBも限定受入れ。独立Astraが14raw files・122,490 rules・計240k handsのaccounting/replay参照を照合した。警告40/27を保持し、SB版の8.5BB pot、92 flop / 1,111 later contexts、cent単位の125%額10.63BBも個別確認。詳細は `multiway-postflop-stage1.narrow-quality-review.md`。
- 保存物restore/CI verifierは全16保持によるメモリ問題、committed inventory消失、current HEAD sourceの未照合、CI trigger不足、raw Git archive受理の5件を修正し、独立Astra再reviewで静的GO。18契約と合成16spot lifetime試験、実empty inventory verify/restoreはPASS。実16保存物の容量確認と公式LFS/receiptは別gate。`../mw3-saved-restore-independent-review.md`参照。

- UTG→BTN→BB / UTG→CO→BBも各1755flop・236laterでerror/gap0、joint90×20k＋18支持0、自己対戦120k＋full replay一致。独立Astraは14raw files、123,012 rules、計240k handsのaccountingを照合し限定受入れ。両方36警告、最悪の参考MDF差は−34.0600 / −34.3814pt。`multiway-postflop-stage1.utg-quality-review.md`に詳細を保存した。
- 歴史author rationaleのconnector表現を同reviewのerrataで訂正した。HJ/CO対UTGにはJTs/QJs/KQsのcall支持があり、欠ける低いconnectorはT9s以下。全45 source-support listは現JSONの正の支持と一致し、説明誤りで実rangeを削ってはいない。recipe-pinned文言と保存頻度は歴史bytesとして保持する。
- 現source checkpoint `596dee7d86e102049073c15e830aa6b4bc6efb6e`は4CI全PASS、131frontend＋6backend=137/137、skip0。後発のD1 cleanup懸念をこの既存test成功で解消したとは扱わない。

**追記 2026-10-04 21:57 UTC:** strict-local D1 helperに追加blockerが判明。process group/session一致だけの監視では、fork後setsidで新sessionへ移る子孫を見落とし得る。19 synthetic testsと当初の静的GOはこの境界を検証していない。実D1は未実行のまま保留し、import/API worker双方の所有process追跡・fast-detach回帰・独立再reviewが必要。数値政策/gateは無関係。

- 新2経路は各1,755flop・236later構造監査でerror/gap0、90 joint event×20,000合法tuple（18 eventはbet支持0）、自己対戦120,000手と全量replay一致。独立Astraによる候補4本/report10本のbytes・source・全117node/61,506 rules・accounting照合を経て限定AI estimateとして受入れた。37/39共同防御警告は残存し、Ks8d3cの2check後33%への継続は参考MDFより32–33pt低い。詳細は `multiway-postflop-stage1.remaining-quality-review.md`。
- 専用consumerは元3席の役割、3→2後のMw3 dispatch、全action履歴/到達combo、欠損/未承認/stale停止、stream/hash/codec検証、abort・retry・LRUを実装。共有承認registryは空のまま。
- Range側の文字列card→整数変換にあったsuit順違いを、共有 `cardIds` の利用に修正。全52cardとflop/turn/river exact blocker回帰を追加した。保存候補/数値gateは元からcanonical cdhsなので変更なし。
- PR44 head `7d42785779de92ab24ac9123a9289780865b007f`（tree `bede706c1afd98037935a2be305fa0b3f187596e`）の4CIがPASS。Mw3/consumer112＋backend6の118/118、skip0。設定済みtypecheck/buildもPASS、deployは実行していない。これはfrontend全suiteや実browser操作を意味しない。
- 実V4保存物の2manifest/98partsを現clientで読み、全117nodes・flop/later policy bytes/hash一致を確認。信頼されたQA注入による読取であり、公開承認や実D1配送ではない。
- strict-local D1 helperは独立Astraの静的GO。synthetic19/19・skip0、syntaxと実installed Wrangler4.147/Miniflare5/workerd/esbuild pin解決をPASS。正式snapshot/receipt/SQLによる実D1はまだ未実行。`../mw3-local-d1-independent-review.md` を参照。
- 専用D1の空registry証明を、そのまま将来の公開registryに対する証明としない。公開pinを変更した時点でsource/manifest/receiptと実API検証の再照合が必要。

## 仕様と基点

- 正本: `multiway-postflop-stage1.md`。development `506b1235689189ec634f6dc5d7d3832d88ad0da8` の777 blobを照合して専用作業領域へmaterialize。
- 対象は100BB・アンティなし・5%レーキ/3BB capの、オープン→1人目call→2人目callで到達する3人SRP。
- squeeze/3bet後の3人、4人以上、相手像モードは範囲外。2人用の方針、計算防御、ソースhashは流用しない。

## 実装済みの基盤

- `mw3-spots.mjs`: 保存済みopening/open-response/multiway JSONを検証して20経路を列挙。16経路に非ゼロ・合法な3人holecard tupleが存在。SB先行callが0の4経路を明示的に到達不能とする。
- `mw3-engine.mjs`: SB→BB→UTG→HJ→CO→BTNの残存席順、3人のcheck/bet/call/fold/raise、33/75/125%・3倍raise最大2回・67%all-in merge。額と比較を整数cent単位で扱う。
- 3人から2人になっても元のfirst/middle/lastを保持し、現在の残存席位置を別の`activePosition`で渡す。HU方針に切り替えない。
- 元は全員同額stackなのでside potなし。異なる開始stackは拒否。folded seatの既投入chipsはpotに残り、最高投入と2番目の差額だけを未コール額として返却。best-five evaluatorでshowdown、同着を按分し、rake込みchip保存を検証する。
- 履歴replayは不完全street後の後続street、fold終端後の後続street、飛ばしたstreet、未知キーを拒否する。
- `mw3-tree.mjs`: 全合法chip stateと各node/contextの実在witnessを列挙。幾何学的な同値stateだけを集約し、頻度やjoint reachの計算には利用しない。
- `mw3-policy.mjs`: 専用保存頻度をそのまま利用するschema。全node×tier fallback必須、line/texture/players/position/response/price/spr、明示priority、同priorityで交差する条件は拒否。合法action keys・有限0〜100・合計100を検証。HU defenceや暗黙参照mixなし。
- `mw3-artifacts.mjs`: source/policy/schema/engine・tree・policy・evaluator実装hashとAstra著者情報を照合。欠損/staleを停止、既存候補を無断上書きしない。候補は独立review待ちのまま保存する。
- `mw3-audit.mjs`: 全1,755flopに対する幾何学context×保存source combo tierの構造coverage runner。これは共同防御率・実際のpolicy history到達率とは別の検査。共同防御の診断は合法3人tupleを同時に条件付けて行う必要があり、周辺fold率の積で代用しない。
- `probe-mw3.mjs`: 読み取り専用catalog/flop幾何probe。戦略生成・公開はしない。

## 対象16経路（識別子一覧）

下記は識別子の一覧です。現在のcatalogの生成優先順位は、合法なactive3人tupleでcard依存も含めたaction-product平均（jointActionShare.probability）の降順です。外側3席のfold条件は未モデル化なので、6人卓の終端履歴の真の到達確率ではありません。初期の周辺積proxyは補助情報として残し、joint reachと呼びません。

1. CO_open_BTN_call_BB_call
2. HJ_open_BTN_call_BB_call
3. HJ_open_CO_call_BB_call
4. UTG_open_BTN_call_BB_call
5. UTG_open_CO_call_BB_call
6. UTG_open_HJ_call_BB_call
7. CO_open_BTN_call_SB_call
8. HJ_open_BTN_call_SB_call
9. HJ_open_CO_call_BTN_call
10. HJ_open_CO_call_SB_call
11. UTG_open_BTN_call_SB_call
12. UTG_open_CO_call_BTN_call
13. UTG_open_HJ_call_BTN_call
14. UTG_open_HJ_call_CO_call
15. UTG_open_CO_call_SB_call
16. UTG_open_HJ_call_SB_call

到達不能: BTN/CO/HJ/UTG_open_SB_call_BB_call。SBの保存open-response callがすべて0のため。3人postflop方針は作らない。

## 検証

- 新規focused tests: 26件PASS。
- 独立Astraの別実装DFS（`postflop-mw3-independent.test.mjs`）:
  - 8BB: 31,487状態、34,206 action edge、17,214終端、117node
  - 8.5BB: 31,148状態、33,951 edge、17,067終端、117node
  - 9BB: 27,578状態、30,243 edge、14,979終端、117node
  - 合計90,213状態・98,400 edge・49,260終端。合法action、整数cent要求額、all-in、folded席、chip保存・精算はPASS。
- 独立reviewで見つけた履歴黙示切り捨て、float誤差による不可能raise、half-cent丸めを修正して回帰追加済み。
- `npm run typecheck`: PASS。
- local `npm run build`: transforming中にexit137/Killed。初回PR head `16eebb53` はGitHub Actionsのtypecheck/buildがPASS（run 37212330881）。deploy jobはskipped。以降の追加分は最終headで再確認する。
- browser向けmw3 runtime adapterのesbuild bundle: PASS、38,626 bytes。実画面への接続・ブラウザ操作QAを意味しない。
- 既存HUソース・データ・fingerprint入力は変更なし。ただしHU `audit --all`、frontend全tests、ブラウザQAはこの3人変更の最終状態に対してまだ実施していない。

## 未完了・公開gate

1. 残3の個別compile、既存と同じ全量gate、独立Astra品質reviewを閉じる。警告・支持0・未計測条件を保存する。
2. 実browserで3表・exact combo・3→2・全street・rewind/reset/失敗retryとAgent精算を確認し、既存HUの表示回帰を確認する。
3. 最終sourceを固定後、各経路のhash付きarchive/manifest・独立receipt・一致SQLを作る。全量strict local D1で保存/API/再起動/rollback/既存データ保全を確認する。
4. 実Git LFS uploadとfresh fetch/hash確認を行い、Actionsはrestore/verifyのみとする。pointerのみを配送完了としない。
5. 最終統合の全tests/typecheck/buildと既存HU互換を確認し、親の統合順・本番判断へ渡す。公開registry変更時のsource/receipt/API gateも改めて閉じる。

## 代表第一候補と追加adapter（2026-10-04）

- Astra第一候補: CO→BTN→BB、flop 5,925 / later 28,245 rules。全33,585 overrideの実選択・整数sum100・再生成一致PASS。著者の自己点検は `multiway-postflop-stage1.pilot-policy-review.md`。
- flop policy hash `a2b34e77fd998d2eb05c848fee0f8ae4ee9941e9e38137effdcf6359d0320f12`、later `883bf82991a20b4d7c9e455c45fce58df3b9a7508cf1d2648f6c4c86499d306c`。候補はsource/implementation/provenance付きで`.local`に保全。
- 品質blocker: 共有handTierがboard-only two-pair/trips等もmonsterにする。trips flop13種で全handがmonster、`AsAdKcKd2h`で76もmonsterになる。3人専用classifier改善とAstra再author/review前に16経路へ展開しない。
- `mw3-actions.mjs`: 実際に同額all-inへmergeするaction labelを観測上の1actionへまとめ、reachは保存確率の和で条件付ける。raw saved頻度を改変しない。
- `mw3-joint-defence.mjs`: 最低20,000のwhole-tuple rejection sampling。同じ合法tuple内で、3→2人になる逐次foldの確率を掛けてから平均。既fold参加者のblockerも残す。公開gateの最適性証明には使わず警告診断。
- `mw3-runtime.mjs`: 3人のRange用データとseeded Agentのpause/resume/river精算の共有adapter。現在actorだけ現在戦略、他席は過去行動によるreachと明記。HU/既存画面には未接続。
- `gate-mw3-pilot.mjs`: 明示指定時のみ全1,755flop・代表後段runout・joint防御を検査するローカルgate。AI呼出し、D1/import、配信はしない。

## V2 の確認済み段階（2026-10-04 16:10 UTC）

- 3人専用classifierを追加し、board側だけの役・私有pair/実kicker・正確な現在nuts・board共有/公開lockedを区別。既存HU classifierは変更なし。
- nutsはboard別の全合法2枚rankを一度sort/cacheし、Hero2枚と非重複の最上位を読む。range equity/EVではなく、現在のmade rankの厳密比較。flop/turnの将来勝利保証ではない。
- source identity `6adc8a5f853d488f68edd4dbae4cdfbeb9d459a234dca8584f078f46652edd9d`、schema2。旧5tier候補はarchive-v1へ保存し、無言の流用を拒否。
- Astra v2: flop 9,480 / later 45,192 rules。policy hashes `890bbb589b5e0186c3669862543ddc9cd38984be82a36e6199b5511cafcbcccf` / `de5a744fbb011e2bb7d2a03b11f8050c75bcd7768f762fde8f54d45da3693d1a`。
- 全1,755flop、57,253,626 source combo-context: 構造error 0、明示selector欠損0、raw tier警告0。
- 代表12flopからrunout textureを網羅する236 actual turn/river boards: error 0、明示selector欠損0。
- 90 betting event × 20,000合法joint tuple。18 eventは保存policyでbet支持0。警告39（joint overfold38/overcontinue1）。最悪はcombined continuation 12.50%に対しrake非考慮の参考MDF44.44%。警告をcall頻度の機械補充で消さない。共同率の計算は同一tuple内の逐次fold積で、周辺率積ではない。
- heap256MB上限の単一Nodeで完走、最終RSS322MB。これ以降の重いphaseは他作業と排他調整後に行う。
- 新classifier/codec/deliveryに対する独立reviewで発見された、実kicker誤表示、共有boardだけの偽draw、型coercionでのkeyOrder/street一致を修正。独立7件＋既存9件の16回帰PASS。追加nuts cacheは全相手再列挙一致の自前回帰PASS、最終独立reviewが必要。
- transportは同じauthored JSON/hashを厳密復元するdictionary codecとUTF-8整合chunk。v1 later6.71MB→771KB、flop1.42MB→217KB。D1の[2MB行／100KB statement制限](https://developers.cloudflare.com/d1/platform/limits/)を確認し、partは最大48KB UTF-8に分割する。これは未配信のadapter。
- まだ戦略品質GOではない。flop/turnのcurrent-nutsと私有royalの将来lockが同じtierなので、後者の少量foldが残る。次の最小修正はroyal限定absolute_nutsの専用tier。v2成果は履歴として保全し、最終gateの代用にしない。

## 代表 V4 の準備（2026-10-04 17:15 UTC、未公開）

- Astra著者の確認を経てclassifier version4を採用。現在nutsとは別に、flop/turnで将来のどのrunoutにも負けない私有役を十分条件で検出する。tieはあり得る。対象はfull house以上、現在のblocker-conditioned nuts、かつboard共有でない場合のみ。
- 証明: 現在boardがB枚なら、相手の最終7枚のうち外部cardは7−B枚なのでbest5には現在boardが最低B−2枚含まれる。Hero2枚を除外して、この条件を満たすstraight flush/quads/full houseの最大scoreを列挙。そのupperがHero CURRENT score以下なら、Heroの完成後scoreは低下しないため敗北不能。候補が無い場合の6×16^5−1は下位categoryを包含する保守的上限であり、実際に到達する最高scoreではない。
- riverの非royal current-nuts profileは変えず、既存fold0を保持。board_locked/sharedの優先判定も保持。certificate=falseは『負ける可能性あり』の断定ではない。著者は既存absolute mixの数値維持を確認、他8tiersの数値も保持。
- source identityは`9826ec09f4b8420f866c8ac656e6f755966423c2d843bcb604eff97dbd6a89c3`。V3 sourceもローカルに保全。V4候補artifactのmaterialize・全board gate・joint20k・自己対戦10k×12は排他枠待ちで、まだ実行していない。
- focused22件PASS: Node/browser source hash一致、codec/street型厳密性、分類・private draw、6 turnケースの全river×全合法相手pair（273,240比較）でupper>=exact、flop false→turn true境界とsuit/Hero/board順不変。typecheck PASS。新classifierの最終独立Astra reviewは別gateとして残る。
- `Mw3RangeView.tsx`は未接続の表示部品。残っている全参加者の表を保持し、現在actor以外はown-action履歴reachと明示。ハンド選択・具体combo・4言語の3人専用説明・実額action/history表示を準備。共有Range/Agent本体へは未接続、実画面QA未実施。
- browser入力adapterはNodeと同一materialをhash化し、source/implementation/policy hashと全117nodeの必要inventoryを検証。部分的にnodeが丸ごと無いpolicyも表示前に拒否する。
- 未登録のbackend delivery module、hash付きimmutable header/part、追加SQLを隔離準備。既定approval registryは空で、D1 rowやqueryから公開を許可できない。既存index route/migration/HU tableは変更なし。transport4 unit tests、ローカルSQLiteの繰返し適用・FK・HU sentinel保全PASS。これは配信済み・review承認済みを意味しない。
- PR44 head `25c6de21`に対する既存2 CIはPASS（runs 37218178517 / 37218178511）。本節の後続準備はそのCI対象外。全最終suite/build/HU audit/Agent・RangeブラウザQA/LFS実体送信は残る。
- 共通HU model/evaluatorの統合後は意味hashのstale判定を保持し、差分の独立reviewと必要再検証を経てから最終artifact/receiptを確定する。未安定baseで16全量を先行生成しない。

### V4 独立semantic review（17:25 UTC）

独立Astraがfuture upper / exact blocker cache / board共有優先 / river既存profile / 117node coverage / 未公開deliveryの承認境界をPASS。新規修正必須事項なし。軽量確認14件PASSで、strategy全体の品質GOではない。別実装のpure simulation report validatorを追加し、12board順序・split・seed、最低10,000件、期待source/policy hash、勝敗・terminal・street action上限、レーキ上限と全体chip総和を検証する。

`gate-mw3-pilot.mjs --simulate --replay`を準備。replayは同一engineのdeterministic再実行で、独立アルゴリズムとは呼ばない。reportはsource / implementation / verification hashごとのディレクトリに保存し、相違する既存reportは上書きしない。materialize・重い実gateは引き続き排他枠待ち。

## V4 実gate完了（2026-10-04 18:44 UTC、独立戦略品質判断待ち）

固定source code checkpoint: PR44 `6ea71e39eff2e7d13cf6339f584e58d8b9d98afb`（local `a5171ed7d4eccb57a2cb433b07387deec14d2231`）。Node v24.19.0、各Nodeはheap256MB、他の重い処理とphase単位で排他実行。

| Phase | Scope | Result | Wall time |
|---|---|---|---|
| Materialize | Astra-authored代表のflop/later 2本 | 保存・identity検証PASS、頻度はV3から不変 | 9.065秒 |
| Structural | 全1,755flop、57,253,626combo-context、later236boards | errors0、明示selector欠損0、raw警告0 | 34.185秒 |
| Joint | 90 betting events × 20,000合法3人tuple | 39 advisory warnings、18 eventはbet支持0 | 6.968秒 |
| Self-play | 12代表boards × 10,000hands | 全120,000完走、独立会計validator PASS | 208.807秒 |
| Replay | 同じ全120,000hands | report完全一致、独立会計validator PASS | 212.560秒 |
| Delivery check | 実保存2本＋全5report、実サイズcodec/browser復元 | source/meaning/policy整合、同一JSON bytesへ復元PASS | 8.884秒 |

- Joint警告はoverfold38 / overcontinue1。最大負側差はJs8s5d、2check後BTN125%で共同続行12.8289%、rake非考慮の参考MDF44.4444%。これは最適性の判定ではなく、floorを自動追加して消さない。
- Self-playはBB31,041勝 / CO39,834勝 / BTN46,208勝 / tie2,917、fold終端61,919、all-in経験2,857。foldとall-inは重複し得る。各boardの勝敗数・合法action上限・レーキ上限・全席chip総和を別実装validatorで検証済み。EV推薦や均衡証明ではない。
- Self-play最終RSS383MB、replay379MB。サンプル/boardは減らしていない。
- Replayは同じengineのdeterministic再実行。独立性は別実装のreport accounting validatorとAstra reviewにあり、独立solverとの照合とは呼ばない。
- 実保存artifactはflop2,588,625B / later12,187,418B。lossless codecは315,306B / 1,241,712B、20 / 78 parts（今回のASCII本文は最大16,000B/part）へ変換。全117nodeを要求するbrowser verifierまで通し、元の保存policy JSON/hashへ完全復元した。まだAPIへ接続・配信していない。
- 既存npm typecheckのtsconfig対象はsite/backendであり、Range/Agent全体の型検査ではない。未接続Mw3RangeViewは別の明示browser bundleで検証済み。既存locale JSONの重複key警告1件あり。実Range/AgentのブラウザQAは残る。

### 固定identity

- Source: `9826ec09f4b8420f866c8ac656e6f755966423c2d843bcb604eff97dbd6a89c3`
- Implementation: `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`
- Verification sources: `0f35a9371c0220d1a41587c51f6d90698f9294d3f0706c841b58b31bed4d19d6`
- Authored recipe SHA256: `ae196be62d212769fb27a1b1f6619ffd4c7f6488f5d0c3c132efd13eade42798`
- Flop policy: `3682c70f1cd131a825d67dc564bb45706d5b8885c0de4ef6bfe8493fe13fef06`
- Later policy: `d840d8174ff3ad1fe983e5fbd0696b9c28296f5e4d8af394b12d76e070b18582`
- Raw flop file SHA256: `660ed0e712cce29d863a0bceecc59b5e94d4334e2be2b0261251ab3c80578718`
- Raw later file SHA256: `0db36c711160d8e2f818818edc9812ba192c73aed2c636f4b9f85229739d14a9`
- Report directory: `.local/postflop-ai/mw3/pilot-gate/v4-9826ec09f4b8-4ec6b527f8e2-0f35a9371c02/`
- 全report/file/delivery hash inventory: `.local/postflop-ai/mw3/v4-proof-inventory.json`

Materializeは`materialize-mw3-pilot.mjs --spot CO_open_BTN_call_BB_call --model gpt-6-astra --source-hash <上記source>`で明示実行する。新規AI呼出しではなく既著者sourceの展開で、他spotの代用・承認・公開はできない。両出力preflight、既存pending/recipe/policy完全一致の時だけ再利用、wx保存。途中I/O失敗で片側だけ保存されても、同一identityの再実行で補完する。Actionsからは実行しない。

## 固定代表の受入れ記録（2026-10-04 19:00 UTC）

独立AstraがCO→BTN→BBのV4を、残存する39共同防御警告を明記したAI推定の代表候補として受け入れた。再author必須blockerなし。実保存policy/全5report/source material/meaning/verification/recipeを独立再計算し、全61,506ruleの整数範囲・sum100・合法action・fallback、重要tier profile、会計/replay整合を確認した。詳細は独立review文書。

受入れはこの固定snapshotの1/16で、公開承認は0。旧snapshotのraw artifactとreportは保全し、共有HU祖先取り込み時に差分と必要再検証を明示する。他15の方針はまだ生成していない。準備用の役割差・source差・優先順は `multiway-postflop-stage1.authoring-plan.md`。

候補保全用archiveは `.local/postflop-ai/mw3/candidate-v4-checkpoint.tar.gz`、373,784B、SHA256 `d18d9ddd157a9433f3512249db0ae1690739f51d515f08a99b42c7513de32e6a`。作成時点のpending状態で固定した10-member checkpointであり、独立受入れ後も既存bytesを変更しない。release receipt・公開用bundle・LFS upload完了を意味しない。

## 共有祖先統合の確認（2026-10-04 19:47 UTC）

- HU共有祖先: remote `1031287c24c9a42d9da35c8e42e027852c2d221f`、local `3ab7ad54822d77d2a59821d24878eb47d19e4a76`、tree `0ef7e64db3717349b66d4bfa2adf4bba2dd1539f`。
- Mw3統合local `c7a04b7de45845018aa1e78dec19cfa68d3f998d`、tree `1c4d39e9ac6bf9f13125e8ebaf381953db533e3b`。共有847blob＋既存Mw3追加45blobを完全保持。履歴が異なる初期materializeを盲目的mergeせず、正確なcomposed treeを検証した。
- 独立Astraが数値/author/gate/browser-inputの推移依存37ファイルを比較し変更0。implementation/verificationと保存2候補・5report hash一致。HU dispatch/defenceへの混入なし。V4数値証拠の再利用を承認し、統合だけを理由にした再author/MC再走は不要と判断。旧snapshot実行の記録は書き換えない。
- 統合後Node検証: frontend58＋backend4＝62/62 PASS、skip0、`npm run typecheck` PASS（設定対象はsite/backendで、Range/Agent全体の型検証ではない）。19:46:44 UTC終了。Nodeの現source fingerprintとimplementation hashも旧V4値と一致。ログは `.local/postflop-ai/mw3/shared-integration-checks.log`。
- 対象browser再bundleと最終UI接続QAは後続gate。共有sourceの意味が変わった場合はstale判定と差分独立reviewを保ち、影響する品質gateを再計算する。残15の個別authorはこの安定baseで再開し、未生成/未受入れの公開は引き続き不可。
