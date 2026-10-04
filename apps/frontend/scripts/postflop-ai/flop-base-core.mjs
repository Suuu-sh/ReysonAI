// Shared balanced-mode base data: deterministic strategies and the exact UI fact projection.
// Offline authoring and browser fallback share this code; loading never authors a policy.
import { sha } from "./browser-inputs.mjs";
import { EVALUATOR_VERSION } from "../lib/equity.mjs";
import { DEFENCE_VERSION, FLOP_RUNOUTS } from "./defence.mjs";
import { canonicalFlop, ISOMORPHISM_VERSION, comboKey, remapFlopNode } from "./flop-isomorphism.mjs";
import { flopHistoryViews } from "./views.mjs";
import { flopUiComboFactsCanonical, averageFlopUiFacts, flopBlockerPredictors } from "./flop-ui-facts.mjs";
import { packFrame, packView, unpackFrameRow, unpackView, compactFlopBase, hydrateFrame } from "./flop-base-codec.mjs";
import { FLOP_BETS, historyFor, treeNodes } from "./tree.mjs";
import { referenceLaterPolicy } from "./later-policy.mjs";

// Version 7 normalizes impossible raises before computing defence in every
// view/facts consumer. Older cached rows must not bypass the corrected live path.
// No new bases are authored by this migration; stale bases use live computation.
export const FLOP_BASE_VERSION = 7;
const laterSizingHash = config => sha(Object.fromEntries(["later_streets", "later_raise_multiplier", "later_all_in_merge_ratio"].map(key => [key, config[key]])));

export function flopBaseIdentity(inputs, candidate, laterCandidate) {
  return { generator_version: FLOP_BASE_VERSION, isomorphism_version: ISOMORPHISM_VERSION,
    evaluator_version: EVALUATOR_VERSION,
    source_hash: inputs.fingerprint, policy_hash: candidate.metadata.policy_hash,
    later_policy_hash: sha(laterCandidate?.policy ?? referenceLaterPolicy()),
    later_sizing_hash: laterSizingHash(inputs.config), defence_version: DEFENCE_VERSION,
    defence_config_hash: sha(inputs.config.defence_realization), seed: inputs.config.seed,
    explanation_precision: 4,
    samples: { defence_runouts: FLOP_RUNOUTS } };
}

export function isFreshFlopBase(data, inputs, candidate, laterCandidate) {
  if (data?.kind !== "ai_estimate_not_gto" || data.mode !== "balanced" || data.spot !== inputs.spot.id ||
      !data.histories || !data.metadata) return false;
  const identity = flopBaseIdentity(inputs, candidate, laterCandidate);
  if (data.ev !== undefined) return false;
  return Object.keys(identity).every(key => JSON.stringify(data.metadata[key]) === JSON.stringify(identity[key]));
}

export function buildFlopBase({ board, inputs, candidate, laterCandidate }) {
  const canonical = canonicalFlop(board);
  const views = flopHistoryViews(inputs, candidate.policy, canonical.cards);
  for (const view of Object.values(views)) for (const row of view.rows) {
    if (!row.reachable) continue;
    for (const mix of [row.mix, ...row.combos.map(combo => combo.mix)]) {
      if (Object.values(mix).some(value => !Number.isFinite(value) || value < -1e-9 || value > 1 + 1e-9) ||
          Math.abs(Object.values(mix).reduce((sum, value) => sum + value, 0) - 1) > 1e-8) throw new Error(`Invalid base strategy: ${canonical.key}/${view.node}/${row.hand}`);
    }
    if (row.combos.some(combo => !Number.isFinite(combo.weight) || !Number.isFinite(combo.reachWeight) || combo.reachWeight < 0)) throw new Error("Invalid base reach weights");
  }
  const predictors = {};
  const histories = Object.fromEntries(Object.entries(views).map(([history, view]) => {
    const facts = [], averages = [];
    for (const row of view.rows) {
      const entries = row.combos.map(combo => {
        const fact = flopUiComboFactsCanonical({ boardCards: canonical.cards, node: view.node, cards: combo.cards,
          history: history ? history.split(",") : [], inputs, policy: candidate.policy });
        facts.push(fact);
        return { weight: combo.weight, facts: fact };
      });
      averages.push(entries.length ? averageFlopUiFacts(entries) : null);
    }
    predictors[history] = flopBlockerPredictors(inputs, candidate.policy, canonical.cards, history ? history.split(",") : [], view);
    return [history, { view: packView(view), combo_facts: packFrame(facts), class_facts: packFrame(averages) }];
  }));
  return compactFlopBase({ kind: "ai_estimate_not_gto", mode: "balanced", spot: inputs.spot.id, flop: canonical.key,
    metadata: flopBaseIdentity(inputs, candidate, laterCandidate), histories }, predictors);
}

const decoded = new WeakMap();
function historyData(base, key) {
  let cache = decoded.get(base);
  if (!cache) decoded.set(base, cache = new Map());
  if (cache.has(key)) return cache.get(key);
  const packed = base.histories[key];
  if (!packed) return null;
  const entry = { ...packed, combo_facts: hydrateFrame(base, packed.combo_facts), class_facts: hydrateFrame(base, packed.class_facts) };
  const view = unpackView({ ...packed.view, rows: hydrateFrame(base, packed.view.rows), combos: hydrateFrame(base, packed.view.combos) });
  const indexes = new Map();
  let index = 0;
  view.rows.forEach((row, rowIndex) => row.combos.forEach(combo => {
    indexes.set(combo.cards, { index: index++, rowIndex, weight: combo.weight });
  }));
  const result = { entry, view, indexes };
  cache.set(key, result);
  return result;
}

export function storedFlopNodes(base, inputs, board, history = null) {
  const canonical = canonicalFlop(board);
  if (base.flop !== canonical.key) return null;
  return Object.fromEntries(treeNodes(inputs.spot.tree).map(node => {
    const path = history && base.histories[history.join(",")]?.view.node === node ? history
      : historyFor(inputs.spot.tree, node, FLOP_BETS[0]);
    const value = historyData(base, path.join(","));
    if (!value) throw new Error("Incomplete flop base");
    const { node: ignored, ...view } = remapFlopNode(value.view, canonical.fromCanonical);
    return [node, view];
  }));
}

export function storedFlopExplanation(base, { boardCards, node, cards, combos, prev = "bet33", history, inputs }) {
  const canonical = canonicalFlop(boardCards);
  if (base.flop !== canonical.key) return null;
  const path = history ?? historyFor(inputs.spot.tree, node, prev);
  const data = historyData(base, path.join(","));
  if (!data || data.view.node !== node) return null;
  const read = actualCards => {
    const key = comboKey(actualCards, canonical.toCanonical), item = data.indexes.get(key);
    if (!item) return null;
    return { ...unpackFrameRow(data.entry.combo_facts, item.index), cards: actualCards };
  };
  if (!combos) return read(cards);
  const keys = combos.map(combo => comboKey(combo.cards, canonical.toCanonical));
  const first = data.indexes.get(keys[0]);
  if (!first) return null;
  const row = data.view.rows[first.rowIndex];
  // The UI's standard hand-class selection is served entirely from the stored aggregate.
  if (combos.length === row.combos.length && row.combos.every((combo, index) => combo.cards === keys[index] && combo.weight === combos[index].weight)) {
    return unpackFrameRow(data.entry.class_facts, first.rowIndex);
  }
  const entries = combos.map(combo => ({ weight: combo.weight, facts: read(combo.cards) }));
  return entries.every(entry => entry.facts) ? averageFlopUiFacts(entries) : null;
}
