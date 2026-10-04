// Cheap private-card contribution facts for the NEW mw3 model only. Taxonomy mirrors
// hand-features.mjs's structural made-hand distinctions, without its ~1,000-opponent
// strength scan per combo. Existing HU classification and evaluator stay byte-identical.
import { evaluateContinuation } from '../lib/continuation-evaluator.mjs';
export const MW3_HAND_CLASSIFIER_VERSION = 4;
export const MW3_TIERS = Object.freeze(['absolute_nuts', 'nuts', 'monster', 'strong', 'draw', 'medium', 'air', 'board_shared', 'board_locked']);
function privateDraw(hole, board, currentScore) {
  if (board.length === 5) return false;
  const all = [...hole, ...board], known = new Set(all), ranks = new Set(all.map(card => card >> 2));
  const boardRanks = new Set(board.map(card => card >> 2)), flushSuits = new Set(), missingRanks = new Set();
  for (let suit = 0; suit < 4; suit++) if (all.filter(card => (card & 3) === suit).length === 4 && hole.some(card => (card & 3) === suit)) flushSuits.add(suit);
  const windows = [[12, 0, 1, 2, 3], ...Array.from({ length: 9 }, (_, low) => Array.from({ length: 5 }, (_, i) => low + i))];
  for (const window of windows) if (window.filter(rank => ranks.has(rank)).length === 4 &&
      hole.some(card => window.includes(card >> 2) && !boardRanks.has(card >> 2))) {
    missingRanks.add(window.find(rank => !ranks.has(rank)));
  }
  if (!flushSuits.size && !missingRanks.size) return false;
  // A window is only a possible out. Verify the actual best five after that card:
  // e.g. hole 2K / board 3467 must not call a board-owned 34567 straight our draw.
  for (let card = 0; card < 52; card++) {
    if (known.has(card) || !flushSuits.has(card & 3) && !missingRanks.has(card >> 2)) continue;
    const completed = evaluateContinuation([...all, card]), category = Math.floor(completed / 16 ** 5);
    if (![4, 5, 8].includes(category) || completed <= currentScore) continue;
    if (board.length === 4 && completed <= evaluateContinuation([...board, card])) continue;
    return true;
  }
  return false;
}

const categoryOf = score => Math.floor(score / 16 ** 5);
const primaryRank = score => Math.floor(score / 16 ** 4) % 16;
const secondaryRank = score => Math.floor(score / 16 ** 3) % 16;
const CATEGORIES = ['highCard', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];
const boardMaxima = new Map();
let boardRankingCacheLimit = 512;
// Offline simulations may retain all rank tables for one fixed flop. Numeric behavior
// is independent of this bounded cache size; browsers keep the 512-board default.
export function setMw3RankingCacheLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 4096) throw new Error('Invalid mw3 rank-cache limit');
  const previous = boardRankingCacheLimit; boardRankingCacheLimit = limit;
  while (boardMaxima.size > limit) boardMaxima.delete(boardMaxima.keys().next().value);
  return previous;
}

// Public upper bound: maximize over every legal two-card holding after excluding
// ONLY the public board. Equal score is guaranteed nuts; a lower score may still be
// nuts once Hero's blockers are removed, so false is NOT a claim that Hero is beatable.
function boardRanking(board) {
  if (!Array.isArray(board) || ![3, 4, 5].includes(board.length) || new Set(board).size !== board.length ||
      board.some(card => !Number.isInteger(card) || card < 0 || card > 51)) throw new Error('Invalid mw3 public board');
  const key = [...board].sort((a, b) => a - b).join(',');
  if (boardMaxima.has(key)) return boardMaxima.get(key);
  const blocked = new Set(board), remaining = Array.from({ length: 52 }, (_, card) => card).filter(card => !blocked.has(card));
  const raw = [];
  for (let i = 0; i < remaining.length; i++) for (let j = i + 1; j < remaining.length; j++) {
    raw.push([evaluateContinuation([...board, remaining[i], remaining[j]]), remaining[i], remaining[j]]);
  }
  raw.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
  const ranking = { scores: Uint32Array.from(raw, item => item[0]), first: Uint8Array.from(raw, item => item[1]), second: Uint8Array.from(raw, item => item[2]) };
  if (boardMaxima.size >= boardRankingCacheLimit) boardMaxima.delete(boardMaxima.keys().next().value);
  boardMaxima.set(key, ranking);
  return ranking;
}
export function mw3BoardMaxScore(board) { return boardRanking(board).scores[0]; }

