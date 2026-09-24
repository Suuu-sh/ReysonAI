import { hands } from "../data.js";
import { positions, validateDataset } from "./ranges.js";
import { validateOpeningDataset } from "./opening-ranges.js";
import { validateThreeBetDataset } from "./three-bet-responses.js";
import { fourBetToSize, openSizeBb, openSizeFor } from "./sizing.js";
import { hasConfiguredRake } from "./rake.js";

export function validateFourBetDataset(data, responses, previous, openings) {
  validateDataset(responses);
  validateOpeningDataset(openings);
  validateThreeBetDataset(previous, responses, openings);
  const expected = positions.flatMap((opener, i) => positions.slice(i + 1).map(hero => `${hero}_vs_${opener}_four_bet`));
  const fail = detail => { throw new Error(`4bet後の応答データが不正です: ${detail}`); };
  if (data?.metadata?.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.effective_stack_bb !== 100 || data.metadata.open_size_bb !== openSizeBb ||
      data.metadata.ante_bb !== 0 || data.metadata.game !== "6max Cash / No-Limit Texas Holdem" ||
      !hasConfiguredRake(data.metadata) ||
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify(["fold", "call", "all_in"]) ||
      data.spot_count !== 15 || data.entry_count !== 2535 || data.hand_classes_per_spot !== 169 ||
      !Array.isArray(data.spots) || data.spots.length !== 15 ||
      !expected.every(id => data.spots.some(s => s?.id === id))) fail("条件・局面数・spot ID");
  for (const spot of data.spots) {
    const source = responses.spots.find(s => s.opener === spot.opener && s.hero === spot.hero);
    const before = previous.spots.find(s => s.opener === spot.opener && s.three_bettor === spot.hero);
    if (!source || !before || spot.three_bettor !== spot.hero ||
        spot.id !== `${spot.hero}_vs_${spot.opener}_four_bet` ||
        spot.source_response_id !== source.id || spot.source_three_bet_response_id !== before.id ||
        spot.hero_position_vs_opener !== source.hero_position_vs_opener ||
        spot.open_size_bb !== openSizeFor(spot.opener) || spot.effective_stack_bb !== 100 ||
        spot.three_bet_size_bb !== source.three_bet_size_bb || spot.three_bet_size_bb !== before.three_bet_size_bb ||
        spot.four_bet_size_bb !== before.four_bet_size_bb ||
        !Number.isFinite(spot.three_bet_size_bb) || spot.three_bet_size_bb < 4 ||
        spot.four_bet_size_bb !== fourBetToSize(spot.opener, spot.hero) ||
        !Number.isFinite(spot.four_bet_size_bb) || spot.four_bet_size_bb >= 100 ||
        spot.four_bet_size_bb >= 100 || spot.all_in_size_bb !== 100 ||
        !Array.isArray(spot.hands) || spot.hands.length !== 169 ||
        new Set(spot.hands.map(r => r?.hand)).size !== 169) fail(`対応関係・サイズ: ${spot.id}`);
    for (const row of spot.hands) {
      const entry = source.hands.find(r => r.hand === row?.hand);
      if (!row || !entry || !hands.includes(row.hand)) fail(`ハンド: ${spot.id}`);
      const frequencies = [row.fold, row.call, row.all_in];
      const keys = ["hand", "fold", "call", "all_in", "all_in_size_bb"];
      if (Object.keys(row).length !== keys.length || !keys.every(k => Object.hasOwn(row, k)) ||
          !frequencies.every(n => Number.isFinite(n) && n >= 0 && n <= 100) ||
          Math.abs(frequencies.reduce((a, b) => a + b, 0) - 100) > 1e-6 ||
          row.all_in_size_bb !== (row.all_in > 0 ? 100 : null) ||
          (entry.three_bet > 0 && entry.three_bet_size_bb !== spot.three_bet_size_bb) ||
          (entry.three_bet === 0 && (row.fold !== 100 || row.call !== 0 || row.all_in !== 0))) fail(`${spot.id} / ${row.hand}`);
    }
  }
  return data;
}

export function findFourBetSpot(data, opener, hero) {
  const spot = data.spots.find(s => s.opener === opener && s.hero === hero);
  if (!spot) throw new Error("この組み合わせの4bet後の応答はありません。");
  return spot;
}

export function fourBetMatrixModel(spot, source) {
  return {
    actions: ["all_in", "call", "fold"],
    actionLabels: { all_in: "オールイン 100BB" },
    aggregates: new Map(spot.hands.map(row => {
      const entry = source.hands.find(r => r.hand === row.hand);
      if (!entry) throw new Error(`3bet到達データがありません: ${row.hand}`);
      const unreachable = entry.three_bet === 0;
      return [row.hand, {
        hand: row.hand, comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
        unreachable,
        // A fold=100 placeholder is not a recommended action.
        actions: unreachable ? {} : { all_in: row.all_in / 100, call: row.call / 100, fold: row.fold / 100 },
      }];
    })),
  };
}

export function loadFourBetDataset(raw, responses, previous, openings) {
  if (raw === undefined) return { error: "4bet後の応答データなし。保存済みJSONがありません。" };
  try {
    return { data: validateFourBetDataset(JSON.parse(raw), responses, previous, openings) };
  } catch (error) {
    return { error: `4bet後の応答を表示できません。${error.message}` };
  }
}
