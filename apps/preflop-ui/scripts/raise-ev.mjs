// Advisory: compares 3bet EV with call EV for every open response and lists mismatches.
// Usage: npm run raise-ev [-- spot ...] [--margin 0.5] [--all]
//   under-raised: 3bet 0% but 3bet EV beats max(call EV, 0) by > margin
//   over-raised:  3bet > 0% but 3bet EV trails max(call EV, 0) by > margin
// Reads published src/estimated. Players behind the hero (squeezes, overcalls) are ignored.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { callContexts, callFacts } from "../src/estimated/call-ev.js";
import { classify } from "./lib/raise-ev.mjs";
import { createOpenResponseRaiseModel, createRaiseEquityCache } from "./lib/raise-ev-context.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const load = name => JSON.parse(readFileSync(join(root, "src/estimated", `${name}.json`), "utf8"));
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const margin = Number(flag("--margin") ?? 0.5);
const showAll = args.includes("--all") && args.splice(args.indexOf("--all"), 1);
const only = args;
const data = { opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"), fourBets: load("four-bet-responses"), multiway: load("multiway-responses"), limp: load("limp-responses") };
const table = load("call-equities");
const contexts = new Map(callContexts(data).map(c => [c.spot.id, c]));
const equityCache = createRaiseEquityCache(root, data.opening.spots[0].hands.map(row => row.hand));

const lines = [];
let flagged = 0;
for (const spot of data.responses.spots) {
  if (only.length && !only.includes(spot.id)) continue;
  const raiseModel = createOpenResponseRaiseModel(spot, data, table, (key, rows) => equityCache.table(key, rows));
  if (!raiseModel) continue;
  const ctx = contexts.get(spot.id);
  const rows = spot.hands.map(row => {
    const callEv = callFacts(ctx, row.hand, table.spots[spot.id].equities[row.hand]).call_ev_bb;
    const { ev, shares } = raiseModel.evaluate(row.hand);
    return { hand: row.hand, threeBet: row.three_bet, call: row.call, callEv, raiseEv: ev, fold: shares.fold, flag: classify({ threeBet: row.three_bet, callEv, raiseEv: ev }, margin) };
  });
  const bad = rows.filter(r => r.flag).sort((a, b) => Math.abs(b.raiseEv - Math.max(b.callEv, 0)) - Math.abs(a.raiseEv - Math.max(a.callEv, 0)));
  flagged += bad.length;
  const f = n => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;
  const avgFold = rows.reduce((s, r) => s + r.fold, 0) / rows.length;
  lines.push(`${spot.id}: under ${bad.filter(r => r.flag === "under-raised").length} / over ${bad.filter(r => r.flag === "over-raised").length} (opener folds to 3bet ~${(avgFold * 100).toFixed(0)}%)`);
  for (const r of (showAll ? bad : bad.slice(0, 6))) lines.push(`  ${r.flag === "under-raised" ? "↑" : "↓"} ${r.hand.padEnd(3)} 3bet ${String(r.threeBet).padStart(3)}% EV ${f(r.raiseEv)} | call ${String(r.call).padStart(3)}% EV ${f(r.callEv)}`);
  if (!showAll && bad.length > 6) lines.push(`  … ${bad.length - 6} more (--all)`);
}
equityCache.save();
lines.push(`flagged ${flagged} hands (margin ${margin}bb). ↑ raise more / ↓ raise less. Advisory: players behind ignored, assumed EQR.`);
console.log(lines.join("\n"));
