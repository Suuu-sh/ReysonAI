// Structural histories only: never read legacy policy frequencies or reasons.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { actionsForSpot, scenarioOnly } from "./aiv2-preflop.ts";
export const DATASETS = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "multiway-responses", "squeeze-responses", "limp-responses", "limp-deep-responses", "cold-three-bet-responses", "multiway2-responses", "cold-four-bet-responses", "continuation-responses"];
export const PROFILE_DATASETS = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "limp-responses", "limp-deep-responses"];
export const PROFILES = ["nit", "station", "lag", "maniac"];
export type Profile = { profile: string; role: string };
export type Ref = { dataset: string; spot_id: string; action: string; seat: string; context?: "base" | string };
export type HistoryEvent = { seat: string; action: string; to_size_bb: number | null; forced: boolean; source: { dataset: string; spot_id: string; action: string } | null; assumption?: string };
export type Node = { full_history: HistoryEvent[]; key: string; dataset: string; spot: Record<string, any>; profile?: Profile; refs: Ref[]; dependencies: string[] };
export const nodeKey = (dataset: string, id: string, profile?: Profile) => [profile ? `profiles/${profile.profile}/${profile.role}` : "base", dataset, id].join("/");
const seats = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

export function buildGraph(estimated: string) {
  const datasets = new Map<string, any>();
  for (const dataset of DATASETS) datasets.set(dataset, JSON.parse(readFileSync(join(estimated, dataset + ".json"), "utf8")));
  for (const profile of PROFILES) for (const dataset of PROFILE_DATASETS) {
    const prefix = `profiles/${profile}/villain/${dataset}`;
    datasets.set(prefix, JSON.parse(readFileSync(join(estimated, prefix + ".json"), "utf8")));
  }
  const baseSpot = (dataset: string, id: string) => {
    const spot = datasets.get(dataset)?.spots.find((s: any) => s.id === id);
    if (!spot) throw new Error(`Unknown structural source ${dataset}/${id}`);
    return spot;
  };
  function history(dataset: string, spot: any): Ref[] {
    const refs: Ref[] = [];
    const add = (d: string, id: string, action: string, seat?: string) => {
      const source = baseSpot(d, id);
      refs.push({ dataset: d, spot_id: id, action, seat: seat ?? source.hero });
    };
    const inherit = (d: string, id: string, action: string) => {
      refs.push(...history(d, baseSpot(d, id))); add(d, id, action);
    };
    if (Array.isArray(spot.history)) {
      // The ordered recorded history is authoritative; source_factors are redundant
      // and some historical entries contain non-existent derived aliases.
      for (const event of spot.history) if (event.source) add(event.source.dataset, event.source.spot_id, event.source.action, event.seat);
      return refs;
    }
    if (dataset === "opening-ranges") {
      for (const seat of seats.slice(0, seats.indexOf(spot.hero))) add("opening-ranges", seat + "_open", "fold", seat);
    } else if (dataset === "preflop-ranges") {
      inherit("opening-ranges", spot.opener + "_open", "open");
      for (const seat of seats.slice(seats.indexOf(spot.opener) + 1, seats.indexOf(spot.hero))) add("preflop-ranges", `${seat}_vs_${spot.opener}`, "fold", seat);
    } else if (dataset === "three-bet-responses") inherit("preflop-ranges", spot.source_response_id, "three_bet");
    else if (dataset === "four-bet-responses") inherit("three-bet-responses", spot.source_three_bet_response_id, "four_bet");
    else if (dataset === "five-bet-responses") inherit("four-bet-responses", spot.source_four_bet_response_id, "all_in");
    else if (dataset === "multiway-responses") {
      inherit("preflop-ranges", `${spot.callers[0]}_vs_${spot.opener}`, "call");
    } else if (dataset === "multiway2-responses") {
      const ids = spot.source_caller_ids;
      inherit("multiway-responses", ids.at(-1), "call");
    } else if (dataset === "squeeze-responses") {
      inherit("multiway-responses", spot.source_squeeze_id, "squeeze");
      if (spot.prior_action) add("squeeze-responses", `${spot.opener}_vs_${spot.squeezer}_squeeze_${spot.hero}call`, spot.prior_action, spot.opener);
    } else if (dataset === "cold-three-bet-responses") inherit("preflop-ranges", spot.source_response_id, "three_bet");
    else if (dataset === "cold-four-bet-responses") {
      inherit("cold-three-bet-responses", spot.source_cold_three_bet_id, "four_bet");
      if (spot.prior_action) add("cold-four-bet-responses", `${spot.opener}_vs_${spot.four_bettor}_cold4bet_${spot.three_bettor}3bet`, spot.prior_action, spot.opener);
    } else if (dataset === "limp-responses") {
      if (spot.id === "BB_vs_SB_limp") inherit("opening-ranges", "SB_open", "limp");
      else if (spot.id === "SB_vs_BB_iso") inherit("limp-responses", "BB_vs_SB_limp", "raise");
      else inherit("limp-responses", "SB_vs_BB_iso", "raise");
    } else if (dataset === "limp-deep-responses") {
      if (spot.id === "SB_vs_BB_limp_four_bet") inherit("limp-responses", "BB_vs_SB_limp_reraise", "four_bet");
      else inherit("limp-deep-responses", "SB_vs_BB_limp_four_bet", "all_in");
    } else throw new Error("No authoritative history rule: " + dataset);
    return refs;
  }
  const nodes: Node[] = [];
  for (const [path, data] of datasets) {
    const parts = path.split("/");
    const profile = parts.length > 1 ? { profile: parts[1], role: parts[2] } : undefined;
    const dataset = parts.at(-1)!;
    for (const spot of data.spots) {
      const refs = spot.unreachable ? [] : history(dataset, spot);
      // Explicit profile context selection: covered profile nodes use their own
      // policy; references outside the profile domain use the labeled base policy.
      for (const ref of refs) ref.context = profile && PROFILE_DATASETS.includes(ref.dataset) ? profile.profile : "base";
      nodes.push({ full_history: [], key: nodeKey(dataset, spot.id, profile), dataset, spot, profile, refs, dependencies: refs.map(ref =>
        nodeKey(ref.dataset, ref.spot_id, ref.context !== "base" ? profile : undefined)) });
    }
  }
  const byKey = new Map(nodes.map(node => [node.key, node]));
  const eventKey = (events: HistoryEvent[]) => JSON.stringify(events.map(({ seat, action, to_size_bb }) => [seat, action, to_size_bb]));
  const decisionKey = (hero: string, events: HistoryEvent[]) => hero + ":" + eventKey(events);
  const structureSize = (spot: Record<string, any>, action: string, faced: number): number | null => {
    const value = scenarioOnly(spot) as Record<string, any>;
    if (["fold", "check"].includes(action)) return null;
    if (action === "call") return faced;
    if (value.action_sizes_bb && Object.hasOwn(value.action_sizes_bb, action)) return value.action_sizes_bb[action];
    if (action === "limp") return 1;
    if (action === "all_in") return value.all_in_size_bb ?? value.effective_stack_bb;
    return value[action + "_size_bb"] ?? (action === "raise" ? value.raise_to_bb : undefined) ?? null;
  };
  // Complete each prefix by simulating poker action order. Missing intervening
  // seats are explicit folds, never silently absent or another player's reach.
  for (const node of nodes) {
    if (node.spot.unreachable) continue;
    const raw: Array<{ seat: string; action: string; to_size_bb?: number | null; forced?: boolean; source: HistoryEvent["source"] }> =
      Array.isArray(node.spot.history) ? node.spot.history : node.refs.map(ref => ({ seat: ref.seat, action: ref.action,
        source: { dataset: ref.dataset, spot_id: ref.spot_id, action: ref.action } }));
    const folded = new Set<string>(), allIn = new Set<string>();
    let pending = new Set(seats), cursor = 0, faced = 1;
    const result: HistoryEvent[] = [];
    const next = () => {
      for (let offset = 0; offset < seats.length; offset++) {
        const index = (cursor + offset) % seats.length;
        if (pending.has(seats[index])) return index;
      }
      throw new Error("No pending actor before decision " + node.key);
    };
    const apply = (event: HistoryEvent) => {
      const actor = next();
      if (seats[actor] !== event.seat) throw new Error("Out-of-order history " + node.key);
      if (event.action === "fold") folded.add(event.seat);
      else if (event.action === "check") {
        if (faced > (event.seat === "BB" ? 1 : 0)) throw new Error("Check faces a bet " + node.key);
      } else {
        if (typeof event.to_size_bb !== "number" || !Number.isFinite(event.to_size_bb) || event.to_size_bb <= 0 || event.to_size_bb > 100)
          throw new Error("Unknown/invalid raise-to size " + node.key + "/" + event.action);
        if (event.action === "call" && event.to_size_bb !== faced) throw new Error("Call-to disagrees with history " + node.key);
        if (!["call", "limp", "all_in"].includes(event.action) && event.to_size_bb <= faced) throw new Error("Non-increasing raise " + node.key);
        if (event.to_size_bb === 100) allIn.add(event.seat);
        if (event.to_size_bb > faced) {
          faced = event.to_size_bb;
          pending = new Set(seats.filter(seat => seat !== event.seat && !folded.has(seat) && !allIn.has(seat)));
        }
      }
      pending.delete(event.seat); cursor = (actor + 1) % seats.length; result.push(event);
    };
    const advance = (seat: string) => {
      if (!seats.includes(seat) || !pending.has(seat)) throw new Error("Actor is not pending " + node.key + "/" + seat);
      while (seats[next()] !== seat) apply({ seat: seats[next()], action: "fold", to_size_bb: null, forced: true, source: null,
        assumption: "Intervening seat folds in the recorded scenario; conditional policy resolution pending." });
    };
    for (const event of raw) {
      advance(event.seat);
      const source = event.source;
      const sourceSpot = source ? baseSpot(source.dataset, source.spot_id) : undefined;
      const amount = sourceSpot ? structureSize(sourceSpot, source!.action, faced) : event.to_size_bb ?? null;
      if (event.to_size_bb !== undefined && event.to_size_bb !== amount) throw new Error("Recorded size/source contradiction " + node.key);
      if (source && event.action !== source.action) throw new Error("Recorded action/source contradiction " + node.key);
      apply({ seat: event.seat, action: event.action, to_size_bb: amount, forced: !!event.forced, source,
        ...(!source ? { assumption: "Recorded structural action without a generated conditional policy." } : {}) });
    }
    advance(node.spot.hero);
    node.full_history = result;
  }
  // Match a fold's exact decision prefix against the catalog. A missing source
  // remains an explicit structural assumption, not an invented frequency row.
  const catalog = new Map<string, Node[]>();
  for (const node of nodes.filter(node => !node.spot.unreachable && !node.profile)) {
    const key = decisionKey(node.spot.hero, node.full_history), entries = catalog.get(key) ?? [];
    entries.push(node); catalog.set(key, entries);
  }
  for (const node of nodes) {
    node.refs = []; node.dependencies = [];
    node.full_history.forEach((event, index) => {
      const prefix = node.full_history.slice(0, index);
      if (!event.source && event.action === "fold") {
        const candidates = (catalog.get(decisionKey(event.seat, prefix)) ?? []).filter(candidate => actionsForSpot(candidate.spot).includes("fold"));
        if (candidates.length > 1) throw new Error("Ambiguous conditional fold policy " + node.key + "/" + event.seat);
        if (candidates.length) {
          const candidate = candidates[0];
          event.source = { dataset: candidate.dataset, spot_id: candidate.spot.id, action: "fold" };
          delete event.assumption;
        }
      }
      if (!event.source) return;
      const source = event.source;
      const profile = node.profile && PROFILE_DATASETS.includes(source.dataset) ? node.profile : undefined;
      const key = nodeKey(source.dataset, source.spot_id, profile), prior = byKey.get(key);
      if (!prior || prior.spot.hero !== event.seat || !actionsForSpot(prior.spot).includes(source.action))
        throw new Error("Invalid canonical source " + node.key + "/" + key);
      if (eventKey(prior.full_history) !== eventKey(prefix)) throw new Error("Source decision prefix contradicts actual history " + node.key + "/" + key);
      const priorFaced = prefix.reduce((amount, priorEvent) => Math.max(amount, priorEvent.to_size_bb ?? 0), 1);
      if (structureSize(prior.spot, source.action, priorFaced) !== event.to_size_bb)
        throw new Error("Canonical source size contradicts actual history " + node.key + "/" + key);
      const ref: Ref = { ...source, seat: event.seat, context: profile?.profile ?? "base" };
      node.refs.push(ref); node.dependencies.push(key);
    });
  }

  for (const node of nodes) for (let i = 0; i < node.refs.length; i++) {
    const ref = node.refs[i], prior = byKey.get(node.dependencies[i]);
    if (!prior) throw new Error(`Missing dependency ${node.key}: ${node.dependencies[i]}`);
    if (prior.spot.hero !== ref.seat || !actionsForSpot(prior.spot).includes(ref.action)) throw new Error(`Invalid seat/action ${node.key}: ${JSON.stringify(ref)}`);
  }
  const done = new Set<string>(), visiting = new Set<string>();
  function visit(key: string) { if (done.has(key)) return; if (visiting.has(key)) throw new Error("Cycle: " + key); visiting.add(key); byKey.get(key)!.dependencies.forEach(visit); visiting.delete(key); done.add(key); }
  nodes.forEach(node => visit(node.key));
  return { nodes, byKey, datasets };
}
