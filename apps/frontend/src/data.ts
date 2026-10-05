import { label } from "./components/action-format.ts";
export { label, color, pct } from "./components/action-format.ts";

export type StrategyAction = { action: string; frequency: number; evBb?: number | null };
export type StrategyCombo = { combo: string; hand: string; actions: StrategyAction[] };
export type HandAggregate = { hand: string; comboCount: number; actions: Record<string, number | undefined>; unreachable?: boolean };
export type MatrixModel = { actions: string[]; aggregates: Map<string, HandAggregate>; actionLabels?: Record<string, string> };
type ActionLike = string | { action: string };
type HistoryAction = { position: string; action: string | { type: string; sizeBb?: number } };

export const ranks = [..."AKQJT98765432"];
export const hands = ranks.flatMap((a,i) => ranks.map((b,j) => i===j ? a+b : i<j ? a+b+"s" : b+a+"o"));
function actionName(item: ActionLike | null | undefined) {
  return typeof item === "string" ? item : item?.action ?? "";
}
function actionSortKey(action: string): [number, number, string] {
  if (action === "all_in") return [0, 0, action];
  if (action === "raise_ai") return [1, 0, action];
  if (action.startsWith("raise_")) {
    const size = Number(action.slice("raise_".length));
    return [1, Number.isFinite(size) ? -size : 0, action];
  }
  if (action === "call") return [2, 0, action];
  if (action === "check") return [3, 0, action];
  if (action === "fold") return [4, 0, action];
  return [5, 0, action];
}
export function sortActions<T extends ActionLike>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const a = actionSortKey(actionName(left));
    const b = actionSortKey(actionName(right));
    return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
  });
}
export function history(n: { actionHistory: { actions: HistoryAction[] } }) {
  return n.actionHistory.actions.map(h => {
    const a = h.action;
    return h.position+" "+(typeof a==="string" ? label(a) : a.type==="raise" ? "R"+a.sizeBb : label(a.type));
  }).join(" → ") || "開始";
}
export function totals(combos: readonly { actions: readonly StrategyAction[] }[]) {
  const values: Record<string, number> = {};
  for (const c of combos) for (const a of c.actions) values[a.action]=(values[a.action]??0)+a.frequency;
  return sortActions(Object.entries(values).map(([action,sum])=>({action,frequency:sum/combos.length, count:sum})));
}
export function expectedValue(combos: readonly { actions: readonly StrategyAction[] }[]) {
  return combos.length && combos.every(c=>c.actions.every(a=>Number.isFinite(a.evBb))) ? combos.reduce((sum,c)=>sum+c.actions.reduce((v,a)=>v+a.frequency*a.evBb!,0),0)/combos.length : null;
}

export function handAggregates(combos: readonly StrategyCombo[]): Map<string, HandAggregate> {
  return new Map([...new Set(combos.map(combo => combo.hand))].map(hand => {
    const entries = combos.filter(combo => combo.hand === hand);
    return [hand, {
      hand,
      comboCount: entries.length,
      actions: Object.fromEntries(totals(entries).map(action => [action.action, action.frequency])),
    }];
  }));
}

// Only complete frequency records count as displayable strategy data.
// EV may be absent: frequency remains usable, but no EV is synthesized.
export function strategyCombos(node: { combos?: readonly StrategyCombo[] } | null | undefined) {
  return (Array.isArray(node?.combos) ? node.combos : []).filter((c: StrategyCombo) =>
    typeof c.combo === "string" && hands.includes(c.hand) &&
    Array.isArray(c.actions) && c.actions.length > 0 &&
    c.actions.every((a: StrategyAction) => typeof a.action === "string" &&
      Number.isFinite(a.frequency) && a.frequency >= 0 && a.frequency <= 1)
  );
}
