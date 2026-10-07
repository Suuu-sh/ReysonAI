import type { HandFeatures } from "../../scripts/postflop-ai/hand-features.ts";
import { narrative, type NarrativeLanguage } from "../locales/reason-copy.ts";
// Hand-specific postflop copy (EN + JA, numberless): turns the computed hand features (hand-features.ts) and the
// shared role decision (hand-role.ts) into the reasons a hand has for each action. Everything here is about the
// hand itself: what it holds, what it wants from the action, which worse hands pay it off, which blockers it has.
// Range-level strategy sentences live in postflop-advanced.ts and are limited to one per explanation.
import { featureSignature, featuresFromText } from "../../scripts/postflop-ai/hand-features.ts";
import { drawLevel, madeLevel, roleFromFeatures } from "../../scripts/postflop-ai/hand-role.ts";

export type Level4 = "huge" | "many" | "some" | "few" | "none";
export type Desc = {
  f: HandFeatures | null; name: string; en: NarrativeLanguage;
  m: "nuts" | "strong" | "medium" | "weak" | "none"; dr: "combo" | "strong" | "weak" | "none";
  made: string; draw: string; over: string; backdoor: string; has: string; worse: string;
  outs: Level4; improve: string; blockers: string[]; unblock: string; vulnerable: boolean; boardDraws: string;
  river: boolean; aceHigh: boolean; air: boolean; short: string; tag: string; standing: string;
};

const RANK = "23456789TJQKA";
const SUIT_SYMBOL = ["♣", "♦", "♥", "♠"];
const EN_WORD = ["deuce", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "jack", "queen", "king", "ace"];
const cap0 = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const enPlural = (r: number) => r === 4 ? "sixes" : `${EN_WORD[r]}s`;

export function displayName(hand: string): string {
  return /^([2-9TJQKA][cdhs]){2}$/.test(hand)
    ? hand.replace(/([2-9TJQKA])([cdhs])/g, (_m, r, s) => `${r}${SUIT_SYMBOL[("cdhs").indexOf(s)]}`) : hand;
}

const join = (parts: string[], en: NarrativeLanguage) => parts.length < 2 ? (parts[0] ?? "")
  : en ? narrative("{0} and {1}", [parts.slice(0, -1).join(", "), parts[parts.length - 1]], en) : parts.join("と");

