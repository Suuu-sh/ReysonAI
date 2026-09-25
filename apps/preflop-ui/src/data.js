export const ranks = [..."AKQJT98765432"];
export const hands = ranks.flatMap((a,i) => ranks.map((b,j) => i===j ? a+b : i<j ? a+b+"s" : b+a+"o"));
export const pct = n => Number.isFinite(n) ? (n*100).toFixed(1)+"%" : "未計算";
const ACTION_COLORS = Object.freeze({
  fold: "#26262c",
  call: "#3a9fb4",
  limp: "#4fa865",
  check: "#6b7686",
  bet33: "#d9477f",
  bet75: "#a85cde",
  all_in: "#8a5fd6",
  raise: "#d9477f",
});

export function label(a) {
  if (a === "raise_four_bet") return "4bet（推定サイズ）";
  if (a === "raise_ai") return "レイズ（推定サイズ）";
  return ({fold:"フォールド",limp:"リンプ",call:"コール",check:"チェック",all_in:"オールイン",raise:"レイズ"})[a] ?? a.replace("raise_","レイズ ").replaceAll("_",".")+" BB";
}
export function color(a) {
  return a?.startsWith("raise_") ? ACTION_COLORS.raise : ACTION_COLORS[a] ?? ACTION_COLORS.raise;
}
function actionName(item) {
  return typeof item === "string" ? item : item?.action ?? "";
}
function actionSortKey(action) {
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
export function sortActions(items) {
  return [...items].sort((left, right) => {
    const a = actionSortKey(actionName(left));
    const b = actionSortKey(actionName(right));
    return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
  });
}
export function history(n) {
  return n.actionHistory.actions.map(h => {
    const a = h.action;
    return h.position+" "+(typeof a==="string" ? label(a) : a.type==="raise" ? "R"+a.sizeBb : label(a.type));
  }).join(" → ") || "開始";
}
export function totals(combos) {
  const values = {};
  for (const c of combos) for (const a of c.actions) values[a.action]=(values[a.action]??0)+a.frequency;
  return sortActions(Object.entries(values).map(([action,sum])=>({action,frequency:sum/combos.length, count:sum})));
}
export function expectedValue(combos) {
  return combos.length && combos.every(c=>c.actions.every(a=>Number.isFinite(a.evBb))) ? combos.reduce((sum,c)=>sum+c.actions.reduce((v,a)=>v+a.frequency*a.evBb,0),0)/combos.length : null;
}

export function handAggregates(combos) {
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
export function strategyCombos(node) {
  return (Array.isArray(node?.combos) ? node.combos : []).filter(c =>
    typeof c.combo === "string" && hands.includes(c.hand) &&
    Array.isArray(c.actions) && c.actions.length > 0 &&
    c.actions.every(a => typeof a.action === "string" &&
      Number.isFinite(a.frequency) && a.frequency >= 0 && a.frequency <= 1)
  );
}
