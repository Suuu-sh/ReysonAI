// Turn/river public action trees, derived from the sizing in data/postflop-ai-pilot.json
// (`later_streets`). Up to MAX_RAISES raises per street (raise, re-raise ...); stack caps and the all-in merge are applied by
// the engine. Action names encode the size: bet33 / bet75 / bet125 (% of pot) and allin.
// Facing nodes are named by that size (turn_ip_vs_75, river_oop_vs_allin); an all-in
// can only be folded to or called.
import config from "../data/postflop-ai-pilot.json" with { type: "json" };
import type { BettingAction, BettingOutcome, BettingState, BettingStep, DecisionHistory, PlayerRole } from "./tree.ts";
import { MAX_RAISES } from "./tree.ts";

export type LaterStreet = "turn" | "river";
export type StreetSizing = { bets: number[]; all_in: boolean };
export type SizingConfig = { later_streets?: Record<string, StreetSizing> };
export const STREETS = Object.freeze(["turn", "river"] as const);
const betName = (fraction: number): BettingAction => `bet${Math.round(fraction * 100)}`;
const sizeOf = (action: string): string => action === "allin" ? "allin" : action.slice(3);

export function streetSizing(street: string, cfg: SizingConfig = config): StreetSizing {
  const entry = cfg.later_streets?.[street];
  if (!entry || !Array.isArray(entry.bets) || !entry.bets.length ||
      entry.bets.some(value => !Number.isFinite(value) || value <= 0) || typeof entry.all_in !== "boolean") {
    throw new Error(`Invalid later street sizing: ${street}`);
  }
  return entry;
}

// The first-to-act actions of a street: check, each bet size, then all-in when enabled.
export const openingActions = (street: string): BettingAction[] => {
  const { bets, all_in: allIn } = streetSizing(street);
  return ["check", ...bets.map(betName), ...(allIn ? ["allin" as const] : [])];
};
export const betFraction = (street: string, action: string): number => {
  const fraction = streetSizing(street).bets.find(value => betName(value) === action);
  if (fraction === undefined) throw new Error(`Unknown ${street} bet: ${action}`);
  return fraction;
};

// The node answering raise number `k` of a chain started by `bettor`: the bettor faces odd raises and the
// responder even ones (turn_oop_vs_raise, turn_ip_vs_raise2, turn_oop_vs_raise3 ...).
export const laterRaiseNode = (street: string, k: number, bettor: PlayerRole): string =>
  `${street}_${k % 2 === 1 ? bettor : bettor === "oop" ? "ip" : "oop"}_vs_raise${k === 1 ? "" : k}`;

function nodesFor(street: string): Record<string, BettingAction[]> {
  const opening = openingActions(street), bets = opening.filter(action => action !== "check");
  const out: Record<string, BettingAction[]> = {};
  for (const [actor, responder] of [["oop", "ip"], ["ip", "oop"]] as const) {
    out[`${street}_${actor}_first`] = opening;
    for (const bet of bets) out[`${street}_${responder}_vs_${sizeOf(bet)}`] = bet === "allin" ? ["fold", "call"] : ["fold", "call", "raise"];
    for (let k = 1; k <= MAX_RAISES; k++) out[laterRaiseNode(street, k, actor)] = k < MAX_RAISES ? ["fold", "call", "raise"] : ["fold", "call"];
  }
  return out;
}

export const LATER_NODES: Readonly<Record<string, readonly BettingAction[]>> = Object.freeze(Object.fromEntries(STREETS.flatMap(street =>
  Object.entries(nodesFor(street)).map(([node, actions]) => [node, Object.freeze([...actions])]))));

export function streetNodes(street: string): string[] {
  if (!STREETS.includes(street as LaterStreet)) throw new Error(`Unknown later street: ${street}`);
  return Object.keys(LATER_NODES).filter(node => node.startsWith(`${street}_`));
}

export const laterNodeRole = (node: string): PlayerRole => node.split("_")[1] as PlayerRole;

// Same contract as flopState: next { node, role, steps } or terminal { end, steps }.
export function streetState(street: string, actions: readonly string[]): BettingState {
  streetNodes(street);
  if (!Array.isArray(actions)) throw new Error("Invalid later street action path");
  const steps: BettingStep[] = [];
  let index = 0;
  const next = (name: string): BettingState | null => {
    const node = `${street}_${name}`, role = laterNodeRole(node);
    if (index === actions.length) return { node, role, steps };
    const action = actions[index++];
    if (!(LATER_NODES[node] as readonly string[] | undefined)?.includes(action)) throw new Error(`Illegal ${street} action at ${node}`);
    steps.push({ node, role, action: action as BettingAction });
    return null;
  };
  const end = (outcome: BettingOutcome): BettingState => {
    if (index !== actions.length) throw new Error(`Illegal action after ${street} ended`);
    return { end: outcome, steps };
  };
  const betLine = (bettor: PlayerRole, bet: string): BettingState => {
    const responder = bettor === "oop" ? "ip" : "oop";
    const pending = next(`${responder}_vs_${sizeOf(bet)}`);
    if (pending) return pending;
    const response = steps.at(-1)!.action;
    if (response === "fold") return end({ type: "fold", winner: bettor, raises: 0 });
    if (response === "call") return end({ type: "call", raises: 0 });
    // Raise chain: the bettor and the responder alternate until someone folds or calls.
    for (let k = 1; ; k++) {
      const node = laterRaiseNode(street, k, bettor).slice(street.length + 1);
      const back = next(node);
      if (back) return back;
      const { action, role } = steps.at(-1)!;
      if (action === "fold") return end({ type: "raise-fold", winner: role === bettor ? responder : bettor, raises: k });
      if (action === "call") return end({ type: "raise-call", raises: k });
    }
  };
  const oop = next("oop_first");
  if (oop) return oop;
  const lead = steps.at(-1)!.action;
  if (lead !== "check") return betLine("oop", lead);
  const ip = next("ip_first");
  if (ip) return ip;
  const action = steps.at(-1)!.action;
  return action === "check" ? end({ type: "check" }) : betLine("ip", action);
}

export function streetHistories(street: string): DecisionHistory {
  const out: DecisionHistory = {};
  let level: string[][] = [[]];
  while (level.length) {
    const next: string[][] = [];
    for (const actions of level) {
      const state = streetState(street, actions);
      if (state.end) continue;
      out[actions.join(",")] = { node: state.node, role: state.role };
      for (const action of LATER_NODES[state.node]) next.push([...actions, action]);
    }
    level = next;
  }
  return out;
}