export function describeHand(f: HandFeatures | null, name: string, en: NarrativeLanguage, tier: string, o: string): Desc {
  const e = (a: string, j: string) => en ? a : j;
  if (!f) {
    // No concrete cards: describe the hand class only.
    const m = tier === "monster" ? "nuts" : tier === "strong" ? "strong" : tier === "medium" ? "medium" : "none";
    const dr = tier === "draw" ? "strong" : "none";
    const made = ({ monster: e(narrative("a very strong made hand", [], en), "とても強い完成役"), strong: e(narrative("a strong pair", [], en), "強いペア"), medium: e(narrative("a weak pair", [], en), "弱いペア") } as Record<string, string>)[tier] ?? "";
    const draw = tier === "draw" ? e(narrative("a draw", [], en), "ドロー") : "";
    const has = made || draw || e(narrative("no made hand", [], en), "役なし");
    return { f: null, name, en, m: m as Desc["m"], dr, made, draw, over: "", backdoor: "", has, worse: e(narrative("weaker pairs and draws", [], en), "劣るペアやドロー"),
      outs: tier === "draw" ? "many" : "none", improve: "", blockers: [], unblock: "", vulnerable: false, boardDraws: "", river: false,
      aceHigh: false, air: tier === "air", short: made || draw || has, tag: made || draw || has, standing: "" };
  }
  const mk = f.made, d = f.draws, board = f.board;
  const R = (r: number) => en ? EN_WORD[r] : r === 8 ? "10" : RANK[r];
  const art = (word: string) => en === "zh-CN" || en === "es" ? word : narrative("{0} {1}", [/^[aeiou]/.test(word) ? "an" : "a", word], en);
  const card = (r: number, suit: number) => `${r === 8 ? "10" : RANK[r]}${SUIT_SYMBOL[suit]}`;
  const m = madeLevel(f), dr = drawLevel(f);
  const river = f.street === "river";
  const holeRanks = f.hole.map((c: number) => c >> 2);
  const pocket = holeRanks[0] === holeRanks[1];

  // ---- made hand phrase
  let made = "";
  if (mk.playsBoard) {
    const kindName: Record<string, [string, string]> = { straight: [narrative("straight", [], en), "ストレート"], flush: [narrative("flush", [], en), "フラッシュ"], fullHouse: [narrative("full house", [], en), "フルハウス"],
      quads: [narrative("quads", [], en), "フォーカード"], straightFlush: [narrative("straight flush", [], en), "ストレートフラッシュ"] };
    const [kn, kj] = kindName[mk.kind] ?? [narrative("hand", [], en), "役"];
    made = e(narrative("only the board's {0} (a split)", [kn], en), `ボードの${kj}だけ（分け）`);
  } else switch (mk.kind) {
    case "overpair": made = e(narrative("an overpair (pocket {0})", [enPlural(mk.pairRank!)], en), `オーバーペア（${R(mk.pairRank!)}${R(mk.pairRank!)}）`); break;
    case "underpair": made = e(narrative("an underpair (pocket {0})", [enPlural(mk.pairRank!)], en), `アンダーペア（${R(mk.pairRank!)}${R(mk.pairRank!)}）`); break;
    case "topPair": made = e(narrative("top pair ({0}) with {1} kicker", [enPlural(mk.pairRank!), art(R(mk.kicker!))], en), `${R(mk.pairRank!)}のトップペア（${R(mk.kicker!)}キッカー）`); break;
    case "secondPair": made = e(narrative("second pair ({0}) with {1} kicker", [enPlural(mk.pairRank!), art(R(mk.kicker!))], en), `${R(mk.pairRank!)}のセカンドペア（${R(mk.kicker!)}キッカー）`); break;
    case "bottomPair": made = e(narrative("bottom pair ({0}) with {1} kicker", [enPlural(mk.pairRank!), art(R(mk.kicker!))], en), `${R(mk.pairRank!)}のボトムペア（${R(mk.kicker!)}キッカー）`); break;
    case "boardPair": made = e(narrative("only the board's pair of {0}", [enPlural(mk.pairRank!)], en), `ボードの${R(mk.pairRank!)}のペアだけ`); break;
    case "topTwo": made = e(narrative("top two pair ({0} and {1})", [enPlural(mk.pairRanks![0]), enPlural(mk.pairRanks![1])], en), `トップツーペア（${R(mk.pairRanks![0])}と${R(mk.pairRanks![1])}）`); break;
    case "topAndLower": made = e(narrative("two pair with the top pair", [], en), "トップペアを含むツーペア"); break;
    case "lowerTwo": made = e(narrative("the lower two pair", [], en), "下位のツーペア"); break;
    case "pocketPlusBoardPair": made = e(narrative("two pair from a pocket pair and the board pair", [], en), `ポケットペアとボードのペアによるツーペア`); break;
    case "boardPairPlusOne": made = e(narrative("two pair that leans on the board pair", [], en), "ボードのペアに頼ったツーペア"); break;
    case "boardTwoPair": made = e(narrative("only the two pair on the board", [], en), "ボードのツーペアだけ"); break;
    case "set": made = e(narrative("a set of {0}", [enPlural(mk.tripsRank!)], en), `${R(mk.tripsRank!)}${R(mk.tripsRank!)}のセット`); break;
    case "trips": made = e(narrative("trips ({0}, with a pair on the board)", [enPlural(mk.tripsRank!)], en), `トリップス（${R(mk.tripsRank!)}）`); break;
    case "boardTrips": made = e(narrative("only the trips on the board", [], en), "ボードのトリップスだけ"); break;
    case "straight": made = mk.nut ? e(narrative("the nut straight", [], en), "ナッツストレート") : e(narrative("a straight that is not the nuts", [], en), "ナッツではないストレート"); break;
    case "flush": made = mk.flushKind === "nut" ? e(narrative("the nut flush", [], en), "ナッツフラッシュ") : mk.flushKind === "secondNut" ? e(narrative("the second-nut flush", [], en), "2番手のフラッシュ") : e(narrative("a low flush", [], en), "下位のフラッシュ"); break;
    case "fullHouse": made = e(narrative("a full house", [], en), "フルハウス"); break;
    case "quads": made = e(narrative("quads", [], en), "フォーカード"); break;
    case "straightFlush": made = e(narrative("a straight flush", [], en), "ストレートフラッシュ"); break;
    default: made = "";
  }

  // ---- draws
  const drawParts: string[] = [];
  const outRanks: number[] = d.outRanks ?? [];
  const completes = outRanks.length ? e(narrative(" ({0} completes it)", [outRanks.map(r => art(R(r))).join(" or ")], en), `（${outRanks.map(r => R(r)).join("か")}で完成）`) : "";
  if (d.flush) {
    const k = d.flush.kind;
    const sym = SUIT_SYMBOL[d.flush.suit];
    drawParts.push(k === "nut" ? e(narrative("the nut flush draw ({0})", [sym], en), `ナッツフラッシュドロー（${sym}）`)
      : k === "secondNut" ? e(narrative("a flush draw that is not to the nuts ({0})", [sym], en), `ナッツではないフラッシュドロー（${sym}）`)
      : e(narrative("a low flush draw ({0})", [sym], en), `ナッツから遠いフラッシュドロー（${sym}）`));
  }
  if (d.straight) {
    const t = d.straight;
    drawParts.push(t === "gutshot" ? e(narrative("a gutshot{0}", [completes], en), `ガットショット${completes}`)
      : t === "openEnded" ? e(narrative("an open-ended straight draw{0}", [completes], en), `オープンエンドのストレートドロー${completes}`)
      : e(narrative("a double-gutter straight draw{0}", [completes], en), `ダブルガットのストレートドロー${completes}`));
  }
  const draw = d.combo ? e(narrative("a combo draw of {0}", [drawParts.join(" and ")], en), `${drawParts.join("と")}のコンボドロー`) : join(drawParts, en);
  const backdoorParts: string[] = [];
  if (d.backdoorFlush) backdoorParts.push(e(narrative("a backdoor flush draw{0}", [d.backdoorFlush.nut ? narrative(" to the nuts", [], en) : ""], en), `バックドアフラッシュドロー${d.backdoorFlush.nut ? "（ナッツ）" : ""}`));
  if (d.backdoorStraight) backdoorParts.push(e(narrative("a backdoor straight draw", [], en), "バックドアストレートドロー"));
  const backdoor = join(backdoorParts, en);

  // ---- overcards
  const oc = f.overcards;
  const showOver = oc.count > 0 && !pocket && mk.category === "highCard";
  const over = !showOver ? "" : oc.count === 1 ? e(narrative("an overcard (the {0})", [R(oc.ranks[0])], en), `オーバーカードの${R(oc.ranks[0])}`)
    : e(narrative("two overcards (the {0} and the {1})", [R(oc.ranks[0]), R(oc.ranks[1])], en), `${R(oc.ranks[0])}と${R(oc.ranks[1])}のオーバーカード`);

  const aceHigh = f.aceHigh;
  const hiRank = Math.max(...holeRanks), loRank = Math.min(...holeRanks);
  const boardOnlyPair = mk.kind === "boardPair" || mk.kind === "boardTwoPair";
  const highPhrase = (mk.category === "highCard" || boardOnlyPair) && !pocket && !mk.playsBoard ? e(narrative("{0}-high with {1}", [R(hiRank), art(R(loRank))], en), `${R(hiRank)}ハイ（${R(loRank)}）`) : "";
  const hasParts = [made && mk.category !== "highCard" ? made : "", draw, over].filter(Boolean);
  const isAir = m === "none" && dr === "none";
  if (isAir) {
    hasParts.length = 0;
    hasParts.push(highPhrase || (mk.playsBoard ? made : e(narrative("only the board's cards", [], en), "ボードのカードだけ")));
    if (backdoor) hasParts.push(backdoor);
  } else if (!hasParts.length && backdoor) hasParts.push(backdoor);
  // "only the board's cards" already says "only"; wrapping it again read "only only".
  const boardCardsOnly = isAir && !highPhrase && !mk.playsBoard;
  const has = mk.playsBoard && isAir ? made : isAir && !boardCardsOnly ? e(narrative("only {0}", [join(hasParts, en)], en), `${join(hasParts, en)}だけ`) : join(hasParts, en);

  // ---- worse hands that keep paying a value hand
  const w = (a: string, b: string, c: string, d2: string) => e(river ? a : b, river ? c : d2);
  let worse = "";
  // Worse hands for the strong made hands come from the holdings that really lose to us (hand-features worseClasses).
  const PHR: Record<string, [string, string]> = {
    pair: [narrative("one-pair hands", [], en), "ワンペア"], twoPair: [narrative("weaker two pair", [], en), "劣るツーペア"],
    trips: f.boardInfo.paired ? [narrative("trips", [], en), "トリップス"] : [narrative("sets", [], en), "セット"],
    straight: [narrative("weaker straights", [], en), "劣るストレート"], flush: [narrative("lower flushes", [], en), "劣るフラッシュ"],
    fullHouse: [narrative("lower full houses", [], en), "劣るフルハウス"], quads: [narrative("lower quads", [], en), "劣るフォーカード"],
  };
  const fromClasses = () => {
    const names: string[] = (mk.worseClasses ?? []).filter((c: string) => PHR[c]).slice(0, 3);
    const parts = names.map(c => en ? PHR[c][0] : PHR[c][1]);
    if (!river && names.includes("pair")) parts.push(e(narrative("draws", [], en), "ドロー"));
    return parts.length ? join(parts, en) : e(narrative("weaker hands", [], en), "劣る手");
  };
  if (mk.playsBoard) worse = w(narrative("weaker pairs and ace-high", [], en), narrative("weaker pairs and draws", [], en), "劣るペアやエースハイ", "劣るペアやドロー");
  else switch (mk.kind) {
    case "quads": case "fullHouse": case "straightFlush": case "flush": case "straight": case "set": case "trips":
    case "boardPairPlusOne": case "topTwo": case "topAndLower": case "lowerTwo": case "pocketPlusBoardPair":
      worse = fromClasses(); break;
    case "overpair": {
      const wp = mk.worsePairs ?? {};
      const parts = [wp.topPair ? e(narrative("top pair", [], en), "トップペア") : "", wp.underpair ? e(narrative("underpairs", [], en), "アンダーペア") : "", !river ? e(narrative("draws", [], en), "ドロー") : ""].filter(Boolean);
      worse = parts.length ? join(parts, en) : e(narrative("weaker hands", [], en), "劣る手"); break;
    }
    case "topPair": case "secondPair": case "bottomPair": case "underpair": {
      const wp = mk.worsePairs ?? {};
      const strongKicker = mk.kind === "topPair" && mk.kickerStrength === "strong";
      const parts = [
        strongKicker && wp.topPair ? e(narrative("top pair with a worse kicker", [], en), "キッカーの劣るトップペア") : "",
        wp.lower ? (mk.kind === "topPair" ? e(narrative("second pair and lower pairs", [], en), "セカンドペアや下位のペア") : e(narrative("lower pairs", [], en), "下位のペア")) : "",
        mk.kind === "topPair" ? "" : e(narrative("ace-high", [], en), "エースハイ"),
        !river ? (mk.kind === "topPair" ? e(narrative("draws", [], en), "ドロー") : e(narrative("weak draws", [], en), "弱いドロー")) : "",
      ].filter(Boolean);
      worse = parts.length ? join(parts, en) : e(narrative("weaker hands", [], en), "劣る手"); break;
    }
    default: worse = w(narrative("weaker pairs and ace-high", [], en), narrative("weaker pairs and draws", [], en), "劣るペアやエースハイ", "劣るペアやドロー");
  }

  // ---- outs and how the hand improves
  const outsN = d.outs ?? 0;
  const outs: Level4 = outsN >= 12 ? "huge" : outsN >= 8 ? "many" : outsN >= 4 ? "some" : outsN > 0 ? "few" : "none";
  const impr: string[] = [];
  if (d.straight && outRanks.length) impr.push(e(narrative("{0} makes the straight", [outRanks.map(r => art(R(r))).join(" or ")], en), `${outRanks.map(r => R(r)).join("か")}でストレート`));
  if (d.flush) impr.push(d.flush.kind === "nut" ? e(narrative("any {0} makes the nut flush", [SUIT_SYMBOL[d.flush.suit]], en), `${SUIT_SYMBOL[d.flush.suit]}でナッツフラッシュ`)
    : e(narrative("any {0} makes a flush, though not the nuts", [SUIT_SYMBOL[d.flush.suit]], en), `${SUIT_SYMBOL[d.flush.suit]}でフラッシュ（ナッツではない）`));
  if (showOver && mk.category === "highCard") impr.push(oc.count === 1 ? e(narrative("pairing the {0} gives top pair", [R(oc.ranks[0])], en), `${R(oc.ranks[0])}を引けばトップペア`) : e(narrative("pairing an overcard gives top pair", [], en), "オーバーカードを引けばトップペア"));

  // ---- blockers
  const bl = f.blockers, blockers: string[] = [];
  if (bl.nutFlush) blockers.push(e(narrative("the {0} blocks the nut flush", [card(bl.nutFlush.rank, bl.nutFlush.suit)], en), `${card(bl.nutFlush.rank, bl.nutFlush.suit)}を持ってナッツフラッシュをブロックしている`));
  else if (bl.secondNutFlush) blockers.push(e(narrative("the {0} blocks the second-nut flush", [card(bl.secondNutFlush.rank, bl.secondNutFlush.suit)], en), `${card(bl.secondNutFlush.rank, bl.secondNutFlush.suit)}で2番手のフラッシュをブロックしている`));
  if (bl.nutStraight) blockers.push(e(narrative("it holds a card that blocks the nut straight", [], en), "ナッツストレートに必要なカードを持っている"));
  if (oc.ranks.includes(12) && board[0] !== undefined && !pocket && mk.category === "highCard") blockers.push(e(narrative("the ace removes the top-pair-top-kicker and overpair combos", [], en), "Aを持つため、トップペア・トップキッカーやオーバーペアのコンボが減っている"));
  const unblock = !bl.sets && !(oc.count > 0) ? e(narrative("neither the {0} nor the {1} matches the board, so it leaves the weak pairs {2} would fold in the range", [R(hiRank), R(loRank), o], en), `${R(hiRank)}も${R(loRank)}もボードのランクと重ならないので、相手が降りるはずの弱いペアを減らしません`) : "";

  const flushy = f.boardInfo.flushy, connected = f.boardInfo.connected;
  const boardDraws = flushy && connected ? e(narrative("flush and straight draws", [], en), "フラッシュドローやストレートドロー") : flushy ? e(narrative("flush draws", [], en), "フラッシュドロー") : connected ? e(narrative("straight draws", [], en), "ストレートドロー") : "";

  const kindTag: Record<string, [string, string]> = { overpair: [narrative("an overpair", [], en), "オーバーペア"], underpair: [narrative("an underpair", [], en), "アンダーペア"],
    topPair: [narrative("top pair", [], en), "トップペア"], secondPair: [narrative("second pair", [], en), "セカンドペア"], bottomPair: [narrative("bottom pair", [], en), "ボトムペア"],
    topTwo: [narrative("two pair", [], en), "ツーペア"], topAndLower: [narrative("two pair", [], en), "ツーペア"], lowerTwo: [narrative("two pair", [], en), "ツーペア"], pocketPlusBoardPair: [narrative("two pair", [], en), "ツーペア"],
    boardPairPlusOne: [narrative("two pair", [], en), "ツーペア"], set: [narrative("a set", [], en), "セット"], trips: [narrative("trips", [], en), "トリップス"], straight: [narrative("a straight", [], en), "ストレート"],
    flush: [narrative("a flush", [], en), "フラッシュ"], fullHouse: [narrative("a full house", [], en), "フルハウス"], quads: [narrative("quads", [], en), "フォーカード"], straightFlush: [narrative("a straight flush", [], en), "ストレートフラッシュ"] };
  const drawTag: Record<string, [string, string]> = { gutshot: [narrative("a gutshot", [], en), "ガットショット"], openEnded: [narrative("an open-ended draw", [], en), "オープンエンド"], doubleGutter: [narrative("a double-gutter draw", [], en), "ダブルガット"] };
  const pr = mk.pairRank!;
  const kk = mk.kicker! !== undefined ? mk.kicker! : -1;
  const pairTag = (en0: string, ja0: string): [string, string] => [narrative("{0} ({1} with {2} kicker)", [en0, enPlural(pr!), art(R(kk))], en), `${R(pr!)}の${ja0}（${R(kk)}キッカー）`];
  const tagPair: [string, string] = m !== "none" && ["topPair", "secondPair", "bottomPair"].includes(mk.kind)
    ? pairTag(kindTag[mk.kind][0], kindTag[mk.kind][1])
    : m !== "none" && mk.kind === "overpair" ? [narrative("an overpair ({0})", [enPlural(pr!)], en), `${R(pr!)}のオーバーペア`]
    : m !== "none" && mk.kind === "underpair" ? [narrative("an underpair ({0})", [enPlural(pr!)], en), `${R(pr!)}のアンダーペア`]
    : m !== "none" && mk.pairRanks! && kindTag[mk.kind] ? [narrative("two pair ({0} and {1})", [enPlural(mk.pairRanks![0]), enPlural(mk.pairRanks![1])], en), `${R(mk.pairRanks![0])}と${R(mk.pairRanks![1])}のツーペア`]
    : m !== "none" && mk.kind === "set" ? [narrative("a set of {0}", [enPlural(mk.tripsRank!)], en), `${R(mk.tripsRank!)}のセット`]
    : m !== "none" && kindTag[mk.kind] ? kindTag[mk.kind]
    : d.combo ? [narrative("a combo draw", [], en), "コンボドロー"]
    : d.flush ? (d.flush.kind === "nut" ? [narrative("the nut flush draw", [], en), "ナッツフラッシュドロー"] : [narrative("a flush draw", [], en), "フラッシュドロー"])
    : d.straight ? drawTag[d.straight]
    : [highPhrase || e(narrative("the board's cards", [], en), "ボードのカード"), highPhrase || "ボードのカード"];
  const tag = en ? tagPair[0] : tagPair[1];
  const pctl = mk.percentile ?? 0;
  const level = pctl >= 0.9 ? 0 : pctl >= 0.65 ? 1 : pctl >= 0.4 ? 2 : 3;
  const boardRanksAll = [...new Set<number>(board.map((cd: number) => cd >> 2))];
  const above = boardRanksAll.filter(r => r > (mk.pairRank! ?? hiRank)).length;
  const NUM = en ? ["no", "one", "two", narrative("three", [], en), narrative("four", [], en)] : ["", "一枚", "二枚", "三枚", "四枚"];
  const showAbove = mk.category === "pair" && mk.kind !== "overpair" && above > 0;
  const standing = m === "none" ? "" : en
    ? narrative("{0} is {1}", [cap0(tag), [narrative("ahead of nearly every holding", [], en), narrative("ahead of most holdings", [], en), narrative("around the middle of all holdings", [], en), narrative("behind most holdings", [], en)][level]], en, "standing")
      + narrative("{0}.", [!river && boardDraws ? narrative(", though the {0} on this board can still overtake it", [boardDraws], en) : showAbove ? narrative(", with {0} board {1} above the pair", [NUM[Math.min(above, 4)], above === 1 ? "card" : "cards"], en) : ""], en)
    : `${tag}は${["ほぼ全てのハンドに勝っています", "大半のハンドに勝っています", "全ハンドの中位あたりの強さです", "大半のハンドに負けています"][level]}。`
      + `${!river && boardDraws ? `ただしこのボードの${boardDraws}に${tag}は逆転される余地があります。` : showAbove ? `${tag}より上のランクのボードカードが${NUM[Math.min(above, 4)]}あります。` : ""}`;
  return { f, name, en, m: m as Desc["m"], dr, made, draw, over, backdoor, has, worse, outs, improve: en ? join(impr, en) : impr.join("、"), blockers, unblock,
    vulnerable: Boolean(mk.vulnerable), boardDraws, river, aceHigh, air: m === "none" && dr === "none",
    short: (mk.category !== "highCard" && made) || draw || has, tag, standing };
}

