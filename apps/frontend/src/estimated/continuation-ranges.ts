import type { ContinuationSourceDatasets, ContinuationDataset, PreflopAction, FrequencyRow } from "./preflop-types.ts";
import type { ContinuationDecision, ContinuationTerminal } from "./continuation-tree.ts";
import type { ActionBlock, RangeRef } from "./range-url.ts";
import type { MatrixModel } from "../data.ts";
type SourceName = keyof ContinuationSourceDatasets;
type UiDatasets = { [K in SourceName]?: ContinuationSourceDatasets[K] | null };
type SourceDependencies<D extends readonly SourceName[]> = { [I in keyof D]: NonNullable<UiDatasets[D[I]]> };
type UiSourceRow = FrequencyRow & Partial<Record<`${PreflopAction}_size_bb`, number | null>> & { raise_to_size_bb?: number | null };
export type ContinuationUiSpot = { id: string; hands: UiSourceRow[]; unreachable?: boolean; open_size_bb?: number; facing_size_bb?: number; squeeze_size_bb?: number; four_bet_size_bb?: number | null; three_bet_size_bb?: number };
type SelectionResult =
  | { status: "saved"; spot: ContinuationUiSpot; node: ContinuationDecision | null | undefined; model: MatrixModel }
  | { status: "missing" | "unreachable"; node?: ContinuationDecision | null; source?: string };
type TerminalResult = { status: "saved" | "missing" | "unreachable"; source?: string };
type ContinuationUiRuntime = { select(ref: RangeRef): SelectionResult; selectTerminal(terminal: ContinuationTerminal): TerminalResult };
type LoadedContinuationUiRuntime = ContinuationUiRuntime & { missingSources: string[] };
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

export const continuationSourceNames: SourceName[] = ['opening-ranges', 'preflop-ranges', 'multiway-responses', 'multiway2-responses',
  'squeeze-responses', 'cold-three-bet-responses', 'cold-four-bet-responses', 'continuation-responses'];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sourceActions: PreflopAction[] = ['open', 'limp', 'three_bet', 'squeeze', 'four_bet', 'all_in', 'call', 'fold'];
const comboCount = (hand: string) => hand.length === 2 ? 6 : hand.endsWith('s') ? 4 : 12;
const label = (action: string, size: number | null | undefined) => `${action === 'open' ? 'Raise' : action === 'three_bet' ? '3bet' : action === 'squeeze' ? 'Squeeze'
  : action === 'four_bet' ? '4bet' : action === 'all_in' ? 'All-in' : action === 'call' ? 'Call' : action === 'limp' ? 'Limp' : 'Fold'}${size == null ? '' : ` ${size}BB`}`;

