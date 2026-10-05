import type { ContinuationDataset, ContinuationSourceDatasets } from "./preflop-types.ts";
import type { ContinuationAction, ContinuationFamily } from "./continuation-tree.ts";
import { hands } from "../data.ts";
import { hasConfiguredRake } from "./rake.ts";
import { continuationById, continuationFamilies, continuationSpots } from "./continuation-tree.ts";
import { createContinuationModel, MissingContinuationSourceError } from "./continuation-model.ts";
import { validateOpeningDataset } from "./opening-ranges.ts";
import { validateDataset } from "./ranges.ts";
import { validateMultiwayDataset } from "./multiway-responses.ts";
import { validateMultiway2Dataset } from "./multiway2-responses.ts";
import { validateSqueezeDataset } from "./squeeze-responses.ts";
import { validateColdThreeBetDataset } from "./cold-three-bet-responses.ts";
import { validateColdFourBetDataset } from "./cold-four-bet-responses.ts";

export const CONTINUATION_ACTIONS: readonly ContinuationAction[] = ["fold", "call", "four_bet", "all_in"];
const rowKeys = ["hand", ...CONTINUATION_ACTIONS, "raise_to_size_bb"];
export function validateContinuationSources(data: ContinuationSourceDatasets) {
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
export function validateContinuationDataset(data: ContinuationDataset, datasets: ContinuationSourceDatasets, { allowPartial = false } = {}) {
  const fail: (message: string) => never = message => { throw new Error(`Invalid continuation data: ${message}`); };
  const families = data?.metadata?.families;
  if (!Array.isArray(families) || !families.length || new Set(families).size !== families.length ||
      families.some(f => !continuationFamilies.includes(f as ContinuationFamily)) ||
      (!allowPartial && JSON.stringify(families) !== JSON.stringify(continuationFamilies))) fail("families");
  const expected = continuationSpots.filter(node => families.includes(node.family));
  const sparse = data.metadata.schema_version === "1.1" && data.metadata.storage === "reachable-only";
  if ((!sparse && data.metadata.schema_version !== "1.0") || data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" || data.metadata.open_size_bb !== 2.5 ||
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify(CONTINUATION_ACTIONS) ||
      data.metadata.effective_stack_bb !== 100 || data.metadata.ante_bb !== 0 || !hasConfiguredRake(data.metadata) ||
      !Array.isArray(data.spots) || data.spot_count !== data.spots.length || data.hand_classes_per_spot !== 169 || data.entry_count !== data.spot_count * 169 ||
      (sparse ? data.catalog_spot_count !== expected.length || data.omitted_unreachable_count !== expected.length - data.spot_count : data.spot_count !== expected.length)) fail("metadata/counts");
  validateContinuationSources(datasets);
  const model = createContinuationModel(datasets);
  let storedIndex = 0;
  for (const node of expected) {
    const spot = data.spots[storedIndex];
    if (sparse && spot?.id !== node.id) {
      if (!model.context(node).unreachable) fail(`missing reachable history ${node.id}`);
      // Do not register a guessed policy. Any later reference re-proves that
      // this absent ancestor is impossible from its exact source actions.
      continue;
    }
    storedIndex++;
    if (!spot || Object.entries(node).some(([key, value]) => JSON.stringify(spot[key as keyof typeof spot]) !== JSON.stringify(value))) fail(`history/source/geometry ${node.id}`);
    const context = model.context(node, spot);
    if (sparse && context.unreachable) fail(`stored impossible history ${node.id}`);
    if (spot.unreachable !== context.unreachable || !Array.isArray(spot.hands) || spot.hands.length !== hands.length) fail(`reach/hands ${node.id}`);
    for (let j = 0; j < hands.length; j++) {
      const row = spot.hands[j];
      if (row?.hand !== hands[j] || Object.keys(row).length !== rowKeys.length || rowKeys.some(key => !Object.hasOwn(row, key)) ||
          CONTINUATION_ACTIONS.some(a => !Number.isInteger(row[a]) || row[a] < 0 || row[a] > 100) ||
          CONTINUATION_ACTIONS.reduce((sum, a) => sum + row[a], 0) !== 100 ||
          CONTINUATION_ACTIONS.some(a => !node.legal_actions.includes(a) && row[a] !== 0)) fail(`actions ${node.id}/${hands[j]}`);
      const raise = row.four_bet ? node.action_sizes_bb.four_bet : row.all_in ? node.action_sizes_bb.all_in : null;
      if (row.raise_to_size_bb !== raise || raise !== null && (raise! < node.minimum_raise_to_bb! || raise > 100) ||
          context.reach(row.hand) === 0 && row.fold !== 100) fail(`size/flow ${node.id}/${row.hand}`);
    }
    model.register(spot);
  }
  if (storedIndex !== data.spots.length) fail("unexpected/duplicate/out-of-order histories");
  return data;
}

export function findContinuationSpot(data: ContinuationDataset | null | undefined, id: string, datasets?: ContinuationSourceDatasets) {
  const spot = data?.spots?.find(item => item.id === id);
  if (spot) return spot;
  const node = continuationById.get(id);
  if (!node || node.reused || !datasets) throw new Error(`No saved continuation for ${id}`);
  return createContinuationModel({ ...datasets, "continuation-responses": data }).resolveSpot(node);
}

// Keep the catalog complete while storing only histories with nonzero support.
// Validation proves every omission; filtering a corrupt reachable row must fail.
export function compactContinuationDataset(data: ContinuationDataset, datasets: ContinuationSourceDatasets) {
  validateContinuationDataset(data, datasets, { allowPartial: true });
  const spots = data.spots.filter(spot => !spot.unreachable);
  const catalogCount = continuationSpots.filter(node => data.metadata.families.includes(node.family)).length;
  const compact = { ...data, metadata: { ...data.metadata, schema_version: "1.1", storage: "reachable-only" },
    catalog_spot_count: catalogCount, omitted_unreachable_count: catalogCount - spots.length,
    spot_count: spots.length, entry_count: spots.length * 169, spots };
  return validateContinuationDataset(compact, datasets, { allowPartial: true });
}

// Read-only runtime classification. An absent publication or reachable ancestor
// stays missing; only exact source support can prove an impossible history.
export function continuationAvailability(data: ContinuationDataset | null | undefined, datasets: ContinuationSourceDatasets, id: string, model = createContinuationModel({ ...datasets, "continuation-responses": data })) {
  const node = continuationById.get(id);
  if (!node || node.reused) throw new Error(`Unknown continuation ${id}`);
  const spot = data?.spots?.find(item => item.id === id);
  try {
    const context = model.context(node, spot ?? node);
    if (context.unreachable) return { status: "unreachable", spot: null };
    return spot ? { status: "saved", spot } : { status: "missing", spot: null, source: `continuation-responses/${id}` };
  } catch (error) {
    if (error instanceof MissingContinuationSourceError) return { status: "missing", spot: null, source: error.sourceKey };
    throw error; // malformed sources are errors, never guessed reachability
  }
}
