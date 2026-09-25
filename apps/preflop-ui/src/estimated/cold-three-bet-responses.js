import { hands } from "../data.js";
import { effectiveStackBb, fourBetToSize, openSizeBb, openSizeFor, positions, threeBetToSize } from "./sizing.js";
import { hasConfiguredRake } from "./rake.js";

// A later seat's first decision facing a 3bet it has not yet acted on:
// O opens → everyone between folds → X 3bets → everyone between X and Y folds →
// Y (hero) folds, cold-calls or cold-4bets. O and any seats after Y are still to act.
// (O, X) are the heads-up open-response spots with at least one seat behind X
// (X = HJ / CO / BTN / SB; BB has nobody behind). Stored order: opener, then
// 3bettor, then hero, each in seat order.
const RFI_SEATS = positions.slice(0, 4);
export const coldThreeBetSpots = RFI_SEATS.flatMap(opener => positions.slice(positions.indexOf(opener) + 1, -1)
  .flatMap(threeBettor => positions.slice(positions.indexOf(threeBettor) + 1).map(hero => ({
    id: `${hero}_vs_${threeBettor}_3bet_${opener}open`,
    hero, opener, three_bettor: threeBettor,
    source_response_id: `${threeBettor}_vs_${opener}`,
  }))));
const ROW_KEYS = ["hand", "fold", "call", "four_bet", "four_bet_size_bb"];

export function validateColdThreeBetDataset(data, responses) {
  const fail = detail => { throw new Error(`3betへのコールド応答データが不正です: ${detail}`); };
  if (data?.metadata?.schema_version !== "1.0" ||
      data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" ||
      data.metadata.effective_stack_bb !== effectiveStackBb ||
      data.metadata.open_size_bb !== openSizeBb || data.metadata.ante_bb !== 0 ||
      !hasConfiguredRake(data.metadata) ||
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify(["fold", "call", "four_bet"]) ||
      data.spot_count !== coldThreeBetSpots.length || data.hand_classes_per_spot !== hands.length ||
      data.entry_count !== coldThreeBetSpots.length * hands.length ||
      !Array.isArray(data.spots) || data.spots.length !== coldThreeBetSpots.length) fail("メタデータ・局面数");

  for (let i = 0; i < coldThreeBetSpots.length; i += 1) {
    const expected = coldThreeBetSpots[i];
    const spot = data.spots[i];
    const source = responses?.spots?.find(s => s.id === expected.source_response_id);
    if (responses && (!source || source.opener !== expected.opener || source.hero !== expected.three_bettor ||
        !source.hands.some(row => row.three_bet > 0))) fail(`3bet元がありません: ${expected.source_response_id}`);
    const threeBet = threeBetToSize(expected.opener, expected.three_bettor);
    const size = fourBetToSize(expected.hero, expected.three_bettor);
    if (!spot || Object.entries(expected).some(([key, value]) => spot[key] !== value) ||
        spot.open_size_bb !== openSizeFor(expected.opener) || spot.three_bet_size_bb !== threeBet ||
        (source && (source.three_bet_size_bb !== threeBet || (source.open_size_bb ?? openSizeFor(expected.opener)) !== spot.open_size_bb)) ||
        spot.four_bet_size_bb !== size || !(size > threeBet && size < effectiveStackBb) ||
        spot.effective_stack_bb !== effectiveStackBb ||
        !Array.isArray(spot.hands) || spot.hands.length !== hands.length) fail(`局面・サイズ: ${spot?.id ?? expected.id}`);
    // Y has not acted yet: every hand class reaches, so there are no placeholders.
    for (let j = 0; j < hands.length; j += 1) {
      const row = spot.hands[j];
      if (row?.hand !== hands[j] || Object.keys(row).length !== ROW_KEYS.length ||
          !ROW_KEYS.every(key => Object.hasOwn(row, key)) ||
          ![row.fold, row.call, row.four_bet].every(value => Number.isInteger(value) && value >= 0 && value <= 100) ||
          row.fold + row.call + row.four_bet !== 100 ||
          row.four_bet_size_bb !== (row.four_bet > 0 ? size : null)) fail(`${spot.id} / ${hands[j]}`);
    }
  }
  return data;
}

export function findColdThreeBetSpot(data, { opener, threeBettor, hero }) {
  const spot = data?.spots?.find(item => item.opener === opener && item.three_bettor === threeBettor && item.hero === hero);
  if (!spot) throw new Error("この組み合わせの3betへのコールド応答はありません。");
  return spot;
}

export function coldThreeBetMatrixModel(spot) {
  return {
    actions: ["raise_four_bet", "call", "fold"],
    actionLabels: { raise_four_bet: `4bet ${spot.four_bet_size_bb}BB` },
    aggregates: new Map(spot.hands.map(row => [row.hand, {
      hand: row.hand,
      comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
      actions: { raise_four_bet: row.four_bet / 100, call: row.call / 100, fold: row.fold / 100 },
    }])),
  };
}
