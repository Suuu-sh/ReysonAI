# 残り15経路: Astra author設計・source-pinned候補準備

更新: 2026-10-04。基盤snapshot `c7a04b7de45845018aa1e78dec19cfa68d3f998d`。

## 現在の判定

**15経路の個別著者profileを保存済み。全てcompile・独立review・品質gate待ち。保存policyはまだ生成していない。**

受入れ済みCO→BTN→BB V4は変更していない。残り15の受入れ、supported登録、LFS/D1公開、本番反映を先取りしない。4つのzero-support SB first-call経路はauthorしていない。

本作業では親の共有compute制限に従い、Python、静的ファイル編集、Git readだけを使用した。Node、probe、policy compile、tests、all-board、joint、selfplay、buildは起動していない。したがって15経路の最終rule数・policy hash・schema PASSは**未確定**である。

## 成果物とAPI

- `scripts/data/mw3-authored/profiles/*.json`: 15経路ごとの完全な著者anchor data、役割、source fingerprint、実sourceのpositive-support一覧、根拠。
- `author-profiles.py`: 著者が判断したspot/seat別の数表と、source支持・metadataを静的JSONへ記録するオフライン補助。policy生成やgateを実行しない。実buildの数値正本はspot固有JSON。
- `context-judgments.mjs`: 新15経路で共有する価格・現在position・action closure・SPR・runoutの**明示的な著者判断**。無条件に正しい理論定数ではない。
- `emit.mjs`: 新profileの決定的展開とstrict validation。受入れpilotをimportしない。
- `registry.mjs`: `listMw3Authors()` と `getMw3Author(exactSpotId)`。取得物は `{spotId, version, model, sourceFingerprint, status, priority, sourceFiles, build(inputs, contract)}`。
- `build`は`{flop, later}`を返す。未author/pilot/異なるsource pinはthrow。pilotは親の既存wrapperだけで扱う。
- `sourceFiles`はfrontend相対pathで、spot固有profile、context-judgments、emit、registryの固定順。registryは選択された1profileだけを同期readし、他14profileを暗黙strategy依存にしない。
- author supplementと説明docは実policy buildの依存ではない。共有engine/classifier/evaluator等は親のimplementation identityで別にpinする。

## 何を独立に判断したか

各spotの各3席について、次を個別の明示数値として書いた。

1. flop: dry/wet/monotone/paired × high/mid/lowの12texture、それぞれmonster/strong/draw/medium/airのbet総頻度。
2. turn/river: original roleの3人contextでchecked/aggressor/defenderごとの5-tier bet頻度。
3. 33/75/125/raise1/raise2/allinごとのcontinue anchor、合法raiseのshare。laterでは各seatのstreet別continue変化を別に指定。
4. current nutsと証明済みabsolute nutsのfirst-action頻度を、spot/role/shape/line別に指定。raise biasもseat別。
5. river board_sharedのcall cautionをspot/role別に指定。

これらはpilotのseat名置換や一律乗数ではない。共有context priorsで同じゲームの条件差を一貫して表現しているが、**15本の独立solver解、各contextを別個に最適化した出力ではない**。各spotの新しいsource-based anchorを、明示された共通heuristicで展開するAI estimateである。

既存HU policy・defence・MDF floor・相手像B–Dは読み込まない。警告を消すためにequity/MDFへ合わせる自動補充はしない。各actionの保存frequencyが回答であり、受け側call/foldもそのまま使用する。

## Sourceを実際に比較して見つけた盲点

- BB overcallは177.0–250.1 weighted combosで広いsuited/connector支持を持つ。SB overcallは17.9–37.2 combos、8–16handしかなく、小pair22–66と非broadwayのsuited connectors（ここではJTs以下の連結手）の支持が全て0。KQsなどbroadway連結手の支持はあり、全suited connectorが0という意味ではない。SBを「BBの少しtight版」とみなすと、低boardのnut coverage、draw頻度、premium trapを誤る。
- 最も狭いSB17.9のrangeはQQ+23.5%、77–JJ58.7%。AA/KKの保存call20%がある。UTG→HJとUTG→COのSB source自体は同じでも、先行callerが異なるため全体profileは同じにしていない。
- BB_vs_UTG_HJcallの22–66質量は4.7%で、UTG-CO/BTNのBB約11%よりかなり小さい。UTG callerの違いを無視したBB low-board共通profileは不適切。
- HJ_vs_UTGは56.7 combosで77–JJ36.5%、22–66 10.6%、非broadway SC（JTs以下）0。最後に行動する場合も広いBTNのようなair/draw供給はない。
- nonblindの2nd callerは24.6–45.0 combos、11–18handで、22–66/非broadway SC（JTs以下）なし。KQs、一部QJsには支持がある。BTNというseat名でも121.6/145.8-comboのfirst flatとは異なる。
- nonblind4経路はfirst=opener、middle=first caller、last=second caller。firstをblind donk、middleをc-betとしない。新表ではopener firstのvalue betを明示し、middleはopener check後かつtight callerが残る限定probeとした。

