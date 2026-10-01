// Hand-specific postflop copy (EN + JA, numberless): turns the computed hand features (hand-features.mjs) and the
// shared role decision (hand-role.mjs) into the reasons a hand has for each action. Everything here is about the
// hand itself: what it holds, what it wants from the action, which worse hands pay it off, which blockers it has.
// Range-level strategy sentences live in postflop-advanced.ts and are limited to one per explanation.
import { featureSignature, featuresFromText } from "../../scripts/postflop-ai/hand-features.mjs";
import { drawLevel, madeLevel, roleFromFeatures } from "../../scripts/postflop-ai/hand-role.mjs";

export type Level4 = "huge" | "many" | "some" | "few" | "none";
export type Desc = {
  f: any | null; name: string; en: boolean;
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

const join = (parts: string[], en: boolean) => parts.length < 2 ? (parts[0] ?? "")
  : en ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join("と");

export function describeHand(f: any | null, name: string, en: boolean, tier: string, o: string): Desc {
  const e = (a: string, j: string) => en ? a : j;
  if (!f) {
    // No concrete cards: describe the hand class only.
    const m = tier === "monster" ? "nuts" : tier === "strong" ? "strong" : tier === "medium" ? "medium" : "none";
    const dr = tier === "draw" ? "strong" : "none";
    const made = ({ monster: e("a very strong made hand", "とても強い完成役"), strong: e("a strong pair", "強いペア"), medium: e("a weak pair", "弱いペア") } as Record<string, string>)[tier] ?? "";
    const draw = tier === "draw" ? e("a draw", "ドロー") : "";
    const has = made || draw || e("no made hand", "役なし");
    return { f: null, name, en, m, dr, made, draw, over: "", backdoor: "", has, worse: e("weaker pairs and draws", "劣るペアやドロー"),
      outs: tier === "draw" ? "many" : "none", improve: "", blockers: [], unblock: "", vulnerable: false, boardDraws: "", river: false,
      aceHigh: false, air: tier === "air", short: made || draw || has, tag: made || draw || has, standing: "" };
  }
  const mk = f.made, d = f.draws, board = f.board;
  const R = (r: number) => en ? EN_WORD[r] : r === 8 ? "10" : RANK[r];
  const art = (word: string) => `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;
  const card = (r: number, suit: number) => `${r === 8 ? "10" : RANK[r]}${SUIT_SYMBOL[suit]}`;
  const m = madeLevel(f), dr = drawLevel(f);
  const river = f.street === "river";
  const holeRanks = f.hole.map((c: number) => c >> 2);
  const pocket = holeRanks[0] === holeRanks[1];

  // ---- made hand phrase
  let made = "";
  switch (mk.kind) {
    case "overpair": made = e(`an overpair (pocket ${enPlural(mk.pairRank)})`, `オーバーペア（${R(mk.pairRank)}${R(mk.pairRank)}）`); break;
    case "underpair": made = e(`an underpair (pocket ${enPlural(mk.pairRank)})`, `アンダーペア（${R(mk.pairRank)}${R(mk.pairRank)}）`); break;
    case "topPair": made = e(`top pair (${enPlural(mk.pairRank)}) with ${art(R(mk.kicker))} kicker`, `${R(mk.pairRank)}のトップペア（${R(mk.kicker)}キッカー）`); break;
    case "secondPair": made = e(`second pair (${enPlural(mk.pairRank)}) with ${art(R(mk.kicker))} kicker`, `${R(mk.pairRank)}のセカンドペア（${R(mk.kicker)}キッカー）`); break;
    case "bottomPair": made = e(`bottom pair (${enPlural(mk.pairRank)}) with ${art(R(mk.kicker))} kicker`, `${R(mk.pairRank)}のボトムペア（${R(mk.kicker)}キッカー）`); break;
    case "boardPair": made = e(`only the board's pair of ${enPlural(mk.pairRank)}`, `ボードの${R(mk.pairRank)}のペアだけ`); break;
    case "topTwo": made = e(`top two pair (${enPlural(mk.pairRanks[0])} and ${enPlural(mk.pairRanks[1])})`, `トップツーペア（${R(mk.pairRanks[0])}と${R(mk.pairRanks[1])}）`); break;
    case "topAndLower": made = e("two pair with the top pair", "トップペアを含むツーペア"); break;
    case "lowerTwo": made = e("the lower two pair", "下位のツーペア"); break;
    case "pocketPlusBoardPair": made = e(`two pair from a pocket pair and the board pair`, `ポケットペアとボードのペアによるツーペア`); break;
    case "boardPairPlusOne": made = e("two pair that leans on the board pair", "ボードのペアに頼ったツーペア"); break;
    case "boardTwoPair": made = e("only the two pair on the board", "ボードのツーペアだけ"); break;
    case "set": made = e(`a set of ${enPlural(mk.tripsRank)}`, `${R(mk.tripsRank)}${R(mk.tripsRank)}のセット`); break;
    case "trips": made = e(`trips (${enPlural(mk.tripsRank)}, with a pair on the board)`, `トリップス（${R(mk.tripsRank)}）`); break;
    case "boardTrips": made = e("only the trips on the board", "ボードのトリップスだけ"); break;
    case "straight": made = mk.nut ? e("the nut straight", "ナッツストレート") : e("a straight that is not the nuts", "ナッツではないストレート"); break;
    case "flush": made = mk.flushKind === "nut" ? e("the nut flush", "ナッツフラッシュ") : mk.flushKind === "secondNut" ? e("the second-nut flush", "2番手のフラッシュ") : e("a low flush", "下位のフラッシュ"); break;
    case "fullHouse": made = e("a full house", "フルハウス"); break;
    case "quads": made = e("quads", "フォーカード"); break;
    case "straightFlush": made = e("a straight flush", "ストレートフラッシュ"); break;
    default: made = "";
  }

  // ---- draws
  const drawParts: string[] = [];
  const outRanks: number[] = d.outRanks ?? [];
  const completes = outRanks.length ? e(` (${outRanks.map(r => art(R(r))).join(" or ")} completes it)`, `（${outRanks.map(r => R(r)).join("か")}で完成）`) : "";
  if (d.flush) {
    const k = d.flush.kind;
    const sym = SUIT_SYMBOL[d.flush.suit];
    drawParts.push(k === "nut" ? e(`the nut flush draw (${sym})`, `ナッツフラッシュドロー（${sym}）`)
      : k === "secondNut" ? e(`a flush draw that is not to the nuts (${sym})`, `ナッツではないフラッシュドロー（${sym}）`)
      : e(`a low flush draw (${sym})`, `ナッツから遠いフラッシュドロー（${sym}）`));
  }
  if (d.straight) {
    const t = d.straight;
    drawParts.push(t === "gutshot" ? e(`a gutshot${completes}`, `ガットショット${completes}`)
      : t === "openEnded" ? e(`an open-ended straight draw${completes}`, `オープンエンドのストレートドロー${completes}`)
      : e(`a double-gutter straight draw${completes}`, `ダブルガットのストレートドロー${completes}`));
  }
  const draw = d.combo ? e(`a combo draw of ${drawParts.join(" and ")}`, `${drawParts.join("と")}のコンボドロー`) : join(drawParts, en);
  const backdoorParts: string[] = [];
  if (d.backdoorFlush) backdoorParts.push(e(`a backdoor flush draw${d.backdoorFlush.nut ? " to the nuts" : ""}`, `バックドアフラッシュドロー${d.backdoorFlush.nut ? "（ナッツ）" : ""}`));
  if (d.backdoorStraight) backdoorParts.push(e("a backdoor straight draw", "バックドアストレートドロー"));
  const backdoor = join(backdoorParts, en);

  // ---- overcards
  const oc = f.overcards;
  const showOver = oc.count > 0 && !pocket && mk.category === "highCard";
  const over = !showOver ? "" : oc.count === 1 ? e(`an overcard (the ${R(oc.ranks[0])})`, `オーバーカードの${R(oc.ranks[0])}`)
    : e(`two overcards (the ${R(oc.ranks[0])} and the ${R(oc.ranks[1])})`, `${R(oc.ranks[0])}と${R(oc.ranks[1])}のオーバーカード`);

  const aceHigh = f.aceHigh;
  const hiRank = Math.max(...holeRanks), loRank = Math.min(...holeRanks);
  const highPhrase = mk.category === "highCard" && !pocket ? e(`${R(hiRank)}-high with ${art(R(loRank))}`, `${R(hiRank)}ハイ（${R(loRank)}）`) : "";
  const hasParts = [made && mk.category !== "highCard" ? made : "", draw, over].filter(Boolean);
  const isAir = m === "none" && dr === "none";
  if (isAir) {
    hasParts.length = 0;
    hasParts.push(highPhrase || e("only the board's cards", "ボードのカードだけ"));
    if (backdoor) hasParts.push(backdoor);
  } else if (!hasParts.length && backdoor) hasParts.push(backdoor);
  const has = isAir ? e(`only ${join(hasParts, en)}`, `${join(hasParts, en)}だけ`) : join(hasParts, en);

  // ---- worse hands that keep paying a value hand
  const w = (a: string, b: string, c: string, d2: string) => e(river ? a : b, river ? c : d2);
  let worse = "";
  switch (mk.kind) {
    case "quads": case "fullHouse": case "straightFlush": worse = e("lower full houses, flushes and sets", "劣るフルハウスやフラッシュ、セット"); break;
    case "flush": worse = e("lower flushes, straights and sets", "劣るフラッシュやストレート、セット"); break;
    case "straight": worse = e("sets, two pair and weaker straights", "セットやツーペア、劣るストレート"); break;
    case "set": worse = w("overpairs and top pair", "overpairs, top pair and draws", "オーバーペアやトップペア", "オーバーペアやトップペア、ドロー"); break;
    case "trips": worse = w("top pair with a worse kicker", "top pair with a worse kicker and draws", "キッカーの劣るトップペア", "キッカーの劣るトップペアやドロー"); break;
    case "boardPairPlusOne":
      // Higher cards that hit the board make a better two pair with the board pair, so "top pair" is not below us here.
      worse = mk.hasLowerBoardCard
        ? w("weaker two pair and hands with only the board pair", "weaker two pair and strong draws", "劣るツーペアやボードのペアだけの手", "劣るツーペアや強いドロー")
        : w("hands with only the board pair", "hands with only the board pair and draws", "ボードのペアだけの手", "ボードのペアだけの手やドロー"); break;
    case "topTwo": case "topAndLower": case "lowerTwo": case "pocketPlusBoardPair":
      worse = w("one-pair hands and weaker two pair", "top pair and strong draws", "ワンペアや劣るツーペア", "トップペアや強いドロー"); break;
    case "overpair": worse = w("top pair and underpairs", "top pair, underpairs and draws", "トップペアやアンダーペア", "トップペア、アンダーペア、ドロー"); break;
    case "topPair": worse = mk.kickerStrength === "strong"
      ? w("top pair with a worse kicker and second pair", "top pair with a worse kicker, second pair and draws", "キッカーの劣るトップペアやセカンドペア", "キッカーの劣るトップペア、セカンドペア、ドロー")
      : w("second pair and lower pairs", "second pair, lower pairs and draws", "セカンドペアや下位のペア", "セカンドペアや下位のペア、ドロー"); break;
    case "secondPair": case "bottomPair": case "underpair": worse = w("lower pairs and ace-high", "lower pairs, ace-high and weak draws", "下位のペアやエースハイ", "下位のペアやエースハイ、弱いドロー"); break;
    default: worse = w("weaker pairs and ace-high", "weaker pairs and draws", "劣るペアやエースハイ", "劣るペアやドロー");
  }

  // ---- outs and how the hand improves
  const outsN = d.outs ?? 0;
  const outs: Level4 = outsN >= 12 ? "huge" : outsN >= 8 ? "many" : outsN >= 4 ? "some" : outsN > 0 ? "few" : "none";
  const impr: string[] = [];
  if (d.straight && outRanks.length) impr.push(e(`${outRanks.map(r => art(R(r))).join(" or ")} makes the straight`, `${outRanks.map(r => R(r)).join("か")}でストレート`));
  if (d.flush) impr.push(d.flush.kind === "nut" ? e(`any ${SUIT_SYMBOL[d.flush.suit]} makes the nut flush`, `${SUIT_SYMBOL[d.flush.suit]}でナッツフラッシュ`)
    : e(`any ${SUIT_SYMBOL[d.flush.suit]} makes a flush, though not the nuts`, `${SUIT_SYMBOL[d.flush.suit]}でフラッシュ（ナッツではない）`));
  if (showOver && mk.category === "highCard") impr.push(oc.count === 1 ? e(`pairing the ${R(oc.ranks[0])} gives top pair`, `${R(oc.ranks[0])}を引けばトップペア`) : e("pairing an overcard gives top pair", "オーバーカードを引けばトップペア"));

  // ---- blockers
  const bl = f.blockers, blockers: string[] = [];
  if (bl.nutFlush) blockers.push(e(`the ${card(bl.nutFlush.rank, bl.nutFlush.suit)} blocks the nut flush`, `${card(bl.nutFlush.rank, bl.nutFlush.suit)}を持ってナッツフラッシュをブロックしている`));
  else if (bl.secondNutFlush) blockers.push(e(`the ${card(bl.secondNutFlush.rank, bl.secondNutFlush.suit)} blocks the second-nut flush`, `${card(bl.secondNutFlush.rank, bl.secondNutFlush.suit)}で2番手のフラッシュをブロックしている`));
  if (bl.nutStraight) blockers.push(e("it holds a card that blocks the nut straight", "ナッツストレートに必要なカードを持っている"));
  if (oc.ranks.includes(12) && board[0] !== undefined && !pocket && mk.category === "highCard") blockers.push(e("the ace removes the top-pair-top-kicker and overpair combos", "Aを持つため、トップペア・トップキッカーやオーバーペアのコンボが減っている"));
  const unblock = !bl.sets && !(oc.count > 0) ? e(`neither the ${R(hiRank)} nor the ${R(loRank)} matches the board, so it leaves the weak pairs ${o} would fold in the range`, `${R(hiRank)}も${R(loRank)}もボードのランクと重ならないので、相手が降りるはずの弱いペアを減らしません`) : "";

  const flushy = f.boardInfo.flushy, connected = f.boardInfo.connected;
  const boardDraws = flushy && connected ? e("flush and straight draws", "フラッシュドローやストレートドロー") : flushy ? e("flush draws", "フラッシュドロー") : connected ? e("straight draws", "ストレートドロー") : "";

  const kindTag: Record<string, [string, string]> = { overpair: ["an overpair", "オーバーペア"], underpair: ["an underpair", "アンダーペア"],
    topPair: ["top pair", "トップペア"], secondPair: ["second pair", "セカンドペア"], bottomPair: ["bottom pair", "ボトムペア"],
    topTwo: ["two pair", "ツーペア"], topAndLower: ["two pair", "ツーペア"], lowerTwo: ["two pair", "ツーペア"], pocketPlusBoardPair: ["two pair", "ツーペア"],
    boardPairPlusOne: ["two pair", "ツーペア"], set: ["a set", "セット"], trips: ["trips", "トリップス"], straight: ["a straight", "ストレート"],
    flush: ["a flush", "フラッシュ"], fullHouse: ["a full house", "フルハウス"], quads: ["quads", "フォーカード"], straightFlush: ["a straight flush", "ストレートフラッシュ"] };
  const drawTag: Record<string, [string, string]> = { gutshot: ["a gutshot", "ガットショット"], openEnded: ["an open-ended draw", "オープンエンド"], doubleGutter: ["a double-gutter draw", "ダブルガット"] };
  const pr = mk.pairRank;
  const kk = mk.kicker !== undefined ? mk.kicker : -1;
  const pairTag = (en0: string, ja0: string): [string, string] => [`${en0} (${enPlural(pr)} with ${art(R(kk))} kicker)`, `${R(pr)}の${ja0}（${R(kk)}キッカー）`];
  const tagPair: [string, string] = m !== "none" && ["topPair", "secondPair", "bottomPair"].includes(mk.kind)
    ? pairTag(kindTag[mk.kind][0], kindTag[mk.kind][1])
    : m !== "none" && mk.kind === "overpair" ? [`an overpair (${enPlural(pr)})`, `${R(pr)}のオーバーペア`]
    : m !== "none" && mk.kind === "underpair" ? [`an underpair (${enPlural(pr)})`, `${R(pr)}のアンダーペア`]
    : m !== "none" && mk.pairRanks && kindTag[mk.kind] ? [`two pair (${enPlural(mk.pairRanks[0])} and ${enPlural(mk.pairRanks[1])})`, `${R(mk.pairRanks[0])}と${R(mk.pairRanks[1])}のツーペア`]
    : m !== "none" && mk.kind === "set" ? [`a set of ${enPlural(mk.tripsRank)}`, `${R(mk.tripsRank)}のセット`]
    : m !== "none" && kindTag[mk.kind] ? kindTag[mk.kind]
    : d.combo ? ["a combo draw", "コンボドロー"]
    : d.flush ? (d.flush.kind === "nut" ? ["the nut flush draw", "ナッツフラッシュドロー"] : ["a flush draw", "フラッシュドロー"])
    : d.straight ? drawTag[d.straight]
    : [highPhrase || e("the board's cards", "ボードのカード"), highPhrase || "ボードのカード"];
  const tag = en ? tagPair[0] : tagPair[1];
  const pctl = mk.percentile ?? 0;
  const level = pctl >= 0.9 ? 0 : pctl >= 0.65 ? 1 : pctl >= 0.4 ? 2 : 3;
  const boardRanksAll = [...new Set<number>(board.map((cd: number) => cd >> 2))];
  const above = boardRanksAll.filter(r => r > (mk.pairRank ?? hiRank)).length;
  const NUM = en ? ["no", "one", "two", "three", "four"] : ["", "一枚", "二枚", "三枚", "四枚"];
  const showAbove = mk.category === "pair" && mk.kind !== "overpair" && above > 0;
  const standing = m === "none" ? "" : en
    ? `${cap0(tag)} is ${["ahead of nearly every holding", "ahead of most holdings", "around the middle of all holdings", "behind most holdings"][level]}`
      + `${!river && boardDraws ? `, though the ${boardDraws} on this board can still overtake it` : showAbove ? `, with ${NUM[Math.min(above, 4)]} board ${above === 1 ? "card" : "cards"} above the pair` : ""}.`
    : `${tag}は${["ほぼ全てのハンドに勝っています", "大半のハンドに勝っています", "全ハンドの中位あたりの強さです", "大半のハンドに負けています"][level]}。`
      + `${!river && boardDraws ? `ただしこのボードの${boardDraws}に${tag}は逆転される余地があります。` : showAbove ? `${tag}より上のランクのボードカードが${NUM[Math.min(above, 4)]}あります。` : ""}`;
  return { f, name, en, m, dr, made, draw, over, backdoor, has, worse, outs, improve: en ? join(impr, en) : impr.join("、"), blockers, unblock,
    vulnerable: Boolean(mk.vulnerable), boardDraws, river, aceHigh, air: m === "none" && dr === "none",
    short: (mk.category !== "highCard" && made) || draw || has, tag, standing };
}