// Verify the compact payload structurally, without rerunning offline all-history
// equities/audits on the UI thread. Missing ancestors are resolved lazily from
// exact source support by the shared model, never guessed from an absent row.
export function validateContinuationUiPayload(data: ContinuationDataset | null | undefined) {
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
      || Object.entries(node).some(([key, value]) => !same(spot[key as keyof typeof spot], value))) throw new Error('Invalid saved continuation history');
    ids.add(spot.id);
    validateRows(spot, ['fold', 'call', 'four_bet', 'all_in']);
    for (const row of spot.hands) {
      if ((['fold', 'call', 'four_bet', 'all_in'] as const).some(action => !node.legal_actions.includes(action) && row[action] !== 0)
        || row.raise_to_size_bb !== (row.four_bet ? node.action_sizes_bb.four_bet : row.all_in ? node.action_sizes_bb.all_in : null)) throw new Error('Invalid saved continuation action');
    }
  }
}
function validateRows(spot: ContinuationUiSpot | null | undefined, actions: readonly PreflopAction[]) {
  if (!Array.isArray(spot?.hands) || spot.hands.length !== hands.length || spot.hands.some((row, index) => row.hand !== hands[index]
    || actions.some(action => !Number.isInteger(row[action]) || row[action]! < 0 || row[action]! > 100)
    || actions.reduce((sum, action) => sum + row[action]!, 0) !== 100)) throw new Error(`Invalid saved range ${spot?.id}`);
}
// Validate each present source against its own dependencies. An unrelated
// missing publication must never waive geometry or identity validation. A
// dependent source with missing prerequisites stays unavailable until retry.
function validatedSources(datasets: UiDatasets): UiDatasets {
  const validated: UiDatasets = {};
  const check = <K extends SourceName, const D extends readonly SourceName[]>(name: K, dependencies: D, validate: (source: NonNullable<UiDatasets[K]>, ...sources: SourceDependencies<D>) => NonNullable<UiDatasets[K]>) => {
    const source = datasets[name];
    if (source && dependencies.every(key => validated[key])) validated[name] = validate(source as NonNullable<UiDatasets[K]>, ...dependencies.map(key => validated[key]) as SourceDependencies<D>);
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
export function createContinuationUiRuntime(datasets: UiDatasets): ContinuationUiRuntime {
  datasets = validatedSources(datasets);
  validateContinuationUiPayload(datasets['continuation-responses']);
  const model = createContinuationModel(datasets);
  const sources = new Map<string, ContinuationUiSpot>(Object.entries(datasets).flatMap(([name, data]) => (data?.spots ?? []).map(spot => [`${name}/${spot.id}`, spot])));
  const cache = new Map<string, SelectionResult | TerminalResult>();
  function select(ref: RangeRef): SelectionResult {
    const key = `${ref.kind}/${ref.dataset ?? ''}/${ref.id}`;
    if (cache.has(key)) return cache.get(key)! as SelectionResult;
    let result: SelectionResult;
    try {
      const node = ref.kind === 'bounded' ? continuationById.get(ref.id!) : null;
      if (ref.kind === 'bounded' && !node) throw new Error('Unknown saved continuation');
      const datasetName = node?.dataset ?? ref.dataset;
      const spot = sources.get(`${datasetName}/${ref.id}`);
      const context = node ? model.context(node, spot ?? node) : null;
      if (context?.unreachable || spot?.unreachable === true) result = { status: 'unreachable', node };
      else if (!spot) result = { status: 'missing', node };
      else {
        const actions: readonly PreflopAction[] = node ? node.legal_actions : sourceActions.filter(action => Object.hasOwn(spot.hands?.[0] ?? {}, action));
        // Reused source datasets have the same conditional action names as the
        // catalog. Additional zero action columns exist only in Stage 2.
        validateRows(spot, node?.reused ? actions : datasetName === 'continuation-responses' ? ['fold', 'call', 'four_bet', 'all_in'] : actions);
        const displayActions = sourceActions.filter(action => actions.includes(action));
        const size = (action: PreflopAction) => node?.action_sizes_bb[action] ?? spot.hands.find(row => row[`${action}_size_bb`] != null)?.[`${action}_size_bb`]
          ?? (action === 'open' ? spot.open_size_bb : action === 'call' ? spot.facing_size_bb : null);
        result = { status: 'saved', spot, node, model: { actions: displayActions, actionLabels: Object.fromEntries(displayActions.map(action => [action, label(action, size(action))])),
          aggregates: new Map(spot.hands.map(row => [row.hand, { hand: row.hand, comboCount: comboCount(row.hand),
            ...(context && !context.reach(row.hand) ? { unreachable: true, actions: {} }
              : { actions: Object.fromEntries(displayActions.map(action => [action, row[action]! / 100])) }) }])) } };
      }
    } catch (error) {
      if (!(error instanceof MissingContinuationSourceError)) throw error;
      result = { status: 'missing', source: error.sourceKey };
    }
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  }
  function selectTerminal(terminal: ContinuationTerminal): TerminalResult {
    const key = `terminal/${terminal.id}`;
    if (cache.has(key)) return cache.get(key)! as TerminalResult;
    let result: TerminalResult;
    try {
      const ranges = terminal.participants.map(seat => [...model.weights(terminal.source_factors[seat])].filter(([, weight]) => weight > 0));
      const possible = ranges.every(range => range.length) && ranges[0].some(([hand]) => hasCompatibleDeal(hand, ranges.slice(1)));
      result = { status: possible ? 'saved' : 'unreachable' };
    } catch (error) {
      if (!(error instanceof MissingContinuationSourceError)) throw error;
      result = { status: 'missing', source: error.sourceKey };
    }
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  }
  return { select, selectTerminal };
}
// Successful source fetches survive a retry. An incomplete runtime is returned
// for explicit missing states, but is never retained as the settled loader cache.
export function createContinuationUiLoader(fetchDataset: (name: SourceName) => Promise<unknown> = loadDataset) {
  const successful = new Map<SourceName, NonNullable<UiDatasets[SourceName]>>();
  let pending: Promise<LoadedContinuationUiRuntime> | null | undefined;
  return function load(): Promise<LoadedContinuationUiRuntime> {
    pending ??= Promise.all(continuationSourceNames.map(async (name): Promise<[SourceName, UiDatasets[SourceName]]> => {
      if (successful.has(name)) return [name, successful.get(name)];
      try {
        const data = await fetchDataset(name) as UiDatasets[SourceName];
        if (data) successful.set(name, data);
        return [name, data ?? null];
      } catch { return [name, null]; }
    })).then(entries => {
      const missingSources = entries.filter(([, data]) => !data).map(([name]) => name);
      const runtime = { ...createContinuationUiRuntime(Object.fromEntries(entries) as UiDatasets), missingSources };
      if (missingSources.length) pending = null;
      return runtime;
    }).catch(error => { pending = null; throw error; });
    return pending;
  };
}
export const loadContinuationUiRuntime = createContinuationUiLoader();
export function useContinuationUiRuntime(enabled: boolean) {
  const [state, setState] = useState<{ runtime: LoadedContinuationUiRuntime | null; error: Error | null }>({ runtime: null, error: null });
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

export function continuationRangeBreakdown(spot: Partial<ContinuationUiSpot> | null | undefined) {
  const facing = spot?.facing_size_bb ?? spot?.squeeze_size_bb ?? spot?.four_bet_size_bb ?? spot?.three_bet_size_bb ?? spot?.open_size_bb;
  return { sizeItem: { label: continuationCopy('facing'), value: facing == null ? '—' : `${facing} BB` }, received: [],
    unreachableText: continuationCopy('unreachableHandDetail') };
}

export function withContinuationAvailability(blocks: ActionBlock[], runtime: ContinuationUiRuntime | UiDatasets | null, error: Error | null = null): ActionBlock[] {
  if (!blocks.some(block => block.continuationNode)) return blocks;
  let selectedRuntime: ContinuationUiRuntime | null = null;
  try { selectedRuntime = runtime && "select" in runtime && typeof runtime.select === "function" ? runtime as ContinuationUiRuntime : runtime ? createContinuationUiRuntime(runtime as UiDatasets) : null; }
  catch (failure) { error = failure as Error; }
  let available = Boolean(selectedRuntime) && !error;
  return blocks.map(block => {
    if (block.kind === 'end') {
      let status = error ? 'error' : selectedRuntime ? 'missing' : 'loading';
      try { if (selectedRuntime) status = selectedRuntime.selectTerminal(block.continuationTerminal!).status; } catch { status = 'error'; }
      return { ...block, continuationAvailable: available && status === 'saved', continuationStatus: status };
    }
    if (!['bounded', 'saved-source'].includes(block.rangeRef?.kind!)) return block;
    let status = error ? 'error' : selectedRuntime ? 'missing' : 'loading';
    try { if (selectedRuntime) status = selectedRuntime.select(block.rangeRef!).status; } catch { status = 'error'; }
    if (status !== 'saved') available = false;
    return { ...block, continuationStatus: status, options: block.options.map(option => ({ ...option,
      disabled: option.disabled || (status !== 'saved' && option.action !== block.chosen) })) };
  });
}

import { productLocale } from "../locale.ts";
export function continuationUnreachableCopy() {
  const copy = {
    ja: { reason: 'この履歴では到達不能、推奨なし', description: '保存された前段の行動頻度とカードの組み合わせでは、このハンドはこの履歴に到達しません。保存上のfold=100は形式上の値です。' },
    en: { reason: 'Unreachable in this history; no recommendation', description: 'This hand cannot reach this history with the saved prior-action frequencies and card combinations. The saved 100% fold is only a placeholder.' },
    'zh-CN': { reason: '在此行动历史中无法到达；无建议', description: '根据已保存的先前行动频率和牌张组合，此手牌无法到达这段行动历史。保存的 100% 弃牌仅为占位值。' },
    es: { reason: 'No alcanzable en este historial; sin recomendación', description: 'Esta mano no puede alcanzar este historial con las frecuencias de acciones previas y las combinaciones de cartas guardadas. El 100% de fold guardado es solo un valor de relleno.' },
  };
  return copy[productLocale()];
}

import type { SourceDataset } from "../../scripts/postflop-ai/types.ts";
type Sources = Record<string, SourceDataset | undefined>;
const reachModels = new WeakMap<Sources, ReturnType<typeof createContinuationModel>>();
export function continuationSavedRange(ref: RangeRef, sources: Record<string, SourceDataset | undefined>) {
  const node = ref.kind === 'bounded' ? continuationById.get(ref.id!) : null;
  const name = node?.dataset ?? ref.dataset;
  const spot = name ? sources[name]?.spots.find(item => item.id === ref.id) : null;
  if (!spot || !Array.isArray(spot.hands) || spot.hands.length !== 169) return null;
  const actions = node?.legal_actions ?? ['open','three_bet','four_bet','squeeze','all_in','limp','check','raise','call','fold'].filter(key => Object.hasOwn(spot.hands[0],key));
  if (spot.hands.some(row => actions.some(key => !Number.isFinite(row[key as keyof typeof row]) || Number(row[key as keyof typeof row]) < 0) || Math.abs(actions.reduce((sum,key) => sum+Number(row[key as keyof typeof row]),0)-100)>0.02)) return null;
  // Saved mixes are conditional. Hide placeholders using the complete observed
  // history, including folded participants and joint card support; never scale
  // a reachable hand's mix by its prior-action frequency.
  let reach: ((hand: string) => number) | undefined;
  if (node) {
    try {
      if (!reachModels.has(sources)) reachModels.set(sources, createContinuationModel(sources));
      reach = reachModels.get(sources)!.context(node).reach;
    } catch {
      // Missing or invalid ancestors are unavailable, not proof of zero reach.
      return null;
    }
  }
  const model: MatrixModel = { actions, actionLabels: Object.fromEntries(actions.map(key => [key,key === 'four_bet' ? '4bet' : key === 'all_in' ? 'All-in' : key])), aggregates: new Map(spot.hands.map(row => [row.hand,{hand:row.hand,comboCount:row.hand.length===2 ? 6 : row.hand.endsWith('s') ? 4 : 12,actions:Object.fromEntries(actions.map(key=>[key,Number(row[key as keyof typeof row])/100]))}])) };
  for (const [hand, aggregate] of model.aggregates) {
    if (reach && reach(hand) === 0) model.aggregates.set(hand, { ...aggregate, unreachable: true, actions: {} });
  }
  return { spot, model, unreachableReason: node ? continuationUnreachableCopy().reason : null };
}