// Features for the explanation inputs: an exact combo, or the most common combo class of an averaged hand.
export function featuresForInput(board?: string, cards?: string, combos?: { cards: string; weight: number }[]): HandFeatures | null {
  if (!board || !/^([2-9TJQKA][cdhs]){3,5}$/.test(board)) return null;
  try {
    if (cards && /^([2-9TJQKA][cdhs]){2}$/.test(cards)) return featuresFromText(cards, board);
    if (!combos?.length) return null;
    const bySig = new Map<string, { w: number; f: HandFeatures }>();
    for (const c of combos) {
      if (!(c.weight > 0) || !/^([2-9TJQKA][cdhs]){2}$/.test(c.cards)) continue;
      let f: HandFeatures;
      try { f = featuresFromText(c.cards, board); } catch { continue; }
      const sig = featureSignature(f), cur = bySig.get(sig);
      if (cur) cur.w += c.weight; else bySig.set(sig, { w: c.weight, f });
    }
    return [...bySig.values()].sort((a, b) => b.w - a.w)[0]?.f ?? null;
  } catch { return null; }
}

export { roleFromFeatures };

// ---- sentences ---------------------------------------------------------------------------------------------
export type HC = {
  en: NarrativeLanguage; o: string; street: "flop" | "turn" | "river"; ip: boolean;
  st: { level: "comfortable" | "borderline" | "short"; place: string | null; blocker: string | null; mix: string | null; bluffCapped: boolean } | null;
  bettorMix: string | null;
  // The raise is capped by the stack, so it is offered (and described) as an all-in.
  raiseAllIn?: boolean;
};
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
type Role = { role: string; sub: string };

