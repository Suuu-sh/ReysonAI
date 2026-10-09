# 3人SRP：残り15経路のauthor準備

更新: 2026-10-04。固定代表CO→BTN→BBのみ限定品質受入れ済み。その他15のstrategyはまだ生成していない。共有HU祖先のexact統合確認後、Astraが個別にauthorし、独立reviewを行う。

## Source由来の優先順位

下表のP3は、保存済みopen/call/call頻度を、重複cardのない3人の均等deal全体で平均した値。4枚のblockerに対する第3rangeの残massをinclusion–exclusionで合算する。Node catalogと同じ定義を軽いPythonで再集計した。Monte Carloではない。**外側3席のfold条件を含まないので、6人卓での終端到達確率ではない。** 数字は計算上の3-seat action shareであり、実戦の出現率ではない。

| 優先 | Spot | Postflop first → middle → last | Opener role | Pot BB | P3 % |
|---:|---|---|---|---:|---:|
| 1 | CO_open_BTN_call_BB_call | BB → CO → BTN | middle | 8 | 0.5762544 |
| 2 | HJ_open_BTN_call_BB_call | BB → HJ → BTN | middle | 8 | 0.3752625 |
| 3 | HJ_open_CO_call_BB_call | BB → HJ → CO | middle | 8 | 0.2356309 |
| 4 | UTG_open_BTN_call_BB_call | BB → UTG → BTN | middle | 8 | 0.1563429 |
| 5 | UTG_open_CO_call_BB_call | BB → UTG → CO | middle | 8 | 0.1077386 |
| 6 | UTG_open_HJ_call_BB_call | BB → UTG → HJ | middle | 8 | 0.0836080 |
| 7 | CO_open_BTN_call_SB_call | SB → CO → BTN | middle | 8.5 | 0.0821429 |
| 8 | HJ_open_BTN_call_SB_call | SB → HJ → BTN | middle | 8.5 | 0.0504433 |
| 9 | HJ_open_CO_call_BTN_call | HJ → CO → BTN | first | 9 | 0.0449796 |
| 10 | HJ_open_CO_call_SB_call | SB → HJ → CO | middle | 8.5 | 0.0267769 |
| 11 | UTG_open_BTN_call_SB_call | SB → UTG → BTN | middle | 8.5 | 0.0178073 |
| 12 | UTG_open_CO_call_BTN_call | UTG → CO → BTN | first | 9 | 0.0169874 |
| 13 | UTG_open_HJ_call_BTN_call | UTG → HJ → BTN | first | 9 | 0.0153764 |
| 14 | UTG_open_HJ_call_CO_call | UTG → HJ → CO | first | 9 | 0.0111357 |
| 15 | UTG_open_CO_call_SB_call | SB → UTG → CO | middle | 8.5 | 0.0099395 |
| 16 | UTG_open_HJ_call_SB_call | SB → UTG → HJ | middle | 8.5 | 0.0082434 |

到達不能4経路はUTG/HJ/CO/BTN open → SB call → BB call。保存されたSB first-callが全hand0であり、生成対象にしない。

## Author時に区別する役割

1. ブラインド入り12経路では、firstがSB/BB caller、middleがopener、lastが先行caller。受入れ済みpilotのfirstはBB lead、middleはCO c-bet、lastはBTN stabである。残り11でもrangeの構成を確認し、同じrole名だけを理由に同じ頻度を割り当てない。
2. ブラインド無し4経路では、firstがopener自身、middleが1人目caller、lastが2人目caller。UTG→HJ→CO、UTG→HJ→BTN、UTG→CO→BTN、HJ→CO→BTNが該当する。firstをBB lead扱い、middleをopener c-bet扱いにしてはいけない。
3. 開始potはBB入り8BB、SB入り8.5BB、no-blind9BB。残りstackは全て97.5BB。実際のprice/SPR bucket・同額all-in alias・全合法contextを各geometryで検証する。
4. 3→2人になっても3人originのsource・行動履歴・残存range・dead chipsを保持し、既存HU profileへ切り替えない。

## 保存rangeの具体的な差

以下はAA/KKというhandを持った時の保存call頻度であり、call range内のAA/KK比率ではない。

- BB overcall: CO openへのAA/KKは0/0%、HJ openへ0/5%、UTG openへ0/10%。pilotのBBにはAA/KKが無いという前提は、HJ/UTGのKKへそのまま移せない。
- SB overcall: CO/HJ openへのAA/KKは15/15%、UTG openへ20/20%。BBと同じblind callerでもpremium trapの支持が異なる。
- 先行caller: BTN vs CO/HJはAA/KK10/10%、BTN vs UTGは20/20%、CO vs UTGは15/15%、HJ vs UTGは10/10%。
- no-blindの2人目callerはここで挙げた4経路全てAA/KK20/20%。middle/lastのcall rangeを取り違えない。
- これら以外の全169hand・combo重みも実sourceから比較してprofileをauthorする。上のpremium例だけをfrequency変換式にしない。

## 共通の制約と検証

- 既存schema3/classifier4・9tiers・保存frequency直接使用を維持。新stake/size、4人以上、squeeze/3bet後3人、相手像B–Dへ拡張しない。
- 既存pilot source、policy hashes、V1–V4 archiveを保全。構造的なemit helperは共用できるが、pilotの数字を別spotへrenameしただけの出力は不可。
- 各source hash・role map・Astra著者根拠を保存し、各spotの全1,755flop/later監査、20,000tuple joint、12×10,000自己対戦と全量replayを行う。サンプルは減らさない。警告は具体例付きで残し、自動MDF補充で消さない。
- 代表の受入れは粗いtier/圧縮history/防御の薄さを残した限定的なもの。他15の品質承認を先取りしない。

## Agent接続の依存点

現Stage3のAgent preflopではraises.length===1かつcallers.length>=2でno_dataへ早期returnする。第三者callのno_multiway制約だけを解除すると、以後の席の保存multiway2応答を読まずにfoldさせる。接続時はこのsource参照も追加し、4人目callと3bet後3人の未対応を明示的に制限する。HUへ3人spotを渡さず、foldで2人になってもMw3 adapterを継続する。

## Source snapshot

- `src/estimated/opening-ranges.json` SHA256 `236225dbae1c8aa2e2e7af8a449555f27ef80fed878114408c0e7338b89d0f0b`
- `src/estimated/preflop-ranges.json` SHA256 `fdc83f2ed78e0690e148b39fa23b8edc0bf204fe1a3f1ca4c4e6ea9377da2b55`
- `src/estimated/multiway-responses.json` SHA256 `db5e05912bff4d58f845dfd3caec3e2d5292b5a914579ee96c47112836e3c912`
