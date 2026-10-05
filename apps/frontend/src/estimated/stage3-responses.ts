import { hands } from "../data.ts";
import { hasConfiguredRake } from "./rake.ts";
import { stage3ById, stage3Families, stage3Spots, stage3RootById, stage3Roots } from "./stage3-tree.ts";
import { createStage3Model, MissingStage3SourceError } from "./stage3-model.ts";
import { validateContinuationSources, validateContinuationDataset } from "./continuation-responses.ts";
export const STAGE3_ACTIONS = ["fold", "call", "squeeze", "four_bet", "all_in"];
const rowKeys = ["hand", ...STAGE3_ACTIONS, "raise_to_size_bb"];
export function validateStage3Sources(data) {
  validateContinuationSources(data);
  if (!data["continuation-responses"]) throw new Error("Stage3 requires the unchanged reviewed Stage2 continuation snapshot for fold boundaries");
  validateContinuationDataset(data["continuation-responses"], data);
}
export function validateStage3Dataset(data, datasets, { allowPartial = false } = {}) {
  const fail = message => { throw new Error(`Invalid stage3 data: ${message}`); };
  const families = data?.metadata?.families;
  if (!Array.isArray(families) || !families.length || new Set(families).size !== families.length ||
      families.some(f => !stage3Families.includes(f)) ||
      (!allowPartial && JSON.stringify(families) !== JSON.stringify(stage3Families))) fail("families");
  const rootIds = data.metadata.root_ids;
  if (rootIds && (!allowPartial || !Array.isArray(rootIds) || !rootIds.length || new Set(rootIds).size !== rootIds.length || rootIds.some(id => !stage3Roots.some(root => root.id === id && families.includes(root.family))))) fail("partial root selection");
  const expected = stage3Spots.filter(node => families.includes(node.family) && (!rootIds || rootIds.includes(node.root_id)));
  const sparse = data.metadata.schema_version === "1.0" && data.metadata.storage === "reachable-nonrare-only";
  if (!sparse || data.metadata.strategy_type !== "ai_estimate_not_gto" ||
      data.metadata.game !== "6max Cash / No-Limit Texas Holdem" || data.metadata.open_size_bb !== 2.5 ||
      JSON.stringify(data.metadata.legal_actions) !== JSON.stringify(STAGE3_ACTIONS) ||
      data.metadata.effective_stack_bb !== 100 || data.metadata.ante_bb !== 0 || !hasConfiguredRake(data.metadata) ||
      !Number.isSafeInteger(data.omitted_unreachable_count) || data.omitted_unreachable_count < 0 || !Number.isSafeInteger(data.omitted_rare_count) || data.omitted_rare_count < 0 ||
      !Array.isArray(data.spots) || data.spot_count !== data.spots.length || data.hand_classes_per_spot !== 169 || data.entry_count !== data.spot_count * 169 ||
      (sparse ? data.catalog_spot_count !== expected.length || data.omitted_unreachable_count + data.omitted_rare_count !== expected.length - data.spot_count : data.spot_count !== expected.length)) fail("metadata/counts");
  validateStage3Sources(datasets);
  const model = createStage3Model(datasets);
  let storedIndex = 0, rareCount = 0, impossibleCount = 0;
  for (const node of expected) {
    const spot = data.spots[storedIndex];
    if (sparse && spot?.id !== node.id) {
      if (model.rootEvidence(stage3RootById.get(node.root_id)).rare) { rareCount++; continue; }
      if (!model.context(node).unreachable) fail(`missing reachable history ${node.id}`);
      impossibleCount++;
      // Do not register a guessed policy. Any later reference re-proves that
      // this absent ancestor is impossible from its exact source actions.
      continue;
    }
    storedIndex++;
    if (!spot || Object.entries(node).some(([key, value]) => JSON.stringify(spot[key]) !== JSON.stringify(value))) fail(`history/source/geometry ${node.id}`);
    const context = model.context(node, spot);
    if (sparse && context.unreachable) fail(`stored impossible history ${node.id}`);
    if (spot.unreachable !== context.unreachable || !Array.isArray(spot.hands) || spot.hands.length !== hands.length) fail(`reach/hands ${node.id}`);
    for (let j = 0; j < hands.length; j++) {
      const row = spot.hands[j];
      if (row?.hand !== hands[j] || Object.keys(row).length !== rowKeys.length || rowKeys.some(key => !Object.hasOwn(row, key)) ||
          STAGE3_ACTIONS.some(a => !Number.isInteger(row[a]) || row[a] < 0 || row[a] > 100) ||
          STAGE3_ACTIONS.reduce((sum, a) => sum + row[a], 0) !== 100 ||
          STAGE3_ACTIONS.some(a => !node.legal_actions.includes(a) && row[a] !== 0)) fail(`actions ${node.id}/${hands[j]}`);
      const raise = row.squeeze ? node.action_sizes_bb.squeeze : row.four_bet ? node.action_sizes_bb.four_bet : row.all_in ? node.action_sizes_bb.all_in : null;
      if (row.raise_to_size_bb !== raise || raise !== null && (raise < node.minimum_raise_to_bb || raise > 100) ||
          context.reach(row.hand) === 0 && row.fold !== 100) fail(`size/flow ${node.id}/${row.hand}`);
    }
    model.register(spot);
  }
  if (rareCount !== data.omitted_rare_count || impossibleCount !== data.omitted_unreachable_count) fail("omission classifications");
  if (storedIndex !== data.spots.length) fail("unexpected/duplicate/out-of-order histories");
  return data;
}

export function findStage3Spot(data, id, datasets) {
  const spot = data?.spots?.find(item => item.id === id);
  if (spot) return spot;
  const node = stage3ById.get(id);
  if (!node || node.reused || !datasets) throw new Error(`No saved stage3 for ${id}`);
  return createStage3Model({ ...datasets, "stage3-responses": data }).resolveSpot(node);
}

// Read-only runtime classification. An absent publication or reachable ancestor
// stays missing; only exact source support can prove an impossible history.
export function stage3Availability(data, datasets, id, model = createStage3Model({ ...datasets, "stage3-responses": data })) {
  const node = stage3ById.get(id);
  if (!node || node.reused) throw new Error(`Unknown stage3 ${id}`);
  const spot = data?.spots?.find(item => item.id === id);
  try {
    const evidence = model.rootEvidence(stage3RootById.get(node.root_id));
    if (evidence.rare) return { status: "rare", spot: null, reach: evidence };
    const context = model.context(node, spot ?? node);
    if (context.unreachable) return { status: "unreachable", spot: null };
    return spot ? { status: "saved", spot } : { status: "missing", spot: null, source: `stage3-responses/${id}` };
  } catch (error) {
    if (error instanceof MissingStage3SourceError) return { status: "missing", spot: null, source: error.sourceKey };
    throw error; // malformed sources are errors, never guessed reachability
  }
}