// Exact maximum after excluding BOTH known private cards. Skips at most 95/93/91
// conflicting pairs on flop/turn/river; never reevaluates 1,000 opponents per combo.
// This is current made-hand rank only, not equity, EV, a range, or a runout guarantee.
export function mw3OpponentMaxScore(hole, board) {
  if (!Array.isArray(hole) || hole.length !== 2) throw new Error('Invalid mw3 private hand');
  evaluateContinuation([...hole, ...board]); // Also rejects overlap, bad ranks and duplicates.
  const ranking = boardRanking(board);
  for (let i = 0; i < ranking.scores.length; i++) {
    if (ranking.first[i] !== hole[0] && ranking.first[i] !== hole[1] && ranking.second[i] !== hole[0] && ranking.second[i] !== hole[1]) return ranking.scores[i];
  }
  throw new Error('No legal mw3 opponent pair');
}

// Exact public lock: EVERY legal private holding ties the five-card board.
// Check this BEFORE considering private nuts; a locked board never gains value
// from a particular private holding.
export function mw3BoardLocked(board) {
  return Array.isArray(board) && board.length === 5 && evaluateContinuation(board) === mw3BoardMaxScore(board);
}

// A sufficient certificate, not equity or an exhaustive classification of every
// future lock. Opponent's final seven cards contain B known board cards and 7-B
// external cards, so every best five contains at least B-2 known board cards.
// Enumerate an upper bound on all possible opponent full houses or better, with
// Hero's BOTH cards removed. If this is <= Hero's current >=full-house rank, no
// runout can beat Hero (whose best-five rank cannot decrease). A tie may occur.
// A false certificate never claims Hero can lose; it may miss joint improvements.
export function mw3FutureOpponentUpper(hole, board) {
  if (!Array.isArray(hole) || hole.length !== 2 || !Array.isArray(board) || ![3, 4, 5].includes(board.length)) throw new Error('Invalid mw3 future-lock cards');
  evaluateContinuation([...hole, ...board]);
  const needed = board.length - 2, held = new Set(hole), known = new Set(board);
  const holeCounts = new Uint8Array(13), boardCounts = new Uint8Array(13);
  for (const card of hole) holeCounts[card >> 2]++;
  for (const card of board) boardCounts[card >> 2]++;
  const packed = (category, first, second = 0) => category * 16 ** 5 + first * 16 ** 4 + second * 16 ** 3;
  for (let high = 12; high >= 3; high--) for (let suit = 0; suit < 4; suit++) {
    const ranks = high === 3 ? [12, 0, 1, 2, 3] : [high - 4, high - 3, high - 2, high - 1, high];
    const cards = ranks.map(rank => rank * 4 + suit);
    if (cards.every(card => !held.has(card)) && cards.filter(card => known.has(card)).length >= needed) return packed(8, high);
  }
  for (let quad = 12; quad >= 0; quad--) if (holeCounts[quad] === 0) {
    for (let kicker = 12; kicker >= 0; kicker--) if (kicker !== quad &&
        boardCounts[quad] + Math.min(1, boardCounts[kicker]) >= needed) return packed(7, quad, kicker);
  }
  for (let trip = 12; trip >= 0; trip--) if (4 - holeCounts[trip] >= 3) {
    for (let pair = 12; pair >= 0; pair--) if (pair !== trip && 4 - holeCounts[pair] >= 2 &&
        Math.min(3, boardCounts[trip]) + Math.min(2, boardCounts[pair]) >= needed) return packed(6, trip, pair);
  }
  // Every lower category lies below this conservative bound.
  return 6 * 16 ** 5 - 1;
}

