// Pure diff helpers so unattended runs can report "what moved" in a few lines.
// Frequencies are percent points; size/equity/combo fields are not actions.
const NON_ACTION = /_(bb|pct|combos)$/;
const EPS = 1e-9;

const actions = hand => Object.entries(hand).filter(([k, v]) => k !== "hand" && typeof v === "number" && !NON_ACTION.test(k));
const byId = dataset => new Map((dataset?.spots ?? []).map(spot => [spot.id, spot]));

export function diffSpot(before, after) {
  const old = new Map(before.hands.map(h => [h.hand, h]));
  let changedHands = 0, max = { delta: 0, hand: null, action: null };
  for (const hand of after.hands) {
    const prev = old.get(hand.hand) ?? {};
    const keys = new Set([...actions(hand), ...actions(prev)].map(([k]) => k));
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

export function diffDatasets(before, after) {
  const prev = byId(before), next = byId(after);
  const spots = [];
  for (const [id, spot] of next) if (prev.has(id)) {
    const d = diffSpot(prev.get(id), spot);
    if (d.changedHands) spots.push({ id, ...d });
  }
  return {
    spots,
    added: [...next.keys()].filter(id => !prev.has(id)),
    removed: [...prev.keys()].filter(id => !next.has(id)),
  };
}

export const isUnchanged = diff => !diff.spots.length && !diff.added.length && !diff.removed.length;

// Parses build-estimates' "- [severity] check · spot: detail" lines.
export function parseFindings(log) {
  return [...log.matchAll(/^- \[(\w+)\] (\S+) · ([^:]+): (.*)$/gm)].map(([, severity, check, spot, detail]) => ({ severity, check, spot, detail }));
}

export function summarizeFindings(findings) {
  const bySeverity = {}, byCheck = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
  }
  return { total: findings.length, bySeverity, byCheck };
}