// Features for the explanation inputs: an exact combo, or the most common combo class of an averaged hand.
export function featuresForInput(board?: string, cards?: string, combos?: { cards: string; weight: number }[]): any | null {
  if (!board || !/^([2-9TJQKA][cdhs]){3,5}$/.test(board)) return null;
  try {
    if (cards && /^([2-9TJQKA][cdhs]){2}$/.test(cards)) return featuresFromText(cards, board);
    if (!combos?.length) return null;
    const bySig = new Map<string, { w: number; f: any }>();
    for (const c of combos) {
      if (!(c.weight > 0) || !/^([2-9TJQKA][cdhs]){2}$/.test(c.cards)) continue;
      let f: any;
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
  en: boolean; o: string; street: "flop" | "turn" | "river"; ip: boolean;
  st: { level: "comfortable" | "borderline" | "short"; place: string | null; blocker: string | null; mix: string | null; bluffCapped: boolean } | null;
  bettorMix: string | null;
};
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
type Role = { role: string; sub: string };

function outsLine(d: Desc, c: HC, raise = false): string {
  const e = (a: string, j: string) => c.en ? a : j;
  switch (d.outs) {
    case "huge": return e("When called it still has a huge number of outs, so it is happy to get the money in.", "コールされても非常に多くのアウツが残り、お金が入っても歓迎できます。");
    case "many": return e("When called it still has plenty of outs to improve.", "コールされても改善できるアウツが十分に残ります。");
    case "some": return e("When called it still has a few clean outs.", "コールされてもクリーンなアウツがいくつか残ります。");
    default: return raise
      ? e(`With few outs it relies mostly on ${c.o} folding, and gives up if re-raised.`, "アウツが少ないので主に相手のフォールド頼みで、再レイズされれば降ります。")
      : e(`With few outs it relies mostly on ${c.o} folding.`, "アウツが少ないので主に相手のフォールド頼みです。");
  }
}
const improveLine = (d: Desc, c: HC) => d.improve ? (c.en ? `${cap(d.improve)}.` : `${d.improve}。`) : "";
const blockerLine = (d: Desc, c: HC, why: string, whyJa: string) => d.blockers.length
  ? (c.en ? `${cap(d.blockers[0])}${why}.` : `${d.blockers[0]}${whyJa}。`) : "";
const nonNutFlush = (d: Desc) => d.f?.draws.flush && d.f.draws.flush.kind !== "nut";

// Betting actions (bet sizes and all-in) for a hand: lead with what the hand has, why this role and why this size.
export function betSentences(d: Desc, a: string, role: Role, c: HC): string[] {
  const e = (x: string, j: string) => c.en ? x : j;
  const o = c.o, out: string[] = [];
  const mk = d.f?.made;
  const verb = a === "bet33" ? e("bets small", "小さく打ち") : a === "bet75" ? e("bets big", "大きく打ち") : a === "bet125" ? e("overbets", "オーバーベットし") : e("shoves", "オールインし");
  const verbJa = a === "bet33" ? "小さく打つ" : a === "bet75" ? "大きく打つ" : a === "bet125" ? "オーバーベットする" : "オールインする";
  const small = a === "bet33", shove = a === "allin", over = a === "bet125";
  switch (role.role) {
    case "value": {
      out.push(role.sub === "nuts"
        ? e(`${d.name} has ${d.made}, close to the best hand this board allows, so it ${verb} to build the pot and gets paid by ${d.worse}.`,
          `${d.name}は${d.made}でこのボードで最強に近く、${verbJa}ことでポットを育て、${d.worse}から払ってもらえます。`)
        : e(`${d.name} has ${d.made}, ahead of ${d.worse}, so it ${verb} for value.`, `${d.name}は${d.made}で${d.worse}より強いので、バリューで${verbJa}手です。`));
      out.push(small ? e(`The small size keeps ${d.worse} calling instead of folding.`, `小さいサイズなら、${d.worse}がフォールドせずコールを続けやすくなります。`)
        : shove ? e("At this stack depth the shove just puts the stacks in while it is far ahead.", "このスタックの深さでは、大きくリードしているうちにスタックを入れきるだけです。")
        : over ? e("Only the very top of the range can afford an overbet, and this hand is part of it.", "オーバーベットを打てるのはレンジの最上位だけで、この手はそこに入っています。")
        : d.river ? e(`The larger size makes ${d.worse} pay the most.`, `大きいサイズなら、${d.worse}から最も多く取れます。`)
        : e(`The larger size makes ${d.worse} pay the most for their draws and pairs.`, `大きいサイズなら、${d.worse}から最も多く取れます。`));
      if (role.sub === "protect" && d.boardDraws) out.push(e(`The board offers ${d.boardDraws}, so betting also charges them instead of giving a free card.`,
        `ボードに${d.boardDraws}があるので、ベットは無料でカードを見せずにそれらへ課金する役目も果たします。`));
      else if (mk?.kind === "topPair") out.push(mk.kickerStrength === "strong"
        ? e("The kicker keeps it ahead of the other top-pair combos.", "キッカーが強く、他のトップペアのコンボにも勝っています。")
        : e("The kicker is only fair, so it is not eager to face a raise.", "キッカーはそこそこなので、レイズされるのは歓迎しません。"));
      else if (mk?.kind === "overpair") out.push(e("It beats every pair on the board and loses only to sets and better.", "ボード上のどのペアにも勝ち、負けるのはセット以上だけです。"));
      else if (mk?.kind === "set" || mk?.kind === "trips") out.push(e("A hand this strong is hard to put on, so the opponent keeps paying with top pair and draws.", "この強さは読まれにくく、相手はトップペアやドローで払い続けやすくなります。"));
      else if (mk && ["straight", "flush", "fullHouse", "quads", "straightFlush"].includes(mk.kind)) out.push(e("It beats nearly everything the opponent can continue with, so the goal is to get as much as possible in.", "相手が続行できるほぼ全ての手に勝つので、できるだけ多く取ることが目的です。"));
      break;
    }
    case "semi-bluff": {
      const target = d.draw || d.over || d.has;
      out.push(e(`${d.name} holds ${target}${d.draw && d.over ? ` plus ${d.over}` : ""}, so it ${verb} as a semi-bluff that wins at once when ${o} folds.`,
        `${d.name}は${target}${d.draw && d.over ? `と${d.over}` : ""}を持ち、相手が降りれば即座に勝てるセミブラフとして${verbJa}手です。`));
      out.push(small ? e("The small size is a cheap way to use the draw: it risks little when called.", "小さいサイズはドローを安く使う方法で、コールされても失うものが小さくなります。")
        : shove ? e("The shove puts full pressure on the opponent and still has the outs when called.", "オールインは相手に最大の圧力をかけ、コールされてもアウツが残ります。")
        : e("The larger size folds out more of the range, which is exactly what the draw wants, and the outs carry it when called.", "大きいサイズはより多くのレンジを降ろせて、これがドローの狙いです。コールされてもアウツが支えます。"));
      out.push(outsLine(d, c));
      out.push(improveLine(d, c));
      out.push(blockerLine(d, c, `, which leaves ${o} fewer strong hands to call with`, "ので、相手が強い手でコールできる組み合わせが減ります"));
      break;
    }
    case "bluff": {
      out.push(e(`${d.name} has ${d.has} and no pair or real draw, so this ${small ? "small" : shove ? "all-in" : "large"} bet is a bluff that needs ${o} to fold.`,
        `${d.name}は${d.has}でペアも有効なドローもなく、相手に降りてもらう必要がある${small ? "小さな" : shove ? "オールインの" : "大きな"}ブラフです。`));
      out.push(small ? e(`The small size makes the bluff cheap: ${d.tag} needs few folds to pay off.`, `小さいサイズならブラフが安く済み、${d.tag}でも必要なフォールドが少なくて済みます。`)
        : e(`The larger size needs more folds, so ${d.tag} goes this big only when it has good blockers or backdoors.`, `大きいサイズはより多くのフォールドが必要なので、${d.tag}は良いブロッカーやバックドアがあるときだけ選びます。`));
      // Why this particular hand was picked as a bluff (rather than a check or another combo).
      const why: [string, string][] = [];
      if (!d.f?.aceHighValue) why.push([`it has almost no showdown value, so checking rarely wins and folding ${o} out is its only way to win`, "チェックしてもショーダウンでほとんど勝てず、相手を降ろす以外に勝ち筋がない"]);
      if (d.blockers.length) why.push(c.en ? [`${d.blockers[0]}, so ${o} has fewer strong hands to call with`, ""] : ["", `${d.blockers[0]}ため、相手がコールできる強い手が減る`]);
      if (d.unblock) why.push([`it does not block the weak hands ${o} would fold`, "相手が降りるはずの弱い手をブロックしていない"]);
      if (d.backdoor && !d.river && !d.has.includes(d.backdoor)) why.push([`the ${d.backdoor} gives it a little equity when called`, `${d.backdoor}があり、コールされても逆転の余地が残る`]);
      if (why.length) out.push(c.en
        ? `Why this hand bluffs: ${why.map(([en]) => en).join("; ")}.`
        : `この手をブラフに選ぶ理由：${why.map(([, ja]) => ja).join("。また、")}。`);
      if (d.f?.aceHighValue) out.push(e("Its ace-high has some showdown value, so it bets this way only part of the time.", "エースハイにはショーダウンバリューがあるので、ブラフに回るのは一部の頻度です。"));
      break;
    }
    default: { // protection / thin value
      out.push(role.sub === "thinWithDraw"
        ? e(`${d.name} has ${d.made} and ${d.draw || d.over}, so it ${verb} for thin value and protection with extra equity behind it.`, `${d.name}は${d.made}に${d.draw || d.over}も加わり、エクイティの裏付けを持ってシンバリュー兼プロテクションで${verbJa}手です。`)
        : e(`${d.name} has ${d.made}: it is ahead of ${d.worse}, so it ${verb} for thin value, but it does not want a big pot.`, `${d.name}は${d.made}で${d.worse}には勝っているので、シンバリューで${verbJa}手ですが、大きなポットは望みません。`));
      out.push(d.river ? e(`On the river the bet is simply for value, hoping the worse pairs and ace-high call ${d.tag}.`, `リバーなので、劣るペアやエースハイが${d.tag}をコールすることを狙う純粋なバリューです。`)
        : e(`Betting also denies equity to the overcards and draws that could outdraw ${d.tag}.`, `${d.tag}に逆転しうるオーバーカードやドローのエクイティも奪います。`));
      out.push(small ? "" : e(`A bigger bet risks being raised off by better hands, so ${d.tag} uses this size less often.`, `大きく打つとより強い手にレイズされる危険があるため、${d.tag}はこのサイズを使う頻度が低めです。`));
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
      ? e(`${d.name} has ${d.made} and checks to induce: nothing is left to protect against on the river, so it lets ${o} bluff or call with worse.`, `${d.name}は${d.made}で、リバーはもう守るべきドローがないので、チェックして相手のブラフや劣る手のコールを誘います。`)
      : d.vulnerable && d.boardDraws
      ? e(`${d.name} has ${d.made} and mixes in a check to keep the checking range strong, even though ${d.boardDraws} get a free card.`, `${d.name}は${d.made}ですが、${d.boardDraws}に無料でカードを見せるリスクを受け入れて、チェックレンジを強く保つためにチェックも混ぜます。`)
      : e(`${d.name} has ${d.made} and slowplays: the board has few draws to protect against, so checking keeps ${o}'s weaker hands in.`, `${d.name}は${d.made}で、守るべきドローが少ないのでスロープレイし、チェックで相手の弱い手を残します。`));
  } else if (d.m === "medium" || d.m === "weak") {
    out.push(e(`${d.name} has ${d.made}, a showdown-value hand: a bet would be called mostly by better and fold out the worse hands it beats, so it checks and lets ${o} bluff.`,
      `${d.name}は${d.made}でショーダウンバリューのある手で、ベットすると劣る手が降りて優れた手だけが残りやすいので、チェックして相手のブラフを誘います。`));
    if (d.draw) out.push(e(`The ${d.draw} adds equity if a bet from ${o} comes.`, `${d.draw}も持つので、相手がベットしてきても戦えます。`));
  } else if (d.dr !== "none") {
    out.push(e(`${d.name} has ${d.draw}, so it takes the free card instead of building a pot it may not win.`, `${d.name}は${d.draw}を持ち、勝てるか分からないポットを育てずにフリーカードを見に行きます。`));
    out.push(improveLine(d, c));
  } else if (d.f?.aceHighValue) {
    out.push(e(`${d.name} has ${d.has}, and its ace-high carries some showdown value, so it checks instead of bluffing.`, `${d.name}は${d.has}で、エースハイのショーダウンバリューがあるのでブラフせずチェックします。`));
  } else {
    out.push(e(`${d.name} has ${d.has} with no pair and no real draw, so it checks and gives up cheaply.`, `${d.name}は${d.has}でペアも有効なドローもなく、チェックして安くあきらめます。`));
    if (d.backdoor && !d.has.includes(d.backdoor)) out.push(e(`The ${d.backdoor} keeps a sliver of equity.`, `${d.backdoor}がわずかなエクイティを残します。`));
  }
  out.splice(1, 0, d.standing);
  if (betRole) {
    const rl = ({ value: e("for value", "バリューで"), "semi-bluff": e("as a semi-bluff", "セミブラフとして"), protection: e("for thin value and protection", "シンバリュー兼プロテクションで"),
      bluff: e("as a bluff", "ブラフとして") } as Record<string, string>)[betRole];
    if (rl) out.push(e(`${cap(d.tag)} also bets part of the time ${rl}, so the check does not give away what it holds.`, `${d.tag}の手は一部の頻度で${rl}ベットもするので、チェックから手の中身は読まれません。`));
  }
  return out.filter(Boolean);
}

const priceLine = (d: Desc, c: HC): string => {
  const e = (x: string, j: string) => c.en ? x : j;
  const k = d.tag, lv = c.st?.level;
  if (!lv) return "";
  return lv === "comfortable" ? e(`As ${k}, its realised equity clears the price comfortably.`, `${k}として、実現エクイティは必要な水準を余裕で上回ります。`)
    : lv === "borderline" ? e(`As ${k}, it sits right at the indifference point, which is why calls and folds are mixed.`, `${k}として、ちょうど無差別の水準にあり、そのためコールとフォールドが混ざります。`)
    : e(`As ${k}, it is below the price on paper, so it continues at a low frequency only.`, `${k}として、数字上は必要な水準に届かず、低い頻度でしか続行しません。`);
};
const positionLine = (c: HC, d: Desc) => c.ip
  ? (c.en ? `Being in position helps ${d.tag} realise its equity.` : `ポジションがあるので、${d.tag}でもエクイティを実現しやすくなります。`)
  : (c.en ? `Out of position ${d.tag} realises less of its equity, so it needs some margin.` : `ポジションがないと${d.tag}はエクイティを実現しにくく、ある程度の余裕が必要です。`);

// Call / fold / raise when facing a bet or a raise.
export function facingHandSentences(d: Desc, action: string, role: Role, c: HC): string[] {
  const e = (x: string, j: string) => c.en ? x : j;
  const o = c.o, out: string[] = [];
  const mixEn = c.bettorMix === "strong" ? " in a value-heavy range" : c.bettorMix === "bluffy" ? " in a bluff-heavy range" : "";
  const mixJa = c.bettorMix === "strong" ? "（相手のレンジはバリュー寄り）" : c.bettorMix === "bluffy" ? "（相手のレンジはブラフが多め）" : "";
  if (action === "call") {
    if (d.m === "nuts" || d.m === "strong") {
      out.push(e(`${d.name} has ${d.made}, comfortably ahead of ${o}'s bluffs and ${d.worse}, and calling keeps those hands betting into it.`,
        `${d.name}は${d.made}で、相手のブラフや${d.worse}を大きく上回り、コールすればそれらの手がさらに打ち込んでくれます。`));
      if (d.vulnerable && d.boardDraws) out.push(e(`The board has ${d.boardDraws}, so it also raises sometimes to charge them.`, `ボードに${d.boardDraws}があるので、課金のためにレイズも混ぜます。`));
    } else if (d.dr === "combo" || d.dr === "strong") {
      out.push(e(`${d.name} has ${d.draw}, so it calls with real equity and implied odds.`, `${d.name}は${d.draw}を持ち、十分なエクイティとインプライドオッズでコールします。`));
      out.push(improveLine(d, c));
      if (nonNutFlush(d)) out.push(e("A flush that is not the nuts can still lose to a higher one, so its implied odds are discounted.", "ナッツではないフラッシュは上位のフラッシュに負けることがあり、インプライドオッズは割り引いて考えます。"));
    } else if (d.dr === "weak" && d.m !== "medium") {
      out.push(c.st?.level === "short"
        ? e(`${d.name} has ${d.draw}${d.over ? ` and ${d.over}` : ""}, a thin call that relies on implied odds when the card comes.`, `${d.name}は${d.draw}${d.over ? `と${d.over}` : ""}を持ち、完成したときのインプライドオッズを頼りにした薄いコールです。`)
        : e(`${d.name} has ${d.draw}${d.over ? ` and ${d.over}` : ""}: the draw and the chance to pair up give it enough equity against a wide betting range to call.`, `${d.name}は${d.draw}${d.over ? `と${d.over}` : ""}を持ち、ドローとペアになる可能性があるので、幅広いベットレンジに対してコールできるだけのエクイティがあります。`));
      out.push(improveLine(d, c));
    } else if (d.m === "medium" || d.m === "weak") {
      out.push(e(`${d.name} has ${d.made}: it beats ${o}'s bluffs and the lower pairs but loses to the value${mixEn}, so it is a bluff-catcher.`,
        `${d.name}は${d.made}で、相手のブラフや下位のペアには勝ち、バリューには負けるブラフキャッチャーです${mixJa}。`));
      if (d.draw) out.push(e(`The ${d.draw} adds some outs when it is behind.`, `${d.draw}があり、負けているときにもアウツが残ります。`));
    } else {
      out.push(d.f?.aceHighValue
        ? e(`${d.name} has ${d.has}: no pair, but its ace-high still beats the pure bluffs, so it is a marginal bluff-catcher.`, `${d.name}は${d.has}でペアはありませんが、エースハイが純粋なブラフには勝つので境界線上のブラフキャッチャーです。`)
        : e(`${d.name} has ${d.has} and no pair, so it only beats the pure bluffs and calls as a marginal bluff-catcher.`, `${d.name}は${d.has}でペアがなく、純粋なブラフにしか勝てない境界線上のブラフキャッチャーとしてコールします。`));
    }
    out.splice(1, 0, d.standing);
    out.push(blockerLine(d, c, `, which removes some of ${o}'s strongest hands and improves the call`, "ので、相手の強い手を減らしコールの質が上がります"));
    out.push(priceLine(d, c));
    out.push(d.m === "nuts" || d.m === "strong" ? "" : positionLine(c, d));
    return out.filter(Boolean);
  }
  if (action === "fold") {
    if (d.m === "nuts" || d.m === "strong") {
      out.push(e(`${d.name} has ${d.made}, which is strong enough to continue, so folding is only a small slice of the mix, kept for the spots where the price is steepest.`,
        `${d.name}は${d.made}で続行できる強さがあり、フォールドは価格が最も高い場面に残す小さな割合にとどまります。`));
    } else if (d.m === "none" && d.dr === "none") {
      out.push(e(`${d.name} has ${d.has}, so no pair and no usable draw: it only wins if ${o} is bluffing${c.st?.bluffCapped || c.bettorMix === "strong" ? ", and the line has few bluffs" : ""}.`,
        `${d.name}は${d.has}でペアも使えるドローもなく、相手がブラフのときしか勝てません${c.st?.bluffCapped || c.bettorMix === "strong" ? "。このラインではブラフも少なめです" : ""}。`));
      if (d.f?.aceHighValue) out.push(e("The ace-high has some showdown value, but not enough to pay for it.", "エースハイにはショーダウンバリューがありますが、払うほどではありません。"));
    } else if (d.dr !== "none") {
      out.push(e(`${d.name} has ${d.draw}${d.over ? ` and ${d.over}` : ""}, but ${d.outs === "few" || d.outs === "none" ? "too few outs" : "not quite enough equity"} for this price.`,
        `${d.name}は${d.draw}${d.over ? `と${d.over}` : ""}を持ちますが、この価格に対して${d.outs === "few" || d.outs === "none" ? "アウツが足りません" : "エクイティがわずかに足りません"}。`));
      if (nonNutFlush(d)) out.push(e("Even when it gets there, a flush that is not the nuts risks losing a big pot.", "完成しても、ナッツではないフラッシュは大きなポットを失うリスクがあります。"));
      else out.push(improveLine(d, c));
    } else {
      out.push(e(`${d.name} has ${d.made}: it loses to ${o}'s value and has too few outs to draw to, so it folds.`, `${d.name}は${d.made}で、相手のバリューに負け、逆転できるアウツも少ないのでフォールドします。`));
      if (d.m === "medium") out.push(e("It is close to the threshold, which is why folding is only part of the mix.", "続行の水準に近いので、フォールドは混合の一部にとどまります。"));
    }
    out.splice(1, 0, d.standing);
    out.push(blockerLine(d, c, ", so folding gives up less than it seems", "ので、降りても失うものは見た目より小さくなります"));
    out.push(c.st?.place === "bottom" ? e(`${cap(d.tag)} also sits at the bottom of the continuing range, the first part to go.`, `${d.tag}は続行レンジの最下位なので、真っ先に降りる部分です。`) : "");
    return out.filter(Boolean);
  }
  // raise
  if (role.role === "value") {
    out.push(e(`${d.name} has ${d.made}, well ahead of the bettor's range, so raising gets paid by ${d.worse}.`, `${d.name}は${d.made}で相手のレンジを大きく上回り、${d.worse}から払ってもらえるレイズです。`));
    out.push(d.vulnerable && d.boardDraws
      ? e(`The board has ${d.boardDraws}, so the raise also charges them.`, `ボードに${d.boardDraws}があるので、レイズでそれらに課金する意味もあります。`)
      : c.ip ? e("Raising over a bet builds the pot while the worse hands still have something to call with.", "ベットへのレイズは、劣る手がまだコールできるうちにポットを育てます。")
        : e("A check-raise builds the pot out of position, where value is otherwise hard to get.", "チェックレイズなら、ポジションがなくても取りにくいバリューを引き出せます。"));
  } else if (role.role === "semi-bluff") {
    out.push(e(`${d.name} has ${d.draw || d.over}${d.draw && d.over ? ` plus ${d.over}` : ""}, so raising is a semi-bluff: it wins when ${o} folds.`, `${d.name}は${d.draw || d.over}${d.draw && d.over ? `と${d.over}` : ""}を持ち、相手が降りれば勝てるセミブラフのレイズです。`));
    out.push(outsLine(d, c, true));
    out.push(improveLine(d, c));
    out.push(blockerLine(d, c, `, which leaves ${o} fewer strong hands to continue with`, "ので、相手が強い手で続行しにくくなります"));
  } else if (role.role === "protection") {
    out.push(e(`${d.name} has ${d.made}; raising is a minor option that turns a bluff-catcher into a bluff and folds out ${o}'s worse pairs.`, `${d.name}は${d.made}で、レイズはブラフキャッチャーをブラフに変える小さな選択肢で、相手の劣るペアを降ろします。`));
  } else {
    out.push(e(`${d.name} has ${d.has} and cannot call profitably, so it is a bluff-raise candidate that folds out hands that beat it.`, `${d.name}は${d.has}でコールでは採算が合わず、勝っている手を降ろすためのブラフレイズ候補です。`));
    out.push(blockerLine(d, c, ", exactly what a bluff-raise wants", "ので、ブラフレイズに求められる条件を満たします") || (d.unblock ? cap(d.unblock) + (c.en ? "." : "。") : ""));
    if (d.backdoor && !d.has.includes(d.backdoor)) out.push(e(`The ${d.backdoor} gives it some equity if called.`, `${d.backdoor}があり、コールされても少しエクイティが残ります。`));
  }
  return out.filter(Boolean);
}

// One hand-led headline sentence.
export function handHeadline(d: Desc, main: string, role: Role, facing: boolean, c: HC): string {
  const e = (x: string, j: string) => c.en ? x : j;
  const rl = ({ value: e("for value", "バリューで"), "semi-bluff": e("as a semi-bluff", "セミブラフとして"), protection: e("for thin value and protection", "シンバリュー兼プロテクションで"),
    bluff: e("as a bluff", "ブラフとして"), "pot-control": e("to control the pot", "ポットコントロールで") } as Record<string, string>)[role.role];
  const betEn = main === "bet33" ? "a small bet" : main === "bet75" ? "a large bet" : "an overbet";
  let plan: string;
  if (facing) {
    plan = main === "call" ? ((d.m === "nuts" || d.m === "strong") ? e("mostly calls for value", "主にバリューコール") : d.dr !== "none" ? e("mostly calls with its draw", "主にドローでコール") : e("mostly calls as a bluff-catcher", "主にブラフキャッチャーとしてコール"))
      : main === "fold" ? e("mostly folds", "基本はフォールド")
      : e(`mostly raises ${rl}`, `${rl}レイズが中心`);
  } else if (main === "check") plan = e("mostly checks", "チェック中心");
  else if (main === "allin") plan = e(`shoves ${rl}`, `${rl}オールイン`);
  else plan = e(`mostly makes ${betEn} ${rl}`, `${rl}${main === "bet33" ? "小さく" : main === "bet75" ? "大きく" : main === "bet125" ? "オーバーベットで" : ""}ベットが中心`);
  const holding = d.has;
  return e(`${d.name} has ${holding}, and ${plan}.`, `${d.name}は${holding}を持ち、${plan}。`);
}