上記weighted combosと比率は自分の保存preflop action frequency×combo数であり、3人joint conditional reachではない。外側forced-fold3席のholecardsは引き続き未モデル化。

## 役割・7selector・安全classの境界

- 3→2人でもoriginal role/source/dead chipsを維持し、現在first/lastで専用context差分を適用。HU profileへ切り替えない。
- `line`は直前streetのaggressorから決まる。flopは全席checkedなのでpreflop opener意味はspotのrole tableへ直接書いた。
- cold/investedは現在streetの未投入/投入済み。priceはincremental costで、investedをsunk-costのcall理由にしない。
- behindとclosingを分離。3人closingには既に続行した別playerがいるため、2人closingのように扱わない。
- 8/8.5/9BBで同じnode名でもprice/SPR contextが異なる。emitterは各contextのwitnessをそのspotでreplayし、seat/node/context/pot/call/actionsの一致を要求する。別geometryのprobe流用はfail closed。
- 全node×9tierにpriority0 all-any、全probe context×texture×tierにpriority100を保存する設計。full-context同priorityは排他的。
- board_lockedはcheck/call100、fold/bet/raise0。board_sharedはfirst check100・raise0で、river防御だけ明示値。不可能なearly-street board_shared行は実handのfallbackではない。
- absolute_nutsはclassifier4のno-loss証明を尊重して全street facing fold0。tie可能を独占勝利と呼ばない。river current nutsもfold0。
- 現在nutsのflop/turnはredraw/freerollに関する共通著者判断を維持する。future certificateがないことだけで「将来負ける」と断言しない。

## Source identityと保存状態

全fingerprintは親が明示Node短枠で保存した`stable-source-fingerprints.json`を使用した。Python近似で作ったfingerprintではない。

source全3JSONのbytesは著者がreadした値:
- `opening-ranges.json`: `236225dbae1c8aa2e2e7af8a449555f27ef80fed878114408c0e7338b89d0f0b`
- `preflop-ranges.json`: `fdc83f2ed78e0690e148b39fa23b8edc0bf204fe1a3f1ca4c4e6ea9377da2b55`
- `multiway-responses.json`: `db5e05912bff4d58f845dfd3caec3e2d5292b5a914579ee96c47112836e3c912`

以下のprofile SHA256は**author data JSONのraw bytes hash**であり、完成policy hashではない。Rule数は実geometry contract compile後に確定する。

