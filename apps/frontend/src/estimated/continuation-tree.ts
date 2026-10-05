import { coldThreeBetSpots } from "./cold-three-bet-responses.ts";
import { multiwaySpots } from "./multiway-responses.ts";
import { multiway2Spots } from "./multiway2-responses.ts";
import {
  effectiveStackBb, fourBetToSize, openSizeFor, positions,
  squeezeFourBetToSize, threeBetToSize, twoCallerSqueezeToSize, twoCallerSqueezeFourBetToBb,
} from "./sizing.ts";

/** Structural, frequency-free catalog. A zero-frequency predecessor does not
 * prune a decision: the authoring generator must preserve it as a fold-100
 * placeholder. Frequencies remain conditional, never reach-weighted here.
 * All other seats fold; a root never admits an additional outside cold caller.
 */
export const continuationDataset = "continuation-responses";
export const continuationFamilies = ["squeeze", "cold_four_bet", "two_caller_squeeze", "three_bet_cold_call"] as const;
export const twoCallerFourBetToBb = twoCallerSqueezeFourBetToBb;
export const continuationPlaceholderContract = {
  structural_zero_action_branches: "retained",
  zero_hero_reach_or_history_reach: "fold100",
  conditional_frequencies: true,
  absent_or_malformed_source: "error",
} as const;

export type ContinuationFamily = typeof continuationFamilies[number];
export type ContinuationAction = "fold" | "call" | "four_bet" | "all_in";
export type SourceFactor = { dataset: string; spot_id: string; action: string };
export type HistoryAction = {
  seat: string; action: string; to_size_bb: number | null;
  forced: boolean; source: SourceFactor | null;
};
export type ContinuationRoot = {
  id: string; family: ContinuationFamily; opener: string; callers: string[];
  squeezer?: string; three_bettor?: string; cold_caller?: string; four_bettor?: string;
  participants: string[]; history: HistoryAction[];
  open_size_bb: number; three_bet_size_bb: number; four_bet_size_bb: number | null;
  first_decision_id?: string;
};
type State = {
  contributions_bb: Record<string, number>;
  folded: string[]; all_in: string[]; pending_actors: string[];
  facing_size_bb: number; last_raise_increment_bb: number; bet_level: number;
  history: HistoryAction[]; source_factors: Record<string, SourceFactor[]>;
};
export type ContinuationDecision = State & {
  id: string; root_id: string; family: ContinuationFamily; dataset: string; reused: boolean;
  hero: string; opener: string; callers: string[]; squeezer?: string;
  three_bettor?: string; cold_caller?: string; four_bettor?: string;
  participants: string[]; live_participants: string[]; effective_stack_bb: number;
  open_size_bb: number; three_bet_size_bb: number; four_bet_size_bb: number | null;
  minimum_raise_to_bb: number | null; pot_bb: number; dead_money_bb: number;
  cost_to_call_bb: number; total_pot_after_call_bb: number;
  legal_actions: ContinuationAction[]; action_sizes_bb: Record<string, number | null>;
  parent_id: string | null; parent_action: ContinuationAction | null;
  children: Record<string, string>;
};
export type ContinuationTerminal = State & {
  id: string; root_id: string; family: ContinuationFamily;
  terminal: "uncontested" | "flop" | "all_in";
  participants: string[]; live_participants: string[];
  pot_bb: number; dead_money_bb: number;
  parent_id: string; parent_action: ContinuationAction;
};

const source = (dataset: string, spot_id: string, action: string): SourceFactor => ({ dataset, spot_id, action });
const action = (seat: string, name: string, size: number | null, ref: SourceFactor | null): HistoryAction =>
  ({ seat, action: name, to_size_bb: size, forced: ref === null, source: ref });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const blind = (seat: string) => seat === "SB" ? 0.5 : seat === "BB" ? 1 : 0;
const cyclicAfter = (seat: string) => {
  const index = positions.indexOf(seat);
  if (index === -1) throw new Error(`Unknown preflop seat: ${seat}`);
  return [...positions.slice(index + 1), ...positions.slice(0, index)];
};
const actionTokens: Record<string, string> = { open: "o", call: "c", fold: "f", squeeze: "s", three_bet: "t", four_bet: "r", all_in: "a" };
const historyKey = (history: HistoryAction[]) => history.map(item =>
  `${item.seat}${actionTokens[item.action]}${item.to_size_bb === null ? "" : String(item.to_size_bb).replace(".", "p")}`).join("_");
