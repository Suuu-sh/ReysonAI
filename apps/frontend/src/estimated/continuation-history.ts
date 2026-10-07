// Shared exact-history lookup. Match the full initial lap, including forced
// folds and raise-to sizes; an approximate HU history is never substituted.
import { continuationDecisions, continuationTerminals } from './continuation-tree.ts';

type Event = { seat?: string; pos?: string; action?: string; key?: string; to_size_bb?: number | null; to?: number };
export function continuationHistoryKey(history: Event[]) {
  return JSON.stringify(history.map(item => {
    const action = item.action ?? item.key;
    return [item.seat ?? item.pos, action, action === 'fold' ? null : item.to_size_bb ?? item.to ?? null];
  }));
}
const decisions = new Map(continuationDecisions.map(node => [continuationHistoryKey(node.history), node]));
const terminals = new Map(continuationTerminals.map(node => [continuationHistoryKey(node.history), node]));
export const continuationDecisionForEvents = (history: Event[]) => decisions.get(continuationHistoryKey(history)) ?? null;
export const continuationTerminalForEvents = (history: Event[]) => terminals.get(continuationHistoryKey(history)) ?? null;