export function mw3HandFacts(hole, board) {
  if (!Array.isArray(hole) || hole.length !== 2 || !Array.isArray(board) || ![3, 4, 5].includes(board.length)) throw new Error('Invalid mw3 hand or board');
  const score = evaluateContinuation([...hole, ...board]), category = categoryOf(score);
  const boardCounts = new Uint8Array(13), holeRanks = hole.map(card => card >> 2);
  for (const card of board) boardCounts[card >> 2]++;
  const boardRanks = [...new Set(board.map(card => card >> 2))].sort((a, b) => b - a);
  const sideRanks = boardRanks.filter(rank => boardCounts[rank] === 1);
  const pocket = holeRanks[0] === holeRanks[1], first = primaryRank(score), second = secondaryRank(score);
  const playsBoard = board.length === 5 && score === evaluateContinuation(board);
  let madeKind = CATEGORIES[category], privatePairRank = null;
  if (category === 1) {
    privatePairRank = boardCounts[first] >= 2 ? null : first;
    madeKind = privatePairRank === null ? 'boardPair' : pocket ? 'pocketPair' : 'privatePair';
  } else if (category === 2) {
    const pairs = [first, second], ownPairs = pairs.filter(rank => boardCounts[rank] < 2);
    privatePairRank = ownPairs.length ? Math.max(...ownPairs) : null;
    madeKind = !ownPairs.length ? 'boardTwoPair'
      : pocket && pairs.includes(holeRanks[0]) && boardCounts[holeRanks[0]] === 0 ? 'pocketPlusBoardPair'
      : pairs.some(rank => boardCounts[rank] >= 2) ? 'boardPairPlusOne' : 'privateTwoPair';
  } else if (category === 3) madeKind = boardCounts[first] === 3 ? 'boardTrips' : pocket ? 'set' : 'trips';
  else if (category === 7 && boardCounts[first] === 4) madeKind = 'boardQuadsKicker';
  const kickerPowers = ({ 0: [4, 3, 2, 1, 0], 1: [3, 2, 1], 2: [2], 3: [3, 2], 7: [3] })[category] ?? [];
  const playedKickers = kickerPowers.map(power => Math.floor(score / 16 ** power) % 16);
  const privateKickers = playsBoard ? [] : holeRanks.filter(rank => boardCounts[rank] === 0 && playedKickers.includes(rank));
  const blockerConditionedNuts = !playsBoard && score >= mw3OpponentMaxScore(hole, board);
  const royal = score === 8 * 16 ** 5 + 12 * 16 ** 4;
  return { score, category, categoryName: CATEGORIES[category], madeKind, primaryRank: first, secondaryRank: second,
    pocket, holeRanks, boardRanks, highestSideRank: sideRanks[0] ?? null, privatePairRank,
    highestPrivateKicker: privateKickers.length ? Math.max(...privateKickers) : null,
    playsBoard, boardLocked: playsBoard && mw3BoardLocked(board),
    guaranteedPrivateNuts: !playsBoard && score === mw3BoardMaxScore(board),
    // Preserve existing river frequencies: only the original royal class moves
    // to absolute_nuts there; every other exact river nuts already has fold=0.
    absoluteNuts: blockerConditionedNuts && category >= 6 && (royal || board.length < 5 && score >= mw3FutureOpponentUpper(hole, board)),
    blockerConditionedNuts,
    nutsDetection: 'public_upper_bound_fact_and_exact_hole_blocker_conditioned_current_rank',
    hasDraw: privateDraw(hole, board, score) };
}


// Mapping approved for the new mw3 model by its Astra policy author. 'strong' here
// includes good bluff-catchers and never promises value against a particular range.
export function mw3HandTier(hole, board) {
  const f = mw3HandFacts(hole, board);
  if (f.boardLocked) return 'board_locked';
  if (f.playsBoard) return 'board_shared';
  if (f.absoluteNuts) return 'absolute_nuts';
  if (f.blockerConditionedNuts) return 'nuts';
  const withDraw = tier => tier === 'medium' && f.hasDraw ? 'draw' : tier;
  if (f.madeKind === 'pocketPlusBoardPair') return withDraw(f.highestSideRank === null || f.privatePairRank > f.highestSideRank ? 'strong' : 'medium');
  if (f.madeKind === 'boardPairPlusOne') return withDraw(f.privatePairRank === f.highestSideRank ? 'strong' : 'medium');
  if (f.madeKind === 'boardPair') return withDraw('medium');
  if (['boardTwoPair', 'boardTrips', 'boardQuadsKicker'].includes(f.madeKind)) {
    const excluded = f.boardRanks; // Pairing a board rank changes category or adds no new kicker.
    let bestKicker = 12; while (excluded.includes(bestKicker)) bestKicker--;
    const kickerSlots = f.madeKind === 'boardTwoPair' ? [Math.floor(f.score / 16 ** 2) % 16]
      : f.madeKind === 'boardTrips' ? [f.secondaryRank, Math.floor(f.score / 16 ** 2) % 16] : [f.secondaryRank];
    const topPrivateKicker = f.holeRanks.includes(bestKicker) && kickerSlots.includes(bestKicker);
    return withDraw(topPrivateKicker ? 'strong' : 'medium');
  }
  if (f.category >= 2) return 'monster';
  if (f.category === 1) return withDraw(f.privatePairRank === f.boardRanks[0] || f.pocket && f.privatePairRank > f.boardRanks[0] ? 'strong' : 'medium');
  return f.hasDraw ? 'draw' : 'air';
}