function outsLine(d: Desc, c: HC, raise = false): string {
  const e = (a: string, j: string) => c.en ? a : j;
  switch (d.outs) {
    case "huge": return e(narrative("When called it still has a huge number of outs, so it is happy to get the money in.", [], c.en), "コールされても非常に多くのアウツが残り、お金が入っても歓迎できます。");
    case "many": return e(narrative("When called it still has plenty of outs to improve.", [], c.en), "コールされても改善できるアウツが十分に残ります。");
    case "some": return e(narrative("When called it still has a few clean outs.", [], c.en), "コールされてもクリーンなアウツがいくつか残ります。");
    default: return raise
      ? e(narrative("With few outs it relies mostly on {0} folding, and gives up if re-raised.", [c.o], c.en), "アウツが少ないので主に相手のフォールド頼みで、再レイズされれば降ります。")
      : e(narrative("With few outs it relies mostly on {0} folding.", [c.o], c.en), "アウツが少ないので主に相手のフォールド頼みです。");
  }
}
const improveLine = (d: Desc, c: HC) => d.improve ? (c.en ? narrative("{0}.", [cap(d.improve)], c.en) : `${d.improve}。`) : "";
const blockerLine = (d: Desc, c: HC, why: string, whyJa: string) => d.blockers.length
  ? (c.en ? `${cap(d.blockers[0])}${why}.` : `${d.blockers[0]}${whyJa}。`) : "";
const nonNutFlush = (d: Desc) => d.f?.draws.flush && d.f.draws.flush.kind !== "nut";

