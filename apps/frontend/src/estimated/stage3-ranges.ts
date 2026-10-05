// Read-only Stage3 UI adapter. Full offline catalogs, samplers and audits are not
// imported. Exact saved predecessors and card compatibility govern availability.
import { useEffect, useState } from 'react';
import { hands } from '../data.ts';
import { loadDataset } from './datasets.ts';
import { continuationSourceNames, createContinuationUiRuntime } from './continuation-ranges.ts';
import { hasCompatibleDeal } from './continuation-model.ts';
import { stage3Families, stage3RootDescriptors, STAGE3_ACTIONS, STAGE3_RARE_THRESHOLD } from './stage3-catalog.ts';
import { stage3TreeForRoot } from './stage3-flow.ts';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const combos = hand => hand.length === 2 ? 6 : hand.endsWith('s') ? 4 : 12;
const labels = { fold: 'Fold', call: 'Call', squeeze: 'Squeeze', four_bet: '4bet', all_in: 'All-in' };
class MissingSource extends Error {}
function validateRows(spot) {
  if (!Array.isArray(spot?.hands) || spot.hands.length !== hands.length || spot.hands.some((row, i) => row.hand !== hands[i]
    || STAGE3_ACTIONS.some(key => !Number.isInteger(row[key]) || row[key] < 0 || row[key] > 100)
    || STAGE3_ACTIONS.reduce((sum, key) => sum + row[key], 0) !== 100)) throw new Error(`Invalid Stage3 saved rows ${spot?.id}`);
}
export function validateStage3UiHeader(data) {
  if (!data) return;
  const meta = data.metadata;
  if (!same(meta?.families, stage3Families) || meta?.schema_version !== '1.0' || meta.storage !== 'reachable-nonrare-only'
    || meta.strategy_type !== 'ai_estimate_not_gto' || meta.effective_stack_bb !== 100 || meta.ante_bb !== 0
    || !same(meta.legal_actions, STAGE3_ACTIONS) || meta.rake?.rate !== 0.05 || meta.rake.cap_bb !== 3 || meta.rake.no_flop_no_drop !== true
    || !Array.isArray(data.spots) || data.spot_count !== data.spots.length || data.hand_classes_per_spot !== 169
    || data.entry_count !== data.spot_count * 169 || !Number.isSafeInteger(data.catalog_spot_count)
    || !Number.isSafeInteger(data.omitted_unreachable_count) || data.omitted_unreachable_count < 0
    || !Number.isSafeInteger(data.omitted_rare_count) || data.omitted_rare_count < 0
    || data.catalog_spot_count !== data.spot_count + data.omitted_unreachable_count + data.omitted_rare_count
    || new Set(data.spots.map(spot => spot.id)).size !== data.spot_count) throw new Error('Invalid saved Stage3 metadata');
}
export function createStage3UiRuntime(datasets) {
  const legacy = createContinuationUiRuntime(datasets);
  const data = datasets['stage3-responses'];
  validateStage3UiHeader(data);
  const records = new Map(Object.entries(datasets).flatMap(([name, content]) => (content?.spots ?? []).map(spot => [`${name}/${spot.id}`, spot])));
  const checked = new Set(), resultCache = new Map();
  function validateSpot(spot, tree) {
    if (checked.has(spot.id)) return;
    const node = tree.nodes.get(spot.id);
    if (!node || spot.unreachable !== false || Object.entries(node).some(([key, value]) => !same(spot[key], value))) throw new Error('Invalid Stage3 saved history');
    validateRows(spot);
    for (const row of spot.hands) {
      if (STAGE3_ACTIONS.some(key => !node.legal_actions.includes(key) && row[key] !== 0)
        || row.raise_to_size_bb !== (row.squeeze ? node.action_sizes_bb.squeeze : row.four_bet ? node.action_sizes_bb.four_bet : row.all_in ? node.action_sizes_bb.all_in : null)) throw new Error('Invalid Stage3 saved action');
    }
    checked.add(spot.id);
  }
  function source(ref, tree) {
    const spot = records.get(`${ref.dataset}/${ref.spot_id}`);
    if (!spot) throw new MissingSource(`${ref.dataset}/${ref.spot_id}`);
    if (ref.dataset === 'stage3-responses') {
      const sourceTree = stage3TreeForRoot(spot.root_id);
      if (!sourceTree) throw new Error('Unknown Stage3 predecessor root');
      validateSpot(spot, sourceTree);
    }
    else if (legacy.select({ kind: 'saved-source', dataset: ref.dataset, id: ref.spot_id }).status === 'missing') throw new MissingSource(`${ref.dataset}/${ref.spot_id}`);
    return spot;
  }
  function weights(factors, tree, resolving = new Set()) {
    const rows = factors.map(ref => {
      if (ref.dataset === 'stage3-responses' && !records.has(`${ref.dataset}/${ref.spot_id}`)) {
        if (resolving.has(ref.spot_id)) throw new Error('Cyclic Stage3 predecessor');
        const root = stage3RootDescriptors.find(root => ref.spot_id.startsWith(`${root.id}__`));
        const ancestorTree = root ? stage3TreeForRoot(root.id) : null;
        const ancestor = ancestorTree?.nodes.get(ref.spot_id);
        if (!ancestor) throw new MissingSource(`stage3-responses/${ref.spot_id}`);
        resolving.add(ref.spot_id);
        const reach = context(ancestor, ancestorTree, resolving);
        resolving.delete(ref.spot_id);
        if (!reach.unreachable) throw new MissingSource(`stage3-responses/${ref.spot_id}`);
        // An impossible predecessor cannot produce any observed action,
        // including a fold. Keep its contribution to reach exactly zero.
        return { ref, rows: null };
      }
      return { ref, rows: new Map(source(ref, tree).hands.map(row => [row.hand, row])) };
    });
    return new Map(hands.map(hand => [hand, rows.reduce((weight, { ref, rows }) => {
      if (!rows) return 0;
      const value = rows.get(hand)?.[ref.action];
      if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error('Invalid Stage3 source frequency');
      return weight * value / 100;
    }, 1)]));
  }
  function evidence(root, tree) {
    const known = [];
    for (const seat of root.participants) {
      const factors = root.history.filter(event => event.seat === seat && event.source).map(event => event.source);
      if (!factors.length) continue;
      // A fourth caller's unavailable range contributes at most one; only a
      // rigorous bound on the already-known prefix can justify omission.
      if (factors.some(ref => ref.dataset === 'stage3-responses' && !records.has(`${ref.dataset}/${ref.spot_id}`))) continue;
      known.push([...weights(factors, tree)].reduce((sum, [hand, value]) => sum + combos(hand) * value, 0) / 1326);
    }
    const product = known.reduce((a, b) => a * b, 1);
    const disjoint = known.reduce((acc, _, i) => acc * ((52 - 2 * i) * (51 - 2 * i)) / (52 * 51), 1);
    const upper = Math.min(1, product / disjoint);
    return { joint_reach_upper_bound: upper, rare: root.rare_eligible && upper < STAGE3_RARE_THRESHOLD };
  }
  function context(node, tree, resolving = new Set()) {
    const ranges = new Map(node.participants.map(seat => [seat, weights(node.source_factors[seat], tree, resolving)]));
    const own = ranges.get(node.hero);
    const others = node.participants.filter(seat => seat !== node.hero).map(seat => [...ranges.get(seat)].filter(([, value]) => value > 0));
    const compatible = new Map();
    const reach = hand => {
      if (!own.get(hand)) return 0;
      if (!compatible.has(hand)) compatible.set(hand, hasCompatibleDeal(hand, others));
      return compatible.get(hand) ? own.get(hand) : 0;
    };
    return { reach, unreachable: !hands.some(hand => reach(hand) > 0) };
  }
  function select(ref) {
    if (ref.kind !== 'stage3') return legacy.select(ref);
    const key = `${ref.rootId}/${ref.id}`;
    if (resultCache.has(key)) return resultCache.get(key);
    const tree = stage3TreeForRoot(ref.rootId), node = tree?.nodes.get(ref.id);
    if (!node) throw new Error('Unknown Stage3 UI decision');
    let result;
    try {
      const reachEvidence = evidence(tree.root, tree);
      if (reachEvidence.rare) result = { status: 'rare', node, reach: reachEvidence };
      else {
        const support = context(node, tree), spot = records.get(`stage3-responses/${node.id}`);
        if (support.unreachable) result = { status: 'unreachable', node };
        else if (!spot) result = { status: 'missing', node };
        else {
          validateSpot(spot, tree);
          if (spot.hands.some(row => !support.reach(row.hand) && row.fold !== 100)) throw new Error('Invalid Stage3 zero-reach row');
          const actions = [...node.legal_actions].sort((a, b) => ['all_in', 'four_bet', 'squeeze', 'call', 'fold'].indexOf(a) - ['all_in', 'four_bet', 'squeeze', 'call', 'fold'].indexOf(b));
          result = { status: 'saved', node, spot, model: { actions,
            actionLabels: Object.fromEntries(actions.map(key => [key, `${labels[key]}${node.action_sizes_bb[key] == null ? '' : ` ${node.action_sizes_bb[key]}BB`}`])),
            aggregates: new Map(spot.hands.map(row => [row.hand, { hand: row.hand, comboCount: combos(row.hand),
              ...(!support.reach(row.hand) ? { unreachable: true, actions: {} } : { actions: Object.fromEntries(actions.map(action => [action, row[action] / 100])) }) }])) } };
        }
      }
    } catch (error) {
      if (!(error instanceof MissingSource)) throw error;
      result = { status: 'missing', node, source: error.message };
    }
    if (resultCache.size >= 64) resultCache.delete(resultCache.keys().next().value);
    resultCache.set(key, result); return result;
  }
  function selectTerminal(terminal) {
    const tree = stage3TreeForRoot(terminal.root_id);
    if (!tree?.terminalById.has(terminal.id)) throw new Error('Unknown Stage3 terminal');
    try {
      const reachEvidence = evidence(tree.root, tree);
      if (reachEvidence.rare) return { status: 'rare', reach: reachEvidence };
      const ranges = terminal.participants.map(seat => [...weights(terminal.source_factors[seat], tree)].filter(([, value]) => value > 0));
      return { status: ranges.every(range => range.length) && ranges[0].some(([hand]) => hasCompatibleDeal(hand, ranges.slice(1))) ? 'saved' : 'unreachable' };
    } catch (error) {
      if (!(error instanceof MissingSource)) throw error;
      return { status: 'missing', source: error.message };
    }
  }
  return { select, selectTerminal };
}

