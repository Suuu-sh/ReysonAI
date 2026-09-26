// Flop betting trees of the local AI pilot. Pure data/logic shared by the browser and the Node scripts.
//
// "oop_checks" (the first pilot's tree): the OOP player is the preflop caller and always checks;
//   IP check/bet33/bet75 → OOP fold/call/raise(3×) → IP fold/call.
// "oop_leads": the OOP player made the last preflop raise and acts first:
//   OOP check/bet33/bet75; after a bet IP fold/call/raise(3×) → OOP fold/call;
//   after a check the "oop_checks" branch follows.
// Node names from the first pilot are kept: "btn_*" / "ip_*" nodes are the in-position
// player's decisions and "bb_*" / "oop_*" nodes the out-of-position player's.
export const NODES = Object.freeze({
  btn_first: ["check", "bet33", "bet75"],
  bb_vs_33: ["fold", "call", "raise"],
  bb_vs_75: ["fold", "call", "raise"],
  btn_vs_raise: ["fold", "call"],
  oop_first: ["check", "bet33", "bet75"],
  ip_vs_33: ["fold", "call", "raise"],
  ip_vs_75: ["fold", "call", "raise"],
  oop_vs_raise: ["fold", "call"],
});

export const TREES = Object.freeze({
  oop_checks: Object.freeze(["btn_first", "bb_vs_33", "bb_vs_75", "btn_vs_raise"]),
  oop_leads: Object.freeze(["oop_first", "ip_vs_33", "ip_vs_75", "oop_vs_raise", "btn_first", "bb_vs_33", "bb_vs_75", "btn_vs_raise"]),
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
  const betLine = (bettor, bet, facing, raiseNode) => {
    const pending = next(facing[bet === "bet33" ? 0 : 1]);
    if (pending) return pending;
    const response = steps.at(-1).action;
    if (response === "fold") return end({ type: "fold", winner: bettor });
    if (response === "call") return end({ type: "call" });
    const back = next(raiseNode);
    if (back) return back;
    return end(steps.at(-1).action === "fold" ? { type: "raise-fold", winner: otherRole(bettor) } : { type: "raise-call" });
  };
  if (tree === "oop_leads") {
    const pending = next("oop_first");
    if (pending) return pending;
    const lead = steps.at(-1).action;
    if (lead !== "check") return betLine("oop", lead, ["ip_vs_33", "ip_vs_75"], "oop_vs_raise");
  }
  const pending = next("btn_first");
  if (pending) return pending;
  const first = steps.at(-1).action;
  if (first === "check") return end({ type: "check" });
  return betLine("ip", first, ["bb_vs_33", "bb_vs_75"], "btn_vs_raise");
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