// Betting actions (bet sizes and all-in) for a hand: lead with what the hand has, why this role and why this size.
export function betSentences(d: Desc, a: string, role: Role, c: HC): string[] {
  const e = (x: string, j: string) => c.en ? x : j;
  const o = c.o, out: string[] = [];
  const mk = d.f?.made;
  const verb = a === "bet33" ? e(narrative("bets small", [], c.en), "小さく打ち") : a === "bet75" ? e(narrative("bets big", [], c.en), "大きく打ち") : a === "bet125" ? e(narrative("overbets", [], c.en), "オーバーベットし") : e(narrative("shoves", [], c.en), "オールインし");
  const verbJa = a === "bet33" ? "小さく打つ" : a === "bet75" ? "大きく打つ" : a === "bet125" ? "オーバーベットする" : "オールインする";
  const small = a === "bet33", shove = a === "allin", over = a === "bet125";
  switch (role.role) {
    case "value": {
      out.push(role.sub === "nuts"
        ? e(narrative("{0} has {1}, close to the best hand this board allows, so it {2} to build the pot and gets paid by {3}.", [d.name, d.made, verb, d.worse], c.en),
          `${d.name}は${d.made}でこのボードで最強に近く、${verbJa}ことでポットを育て、${d.worse}から払ってもらえます。`)
        : e(narrative("{0} has {1}, ahead of {2}, so it {3} for value.", [d.name, d.made, d.worse, verb], c.en), `${d.name}は${d.made}で${d.worse}より強いので、バリューで${verbJa}手です。`));
      out.push(small ? e(narrative("The small size keeps {0} calling instead of folding.", [d.worse], c.en), `小さいサイズなら、${d.worse}がフォールドせずコールを続けやすくなります。`)
        : shove ? e(narrative("At this stack depth the shove just puts the stacks in while it is far ahead.", [], c.en), "このスタックの深さでは、大きくリードしているうちにスタックを入れきるだけです。")
        : over ? e(narrative("Only the very top of the range can afford an overbet, and this hand is part of it.", [], c.en), "オーバーベットを打てるのはレンジの最上位だけで、この手はそこに入っています。")
        : d.river ? e(narrative("The larger size makes {0} pay the most.", [d.worse], c.en), `大きいサイズなら、${d.worse}から最も多く取れます。`)
        : e(narrative("The larger size makes {0} pay the most for their draws and pairs.", [d.worse], c.en), `大きいサイズなら、${d.worse}から最も多く取れます。`));
      if (role.sub === "protect" && d.boardDraws) out.push(e(narrative("The board offers {0}, so betting also charges them instead of giving a free card.", [d.boardDraws], c.en),
        `ボードに${d.boardDraws}があるので、ベットは無料でカードを見せずにそれらへ課金する役目も果たします。`));
      else if (mk?.kind === "topPair") out.push(mk.kickerStrength === "strong"
        ? e(narrative("The kicker keeps it ahead of the other top-pair combos.", [], c.en), "キッカーが強く、他のトップペアのコンボにも勝っています。")
        : e(narrative("The kicker is only fair, so it is not eager to face a raise.", [], c.en), "キッカーはそこそこなので、レイズされるのは歓迎しません。"));
      else if (mk?.kind === "overpair") out.push(e(narrative("It beats every pair on the board and loses to two pair and better.", [], c.en), "ボード上のどのペアにも勝ち、負けるのはツーペア以上だけです。"));
      else if (mk?.kind === "set" || mk?.kind === "trips") out.push(e(narrative("A hand this strong is hard to put on, so the opponent keeps paying with top pair and draws.", [], c.en), "この強さは読まれにくく、相手はトップペアやドローで払い続けやすくなります。"));
      else if (mk && ["straight", "flush", "fullHouse", "quads", "straightFlush"].includes(mk.kind)) out.push(e(narrative("It beats nearly everything the opponent can continue with, so the goal is to get as much as possible in.", [], c.en), "相手が続行できるほぼ全ての手に勝つので、できるだけ多く取ることが目的です。"));
      break;
    }
    case "semi-bluff": {
      const target = d.draw || d.over || d.has;
      out.push(e(narrative("{0} holds {1}{2}, so it {3} as a semi-bluff that wins at once when {4} folds.", [d.name, target, d.draw && d.over ? narrative(" plus {0}", [d.over], c.en) : "", verb, o], c.en),
        `${d.name}は${target}${d.draw && d.over ? `と${d.over}` : ""}を持ち、相手が降りれば即座に勝てるセミブラフとして${verbJa}手です。`));
      out.push(small ? e(narrative("The small size is a cheap way to use the draw: it risks little when called.", [], c.en), "小さいサイズはドローを安く使う方法で、コールされても失うものが小さくなります。")
        : shove ? e(narrative("The shove puts full pressure on the opponent and still has the outs when called.", [], c.en), "オールインは相手に最大の圧力をかけ、コールされてもアウツが残ります。")
        : e(narrative("The larger size folds out more of the range, which is exactly what the draw wants, and the outs carry it when called.", [], c.en), "大きいサイズはより多くのレンジを降ろせて、これがドローの狙いです。コールされてもアウツが支えます。"));
      out.push(outsLine(d, c));
      out.push(improveLine(d, c));
      out.push(blockerLine(d, c, narrative(", which leaves {0} fewer strong hands to call with", [o], c.en), "ので、相手が強い手でコールできる組み合わせが減ります"));
      break;
    }
    case "bluff": {
      out.push(e(narrative("{0} has {1} and no pair or real draw, so this {2} bet is a bluff that needs {3} to fold.", [d.name, d.has, small ? "small" : shove ? "all-in" : "large", o], c.en),
        `${d.name}は${d.has}でペアも有効なドローもなく、相手に降りてもらう必要がある${small ? "小さな" : shove ? "オールインの" : "大きな"}ブラフです。`));
      out.push(small ? e(narrative("The small size makes the bluff cheap: {0} needs few folds to pay off.", [d.tag], c.en), `小さいサイズならブラフが安く済み、${d.tag}でも必要なフォールドが少なくて済みます。`)
        : e(narrative("The larger size needs more folds, so {0} goes this big only when it has good blockers or backdoors.", [d.tag], c.en), `大きいサイズはより多くのフォールドが必要なので、${d.tag}は良いブロッカーやバックドアがあるときだけ選びます。`));
      // Why this particular hand was picked as a bluff (rather than a check or another combo).
      const why: [string, string][] = [];
      if (!d.f?.aceHighValue) why.push([narrative("it has almost no showdown value, so checking rarely wins and folding {0} out is its only way to win", [o], c.en), "チェックしてもショーダウンでほとんど勝てず、相手を降ろす以外に勝ち筋がない"]);
      if (d.blockers.length) why.push(c.en ? [narrative("{0}, so {1} has fewer strong hands to call with", [d.blockers[0], o], c.en), ""] : ["", `${d.blockers[0]}ため、相手がコールできる強い手が減る`]);
      if (d.unblock) why.push([narrative("it does not block the weak hands {0} would fold", [o], c.en), "相手が降りるはずの弱い手をブロックしていない"]);
      if (d.backdoor && !d.river && !d.has.includes(d.backdoor)) why.push([narrative("the {0} gives it a little equity when called", [d.backdoor], c.en), `${d.backdoor}があり、コールされても逆転の余地が残る`]);
      if (why.length) out.push(c.en
        ? narrative("Why this hand bluffs: {0}.", [why.map(([en]) => en).join("; ")], c.en)
        : `この手をブラフに選ぶ理由：${why.map(([, ja]) => ja).join("。また、")}。`);
      if (d.f?.aceHighValue) out.push(e(narrative("Its ace-high has some showdown value, so it bets this way only part of the time.", [], c.en), "エースハイにはショーダウンバリューがあるので、ブラフに回るのは一部の頻度です。"));
      break;
    }
    default: { // protection / thin value
      out.push(role.sub === "thinWithDraw"
        ? e(narrative("{0} has {1} and {2}, so it {3} for thin value and protection with extra equity behind it.", [d.name, d.made, d.draw || d.over, verb], c.en), `${d.name}は${d.made}に${d.draw || d.over}も加わり、エクイティの裏付けを持ってシンバリュー兼プロテクションで${verbJa}手です。`)
        : e(narrative("{0} has {1}: it is ahead of {2}, so it {3} for thin value, but it does not want a big pot.", [d.name, d.made, d.worse, verb], c.en), `${d.name}は${d.made}で${d.worse}には勝っているので、シンバリューで${verbJa}手ですが、大きなポットは望みません。`));
      out.push(d.river ? e(narrative("On the river the bet is simply for value, hoping the worse pairs and ace-high call {0}.", [d.tag], c.en), `リバーなので、劣るペアやエースハイが${d.tag}をコールすることを狙う純粋なバリューです。`)
        : e(narrative("Betting also denies equity to the overcards and draws that could outdraw {0}.", [d.tag], c.en), `${d.tag}に逆転しうるオーバーカードやドローのエクイティも奪います。`));
      out.push(small ? "" : e(narrative("A bigger bet risks being raised off by better hands, so {0} uses this size less often.", [d.tag], c.en), `大きく打つとより強い手にレイズされる危険があるため、${d.tag}はこのサイズを使う頻度が低めです。`));
    }
  }
  if (role.role !== "semi-bluff") out.splice(1, 0, d.standing);
  return out.filter(Boolean);
}

