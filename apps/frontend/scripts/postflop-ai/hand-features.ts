export type MadeStrength = "nut" | "nearNut" | "strong" | "medium" | "weak";
export type MadeHand = {
 category: string; kind: string; usesHole: number; high?: number; pairRank?: number; kicker?: number;
 kickerStrength?: "strong" | "medium" | "weak"; pairRanks?: number[]; hasLowerBoardCard?: boolean;
 tripsRank?: number; flushSuit?: number; playsBoard?: boolean; strength?: MadeStrength;
 beatenBy?: number; percentile?: number; nut?: boolean; worsePairs?: Record<string, boolean>;
 worseClasses?: string[]; flushKind?: "nut" | "secondNut" | "low"; nutStraight?: boolean; vulnerable?: boolean;
};
export type HandDraws = {
 flush: { suit: number; kind: "nut" | "secondNut" | "nonNut"; oneCard: boolean } | null;
 straight: "gutshot" | "openEnded" | "doubleGutter" | null; combo: boolean;
 backdoorFlush: { suit: number; nut: boolean } | null; backdoorStraight: boolean;
 outs: number; flushOuts: number; straightOuts: number; dirtyOuts: number; outRanks: number[];
 any?: boolean; strong?: boolean;
};
export type HandBlockers = {
 nutFlush: { suit: number; rank: number } | null; secondNutFlush: { suit: number; rank: number } | null;
 nutStraight: boolean; topPair: boolean; sets: boolean; overpairs: boolean;
};
export type MadeContext = { rc: Int8Array; bc: Int8Array; boardRanks: number[]; score: number };
// Hand-specific facts of one hole combo on a 3-5 card board: what the hand has made, which draws it holds,
// the overcards and the blockers it carries. Pure and cheap (about a thousand 5-7 card evaluations per call),
// browser and Node. The explanation copy and the shared role decision (hand-role.mjs) are built on these facts.
//
// Cards are 0-51 integers (rank * 4 + suit, rank 0 = deuce .. 12 = ace, suits c d h s) as in model.mjs.
//
// Approximations (documented on purpose):
//  - `strength` ranks the made hand against every two-card holding that fits the dead cards (uniform), so it
//    says how often a random holding beats us, not how often the opponent's real range does.
//  - draw `outs` count unseen cards that complete a straight or flush using at least one hole card. A straight
//    out is "dirty" (not counted) when that card also puts three of a suit on the board and we hold no flush.
//    Outs that would only pair us, and the opponent's own redraws, are ignored.
import { evaluate } from "../lib/equity.ts";
import { parseCards } from "./model.ts";

export const RANK_CHARS = "23456789TJQKA";
export const SUIT_CHARS = "cdhs";
const CATEGORIES = ["highCard", "pair", "twoPair", "trips", "straight", "flush", "fullHouse", "quads", "straightFlush"];

const rankOf = (c: number) => c >> 2, suitOf = (c: number) => c & 3;

// Windows of five ranks, the wheel (ace low) included. -1 stands for the low ace.
const WINDOWS = Array.from({ length: 10 }, (_, i) => Array.from({ length: 5 }, (_, k) => i - 1 + k));
const slot = (r: number) => r === -1 ? 12 : r;

function straightHigh(mask: number) {
  for (let high = 12; high >= 4; high--) if (((mask >> (high - 4)) & 31) === 31) return high;
  return (mask & 0x100f) === 0x100f ? 3 : -1;
}

// Share thresholds on the fraction of random holdings that beat us.
function strengthOf(beatenBy: number, beaters: number) {
  if (beaters === 0) return "nut";
  if (beatenBy <= 0.02) return "nearNut";
  if (beatenBy <= 0.12) return "strong";
  if (beatenBy <= 0.45) return "medium";
  return "weak";
}

function kickerStrength(rank: number) { return rank >= 9 ? "strong" : rank >= 6 ? "medium" : "weak"; }

