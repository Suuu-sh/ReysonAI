# 3人SRP・段階1 実装記録（未完了）

更新: 2026-10-04。これは専用実行基盤の段階的な実装記録です。方針生成、全ボード戦略監査、画面、Agent戦、本番配信はまだ完了していません。対応済みの戦略として公開してはいけません。

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

- 新規focused tests: 21件PASS。
- 独立Astraの別実装DFS（`postflop-mw3-independent.test.mjs`）:
  - 8BB: 31,487状態、34,206 action edge、17,214終端、117node
  - 8.5BB: 31,148状態、33,951 edge、17,067終端、117node
  - 9BB: 27,578状態、30,243 edge、14,979終端、117node
  - 合計90,213状態・98,400 edge・49,260終端。合法action、整数cent要求額、all-in、folded席、chip保存・精算はPASS。
- 独立reviewで見つけた履歴黙示切り捨て、float誤差による不可能raise、half-cent丸めを修正して回帰追加済み。
- `npm run typecheck`: PASS。
- `npm run build`: transforming中にexit137/Killed。共有環境のresource調整後に再実行が必要。成功とは扱わない。
- 既存HUソース・データ・fingerprint入力は変更なし。ただしHU `audit --all`、frontend全tests、ブラウザQAはこの3人変更の最終状態に対してまだ実施していない。

## 未完了・公開gate

1. 代表CO→BTN→BBのAstra専用方針author、実到達context明示coverage、全1,755flop構造監査、turn/river runout監査。
2. 合法joint tupleの逐次fold経路による共同防御の診断。MDF逸脱・monster fold・air攻撃は警告として件数と例を報告する。
3. 代表の独立品質reviewを通してから残り15経路をauthor。16経路の専用artifactをhash付きLFS archiveへ保存し、Actionsはrestore/verifyのみとする。
4. 共通HU/Stage3基盤の統合後、Rangeの3表/行動ブロック、Agent戦、説明、read-only artifact delivery/publish対象をつなぐ。欠損は未収録とする。
5. 全tests/typecheck/build、既存HU auditと照合不変、3人フロップ→リバーのブラウザQA後に統合・公開の判断へ渡す。
