import type { PilotConfig, Street, RoleValues, ActionMix } from './types.ts';
import type { FlopTree, PlayerRole, BettingState, BettingStep } from './tree.ts';
import type { Table } from './engine.ts';
export type Role = PlayerRole;
export type Chips = RoleValues;
export type ObservableGeometry = { ip?: string; oop?: string; potBb: number; stackBb: number; tree?: FlopTree | string; history?: unknown };
export type ObservableClass = {
  action: string; aliases: string[]; key: string; paid: number; amountBb: number; allIn: boolean;
  family: string; terminal: string | null; nextActor: Role | null; canRaise: boolean;
  pot: number; stacks: Chips; committed: Chips;
};
export type ActionObservation = {
  node: string; street: string; role: Role; actions: string[]; canRaise: boolean;
  classes: ObservableClass[]; byAction: Record<string, ObservableClass>;
};
export type ObservableStep = BettingStep & { observation: ActionObservation };
export type ObservableState = BettingState & { steps: ObservableStep[] };
export type ObservableStart = { pot: number; stacks: Chips; lastAggressor?: Role | null };
export const NEW_HU_ACTION_MODEL_VERSION: 10;
export function usesObservableActions(spot: { history?: unknown } | null | undefined): boolean;
export function actionModelIdentity(spot: { history?: unknown } | null | undefined): { action_model_version?: number };
export function hasCurrentActionModel(spot: { history?: unknown } | null | undefined, report: { action_model_version?: number } | null | undefined): boolean;
export function roleOfPostflopNode(node: string): Role;
export function playedActionMass(mix: ActionMix, actions?: readonly string[]): ActionMix;
export function actionProjection(args: { street: string; node: string; role?: Role; pot: number; stacks: Chips; committed: Chips; config?: PilotConfig; tree?: string }): ActionObservation;
export function projectActionMix(mix: ActionMix, observation?: ActionObservation | null): ActionMix;
export function replayObservableStreet(args: { spot: ObservableGeometry; street: string; actions?: readonly string[]; start?: ObservableStart | null; config?: PilotConfig }): {
  actions: string[]; state: ObservableState; pot: number; stacks: Chips; committed: Chips; lastAggressor: Role | null; observation: ActionObservation | null;
};
export function canonicalPostflopPath(spot: ObservableGeometry, path: Partial<Record<Street, string[]>>, config?: PilotConfig): Record<Street, string[]>;
export function canonicalNodeForTable(table: Table, requested: string): string;
