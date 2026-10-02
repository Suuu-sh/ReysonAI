// Turn/river public action trees, derived from the sizing in data/postflop-ai-pilot.json
// (`later_streets`). Up to MAX_RAISES raises per street (raise, re-raise ...); stack caps and the all-in merge are applied by
// the engine. Action names encode the size: bet33 / bet75 / bet125 (% of pot) and allin.
// Facing nodes are named by that size (turn_ip_vs_75, river_oop_vs_allin); an all-in
// can only be folded to or called.
import config from "../data/postflop-ai-pilot.json" with { type: "json" };
import { MAX_RAISES } from "./tree.mjs";

export const STREETS = Object.freeze(["turn", "river"]);
const betName = fraction => `bet${Math.round(fraction * 100)}`;
const sizeOf = action => action === "allin" ? "allin" : action.slice(3);

export function streetSizing(street, cfg = config) {
  const entry = cfg.later_streets?.[street];
  if (!entry || !Array.isArray(entry.bets) || !entry.bets.length ||
      entry.bets.some(value => !Number.isFinite(value) || value <= 0) || typeof entry.all_in !== "boolean") {
    throw new Error(`Invalid later street sizing: ${street}`);
  }
  return entry;
}

// The first-to-act actions of a street: check, each bet size, then all-in when enabled.
export const openingActions = street => {
  const { bets, all_in: allIn } = streetSizing(street);
  return ["check", ...bets.map(betName), ...(allIn ? ["allin"] : [])];
};
export const betFraction = (street, action) => {
  const fraction = streetSizing(street).bets.find(value => betName(value) === action);
  if (fraction === undefined) throw new Error(`Unknown ${street} bet: ${action}`);
  return fraction;
};

// The node answering raise number `k` of a chain started by `bettor`: the bettor faces odd raises and the
// responder even ones (turn_oop_vs_raise, turn_ip_vs_raise2, turn_oop_vs_raise3 ...).
export const laterRaiseNode = (street, k, bettor) =>
  `${street}_${k % 2 === 1 ? bettor : bettor === "oop" ? "ip" : "oop"}_vs_raise${k === 1 ? "" : k}`;

function nodesFor(street) {
  const opening = openingActions(street), bets = opening.filter(action => action !== "check");
  const out = {};
  for (const [actor, responder] of [["oop", "ip"], ["ip", "oop"]]) {
    out[`${street}_${actor}_first`] = opening;
    for (const bet of bets) out[`${street}_${responder}_vs_${sizeOf(bet)}`] = bet === "allin" ? ["fold", "call"] : ["fold", "call", "raise"];
    for (let k = 1; k <= MAX_RAISES; k++) out[laterRaiseNode(street, k, actor)] = k < MAX_RAISES ? ["fold", "call", "raise"] : ["fold", "call"];
  }
  return out;
}

export const LATER_NODES = Object.freeze(Object.fromEntries(STREETS.flatMap(street =>
  Object.entries(nodesFor(street)).map(([node, actions]) => [node, Object.freeze([...actions])]))));

export function streetNodes(street) {
  if (!STREETS.includes(street)) throw new Error(`Unknown later street: ${street}`);
  return Object.keys(LATER_NODES).filter(node => node.startsWith(`${street}_`));
}

export const laterNodeRole = node => node.split("_")[1];

// Same contract as flopState: next { node, role, steps } or terminal { end, steps }.
export function streetState(street, actions) {
  streetNodes(street);
  if (!Array.isArray(actions)) throw new Error("Invalid later street action path");
  const steps = [];
  let index = 0;
  const next = name => {
    const node = `${street}_${name}`, role = laterNodeRole(node);
    if (index === actions.length) return { node, role, steps };
    const action = actions[index++];
    if (!LATER_NODES[node]?.includes(action)) throw new Error(`Illegal ${street} action at ${node}`);
    steps.push({ node, role, action });
    return null;
  };
  const end = outcome => {
    if (index !== actions.length) throw new Error(`Illegal action after ${street} ended`);
    return { end: outcome, steps };
  };
  const betLine = (bettor, bet) => {
    const responder = bettor === "oop" ? "ip" : "oop";
    const pending = next(`${responder}_vs_${sizeOf(bet)}`);
    if (pending) return pending;
    const response = steps.at(-1).action;
    if (response === "fold") return end({ type: "fold", winner: bettor, raises: 0 });
    if (response === "call") return end({ type: "call", raises: 0 });
    // Raise chain: the bettor and the responder alternate until someone folds or calls.
    for (let k = 1; ; k++) {
      const node = laterRaiseNode(street, k, bettor).slice(street.length + 1);
      const back = next(node);
      if (back) return back;
      const { action, role } = steps.at(-1);
      if (action === "fold") return end({ type: "raise-fold", winner: role === bettor ? responder : bettor, raises: k });
      if (action === "call") return end({ type: "raise-call", raises: k });
    }
  };
  const oop = next("oop_first");
  if (oop) return oop;
  const lead = steps.at(-1).action;
  if (lead !== "check") return betLine("oop", lead);
  const ip = next("ip_first");
  if (ip) return ip;
  const action = steps.at(-1).action;
  return action === "check" ? end({ type: "check" }) : betLine("ip", action);
}

export function streetHistories(street) {
  const out = {};
  let level = [[]];
  while (level.length) {
    const next = [];
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