const prefixes: Record<ContinuationFamily, string> = { squeeze: "sq", cold_four_bet: "c4", two_caller_squeeze: "sq2", three_bet_cold_call: "cc" };

function makeRoot(family: ContinuationFamily, roles: {
  opener: string; callers?: string[]; squeezer?: string;
  three_bettor?: string; cold_caller?: string; four_bettor?: string;
}, participantActions: HistoryAction[]): ContinuationRoot {
  const bySeat = new Map(participantActions.map(item => [item.seat, item]));
  const history = positions.map(seat => bySeat.get(seat) ?? action(seat, "fold", null, null));
  const threeBet = participantActions.find(item => ["squeeze", "three_bet"].includes(item.action));
  const fourBet = participantActions.find(item => item.action === "four_bet");
  if (!threeBet || participantActions.length !== bySeat.size) throw new Error("Invalid continuation root");
  return {
    id: `${prefixes[family]}_${historyKey(history)}`,
    family, ...roles, callers: roles.callers ?? [],
    participants: participantActions.map(item => item.seat), history,
    open_size_bb: openSizeFor(roles.opener), three_bet_size_bb: threeBet.to_size_bb!,
    four_bet_size_bb: fourBet?.to_size_bb ?? null,
  };
}

export function enumerateContinuationRoots(): ContinuationRoot[] {
  const roots: ContinuationRoot[] = [];
  const opening = (opener: string) => action(opener, "open", openSizeFor(opener), source("opening-ranges", `${opener}_open`, "open"));
  for (const { opener, caller, hero: squeezer } of multiwaySpots) {
    roots.push(makeRoot("squeeze", { opener, callers: [caller], squeezer }, [
      opening(opener), action(caller, "call", openSizeFor(opener), source("preflop-ranges", `${caller}_vs_${opener}`, "call")),
      action(squeezer, "squeeze", threeBetToSize(opener, squeezer, 1), source("multiway-responses", `${squeezer}_vs_${opener}_${caller}call`, "squeeze")),
    ]));
  }
  for (const spot of coldThreeBetSpots) {
    const { opener, three_bettor: x, hero: y } = spot;
    roots.push(makeRoot("cold_four_bet", { opener, three_bettor: x, four_bettor: y }, [
      opening(opener), action(x, "three_bet", threeBetToSize(opener, x), source("preflop-ranges", spot.source_response_id, "three_bet")),
      action(y, "four_bet", fourBetToSize(y, x), source("cold-three-bet-responses", spot.id, "four_bet")),
    ]));
  }
  for (const spot of multiway2Spots) {
    const { opener, callers: [c1, c2], hero: squeezer } = spot;
    roots.push(makeRoot("two_caller_squeeze", { opener, callers: [c1, c2], squeezer }, [
      opening(opener), action(c1, "call", openSizeFor(opener), source("preflop-ranges", spot.source_caller_ids[0], "call")),
      action(c2, "call", openSizeFor(opener), source("multiway-responses", spot.source_caller_ids[1], "call")),
      action(squeezer, "squeeze", twoCallerSqueezeToSize(opener, squeezer), source("multiway2-responses", spot.id, "squeeze")),
    ]));
  }
  for (const spot of coldThreeBetSpots) {
    const { opener, three_bettor: x, hero: y } = spot;
    roots.push(makeRoot("three_bet_cold_call", { opener, three_bettor: x, cold_caller: y }, [
      opening(opener), action(x, "three_bet", threeBetToSize(opener, x), source("preflop-ranges", spot.source_response_id, "three_bet")),
      action(y, "call", threeBetToSize(opener, x), source("cold-three-bet-responses", spot.id, "call")),
    ]));
  }
  return roots;
}