export const stage3SourceNames = [...continuationSourceNames, 'stage3-responses'];
export function createStage3UiLoader(fetchDataset = loadDataset) {
  const successful = new Map(); let pending;
  return function load() {
    pending ??= Promise.all(stage3SourceNames.map(async name => {
      if (successful.has(name)) return [name, successful.get(name)];
      try { const data = await fetchDataset(name); if (data) successful.set(name, data); return [name, data ?? null]; }
      catch { return [name, null]; }
    })).then(entries => {
      const missingSources = entries.filter(([, data]) => !data).map(([name]) => name);
      const result = { ...createStage3UiRuntime(Object.fromEntries(entries)), missingSources };
      if (missingSources.length) pending = null;
      return result;
    }).catch(error => { pending = null; throw error; });
    return pending;
  };
}
const loadStage3UiRuntime = createStage3UiLoader();
export function useStage3UiRuntime(enabled) {
  const [state, setState] = useState({ runtime: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || state.runtime && !state.runtime.missingSources.length) return;
    let cancelled = false;
    loadStage3UiRuntime().then(runtime => { if (!cancelled) setState({ runtime, error: null }); })
      .catch(error => { if (!cancelled) setState({ runtime: null, error }); });
    return () => { cancelled = true; };
  }, [enabled, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
export function withStage3Availability(blocks, runtime, error = null) {
  let available = Boolean(runtime) && !error;
  return blocks.map(block => {
    if (block.stage3Terminal) {
      let status = error ? 'error' : runtime ? 'missing' : 'loading';
      try { if (runtime) status = runtime.selectTerminal(block.stage3Terminal).status; } catch { status = 'error'; }
      return { ...block, continuationAvailable: available && status === 'saved', continuationStatus: status };
    }
    if (!block.stage3Node) return block;
    let status = error ? 'error' : runtime ? 'missing' : 'loading';
    try { if (runtime) status = runtime.select(block.rangeRef).status; } catch { status = 'error'; }
    if (status !== 'saved') available = false;
    return { ...block, stage3Status: status, options: block.options.map(option => ({ ...option,
      disabled: option.disabled || status !== 'saved' && option.action !== block.chosen })) };
  });
}