// Checking: pot control, slowplay, a free card or giving up, depending on what the hand has.
export function checkSentences(d: Desc, c: HC, betRole: string | null): string[] {
  const e = (x: string, j: string) => c.en ? x : j;
  const o = c.o, out: string[] = [];
  if (d.m === "nuts" || d.m === "strong") {
    out.push(d.river
      ? e(narrative("{0} has {1} and checks to induce: nothing is left to protect against on the river, so it lets {2} bluff or call with worse.", [d.name, d.made, o], c.en), `${d.name}は${d.made}で、リバーはもう守るべきドローがないので、チェックして相手のブラフや劣る手のコールを誘います。`)
      : d.vulnerable && d.boardDraws
      ? e(narrative("{0} has {1} and mixes in a check to keep the checking range strong, even though {2} get a free card.", [d.name, d.made, d.boardDraws], c.en), `${d.name}は${d.made}ですが、${d.boardDraws}に無料でカードを見せるリスクを受け入れて、チェックレンジを強く保つためにチェックも混ぜます。`)
      : e(narrative("{0} has {1} and slowplays: the board has few draws to protect against, so checking keeps {2}'s weaker hands in.", [d.name, d.made, o], c.en), `${d.name}は${d.made}で、守るべきドローが少ないのでスロープレイし、チェックで相手の弱い手を残します。`));
  } else if (d.m === "medium" || d.m === "weak") {
    out.push(e(narrative("{0} has {1}, a showdown-value hand: a bet would be called mostly by better and fold out the worse hands it beats, so it checks and lets {2} bluff.", [d.name, d.made, o], c.en),
      `${d.name}は${d.made}でショーダウンバリューのある手で、ベットすると劣る手が降りて優れた手だけが残りやすいので、チェックして相手のブラフを誘います。`));
    if (d.draw) out.push(e(narrative("The {0} adds equity if a bet from {1} comes.", [d.draw, o], c.en), `${d.draw}も持つので、相手がベットしてきても戦えます。`));
  } else if (d.dr !== "none") {
    out.push(e(narrative("{0} has {1}, so it takes the free card instead of building a pot it may not win.", [d.name, d.draw], c.en), `${d.name}は${d.draw}を持ち、勝てるか分からないポットを育てずにフリーカードを見に行きます。`));
    out.push(improveLine(d, c));
  } else if (d.f?.aceHighValue) {
    out.push(e(narrative("{0} has {1}, and its ace-high carries some showdown value, so it checks instead of bluffing.", [d.name, d.has], c.en), `${d.name}は${d.has}で、エースハイのショーダウンバリューがあるのでブラフせずチェックします。`));
  } else {
    out.push(e(narrative("{0} has {1} with no pair and no real draw, so it checks and gives up cheaply.", [d.name, d.has], c.en), `${d.name}は${d.has}でペアも有効なドローもなく、チェックして安くあきらめます。`));
    if (d.backdoor && !d.has.includes(d.backdoor)) out.push(e(narrative("The {0} keeps a sliver of equity.", [d.backdoor], c.en), `${d.backdoor}がわずかなエクイティを残します。`));
  }
  out.splice(1, 0, d.standing);
  if (betRole) {
    const rl = ({ value: e(narrative("for value", [], c.en), "バリューで"), "semi-bluff": e(narrative("as a semi-bluff", [], c.en), "セミブラフとして"), protection: e(narrative("for thin value and protection", [], c.en), "シンバリュー兼プロテクションで"),
      bluff: e(narrative("as a bluff", [], c.en), "ブラフとして") } as Record<string, string>)[betRole];
    if (rl) out.push(e(narrative("{0} also bets part of the time {1}, so the check does not give away what it holds.", [cap(d.tag), rl], c.en), `${d.tag}の手は一部の頻度で${rl}ベットもするので、チェックから手の中身は読まれません。`));
  }
  return out.filter(Boolean);
}

const priceLine = (d: Desc, c: HC): string => {
  const e = (x: string, j: string) => c.en ? x : j;
  const k = d.tag, lv = c.st?.level;
  if (!lv) return "";
  return lv === "comfortable" ? e(narrative("As {0}, its realised equity clears the price comfortably.", [k], c.en), `${k}として、実現エクイティは必要な水準を余裕で上回ります。`)
    : lv === "borderline" ? e(narrative("As {0}, it sits right at the indifference point, which is why calls and folds are mixed.", [k], c.en), `${k}として、ちょうど無差別の水準にあり、そのためコールとフォールドが混ざります。`)
    : e(narrative("As {0}, it is below the price on paper, so it continues at a low frequency only.", [k], c.en), `${k}として、数字上は必要な水準に届かず、低い頻度でしか続行しません。`);
};
const positionLine = (c: HC, d: Desc) => c.ip
  ? (c.en ? narrative("Being in position helps {0} realise its equity.", [d.tag], c.en) : `ポジションがあるので、${d.tag}でもエクイティを実現しやすくなります。`)
  : (c.en ? narrative("Out of position {0} realises less of its equity, so it needs some margin.", [d.tag], c.en) : `ポジションがないと${d.tag}はエクイティを実現しにくく、ある程度の余裕が必要です。`);

