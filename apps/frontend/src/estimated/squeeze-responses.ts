import { hands } from "../data.ts";
import { effectiveStackBb, fourBetToSize, openSizeBb } from "./sizing.ts";
import { hasConfiguredRake } from "./rake.ts";
import { multiwaySpots } from "./multiway-responses.ts";

// Responses after BB or SB squeezes an open plus one cold call (SB squeeze: BB folded).
//   prior_action null:   the opener responds, the caller still behind
//   prior_action "fold": the caller responds after the opener folded
//   prior_action "call": the caller responds after the opener called (three-way)
// Stored order: all 12 opener spots, then 12 caller-after-fold, then 12 caller-after-call,
// each following multiway-responses.json's order.
export const squeezePriorActions = [null, "fold", "call"];
export const squeezeResponseSpots = squeezePriorActions.flatMap(prior => multiwaySpots.map(({ hero: squeezer, opener, caller }) => ({
  id: prior === null ? `${opener}_vs_${squeezer}_squeeze_${caller}call` : `${caller}_vs_${squeezer}_squeeze_${opener}${prior}`,
  hero: prior === null ? opener : caller,
  opener, caller, squeezer, prior_action: prior,
  source_squeeze_id: `${squeezer}_vs_${opener}_${caller}call`,
})));
const ROW_KEYS = ["hand", "fold", "call", "four_bet", "four_bet_size_bb"];

export function validateSqueezeDataset(data, multiway, responses, openings) {
  const fail = detail => { throw new Error(`スクイーズ後の応答データが不正です: ${detail}`); };
  if (data?.metadata?.schema_version !== "1.0" ||
      data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" ||
      data.metadata.effective_stack_bb !== effectiveStackBb ||
      data.metadata.open_size_bb !== openSizeBb || data.metadata.ante_bb !== 0 ||
      !hasConfiguredRake(data.metadata) ||
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify(["fold", "call", "four_bet"]) ||
      data.spot_count !== squeezeResponseSpots.length || data.hand_classes_per_spot !== hands.length ||
      data.entry_count !== squeezeResponseSpots.length * hands.length ||
      !Array.isArray(data.spots) || data.spots.length !== squeezeResponseSpots.length) fail("メタデータ・局面数");

  for (let i = 0; i < squeezeResponseSpots.length; i += 1) {
    const expected = squeezeResponseSpots[i];
    const spot = data.spots[i];
    const source = multiway?.spots?.find(s => s.id === expected.source_squeeze_id);
    if (!source || !source.hands.some(row => row.squeeze > 0)) fail(`スクイーズ元がありません: ${expected.source_squeeze_id}`);
    const size = fourBetToSize(expected.hero, expected.squeezer);
    if (!spot || Object.entries(expected).some(([key, value]) => spot[key] !== value) ||
        spot.open_size_bb !== source.open_size_bb || spot.squeeze_size_bb !== source.squeeze_size_bb ||
        spot.four_bet_size_bb !== size || !(size > spot.squeeze_size_bb && size < effectiveStackBb) ||
        spot.effective_stack_bb !== effectiveStackBb ||
        !Array.isArray(spot.hands) || spot.hands.length !== hands.length) fail(`局面・サイズ: ${spot?.id ?? expected.id}`);
    // Reachability: the opener's RFI, or the caller's cold-call frequency.
    const reach = expected.prior_action === null
      ? openings?.spots?.find(s => s.hero === expected.opener)
      : responses?.spots?.find(s => s.opener === expected.opener && s.hero === expected.caller);
    const reachBy = reach ? new Map(reach.hands.map(row => [row.hand, expected.prior_action === null ? row.open : row.call])) : null;
    if ((openings || responses) && !reachBy) fail(`前段の局面がありません: ${spot.id}`);
    for (let j = 0; j < hands.length; j += 1) {
      const row = spot.hands[j];
      if (row?.hand !== hands[j] || Object.keys(row).length !== ROW_KEYS.length ||
          !ROW_KEYS.every(key => Object.hasOwn(row, key)) ||
          ![row.fold, row.call, row.four_bet].every(value => Number.isInteger(value) && value >= 0 && value <= 100) ||
          row.fold + row.call + row.four_bet !== 100 ||
          row.four_bet_size_bb !== (row.four_bet > 0 ? size : null) ||
          (reachBy && reachBy.get(row.hand) === 0 && row.fold !== 100)) fail(`${spot.id} / ${hands[j]}`);
    }
  }
  return data;
}

export function findSqueezeSpot(data, { opener, caller, squeezer, priorAction = null }) {
  const spot = data?.spots?.find(item => item.opener === opener && item.caller === caller &&
    item.squeezer === squeezer && item.prior_action === priorAction);
  if (!spot) throw new Error("この組み合わせのスクイーズ後の応答はありません。");
  return spot;
}

export function squeezeMatrixModel(spot) {
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
