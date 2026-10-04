// Offline authoring only: complete the explicitly enumerated histories in
// topological order, retaining every zero-reach branch as fold100 placeholders.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import { resolve, join } from "node:path";
import { hands } from "../src/data.ts";
import { continuationFamilies, continuationSpots } from "../src/estimated/continuation-tree.ts";
import { createContinuationModel, CONTINUATION_VERSION, CONTINUATION_SEED, continuationSamples } from "../src/estimated/continuation-model.ts";
import { validateContinuationDataset, validateContinuationSources } from "../src/estimated/continuation-responses.ts";
import { iterateContinuationDefense, orderContinuationCalls, continuationOrderEdges, auditContinuationEstimates } from "../src/estimated/continuation-audit.ts";
import { allowedCall, callFacts, threeBetTargetCall } from "../src/estimated/call-ev.ts";
import { rakeMetadata, raked } from "../src/estimated/rake.ts";
import { weightedRange, seededRandom, seedFor } from "./lib/equity.mjs";
import { continuationEquity } from "./lib/continuation-equity.mjs";
import { allInCallFrequency } from "./lib/all-in-call.mjs";
import { continuationProfile } from "./lib/continuation-profiles.mjs";
import { checkRangeBalance, checkCrossStrengthInversion } from "../src/estimated/audit.ts";
import { sampleJointDefense, evaluateJointDefenseHistogram, jointDefenseSaturated, jointDefenseRepairView, jointDefenseTolerance } from "../src/estimated/continuation-defense.ts";

