import config from "../data/postflop-ai-pilot.json" with { type: "json" };

// Flop betting trees of the local AI pilot. Pure data/logic shared by the browser and the Node scripts.
//
// "oop_checks" (the first pilot's tree): the OOP player is the preflop caller and always checks;
//   IP check/bet (each configured size) → OOP fold/call/raise(3×) → IP fold/call.
// "oop_leads": the OOP player made the last preflop raise and acts first:
//   OOP check/bet; after a bet IP fold/call/raise(3×) → OOP fold/call;
//   after a check the "oop_checks" branch follows.
// Node names from the first pilot are kept: "btn_*" / "ip_*" nodes are the in-position
// player's decisions and "bb_*" / "oop_*" nodes the out-of-position player's.
// Bet sizes come from data/postflop-ai-pilot.json (`flop_bet_fractions`): bet33 / bet75 /
// bet125 and the facing nodes bb_vs_33 … (after an IP bet) and ip_vs_33 … (after an OOP lead).
export const FLOP_BETS = Object.freeze(config.flop_bet_fractions.map(fraction => `bet${Math.round(fraction * 100)}`));
export const flopBetFraction = action => {
  const index = FLOP_BETS.indexOf(action);
  if (index < 0) throw new Error(`Unknown flop bet: ${action}`);
  return config.flop_bet_fractions[index];
};
export const flopBetLabel = action => `${action.slice(3)}%`;
// The node that responds to `bet` from `bettor` ("ip" → bb_vs_*, "oop" → ip_vs_*).
export const facingNode = (bettor, bet) => `${bettor === "ip" ? "bb" : "ip"}_vs_${bet.slice(3)}`;
export const raiseNodeAfter = bettor => bettor === "ip" ? "btn_vs_raise" : "oop_vs_raise";
export const isFlopBet = action => FLOP_BETS.includes(action);

const RESPONSE = ["fold", "call", "raise"];
export const NODES = Object.freeze({
  btn_first: Object.freeze(["check", ...FLOP_BETS]),
  ...Object.fromEntries(FLOP_BETS.map(bet => [facingNode("ip", bet), Object.freeze([...RESPONSE])])),
  btn_vs_raise: Object.freeze(["fold", "call"]),
  oop_first: Object.freeze(["check", ...FLOP_BETS]),
  ...Object.fromEntries(FLOP_BETS.map(bet => [facingNode("oop", bet), Object.freeze([...RESPONSE])])),
  oop_vs_raise: Object.freeze(["fold", "call"]),
});

const ipBranch = ["btn_first", ...FLOP_BETS.map(bet => facingNode("ip", bet)), "btn_vs_raise"];
export const TREES = Object.freeze({
  oop_checks: Object.freeze(ipBranch),
  oop_leads: Object.freeze(["oop_first", ...FLOP_BETS.map(bet => facingNode("oop", bet)), "oop_vs_raise", ...ipBranch]),
});
export const DEFAULT_TREE = "oop_checks";

export function treeNodes(tree = DEFAULT_TREE) {
  const nodes = TREES[tree];
  if (!nodes) throw new Error(`Unknown flop tree: ${tree}`);
  return nodes;
}

export const nodeRole = node => node.startsWith("btn_") || node.startsWith("ip_") ? "ip" : "oop";
export const otherRole = role => role === "ip" ? "oop" : "ip";

// Walks the flop actions taken so far. Returns the next decision ({ node, role, steps }) or,
// when the flop is over, { end: { type, winner? }, steps }. `steps` lists { node, role, action }.
export function flopState(tree, actions) {
  if (!Array.isArray(actions)) throw new Error("Invalid flop action path");
  treeNodes(tree);
  const steps = [];
  let index = 0;
  const next = node => {
    const role = nodeRole(node);
    if (index === actions.length) return { node, role, steps };
    const action = actions[index];
    if (!NODES[node].includes(action)) throw new Error(`Illegal ${role.toUpperCase()} flop action`);
    steps.push({ node, role, action });
    index++;
    return null;
  };
  const end = outcome => {
    if (index !== actions.length) throw new Error("Illegal flop action after the flop ended");
    return { end: outcome, steps };
  };
  const betLine = (bettor, bet) => {
    const pending = next(facingNode(bettor, bet));
    if (pending) return pending;
    const response = steps.at(-1).action;
    if (response === "fold") return end({ type: "fold", winner: bettor });
    if (response === "call") return end({ type: "call" });
    const back = next(raiseNodeAfter(bettor));
    if (back) return back;
    return end(steps.at(-1).action === "fold" ? { type: "raise-fold", winner: otherRole(bettor) } : { type: "raise-call" });
  };
  if (tree === "oop_leads") {
    const pending = next("oop_first");
    if (pending) return pending;
    const lead = steps.at(-1).action;
    if (lead !== "check") return betLine("oop", lead);
  }
  const pending = next("btn_first");
  if (pending) return pending;
  const first = steps.at(-1).action;
  if (first === "check") return end({ type: "check" });
  return betLine("ip", first);
}

// Every decision point of a tree, keyed by the comma-joined actions before it, in
// breadth-first order (the first pilot's order: "", bet33, bet75, bet33,raise, bet75,raise).
export function treeHistories(tree = DEFAULT_TREE) {
  const out = {};
  let level = [[]];
  while (level.length) {
    const next = [];
    for (const actions of level) {
      const state = flopState(tree, actions);
      if (state.end) continue;
      out[actions.join(",")] = { node: state.node, role: state.role };
      for (const action of NODES[state.node]) next.push([...actions, action]);
    }
    level = next;
  }
  return out;
}

// The canonical history before `node`; `prev` picks the bet size before a raise.
export function historyFor(tree, node, prev = "bet33") {
  const entry = Object.entries(treeHistories(tree)).find(([key, value]) => value.node === node &&
    (!key.split(",").includes("raise") || key.split(",").includes(prev)));
  if (!entry) throw new Error("未対応の判断です。");
  return entry[0] ? entry[0].split(",") : [];
}
