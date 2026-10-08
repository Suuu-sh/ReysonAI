import type { Stage3Context, Stage3StoredSpot, Stage3Equity, Stage3Dataset, Stage3Sources, Stage3SourceDatasets, Stage3EquityTable, Stage3Decision, Stage3DefenseEvent, Stage3DefenseResponder, Stage3AuditHelpers } from "./stage3-types.ts";
import type { AuditFinding, RangeBalanceSummary, ContinuationCapacity, ContinuationDefenseEvent } from "./continuation-audit.ts";
import { hands } from "../data.ts";
import { allowedCall, callFacts } from "./stage3-call-ev.ts";
import { raked } from "./rake.ts";
import { stage3ById, stage3Decisions, stage3Roots, stage3Spots } from "./stage3-tree.ts";
import { createStage3Model, stage3ComboCount, stage3Mix, validStage3Equity, STAGE3_VERSION, STAGE3_SEED } from "./stage3-model.ts";
import { validateStage3Dataset } from "./stage3-responses.ts";
import { validJointDefenseRecord, jointDefenseSaturated, jointDefenseTolerance } from "./continuation-defense.ts";

const ranks = "AKQJT98765432";
export function stage3OrderEdges(context: Pick<Stage3Context, "reach">): [string, string, string][] {
  const chains = [[...ranks].map(rank => rank + rank), ...[...ranks].slice(0, -1).flatMap((rank, i) =>
    ["s", "o"].map(suit => [...ranks.slice(i + 1)].map(kicker => rank + kicker + suit)))];
  const edges: [string, string, string][] = [];
  for (const chain of chains) {
    const live = chain.filter(hand => context.reach(hand) > 0);
    for (let i = 1; i < live.length; i++) if (!(/^A6/.test(live[i - 1]) && /^A5/.test(live[i]))) edges.push([live[i - 1], live[i], "strength-order"]);
  }
  for (let i = 0; i < ranks.length; i++) for (let j = i + 1; j < ranks.length; j++) {
    const s = ranks[i] + ranks[j] + "s", o = ranks[i] + ranks[j] + "o";
    if (context.reach(s) > 0 && context.reach(o) > 0) edges.push([s, o, "suited-vs-offsuit"]);
  }
  return edges;
}

// Match the established 10pt family/offsuit ceiling, changing only calls.
// This also caps tiny Monte Carlo inversions in all-in boundary mixes.
export function orderStage3Calls(spot: Stage3StoredSpot, context: Pick<Stage3Context, "reach">) {
  const rows = new Map(spot.hands.map(row => [row.hand, row]));
  const edges = stage3OrderEdges(context); let changed;
  do {
    changed = false;
    for (const [strong, weak] of edges) {
      const a = rows.get(strong)!, b = rows.get(weak)!, excess = a.fold - b.fold - 10;
      if (excess <= 0) continue;
      if (excess > b.call) throw new Error(`Authored raise inversion ${spot.id}/${strong}/${weak}`);
      b.call -= excess; b.fold += excess; changed = true;
    }
  } while (changed);
  return spot;
}

// Shared ±2pt / 5%-step all-in rule, kept browser-safe for the audit.
export const stage3AllInTarget = (marginPct: number) => Math.max(0, Math.min(100, Math.round((50 + marginPct / 2 * 50) / 5) * 5));

export function stage3Capacity(spot: Stage3StoredSpot, context: Pick<Stage3Context, "node" | "input" | "reach">, entry: Stage3Equity): ContinuationCapacity {
  const maxima = new Map(spot.hands.map(row => {
    const aggressive = row.squeeze + row.four_bet + row.all_in;
    if (context.reach(row.hand) <= 0) return [row.hand, 0] as [string, number];
    const facts = callFacts(context, row.hand, entry.equities[row.hand]!);
    const maxCall = context.node.bet_level === 5
      ? stage3AllInTarget((entry.equities[row.hand]! - context.input.cost_to_call / raked(context.input.total_pot_after_call)) * 100)
      : allowedCall(100 - aggressive, facts.call_ev_bb);
    return [row.hand, aggressive + maxCall] as [string, number];
  }));
  const rows = new Map(spot.hands.map(row => [row.hand, row]));
  let changed;
  do {
    changed = false;
    for (const [strong, weak] of stage3OrderEdges(context)) {
      const cap = Math.max(rows.get(weak)!.squeeze + rows.get(weak)!.four_bet + rows.get(weak)!.all_in, maxima.get(strong)! + 10);
      if (maxima.get(weak)! > cap) { maxima.set(weak, cap); changed = true; }
    }
  } while (changed);
  const weights = spot.hands.map((row): [string, number] => [row.hand, stage3ComboCount(row.hand) * context.reach(row.hand)]);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  return { maxCalls: new Map(spot.hands.map(row => [row.hand, Math.max(0, maxima.get(row.hand)! - row.squeeze - row.four_bet - row.all_in)])),
    minimumFoldRate: total ? weights.reduce((sum, [hand, weight]) => sum + weight * (100 - maxima.get(hand)!) / 100, 0) / total : 0 };
}

