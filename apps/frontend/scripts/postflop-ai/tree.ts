import config from "../data/postflop-ai-pilot.json" with { type: "json" };

export type PlayerRole = "ip" | "oop";
export type FlopTree = "oop_checks" | "oop_leads";
export type BetAction = `bet${number}`;
export type BettingAction = "check" | "fold" | "call" | "raise" | "allin" | BetAction;
export type BettingStep = { node: string; role: PlayerRole; action: BettingAction; canRaise?: boolean };
export type BettingOutcome =
  | { type: "check"; winner?: never; raises?: never }
  | { type: "fold" | "raise-fold"; winner: PlayerRole; raises: number }
  | { type: "call" | "raise-call"; winner?: never; raises: number };
export type BettingState =
  | { node: string; role: PlayerRole; steps: BettingStep[]; end?: never }
  | { end: BettingOutcome; steps: BettingStep[]; node?: never; role?: never };
export type DecisionHistory = Record<string, { node: string; role: PlayerRole }>;

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
export const FLOP_BETS = Object.freeze(config.flop_bet_fractions.map((fraction): BetAction => `bet${Math.round(fraction * 100)}`));
export const flopBetFraction = (action: string): number => {
  const index = FLOP_BETS.indexOf(action as BetAction);
  if (index < 0) throw new Error(`Unknown flop bet: ${action}`);
  return config.flop_bet_fractions[index];
};
export const flopBetLabel = (action: string): string => `${action.slice(3)}%`;
// The node that responds to `bet` from `bettor` ("ip" → bb_vs_*, "oop" → ip_vs_*).
export const facingNode = (bettor: PlayerRole, bet: string): string => `${bettor === "ip" ? "bb" : "ip"}_vs_${bet.slice(3)}`;
// Raises per street (bet -> raise -> re-raise ...); the node facing the last allowed raise is fold/call only.
export const MAX_RAISES = config.max_raises_per_street ?? 4;
// The node that answers raise number `k` (1-based) of a chain started by `bettor`'s bet: odd k is the
// bettor facing the first raise (btn_vs_raise / oop_vs_raise), even k the original responder again
// (bb_vs_raise2 / ip_vs_raise2), and so on.
export const raiseNode = (k: number, bettor: PlayerRole): string => {
  const bettorFaces = k % 2 === 1, suffix = k === 1 ? "" : String(k);
  const name = bettor === "ip" ? (bettorFaces ? "btn" : "bb") : (bettorFaces ? "oop" : "ip");
  return `${name}_vs_raise${suffix}`;
};
export const raiseNodeAfter = (bettor: PlayerRole): string => raiseNode(1, bettor);
// 0 for non-raise nodes, otherwise the number of raises the node faces (1 for *_vs_raise, 2 for *_vs_raise2 ...).
export const raiseDepth = (node: string): number => {
  const match = /_vs_raise(\d*)$/.exec(node);
  return match ? (match[1] ? Number(match[1]) : 1) : 0;
};
export const isFlopBet = (action: string): action is BetAction => FLOP_BETS.includes(action as BetAction);

const RESPONSE: BettingAction[] = ["fold", "call", "raise"];
function raiseChain(bettor: PlayerRole): Record<string, readonly BettingAction[]> {
  return Object.fromEntries(Array.from({ length: MAX_RAISES }, (_, i) => i + 1).map(k =>
    [raiseNode(k, bettor), Object.freeze(k < MAX_RAISES ? [...RESPONSE] : ["fold", "call"] as BettingAction[])]));
}
const raiseChainNodes = (bettor: PlayerRole): string[] => Array.from({ length: MAX_RAISES }, (_, i) => raiseNode(i + 1, bettor));
export const NODES: Readonly<Record<string, readonly BettingAction[]>> = Object.freeze({
  btn_first: Object.freeze(["check" as const, ...FLOP_BETS]),
  ...Object.fromEntries(FLOP_BETS.map(bet => [facingNode("ip", bet), Object.freeze([...RESPONSE])])),
  ...raiseChain("ip"),
  oop_first: Object.freeze(["check" as const, ...FLOP_BETS]),
  ...Object.fromEntries(FLOP_BETS.map(bet => [facingNode("oop", bet), Object.freeze([...RESPONSE])])),
  ...raiseChain("oop"),
});

