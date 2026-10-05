// Offline authoring only: complete the explicitly enumerated histories in
// topological order, retaining every zero-reach branch as fold100 placeholders.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, writeSync, closeSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import { hands } from "../src/data.ts";
import { stage3Families, stage3Spots, stage3Roots, stage3RootById } from "../src/estimated/stage3-tree.ts";
import { createStage3Model, STAGE3_VERSION, STAGE3_SEED, stage3Samples } from "../src/estimated/stage3-model.ts";
import { validateStage3Dataset, validateStage3Sources } from "../src/estimated/stage3-responses.ts";
import { iterateStage3Defense, orderStage3Calls, stage3OrderEdges, auditStage3Estimates } from "../src/estimated/stage3-audit.ts";
import { allowedCall, callFacts, threeBetTargetCall } from "../src/estimated/stage3-call-ev.ts";
import { rakeMetadata, raked } from "../src/estimated/rake.ts";
import { weightedRange, seededRandom, seedFor } from "./lib/equity.mjs";
import { continuationEquity as stage3Equity } from "./lib/continuation-equity.mjs";
import { allInCallFrequency } from "./lib/all-in-call.mjs";
import { stage3Profile } from "./lib/stage3-profiles.mjs";
import { checkRangeBalance, checkCrossStrengthInversion } from "../src/estimated/audit.ts";
import { sampleJointDefense, evaluateJointDefenseHistogram, jointDefenseSaturated, jointDefenseRepairView, jointDefenseTolerance } from "../src/estimated/continuation-defense.ts";

import { stage3PauseCheckpoint, STAGE3_PAUSE_CODE } from "./lib/stage3-checkpoint.mjs";
import { stage3Coverage } from "../src/estimated/stage3-coverage.ts";
const dir = process.env.ESTIMATES_DIR;
if (!dir || resolve(dir) === resolve("src/estimated")) throw new Error("Run npm run build:estimates; staging required");
mkdirSync(dir, { recursive: true });
const load = name => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const dependencies = ["opening-ranges", "preflop-ranges", "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses", "continuation-responses"];
const datasets = Object.fromEntries(dependencies.map(name => [name, load(name)]));
validateStage3Sources(datasets);
const wanted = process.env.STAGE3_FAMILIES?.split(",") ?? [...stage3Families];
if (!wanted.length || wanted.some(f => !stage3Families.includes(f))) throw new Error("Invalid requested stage3 families");
const families = stage3Families.filter(f => wanted.includes(f));
const selectedRoots = process.env.STAGE3_ROOTS?.split(",");
if (selectedRoots && (!selectedRoots.length || new Set(selectedRoots).size !== selectedRoots.length || selectedRoots.some(id => !stage3Roots.some(root => root.id === id && families.includes(root.family))))) throw new Error("Invalid Stage3 root smoke selection");
const nodes = stage3Spots.filter(node => families.includes(node.family) && (!selectedRoots || selectedRoots.includes(node.root_id)));
const partial = families.length < stage3Families.length || Boolean(selectedRoots);
const checkpointLimit = process.env.STAGE3_CHECKPOINT_LIMIT ? Number(process.env.STAGE3_CHECKPOINT_LIMIT) : null;
if (checkpointLimit !== null && (!selectedRoots || !Number.isSafeInteger(checkpointLimit) || checkpointLimit <= 0 || checkpointLimit % 64)) throw new Error("Checkpoint smoke limit requires selected roots and a positive multiple of64");
const atomicJson = (file, value) => { const temporary = `${file}.tmp-${process.pid}`; writeFileSync(temporary, JSON.stringify(value) + "\n"); renameSync(temporary, file); };
const cachePath = resolve(process.env.STAGE3_EQUITIES_CACHE ?? ".local/stage3-equities-v1-cache.json");
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : { version: STAGE3_VERSION, entries: {} };
if (cache.version !== STAGE3_VERSION) throw new Error("Unsupported stage3 cache; do not trust a stale policy");
const saveCache = () => atomicJson(cachePath, cache);
const defenseCachePath = resolve(process.env.STAGE3_DEFENSE_CACHE ?? ".local/stage3-defense-cache.json");
const defenseCache = existsSync(defenseCachePath) ? JSON.parse(readFileSync(defenseCachePath, "utf8")) : {};
const saveDefenseCache = () => atomicJson(defenseCachePath, defenseCache);
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
let data, table, pass = 0, computed = 0, computedAcceptedDeals = 0;
// Most deep-history rows have zero prior-action reach. Sharing immutable
// placeholders avoids allocating half a million identical mutable objects.
const foldRows = new Map(hands.map(hand => [hand, Object.freeze({ hand, fold: 100, call: 0, squeeze: 0, four_bet: 0, all_in: 0, raise_to_size_bb: null })]));
const nullEquities = Object.freeze(Object.fromEntries(hands.map(hand => [hand, null])));
const checkPause = (equityCheckpoint = false) => stage3PauseCheckpoint({ pauseFile: process.env.STAGE3_PAUSE_FILE, checkpointLimit, computed, equityCheckpoint });