export function* iterateStage3Defense(data: Stage3Dataset, datasets: Stage3Sources, equities: Stage3EquityTable | null | undefined): Generator<Stage3DefenseEvent> {
  const model = createStage3Model({ ...datasets, "stage3-responses": data });
  const records = new Map(data.spots.map(spot => [spot.id, spot]));
  const ctx = (node: Stage3Decision) => model.context(node, (records.get(node.id) ?? (node.reused
    ? model.sources.get(`${node.dataset}/${node.id}`) : model.resolveSpot(node))) as Stage3StoredSpot);
  const events = [];
  for (const parent of stage3Decisions) {
    if (!data.metadata.families.includes(parent.family) || !records.has(parent.id)) continue;
    for (const action of ["squeeze", "four_bet", "all_in"]) {
      const child = stage3ById.get(parent.children[action]);
      if (!child?.hero || child.reused) continue;
      events.push({ id: `${parent.id}:${action}`, first: child, risk: parent.action_sizes_bb[action]! - parent.contributions_bb[parent.hero], pot: parent.pot_bb });
    }
  }
  for (const event of events) {
    let current: Stage3Decision | undefined = event.first, rate = 1, minimum = 1; const group: Stage3DefenseResponder[] = [];
    if (ctx(current).unreachable) continue;
    while (current?.hero) {
      const context = ctx(current), spot = context.spot;
      // A preceding player never folds: this branch is already defended.
      if (context.unreachable) { rate = 0; minimum = 0; break; }
      const fold = stage3Mix(spot, context).fold! / 100;
      rate *= fold;
      const entry = equities?.spots?.[current.id];
      const capacity = entry && validStage3Equity(entry, context) ? stage3Capacity(spot, context, entry) : null;
      minimum *= capacity?.minimumFoldRate ?? fold;
      group.push({ node: current, context, spot, foldRate: fold, capacity });
      if (fold === 0) break;
      current = stage3ById.get(current.children.fold);
    }
    yield { id: event.id, spot: event.first.id, risk_bb: event.risk, pot_before_raise_bb: event.pot,
      threshold: event.risk / (event.risk + event.pot), foldRate: rate, minimumFoldRate: minimum, group };
  }
}
export const stage3Defense = (data: Stage3Dataset, datasets: Stage3Sources, equities: Stage3EquityTable | null | undefined) => [...iterateStage3Defense(data, datasets, equities)];

