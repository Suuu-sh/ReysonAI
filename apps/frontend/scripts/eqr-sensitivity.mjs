// Advisory: list hands whose call/fold or 3bet/call ranking changes at EQR ±5%.
// Uses published ranges/equities; no strategy is changed.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { callContexts, callFacts, validCallEquities } from "../src/estimated/call-ev.ts";
import { compareEqrSensitivity } from "./lib/eqr-sensitivity.mjs";
import { createOpenResponseRaiseModel, createRaiseEquityCache } from "./lib/raise-ev-context.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const path = name => join(root, "src/estimated", `${name}.json`);
const load = name => JSON.parse(readFileSync(path(name), "utf8"));
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => arg.startsWith("-"))) {
  console.error("Usage: npm run eqr-sensitivity -- [spot]");
  process.exitCode = 1;
} else {
  const only = args[0];
  const data = { opening: load("opening-ranges"), responses: load("preflop-ranges"),
    threeBets: load("three-bet-responses"), fourBets: load("four-bet-responses"),
    multiway: load("multiway-responses"), limp: load("limp-responses"),
    ...(existsSync(path("squeeze-responses")) ? { squeezes: load("squeeze-responses") } : {}),
    ...(existsSync(path("cold-three-bet-responses")) ? { coldThreeBets: load("cold-three-bet-responses") } : {}) };
  const equities = load("call-equities");
  const contexts = callContexts(data).filter(ctx => !only || ctx.spot.id === only);
  if (only && !contexts.length) throw new Error(`Unknown call spot: ${only}`);
  const cache = createRaiseEquityCache(root, data.opening.spots[0].hands.map(row => row.hand));
  const findings = [];
  for (const ctx of contexts) {
    if (ctx.input.all_in) continue; // all-in equity realizes fully; EQR scaling is inapplicable.
    if (!validCallEquities(equities, ctx)) throw new Error(`Call equities missing or stale: ${ctx.spot.id}`);
    const model = ctx.type === "response"
      ? createOpenResponseRaiseModel(ctx.spot, data, equities, (key, rows) => cache.table(key, rows)) : null;
    const hands = [];
    for (const row of ctx.spot.hands) {
      const equity = equities.spots[ctx.spot.id].equities[row.hand];
      const { eqr } = callFacts(ctx, row.hand, equity);
      const result = compareEqrSensitivity({ equity, eqr, pot: ctx.input.total_pot_after_call,
        cost: ctx.input.cost_to_call,
        ...(model ? { raiseAtScale: scale => model.evaluate(row.hand, scale).ev } : {}) });
      if (result.callFold || result.raiseCall) {
        hands.push(`${row.hand}(${[result.callFold && "call/fold", result.raiseCall && "3bet/call"].filter(Boolean).join("+")})`);
      }
    }
    if (hands.length) findings.push({ spot: ctx.spot.id, hands });
  }
  cache.save();
  findings.sort((a, b) => b.hands.length - a.hands.length || a.spot.localeCompare(b.spot));
  const shown = only ? findings : findings.slice(0, 15);
  for (const { spot, hands } of shown) {
    console.log(`${spot}: ${hands.length} hands — ${hands.slice(0, 8).join(", ")}${hands.length > 8 ? `, … +${hands.length - 8}` : ""}`);
  }
  if (!shown.length) console.log(only ? `${only}: no EQR-sensitive hands` : "No EQR-sensitive hands");
  const count = findings.reduce((sum, item) => sum + item.hands.length, 0);
  console.log(`Total: ${count} hands in ${findings.length} spots (EQR ±5%; advisory${!only && findings.length > shown.length ? `; top ${shown.length} shown` : ""}).`);
}
