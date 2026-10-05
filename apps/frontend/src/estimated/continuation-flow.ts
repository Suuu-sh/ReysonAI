/// <reference lib="es2023.array" />
import type { ActionBlock, RangeUrlSelection } from "./range-url.ts";
import type { ContinuationRoot } from "./continuation-tree.ts";
type FlowSelection = Pick<RangeUrlSelection, "rangeType" | "opener" | "hero"> & Partial<Pick<RangeUrlSelection, "callers" | "pendingRaise" | "coldAction">>;
type FlowChoices = Partial<Pick<RangeUrlSelection, "squeezeResponse" | "continuationActions">>;
// UI navigation uses the frequency-free catalog; strategy availability is a
// separate read-only check. A missing policy never changes the recorded path.
import { continuationRoots, continuationById, continuationTerminals } from './continuation-tree.ts';

const terminals = new Map(continuationTerminals.map(node => [node.id, node]));
const savedAction = (action: string) => action === 'raise' ? 'four_bet' : action;
const uiAction = <T extends string | null | undefined>(action: T) => action === 'four_bet' ? 'raise' : action;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function continuationRootForSelection({ rangeType, opener, hero, callers = [], pendingRaise, coldAction }: FlowSelection) {
  return continuationRoots.find(root => root.opener === opener && (
    pendingRaise === 'squeeze' && rangeType === 'response'
      ? root.squeezer === hero && same(root.callers, callers)
      : rangeType === 'three_bet' && coldAction
        ? root.three_bettor === hero && (coldAction.action === 'call'
          ? root.family === 'three_bet_cold_call' && root.cold_caller === coldAction.position
          : coldAction.action === 'raise' && root.family === 'cold_four_bet' && root.four_bettor === coldAction.position)
        : false)) ?? null;
}

export function continuationChoices(root: ContinuationRoot, { squeezeResponse = [], continuationActions = [] }: FlowChoices) {
  return [...(root.family === 'squeeze' ? squeezeResponse : []), ...continuationActions].map(savedAction);
}

// Preserve the existing squeeze fields for old saved sessions and shared URLs.
// Only the newly supported decisions live in continuationActions.
export function chooseContinuationAction(state: FlowChoices, block: Pick<ActionBlock, "priorContinuationActions" | "continuationFamily">, action: string | null) {
  const choices = block.priorContinuationActions ?? [];
  const next = action == null ? choices : [...choices, savedAction(action)];
  const legacyCount = block.continuationFamily === 'squeeze'
    ? next.length && next[0] !== 'four_bet' ? Math.min(2, next.length) : Math.min(1, next.length)
    : 0;
  return { squeezeResponse: next.slice(0, legacyCount).map(uiAction), continuationActions: next.slice(legacyCount) };
}

export function appendContinuationBlocks(blocks: ActionBlock[], root: ContinuationRoot, state: FlowChoices): ActionBlock[] {
  // Complete the initial lap, including seats behind a cold caller/raiser. All
  // outside seats in this bounded catalog are explicit forced folds.
  const result: ActionBlock[] = root.history.map((event, index) => {
    const previous = blocks.find(block => block.position === event.seat && !block.key.startsWith('continuation-'));
    if (!previous) throw new Error(`Missing initial seat ${event.seat}`);
    return { ...previous,
      chosen: event.action === 'fold' ? 'fold' : event.action === 'call' ? 'call' : 'raise',
      ...(event.source ? { rangeRef: { kind: 'saved-source', position: event.seat, dataset: event.source.dataset, id: event.source.spot_id } } : {}),
      ...(event.forced && index > root.history.findLastIndex(item => item.source) ? { kind: 'forced', active: false,
        options: [{ action: 'fold', label: 'Fold', disabled: true }] } : {}),
    };
  });
  const choices = continuationChoices(root, state);
  let id = root.first_decision_id!;
  const prior: string[] = [];
  for (let index = 0; index < 32; index++) {
    const terminal = terminals.get(id);
    if (terminal) {
      // Return an unmatched wager when everybody folds. Flop terminals retain
      // every folded participant's actual contribution as dead money.
      const paid = Object.values(terminal.contributions_bb).sort((a, b) => b - a);
      const pot = terminal.terminal === 'uncontested' ? terminal.pot_bb - (paid[0] - paid[1]) : terminal.pot_bb;
      result.push({ key: 'end', position: '終了', stack: '', kind: 'end', active: false, chosen: null, options: [],
        result: terminal.terminal === 'flop' ? `${terminal.live_participants.length}人でフロップへ`
          : terminal.terminal === 'all_in' ? 'オールイン・ショウダウン' : `${terminal.live_participants[0]}の勝ち`,
        pot: `ポット ${pot}bb`, postflopEvents: terminal.history, continuationTerminal: terminal });
      return result;
    }
    const node = continuationById.get(id);
    if (!node) throw new Error(`Unknown continuation ${id}`);
    const asked = choices[index];
    const chosen = (node.legal_actions as readonly string[]).includes(asked) ? asked : null;
    const legacy = root.family === 'squeeze' && node.reused;
    result.push({ key: `bounded-${node.id}`, position: node.hero, stack: String(100 - node.contributions_bb[node.hero]),
      kind: legacy ? 'squeeze-response' : 'bounded-continuation', role: index === 0 ? 'opener' : 'caller',
      continuationFamily: root.family, continuationNode: node, priorContinuationActions: [...prior],
      rangeRef: { kind: 'bounded', position: node.hero, id: node.id },
      active: !chosen, chosen: uiAction(chosen), options: node.legal_actions.map(action => ({ action: uiAction(action),
        label: action === 'fold' ? 'Fold' : `${action === 'call' ? 'Call' : action === 'all_in' ? 'Allin' : 'Raise'} ${node.action_sizes_bb[action]}` })) });
    if (!chosen) return result;
    prior.push(chosen);
    id = node.children[chosen];
  }
  throw new Error('Continuation exceeds the bounded catalog');
}

export function continuationLiveSeats(blocks: readonly Pick<ActionBlock, "continuationTerminal" | "continuationNode">[]) {
  const last = blocks.at(-1);
  return last?.continuationTerminal?.live_participants ?? last?.continuationNode?.live_participants ?? null;
}
