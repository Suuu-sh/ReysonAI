// Pure diff helpers so unattended runs can report "what moved" in a few lines.
// Frequencies are percent points; size/equity/combo fields are not actions.
const NON_ACTION = /_(bb|pct|combos)$/;
const EPS = 1e-9;

const actions = (hand: any) : any => Object.entries<any>(hand).filter(([k, v]: any) : any => k !== "hand" && typeof v === "number" && !NON_ACTION.test(k));
const byId = (dataset: any) : any => new Map((dataset?.spots ?? ([] as any[])).map((spot: any) : any => [spot.id, spot]));

export function diffSpot(before?: any, after?: any) : any {
  const old = new Map(before.hands.map((h: any) : any => [h.hand, h]));
  let changedHands = 0, max = { delta: 0, hand: null, action: null };
  for (const hand of after.hands) {
    const prev: any = old.get(hand.hand) ?? {};
    const keys = new Set([...actions(hand), ...actions(prev)].map(([k]: any) : any => k));
    let changed = false;
    for (const action of keys) {
      const delta = (hand[action] ?? 0) - (prev[action] ?? 0);
      if (Math.abs(delta) <= EPS) continue;
      changed = true;
      if (Math.abs(delta) > Math.abs(max.delta)) max = { delta, hand: hand.hand, action };
    }
    if (changed) changedHands++;
  }
  return { changedHands, max };
}

export function diffDatasets(before?: any, after?: any) : any {
  const prev = byId(before), next = byId(after);
  const spots: any[] = [];
  for (const [id, spot] of next) if (prev.has(id)) {
    const d = diffSpot(prev.get(id), spot);
    if (d.changedHands) spots.push({ id, ...d });
  }
  return {
    spots,
    added: [...next.keys()].filter((id: any) : any => !prev.has(id)),
    removed: [...prev.keys()].filter((id: any) : any => !next.has(id)),
  };
}

export const isUnchanged = (diff: any) : any => !diff.spots.length && !diff.added.length && !diff.removed.length;

// Parses build-estimates' "- [severity] check · spot: detail" lines.
export function parseFindings(log?: any) : any {
  return [...log.matchAll(/^- \[(\w+)\] (\S+) · ([^:]+): (.*)$/gm)].map(([, severity, check, spot, detail]: any) : any => ({ severity, check, spot, detail }));
}

export function summarizeFindings(findings?: any) : any {
  const bySeverity: Record<string, any> = {}, byCheck: Record<string, any> = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
  }
  return { total: findings.length, bySeverity, byCheck };
}