| 優先 | Spot | first → middle → last | Pot | Source fingerprint | Author profile SHA256 | Rules / saved policy hash |
|---:|---|---|---:|---|---|---|
| 2 | HJ_open_BTN_call_BB_call | BB → HJ → BTN | 8.0 | `6762971b2c93bc1d26aec6a2e82cc9292a03fb22e6cc497c9b0e346ae3f9df45` | `6171f89ddf6cc6ce085fa0800ce06d4891eb2fb89e5ecc4650466bfc87dac0ca` | 未compile / 未保存 |
| 3 | HJ_open_CO_call_BB_call | BB → HJ → CO | 8.0 | `23bc49a7a78a03506d6f0d73dfd541dc5cc81397b26a7338f47810f7326843c2` | `e05f4e38259f8296bb5a2ba36e6490b8fd4722a09226d2dfba10152a6cdb231b` | 未compile / 未保存 |
| 4 | UTG_open_BTN_call_BB_call | BB → UTG → BTN | 8.0 | `3effc9977afa66aa817c2e1c697f6789a593bdf3418741ab33fe34236dd5b7f2` | `9827bc001a1ff51a43a6afe37bbd0a62dfd6022ea32b071ed416a4dd1419d50e` | 未compile / 未保存 |
| 5 | UTG_open_CO_call_BB_call | BB → UTG → CO | 8.0 | `4ca502b9b4c22ca9d67058d9be52c52539549f2442cfb08983296d09afacd95d` | `61d8c6cd641c4869ed50c9b1c587b00ec7ed22f5467acbb3cbc70e44a9cbafbf` | 未compile / 未保存 |
| 6 | UTG_open_HJ_call_BB_call | BB → UTG → HJ | 8.0 | `3d53be2b1a7c90f5950be69b82850ef81fa535e3442d836368e914fdf55b2862` | `2135da41f53532c9585694df8b97ee6348cfd4445661df5313bca96e3b52de03` | 未compile / 未保存 |
| 7 | CO_open_BTN_call_SB_call | SB → CO → BTN | 8.5 | `3573dde6357353f3d848b0370205de4cc99ee11ced39267b35e65927bc235e0d` | `4af6fe6e228ad5c80b6a58f6667d11eb36f4271218165209d55bf73b48f6ef54` | 未compile / 未保存 |
| 8 | HJ_open_BTN_call_SB_call | SB → HJ → BTN | 8.5 | `380bee458c9d5e112d268dab4e0d4ef201a45a58babe78234c5e6af0c91f6235` | `cde1224833d57d48b5ff3ecb1f8fc2a4e7c23250a06f6022b7b8437345d6bb8c` | 未compile / 未保存 |
| 9 | HJ_open_CO_call_BTN_call | HJ → CO → BTN | 9.0 | `278b706399c3efc7907abdc072b0060e2f40e188cb6b4fa05a633544ef86080d` | `6c930e8a7db77856d8c30560a0a54f51af17c992f58b9f6d692f7c3a0e66c31b` | 未compile / 未保存 |
| 10 | HJ_open_CO_call_SB_call | SB → HJ → CO | 8.5 | `d9d3209ec4900d28ca2d8259c813c5bd48d4019528f2123cc6ed168e22c8cbb1` | `b6d345eee91379544c347507603e9501b53a2921c4e3ae03ee4e5c0de7f3c644` | 未compile / 未保存 |
| 11 | UTG_open_BTN_call_SB_call | SB → UTG → BTN | 8.5 | `2aa18f5793aa280d843bd3f175f391cc3409186c21e08bcc7b63570aab558858` | `29788253dd578a22a8c3e41e0c2d5e4d6e224f2eb818304b09c0187891604ab8` | 未compile / 未保存 |
| 12 | UTG_open_CO_call_BTN_call | UTG → CO → BTN | 9.0 | `e1328f1fc8ad265f473579189abf32246e4b7bf5bdd2cdc108bea1b2b59f15ed` | `5cccc91d2d5c7b90ec6dcb27f48384e078b08ac02940e03c1bcdfce457861198` | 未compile / 未保存 |
| 13 | UTG_open_HJ_call_BTN_call | UTG → HJ → BTN | 9.0 | `bf2cc8a36a97c8b77c2ee525d9bebfb774814f3e21b1aea53cb46c1b21c45e8e` | `0d2608a51fce9517a7ad6d776ad70c2e113a17745e6e5f7a994568a4732890e8` | 未compile / 未保存 |
| 14 | UTG_open_HJ_call_CO_call | UTG → HJ → CO | 9.0 | `f8d9dc162bd8bb8e401972747dba8e8ce8b8d244d7419af718376ad368d08734` | `70b309ca3b89bccf3b763cd574ec215a67f158b46b44cde455b275f295b22c2c` | 未compile / 未保存 |
| 15 | UTG_open_CO_call_SB_call | SB → UTG → CO | 8.5 | `552657bcc5e1dd53785ecd44d152a9367e1296ec7e7263ef90d5b5b47394af60` | `943a541efbfe3c6fdf65d7f5f9a81b686789aef55d5f1787d5d7ba1935adb1bd` | 未compile / 未保存 |
| 16 | UTG_open_HJ_call_SB_call | SB → UTG → HJ | 8.5 | `ced4f58d35c1636ee9b4197eef7c636823e8dd0a2f4718f39a3d0b84f5f267c9` | `e92b4159625d2b29c3c53194352da75a05e1649634f29c4c820b1e522a2ddbd0` | 未compile / 未保存 |

共通の設計要件は117node・9tier。Flop rule数は9×flop nodes＋9×12×flop contexts、laterは9×later nodes＋9×5×later contexts。各policy60,000以下をvalidatorで確認する。SB/no-blindのcontext数をpilot1209と決め打ちしていない。

## 各spotの作者根拠

### 優先2: HJ_open_BTN_call_BB_call

HJ opens 312 combos, BTN flats 121.6 and BB overcalls 244.4. HJ high-card initiative is narrower than CO; BTN has more pocket-pair mass and less offsuit breadth than the pilot. BB still has broad suited support and a small KK trap.

- first = BB / second_caller: `BB_vs_HJ_BTNcall`、244.4 weighted combos、62 supported hand classes。BB cold responses are constrained by both HJ and a tighter BTN flat; low-board draw leads remain possible, premium leads stay check-heavy.
  - dry_high bet [monster,strong,draw,medium,air] = [25, 7, 7, 2, 1]。wet_low = [42, 12, 20, 3, 1]。
- middle = HJ / opener: `HJ_open`、312.0 weighted combos、64 supported hand classes。HJ is the c-bettor after BB checks. Retain high-dry strong value, but suppress low/wet air into the BTN range.
  - dry_high bet [monster,strong,draw,medium,air] = [60, 54, 24, 15, 9]。wet_low = [58, 30, 28, 4, 2]。
