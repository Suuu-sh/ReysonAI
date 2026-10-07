import type { Mw3ActionGroup, Mw3Mix, Mw3Table } from './mw3-types.ts';
export function cloneMw3Table<T extends Mw3Table>(table: T): T;
export function mw3ActionGroups(table: Mw3Table): Mw3ActionGroup[];
export function mw3ObservableMix(table: Mw3Table, savedMix: Mw3Mix): Mw3Mix;
export function mw3ObservedProbability(groups: readonly Mw3ActionGroup[], savedMix: Mw3Mix, observedAction: string): number;