// Call / fold / raise when facing a bet or a raise.
export function facingHandSentences(d: Desc, action: string, role: Role, c: HC): string[] {
  const e = (x: string, j: string) => c.en ? x : j;
  const o = c.o, out: string[] = [];
  const mixEn = c.bettorMix === "strong" ? narrative(" in a value-heavy range", [], c.en) : c.bettorMix === "bluffy" ? narrative(" in a bluff-heavy range", [], c.en) : "";
  const mixJa = c.bettorMix === "strong" ? "（相手のレンジはバリュー寄り）" : c.bettorMix === "bluffy" ? "（相手のレンジはブラフが多め）" : "";
  if (action === "call") {
    if (d.m === "nuts" || d.m === "strong") {
      out.push(e(narrative("{0} has {1}, comfortably ahead of {2}'s bluffs and {3}, and calling keeps those hands betting into it.", [d.name, d.made, o, d.worse], c.en),
        `${d.name}は${d.made}で、相手のブラフや${d.worse}を大きく上回り、コールすればそれらの手がさらに打ち込んでくれます。`));
      if (d.vulnerable && d.boardDraws) out.push(e(narrative("The board has {0}, so it also raises sometimes to charge them.", [d.boardDraws], c.en), `ボードに${d.boardDraws}があるので、課金のためにレイズも混ぜます。`));
    } else if (d.dr === "combo" || d.dr === "strong") {
      out.push(e(narrative("{0} has {1}, so it calls with real equity and implied odds.", [d.name, d.draw], c.en), `${d.name}は${d.draw}を持ち、十分なエクイティとインプライドオッズでコールします。`));
      out.push(improveLine(d, c));
      if (nonNutFlush(d)) out.push(e(narrative("A flush that is not the nuts can still lose to a higher one, so its implied odds are discounted.", [], c.en), "ナッツではないフラッシュは上位のフラッシュに負けることがあり、インプライドオッズは割り引いて考えます。"));
    } else if (d.dr === "weak" && d.m !== "medium") {
      out.push(c.st?.level === "short"
        ? e(narrative("{0} has {1}{2}, a thin call that relies on implied odds when the card comes.", [d.name, d.draw, d.over ? narrative(" and {0}", [d.over], c.en) : ""], c.en), `${d.name}は${d.draw}${d.over ? `と${d.over}` : ""}を持ち、完成したときのインプライドオッズを頼りにした薄いコールです。`)
        : e(narrative("{0} has {1}{2}: the draw and the chance to pair up give it enough equity against a wide betting range to call.", [d.name, d.draw, d.over ? narrative(" and {0}", [d.over], c.en) : ""], c.en), `${d.name}は${d.draw}${d.over ? `と${d.over}` : ""}を持ち、ドローとペアになる可能性があるので、幅広いベットレンジに対してコールできるだけのエクイティがあります。`));
      out.push(improveLine(d, c));
    } else if (d.m === "medium" || d.m === "weak") {
      out.push(e(narrative("{0} has {1}: it beats {2}'s bluffs and the lower pairs but loses to the value{3}, so it is a bluff-catcher.", [d.name, d.made, o, mixEn], c.en),
        `${d.name}は${d.made}で、相手のブラフや下位のペアには勝ち、バリューには負けるブラフキャッチャーです${mixJa}。`));
      if (d.draw) out.push(e(narrative("The {0} adds some outs when it is behind.", [d.draw], c.en), `${d.draw}があり、負けているときにもアウツが残ります。`));
    } else {
      out.push(d.f?.aceHighValue
        ? e(narrative("{0} has {1}: no pair, but its ace-high still beats the pure bluffs, so it is a marginal bluff-catcher.", [d.name, d.has], c.en), `${d.name}は${d.has}でペアはありませんが、エースハイが純粋なブラフには勝つので境界線上のブラフキャッチャーです。`)
        : e(narrative("{0} has {1} and no pair, so it only beats the pure bluffs and calls as a marginal bluff-catcher.", [d.name, d.has], c.en), `${d.name}は${d.has}でペアがなく、純粋なブラフにしか勝てない境界線上のブラフキャッチャーとしてコールします。`));
    }
    out.splice(1, 0, d.standing);
    out.push(blockerLine(d, c, narrative(", which removes some of {0}'s strongest hands and improves the call", [o], c.en), "ので、相手の強い手を減らしコールの質が上がります"));
    out.push(priceLine(d, c));
    out.push(d.m === "nuts" || d.m === "strong" ? "" : positionLine(c, d));
    return out.filter(Boolean);
  }
  if (action === "fold") {
    if (d.m === "nuts" || d.m === "strong") {
      out.push(e(narrative("{0} has {1}, which is strong enough to continue, so folding is only a small slice of the mix, kept for the spots where the price is steepest.", [d.name, d.made], c.en),
        `${d.name}は${d.made}で続行できる強さがあり、フォールドは価格が最も高い場面に残す小さな割合にとどまります。`));
    } else if (d.m === "none" && d.dr === "none") {
      out.push(e(narrative("{0} has {1}, so no pair and no usable draw: it only wins if {2} is bluffing{3}.", [d.name, d.has, o, c.st?.bluffCapped || c.bettorMix === "strong" ? narrative(", and the line has few bluffs", [], c.en) : ""], c.en),
        `${d.name}は${d.has}でペアも使えるドローもなく、相手がブラフのときしか勝てません${c.st?.bluffCapped || c.bettorMix === "strong" ? "。このラインではブラフも少なめです" : ""}。`));
      if (d.f?.aceHighValue) out.push(e(narrative("The ace-high has some showdown value, but not enough to pay for it.", [], c.en), "エースハイにはショーダウンバリューがありますが、払うほどではありません。"));
    } else if (d.dr !== "none") {
      out.push(e(narrative("{0} has {1}{2}, but {3} for this price.", [d.name, d.draw, d.over ? narrative(" and {0}", [d.over], c.en) : "", d.outs === "few" || d.outs === "none" ? narrative("too few outs", [], c.en) : narrative("not quite enough equity", [], c.en)], c.en),
        `${d.name}は${d.draw}${d.over ? `と${d.over}` : ""}を持ちますが、この価格に対して${d.outs === "few" || d.outs === "none" ? "アウツが足りません" : "エクイティがわずかに足りません"}。`));
      if (nonNutFlush(d)) out.push(e(narrative("Even when it gets there, a flush that is not the nuts risks losing a big pot.", [], c.en), "完成しても、ナッツではないフラッシュは大きなポットを失うリスクがあります。"));
      else out.push(improveLine(d, c));
    } else {
      out.push(e(narrative("{0} has {1}: it loses to {2}'s value and has too few outs to draw to, so it folds.", [d.name, d.made, o], c.en), `${d.name}は${d.made}で、相手のバリューに負け、逆転できるアウツも少ないのでフォールドします。`));
      if (d.m === "medium") out.push(e(narrative("It is close to the threshold, which is why folding is only part of the mix.", [], c.en), "続行の水準に近いので、フォールドは混合の一部にとどまります。"));
    }
    out.splice(1, 0, d.standing);
    out.push(blockerLine(d, c, narrative(", so folding gives up less than it seems", [], c.en), "ので、降りても失うものは見た目より小さくなります"));
    out.push(c.st?.place === "bottom" ? e(narrative("{0} also sits at the bottom of the continuing range, the first part to go.", [cap(d.tag)], c.en), `${d.tag}は続行レンジの最下位なので、真っ先に降りる部分です。`) : "");
    return out.filter(Boolean);
  }
  // raise
  if (c.raiseAllIn) {
    if (role.role === "value") out.push(e(narrative("{0} has {1}, well ahead of the bettor's range, so it shoves and gets the stacks in against {2}.", [d.name, d.made, d.worse], c.en), `${d.name}は${d.made}で相手のレンジを大きく上回り、${d.worse}を相手にスタックを入れきるオールインです。`));
    else if (role.role === "semi-bluff") {
      out.push(e(narrative("{0} has {1}{2}, so the all-in is a semi-bluff: it wins when {3} folds and still has outs when called.", [d.name, d.draw || d.over, d.draw && d.over ? narrative(" plus {0}", [d.over], c.en) : "", o], c.en), `${d.name}は${d.draw || d.over}${d.draw && d.over ? `と${d.over}` : ""}を持ち、相手が降りれば勝ち、コールされてもアウツが残るセミブラフのオールインです。`));
      out.push(improveLine(d, c));
    } else if (role.role === "protection") out.push(e(narrative("{0} has {1}; the all-in is a minor option that turns a bluff-catcher into a bluff and folds out {2}'s worse pairs.", [d.name, d.made, o], c.en), `${d.name}は${d.made}で、オールインはブラフキャッチャーをブラフに変える小さな選択肢で、相手の劣るペアを降ろします。`));
    else {
      out.push(e(narrative("{0} has {1} and cannot call profitably, so it is a bluff all-in candidate that folds out hands that beat it.", [d.name, d.has], c.en), `${d.name}は${d.has}でコールでは採算が合わず、勝っている手を降ろすためのブラフのオールイン候補です。`));
      out.push(blockerLine(d, c, narrative(", exactly what a bluff all-in wants", [], c.en), "ので、ブラフのオールインに求められる条件を満たします") || (d.unblock ? cap(d.unblock) + (c.en ? "." : "。") : ""));
    }
    return out.filter(Boolean);
  }
  if (role.role === "value") {
    out.push(e(narrative("{0} has {1}, well ahead of the bettor's range, so raising gets paid by {2}.", [d.name, d.made, d.worse], c.en), `${d.name}は${d.made}で相手のレンジを大きく上回り、${d.worse}から払ってもらえるレイズです。`));
    out.push(d.vulnerable && d.boardDraws
      ? e(narrative("The board has {0}, so the raise also charges them.", [d.boardDraws], c.en), `ボードに${d.boardDraws}があるので、レイズでそれらに課金する意味もあります。`)
      : c.ip ? e(narrative("Raising over a bet builds the pot while the worse hands still have something to call with.", [], c.en), "ベットへのレイズは、劣る手がまだコールできるうちにポットを育てます。")
        : e(narrative("A check-raise builds the pot out of position, where value is otherwise hard to get.", [], c.en), "チェックレイズなら、ポジションがなくても取りにくいバリューを引き出せます。"));
  } else if (role.role === "semi-bluff") {
    out.push(e(narrative("{0} has {1}{2}, so raising is a semi-bluff: it wins when {3} folds.", [d.name, d.draw || d.over, d.draw && d.over ? narrative(" plus {0}", [d.over], c.en) : "", o], c.en), `${d.name}は${d.draw || d.over}${d.draw && d.over ? `と${d.over}` : ""}を持ち、相手が降りれば勝てるセミブラフのレイズです。`));
    out.push(outsLine(d, c, true));
    out.push(improveLine(d, c));
    out.push(blockerLine(d, c, narrative(", which leaves {0} fewer strong hands to continue with", [o], c.en), "ので、相手が強い手で続行しにくくなります"));
  } else if (role.role === "protection") {
    out.push(e(narrative("{0} has {1}; raising is a minor option that turns a bluff-catcher into a bluff and folds out {2}'s worse pairs.", [d.name, d.made, o], c.en), `${d.name}は${d.made}で、レイズはブラフキャッチャーをブラフに変える小さな選択肢で、相手の劣るペアを降ろします。`));
  } else {
    out.push(e(narrative("{0} has {1} and cannot call profitably, so it is a bluff-raise candidate that folds out hands that beat it.", [d.name, d.has], c.en), `${d.name}は${d.has}でコールでは採算が合わず、勝っている手を降ろすためのブラフレイズ候補です。`));
    out.push(blockerLine(d, c, narrative(", exactly what a bluff-raise wants", [], c.en), "ので、ブラフレイズに求められる条件を満たします") || (d.unblock ? cap(d.unblock) + (c.en ? "." : "。") : ""));
    if (d.backdoor && !d.has.includes(d.backdoor)) out.push(e(narrative("The {0} gives it some equity if called.", [d.backdoor], c.en), `${d.backdoor}があり、コールされても少しエクイティが残ります。`));
  }
  return out.filter(Boolean);
}