- last = BTN / first_caller: `BTN_vs_HJ`、121.6 weighted combos、49 supported hand classes。BTN can stab after two checks, but its HJ-flat range is appreciably less offsuit-heavy than BTN versus CO. Preserve small-pair realization without treating position as action closure.
  - dry_high bet [monster,strong,draw,medium,air] = [71, 61, 36, 21, 16]。wet_low = [72, 47, 40, 8, 6]。

### 優先3: HJ_open_CO_call_BB_call

CO flat is 83.1 combos versus BTN 121.6: 38.7% are 22-JJ pairs and only 3.6% suited connectors. BB overcall contracts to 225.2. HJ cannot treat CO checks as a wide BTN check; mid/low boards meet denser pair support.

- first = BB / second_caller: `BB_vs_HJ_COcall`、225.2 weighted combos、59 supported hand classes。BB has less small-hand freedom against HJ plus a pair-heavy CO; retain suited backstops without HU-width defence.
  - dry_high bet [monster,strong,draw,medium,air] = [23, 6, 6, 1, 1]。wet_low = [39, 10, 18, 2, 1]。
- middle = HJ / opener: `HJ_open`、312.0 weighted combos、64 supported hand classes。Opener c-bets more selectively than against BTN: CO has 38.7% 22-JJ mass, especially affecting middle and low boards.
  - dry_high bet [monster,strong,draw,medium,air] = [59, 52, 22, 13, 8]。wet_low = [54, 27, 25, 3, 2]。
- last = CO / first_caller: `CO_vs_HJ`、83.1 weighted combos、38 supported hand classes。CO last-seat probing uses its pair-heavy flat; lower pure-air probing than the wider BTN case, while preserving strong overpair continues.
  - dry_high bet [monster,strong,draw,medium,air] = [67, 58, 30, 18, 12]。wet_low = [71, 46, 32, 7, 5]。

### 優先4: UTG_open_BTN_call_BB_call

UTG is 212.5 combos with 8.5% QQ+ and 14.1% 77-JJ. BTN is 93.7 with 4.2% QQ+; BB is 199.4 and retains KK10%. High-board concentration is stronger than HJ/CO, but low-board BB connectivity cannot be copied to the tight BTN.

- first = BB / second_caller: `BB_vs_UTG_BTNcall`、199.4 weighted combos、53 supported hand classes。BB protects its retained KK and suited board coverage, but calls into UTG and BTN are markedly tighter than versus CO.
  - dry_high bet [monster,strong,draw,medium,air] = [21, 6, 6, 1, 1]。wet_low = [40, 10, 18, 2, 1]。
- middle = UTG / opener: `UTG_open`、212.5 weighted combos、49 supported hand classes。UTG high-dry c-bet value is retained; low/wet air and medium bets are small because premium concentration does not confer a low-board nut advantage.
  - dry_high bet [monster,strong,draw,medium,air] = [65, 59, 21, 13, 7]。wet_low = [49, 23, 22, 2, 1]。
- last = BTN / first_caller: `BTN_vs_UTG`、93.7 weighted combos、35 supported hand classes。BTN retains 20% AA/KK flats but is only 93.7 combos; aggression after two checks is less air-driven and pressure defence respects UTG value.
  - dry_high bet [monster,strong,draw,medium,air] = [66, 57, 28, 17, 10]。wet_low = [67, 42, 31, 6, 4]。

### 優先5: UTG_open_CO_call_BB_call

CO versus UTG is 68.8 combos: 31.0% 77-JJ, 11.8% 22-66, no suited-connector flats. BB remains 186.1 with 11.0% low pairs. UTG c-bets through a very pair-heavy CO; last-seat low-board value and high-card air behave differently.

- first = BB / second_caller: `BB_vs_UTG_COcall`、186.1 weighted combos、51 supported hand classes。BB must pass both UTG and a narrow CO caller; maintain nut-support leads on low connected boards, not a broad range lead.
  - dry_high bet [monster,strong,draw,medium,air] = [20, 5, 5, 1, 0]。wet_low = [39, 9, 17, 2, 1]。
- middle = UTG / opener: `UTG_open`、212.5 weighted combos、49 supported hand classes。UTG has premium overpairs, but CO pocket-pair density discourages automatic high-frequency barrels or thin medium bets.
  - dry_high bet [monster,strong,draw,medium,air] = [62, 56, 19, 11, 6]。wet_low = [45, 20, 20, 1, 1]。