function madeHand(hole: readonly number[], board: readonly number[], cat: number, ctx: MadeContext) {
  const { rc, bc, boardRanks } = ctx;
  const hr = [rankOf(hole[0]), rankOf(hole[1])].sort((a, b) => b - a);
  const pocket = hr[0] === hr[1];
  const topB = boardRanks[0];
  const ranksByCount = (n: number) => { const out = []; for (let r = 12; r >= 0; r--) if (rc[r] === n) out.push(r); return out; };
  const made: MadeHand = { category: CATEGORIES[cat], kind: CATEGORIES[cat], usesHole: 0 };
  const holeMatches = hr.filter(r => bc[r] > 0);
  if (cat === 0) {
    made.high = hr[0];
    made.usesHole = 2;
  } else if (cat === 1) {
    const pr = ranksByCount(2)[0];
    made.pairRank = pr;
    if (pocket && bc[hr[0]] === 0) {
      made.kind = hr[0] > topB ? "overpair" : "underpair";
      made.usesHole = 2;
    } else if (!pocket && holeMatches.includes(pr)) {
      const pos = boardRanks.indexOf(pr);
      made.kind = pos === 0 ? "topPair" : pos === 1 ? "secondPair" : "bottomPair";
      made.usesHole = 1;
      made.kicker = hr[0] === pr ? hr[1] : hr[0];
      if (pos === 0) made.kickerStrength = kickerStrength(made.kicker);
    } else made.kind = "boardPair";
  } else if (cat === 2) {
    // The two pairs actually played come from the evaluated score (a third, lower pair is a kicker candidate only).
    const pairs = [Math.floor(ctx.score / 16 ** 4) % 16, Math.floor(ctx.score / 16 ** 3) % 16];
    made.pairRanks = pairs;
    const inPlay = hr.filter(r => pairs.includes(r));
    if (pocket && inPlay.length === 2 && bc[hr[0]] === 0) { made.kind = "pocketPlusBoardPair"; made.usesHole = 2; }
    else if (!pocket && inPlay.length === 2) {
      const positions = hr.map(r => boardRanks.indexOf(r)).sort((a, b) => a - b);
      made.usesHole = 2;
      made.kind = positions[0] === 0 && positions[1] === 1 ? "topTwo" : positions[0] === 0 ? "topAndLower" : "lowerTwo";
    } else if (!pocket && inPlay.length === 1) {
      made.kind = "boardPairPlusOne"; made.usesHole = 1;
      // A lower unpaired board card means weaker two pair exists (it shares the board pair); otherwise only the board pair is below us.
      made.hasLowerBoardCard = boardRanks.some(r => bc[r] === 1 && r < inPlay[0]);
    }
    else made.kind = "boardTwoPair";
  } else if (cat === 3) {
    const tr = ranksByCount(3)[0];
    made.tripsRank = tr;
    if (pocket && hr[0] === tr) { made.kind = "set"; made.usesHole = 2; }
    else if (hr.includes(tr)) { made.kind = "trips"; made.usesHole = 1; }
    else made.kind = "boardTrips";
  } else if (cat === 6) {
    const tr = Math.floor(ctx.score / 16 ** 4) % 16, pr = Math.floor(ctx.score / 16 ** 3) % 16;
    made.tripsRank = tr;
    made.usesHole = hr.filter(r => r === tr || r === pr).length;
  } else if (cat === 7) {
    const qr = Math.floor(ctx.score / 16 ** 4) % 16;
    made.usesHole = hr.filter(r => r === qr).length;
  }
  return made;
}

// Hole cards inside the best straight (the five ranks ending at `high`).
function straightUse(hole: readonly number[], high: number) {
  const win = high === 3 ? [12, 0, 1, 2, 3] : [high - 4, high - 3, high - 2, high - 1, high];
  return hole.filter(c => win.includes(rankOf(c))).length;
}