function candidate(node, context) {
  return hands.map(hand => {
    if (context.reach(hand) <= 0) return foldRows.get(hand);
    const { call, aggressive } = context.reach(hand) > 0 && node.bet_level < 5 ? stage3Profile(node, hand, context) : { call: 0, aggressive: 0 };
    const row = { hand, fold: 100 - call - aggressive, call, squeeze: node.bet_level === 2 ? aggressive : 0, four_bet: node.bet_level === 3 ? aggressive : 0,
      all_in: node.bet_level === 4 ? aggressive : 0, raise_to_size_bb: aggressive ? node.action_sizes_bb[node.bet_level === 2 ? "squeeze" : node.bet_level === 3 ? "four_bet" : "all_in"] : null };
    return row;
  });
}

function generate() {
  const model = createStage3Model(datasets), spots = [], equities = {};
  let previousFamily = null;
  for (let i = 0; i < nodes.length; i++) {
    checkPause();
    const node = nodes[i];
    if (node.family !== previousFamily) {
      if (previousFamily) { saveCache(); const mem = process.memoryUsage(); console.log(`Stage3 family ${previousFamily} pass ${pass} complete: ${spots.filter(s => s.family === previousFamily).length} saved decisions; ${computed} newly computed equities / ${computedAcceptedDeals} accepted equity deals cumulatively; RSS ${Math.round(mem.rss / 1048576)}MB`); }
      previousFamily = node.family;
    }
    if (model.rootEvidence(stage3RootById.get(node.root_id)).rare) continue;
    const context = model.context(node);
    if (context.unreachable) continue;
    const spot = { ...node, unreachable: context.unreachable, hands: candidate(node, context) };
    context.spot = spot;
    const samples = stage3Samples(node);
    // Equity depends on the actual remaining ranges, not on the price or on
    // an unrelated history label. Range-keyed seeds let exact repeated inputs
    // reuse computations without hiding any geometry/source fingerprint.
    const rangeKey = digest({ seed: STAGE3_SEED, hero: context.input.hero, opponents: context.input.opponents, ranges: context.input.ranges,
      dead_opponents: context.input.dead_opponents, dead_ranges: context.input.dead_ranges, samples });
    const cached = cache.entries[rangeKey] ??= {};
    let expanded, deadExpanded;
    const values = context.unreachable ? nullEquities : {};
    for (const row of spot.hands) {
      if (context.reach(row.hand) <= 0) { if (!context.unreachable) values[row.hand] = null; continue; }
      if (!Number.isFinite(cached[row.hand])) {
        expanded ??= context.input.ranges.map(range => weightedRange(range.map(([hand, weight]) => ({ hand, weight }))));
        deadExpanded ??= context.input.dead_ranges.map(range => weightedRange(range.map(([hand, weight]) => ({ hand, weight }))));
        const random = seededRandom(seedFor(`${STAGE3_SEED}|${rangeKey}|${row.hand}`));
        cached[row.hand] = stage3Equity(row.hand, expanded, deadExpanded, samples, random);
        if (!Number.isFinite(cached[row.hand])) throw new Error(`No sampled legal deal despite nonzero support: ${node.id}/${row.hand}`);
        computed++; computedAcceptedDeals += samples;
        if (computed % 64 === 0) {
          saveCache(); console.log(`Stage3 checkpoint: ${computed} hand/range equities; ${computedAcceptedDeals} accepted equity deals`);
          checkPause(true);
        }
      }
      values[row.hand] = cached[row.hand];
      const facts = callFacts(context, row.hand, values[row.hand]);
      if (node.bet_level === 5) row.call = allInCallFrequency((values[row.hand] - context.input.cost_to_call / raked(context.input.total_pot_after_call)) * 100);
      else {
        row.call = node.bet_level === 3 ? threeBetTargetCall(row.call, facts.call_ev_bb, 100 - row.four_bet) : allowedCall(row.call, facts.call_ev_bb);
        const floor = repairFloors.get(`${node.id}/${row.hand}`) ?? 0;
        row.call = Math.max(row.call, allowedCall(Math.min(floor, 100 - row.squeeze - row.four_bet - row.all_in), facts.call_ev_bb));
      }
      row.fold = 100 - row.call - row.squeeze - row.four_bet - row.all_in;
    }
    orderStage3Calls(spot, context);
    const entry = { version: STAGE3_VERSION, seed: STAGE3_SEED, samples, range_fingerprint: rangeKey, input: context.input, equities: values };
    equities[node.id] = entry;
    spots.push(spot); model.register(spot);
    if ((i + 1) % 25 === 0 || i === nodes.length - 1) {
      saveCache();
      const memory = process.memoryUsage();
      console.log(`Stage3 pass ${pass}: ${i + 1}/${nodes.length}; ${spots.length} saved decisions; computed hand/range equities ${computed}; heap ${Math.round(memory.heapUsed / 1048576)}MB / RSS ${Math.round(memory.rss / 1048576)}MB`);
    }
  }
  return {
    data: { metadata: { schema_version: "1.0", storage: "reachable-nonrare-only", strategy_type: "ai_estimate_not_gto", game: "6max Cash / No-Limit Texas Holdem",
      effective_stack_bb: 100, open_size_bb: 2.5, ante_bb: 0, rake: rakeMetadata, families, ...(selectedRoots ? { root_ids: selectedRoots } : {}),
      legal_actions: ["fold", "call", "squeeze", "four_bet", "all_in"],
      aggregation_model: "Unblocked combo-count times Hero's own prior-action reach. Joint card-compatibility mass is not used as an aggregate weight; only impossible support is removed.",
      defense_audit_model: "Joint complete-deal sampling at the first response to each raise, including prior folded ranges. Multiply hand-specific responder fold policies inside each accepted tuple and average, with maximum legal capacity paired on the same tuples. Conservative empirical Bernstein bounds: safe passes require upper bound below threshold; saturated conflicts require lower capacity bound above threshold. Exact supported-hand saturation is checked independently of sampled coverage. Not a solver equilibrium or every-hand exploitability proof.",
      method: "Explicit independent hand-group profiles; shared seeded call EV/EQR and all-in mix; exact saved prior-action reach; conditional integer frequencies. Not jointly solved or GTO.",
      opponent_model: "Every still-live opponent uses its exact current saved action reach. The pot credits only actual contributions plus Hero's current call, never hypothetical calls by pending players. This conservative incomplete-action approximation is not the exact payoff against their eventual conditional caller ranges. Joint whole-deal rejection conditions live and observed folded participants on distinct holecards; modeled folded cards are removed from boards. Forced outside folds remain unmodeled.",
      call_ev_policy: "12,000 seeded samples; common EQR and negative/boundary gate; +0.50BB fill in 3bet pots only. No broad fill in 4bet pots. Minimal legal call additions may defend a specific raise. All-in: EQR1, 20,000 samples and shared +/-2pt mix in 5% steps, followed by common 10pt strength ceilings; its near-break-even mixes are exempt from the ordinary negative-call gate.",
      unreachable_hands: "Zero prior-action reach, empty required history, or impossible live card assignment: fold100 placeholder, never a recommendation. Folded participants retain sunk chips and their observed-action source factors.",
      sizing_semantics: "Raise-to totals; one/two-caller squeezes retain existing fixed sizes; structural three/four-caller squeezes use isolated40BB four-bets, rare-pruned under current saved inputs. 5bet only100BB.",
    }, catalog_spot_count: nodes.length, omitted_rare_count: nodes.filter(node => model.rootEvidence(stage3RootById.get(node.root_id)).rare).length, omitted_unreachable_count: nodes.filter(node => !model.rootEvidence(stage3RootById.get(node.root_id)).rare).length - spots.length, spot_count: spots.length, hand_classes_per_spot: 169, entry_count: spots.length * 169, spots },
    table: { version: STAGE3_VERSION, seed: STAGE3_SEED, spots: equities, joint_defense: {} },
  };
}