- last = CO / first_caller: `CO_vs_UTG`、68.8 weighted combos、29 supported hand classes。CO lacks suited-connector flats but has dense mid/low pairs. Probe value on low boards rather than importing BTN semi-bluff density.
  - dry_high bet [monster,strong,draw,medium,air] = [61, 53, 21, 15, 7]。wet_low = [66, 42, 22, 5, 3]。

### 優先6: UTG_open_HJ_call_BB_call

HJ first-flat is the tightest at 56.7 combos, with 36.5% 77-JJ and no suited connectors. BB177 has only 4.7% 22-66, substantially below the other BB cases. Both caller compositions limit easy low-board assumptions.

- first = BB / second_caller: `BB_vs_UTG_HJcall`、177.0 weighted combos、50 supported hand classes。BB has less small-pair coverage here and faces the densest HJ pair flat. Suppress low/wet leads relative to UTG-BTN-BB.
  - dry_high bet [monster,strong,draw,medium,air] = [19, 5, 5, 1, 0]。wet_low = [34, 8, 15, 1, 1]。
- middle = UTG / opener: `UTG_open`、212.5 weighted combos、49 supported hand classes。UTG first raiser is middle postflop. Small high-dry value bets remain, but HJ low-board overpair/set density caps automatic aggression.
  - dry_high bet [monster,strong,draw,medium,air] = [61, 54, 18, 10, 5]。wet_low = [42, 18, 18, 1, 0]。
- last = HJ / first_caller: `HJ_vs_UTG`、56.7 weighted combos、27 supported hand classes。HJ may be last but is not a wide button range: no suited connectors, many 77-JJ. Use small probes with pair value and few pure-air stabs.
  - dry_high bet [monster,strong,draw,medium,air] = [58, 50, 17, 13, 5]。wet_low = [64, 42, 19, 4, 2]。

### 優先7: CO_open_BTN_call_SB_call

SB overcall is only 37.2 combos/16 hands, with 43.5% 77-JJ and zero 22-66/connectors. It retains AA/KK15% each. CO and BTN are unchanged sources versus the pilot, but their third opponent is a premium-protected pocket-pair/broadway caller, not the broad BB.

- first = SB / second_caller: `SB_vs_CO_BTNcall`、37.2 weighted combos、16 supported hand classes。SB has protected premiums and no small-pair/SC tail. Check most hands OOP but do not inherit BB low-board weakness or BB draw assumptions.
  - dry_high bet [monster,strong,draw,medium,air] = [28, 10, 8, 3, 1]。wet_low = [41, 15, 15, 3, 1]。
- middle = CO / opener: `CO_open`、389.0 weighted combos、78 supported hand classes。CO c-bets less air/medium than against BB. A checked SB retains trapped premiums; low-board overpairs belong heavily to SB as well.
  - dry_high bet [monster,strong,draw,medium,air] = [58, 50, 23, 13, 8]。wet_low = [45, 20, 21, 2, 1]。
- last = BTN / first_caller: `BTN_vs_CO`、145.8 weighted combos、51 supported hand classes。BTN two-check stabs are restricted because SB checks a dense overpair range. Position does not erase that range or turn a pending BB/SB response into closure.
  - dry_high bet [monster,strong,draw,medium,air] = [65, 54, 29, 18, 12]。wet_low = [57, 27, 26, 4, 2]。

### 優先8: HJ_open_BTN_call_SB_call

SB34.6/14 hands is 42.5% 77-JJ with 22.5% offsuit Ax and AA/KK15%. HJ312 and BTN121.6 are tighter than CO/BTN. No SB 22-66 or connectors means low-board overpair structure, not hidden low two-pair coverage.

- first = SB / second_caller: `SB_vs_HJ_BTNcall`、34.6 weighted combos、14 supported hand classes。Retain strong SB overpair continues against HJ, but high-board medium pocket pairs cannot defend merely because the preflop range was tight.
  - dry_high bet [monster,strong,draw,medium,air] = [27, 9, 8, 2, 1]。wet_low = [40, 14, 14, 3, 1]。
- middle = HJ / opener: `HJ_open`、312.0 weighted combos、64 supported hand classes。HJ high-card initiative survives, but both calls are relatively protected. Avoid interpreting SB check as a broad, capped BB check.
  - dry_high bet [monster,strong,draw,medium,air] = [56, 48, 21, 11, 6]。wet_low = [42, 18, 19, 2, 1]。
- last = BTN / first_caller: `BTN_vs_HJ`、121.6 weighted combos、49 supported hand classes。BTN flats less broadly than versus CO and encounters SB overpairs. Small probes dominate; wet-board air stabs are rare.
  - dry_high bet [monster,strong,draw,medium,air] = [62, 51, 26, 15, 9]。wet_low = [54, 25, 24, 3, 2]。

