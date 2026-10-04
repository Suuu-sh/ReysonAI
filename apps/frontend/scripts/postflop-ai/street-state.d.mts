import type { ActionObservation, Role, Chips } from './observable-actions.mjs';
export type OptionFacts = { action: string; amountBb: number; allIn: boolean; paid: number; aliases?: string[]; raisePercent?: number; betPercent?: number };
export type StreetStart = { pot: number; stacks: Chips; lastAggressor: Role | null };
export type ReplayFacts = {
  state: any; pot: number; stacks: Chips; trace: { role: Role; action: string; option: OptionFacts; callAllIn: boolean }[];
  chipsNow: { pot: number; committed: Chips; stacks: Chips; observation?: ActionObservation } | null;
  lastAggressor: Role | null; [key: string]: any;
};
export function postflopGeometry(spot?: any): any;
export function hasObservablePostflopActions(spot?: any): boolean;
export function canonicalStreetActions(street: string, actions: string[], start: StreetStart | undefined, spot?: any): string[];
export function canRaiseNow(chips: { pot: number; committed: Chips; stacks: Chips }, role: Role): boolean;
export function decisionOptionFacts(chips: any, node: string, street?: string): OptionFacts[];
export function replayFlop(actions?: string[], spot?: any): ReplayFacts;
export function laterStart(flopActions?: string[], spot?: any): StreetStart | null;
export function replayLater(street: string, actions: string[] | undefined, start: StreetStart, spot?: any): ReplayFacts;
export function laterDecisionState(street: string, actions: string[] | undefined, start: StreetStart, spot?: any): any;
