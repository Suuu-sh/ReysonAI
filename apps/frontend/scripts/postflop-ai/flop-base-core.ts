import type { Candidate, FlopPolicy, Inputs, LaterPolicy, PilotConfig } from "./types.ts";
import type { FlopFactOptions, FlopUiFacts } from "./flop-ui-facts.ts";
import type { AverageFacts } from "./explain-aggregate.ts";
import type { BaseHistory, BlockerPredictors, CodecView, FlopBase } from "./flop-base-codec.ts";
type StoredFact = FlopUiFacts | AverageFacts<FlopUiFacts>;
export type BalancedFlopBase = FlopBase<StoredFact, number>;
type HistoryData = { entry: Pick<BaseHistory<StoredFact>, "combo_facts" | "class_facts">; view: CodecView; indexes: Map<string, { index: number; rowIndex: number; weight: number }> };
import { observableFlopRequest } from "./observable-view-paths.mjs";
import { actionModelIdentity, usesObservableActions } from "./observable-actions.mjs";
// Shared balanced-mode base data: deterministic strategies and the exact UI fact projection.
// Offline authoring and browser fallback share this code; loading never authors a policy.
import { sha } from "./browser-inputs.ts";
import { EVALUATOR_VERSION } from "../lib/equity.ts";
import { defenceVersionFor, FLOP_RUNOUTS } from "./defence.ts";
import { canonicalFlop, ISOMORPHISM_VERSION, comboKey, remapFlopNode } from "./flop-isomorphism.ts";
import { flopHistoryViews } from "./views.ts";
import { flopUiComboFactsCanonical, averageFlopUiFacts, flopBlockerPredictors } from "./flop-ui-facts.ts";
import { packFrame, packView, unpackFrameRow, unpackView, compactFlopBase, hydrateFrame } from "./flop-base-codec.ts";
import { FLOP_BETS, historyFor, treeNodes } from "./tree.ts";
import { referenceLaterPolicy } from "./later-policy.ts";

// Version 7 normalizes impossible raises before computing defence in every
// view/facts consumer. Older cached rows must not bypass the corrected live path.
// No new bases are authored by this migration; stale bases use live computation.
export const FLOP_BASE_VERSION = 7;
const laterSizingHash = (config: PilotConfig) => sha(Object.fromEntries((["later_streets", "later_raise_multiplier", "later_all_in_merge_ratio"] as const).map(key => [key, config[key]])));

export function flopBaseIdentity(inputs: Inputs, candidate: Candidate, laterCandidate?: Candidate<LaterPolicy> | null) {
  return { generator_version: FLOP_BASE_VERSION, isomorphism_version: ISOMORPHISM_VERSION, ...actionModelIdentity(inputs.spot),
    evaluator_version: EVALUATOR_VERSION,
    source_hash: inputs.fingerprint, policy_hash: candidate.metadata.policy_hash,
    later_policy_hash: sha(laterCandidate?.policy ?? referenceLaterPolicy()),
    later_sizing_hash: laterSizingHash(inputs.config), defence_version: defenceVersionFor(inputs),
    defence_config_hash: sha(inputs.config.defence_realization), seed: inputs.config.seed,
    explanation_precision: 4,
    samples: { defence_runouts: FLOP_RUNOUTS } };
}

export function isFreshFlopBase(data: Partial<BalancedFlopBase> | null | undefined, inputs: Inputs, candidate: Candidate, laterCandidate?: Candidate<LaterPolicy> | null) {
  if (data?.kind !== "ai_estimate_not_gto" || data.mode !== "balanced" || data.spot !== inputs.spot.id ||
      !data.histories || !data.metadata) return false;
  const identity: Record<string, unknown> = flopBaseIdentity(inputs, candidate, laterCandidate);
  if (data.ev !== undefined) return false;
  return Object.keys(identity).every(key => JSON.stringify(data.metadata![key]) === JSON.stringify(identity[key]));
}

