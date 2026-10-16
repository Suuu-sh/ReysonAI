import type { Mw3ActionGroup, Mw3Mix, Mw3Table } from './mw3-types.ts';
// Observe amounts, not hidden policy button labels. Several configured bets can merge
// into the same all-in; their probabilities belong to one public poker action.
import { applyMw3Action, mw3Decision } from './mw3-engine.ts';
import { mw3StateKey } from './mw3-tree.ts';
export function cloneMw3Table<T extends Mw3Table>(table: T): T;
export function cloneMw3Table(table?: any) : any {
  return { ...structuredClone({ ...table, spot: null }), spot: table.spot };
}
export function mw3ActionGroups(table: Mw3Table): Mw3ActionGroup[];
export function mw3ActionGroups(table?: any) : any {
  const decision: any = mw3Decision(table);
  if (decision.end) return ([] as any[]);
  const groups = new Map();
  for (const action of decision.actions) {
    const next = cloneMw3Table(table); applyMw3Action(next, action);
    const key = mw3StateKey(next), existing = groups.get(key);
    if (existing) { existing.actions.push(action); if (action === 'allin') existing.action = action; }
    else groups.set(key, { action, actions: [action], amountBb: next.log.at(-1).amountBb, toBb: next.streetState.committed[decision.seat], allIn: next.stacks[decision.seat] === 0, resultingPotBb: next.pot });
  }
  return [...groups.values()];
}
export function mw3ObservableMix(table: Mw3Table, savedMix: Mw3Mix): Mw3Mix;
export function mw3ObservableMix(table?: any, savedMix?: any) : any {
  const groups = mw3ActionGroups(table), legal = groups.flatMap((group: any) : any => group.actions);
  if (Object.keys(savedMix).sort().join() !== [...legal].sort().join() || legal.some((action: any) : any => !Number.isFinite(savedMix[action]) || savedMix[action] < 0) ||
      Math.abs(legal.reduce((sum?: any, action?: any) : any => sum + savedMix[action], 0) - 100) > 1e-9) throw new Error('Invalid saved mix for observable mw3 actions');
  return Object.fromEntries(groups.map((group: any) : any => [group.action, group.actions.reduce((sum?: any, action?: any) : any => sum + savedMix[action], 0)]));
}
export function mw3ObservedProbability(groups: readonly Mw3ActionGroup[], savedMix: Mw3Mix, observedAction: string): number;
export function mw3ObservedProbability(groups?: any, savedMix?: any, observedAction?: any) : any {
  const group = groups.find((group: any) : any => group.actions.includes(observedAction));
  if (!group) throw new Error('Unrecognized observed mw3 action');
  return group.actions.reduce((sum?: any, action?: any) : any => sum + savedMix[action], 0) / 100;
}