const dir = process.env.ESTIMATES_DIR;
if (!dir || resolve(dir) === resolve("src/estimated")) throw new Error("Run npm run build:estimates; staging required");
mkdirSync(dir, { recursive: true });
const load = name => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const dependencies = ["opening-ranges", "preflop-ranges", "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses"];
const datasets = Object.fromEntries(dependencies.map(name => [name, load(name)]));
validateContinuationSources(datasets);
const wanted = process.env.CONTINUATION_FAMILIES?.split(",") ?? [...continuationFamilies];
if (!wanted.length || wanted.some(f => !continuationFamilies.includes(f))) throw new Error("Invalid requested continuation families");
const families = continuationFamilies.filter(f => wanted.includes(f));
const nodes = continuationSpots.filter(node => families.includes(node.family));
const cachePath = resolve(process.env.CONTINUATION_EQUITIES_CACHE ?? ".local/continuation-equities-v3-cache.json");
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : { version: CONTINUATION_VERSION, entries: {} };
if (cache.version !== CONTINUATION_VERSION) throw new Error("Unsupported continuation cache; do not trust a stale policy");
const saveCache = () => writeFileSync(cachePath, JSON.stringify(cache) + "\n");
const defenseCachePath = resolve(".local/continuation-defense-cache.json");
const defenseCache = existsSync(defenseCachePath) ? JSON.parse(readFileSync(defenseCachePath, "utf8")) : {};
const saveDefenseCache = () => writeFileSync(defenseCachePath, JSON.stringify(defenseCache) + "\n");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function writeDataset(file, data) {
  // Stream spots rather than allocating one53MB+ serialized string beside the
  // live model. Escape the small non-ASCII header so later JSON parsing can
  // retain a one-byte source string instead of doubling the entire document.
  const { spots, ...header } = data;
  const ascii = value => JSON.stringify(value).replace(/[^\x00-\x7f]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  const fd = openSync(file, "w");
  try {
    writeSync(fd, ascii(header).slice(0, -1) + ',"spots":[');
    for (let i = 0; i < spots.length; i++) writeSync(fd, (i ? "," : "") + ascii(spots[i]));
    writeSync(fd, "]}\n");
  } finally { closeSync(fd); }
}
const repairFloors = new Map();
const seen = new Set();
let data, table, pass = 0, computed = 0;
// Most deep-history rows have zero prior-action reach. Sharing immutable
// placeholders avoids allocating half a million identical mutable objects.
const foldRows = new Map(hands.map(hand => [hand, Object.freeze({ hand, fold: 100, call: 0, four_bet: 0, all_in: 0, raise_to_size_bb: null })]));
const nullEquities = Object.freeze(Object.fromEntries(hands.map(hand => [hand, null])));

function candidate(node, context) {
  return hands.map(hand => {
    if (context.reach(hand) <= 0) return foldRows.get(hand);
    const { call, aggressive } = context.reach(hand) > 0 && node.bet_level < 5 ? continuationProfile(node, hand, context) : { call: 0, aggressive: 0 };
    const row = { hand, fold: 100 - call - aggressive, call, four_bet: node.bet_level === 3 ? aggressive : 0,
      all_in: node.bet_level === 4 ? aggressive : 0, raise_to_size_bb: aggressive ? node.action_sizes_bb[node.bet_level === 3 ? "four_bet" : "all_in"] : null };
    return row;
  });
}

function generate() {
  const model = createContinuationModel(datasets), spots = [], equities = {};
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i], context = model.context(node);
    const spot = { ...node, unreachable: context.unreachable, hands: candidate(node, context) };
    context.spot = spot;
    const samples = continuationSamples(node);
    // Equity depends on the actual remaining ranges, not on the price or on
    // an unrelated history label. Range-keyed seeds let exact repeated inputs
    // reuse computations without hiding any geometry/source fingerprint.
    const rangeKey = digest({ seed: CONTINUATION_SEED, hero: context.input.hero, opponents: context.input.opponents, ranges: context.input.ranges,
      dead_opponents: context.input.dead_opponents, dead_ranges: context.input.dead_ranges, samples });
    const cached = cache.entries[rangeKey] ??= {};
    let expanded, deadExpanded;
    const values = context.unreachable ? nullEquities : {};
    for (const row of spot.hands) {
      if (context.reach(row.hand) <= 0) { if (!context.unreachable) values[row.hand] = null; continue; }
      if (!Number.isFinite(cached[row.hand])) {
        expanded ??= context.input.ranges.map(range => weightedRange(range.map(([hand, weight]) => ({ hand, weight }))));
        deadExpanded ??= context.input.dead_ranges.map(range => weightedRange(range.map(([hand, weight]) => ({ hand, weight }))));
        const random = seededRandom(seedFor(`${CONTINUATION_SEED}|${rangeKey}|${row.hand}`));
        cached[row.hand] = continuationEquity(row.hand, expanded, deadExpanded, samples, random);
        if (!Number.isFinite(cached[row.hand])) throw new Error(`No sampled legal deal despite nonzero support: ${node.id}/${row.hand}`);
        computed++;
      }
      values[row.hand] = cached[row.hand];
      const facts = callFacts(context, row.hand, values[row.hand]);
      if (node.bet_level === 5) row.call = allInCallFrequency((values[row.hand] - context.input.cost_to_call / raked(context.input.total_pot_after_call)) * 100);
      else {
        row.call = node.bet_level === 3 ? threeBetTargetCall(row.call, facts.call_ev_bb, 100 - row.four_bet) : allowedCall(row.call, facts.call_ev_bb);
        const floor = repairFloors.get(`${node.id}/${row.hand}`) ?? 0;
        row.call = Math.max(row.call, allowedCall(Math.min(floor, 100 - row.four_bet - row.all_in), facts.call_ev_bb));
      }
      row.fold = 100 - row.call - row.four_bet - row.all_in;
    }
    orderContinuationCalls(spot, context);
    const entry = { version: CONTINUATION_VERSION, seed: CONTINUATION_SEED, samples, range_fingerprint: rangeKey, input: context.input, equities: values };
    equities[node.id] = entry;
    spots.push(spot); model.register(spot);
    if ((i + 1) % 25 === 0 || i === nodes.length - 1) {
      saveCache();
      const memory = process.memoryUsage();
      console.log(`Continuation pass ${pass}: ${i + 1}/${nodes.length}; computed hand/range equities ${computed}; heap ${Math.round(memory.heapUsed / 1048576)}MB / RSS ${Math.round(memory.rss / 1048576)}MB`);
    }
  }
  return {
    data: { metadata: { schema_version: "1.0", strategy_type: "ai_estimate_not_gto", game: "6max Cash / No-Limit Texas Holdem",
      effective_stack_bb: 100, open_size_bb: 2.5, ante_bb: 0, rake: rakeMetadata, families,
      legal_actions: ["fold", "call", "four_bet", "all_in"],
      aggregation_model: "Unblocked combo-count times Hero's own prior-action reach. Joint card-compatibility mass is not used as an aggregate weight; only impossible support is removed.",
      defense_audit_model: "Joint complete-deal sampling at the first response to each raise, including prior folded ranges. Multiply hand-specific responder fold policies inside each accepted tuple and average, with maximum legal capacity paired on the same tuples. Conservative empirical Bernstein bounds: safe passes require upper bound below threshold; saturated conflicts require lower capacity bound above threshold. Exact supported-hand saturation is checked independently of sampled coverage. Not a solver equilibrium or every-hand exploitability proof.",
      method: "Explicit independent hand-group profiles; shared seeded call EV/EQR and all-in mix; exact saved prior-action reach; conditional integer frequencies. Not jointly solved or GTO.",
      opponent_model: "Every still-live opponent uses its exact current saved action reach. The pot credits only actual contributions plus Hero's current call, never hypothetical calls by pending players. This conservative incomplete-action approximation is not the exact payoff against their eventual conditional caller ranges. Joint whole-deal rejection conditions live and observed folded participants on distinct holecards; modeled folded cards are removed from boards. Forced outside folds remain unmodeled.",
      call_ev_policy: "12,000 seeded samples; common EQR and negative/boundary gate; +0.50BB fill in 3bet pots only. No broad fill in 4bet pots. Minimal legal call additions may defend a specific raise. All-in: EQR1, 20,000 samples and shared +/-2pt mix in 5% steps, followed by common 10pt strength ceilings; its near-break-even mixes are exempt from the ordinary negative-call gate.",
      unreachable_hands: "Zero prior-action reach, empty required history, or impossible live card assignment: fold100 placeholder, never a recommendation. Folded participants retain sunk chips and their observed-action source factors.",
      sizing_semantics: "Raise-to totals; two-caller squeeze continuations use approved fixed30BB four-bets only. Existing other sizes unchanged; 5bet only100BB.",
    }, spot_count: spots.length, hand_classes_per_spot: 169, entry_count: spots.length * 169, spots },
    table: { version: CONTINUATION_VERSION, seed: CONTINUATION_SEED, spots: equities, joint_defense: {} },
  };
}

