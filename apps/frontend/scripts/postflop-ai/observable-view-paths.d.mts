import type { ObservableGeometry } from './observable-actions.ts';
import type { BettingState } from './tree.ts';
export function observableFlopRequest(spot: ObservableGeometry, node: string, history: string[]): {
  node: string; history: string[]; state: BettingState;
};
