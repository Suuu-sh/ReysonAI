import type { Stage3Action, Stage3Decision, Stage3Root, Stage3UiTree, Stage3Selection, Stage3Block } from "./stage3-types.ts";
import type { HistoryAction } from "./continuation-tree.ts";
// Stage3 navigation expands only the selected root. Importing the workspace must
// not build the complete 16k-decision offline authoring catalog.
import { stage3RootDescriptors, enumerateStage3Tree, stage3HistoryKey } from './stage3-catalog.ts';
import { continuationRoots } from './continuation-tree.ts';
import { appendContinuationBlocks, continuationRootForSelection } from './continuation-flow.ts';
import { positions } from './sizing.ts';

const roots = new Map(stage3RootDescriptors.map(root => [root.id, root]));
const cache = new Map<string, Stage3UiTree>();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const uiAction = <T extends string | null>(action: T) => ['squeeze', 'four_bet'].includes(action!) ? 'raise' : action;
const actionFor = (node: Stage3Decision, action: string) => action === 'raise' ? node.legal_actions.find(key => ['squeeze', 'four_bet'].includes(key)) : action;
export function stage3TreeForRoot(id: string | undefined): Stage3UiTree | null {
  if (!roots.has(id!)) return null;
  if (!cache.has(id!)) {
    const tree = enumerateStage3Tree([roots.get(id!)!]);
    const result = { ...tree, root: tree.roots[0], nodes: new Map(tree.spots.map(node => [node.id, node])),
      terminalById: new Map(tree.terminals.map(node => [node.id, node])), boundaryById: new Map(tree.boundaries.map(node => [node.id, node])) };
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(id!, result);
  }
  return cache.get(id!)!;
}

export function stage3RootForSelection(state: Stage3Selection) {
  const previous = continuationRootForSelection(state);
  if (state.stage3RootId) {
    const root = roots.get(state.stage3RootId);
    if (!root || root.opener !== state.opener) return null;
    if (root.stage2_root_id) return previous?.id === root.stage2_root_id ? root : null;
    const prior = (state.callers ?? []).filter(seat => positions.indexOf(seat) < positions.indexOf(root.entrant));
    return state.rangeType === 'response' && same(prior, root.callers) ? root : null;
  }
  if (state.rangeType !== 'response' || state.pendingRaise || state.foldedHero) return null;
  const prior = (state.callers ?? []).filter(seat => positions.indexOf(seat) < positions.indexOf(state.hero));
  return stage3RootDescriptors.find(root => root.rare_eligible && root.opener === state.opener && root.entrant === state.hero && same(root.callers, prior)) ?? null;
}

export function stage3SelectionForRoot(root: Stage3Root) {
  if (root.stage2_root_id) {
    const prior = continuationRoots.find(item => item.id === root.stage2_root_id)!;
    return prior.squeezer
      ? { rangeType: 'response', opener: prior.opener, hero: prior.squeezer, callers: [...prior.callers], pendingRaise: 'squeeze', coldAction: null }
      : { rangeType: 'three_bet', opener: prior.opener, hero: prior.three_bettor!, callers: [], pendingRaise: null,
        coldAction: { position: (prior.cold_caller ?? prior.four_bettor)!, action: prior.cold_caller ? 'call' : 'raise' } };
  }
  return { rangeType: 'response', opener: root.opener, hero: root.entrant, callers: [...root.callers], pendingRaise: null, coldAction: null };
}

export function normalizeStage3Selection(rootId: string, asked: readonly string[] = []) {
  const tree = stage3TreeForRoot(rootId);
  if (!tree) return null;
  let id = tree.root.first_decision_id;
  const actions: string[] = [];
  for (const action of Array.isArray(asked) ? asked.slice(0, 24) : []) {
    const node = tree.nodes.get(id);
    if (!node || !node.legal_actions.includes(action as Stage3Action)) break;
    actions.push(action); id = node.children[action];
  }
  return { ...stage3SelectionForRoot(tree.root), stage3RootId: rootId, stage3Actions: actions,
    squeezeResponse: [], continuationActions: [], foldedHero: false, continuationAction: null, shoveResponse: null };
}

export function chooseStage3Action(block: Pick<Stage3Block, "stage3RootId" | "stage3Node" | "priorStage3Actions">, action: string | null) {
  const tree = stage3TreeForRoot(block.stage3RootId ?? block.stage3Node?.root_id);
  if (!tree) return null;
  const node = block.stage3Node ?? tree.nodes.get(tree.root.first_decision_id)!;
  const previous = block.priorStage3Actions ?? [];
  const saved = action == null ? null : actionFor(node, action);
  if (action != null && !node.legal_actions.includes(saved as Stage3Action)) return null;
  const choices = saved == null ? previous : [...previous, saved];
  // The fold boundary deliberately reuses the existing forced-outsider model.
  if (choices.length === 1 && choices[0] === 'fold' && tree.root.stage2_root_id) {
    return { ...stage3SelectionForRoot(tree.root), stage3RootId: null, stage3Actions: [], squeezeResponse: [], continuationActions: [],
      foldedHero: false, continuationAction: null, shoveResponse: null };
  }
  return normalizeStage3Selection(tree.root.id, choices);
}
const optionsFor = (node: Stage3Decision) => node.legal_actions.map(action => ({ action: uiAction(action),
  label: action === 'fold' ? 'Fold' : `${action === 'call' ? 'Call' : action === 'all_in' ? 'Allin' : 'Raise'} ${node.action_sizes_bb[action]}` }));

