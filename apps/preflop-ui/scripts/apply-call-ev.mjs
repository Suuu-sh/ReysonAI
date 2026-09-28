// Generation-time selection, never a runtime strategy fallback. Only stages writes.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { callContexts, callFacts, allowedCall, targetCall, threeBetTargetCall, validCallEquities, CALL_EQUITY_VERSION, CALL_EQUITY_SAMPLES, CALL_EQUITY_SEED } from "../src/estimated/call-ev.ts";
import { reconcileCalls } from "./lib/call-consistency.mjs";
import { comboCount, equityVsRange, equityVsRanges, weightedRange, seededRandom, seedFor } from "./lib/equity.mjs";

const dir = process.env.ESTIMATES_DIR;
if (!dir || resolve(dir) === resolve("src/estimated")) throw new Error("Run npm run build:estimates; staging required");
const files = { opening: "opening-ranges", responses: "preflop-ranges", threeBets: "three-bet-responses", fourBets: "four-bet-responses", multiway: "multiway-responses", squeezes: "squeeze-responses", limp: "limp-responses", coldThreeBets: "cold-three-bet-responses" };
const target = process.argv[2];
const load = name => JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
const data = Object.fromEntries(Object.entries(files).filter(([, file]) => existsSync(`${dir}/${file}.json`)).map(([key, file]) => [key, load(file)]));
const table = existsSync(`${dir}/call-equities.json`) ? load("call-equities") : { spots: {} };
if (table.version !== CALL_EQUITY_VERSION || table.samples !== CALL_EQUITY_SAMPLES || table.seed !== CALL_EQUITY_SEED) table.spots = {};
Object.assign(table, { version: CALL_EQUITY_VERSION, samples: CALL_EQUITY_SAMPLES, seed: CALL_EQUITY_SEED });
const report = existsSync(`${dir}/call-ev-report.json`) ? load("call-ev-report") : { method: "Assumed EQR; fixed-seed Monte Carlo, not solver EV. Combo % is reach-weighted removed call combos / incoming combos × 100.", spots: {} };
const targetSpots = data[Object.keys(files).find(key => files[key] === target)]?.spots;
if (!targetSpots) throw new Error(`Unknown target ${target}`);
// Callers facing a squeeze after the opener called see the opener's *final*
// squeeze-response calls, so that stage is selected after the opener's stage.
const stages = target === "squeeze-responses"
  ? [c => c.spot.prior_action !== "call", c => c.spot.prior_action === "call"] : [() => true];
