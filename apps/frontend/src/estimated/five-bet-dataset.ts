import type { FiveBetDataset } from "./preflop-types.ts";
import type { MatrixModel } from "../data.ts";
import { hands } from "../data.ts";
import { hasConfiguredRake } from "./rake.ts";
import { fourBetToSize, openSizeBb, openSizeFor, threeBetToSize } from "./sizing.ts";

export function validateFiveBetDataset(data: FiveBetDataset) {
  if (data?.metadata?.strategy_type !== "ai_estimate_not_gto" ||
      !hasConfiguredRake(data.metadata) || !Array.isArray(data.spots) ||
      data.metadata.open_size_bb !== openSizeBb ||
      data.spot_count !== 15 || data.entry_count !== 2535 || data.hand_classes_per_spot !== 169 ||
      data.spots.length !== 15) throw new Error("5bet応答データの形式が不正です。");
  for (const spot of data.spots) {
    if (spot.all_in_size_bb !== 100 || spot.hero !== spot.opener || spot.hands?.length !== 169 ||
        spot.open_size_bb !== openSizeFor(spot.opener) ||
        spot.three_bet_size_bb !== threeBetToSize(spot.opener, spot.five_bettor) ||
        spot.four_bet_size_bb !== fourBetToSize(spot.opener, spot.five_bettor)) throw new Error(`${spot.id}: 局面の前提が不正です。`);
    spot.hands.forEach((row, index) => {
      if (row.hand !== hands[index] || !Number.isInteger(row.fold) || !Number.isInteger(row.call) || row.fold + row.call !== 100) throw new Error(`${spot.id}/${row.hand}: 頻度が不正です。`);
    });
  }
  return data;
}
