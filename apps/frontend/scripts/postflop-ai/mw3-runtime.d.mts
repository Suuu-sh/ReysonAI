import type { Position, Street } from './types.ts';
import type { Mw3Inputs, Mw3Policies, Mw3PlayResult, Mw3DecisionView } from './mw3-types.ts';
export function playMw3WithPolicies(inputs: Mw3Inputs, policies: Mw3Policies, options: {
  hands: Record<string, number[]>; board: number[]; human?: Position | null; humanActions?: string[]; random: () => number;
}): Mw3PlayResult;
export function mw3DecisionView(inputs: Mw3Inputs, policies: Mw3Policies, options: { board: number[]; paths: Partial<Record<Street, string[]>> }): Mw3DecisionView;