/** Replay the complete initial lap, retaining posted blinds even when folded. */
function initialState(root: ContinuationRoot): State {
  const state: State = {
    contributions_bb: Object.fromEntries(positions.map(seat => [seat, blind(seat)])),
    folded: [], all_in: [], pending_actors: [...positions],
    facing_size_bb: 1, last_raise_increment_bb: 1, bet_level: 1,
    history: [], source_factors: Object.fromEntries(positions.map(seat => [seat, []])),
  };
  for (const item of root.history) applyHistoryAction(state, item);
  if (state.pending_actors[0] !== root.opener) throw new Error(`Incorrect initial turn: ${root.id}`);
  return state;
}

function applyHistoryAction(state: State, item: HistoryAction): void {
  const { seat, action: name, to_size_bb: size } = item;
  if (state.pending_actors[0] !== seat || state.folded.includes(seat) || state.all_in.includes(seat)) {
    throw new Error(`Out-of-turn or inactive actor: ${seat}`);
  }
  if (name === "fold") {
    state.folded.push(seat);
    state.pending_actors.shift();
  } else if (name === "call") {
    if (size !== state.facing_size_bb || size < state.contributions_bb[seat]) throw new Error(`Illegal call: ${seat}`);
    state.contributions_bb[seat] = size;
    if (size === effectiveStackBb) state.all_in.push(seat);
    state.pending_actors.shift();
  } else {
    if (size === null || size > effectiveStackBb || size < state.facing_size_bb + state.last_raise_increment_bb) {
      throw new Error(`Raise is below the full-raise minimum or above stack: ${seat}/${size}`);
    }
    state.last_raise_increment_bb = size - state.facing_size_bb;
    state.facing_size_bb = size;
    state.bet_level += 1;
    state.contributions_bb[seat] = size;
    if (size === effectiveStackBb) state.all_in.push(seat);
    state.pending_actors = cyclicAfter(seat).filter(p => !state.folded.includes(p) && !state.all_in.includes(p));
  }
  state.history.push(copy(item));
  if (item.source) state.source_factors[seat].push(copy(item.source));
}

function reusedSource(root: ContinuationRoot, trail: HistoryAction[]): { id: string; dataset: string } | null {
  const { opener, squeezer, callers: [caller], three_bettor: x, four_bettor: y } = root;
  if (root.family === "squeeze") {
    if (!trail.length) return { id: `${opener}_vs_${squeezer}_squeeze_${caller}call`, dataset: "squeeze-responses" };
    if (trail.length === 1 && ["fold", "call"].includes(trail[0].action)) {
      return { id: `${caller}_vs_${squeezer}_squeeze_${opener}${trail[0].action}`, dataset: "squeeze-responses" };
    }
  }
  if (root.family === "cold_four_bet") {
    if (!trail.length) return { id: `${opener}_vs_${y}_cold4bet_${x}3bet`, dataset: "cold-four-bet-responses" };
    if (trail.length === 1 && trail[0].action === "fold") return { id: `${x}_vs_${y}_cold4bet_${opener}open`, dataset: "cold-four-bet-responses" };
  }
  return null;
}

function nextFourBetSize(root: ContinuationRoot, hero: string): number {
  if (root.family === "two_caller_squeeze") return twoCallerFourBetToBb;
  if (root.family === "squeeze") return squeezeFourBetToSize(hero, root.squeezer!);
  return fourBetToSize(hero, root.three_bettor!);
}

/** Enumerate all structurally legal histories, depth-first in fold/call/raise
 * order. Every predecessor is before its descendants. No data files, equities,
 * frequencies, benchmarks or UI dependencies are read by this catalog.
 *
 * New IDs contain the full root history and every later seat/action/size, with
 * o/c/f/s/t/r/a = open/call/fold/squeeze/3bet/4bet/all-in and p = decimal point.
 * They are injective in this finite grammar, readable, and never truncated.
 */
