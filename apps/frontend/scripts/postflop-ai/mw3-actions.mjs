// Observe amounts, not hidden policy button labels. Several configured bets can merge
// into the same all-in; their probabilities belong to one public poker action.
import { applyMw3Action, mw3Decision } from './mw3-engine.mjs';
import { mw3StateKey } from './mw3-tree.mjs';
export function cloneMw3Table(table) {
  return { ...structuredClone({ ...table, spot: null }), spot: table.spot };
}
export function mw3ActionGroups(table) {
  const decision = mw3Decision(table);
  if (decision.end) return [];
  const groups = new Map();
  for (const action of decision.actions) {
    const next = cloneMw3Table(table); applyMw3Action(next, action);
    const key = mw3StateKey(next), existing = groups.get(key);
    if (existing) { existing.actions.push(action); if (action === 'allin') existing.action = action; }
    else groups.set(key, { action, actions: [action], amountBb: next.log.at(-1).amountBb, resultingPotBb: next.pot });
  }
  return [...groups.values()];
}
export function mw3ObservableMix(table, savedMix) {
  const groups = mw3ActionGroups(table), legal = groups.flatMap(group => group.actions);
  if (Object.keys(savedMix).sort().join() !== [...legal].sort().join() || legal.some(action => !Number.isFinite(savedMix[action]) || savedMix[action] < 0) ||
      Math.abs(legal.reduce((sum, action) => sum + savedMix[action], 0) - 100) > 1e-9) throw new Error('Invalid saved mix for observable mw3 actions');
  return Object.fromEntries(groups.map(group => [group.action, group.actions.reduce((sum, action) => sum + savedMix[action], 0)]));
}
export function mw3ObservedProbability(groups, savedMix, observedAction) {
  const group = groups.find(group => group.actions.includes(observedAction));
  if (!group) throw new Error('Unrecognized observed mw3 action');
  return group.actions.reduce((sum, action) => sum + savedMix[action], 0) / 100;
}