// One hand-led headline sentence.
export function handHeadline(d: Desc, main: string, role: Role, facing: boolean, c: HC): string {
  const e = (x: string, j: string) => c.en ? x : j;
  const rl = ({ value: e(narrative("for value", [], c.en), "バリューで"), "semi-bluff": e(narrative("as a semi-bluff", [], c.en), "セミブラフとして"), protection: e(narrative("for thin value and protection", [], c.en), "シンバリュー兼プロテクションで"),
    bluff: e(narrative("as a bluff", [], c.en), "ブラフとして"), "pot-control": e(narrative("to control the pot", [], c.en), "ポットコントロールで") } as Record<string, string>)[role.role];
  const betEn = main === "bet33" ? narrative("a small bet", [], c.en) : main === "bet75" ? narrative("a large bet", [], c.en) : narrative("an overbet", [], c.en);
  let plan: string;
  if (facing) {
    plan = main === "call" ? ((d.m === "nuts" || d.m === "strong") ? e(narrative("mostly calls for value", [], c.en), "主にバリューコール") : d.dr !== "none" ? e(narrative("mostly calls with its draw", [], c.en), "主にドローでコール") : e(narrative("mostly calls as a bluff-catcher", [], c.en), "主にブラフキャッチャーとしてコール"))
      : main === "fold" ? e(narrative("mostly folds", [], c.en), "基本はフォールド")
      : c.raiseAllIn ? e(narrative("mostly shoves {0}", [rl], c.en), `${rl}オールインが中心`) : e(narrative("mostly raises {0}", [rl], c.en), `${rl}レイズが中心`);
  } else if (main === "check") plan = e(narrative("mostly checks", [], c.en), "チェック中心");
  else if (main === "allin") plan = e(narrative("shoves {0}", [rl], c.en), `${rl}オールイン`);
  else plan = e(narrative("mostly makes {0} {1}", [betEn, rl], c.en), `${rl}${main === "bet33" ? "小さく" : main === "bet75" ? "大きく" : main === "bet125" ? "オーバーベットで" : ""}ベットが中心`);
  const holding = d.has;
  return e(narrative("{0} has {1}, and {2}.", [d.name, holding, plan], c.en), `${d.name}は${holding}を持ち、${plan}。`);
}
