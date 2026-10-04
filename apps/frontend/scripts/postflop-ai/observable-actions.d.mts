export type Role = 'ip' | 'oop';
export type Chips = Record<Role, number>;
export type ObservableClass = {
  action: string; aliases: string[]; key: string; paid: number; amountBb: number; allIn: boolean;
  family: string; terminal: string | null; nextActor: Role | null; canRaise: boolean;
  pot: number; stacks: Chips; committed: Chips;
};
export type ActionObservation = {
  node: string; street: string; role: Role; actions: string[]; canRaise: boolean;
  classes: ObservableClass[]; byAction: Record<string, ObservableClass>;
};
export const NEW_HU_ACTION_MODEL_VERSION: 10;
export function usesObservableActions(spot: any): boolean;
export function actionModelIdentity(spot: any): { action_model_version?: number };
export function hasCurrentActionModel(spot: any, report: any): boolean;
export function roleOfPostflopNode(node: string): Role;
export function playedActionMass(mix: Record<string, number>, actions?: string[]): Record<string, number>;
export function actionProjection(args: { street: string; node: string; role?: Role; pot: number; stacks: Chips; committed: Chips; config?: any; tree?: string }): ActionObservation;
export function projectActionMix(mix: Record<string, number>, observation?: ActionObservation | null): Record<string, number>;
export function replayObservableStreet(args: { spot: any; street: string; actions?: string[]; start?: any; config?: any }): {
  actions: string[]; state: any; pot: number; stacks: Chips; committed: Chips; lastAggressor: Role | null; observation: ActionObservation | null;
};
export function canonicalPostflopPath(spot: any, path: { flop?: string[]; turn?: string[]; river?: string[] }, config?: any): { flop: string[]; turn: string[]; river: string[] };
export function canonicalNodeForTable(table: any, requested: string): string;