for (const stage of stages) {
const contexts = callContexts(data).filter(c => targetSpots.includes(c.spot) && stage(c));
for (const context of contexts) {
  const { spot } = context;
  if (!validCallEquities(table, context)) {
    const ranges = context.input.ranges.map(rows => weightedRange(rows.map(([hand, weight]) => ({ hand, weight }))));
    if (ranges.some(range => !range.length)) throw new Error(`${spot.id}: empty opposing range`);
    const equities = {};
    for (const row of spot.hands) {
      const random = seededRandom(seedFor(`call-equity-v1|${spot.id}|${row.hand}`));
      equities[row.hand] = ranges.length === 1 ? equityVsRange(row.hand, ranges[0], CALL_EQUITY_SAMPLES, random)
        : equityVsRanges(row.hand, ranges, CALL_EQUITY_SAMPLES, random);
    }
    table.spots[spot.id] = { input: context.input, equities };
    if (process.env.CALL_EQUITIES_CACHE) writeFileSync(process.env.CALL_EQUITIES_CACHE, JSON.stringify(table, null, 2) + "\n");
    console.log(`Computed call equity: ${spot.id}`);
  }
  let incoming = 0, removed = 0, beforeContinue = 0, afterContinue = 0;
  const negative = [], boundary = [], positiveUncalled = [];
  for (const row of spot.hands) {
    const weight = comboCount(row.hand) * context.reach(row.hand);
    incoming += weight;
    beforeContinue += weight * (100 - row.fold) / 100;
    const facts = callFacts(context, row.hand, table.spots[spot.id].equities[row.hand]);
    const before = row.call;
    // Unreachable rows keep their fold=100 placeholder.
    // +EV fill for open responses by non-SB seats (SB stays 3bet-or-fold). 3bet pots get only a
    // high-threshold fill (>= +0.50bb): the EQR table may not fully capture the lower OOP
    // realization there, so the margin keeps thin spots authored. 4bet pots are not filled.
    const fill = weight > 0 && context.type === "response" && spot.hero !== "SB";
    // Facing a squeeze uses the same +0.50bb margin as 3bet pots.
    // BB facing SB's limp-reraise is a 3bet-sized pot too: same margin, as is a cold call of a 3bet.
    const fillThreeBet = weight > 0 && ["three_bet", "squeeze", "limp_reraise", "cold_three_bet"].includes(context.type);
    row.call = fill ? targetCall(before, facts.call_ev_bb, before + row.fold)
      : fillThreeBet ? threeBetTargetCall(before, facts.call_ev_bb, before + row.fold)
      : allowedCall(before, facts.call_ev_bb);
    row.fold += before - row.call;
    afterContinue += weight * (100 - row.fold) / 100;
    if (before > row.call) {
      const item = { hand: row.hand, before, after: row.call, call_ev_bb: facts.call_ev_bb, removed_combos: weight * (before - row.call) / 100 };
      (facts.call_ev_bb < -0.05 ? negative : boundary).push(item);
      if (facts.call_ev_bb < -0.05) removed += item.removed_combos;
    }
    if (weight > 0 && facts.call_ev_bb >= 0.3 && row.call === 0) positiveUncalled.push({ hand: row.hand, call_ev_bb: facts.call_ev_bb, fold: row.fold });
  }
  report.spots[spot.id] = { type: context.type, removed_hand_count: negative.length, removed_combos: removed,
    removed_combo_pct: removed / incoming * 100, incoming_combos: incoming,
    before_continuation_pct: beforeContinue / incoming * 100, after_continuation_pct: afterContinue / incoming * 100,
    negative, boundary, positive_uncalled: positiveUncalled };
  console.log(`${spot.id}: removed ${negative.length} negative calls (${(removed / incoming * 100).toFixed(2)}pt), ${boundary.length} boundary caps`);
}
const changes = reconcileCalls(contexts, table);
for (const c of contexts) {
  const item = report.spots[c.spot.id];
  item.consistency_adjustments = changes.filter(change => change.spot === c.spot.id);
  item.after_continuation_pct = c.spot.hands.reduce((n, row) => n + comboCount(row.hand) * c.reach(row.hand) * (100 - row.fold), 0) / item.incoming_combos;
  item.positive_uncalled = c.spot.hands.filter(row => c.reach(row.hand) > 0 && row.call === 0).map(row => ({
    hand: row.hand, fold: row.fold, call_ev_bb: callFacts(c, row.hand, table.spots[c.spot.id].equities[row.hand]).call_ev_bb,
  })).filter(row => row.call_ev_bb >= 0.3);
}
}
const dataset = data[Object.keys(files).find(key => files[key] === target)];
dataset.metadata.call_ev_policy = "Fixed-seed range equity × assumed EQR × raked(pot after call) − call cost. EV < −0.05bb: call=0; EV < +0.05bb: call≤50%; +0.05〜0.10bb: call≥half of the non-raise share; ≥+0.10bb: all non-raise share calls (open responses by non-SB seats). Opener facing a 3bet: only calls ≥+0.50bb fill the whole non-4bet share (margin for OOP realization the assumed EQR may overstate in 3bet pots); 4bet pots are never filled. Aggressive frequencies unchanged; strength/nesting ceilings trim calls, and only positive-EV calls may be minimally added to preserve the existing auto-profit gate. Not solver EV.";
if (target === "limp-responses") dataset.metadata.call_ev_policy = "Fixed-seed range equity × assumed EQR × raked(pot after call) − call cost. SB vs BB iso: EV < −0.05bb: call=0; EV < +0.05bb: call≤50%; otherwise the authored call stands. BB vs SB limp-reraise (IP, 7BB into 21BB, versus SB's limp × reraise range): the same gate, and ≥+0.50bb fills the whole non-4bet share (same margin as 3bet pots). Raise/4bet frequencies unchanged; strength ceilings trim calls, and only positive-EV calls may be minimally added to keep BB's fold rate at or below SB's limp-reraise break-even. Not solver EV.";
if (target === "squeeze-responses") dataset.metadata.call_ev_policy = "Fixed-seed range equity × assumed EQR × raked(pot after call) − call cost, versus the squeezer's saved squeeze range (plus the opener's squeeze-call range when the opener called). EV < −0.05bb: call=0; EV < +0.05bb: call≤50%; ≥+0.50bb: the whole non-4bet share calls (same margin as 3bet pots). The opener facing a squeeze with the caller still behind also applies CALLER_BEHIND_EQR. 4bet frequencies unchanged; strength ceilings trim calls, and only positive-EV calls may be minimally added to keep the opener×caller fold rate at or below the squeezer's break-even. Not solver EV.";
if (target === "cold-three-bet-responses") dataset.metadata.call_ev_policy = "Fixed-seed range equity × assumed EQR × OPENER_BEHIND_EQR × raked(pot after call) − call cost, versus the 3bettor's saved 3bet range (call = 3bet − hero's blind; pot = both 3bets + the open + other dead blinds). EV < −0.05bb: call=0; EV < +0.05bb: call≤50%; ≥+0.50bb: the whole non-4bet share calls (same margin as 3bet pots). 4bet frequencies unchanged; strength ceilings trim calls. Not solver EV.";
writeFileSync(`${dir}/${target}.json`, JSON.stringify(dataset, null, 2) + "\n");
writeFileSync(`${dir}/call-equities.json`, JSON.stringify(table, null, 2) + "\n");
writeFileSync(`${dir}/call-ev-report.json`, JSON.stringify(report, null, 2) + "\n");