function repair(data, table) {
  let changes = 0, checked = 0;
  for (const sourceEvent of iterateStage3Defense(data, datasets, table)) {
    checkPause();
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
        const ceilings = stage3OrderEdges(item.context).filter(([, weak]) => weak === row.hand).map(([strong]) => row.fold - rows.get(strong).fold + 10);
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
    checkPause();
    pass++;
    ({ data, table } = generate());
    validateStage3Dataset(data, datasets, { allowPartial: partial });
    const strategyHash = createHash("sha256");
    for (const spot of data.spots) strategyHash.update(JSON.stringify(spot.hands));
    const signature = strategyHash.digest("hex");
    if (seen.has(signature)) throw new Error("Stage3 defense reconciliation cycled; keep staging for independent diagnosis");
    seen.add(signature);
    // Repair mutates this pass only to determine floors; regenerate all affected
    // descendants before accepting any inputs/facts, never retain stale ranges.
    const changes = repair(data, table);
    if (!changes) break;
    console.log(`Stage3 defense: ${changes} minimal positive-EV call increments; regenerate dependent histories`);
  }
  checkPause();
  const audit = auditStage3Estimates(data, datasets, table, { allowPartial: partial, checkRangeBalance, checkCrossStrengthInversion });
  checkPause();
  writeDataset(join(dir, "stage3-responses.json"), data);
  writeFileSync(join(dir, "stage3-call-equities.json"), JSON.stringify(table) + "\n");
  writeFileSync(join(dir, "stage3-audit-report.json"), JSON.stringify(audit, null, 2) + "\n");
  writeFileSync(join(dir, "stage3-coverage.json"), JSON.stringify(stage3Coverage(data, datasets)) + "\n");
  const errors = audit.findings.filter(f => f.severity === "error");
  console.log(`Stage3: ${data.spot_count} decisions, ${data.spots.filter(s => !s.unreachable).length} reachable histories; audit ${errors.length} errors, ${audit.findings.length - errors.length} advisories; passes ${pass}`);
  console.log(`Stage3 computed accepted equity deals: ${computedAcceptedDeals}; newly computed hand/range equities: ${computed}; cache: ${cachePath}`);
  if (errors.length) { console.error(errors.slice(0, 12)); process.exitCode = 1; }
} catch (error) {
  if (error.code !== STAGE3_PAUSE_CODE) throw error;
  console.log(`${error.message} New hand/range equities ${computed}; accepted equity deals ${computedAcceptedDeals}.`); process.exitCode = 75;
} finally { saveCache(); saveDefenseCache(); }