const ipBranch = ["btn_first", ...FLOP_BETS.map(bet => facingNode("ip", bet)), ...raiseChainNodes("ip")];
export const TREES: Readonly<Record<FlopTree, readonly string[]>> = Object.freeze({
  oop_checks: Object.freeze(ipBranch),
  oop_leads: Object.freeze(["oop_first", ...FLOP_BETS.map(bet => facingNode("oop", bet)), ...raiseChainNodes("oop"), ...ipBranch]),
});
export const DEFAULT_TREE = "oop_checks";

export function treeNodes(tree: string = DEFAULT_TREE): readonly string[] {
  const nodes = TREES[tree as FlopTree];
  if (!nodes) throw new Error(`Unknown flop tree: ${tree}`);
  return nodes;
}

export const nodeRole = (node: string): PlayerRole => node.startsWith("btn_") || node.startsWith("ip_") ? "ip" : "oop";
export const otherRole = (role: PlayerRole): PlayerRole => role === "ip" ? "oop" : "ip";

// Walks the flop actions taken so far. Returns the next decision ({ node, role, steps }) or,
// when the flop is over, { end: { type, winner? }, steps }. `steps` lists { node, role, action }.
export function flopState(tree: string, actions: readonly string[]): BettingState {
  if (!Array.isArray(actions)) throw new Error("Invalid flop action path");
  treeNodes(tree);
  const steps: BettingStep[] = [];
  let index = 0;
  const next = (node: string): BettingState | null => {
    const role = nodeRole(node);
    if (index === actions.length) return { node, role, steps };
    const action = actions[index];
    if (!(NODES[node] as readonly string[]).includes(action)) throw new Error(`Illegal ${role.toUpperCase()} flop action`);
    steps.push({ node, role, action: action as BettingAction });
    index++;
    return null;
  };
  const end = (outcome: BettingOutcome): BettingState => {
    if (index !== actions.length) throw new Error("Illegal flop action after the flop ended");
    return { end: outcome, steps };
  };
  // bet -> (fold | call | raise -> (fold | call | raise -> ...)); `raises` counts the raises made.
  const betLine = (bettor: PlayerRole, bet: string): BettingState => {
    let node = facingNode(bettor, bet), raises = 0;
    for (;;) {
      const pending = next(node);
      if (pending) return pending;
      const { action, role } = steps.at(-1)!;
      if (action === "fold") return end({ type: raises ? "raise-fold" : "fold", winner: otherRole(role), raises });
      if (action === "call") return end({ type: raises ? "raise-call" : "call", raises });
      node = raiseNode(++raises, bettor);
    }
  };
  if (tree === "oop_leads") {
    const pending = next("oop_first");
    if (pending) return pending;
    const lead = steps.at(-1)!.action;
    if (lead !== "check") return betLine("oop", lead);
  }
  const pending = next("btn_first");
  if (pending) return pending;
  const first = steps.at(-1)!.action;
  if (first === "check") return end({ type: "check" });
  return betLine("ip", first);
}

// Every decision point of a tree, keyed by the comma-joined actions before it, in
// breadth-first order (the first pilot's order: "", bet33, bet75, bet33,raise, bet75,raise).
export function treeHistories(tree: string = DEFAULT_TREE): DecisionHistory {
  const out: DecisionHistory = {};
  let level: string[][] = [[]];
  while (level.length) {
    const next: string[][] = [];
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
export function historyFor(tree: string, node: string, prev = "bet33"): string[] {
  const depth = raiseDepth(node);
  const entry = Object.entries(treeHistories(tree)).find(([key, value]) => value.node === node &&
    (!depth || key.split(",").includes(prev)));
  if (!entry) throw new Error("未対応の判断です。");
  return entry[0] ? entry[0].split(",") : [];
}
