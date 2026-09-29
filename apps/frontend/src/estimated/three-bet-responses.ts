import { hands } from "../data.ts";
import { hasConfiguredRake } from "./rake.ts";
import { positions } from "./ranges.ts";
import { fourBetToSize, isInPosition, openSizeBb, openSizeFor } from "./sizing.ts";

export function validateThreeBetDataset(data, responses, openings) {
  const expected = positions.flatMap((hero, i) => positions.slice(i + 1).map(bettor => `${hero}_vs_${bettor}_three_bet`));
  if (data?.metadata?.ante_bb !== 0 || data?.metadata?.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.effective_stack_bb !== 100 || data.metadata.open_size_bb !== openSizeBb ||
      !hasConfiguredRake(data.metadata) ||
      data.spot_count !== 15 || data.entry_count !== 2535 || data.hand_classes_per_spot !== 169 ||
      !Array.isArray(data.spots) || data.spots.length !== 15 ||
      !expected.every(id => data.spots.some(s => s.id === id))) {
    throw new Error("3bet後の応答データの条件・局面数が一致しません。");
  }
  for (const spot of data.spots) {
    const previous = responses.spots.find(s => s.opener === spot.hero && s.hero === spot.three_bettor);
    const opening = openings.spots.find(s => s.hero === spot.hero);
    if (!previous || !opening || spot.opener !== spot.hero ||
        spot.id !== `${spot.hero}_vs_${spot.three_bettor}_three_bet` ||
        spot.source_response_id !== previous.id || spot.three_bet_size_bb !== previous.three_bet_size_bb ||
        spot.open_size_bb !== openSizeFor(spot.opener) || spot.effective_stack_bb !== 100 ||
        spot.hero_position_vs_three_bettor !== (isInPosition(spot.hero, spot.three_bettor) ? "IP" : "OOP") ||
        spot.four_bet_size_bb !== fourBetToSize(spot.hero, spot.three_bettor) ||
        !Number.isFinite(spot.four_bet_size_bb) || spot.four_bet_size_bb >= 100 ||
        spot.four_bet_size_bb > 100 || !Array.isArray(spot.hands) || spot.hands.length !== 169 ||
        new Set(spot.hands.map(h => h.hand)).size !== 169) {
      throw new Error(`3bet局面の対応関係・サイズが不正です: ${spot.id}`);
    }
    for (const row of spot.hands) {
      const values = [row.fold, row.call, row.four_bet];
      const open = opening.hands.find(h => h.hand === row.hand);
      if (!hands.includes(row.hand) || !open ||
          !values.every(n => Number.isFinite(n) && n >= 0 && n <= 100) ||
          Math.abs(values.reduce((a, b) => a + b, 0) - 100) > 1e-6 ||
          row.four_bet_size_bb !== (row.four_bet > 0 ? spot.four_bet_size_bb : null) ||
          (open.open === 0 && row.fold !== 100)) {
        throw new Error(`3bet応答ハンドが不正です: ${spot.id} / ${row.hand}`);
      }
    }
  }
  return data;
}

export function findThreeBetSpot(data, hero, threeBettor) {
  const spot = data.spots.find(s => s.hero === hero && s.three_bettor === threeBettor);
  if (!spot) throw new Error("この組み合わせの3bet後の応答はありません。");
  return spot;
}

export function threeBetMatrixModel(spot) {
  return {
    actions: ["raise_four_bet", "call", "fold"],
    actionLabels: { raise_four_bet: `レイズ ${spot.four_bet_size_bb}BB` },
    aggregates: new Map(spot.hands.map(row => [row.hand, {
      hand: row.hand,
      comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
      actions: { raise_four_bet: row.four_bet / 100, call: row.call / 100, fold: row.fold / 100 },
    }])),
  };
}
