import { hands } from "../data.js";
import { effectiveStackBb, openSizeBb, threeBetToSize } from "./sizing.js";
import { hasConfiguredRake } from "./rake.js";

export const multiwayMatchups = [
  ["UTG", "HJ"], ["UTG", "CO"], ["UTG", "BTN"],
  ["HJ", "CO"], ["HJ", "BTN"], ["CO", "BTN"],
];
// Stored order: the six BB spots, then the six SB spots (SB acts with BB still behind).
export const multiwayHeroes = ["BB", "SB"];
export const multiwaySpots = multiwayHeroes.flatMap(hero => multiwayMatchups.map(([opener, caller]) => ({ hero, opener, caller })));

export function validateMultiwayDataset(data) {
  const fail = detail => { throw new Error(`マルチウェイ応答データが不正です: ${detail}`); };
  if (data?.metadata?.schema_version !== "1.0" ||
      data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" ||
      data.metadata.effective_stack_bb !== effectiveStackBb ||
      data.metadata.open_size_bb !== openSizeBb || data.metadata.ante_bb !== 0 ||
      !hasConfiguredRake(data.metadata) ||
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify(["fold", "call", "squeeze"]) ||
      data.spot_count !== multiwaySpots.length || data.hand_classes_per_spot !== hands.length ||
      data.entry_count !== multiwaySpots.length * hands.length ||
      !Array.isArray(data.spots) || data.spots.length !== multiwaySpots.length) fail("メタデータ・局面数");

  for (let i = 0; i < multiwaySpots.length; i += 1) {
    const { hero, opener, caller } = multiwaySpots[i];
    const spot = data.spots[i];
    const size = threeBetToSize(opener, hero, 1);
    if (spot?.id !== `${hero}_vs_${opener}_${caller}call` || spot.opener !== opener ||
        !Array.isArray(spot.callers) || spot.callers.length !== 1 || spot.callers[0] !== caller ||
        spot.hero !== hero || spot.open_size_bb !== openSizeBb ||
        spot.squeeze_size_bb !== size || spot.effective_stack_bb !== effectiveStackBb ||
        !Array.isArray(spot.hands) || spot.hands.length !== hands.length) fail(`局面・サイズ: ${spot?.id ?? i}`);
    for (let j = 0; j < hands.length; j += 1) {
      const row = spot.hands[j];
      if (row?.hand !== hands[j] ||
          Object.keys(row).length !== 5 ||
          !["hand", "fold", "call", "squeeze", "squeeze_size_bb"].every(key => Object.hasOwn(row, key)) ||
          ![row.fold, row.call, row.squeeze].every(value => Number.isInteger(value) && value >= 0 && value <= 100) ||
          row.fold + row.call + row.squeeze !== 100 ||
          row.squeeze_size_bb !== (row.squeeze > 0 ? size : null)) fail(`${spot.id} / ${hands[j]}`);
    }
  }
  return data;
}

export function findMultiwaySpot(data, opener, caller, hero = "BB") {
  const spot = data?.spots?.find(item => item.opener === opener && item.callers?.length === 1 && item.callers[0] === caller && item.hero === hero);
  if (!spot) throw new Error(`この組み合わせの${hero}マルチウェイ応答はありません。`);
  return spot;
}

export function multiwayMatrixModel(spot) {
  return {
    actions: ["squeeze", "call", "fold"],
    actionLabels: { squeeze: `スクイーズ ${spot.squeeze_size_bb}BB` },
    aggregates: new Map(spot.hands.map(row => [row.hand, {
      hand: row.hand,
      comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
      actions: { squeeze: row.squeeze / 100, call: row.call / 100, fold: row.fold / 100 },
    }])),
  };
}
