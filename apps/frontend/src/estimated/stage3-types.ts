// Structural Stage3 contracts. Type-only imports never load saved data or author policies.
import type { HistoryAction, SourceFactor, ContinuationDecision, ContinuationTerminal } from './continuation-tree.ts';
import type { FrequencyRow, ContinuationSourceDatasets } from './preflop-types.ts';
import type { CallInput } from './call-ev.ts';
import type { ContinuationEquity } from './continuation-model.ts';
import type { JointDefenseRecord } from './continuation-defense.ts';
import type { AuditFinding, RangeBalanceSummary, ContinuationCapacity } from './continuation-audit.ts';

export type Stage3Action = 'fold' | 'call' | 'squeeze' | 'four_bet' | 'all_in';
export type Stage3Family = 'squeeze_extra' | 'two_caller_squeeze_extra' | 'three_bet_cold_call_extra' | 'cold_four_bet_extra' | 'three_callers' | 'four_callers';
export type Stage3State = {
  contributions_bb: Record<string, number>; folded: string[]; all_in: string[]; pending_actors: string[];
  facing_size_bb: number; last_raise_increment_bb: number; bet_level: number;
  history: HistoryAction[]; source_factors: Record<string, SourceFactor[]>;
};
export type Stage3Root = {
  id: string; family: Stage3Family; opener: string; callers: string[]; entrant: string;
  squeezer?: string; three_bettor?: string; cold_caller?: string; four_bettor?: string;
  participants: string[]; history: HistoryAction[]; open_size_bb: number;
  three_bet_size_bb: number | null; four_bet_size_bb: number | null;
  first_decision_id: string; stage2_root_id?: string; fold_boundary_id?: string; rare_eligible: boolean;
};
export type Stage3Decision = Stage3State & {
  id: string; root_id: string; family: Stage3Family; dataset: string; reused: boolean;
  hero: string; opener: string; callers: string[]; entrant: string;
  squeezer?: string; three_bettor?: string; cold_caller?: string; four_bettor?: string;
  participants: string[]; live_participants: string[]; effective_stack_bb: number; open_size_bb: number;
  three_bet_size_bb: number | null | undefined; four_bet_size_bb: number | null;
  minimum_raise_to_bb: number | null; pot_bb: number; dead_money_bb: number;
  cost_to_call_bb: number; total_pot_after_call_bb: number;
  legal_actions: Stage3Action[]; action_sizes_bb: Record<string, number | null>;
  parent_id: string | null; parent_action: Stage3Action | null; children: Record<string, string>;
};
export type Stage3Terminal = Stage3State & {
  id: string; root_id: string; family: Stage3Family; terminal: 'uncontested' | 'flop' | 'all_in';
  participants: string[]; live_participants: string[]; pot_bb: number; dead_money_bb: number;
  parent_id: string | null; parent_action: Stage3Action | null;
};
export type Stage3Boundary = { id: string; root_id: string; parent_id: string; parent_action: 'fold'; dataset: string; target_id: string; assumption: string };
export type Stage3Tree = { roots: Stage3Root[]; spots: Stage3Decision[]; all_decisions: Stage3Decision[]; terminals: Stage3Terminal[]; boundaries: Stage3Boundary[] };
export type Stage3UiTree = Stage3Tree & { root: Stage3Root; nodes: Map<string, Stage3Decision>; terminalById: Map<string, Stage3Terminal>; boundaryById: Map<string, Stage3Boundary> };
export type Stage3Hand = { hand: string; fold: number; call: number; squeeze: number; four_bet: number; all_in: number; raise_to_size_bb: number | null };
export type Stage3StoredSpot = Stage3Decision & { unreachable: boolean; hands: Stage3Hand[] };
export type Stage3SourceSpot = { id: string; hands: readonly FrequencyRow[]; root_id?: string; unreachable?: boolean };
export type Stage3Metadata = {
  families: Stage3Family[]; root_ids?: string[]; schema_version: string; storage: string; strategy_type: string;
  game: string; effective_stack_bb: number; open_size_bb: number; ante_bb: number; legal_actions: Stage3Action[];
  rake: { rate: number; cap_bb: number; no_flop_no_drop: boolean; calibrated?: boolean };
};
export type Stage3Dataset = { metadata: Stage3Metadata; spots: Stage3StoredSpot[]; spot_count: number; hand_classes_per_spot: number; entry_count: number; catalog_spot_count: number; omitted_unreachable_count: number; omitted_rare_count: number };
export type Stage3Sources = Record<string, { spots: readonly Stage3SourceSpot[] } | null | undefined>;
export type Stage3SourceDatasets = ContinuationSourceDatasets & { 'stage3-responses'?: Stage3Dataset | null };
export type Stage3UiDatasets = Stage3Sources & { 'stage3-responses'?: Stage3Dataset | null };
export type Stage3Context<S = Stage3SourceSpot> = { type: string; node: Stage3Decision; spot: S; input: CallInput; reach: (hand: string) => number; historyPossible: boolean; unreachable: boolean; weights: Record<string, Map<string, number>> };
export type Stage3RootEvidence = {
  root_id: string; observed_participants: number;
  known: { seat: string; factors: SourceFactor[]; independent_support: number }[];
  unresolved: { seat: string; factors: SourceFactor[] }[];
  independent_product: number | null; independent_product_upper_bound: number;
  random_tuple_disjoint_probability: number; exact_joint_reach: null; joint_reach_upper_bound: number;
  threshold_probability: number; rare: boolean; probability_units: string; method: string;
};
export type Stage3Equity = ContinuationEquity;
export type Stage3EquityTable = { version: number; seed: string; spots: Record<string, Stage3Equity>; joint_defense?: Record<string, JointDefenseRecord> };
export type Stage3DefenseResponder = { node: Stage3Decision; context: Stage3Context; spot: Stage3SourceSpot; foldRate: number; capacity: ContinuationCapacity | null };
export type Stage3DefenseEvent = { id: string; spot: string; risk_bb: number; pot_before_raise_bb: number; threshold: number; foldRate: number; minimumFoldRate: number; group: Stage3DefenseResponder[] };
export type Stage3AuditHelpers = { allowPartial?: boolean; checkCrossStrengthInversion?: (spot: Stage3StoredSpot, reach: (hand: string) => number) => AuditFinding[]; checkRangeBalance?: (spot: Stage3StoredSpot, reach: (hand: string) => number, exemption: string | null) => RangeBalanceSummary };