### 優先9: HJ_open_CO_call_BTN_call

No blind remains: HJ FIRST is opener/c-bettor, CO MIDDLE is first caller, BTN LAST is tight second caller (45 combos, 36.0% 77-JJ, 9.3% QQ+). This is not BB lead / HJ c-bet / wide BTN stab. The 9BB pot includes both dead blinds.

- first = HJ / opener: `HJ_open`、312.0 weighted combos、64 supported hand classes。HJ acts first as the raiser. Its selective c-bet frequency is materially above a blind donk, while both callers remain behind.
  - dry_high bet [monster,strong,draw,medium,air] = [57, 40, 19, 10, 6]。wet_low = [39, 17, 18, 2, 1]。
- middle = CO / first_caller: `CO_vs_HJ`、83.1 weighted combos、38 supported hand classes。CO probe follows an opener check with a tight BTN still behind. It is NOT a c-bet; low-board pair value is selective and cold draw calls remain cautious.
  - dry_high bet [monster,strong,draw,medium,air] = [48, 27, 16, 7, 3]。wet_low = [51, 27, 17, 2, 1]。
- last = BTN / second_caller: `BTN_vs_HJ_COcall`、45.0 weighted combos、18 supported hand classes。BTN second caller has no small pairs/connectors and retains premiums. Its two-check bet is value-oriented; do not copy a 145.8-combo BTN first-flat stab.
  - dry_high bet [monster,strong,draw,medium,air] = [66, 49, 22, 11, 6]。wet_low = [68, 43, 23, 3, 2]。

### 優先10: HJ_open_CO_call_SB_call

SB26.5/12 hands is 52.1% 77-JJ and 12.5% QQ+, with no connectors/small pairs. CO83.1 is itself pair-heavy. All three ranges have dense medium/high pairs; a low board is not automatically a two-check steal opportunity.

- first = SB / second_caller: `SB_vs_HJ_COcall`、26.5 weighted combos、12 supported hand classes。SB protection is mostly pocket-pair value. Do not invent suited-connector semibluffs or map KK to the BB pilot zero support.
  - dry_high bet [monster,strong,draw,medium,air] = [25, 8, 7, 2, 0]。wet_low = [40, 15, 13, 2, 1]。
- middle = HJ / opener: `HJ_open`、312.0 weighted combos、64 supported hand classes。HJ must get through protected SB and pair-heavy CO. More checking than the BTN variant, especially low/wet and paired shapes.
  - dry_high bet [monster,strong,draw,medium,air] = [52, 44, 18, 9, 5]。wet_low = [35, 14, 16, 1, 0]。
- last = CO / first_caller: `CO_vs_HJ`、83.1 weighted combos、38 supported hand classes。CO last can value-probe pairs, but checking SB holds concentrated overpairs. Air attempts and weak draw calls stay small.
  - dry_high bet [monster,strong,draw,medium,air] = [56, 46, 20, 12, 6]。wet_low = [51, 24, 19, 2, 1]。

### 優先11: UTG_open_BTN_call_SB_call

UTG212.5 and BTN93.7 face SB24.1/10 hands: 48.5% 77-JJ, 17.4% QQ+, AA/KK20%. SB has no 22-66/connectors. This is much more protected than UTG-BTN-BB, while BTN still has the broadest first-flat among UTG cases.

- first = SB / second_caller: `SB_vs_UTG_BTNcall`、24.1 weighted combos、10 supported hand classes。SB preserves premium traps, with dry-low overpair value. It is not a source of speculative low-board raises.
  - dry_high bet [monster,strong,draw,medium,air] = [24, 8, 6, 2, 0]。wet_low = [39, 14, 12, 2, 1]。
- middle = UTG / opener: `UTG_open`、212.5 weighted combos、49 supported hand classes。UTG does have high-card premium advantage, but SB and BTN premium support makes generic high-board range betting inappropriate.
  - dry_high bet [monster,strong,draw,medium,air] = [56, 48, 17, 9, 4]。wet_low = [34, 13, 15, 1, 0]。
- last = BTN / first_caller: `BTN_vs_UTG`、93.7 weighted combos、35 supported hand classes。BTN should not turn two checks from UTG and premium SB into a wide steal. Strong private value and selected draws dominate bets.
  - dry_high bet [monster,strong,draw,medium,air] = [57, 47, 21, 12, 6]。wet_low = [46, 20, 20, 2, 1]。

### 優先12: UTG_open_CO_call_BTN_call

UTG FIRST212.5 / CO MIDDLE68.8 / BTN LAST30.8. BTN overcall is 41.9% 77-JJ and 14.6% QQ+, with zero 22-66/connectors. CO and BTN have different call sources; neither is a blind defender.