export function auditStage3Estimates(data: Stage3Dataset, datasets: Stage3SourceDatasets, equities: Stage3EquityTable | null | undefined, helpers: Stage3AuditHelpers = {}) {
  const findings: AuditFinding[] = [], add = (check: string, severity: string, spot: string, detail: string) => findings.push({ check, severity, spot, detail });
  try { validateStage3Dataset(data, datasets, { allowPartial: helpers.allowPartial === true }); }
  catch (error) { add("range-flow", "error", "stage3-responses", (error as Error).message); return { findings, defense: [], rangeBalance: [] }; }
  const strategyIds = new Set(data.spots.map(spot => spot.id));
  const equityIds = Object.keys(equities?.spots ?? {});
  if (equities?.version !== STAGE3_VERSION || equities?.seed !== STAGE3_SEED ||
      equityIds.length !== strategyIds.size || equityIds.some(id => !strategyIds.has(id)))
    add("call-equity-coverage", "error", "stage3-call-equities", "Equity table identity and exact key set must match saved Stage3 strategies; rare, impossible, missing or unknown entries are forbidden");
  const model = createStage3Model({ ...datasets, "stage3-responses": data });
  const nodes = new Map(stage3Spots.map(node => [node.id, node])), rangeBalance: RangeBalanceSummary[] = [];
  for (const spot of data.spots) {
    const context = model.context(nodes.get(spot.id)!, spot), entry = equities?.spots?.[spot.id];
    if (!validStage3Equity(entry, context)) { add("call-equity-source", "error", spot.id, "Missing/stale stage3 equity, sample policy or exact reach/geometry input"); continue; }
    const byHand = new Map(spot.hands.map(row => [row.hand, row]));
    for (const [strong, weak, check] of stage3OrderEdges(context)) if (byHand.get(strong)!.fold - byHand.get(weak)!.fold > 10) add(check, "error", spot.id, `${strong} folds more than ${weak} by >10pt`);
    const capacity = stage3Capacity(spot, context, entry);
    for (const row of spot.hands) {
      if (context.reach(row.hand) <= 0) continue;
      const facts = callFacts(context, row.hand, entry.equities[row.hand]!);
      if (spot.bet_level === 5) {
        if (row.call !== capacity.maxCalls.get(row.hand)) add("all-in-call-policy", "error", spot.id, `${row.hand}: all-in call differs from shared mix plus strength ceiling`);
      } else if (row.call > allowedCall(row.call, facts.call_ev_bb)) add(facts.call_ev_bb < -0.05 ? "negative-ev-call" : "boundary-ev-call", "error", spot.id, `${row.hand}: call ${row.call}%, EV ${facts.call_ev_bb.toFixed(4)}BB`);
    }
    if (helpers.checkCrossStrengthInversion) findings.push(...helpers.checkCrossStrengthInversion(spot, context.reach));
    if (helpers.checkRangeBalance) {
      const balance = helpers.checkRangeBalance(spot, context.reach, spot.bet_level === 5 ? "5bet all-in response" : null);
      findings.push(...balance.findings); rangeBalance.push(balance);
    }
  }
  const defense = [], defenseIds = new Set();
  for (const item of iterateStage3Defense(data, datasets, equities)) {
    defenseIds.add(item.id);
    const { group, ...summary } = item;
    if (group.some(responder => !responder.capacity)) { add("call-equity-source", "error", item.spot, "Missing/stale defender equity capacity"); continue; }
    const record = equities?.joint_defense?.[item.id];
    if (!validJointDefenseRecord(record, item as unknown as ContinuationDefenseEvent)) {
      add("joint-defense-source", "error", item.spot, "Missing or stale exact source ranges, fold/capacity policies, seed or joint Monte Carlo evidence");
      continue;
    }
    const saturated = jointDefenseSaturated(item as unknown as ContinuationDefenseEvent);
    defense.push({ ...summary, foldRate: record.fold.mean, minimumFoldRate: record.capacity.mean,
      marginalFoldProxy: summary.foldRate, marginalCapacityProxy: summary.minimumFoldRate,
      foldConfidence: record.fold, capacityConfidence: record.capacity, samples: record.samples,
      confidence_delta: record.confidence_delta, method: record.method ?? "monte_carlo", exact_legal_deals: record.accepted_deals ?? null,
      capacitySaturated: saturated, responders: group.map(c => c.node.id) });
    const threshold = item.threshold + jointDefenseTolerance(record);
    if (record.fold.upper <= threshold) continue;
    const conflict = saturated && record.capacity.lower > threshold;
    const overfold = record.fold.lower > threshold;
    add(conflict ? "ev-capacity-conflict" : overfold ? "auto-profit" : "joint-defense-uncertain",
      conflict ? "warn" : "error", item.spot,
      `Joint-conditioned all-fold ${(record.fold.mean * 100).toFixed(2)}% [${(record.fold.lower * 100).toFixed(2)}, ${(record.fold.upper * 100).toFixed(2)}] vs break-even ${(item.threshold * 100).toFixed(2)}%; full ordered capacity ${(record.capacity.mean * 100).toFixed(2)}% [${(record.capacity.lower * 100).toFixed(2)}, ${(record.capacity.upper * 100).toFixed(2)}], ${record.method === "exact" ? `${record.accepted_deals} exact legal tuples` : `${record.samples} accepted Monte Carlo tuples`}.${conflict ? " Exact reachable support is saturated; remaining model conflict, not equilibrium." : overfold ? " Unsaturated overfold blocks publication." : " Sampling interval straddles threshold; publication blocked."}`);
  }
  const savedDefenseIds = Object.keys(equities?.joint_defense ?? {});
  if (!equities?.joint_defense || savedDefenseIds.length !== defenseIds.size || savedDefenseIds.some(id => !defenseIds.has(id)))
    add("joint-defense-coverage", "error", "stage3-call-equities", "Joint defense records must exactly match the reachable defense events; missing, omitted or unknown event keys are forbidden");
  return { findings, rangeBalance, defense,
    aggregation_model: "comboCount × own-action reach; no joint compatibility-mass reweighting except zero-support exclusion",
    defense_model: "joint whole-tuple conditioning; within-tuple responder fold products; paired maximum-capacity samples; conservative empirical Bernstein confidence bounds" };
}
