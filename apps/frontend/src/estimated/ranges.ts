import type { ResponseDataset, ResponseSpot } from "./preflop-types.ts";
import type { MatrixModel } from "../data.ts";
import { hands } from "../data.ts";
import { positions, openSizeBb, openSizeFor, threeBetToSize } from "./sizing.ts";
import { hasConfiguredRake } from "./rake.ts";

export type PreflopComboWeight = { combo: string; handClass: string; reachWeight: number; frequencies: Record<string, number> };

/** Expand class-level preflop frequencies to exact, suit-aware combos for future street consumers. */
export function preflopComboWeights(rows: Array<{ hand: string; [action: string]: string | number | undefined }>, priorReachWeight: number | Record<string, number> = 1): PreflopComboWeight[] {
  const suits = "cdhs";
  const combos: PreflopComboWeight[] = [];
  for (const row of rows) {
    const hand = row.hand;
    if (!hands.includes(hand)) throw new Error(`Unknown preflop hand class: ${hand}`);
    const frequencies = Object.fromEntries(Object.entries(row).filter(([key, value]) => key !== "hand" && typeof value === "number")) as Record<string, number>;
    const add = (first: string, second: string) => {
      const combo = `${first}${second}`;
      const reachWeight = typeof priorReachWeight === "number" ? priorReachWeight : priorReachWeight[combo] ?? 0;
      if (!Number.isFinite(reachWeight) || reachWeight < 0) throw new Error(`Invalid combo reach weight: ${combo}`);
      combos.push({ combo, handClass: hand, reachWeight, frequencies });
    };
    if (hand[0] === hand[1]) {
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) add(`${hand[0]}${suits[i]}`, `${hand[1]}${suits[j]}`);
    } else if (hand.endsWith("s")) {
      for (const suit of suits) add(`${hand[0]}${suit}`, `${hand[1]}${suit}`);
    } else {
      for (const highSuit of suits) for (const lowSuit of suits) if (highSuit !== lowSuit) add(`${hand[0]}${highSuit}`, `${hand[1]}${lowSuit}`);
    }
  }
  return combos;
}

export { positions };

export const rangeTypes = [
  { value: "response", label: "オープンへの応答", available: true },
  { value: "open", label: "オープンレンジ", available: true },
  { value: "limp", label: "SBリンプへの応答", available: true },
  { value: "three_bet", label: "3bet後の応答", available: true },
  { value: "four_bet", label: "4bet後の応答", available: true },
];

export function validateDataset(data: ResponseDataset) {
  const expectedIds = positions.flatMap((opener, i) => positions.slice(i + 1).map(hero => `${hero}_vs_${opener}`));
  if (data?.metadata?.ante_bb !== 0 || data?.metadata?.strategy_type !== "ai_estimate_not_gto" ||
      !hasConfiguredRake(data.metadata) ||
      data?.metadata?.effective_stack_bb !== 100 || data?.metadata?.open_size_bb !== openSizeBb ||
      data?.entry_count !== 2535 || !Array.isArray(data.spots) || data.spots.length !== 15 ||
      new Set(data.spots.map(spot => spot.id)).size !== 15 ||
      !expectedIds.every(id => data.spots.some(spot => spot.id === id))) {
    throw new Error("推定レンジの条件または局面数が一致しません。");
  }
  for (const spot of data.spots) {
    if (spot.id !== `${spot.hero}_vs_${spot.opener}` ||
        spot.open_size_bb !== openSizeFor(spot.opener) || spot.effective_stack_bb !== 100 ||
        spot.three_bet_size_bb !== threeBetToSize(spot.opener, spot.hero, 0) ||
        !Array.isArray(spot.hands) || spot.hands.length !== 169 ||
        new Set(spot.hands.map(row => row.hand)).size !== 169) {
      throw new Error(`局面データが不正です: ${spot.id}`);
    }
    for (const row of spot.hands) {
      const frequencies = [row.fold, row.call, row.three_bet];
      if (!hands.includes(row.hand) || !frequencies.every(n => Number.isFinite(n) && n >= 0 && n <= 100) ||
          Math.abs(frequencies.reduce((a, b) => a + b, 0) - 100) > 1e-6 ||
          (row.three_bet === 0 ? row.three_bet_size_bb !== null :
            row.three_bet_size_bb !== spot.three_bet_size_bb)) {
        throw new Error(`ハンドデータが不正です: ${spot.id} / ${row.hand}`);
      }
    }
  }
  return data;
}

export function availableHeroes(opener: string) {
  const index = positions.indexOf(opener);
  return index < 0 ? [] : positions.slice(index + 1);
}

export function hasSpot(data: ResponseDataset | null | undefined, opener: string, hero: string) {
  return Boolean(data?.spots?.some(spot => spot.opener === opener && spot.hero === hero));
}

export function availableOpeners(data: ResponseDataset | null | undefined) {
  return positions.filter(opener => data?.spots?.some(spot => spot.opener === opener));
}

export function findSpot(data: ResponseDataset, opener: string, hero: string) {
  const spot = data.spots.find(item => item.opener === opener && item.hero === hero);
  if (!spot) throw new Error("この組み合わせの対オープンレンジはありません。");
  return spot;
}

export function matrixModel(spot: ResponseSpot): MatrixModel {
  const actions = ["raise_ai", "call", "fold"];
  const aggregates = new Map(spot.hands.map(row => [row.hand, {
    hand: row.hand,
    comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
    actions: { raise_ai: row.three_bet / 100, call: row.call / 100, fold: row.fold / 100 },
  }]));
  return { actions, aggregates, actionLabels: { raise_ai: `レイズ ${spot.three_bet_size_bb}BB` } };
}