- first = UTG / opener: `UTG_open`、212.5 weighted combos、49 supported hand classes。UTG is OOP to BOTH callers from the start, so first-node c-bet is selective. Strong high cards support value, not BB-style near-zero leading.
  - dry_high bet [monster,strong,draw,medium,air] = [53, 36, 14, 7, 4]。wet_low = [30, 11, 12, 1, 0]。
- middle = CO / first_caller: `CO_vs_UTG`、68.8 weighted combos、29 supported hand classes。CO first caller can probe after UTG check but BTN is a dense premium/mid-pair overcaller, so medium/air probes and cold raises are restrained.
  - dry_high bet [monster,strong,draw,medium,air] = [42, 23, 12, 5, 2]。wet_low = [46, 24, 13, 1, 0]。
- last = BTN / second_caller: `BTN_vs_UTG_COcall`、30.8 weighted combos、13 supported hand classes。BTN second call is only30.8 combos and has41.9% 77-JJ. Low-board value probes can be frequent within strong tier, with little accompanying air.
  - dry_high bet [monster,strong,draw,medium,air] = [60, 44, 17, 9, 4]。wet_low = [65, 41, 18, 2, 1]。

### 優先13: UTG_open_HJ_call_BTN_call

UTG FIRST212.5 / HJ MIDDLE56.7 / BTN LAST33.8. HJ flat is 47.1%22-JJ and BTN second call has23.1% offsuit Ax plus36.4%77-JJ. This differs from UTG-CO-BTN both in caller role and Ax-versus-pair support.

- first = UTG / opener: `UTG_open`、212.5 weighted combos、49 supported hand classes。UTG starts as raiser OOP. HJ pair concentration demands even more low-board checks; first is not a blind donk profile.
  - dry_high bet [monster,strong,draw,medium,air] = [51, 34, 13, 6, 3]。wet_low = [27, 9, 11, 1, 0]。
- middle = HJ / first_caller: `HJ_vs_UTG`、56.7 weighted combos、27 supported hand classes。HJ middle is a tight first caller with BTN still behind, not an opener. It has real low-board pair value but little semibluff breadth.
  - dry_high bet [monster,strong,draw,medium,air] = [38, 20, 10, 4, 1]。wet_low = [44, 23, 11, 1, 0]。
- last = BTN / second_caller: `BTN_vs_UTG_HJcall`、33.8 weighted combos、14 supported hand classes。BTN second caller has more offsuit Ax than in UTG-CO-BTN. Retain slightly more high-board value and air availability, not a wide BTN first-flat strategy.
  - dry_high bet [monster,strong,draw,medium,air] = [61, 46, 18, 10, 5]。wet_low = [61, 38, 18, 2, 1]。

### 優先14: UTG_open_HJ_call_CO_call

UTG FIRST212.5 / HJ MIDDLE56.7 / CO LAST24.6. CO second call is only11 hands,18.3%QQ+ and37.8%77-JJ, with no 22-66/connectors. Both callers are tightly selected; CO last is not a broad button analogue.

- first = UTG / opener: `UTG_open`、212.5 weighted combos、49 supported hand classes。The earliest three seats produce the most protected no-blind caller pair. UTG still c-bets first, but ranges justify abundant checks on low/wet boards.
  - dry_high bet [monster,strong,draw,medium,air] = [48, 31, 11, 5, 2]。wet_low = [23, 7, 9, 0, 0]。
- middle = HJ / first_caller: `HJ_vs_UTG`、56.7 weighted combos、27 supported hand classes。HJ middle must pass CO premium traps. Very small air probes; continue strongest pair/draw classes with cold response risk explicit.
  - dry_high bet [monster,strong,draw,medium,air] = [34, 17, 8, 3, 1]。wet_low = [40, 20, 9, 1, 0]。
- last = CO / second_caller: `CO_vs_UTG_HJcall`、24.6 weighted combos、11 supported hand classes。CO last overcaller retains20%AA/KK and has no speculative tail. High strong-tier continues come from its overpair-heavy source, not last-seat license to float.
  - dry_high bet [monster,strong,draw,medium,air] = [56, 42, 14, 8, 3]。wet_low = [61, 38, 15, 2, 0]。

### 優先15: UTG_open_CO_call_SB_call

UTG212.5 / CO68.8 / SB17.9. SB has only eight supported hands and 82.2% QQ+ or 77-JJ; CO is 42.8% 22-JJ. Air/probe and low-board draw assumptions are especially constrained.

- first = SB / second_caller: `SB_vs_UTG_COcall`、17.9 weighted combos、8 supported hand classes。Only eight SB hands are supported. Keep range-level premium protection, but no fictitious low-connector or weak suited-draw tail.
  - dry_high bet [monster,strong,draw,medium,air] = [23, 8, 5, 1, 0]。wet_low = [39, 15, 11, 2, 1]。
