import { hands } from "../data.ts";
import { validateDataset } from "./ranges.ts";
import { validateOpeningDataset } from "./opening-ranges.ts";
import { coldThreeBetSpots, validateColdThreeBetDataset } from "./cold-three-bet-responses.ts";
import { effectiveStackBb, fiveBetToSize, fourBetToSize, openSizeBb, openSizeFor, threeBetToSize } from "./sizing.ts";
import { hasConfiguredRake } from "./rake.ts";

// O opens → X 3bets → Y cold-4bets; all other seats fold. Only these two
// decisions are saved: O with X still behind, then X after O folds. O calling
// or shoving does not select the second range and has no saved continuation.
// Ordering matches the coverage catalog: two responses per cold-3bet source.
export const coldFourBetSpots = coldThreeBetSpots.flatMap(source => [null, "fold"].map(prior => ({
  id: prior === null
    ? `${source.opener}_vs_${source.hero}_cold4bet_${source.three_bettor}3bet`
    : `${source.three_bettor}_vs_${source.hero}_cold4bet_${source.opener}open`,
  hero: prior === null ? source.opener : source.three_bettor,
  opener: source.opener,
  three_bettor: source.three_bettor,
  four_bettor: source.hero,
  prior_action: prior,
  source_opening_id: `${source.opener}_open`,
  source_response_id: source.source_response_id,
  source_cold_three_bet_id: source.id,
})));
const ROW_KEYS = ["hand", "fold", "call", "all_in", "all_in_size_bb"];

export function validateColdFourBetDataset(data, coldThreeBets, responses, openings) {
  const fail = detail => { throw new Error(`コールド4bet後の応答データが不正です: ${detail}`); };
  // All three sources are mandatory. Never interpret absent/malformed source
  // rows as zero reach or quietly accept a mismatched preceding history.
  try {
    validateDataset(responses);
    validateOpeningDataset(openings);
    validateColdThreeBetDataset(coldThreeBets, responses);
  } catch (error) {
    fail(`前段データ: ${error.message}`);
  }
  if (data?.metadata?.schema_version !== "1.0" ||
      data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" ||
      data.metadata.effective_stack_bb !== effectiveStackBb ||
      data.metadata.open_size_bb !== openSizeBb || data.metadata.ante_bb !== 0 ||
      !hasConfiguredRake(data.metadata) || fiveBetToSize() !== effectiveStackBb ||
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify(["fold", "call", "all_in"]) ||
      data.spot_count !== coldFourBetSpots.length || data.hand_classes_per_spot !== hands.length ||
      data.entry_count !== coldFourBetSpots.length * hands.length ||
      !Array.isArray(data.spots) || data.spots.length !== coldFourBetSpots.length) fail("メタデータ・局面数");

  for (let i = 0; i < coldFourBetSpots.length; i += 1) {
    const expected = coldFourBetSpots[i];
    const spot = data.spots[i];
    const opening = openings.spots.find(s => s.id === expected.source_opening_id);
    const response = responses.spots.find(s => s.id === expected.source_response_id);
    const source = coldThreeBets.spots.find(s => s.id === expected.source_cold_three_bet_id);
    const open = openSizeFor(expected.opener);
    const threeBet = threeBetToSize(expected.opener, expected.three_bettor);
    const fourBet = fourBetToSize(expected.four_bettor, expected.three_bettor);
    if (!opening || opening.hero !== expected.opener || opening.open_size_bb !== open ||
        !response || response.opener !== expected.opener || response.hero !== expected.three_bettor ||
        response.open_size_bb !== open || response.three_bet_size_bb !== threeBet ||
        !source || source.opener !== expected.opener || source.three_bettor !== expected.three_bettor ||
        source.hero !== expected.four_bettor || source.source_response_id !== response.id ||
        source.open_size_bb !== open || source.three_bet_size_bb !== threeBet || source.four_bet_size_bb !== fourBet ||
        !opening.hands.some(row => row.open > 0) || !response.hands.some(row => row.three_bet > 0) ||
        !source.hands.some(row => row.four_bet > 0) ||
        opening.hands.some(row => !Number.isInteger(row.open)) || response.hands.some(row => !Number.isInteger(row.three_bet))) {
      fail(`前段の対応関係・到達頻度: ${expected.id}`);
    }
    if (!spot || Object.entries(expected).some(([key, value]) => spot[key] !== value) ||
        spot.open_size_bb !== open || spot.three_bet_size_bb !== threeBet || spot.four_bet_size_bb !== fourBet ||
        !(threeBet > open && fourBet > threeBet && fourBet < effectiveStackBb) ||
        // A full cold 4bet must at least repeat X's last raise increment.
        fourBet < 2 * threeBet - open || effectiveStackBb < 2 * fourBet - threeBet ||
        spot.all_in_size_bb !== effectiveStackBb || spot.effective_stack_bb !== effectiveStackBb ||
        !Array.isArray(spot.hands) || spot.hands.length !== hands.length) fail(`局面・サイズ: ${spot?.id ?? expected.id}`);
    const reachRows = expected.prior_action === null ? opening.hands : response.hands;
    const reachAction = expected.prior_action === null ? "open" : "three_bet";
    const reach = new Map(reachRows.map(row => [row.hand, row[reachAction]]));
    for (let j = 0; j < hands.length; j += 1) {
      const row = spot.hands[j];
      if (row?.hand !== hands[j] || Object.keys(row).length !== ROW_KEYS.length ||
          !ROW_KEYS.every(key => Object.hasOwn(row, key)) ||
          ![row.fold, row.call, row.all_in].every(value => Number.isInteger(value) && value >= 0 && value <= 100) ||
          row.fold + row.call + row.all_in !== 100 ||
          row.all_in_size_bb !== (row.all_in > 0 ? effectiveStackBb : null) ||
          (reach.get(row.hand) === 0 && (row.fold !== 100 || row.call !== 0 || row.all_in !== 0))) {
        fail(`${spot.id} / ${hands[j]}`);
      }
    }
  }
  return data;
}

export function findColdFourBetSpot(data, { opener, threeBettor, fourBettor, priorAction = null }) {
  const spot = data?.spots?.find(item => item.opener === opener && item.three_bettor === threeBettor &&
    item.four_bettor === fourBettor && item.prior_action === priorAction);
  if (!spot) throw new Error("この履歴のコールド4bet後の応答はありません。");
  return spot;
}

export function loadColdFourBetDataset(raw, coldThreeBets, responses, openings) {
  if (raw === undefined) return { error: "コールド4bet後の応答データなし。保存済みJSONがありません。" };
  try {
    return { data: validateColdFourBetDataset(JSON.parse(raw), coldThreeBets, responses, openings) };
  } catch (error) {
    return { error: `コールド4bet後の応答を表示できません。${error.message}` };
  }
}
