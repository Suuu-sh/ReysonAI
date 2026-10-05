import type { ActionObservation, ObservableClass, Role, Chips } from './observable-actions.mjs';
import type { BettingState, BettingOutcome, FlopTree } from './tree.ts';
import type { PreviousLine } from './types.ts';
export type GeometryInput = { ip?: string | null; oop?: string | null; potBb?: number | null; stackBb?: number | null; tree?: FlopTree | null; spotId?: string | null; history?: unknown };
export type Geometry = { ip: string; oop: string; potBb: number; stackBb: number; tree: FlopTree; spotId?: string | null; history?: unknown };
export type OptionFacts = { action: string; amountBb: number; allIn: boolean; paid: number; aliases?: string[]; raisePercent?: number; betPercent?: number };
export type StreetStart = { pot: number; stacks: Chips; lastAggressor: Role | null };
export type DecisionChips = { pot: number; committed: Chips; stacks: Chips; observation?: ActionObservation | null };
export type FacedAction = Pick<ObservableClass, 'action' | 'allIn' | 'amountBb'>;
export type ReplayFacts = {
  state: BettingState; pot: number; stacks: Chips; trace: { role: Role; action: string; option: OptionFacts; callAllIn: boolean }[];
  chipsNow: DecisionChips | null; lastAggressor: Role | null; end?: BettingOutcome | null; facedAction?: FacedAction | null;
};
export type FlopReplayFacts = ReplayFacts & { g: Geometry; invested: Chips; stackNow: number | null; stacksBefore?: number[] };
export type LaterDecisionState =
  | { street: string; end: BettingOutcome | null | undefined; potBb: number; stacks: Chips; lastAggressor: Role | null; node?: never; actor?: never; role?: never; options?: never; line?: never; facedAction?: never }
  | { street: string; node: string; actor: string; role: Role; potBb: number; options: OptionFacts[]; line: PreviousLine; lastAggressor: Role | null; facedAction?: FacedAction; end?: never; stacks?: never };
export function postflopGeometry(spot?: GeometryInput | null): Geometry;
export function hasObservablePostflopActions(spot?: GeometryInput | null): boolean;
export function canonicalStreetActions(street: string, actions: readonly string[], start: StreetStart | undefined | null, spot?: GeometryInput | null): string[];
export function canRaiseNow(chips: DecisionChips, role: Role): boolean;
export function decisionOptionFacts(chips: DecisionChips, node: string, street?: string): OptionFacts[];
export function replayFlop(actions?: readonly string[], spot?: GeometryInput | null): FlopReplayFacts;
export function laterStart(flopActions?: readonly string[], spot?: GeometryInput | null): StreetStart | null;
export function replayLater(street: string, actions: readonly string[] | undefined, start: StreetStart, spot?: GeometryInput | null): ReplayFacts;
export function laterDecisionState(street: string, actions: readonly string[] | undefined, start: StreetStart, spot?: GeometryInput | null): LaterDecisionState;