export function enumerateContinuationTree() {
  const roots = enumerateContinuationRoots();
  const all_decisions: ContinuationDecision[] = [];
  const terminals: ContinuationTerminal[] = [];
  const ids = new Set<string>();
  const register = (id: string) => {
    if (ids.has(id) || id.length > 240) throw new Error(`Colliding or overlong continuation ID: ${id}`);
    ids.add(id);
  };
  for (const root of roots) {
    function visit(state: State, parent_id: string | null, parent_action: ContinuationAction | null): string {
      const live = root.participants.filter(seat => !state.folded.includes(seat));
      const trail = state.history.slice(root.history.length);
      const path = `${root.id}${trail.length ? `__${historyKey(trail)}` : ""}`;
      const pot = Object.values(state.contributions_bb).reduce((sum, value) => sum + value, 0);
      const dead = state.folded.reduce((sum, seat) => sum + state.contributions_bb[seat], 0);
      if (live.length === 1 || state.pending_actors.length === 0) {
        const terminal = live.length === 1 ? "uncontested" : state.all_in.length ? "all_in" : "flop";
        const id = `${path}__end_${terminal}`;
        register(id);
        terminals.push({ ...copy(state), pending_actors: [], id, root_id: root.id, family: root.family,
          terminal, participants: [...root.participants], live_participants: live, pot_bb: pot, dead_money_bb: dead,
          parent_id: parent_id!, parent_action: parent_action! });
        return id;
      }
      const hero = state.pending_actors[0];
      const reused = reusedSource(root, trail);
      const id = reused?.id ?? `${path}__to_${hero}`;
      register(id);
      const raiseAction = state.bet_level === 3 ? "four_bet" : state.bet_level === 4 ? "all_in" : null;
      const raiseSize = raiseAction === "four_bet" ? nextFourBetSize(root, hero) : raiseAction === "all_in" ? effectiveStackBb : null;
      const minimum = state.facing_size_bb === effectiveStackBb ? null : state.facing_size_bb + state.last_raise_increment_bb;
      if (raiseSize !== null && (minimum === null || raiseSize < minimum || raiseSize <= state.facing_size_bb)) {
        throw new Error(`Configured continuation raise is illegal: ${id}/${raiseSize}`);
      }
      const legal_actions: ContinuationAction[] = ["fold", "call", ...(raiseAction ? [raiseAction] : [])] as ContinuationAction[];
      const cost = state.facing_size_bb - state.contributions_bb[hero];
      if (cost <= 0) throw new Error(`No outstanding wager for decision: ${id}`);
      const node: ContinuationDecision = {
        ...copy(state), id, root_id: root.id, family: root.family,
        dataset: reused?.dataset ?? continuationDataset, reused: Boolean(reused), hero,
        opener: root.opener, callers: [...root.callers],
        ...(root.squeezer ? { squeezer: root.squeezer } : {}),
        ...(root.three_bettor ? { three_bettor: root.three_bettor } : {}),
        ...(root.cold_caller ? { cold_caller: root.cold_caller } : {}),
        ...(root.four_bettor ? { four_bettor: root.four_bettor } : {}),
        participants: [...root.participants], live_participants: live,
        effective_stack_bb: effectiveStackBb, open_size_bb: root.open_size_bb,
        three_bet_size_bb: root.three_bet_size_bb,
        four_bet_size_bb: state.bet_level === 3 ? raiseSize : state.history.find(item => item.action === "four_bet")!.to_size_bb,
        minimum_raise_to_bb: minimum, pot_bb: pot, dead_money_bb: dead,
        cost_to_call_bb: cost, total_pot_after_call_bb: pot + cost,
        legal_actions, action_sizes_bb: { fold: null, call: state.facing_size_bb, ...(raiseAction ? { [raiseAction]: raiseSize } : {}) },
        parent_id, parent_action, children: {},
      };
      all_decisions.push(node);
      for (const name of legal_actions) {
        const next = copy(state);
        applyHistoryAction(next, action(hero, name, node.action_sizes_bb[name], source(node.dataset, id, name)));
        node.children[name] = visit(next, id, name);
      }
      return id;
    }
    root.first_decision_id = visit(initialState(root), null, null);
  }
  return { roots, spots: all_decisions.filter(node => !node.reused), reused: all_decisions.filter(node => node.reused), all_decisions, terminals };
}

const catalog = enumerateContinuationTree();
export const continuationRoots = catalog.roots;
export const continuationSpots = catalog.spots;
export const reusedContinuationSpots = catalog.reused;
export const continuationDecisions = catalog.all_decisions;
export const all_decisions = catalog.all_decisions;
export const continuationTerminals = catalog.terminals;
export const continuationById = new Map(continuationDecisions.map(node => [node.id, node]));