export function withStage3Entrances(blocks: Stage3Block[], state: Stage3Selection): Stage3Block[] {
  const legacy = continuationRootForSelection(state);
  if (!legacy) return blocks;
  return blocks.map(block => {
    if (block.kind !== 'forced') return block;
    const root = stage3RootDescriptors.find(root => root.stage2_root_id === legacy.id && root.entrant === block.position);
    if (!root) return block;
    const tree = stage3TreeForRoot(root.id)!, node = tree.nodes.get(tree.root.first_decision_id)!;
    return { ...block, kind: 'stage3-entry', stage3RootId: root.id, stage3Node: node, priorStage3Actions: [],
      rangeRef: { kind: 'stage3', position: node.hero, id: node.id, rootId: root.id, extraSeat: true }, options: optionsFor(node) };
  });
}

export function appendStage3Blocks(base: Stage3Block[], root: Stage3Root, state: Stage3Selection): Stage3Block[] {
  const tree = stage3TreeForRoot(root.id)!;
  const initialBySeat = new Map(base.filter(block => positions.includes(block.position) && !block.continuationNode).map(block => [block.position, block]));
  const result: Stage3Block[] = root.history.map(event => {
    const previous = initialBySeat.get(event.seat);
    if (!previous) throw new Error(`Missing Stage3 initial seat ${event.seat}`);
    return { ...previous, chosen: uiAction(event.action === 'open' || event.action === 'three_bet' ? 'four_bet' : event.action), active: false,
      ...(event.source ? { rangeRef: { kind: 'saved-source', position: event.seat, dataset: event.source.dataset, id: event.source.spot_id } } : {}) };
  });
  const choices = Array.isArray(state.stage3Actions) ? state.stage3Actions : [];
  let id = tree.root.first_decision_id;
  const previous: string[] = [];
  for (let index = 0; index < 32; index++) {
    const boundary = tree.boundaryById.get(id);
    if (boundary) {
      const legacy = continuationRoots.find(item => item.id === root.stage2_root_id)!;
      return appendContinuationBlocks(base, legacy, { ...state, squeezeResponse: [], continuationActions: [] });
    }
    const terminal = tree.terminalById.get(id);
    if (terminal) {
      // Forced outsiders between decisions are retained exactly in the strip.
      addForcedEvents(result, terminal.history);
      const paid = Object.values(terminal.contributions_bb).sort((a, b) => b - a);
      const pot = terminal.terminal === 'uncontested' ? terminal.pot_bb - (paid[0] - paid[1]) : terminal.pot_bb;
      result.push({ key: 'end', position: '終了', stack: '', kind: 'end', active: false, chosen: null, options: [],
        result: terminal.terminal === 'flop' ? `${terminal.live_participants.length}人でフロップへ`
          : terminal.terminal === 'all_in' ? 'オールイン・ショウダウン' : `${terminal.live_participants[0]}の勝ち`,
        pot: `ポット ${pot}bb`, postflopEvents: terminal.history, stage3Terminal: terminal });
      return result;
    }
    const node = tree.nodes.get(id);
    if (!node) throw new Error(`Unknown Stage3 decision ${id}`);
    addForcedEvents(result, node.history);
    const chosen = node.legal_actions.includes(choices[index] as Stage3Action) ? choices[index] : null;
    result.push({ key: `stage3-${node.id}`, position: node.hero, stack: String(100 - node.contributions_bb[node.hero]),
      kind: 'stage3-continuation', stage3RootId: root.id, stage3Node: node, priorStage3Actions: [...previous],
      rangeRef: { kind: 'stage3', position: node.hero, id: node.id, rootId: root.id, extraSeat: !node.parent_id && Boolean(root.stage2_root_id) }, active: !chosen, chosen: uiAction(chosen), options: optionsFor(node) });
    if (!chosen) return result;
    previous.push(chosen); id = node.children[chosen];
  }
  throw new Error('Stage3 path exceeds the bounded catalog');
}

function addForcedEvents(blocks: Stage3Block[], history: readonly HistoryAction[]) {
  // Each chosen strip block is one chronological event, including initial folds.
  for (const event of history.slice(blocks.length)) {
    if (!event.forced || event.action !== 'fold') throw new Error('Stage3 path lost a saved decision');
    blocks.push({ key: `stage3-forced-${blocks.length}-${event.seat}`, position: event.seat,
      stack: String(100 - (event.seat === 'SB' ? 0.5 : event.seat === 'BB' ? 1 : 0)), kind: 'forced', active: false,
      chosen: 'fold', options: [{ action: 'fold', label: 'Fold', disabled: true }], rangeRef: { kind: 'pending', position: event.seat } });
  }
}

export function stage3LiveSeats(blocks: readonly Stage3Block[]) {
  const last = blocks.at(-1);
  return last?.stage3Terminal?.live_participants ?? last?.stage3Node?.live_participants ?? null;
}
export const stage3InitialHistoryMatches = (root: Stage3Root, history: readonly HistoryAction[]) => stage3HistoryKey(root.history) === stage3HistoryKey(history);