- middle = UTG / opener: `UTG_open`、212.5 weighted combos、49 supported hand classes。UTG encounters two dense pair ranges; high-dry selective value remains but low/paired c-bet air approaches zero.
  - dry_high bet [monster,strong,draw,medium,air] = [52, 43, 14, 7, 3]。wet_low = [28, 10, 12, 1, 0]。
- last = CO / first_caller: `CO_vs_UTG`、68.8 weighted combos、29 supported hand classes。CO last has pair value but very little low suited reach. Both opponents check protected overpairs, so pure-air pressure is minimal.
  - dry_high bet [monster,strong,draw,medium,air] = [51, 41, 16, 9, 4]。wet_low = [44, 18, 16, 1, 0]。

### 優先16: UTG_open_HJ_call_SB_call

UTG212.5 / HJ56.7 / SB17.9. SB source is identical to UTG-CO-SB, but HJ caller is narrower and 47.1% 22-JJ; its suited connectors are absent. Identical SB source does not make the opponents or strategy identical.

- first = SB / second_caller: `SB_vs_UTG_HJcall`、17.9 weighted combos、8 supported hand classes。Same eight SB hands as the CO-caller path, but the narrower HJ response makes marginal continues and early leads slightly less attractive.
  - dry_high bet [monster,strong,draw,medium,air] = [22, 7, 5, 1, 0]。wet_low = [38, 14, 10, 2, 0]。
- middle = UTG / opener: `UTG_open`、212.5 weighted combos、49 supported hand classes。UTG is squeezed between two highly selected ranges. Preserve checks with good hands; a tight opener is not licensed to bet every high-card board.
  - dry_high bet [monster,strong,draw,medium,air] = [50, 40, 13, 6, 2]。wet_low = [25, 8, 11, 0, 0]。
- last = HJ / first_caller: `HJ_vs_UTG`、56.7 weighted combos、27 supported hand classes。HJ last has concentrated pocket pairs but no wide button air/connector supply. Its low-board pair value can probe selectively, not indiscriminately.
  - dry_high bet [monster,strong,draw,medium,air] = [47, 38, 13, 7, 3]。wet_low = [42, 18, 13, 1, 0]。

## Python/static確認の実績

- 15profileのID一意、source pinと親Node dumpの一致、seat順/8・8.5・9BB geometry一致。
- 各spotのfirst/middle semanticがblind/nonblind条件どおりであること。
- 全15×3roleでflop12、later各3line、response6、raise4、later-response変化2の5-column整数表が完全。
- 全raise anchorが対応するcontinue anchorを超えず、range supportが全席非zero。
- 15個のauthorAnchors全体がすべて異なる。これは最適性の証明ではなく、全profileの単純renameをしていない静的チェック。
- source statusは全て`authored_pending_compile_and_independent_review`。
- `git diff --check`対象のwhitespace errorなし。
- Nodeによる構文/import/validator実行はまだ行っていない。Python確認をNode test PASSと表記しない。

### 受入れpilotのbyte保全

本作業前後で以下のraw SHA256が一致した。

- 既存recipe: `ae196be62d212769fb27a1b1f6619ffd4c7f6488f5d0c3c132efd13eade42798`
- 既存flop artifact: `660ed0e712cce29d863a0bceecc59b5e94d4334e2be2b0261251ab3c80578718`
- 既存later artifact: `0db36c711160d8e2f818818edc9812ba192c73aed2c636f4b9f85229739d14a9`

既存V1–V4履歴、受入れreport、shared engine/classifierには書いていない。共通compilerをpilotから抽出せず、新15専用emitterを追加した。

## 次のgateと残限界

1. 最初2経路と共通helperを独立Astra設計review。その後15全体のrange/role/頻度判断を確認。
2. 親の明示Node枠で全3geometryのcontractと新registry import、各spot compile、schema/selector/action/117nodeチェック。保存hashはこの段階以降に初めて確定する。
3. 各spotの全1,755flop、later coverage、20,000tuple joint、12×10,000自己対戦と同じ全量replayを維持。sampleを減らさない。
4. Joint警告の増減はsource/range/roleと照合して著者判断する。数値目標に合わせたMDF floorやfrequencyの自動修復はしない。
5. board_sharedの役の強弱差、coarse kicker/draw、compressed history、外側forced-fold3席未モデル化は代表と同じ限界。特にtight SB/nonblindでは、わずかなhand分類がrange全体の続行へ大きく影響するため、独立reviewと実gateを省かない。
6. 15spotをaccepted/supportedと表示するのは個別受入れ後だけ。現在は候補著者データの段階であり、publishやproduction登録はしていない。