export function buildFlopBase({ board, inputs, candidate, laterCandidate }: { board: string | readonly number[]; inputs: Inputs; candidate: Candidate; laterCandidate?: Candidate<LaterPolicy> | null }): BalancedFlopBase {
  const canonical = canonicalFlop(board);
  const views = flopHistoryViews(inputs, candidate.policy, canonical.cards);
  for (const view of Object.values(views)) for (const row of view.rows) {
    if (!row.reachable) continue;
    for (const mix of [row.mix, ...row.combos.map(combo => combo.mix)]) {
      if (Object.values(mix).some(value => !Number.isFinite(value) || value < -1e-9 || value > 1 + 1e-9) ||
          Math.abs(Object.values(mix).reduce((sum, value) => sum + value, 0) - 1) > 1e-8) throw new Error(`Invalid base strategy: ${canonical.key}/${view.node}/${row.hand}`);
    }
    if (row.combos.some(combo => !Number.isFinite(combo.weight) || !Number.isFinite(combo.reachWeight) || combo.reachWeight! < 0)) throw new Error("Invalid base reach weights");
  }
  const predictors: BlockerPredictors = {};
  const histories = Object.fromEntries(Object.entries(views).map(([history, view]) => {
    const facts: FlopUiFacts[] = [], averages: (AverageFacts<FlopUiFacts> | null)[] = [];
    for (const row of view.rows) {
      const entries = row.combos.map(combo => {
        const fact = flopUiComboFactsCanonical({ boardCards: canonical.cards, node: view.node, cards: combo.cards,
          history: history ? history.split(",") : [], inputs, policy: candidate.policy });
        facts.push(fact);
        return { weight: combo.weight, facts: fact };
      });
      averages.push(entries.length ? averageFlopUiFacts(entries) : null);
    }
    predictors[history] = view.unavailable ? null : flopBlockerPredictors(inputs, candidate.policy, canonical.cards, history ? history.split(",") : [], view);
    return [history, { view: packView(view), combo_facts: packFrame(facts), class_facts: packFrame(averages) }];
  }));
  return compactFlopBase<StoredFact>({ kind: "ai_estimate_not_gto", mode: "balanced", spot: inputs.spot.id, flop: canonical.key,
    metadata: flopBaseIdentity(inputs, candidate, laterCandidate), histories }, predictors);
}

const decoded = new WeakMap<BalancedFlopBase, Map<string, HistoryData>>();
function historyData(base: BalancedFlopBase, key: string): HistoryData | null {
  let cache = decoded.get(base);
  if (!cache) decoded.set(base, cache = new Map());
  if (cache.has(key)) return cache.get(key)!;
  const packed = base.histories[key];
  if (!packed) return null;
  const entry = { ...packed, combo_facts: hydrateFrame(base, packed.combo_facts), class_facts: hydrateFrame(base, packed.class_facts) };
  const view = unpackView({ ...packed.view, rows: hydrateFrame(base, packed.view.rows), combos: hydrateFrame(base, packed.view.combos) });
  const indexes = new Map<string, { index: number; rowIndex: number; weight: number }>();
  let index = 0;
  view.rows.forEach((row, rowIndex) => row.combos.forEach(combo => {
    indexes.set(combo.cards, { index: index++, rowIndex, weight: combo.weight });
  }));
  const result = { entry, view, indexes };
  cache.set(key, result);
  return result;
}

export function storedFlopNodes(base: BalancedFlopBase, inputs: Inputs, board: string | readonly number[], history: string[] | null = null) {
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

export function storedFlopExplanation(base: BalancedFlopBase, { boardCards, node, cards, combos, prev = "bet33", history, inputs }: Omit<FlopFactOptions, "policy">) {
  const canonical = canonicalFlop(boardCards);
  if (base.flop !== canonical.key) return null;
  let path = history ?? historyFor(inputs.spot.tree, node, prev);
  if (usesObservableActions(inputs.spot)) {
    try { ({ history: path, node } = observableFlopRequest(inputs.spot, node, path)); }
    catch { return null; }
  }
  const data = historyData(base, path.join(","));
  if (!data || data.view.unavailable || data.view.node !== node) return null;
  const read = (actualCards: string) => {
    const key = comboKey(actualCards, canonical.toCanonical), item = data.indexes.get(key);
    if (!item) return null;
    return { ...unpackFrameRow(data.entry.combo_facts, item.index), cards: actualCards };
  };
  if (!combos) return read(cards!);
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