export function handFeatures(hole: readonly number[], board: readonly number[]) {
  if (hole.length !== 2 || board.length < 3 || board.length > 5) throw new Error("Invalid hand or board");
  const all = [...hole, ...board];
  if (new Set(all).size !== all.length) throw new Error("Duplicate cards");
  const street = board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river";
  const rc = new Int8Array(13), bc = new Int8Array(13);
  const suitAll = new Int8Array(4), suitBoard = new Int8Array(4), suitHole = new Int8Array(4);
  let mask = 0, boardMask = 0;
  for (const c of all) { rc[rankOf(c)]++; suitAll[suitOf(c)]++; mask |= 1 << rankOf(c); }
  for (const c of board) { bc[rankOf(c)]++; suitBoard[suitOf(c)]++; boardMask |= 1 << rankOf(c); }
  for (const c of hole) suitHole[suitOf(c)]++;
  const boardRanks = [...new Set(board.map(rankOf))].sort((a, b) => b - a);
  const topB = boardRanks[0];
  const score = evaluate(all);
  const cat = Math.floor(score / 16 ** 5);
  const ctx = { rc, bc, boardRanks, score };
  const made = madeHand(hole, board, cat, ctx);
  const holeRanks = hole.map(rankOf);

  // Straight / flush made hands: how many hole cards take part.
  if (cat === 4 || cat === 8) made.usesHole = straightUse(hole, Math.floor(score / 16 ** 4) % 16);
  if (cat === 5) {
    const s = suitAll.findIndex(n => n >= 5);
    made.flushSuit = s;
    made.usesHole = suitHole[s];
  }

  // A hand whose five best cards are the board's own plays the board: the hole cards add nothing (a split at best).
  if (board.length === 5 && cat >= 4 && score === evaluate(board)) { made.usesHole = 0; made.playsBoard = true; }

  // Standing against every holding that fits the dead cards, and the best straight any holding makes.
  const dead = new Set(all);
  const rem = [];
  for (let c = 0; c < 52; c++) if (!dead.has(c)) rem.push(c);
  const tally = Array.from({ length: 9 }, () => [0, 0]); // per category: [we beat them, they beat or tie us]
  const sub = { overpair: [0, 0], topPair: [0, 0], underpair: [0, 0], lower: [0, 0] }; // one-pair holdings by kind: [lose to us, beat or tie us]
  let beat = 0, tie = 0, win = 0, bestStraight = -1, bestStraightRanks: Set<number> | null = null;
  for (let i = 0; i < rem.length; i++) for (let j = i + 1; j < rem.length; j++) {
    const v = evaluate([rem[i], rem[j], ...board]);
    const vc = Math.floor(v / 16 ** 5);
    if (v > score) { beat++; tally[vc][1]++; } else if (v === score) { tie++; tally[vc][1]++; } else { win++; tally[vc][0]++; }
    // One-pair classes by the holding's shape (not its outcome), so a top-pair holding that made a flush counts as beating us.
    {
      const r1 = rankOf(rem[i]), r2 = rankOf(rem[j]), side = v < score ? 0 : 1;
      if (r1 === r2) { if (bc[r1] === 0) sub[r1 > topB ? "overpair" : "underpair"][side]++; }
      else if (r1 === topB || r2 === topB) sub.topPair[side]++;
      if (vc === 1 && made.pairRank !== undefined && made.category === "pair" && Math.floor(v / 16 ** 4) % 16 < made.pairRank) sub.lower[side]++;
    }
    if (v >= 4 * 16 ** 5 && v < 5 * 16 ** 5) {
      if (v > bestStraight) { bestStraight = v; bestStraightRanks = new Set(); }
      if (v === bestStraight) { bestStraightRanks!.add(rankOf(rem[i])); bestStraightRanks!.add(rankOf(rem[j])); }
    }
  }
  const total = beat + tie + win;
  const beatenBy = beat / total;
  const ahead = (win + tie / 2) / total;
  made.strength = strengthOf(beatenBy, beat);
  made.beatenBy = Math.round(beatenBy * 1e4) / 1e4;
  made.percentile = Math.round(ahead * 1e4) / 1e4;
  made.nut = beat === 0;
  // Coarse classes of holdings that lose to us (more of them lose than beat or tie us), by combo count.
  made.worsePairs = Object.fromEntries(Object.entries(sub).map(([k, [lose, other]]) => [k, lose > 0 && lose > other]));
  made.worseClasses = tally.map(([lose, other], c) => ({ cls: CATEGORIES[c], lose, other })).filter(x => x.lose > x.other && x.lose > 0)
    .sort((x, y) => y.lose - x.lose).map(x => x.cls);

  // Flush quality: our best card of the suit against the best unseen ones.
  const suitRankFree = (s: number, skip = 0) => {
    let n = skip;
    for (let r = 12; r >= 0; r--) if (!board.some(c => suitOf(c) === s && rankOf(c) === r)) { if (n === 0) return r; n--; }
    return -1;
  };
  const topSuited = (s: number) => Math.max(-1, ...hole.filter(c => suitOf(c) === s).map(rankOf));
  if (cat === 5) {
    const t = topSuited(made.flushSuit!);
    made.flushKind = t === suitRankFree(made.flushSuit!) ? "nut" : t === suitRankFree(made.flushSuit!, 1) ? "secondNut" : "low";
  }
  if (cat === 4 || cat === 8) made.nutStraight = made.nut;

  // Board shape.
  const boardInfo = (() => {
    const maxSuit = Math.max(...suitBoard);
    let connected = false;
    for (const w of WINDOWS) if (w.filter(r => boardMask & (1 << slot(r))).length >= 3) connected = true;
    return { paired: boardRanks.length < board.length, maxSuit, flushy: maxSuit >= 2, connected, monotone: maxSuit >= 3 };
  })();
  const drawy = street !== "river" && (boardInfo.flushy || boardInfo.connected);
  made.vulnerable = drawy && cat >= 1 && cat <= 5 && made.strength !== "nut" && made.kind !== "boardPair" && made.kind !== "boardTwoPair" && made.kind !== "boardTrips";

  // Draws (never on the river).
  const draws: HandDraws = { flush: null, straight: null, combo: false, backdoorFlush: null, backdoorStraight: false,
    outs: 0, flushOuts: 0, straightOuts: 0, dirtyOuts: 0, outRanks: [] };
  if (street !== "river") {
    let flushDrawSuit = -1;
    if (cat < 5) for (let s = 0; s < 4; s++) if (suitAll[s] === 4 && suitHole[s] >= 1) flushDrawSuit = s;
    if (flushDrawSuit >= 0) {
      const t = topSuited(flushDrawSuit);
      draws.flush = { suit: flushDrawSuit, kind: t === suitRankFree(flushDrawSuit) ? "nut" : t === suitRankFree(flushDrawSuit, 1) ? "secondNut" : "nonNut",
        oneCard: suitHole[flushDrawSuit] === 1 };
    }
    // Outs: unseen cards that complete a straight or flush using a hole card. A straight out is "dirty" when the card also
    // puts three of a suit on the board. Straight completions are named only from ranks that give at least one out.
    const clean = new Set<number>(), outRankSet = new Set<number>();
    if (cat < 4) for (const x of rem) {
      const s2 = evaluate([...all, x]);
      const c2 = Math.floor(s2 / 16 ** 5);
      if (c2 !== 4 && c2 !== 5 && c2 !== 8) continue;
      if (board.length + 1 >= 5 && Math.floor(evaluate([...board, x]) / 16 ** 5) >= c2) continue;
      const flush = c2 === 5 || c2 === 8;
      if (c2 === 4) outRankSet.add(rankOf(x));
      const dirty = !flush && [0, 1, 2, 3].some(s => [...board, x].filter(c => suitOf(c) === s).length >= 3);
      if (dirty) { draws.dirtyOuts++; continue; }
      clean.add(x);
      if (flush) draws.flushOuts++; else draws.straightOuts++;
    }
    const completing = [...outRankSet].sort((x, y) => x - y);
    draws.outRanks = completing;
    if (completing.length === 1) draws.straight = "gutshot";
    else if (completing.length === 2) {
      const [a, b] = completing.map(r => r === 12 && completing.some(x => x <= 4) ? -1 : r).sort((x, y) => x - y);
      draws.straight = b - a === 5 ? "openEnded" : "doubleGutter";
    } else if (completing.length >= 3) draws.straight = "doubleGutter";
    draws.outs = clean.size;
    draws.combo = Boolean(draws.flush && draws.straight);
    if (street === "flop") {
      for (let s = 0; s < 4; s++) if (suitAll[s] === 3 && suitHole[s] >= 1) {
        draws.backdoorFlush = { suit: s, nut: topSuited(s) === suitRankFree(s) };
      }
      if (!draws.straight && cat < 4) for (const w of WINDOWS) {
        const slots = w.map(slot);
        if (slots.filter(x => mask & (1 << x)).length >= 3 && holeRanks.some(h => slots.includes(h))) { draws.backdoorStraight = true; break; }
      }
    }
  }
  draws.any = Boolean(draws.flush || draws.straight);
  draws.strong = Boolean(draws.combo || draws.flush?.kind === "nut" || ((draws.straight === "openEnded" || draws.straight === "doubleGutter") && draws.outs >= 4) || draws.outs >= 8);

  // Overcards to the board.
  const overRanks = holeRanks.filter(r => r > topB).sort((a, b) => b - a);
  const overcards = { count: overRanks.length, ranks: overRanks };
  const unpaired = cat === 0;
  const aceHigh = unpaired && holeRanks.includes(12);

  // Blockers.
  const blockers: HandBlockers = { nutFlush: null, secondNutFlush: null, nutStraight: false, topPair: false, sets: false, overpairs: false };
  for (let s = 0; s < 4; s++) {
    const need = street === "flop" ? 2 : 3;
    if (suitBoard[s] < need) continue;
    const t = topSuited(s);
    if (t >= 0 && t === suitRankFree(s)) blockers.nutFlush = { suit: s, rank: t };
    else if (t >= 0 && t === suitRankFree(s, 1)) blockers.secondNutFlush = { suit: s, rank: t };
  }
  if (bestStraightRanks && cat < 4) blockers.nutStraight = holeRanks.some(r => bestStraightRanks!.has(r) && bc[r] === 0);
  blockers.topPair = holeRanks.includes(topB);
  blockers.sets = holeRanks.some(r => bc[r] > 0);
  blockers.overpairs = overRanks.length > 0;

  return { street, hole, board, made, draws, overcards, aceHigh,
    aceHighValue: aceHigh && ahead >= 0.3, boardInfo, blockers };
}

export function featuresFromText(holeText: string, boardText: string) {
  return handFeatures(parseCards(holeText, 2), parseCards(boardText, boardText.length / 2));
}

// Stable text key of the parts of the features the copy depends on: the average-of-combos view uses it to pick the
// representative (most common) combo of a hand class.
export function featureSignature(f: HandFeatures) {
  const d = f.draws;
  return [f.made.kind, f.made.strength, f.made.kickerStrength ?? "", d.flush?.kind ?? "", d.straight ?? "",
    d.backdoorFlush ? "bf" : "", f.overcards.count, f.blockers.nutFlush ? "nf" : "", f.blockers.nutStraight ? "ns" : ""].join("|");
}

export type HandFeatures = ReturnType<typeof handFeatures>;
