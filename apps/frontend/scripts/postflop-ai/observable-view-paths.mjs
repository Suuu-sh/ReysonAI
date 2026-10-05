// Presentation/offline consumer boundary for imported flop labels. Numerical
// replay remains in the single observable-action module; legacy requests retain
// their exact structural semantics and error behavior.
import { flopState } from './tree.ts';
import { replayObservableStreet, usesObservableActions } from './observable-actions.mjs';

export function observableFlopRequest(spot, node, history) {
  const requested = flopState(spot.tree, history);
  if (!usesObservableActions(spot)) {
    if (requested.node !== node) throw new Error('Flop explanation history does not reach the node');
    return { node, history, state: requested };
  }
  const replay = replayObservableStreet({ spot, street: 'flop', actions: history });
  if (!replay.state.node || node !== requested.node && node !== replay.state.node) {
    throw new Error('New-HU history has no matching observable pending decision');
  }
  return { node: replay.state.node, history: replay.actions, state: replay.state };
}
