# 3人SRP・段階1 実装記録（未完了）

更新: 2026-10-04。これは専用実行基盤の段階的な実装記録です。代表1経路の第一候補は保存済みですが分類上の品質問題で保留。全経路の方針生成、全ボード戦略監査、画面、Agent戦、本番配信はまだ完了していません。対応済みの戦略として公開してはいけません。

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

## 列挙経路（author順の優先proxy）

この順は各席の保存action shareの周辺積による優先指標です。外側席のfold確率とcard dependenceを含まないので、終端履歴の真の到達確率とは表記しません。forced-fold席のholecardは未モデル化です。

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

1. 代表CO→BTN→BBのAstra専用方針author、実到達context明示coverage、全1,755flop構造監査、turn/river runout監査。
2. 合法joint tupleの逐次fold経路による共同防御の診断。MDF逸脱・monster fold・air攻撃は警告として件数と例を報告する。
3. 代表の独立品質reviewを通してから残り15経路をauthor。16経路の専用artifactをhash付きLFS archiveへ保存し、Actionsはrestore/verifyのみとする。
4. 共通HU/Stage3基盤の統合後、Rangeの3表/行動ブロック、Agent戦、説明、read-only artifact delivery/publish対象をつなぐ。欠損は未収録とする。
5. 全tests/typecheck/build、既存HU auditと照合不変、3人フロップ→リバーのブラウザQA後に統合・公開の判断へ渡す。


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
