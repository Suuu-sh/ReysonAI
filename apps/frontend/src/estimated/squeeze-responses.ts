import type { FrequencySpot, PreflopAction } from "./preflop-types.ts";
import type { MultiwayDataset, OpeningDataset, ResponseDataset, SqueezeDataset, SqueezeSpot } from "./preflop-types.ts";
import type { MatrixModel } from "../data.ts";
import { hands } from "../data.ts";
import { effectiveStackBb, squeezeFourBetToSize, openSizeBb, threeBetToSize } from "./sizing.ts";
import { hasConfiguredRake } from "./rake.ts";
import { multiwaySpots } from "./multiway-responses.ts";

// Responses after a later seat squeezes an open plus one cold call.
// Every seat behind the squeezer folds before the opener responds.
//   prior_action null:   the opener responds, the caller still behind
//   prior_action "fold": the caller responds after the opener folded
//   prior_action "call": the caller responds after the opener called (three-way)
// Stored order: all 20 opener spots, then 20 caller-after-fold, then 20 caller-after-call,
// each following multiway-responses.json's order (the original twelve histories first).
export const squeezePriorActions = [null, "fold", "call"];
export const squeezeResponseSpots = squeezePriorActions.flatMap(prior => multiwaySpots.map(({ hero: squeezer, opener, caller }) => ({
  id: prior === null ? `${opener}_vs_${squeezer}_squeeze_${caller}call` : `${caller}_vs_${squeezer}_squeeze_${opener}${prior}`,
  hero: prior === null ? opener : caller,
  opener, caller, squeezer, prior_action: prior,
  source_squeeze_id: `${squeezer}_vs_${opener}_${caller}call`,
})));
const ROW_KEYS = ["hand", "fold", "call", "four_bet", "four_bet_size_bb"];

export function validateSqueezeDataset(data: SqueezeDataset, multiway: MultiwayDataset, responses: ResponseDataset, openings: OpeningDataset) {
  const fail: (detail: string) => never = detail => { throw new Error(`スクイーズ後の応答データが不正です: ${detail}`); };
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

  // Both original actions must be present and complete before a history can
  // be classified as unreachable. Missing sources must never look like 0%.
  const sourceFrequencies = <S extends FrequencySpot>(dataset: { spots: S[] }, matches: (spot: S) => boolean, action: PreflopAction, id: string) => {
    const source = dataset?.spots?.find(matches);
    if (!source || !Array.isArray(source.hands) || source.hands.length !== hands.length ||
        source.hands.some((row, j) => row?.hand !== hands[j] ||
          !Number.isInteger(row[action]!) || row[action]! < 0 || row[action]! > 100)) fail(`前段の局面がありません・不正です: ${id}`);
    return new Map(source.hands.map(row => [row.hand, row[action]!]));
  };

  for (let i = 0; i < squeezeResponseSpots.length; i += 1) {
    const expected = squeezeResponseSpots[i];
    const spot = data.spots[i];
    const source = multiway?.spots?.find(s => s.id === expected.source_squeeze_id);
    const opens = sourceFrequencies(openings, s => s.hero === expected.opener, "open", `${expected.opener}_open`);
    const calls = sourceFrequencies(responses, s => s.opener === expected.opener && s.hero === expected.caller,
      "call", `${expected.caller}_vs_${expected.opener}`);
    const historyReachable = [...opens.values()].some(value => value > 0) && [...calls.values()].some(value => value > 0);
    if (!source || source.hero !== expected.squeezer || source.opener !== expected.opener ||
        !Array.isArray(source.callers) || source.callers.length !== 1 || source.callers[0] !== expected.caller ||
        source.open_size_bb !== openSizeBb || source.squeeze_size_bb !== threeBetToSize(expected.opener, expected.squeezer, 1) ||
        !Array.isArray(source.hands) || source.hands.length !== hands.length ||
        source.hands.some((row, j) => row?.hand !== hands[j] ||
          !Number.isInteger(row.squeeze) || row.squeeze < 0 || row.squeeze > 100) ||
        (historyReachable && !source.hands.some(row => row.squeeze > 0)) ||
        (!historyReachable && source.hands.some(row => row.fold !== 100 || row.call !== 0 || row.squeeze !== 0))) {
      fail(`スクイーズ元がありません・不正です: ${expected.source_squeeze_id}`);
    }
    const size = squeezeFourBetToSize(expected.hero, expected.squeezer);
    if (!spot || Object.entries(expected).some(([key, value]) => spot[key as keyof typeof spot] !== value) ||
        (spot.unreachable === true) !== !historyReachable ||
        spot.open_size_bb !== source.open_size_bb || spot.squeeze_size_bb !== source.squeeze_size_bb ||
        spot.four_bet_size_bb !== size || !(size > spot.squeeze_size_bb && size < effectiveStackBb) ||
        size < 2 * spot.squeeze_size_bb - spot.open_size_bb ||
        spot.effective_stack_bb !== effectiveStackBb ||
        !Array.isArray(spot.hands) || spot.hands.length !== hands.length) fail(`局面・サイズ: ${spot?.id ?? expected.id}`);
    // Per-hand reach is the opener's saved RFI or caller's saved cold call.
    // A wholly unreachable original history makes all three decisions placeholders.
    const reachBy = expected.prior_action === null ? opens : calls;
    for (let j = 0; j < hands.length; j += 1) {
      const row = spot.hands[j];
      if (row?.hand !== hands[j] || Object.keys(row).length !== ROW_KEYS.length ||
          !ROW_KEYS.every(key => Object.hasOwn(row, key)) ||
          ![row.fold, row.call, row.four_bet].every(value => Number.isInteger(value) && value >= 0 && value <= 100) ||
          row.fold + row.call + row.four_bet !== 100 ||
          row.four_bet_size_bb !== (row.four_bet > 0 ? size : null) ||
          ((!historyReachable || reachBy.get(row.hand) === 0) && row.fold !== 100)) fail(`${spot.id} / ${hands[j]}`);
    }
  }
  return data;
}

export function findSqueezeSpot(data: SqueezeDataset, { opener, caller, squeezer, priorAction = null }: { opener: string; caller: string; squeezer: string; priorAction?: string | null }) {
  const spot = data?.spots?.find(item => item.opener === opener && item.caller === caller &&
    item.squeezer === squeezer && item.prior_action === priorAction);
  if (!spot) throw new Error("この組み合わせのスクイーズ後の応答はありません。");
  return spot;
}

export function squeezeMatrixModel(spot: SqueezeSpot): MatrixModel {
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
