export const ranks = [..."AKQJT98765432"];
export const hands = ranks.flatMap((a,i) => ranks.map((b,j) => i===j ? a+b : i<j ? a+b+"s" : b+a+"o"));
export const pct = n => Number.isFinite(n) ? (n*100).toFixed(1)+"%" : "未計算";
export function label(a) {
  return ({fold:"フォールド",call:"コール",check:"チェック",all_in:"オールイン"})[a] ?? a.replace("raise_","レイズ ").replaceAll("_",".")+" BB";
}
export function color(a, index=0) {
  return a==="fold" ? "#50565f" : a==="call" || a==="check" ? "#f4a2c3" : a==="all_in" ? "#a579ef" : ["#fa5b9b","#c74786","#ed86b0"][index%3];
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
  return Object.entries(values).map(([action,sum])=>({action,frequency:sum/combos.length, count:sum}));
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
