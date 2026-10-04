import { hands } from "../data.ts";
import { hasConfiguredRake } from "./rake.ts";
import { continuationFamilies, continuationSpots } from "./continuation-tree.ts";
import { createContinuationModel } from "./continuation-model.ts";
import { validateOpeningDataset } from "./opening-ranges.ts";
import { validateDataset } from "./ranges.ts";
import { validateMultiwayDataset } from "./multiway-responses.ts";
import { validateMultiway2Dataset } from "./multiway2-responses.ts";
import { validateSqueezeDataset } from "./squeeze-responses.ts";
import { validateColdThreeBetDataset } from "./cold-three-bet-responses.ts";
import { validateColdFourBetDataset } from "./cold-four-bet-responses.ts";

export const CONTINUATION_ACTIONS = ["fold", "call", "four_bet", "all_in"];
const rowKeys = ["hand", ...CONTINUATION_ACTIONS, "raise_to_size_bb"];
export function validateContinuationSources(data) {
  const opening = data["opening-ranges"], responses = data["preflop-ranges"], multiway = data["multiway-responses"],
    multiway2 = data["multiway2-responses"], squeezes = data["squeeze-responses"],
    coldThreeBets = data["cold-three-bet-responses"], coldFourBets = data["cold-four-bet-responses"];
  validateOpeningDataset(opening); validateDataset(responses);
  validateMultiwayDataset(multiway, responses);
  validateMultiway2Dataset(multiway2, multiway, responses, opening);
  validateSqueezeDataset(squeezes, multiway, responses, opening);
  validateColdThreeBetDataset(coldThreeBets, responses);
  validateColdFourBetDataset(coldFourBets, coldThreeBets, responses, opening);
}
export function validateContinuationDataset(data, datasets, { allowPartial = false } = {}) {
  const fail = message => { throw new Error(`Invalid continuation data: ${message}`); };
  const families = data?.metadata?.families;
  if (!Array.isArray(families) || !families.length || new Set(families).size !== families.length ||
      families.some(f => !continuationFamilies.includes(f)) ||
      (!allowPartial && JSON.stringify(families) !== JSON.stringify(continuationFamilies))) fail("families");
  const expected = continuationSpots.filter(node => families.includes(node.family));
  if (data.metadata.schema_version !== "1.0" || data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" || data.metadata.open_size_bb !== 2.5 ||
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify(CONTINUATION_ACTIONS) ||
      data.metadata.effective_stack_bb !== 100 || data.metadata.ante_bb !== 0 || !hasConfiguredRake(data.metadata) ||
      data.spot_count !== expected.length || data.hand_classes_per_spot !== 169 || data.entry_count !== expected.length * 169 ||
      !Array.isArray(data.spots) || data.spots.length !== expected.length) fail("metadata/counts");
  validateContinuationSources(datasets);
  const model = createContinuationModel(datasets);
  for (let i = 0; i < expected.length; i++) {
    const node = expected[i], spot = data.spots[i];
    if (!spot || Object.entries(node).some(([key, value]) => JSON.stringify(spot[key]) !== JSON.stringify(value))) fail(`history/source/geometry ${node.id}`);
    const context = model.context(node, spot);
    if (spot.unreachable !== context.unreachable || !Array.isArray(spot.hands) || spot.hands.length !== hands.length) fail(`reach/hands ${node.id}`);
    for (let j = 0; j < hands.length; j++) {
      const row = spot.hands[j];
      if (row?.hand !== hands[j] || Object.keys(row).length !== rowKeys.length || rowKeys.some(key => !Object.hasOwn(row, key)) ||
          CONTINUATION_ACTIONS.some(a => !Number.isInteger(row[a]) || row[a] < 0 || row[a] > 100) ||
          CONTINUATION_ACTIONS.reduce((sum, a) => sum + row[a], 0) !== 100 ||
          CONTINUATION_ACTIONS.some(a => !node.legal_actions.includes(a) && row[a] !== 0)) fail(`actions ${node.id}/${hands[j]}`);
      const raise = row.four_bet ? node.action_sizes_bb.four_bet : row.all_in ? node.action_sizes_bb.all_in : null;
      if (row.raise_to_size_bb !== raise || raise !== null && (raise < node.minimum_raise_to_bb || raise > 100) ||
          context.reach(row.hand) === 0 && row.fold !== 100) fail(`size/flow ${node.id}/${row.hand}`);
    }
    model.register(spot);
  }
  return data;
}

export function findContinuationSpot(data, id) {
  const spot = data?.spots?.find(item => item.id === id);
  if (!spot) throw new Error(`No saved continuation for ${id}`);
  return spot;
}