export type Stage3Selection = { rangeType: string; opener: string; hero: string; callers?: string[]; pendingRaise?: string | null; foldedHero?: boolean; coldAction?: { position: string; action: string } | null; stage3RootId?: string | null; stage3Actions?: string[]; squeezeResponse?: string[]; continuationActions?: string[] };
export type Stage3RangeRef = { kind: string; position: string; id?: string; rootId?: string; dataset?: string; extraSeat?: boolean };
export type Stage3Block = {
  key: string; position: string; stack: string; kind: string; active: boolean; chosen: string | null | undefined;
  options: { action: string; label: string; disabled?: boolean }[]; rangeRef?: Stage3RangeRef;
  stage3RootId?: string; stage3Node?: Stage3Decision; priorStage3Actions?: string[]; stage3Terminal?: Stage3Terminal;
  continuationNode?: ContinuationDecision; continuationTerminal?: ContinuationTerminal;
  result?: string; pot?: string; postflopEvents?: HistoryAction[]; continuationAvailable?: boolean; continuationStatus?: string; stage3Status?: string;
};
export type Stage3UiSupport = { reach: (hand: string) => number; unreachable: boolean };
export type Stage3UiEvidence = { joint_reach_upper_bound: number; rare: boolean };
export type Stage3UiModel = import("../data.ts").MatrixModel;
export type Stage3UiResult =
  | { status: 'saved'; node?: Stage3Decision | ContinuationDecision | null; spot: Stage3SourceSpot; model: Stage3UiModel }
  | { status: 'rare'; node?: Stage3Decision; reach: Stage3UiEvidence }
  | { status: 'unreachable' | 'missing'; node?: Stage3Decision | ContinuationDecision | null; source?: string };
export type Stage3TerminalResult = { status: 'saved' | 'unreachable' | 'missing' | 'rare'; reach?: Stage3UiEvidence; source?: string };
export type Stage3UiRuntime = { select: (ref: Stage3RangeRef) => Stage3UiResult; selectTerminal: (terminal: Stage3Terminal) => Stage3TerminalResult };
export type LoadedStage3UiRuntime = Stage3UiRuntime & { missingSources: string[] };

export type Stage3ReasonFacts = { [key: string]: number | string | null | undefined; unreachable_reason?: string; reach_pct: number; equity_pct: number | null; eqr: number | null; realized_equity_pct: number | null; call_ev_bb: number | null; equity_margin_pct?: number | null; all_in_target_call_pct?: number | null; raise_to_size_bb?: number | null };
export type Stage3ReasonSpot = { bet_level: number; pending_actors: string[]; family_label: string; hero: string; role: string; hero_invested_bb: number; cost_to_call_bb: number; facing_size_bb: number; total_pot_after_call_bb: number; dead_money_bb: number; dead_opponents: string[]; opponents: string[]; call_break_even_equity_pct: number };
export type Stage3SavedReasons = { spot_id: string; source_fingerprint: string; spot: Stage3ReasonSpot; hands: Stage3ReasonFacts[] };
export type Stage3CompactReasons = { schema_version?: string; type: string; spot_id: string; source_fingerprint: string; spot_facts: Stage3ReasonSpot; unreachable: string[]; rows: (number | (number | null)[])[] };
