import { hands } from "../data.js";
import { positions } from "./ranges.js";

export function validateOpeningDataset(data) {
  const openingPositions = positions.slice(0, -1);
  if (data?.metadata?.ante_bb !== 0 || data?.metadata?.strategy_type !== "general_knowledge_estimate_not_gto" ||
      data.metadata.effective_stack_bb !== 100 || data.metadata.open_size_bb !== 2.5 ||
      data.entry_count !== 845 || data.spot_count !== 5 || data.hand_classes_per_spot !== 169 ||
      !Array.isArray(data.spots) || data.spots.length !== 5 ||
      !openingPositions.every(hero => data.spots.some(s => s.id === `${hero}_open` && s.hero === hero))) {
    throw new Error("オープンレンジの条件または局面数が一致しません。");
  }
  for (const spot of data.spots) {
    if (spot.open_size_bb !== 2.5 || spot.effective_stack_bb !== 100 ||
        !Array.isArray(spot.hands) || spot.hands.length !== 169 ||
        new Set(spot.hands.map(row => row.hand)).size !== 169) {
      throw new Error(`オープン局面データが不正です: ${spot.id}`);
    }
    for (const row of spot.hands) {
      if (!hands.includes(row.hand) || ![row.open, row.fold].every(n => Number.isFinite(n) && n >= 0 && n <= 100) ||
          Math.abs(row.open + row.fold - 100) > 1e-6 ||
          row.open_size_bb !== (row.open > 0 ? 2.5 : null) ||
          typeof row.reason !== "string" || !row.reason.trim()) {
        throw new Error(`オープンハンドデータが不正です: ${spot.id} / ${row.hand}`);
      }
    }
  }
  return data;
}

export function findOpeningSpot(data, hero) {
  const spot = data.spots.find(item => item.hero === hero);
  if (!spot) throw new Error("このポジションのオープンレンジはありません。");
  return spot;
}

export function openingMatrixModel(spot) {
  return {
    actions: ["raise_2.5", "fold"],
    aggregates: new Map(spot.hands.map(row => [row.hand, {
      hand: row.hand,
      comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
      actions: { "raise_2.5": row.open / 100, fold: row.fold / 100 },
    }])),
  };
}
