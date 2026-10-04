import { useEffect, useState } from 'react';
import { continuationCopy } from './continuation-copy.ts';
import { hands } from '../data.ts';
import { loadDataset } from './datasets.ts';
import { validateOpeningDataset } from './opening-ranges.ts';
import { validateDataset } from './ranges.ts';
import { validateMultiwayDataset } from './multiway-responses.ts';
import { validateMultiway2Dataset } from './multiway2-responses.ts';
import { validateSqueezeDataset } from './squeeze-responses.ts';
import { validateColdThreeBetDataset } from './cold-three-bet-responses.ts';
import { validateColdFourBetDataset } from './cold-four-bet-responses.ts';
import { continuationById, continuationSpots, continuationFamilies } from './continuation-tree.ts';
import { createContinuationModel, hasCompatibleDeal, MissingContinuationSourceError } from './continuation-model.ts';

export const continuationSourceNames = ['opening-ranges', 'preflop-ranges', 'multiway-responses', 'multiway2-responses',
  'squeeze-responses', 'cold-three-bet-responses', 'cold-four-bet-responses', 'continuation-responses'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sourceActions = ['open', 'limp', 'three_bet', 'squeeze', 'four_bet', 'all_in', 'call', 'fold'];
const comboCount = hand => hand.length === 2 ? 6 : hand.endsWith('s') ? 4 : 12;
const label = (action, size) => `${action === 'open' ? 'Raise' : action === 'three_bet' ? '3bet' : action === 'squeeze' ? 'Squeeze'
  : action === 'four_bet' ? '4bet' : action === 'all_in' ? 'All-in' : action === 'call' ? 'Call' : action === 'limp' ? 'Limp' : 'Fold'}${size == null ? '' : ` ${size}BB`}`;

// Verify the compact payload structurally, without rerunning offline all-history
// equities/audits on the UI thread. Missing ancestors are resolved lazily from
// exact source support by the shared model, never guessed from an absent row.
export function validateContinuationUiPayload(data) {
  if (!data) return;
  const m = data.metadata;
  if (!same(m?.families, continuationFamilies) || m?.effective_stack_bb !== 100 || m.ante_bb !== 0
    || m.rake?.rate !== 0.05 || m.rake.cap_bb !== 3 || m.rake.no_flop_no_drop !== true
    || m?.schema_version !== '1.1' || m.storage !== 'reachable-only' || m.strategy_type !== 'ai_estimate_not_gto'
    || data.catalog_spot_count !== continuationSpots.length || !Array.isArray(data.spots)
    || data.spot_count !== data.spots.length || data.entry_count !== data.spot_count * hands.length
    || data.hand_classes_per_spot !== hands.length || data.omitted_unreachable_count !== data.catalog_spot_count - data.spot_count) {
    throw new Error('Invalid saved continuation metadata');
  }
  const ids = new Set();
  for (const spot of data.spots) {
    const node = continuationById.get(spot.id);
    if (!node || node.reused || ids.has(spot.id) || spot.unreachable !== false
      || Object.entries(node).some(([key, value]) => !same(spot[key], value))) throw new Error('Invalid saved continuation history');
    ids.add(spot.id);
    validateRows(spot, ['fold', 'call', 'four_bet', 'all_in']);
    for (const row of spot.hands) {
      if (['fold', 'call', 'four_bet', 'all_in'].some(action => !node.legal_actions.includes(action) && row[action] !== 0)
        || row.raise_to_size_bb !== (row.four_bet ? node.action_sizes_bb.four_bet : row.all_in ? node.action_sizes_bb.all_in : null)) throw new Error('Invalid saved continuation action');
    }
  }
}
function validateRows(spot, actions) {
  if (!Array.isArray(spot?.hands) || spot.hands.length !== hands.length || spot.hands.some((row, index) => row.hand !== hands[index]
    || actions.some(action => !Number.isInteger(row[action]) || row[action] < 0 || row[action] > 100)
    || actions.reduce((sum, action) => sum + row[action], 0) !== 100)) throw new Error(`Invalid saved range ${spot?.id}`);
}
// Validate each present source against its own dependencies. An unrelated
// missing publication must never waive geometry or identity validation. A
// dependent source with missing prerequisites stays unavailable until retry.
function validatedSources(datasets) {
  const validated = {};
  const check = (name, dependencies, validate) => {
    const source = datasets[name];
    if (source && dependencies.every(key => validated[key])) validated[name] = validate(source, ...dependencies.map(key => validated[key]));
    else validated[name] = null;
  };
  check('opening-ranges', [], validateOpeningDataset);
  check('preflop-ranges', [], validateDataset);
  check('multiway-responses', ['preflop-ranges'], validateMultiwayDataset);
  check('multiway2-responses', ['multiway-responses', 'preflop-ranges', 'opening-ranges'], validateMultiway2Dataset);
  check('squeeze-responses', ['multiway-responses', 'preflop-ranges', 'opening-ranges'], validateSqueezeDataset);
  check('cold-three-bet-responses', ['preflop-ranges'], validateColdThreeBetDataset);
  check('cold-four-bet-responses', ['cold-three-bet-responses', 'preflop-ranges', 'opening-ranges'], validateColdFourBetDataset);
  return { ...validated, 'continuation-responses': datasets['continuation-responses'] };
}
export function createContinuationUiRuntime(datasets) {
  datasets = validatedSources(datasets);
  validateContinuationUiPayload(datasets['continuation-responses']);
  const model = createContinuationModel(datasets);
  const sources = new Map(Object.entries(datasets).flatMap(([name, data]) => (data?.spots ?? []).map(spot => [`${name}/${spot.id}`, spot])));
  const cache = new Map();
  function select(ref) {
    const key = `${ref.kind}/${ref.dataset ?? ''}/${ref.id}`;
    if (cache.has(key)) return cache.get(key);
    let result;
    try {
      const node = ref.kind === 'bounded' ? continuationById.get(ref.id) : null;
      if (ref.kind === 'bounded' && !node) throw new Error('Unknown saved continuation');
      const datasetName = node?.dataset ?? ref.dataset;
      const spot = sources.get(`${datasetName}/${ref.id}`);
      const context = node ? model.context(node, spot ?? node) : null;
      if (context?.unreachable || spot?.unreachable === true) result = { status: 'unreachable', node };
      else if (!spot) result = { status: 'missing', node };
      else {
        const actions = node ? node.legal_actions : sourceActions.filter(action => Object.hasOwn(spot.hands?.[0] ?? {}, action));
        // Reused source datasets have the same conditional action names as the
        // catalog. Additional zero action columns exist only in Stage 2.
        validateRows(spot, node?.reused ? actions : datasetName === 'continuation-responses' ? ['fold', 'call', 'four_bet', 'all_in'] : actions);
        const displayActions = sourceActions.filter(action => actions.includes(action));
        const size = action => node?.action_sizes_bb[action] ?? spot.hands.find(row => row[`${action}_size_bb`] != null)?.[`${action}_size_bb`]
          ?? (action === 'open' ? spot.open_size_bb : action === 'call' ? spot.facing_size_bb : null);
        result = { status: 'saved', spot, node, model: { actions: displayActions, actionLabels: Object.fromEntries(displayActions.map(action => [action, label(action, size(action))])),
          aggregates: new Map(spot.hands.map(row => [row.hand, { hand: row.hand, comboCount: comboCount(row.hand),
            ...(context && !context.reach(row.hand) ? { unreachable: true, actions: {} }
              : { actions: Object.fromEntries(displayActions.map(action => [action, row[action] / 100])) }) }])) } };
      }
    } catch (error) {
      if (!(error instanceof MissingContinuationSourceError)) throw error;
      result = { status: 'missing', source: error.sourceKey };
    }
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
  }
  function selectTerminal(terminal) {
    const key = `terminal/${terminal.id}`;
    if (cache.has(key)) return cache.get(key);
    let result;
    try {
      const ranges = terminal.participants.map(seat => [...model.weights(terminal.source_factors[seat])].filter(([, weight]) => weight > 0));
      const possible = ranges.every(range => range.length) && ranges[0].some(([hand]) => hasCompatibleDeal(hand, ranges.slice(1)));
      result = { status: possible ? 'saved' : 'unreachable' };
    } catch (error) {
      if (!(error instanceof MissingContinuationSourceError)) throw error;
      result = { status: 'missing', source: error.sourceKey };
    }
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
  }
  return { select, selectTerminal };
}
// Successful source fetches survive a retry. An incomplete runtime is returned
// for explicit missing states, but is never retained as the settled loader cache.
export function createContinuationUiLoader(fetchDataset = loadDataset) {
  const successful = new Map();
  let pending;
  return function load() {
    pending ??= Promise.all(continuationSourceNames.map(async name => {
      if (successful.has(name)) return [name, successful.get(name)];
      try {
        const data = await fetchDataset(name);
        if (data) successful.set(name, data);
        return [name, data ?? null];
      } catch { return [name, null]; }
    })).then(entries => {
      const missingSources = entries.filter(([, data]) => !data).map(([name]) => name);
      const runtime = { ...createContinuationUiRuntime(Object.fromEntries(entries)), missingSources };
      if (missingSources.length) pending = null;
      return runtime;
    }).catch(error => { pending = null; throw error; });
    return pending;
  };
}
export const loadContinuationUiRuntime = createContinuationUiLoader();
export function useContinuationUiRuntime(enabled) {
  const [state, setState] = useState({ runtime: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || state.runtime && !state.runtime.missingSources.length) return;
    let cancelled = false;
    loadContinuationUiRuntime().then(runtime => { if (!cancelled) setState({ runtime, error: null }); })
      .catch(error => { if (!cancelled) setState({ runtime: null, error }); });
    return () => { cancelled = true; };
  }, [enabled, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}

export function continuationRangeBreakdown(spot) {
  const facing = spot?.facing_size_bb ?? spot?.squeeze_size_bb ?? spot?.four_bet_size_bb ?? spot?.three_bet_size_bb ?? spot?.open_size_bb;
  return { sizeItem: { label: continuationCopy('facing'), value: facing == null ? '—' : `${facing} BB` }, received: [],
    unreachableText: continuationCopy('unreachableHandDetail') };
}

export function withContinuationAvailability(blocks, runtime, error = null) {
  if (!blocks.some(block => block.continuationNode)) return blocks;
  let available = Boolean(runtime) && !error;
  return blocks.map(block => {
    if (block.kind === 'end') {
      let status = error ? 'error' : runtime ? 'missing' : 'loading';
      try { if (runtime) status = runtime.selectTerminal(block.continuationTerminal).status; } catch { status = 'error'; }
      return { ...block, continuationAvailable: available && status === 'saved', continuationStatus: status };
    }
    if (!['bounded', 'saved-source'].includes(block.rangeRef?.kind)) return block;
    let status = error ? 'error' : runtime ? 'missing' : 'loading';
    try { if (runtime) status = runtime.select(block.rangeRef).status; } catch { status = 'error'; }
    if (status !== 'saved') available = false;
    return { ...block, continuationStatus: status, options: block.options.map(option => ({ ...option,
      disabled: option.disabled || (status !== 'saved' && option.action !== block.chosen) })) };
  });
}