function repair(data, table) {
  let changes = 0, checked = 0;
  for (const sourceEvent of iterateContinuationDefense(data, datasets, table)) {
    const event = jointDefenseRepairView(sourceEvent);
    const { record } = sampleJointDefense(event, { cached: defenseCache[event.id] });
    table.joint_defense[event.id] = record; defenseCache[event.id] = record;
    if (++checked % 25 === 0) {
      saveDefenseCache(); const memory = process.memoryUsage();
      console.log(`Joint defense pass ${pass}: ${checked} events; ${changes} positive-EV call increments; heap ${Math.round(memory.heapUsed / 1048576)}MB / RSS ${Math.round(memory.rss / 1048576)}MB`);
    }
    const threshold = event.threshold + jointDefenseTolerance(record);
    if (record.fold.upper <= threshold || jointDefenseSaturated(event) && record.capacity.lower > threshold) continue;
    // A straddling interval is never a pass. If capacity remains, a small
    // legal positive-EV call increment can safely clear its upper bound;
    // a saturated inconclusive case stays blocked for further diagnosis.
    if (record.fold.lower <= event.threshold && jointDefenseSaturated(event)) continue;
    const sampled = sampleJointDefense(event, { cached: record, withHistogram: true });
    let bound = sampled.record.fold;
    const candidates = event.group.flatMap(item => item.node.bet_level === 5 ? [] : item.spot.hands
      .filter(row => item.context.reach(row.hand) > 0)
      .map(row => ({ item, row, ev: callFacts(item.context, row.hand, table.spots[item.node.id].equities[row.hand]).call_ev_bb })))
      .filter(candidate => candidate.ev >= 0.05).sort((a, b) => b.ev - a.ev || a.row.hand.localeCompare(b.row.hand));
    let changed;
    do {
      changed = false;
      for (const { item, row } of candidates) {
        const rows = new Map(item.spot.hands.map(r => [r.hand, r]));
        const ceilings = continuationOrderEdges(item.context).filter(([, weak]) => weak === row.hand).map(([strong]) => row.fold - rows.get(strong).fold + 10);
        const increase = Math.min(5, (item.capacity?.maxCalls.get(row.hand) ?? row.call) - row.call, ...ceilings);
        if (increase <= 0) continue;
        row.call += increase; row.fold -= increase;
        repairFloors.set(`${item.node.id}/${row.hand}`, Math.max(repairFloors.get(`${item.node.id}/${row.hand}`) ?? 0, row.call));
        changed = true; changes++;
        bound = evaluateJointDefenseHistogram(event, sampled.histogram, sampled.record.samples).fold;
        if (bound.upper <= event.threshold || jointDefenseSaturated(event)) break;
      }
    } while (changed && bound.upper > event.threshold && !jointDefenseSaturated(event));
  }
  saveDefenseCache();
  return changes;
}

try {
  while (true) {
    pass++;
    ({ data, table } = generate());
    validateContinuationDataset(data, datasets, { allowPartial: families.length < continuationFamilies.length });
    const strategyHash = createHash("sha256");
    for (const spot of data.spots) strategyHash.update(JSON.stringify(spot.hands));
    const signature = strategyHash.digest("hex");
    if (seen.has(signature)) throw new Error("Continuation defense reconciliation cycled; keep staging for independent diagnosis");
    seen.add(signature);
    // Repair mutates this pass only to determine floors; regenerate all affected
    // descendants before accepting any inputs/facts, never retain stale ranges.
    const changes = repair(data, table);
    if (!changes) break;
    console.log(`Continuation defense: ${changes} minimal positive-EV call increments; regenerate dependent histories`);
  }
  const audit = auditContinuationEstimates(data, datasets, table, { allowPartial: families.length < continuationFamilies.length, checkRangeBalance, checkCrossStrengthInversion });
  writeDataset(join(dir, "continuation-responses.json"), data);
  writeFileSync(join(dir, "continuation-call-equities.json"), JSON.stringify(table) + "\n");
  writeFileSync(join(dir, "continuation-audit-report.json"), JSON.stringify(audit, null, 2) + "\n");
  const errors = audit.findings.filter(f => f.severity === "error");
  console.log(`Continuations: ${data.spot_count} decisions, ${data.spots.filter(s => !s.unreachable).length} reachable histories; audit ${errors.length} errors, ${audit.findings.length - errors.length} advisories; passes ${pass}`);
  if (errors.length) { console.error(errors.slice(0, 12)); process.exitCode = 1; }
} finally { saveCache(); saveDefenseCache(); }
