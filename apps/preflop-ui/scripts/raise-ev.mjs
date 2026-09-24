// Advisory: compares 3bet EV with call EV for every open response and lists mismatches.
// Usage: npm run raise-ev [-- spot ...] [--margin 0.5] [--all]
//   under-raised: 3bet 0% but 3bet EV beats max(call EV, 0) by > margin
//   over-raised:  3bet > 0% but 3bet EV trails max(call EV, 0) by > margin
// Reads published src/estimated. Players behind the hero (squeezes, overcalls) are ignored.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { callContexts, callFacts } from "../src/estimated/call-ev.js";
import { equityVsRange, seededRandom, seedFor, weightedRange } from "./lib/equity.mjs";
import { classify, raiseEv, replyShares } from "./lib/raise-ev.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const load = name => JSON.parse(readFileSync(join(root, "src/estimated", `${name}.json`), "utf8"));
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const margin = Number(flag("--margin") ?? 0.5);
const showAll = args.includes("--all") && args.splice(args.indexOf("--all"), 1);
const only = args;
const SAMPLES = 3000;

const data = { opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"), fourBets: load("four-bet-responses"), multiway: load("multiway-responses"), limp: load("limp-responses") };
const table = load("call-equities");
const contexts = new Map(callContexts(data).map(c => [c.spot.id, c]));
const opens = new Map(data.opening.spots.map(s => [s.hero, s]));
const cachePath = join(root, ".local/raise-ev-cache.json");
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
const hash = v => createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 12);

function equityTable(key, rows) {
  const id = `${key}|${hash(rows)}|${SAMPLES}`;
  if (cache[id]) return cache[id];
  const range = weightedRange(rows.map(([hand, weight]) => ({ hand, weight })));
  const out = {};
  for (const hand of data.opening.spots[0].hands.map(h => h.hand)) out[hand] = equityVsRange(hand, range, SAMPLES, seededRandom(seedFor(`${id}|${hand}`)));
  return (cache[id] = out);
}

const lines = [];
let flagged = 0;
for (const spot of data.responses.spots) {
  if (only.length && !only.includes(spot.id)) continue;
  const open = opens.get(spot.opener);
  const reply = data.threeBets.spots.find(s => s.opener === spot.opener && s.three_bettor === spot.hero);
  const four = data.fourBets.spots.find(s => s.opener === spot.opener && s.hero === spot.hero);
  if (!reply || !spot.three_bet_size_bb) continue;
  const openBy = new Map(open.hands.map(r => [r.hand, r.open / 100]));
  const vsCall = equityTable(`${spot.id}|call`, reply.hands.map(r => [r.hand, (openBy.get(r.hand) ?? 0) * r.call / 100]).filter(([, w]) => w > 0));
  const vsFour = table.spots[four?.id]?.equities ?? equityTable(`${spot.id}|four`, reply.hands.map(r => [r.hand, (openBy.get(r.hand) ?? 0) * r.four_bet / 100]).filter(([, w]) => w > 0));
  const fourBy = new Map((four?.hands ?? []).map(r => [r.hand, r]));
  const g = { hero: spot.hero, opener: spot.opener, open: spot.open_size_bb, threeBet: spot.three_bet_size_bb, fourBet: reply.four_bet_size_bb, stack: spot.effective_stack_bb };
  const ctx = contexts.get(spot.id);
  const rows = spot.hands.map(row => {
    const callEv = callFacts(ctx, row.hand, table.spots[spot.id].equities[row.hand]).call_ev_bb;
    const shares = replyShares(row.hand, open.hands, reply.hands);
    const { ev } = raiseEv(row.hand, shares, fourBy.get(row.hand), { vsCall: vsCall[row.hand], vsFourBet: vsFour[row.hand] }, g);
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
mkdirSync(join(root, ".local"), { recursive: true });
writeFileSync(cachePath, JSON.stringify(cache));
lines.push(`flagged ${flagged} hands (margin ${margin}bb). ↑ raise more / ↓ raise less. Advisory: players behind ignored, assumed EQR.`);
console.log(lines.join("\n"));
