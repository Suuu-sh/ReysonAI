// Declaration-only MW3 browser/Agent boundary. HU's five-tier HandTier remains
// separate; these nine labels describe the unchanged dedicated MW3 validator.
import type { Position, Street, FrequencyRow } from './types.ts';
export type Mw3Tier = 'absolute_nuts' | 'nuts' | 'monster' | 'strong' | 'draw' | 'medium' | 'air' | 'board_shared' | 'board_locked';
export type Mw3Role = 'first' | 'middle' | 'last';
export type Mw3Mix = Record<string, number>;
export type Mw3Geometry = { kind: 'mw3_srp'; seats: Position[]; potBb: number; stackBb: number; stacks?: never };
export type Mw3Spot = { id: string; kind: 'mw3_srp'; opener: Position; firstCaller: Position; secondCaller: Position;
  seats: Position[]; roles: Record<string, Mw3Role>; potBb: number; stackBb: number; openBb: number; reachable: boolean;
  slug: string; sources: { openingId: string; firstResponseId: string; multiwayResponseId: string };
  seatRows: Record<string, FrequencyRow[]>; unavailableReason?: string };
export type Mw3Inputs = { spot: Mw3Spot; seatRows: Record<string, FrequencyRow[]>; fingerprint: string };
export type Mw3Selector = { line: 'any' | 'checked' | 'aggressor' | 'defender'; texture: string; players: 'any' | 2 | 3;
  position: 'any' | Mw3Role; response: 'any' | 'none' | 'cold' | 'invested'; price: 'any' | 'none' | 'cheap' | 'standard' | 'expensive';
  spr: 'any' | 'shallow' | 'medium' | 'deep' };
export type Mw3Policy = { version: 3; kind: 'ai_estimate_not_gto'; spot_id: string; streets: Street[];
  rules: { node: string; tier: Mw3Tier; when: Mw3Selector; priority: number; mix: Mw3Mix }[] };
export type Mw3Policies = { flop: Mw3Policy; later: Mw3Policy };
export type Mw3ActionGroup = { action: string; actions: string[]; amountBb: number; toBb: number; allIn: boolean; resultingPotBb: number };
export type Mw3End = { type: 'fold' | 'street_complete' | 'all_in_runout'; winner?: Position };
export type Mw3PendingDecision = { end?: never; seat: Position; role: Mw3Role; node: string; street: Street; actions: string[];
  facing: boolean; lowSpr: boolean; raises: number; pendingBehind: Position[]; liveSeats: Position[]; potBb: number; callBb: number;
  stackBb: number; committedBb: number; currentBetBb: number; activePosition: Mw3Role; players: number;
  responseType: 'invested' | 'cold' | 'none'; callPrice: number | null; priceBand: 'cheap' | 'standard' | 'expensive' | 'none';
  sprAfterCall: number; sprBand: 'shallow' | 'medium' | 'deep'; line: 'checked' | 'aggressor' | 'defender' };
export type Mw3Decision = Mw3PendingDecision | { end: Mw3End };
export type Mw3LogEntry = Mw3PendingDecision & { index: number; action: string; amountBb: number; pot: number };
export type Mw3StreetState = { street: Street; committed: Record<string, number>; currentBet: number; betAction: string | null;
  raises: number; aggressor: Position | null; previousAggressor: Position | null; pending: Position[]; end: Mw3End | null };
export type Mw3Table = { kind: 'mw3_srp'; spot: Mw3Geometry; seats: Position[]; stacks: Record<string, number>; invested: Record<string, number>;
  pot: number; initialTotal: number; folded: Position[]; winner: Position | null; winners: Position[]; lastAggressor: Position | null;
  street: Street | null; streetState: Mw3StreetState | null; log: Mw3LogEntry[]; path: Record<Street, string[]>; settled: boolean };
export type Mw3Settlement = { winner: Position | null; winners: Position[]; potBb: number; rakeBb: number; refundBb: number;
  payouts: Record<string, number>; finalStacks: Record<string, number> };
export type Mw3PlayResult =
  | { status: 'awaiting'; board: number[]; pending: Mw3PendingDecision & { actionGroups: Mw3ActionGroup[] }; table: Mw3Table }
  | { status: 'done'; board: number[]; settlement: Mw3Settlement; table: Mw3Table & { streetState: Mw3StreetState & { end: Mw3End } } };
export type Mw3RangeCombo = { cards: number[]; reachWeight: number; tier: Mw3Tier; actions: Mw3Mix | null };
export type Mw3RangeRow = { hand: string; reachWeight: number; combos: Mw3RangeCombo[]; actions: Mw3Mix | null };
export type Mw3Participant = { seat: Position; originalRole: Mw3Role; acting: boolean; displayKind: 'current_saved_strategy' | 'historical_policy_reach';
  rows: Mw3RangeRow[]; totalReachWeight: number; actions: Record<string, number | null> | null };
export type Mw3DecisionView = { spotId: string; kind: 'mw3_srp'; board: number[]; potBb: number; stacks: Record<string, number>;
  folded: Position[]; decision: Mw3Decision; actionGroups: Mw3ActionGroup[]; participants: Mw3Participant[]; history: Mw3LogEntry[];
  frequencySemantics: 'own_action_reach_weighted_saved_mix_observable_aliases_summed'; rangeWeighting: 'not_joint_blocker_mass_reweighted';
  explanationFacts: { originPlayers: 3; currentPlayers: number; activePosition: Mw3Role; priorStreetLine: string; responseType: string;
    pendingPlayers: number; potBb: number; callBb: number; requiredEquity: number | null; sprAfterCall: number; computedDefence: false } | null };
