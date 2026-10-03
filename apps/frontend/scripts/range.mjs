// Token-lean range authoring CLI: read spots and verify edits without opening the large JSON.
// Usage:
//   npm run range -- list [filter]            spot ids with combo-weighted action mix
//   npm run range -- view <spot> [action]      13×13 grid (dominant action, or one action's %) + mix
//   npm run range -- check [spot ...]          dry-run build: mix before→after, changed hands, audit, benchmark
// check never publishes; run `npm run pipeline` (or build:estimates) once it is clean.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { comboCount } from "./lib/equity.mjs";
import { DATASET_NAMES, compareToReferences, loadReferences } from "./lib/benchmark.mjs";
import { diffSpot, parseFindings, summarizeFindings } from "./lib/estimate-diff.mjs";
import { isBlockingAuditFinding } from "../src/estimated/audit.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const RANKS = "AKQJT98765432";
const NON_ACTION = /_(bb|pct|combos)$/;
const LETTER = { open: "O", limp: "L", call: "C", check: "X", fold: ".", three_bet: "3", four_bet: "4", all_in: "A", squeeze: "S", raise: "R" };

const loadDir = dir => DATASET_NAMES.flatMap(name => { try { return JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")).spots; } catch { return []; } });
const published = () => loadDir(join(root, "src/estimated"));
const actionsOf = spot => Object.keys(spot.hands[0]).filter(k => k !== "hand" && typeof spot.hands[0][k] === "number" && !NON_ACTION.test(k));
const handAt = (r, c) => r === c ? RANKS[r] + RANKS[c] : r < c ? RANKS[r] + RANKS[c] + "s" : RANKS[c] + RANKS[r] + "o";
const find = (spots, id) => spots.find(s => s.id === id) ?? fail(`unknown spot ${id}`);
function fail(msg) { console.error(msg); process.exit(2); }

// Unweighted by reach: the spot's own strategy over all 1326 combos it lists.
export function mix(spot) {
  const acts = actionsOf(spot), totals = Object.fromEntries(acts.map(a => [a, 0]));
  let w = 0;
  for (const h of spot.hands) { const c = comboCount(h.hand); w += c; for (const a of acts) totals[a] += c * (h[a] ?? 0); }
  return Object.fromEntries(acts.map(a => [a, totals[a] / w]));
}
const fmtMix = m => Object.entries(m).map(([a, v]) => `${a} ${v.toFixed(1)}`).join(" / ");

function grid(spot, action) {
  const rows = new Map(spot.hands.map(h => [h.hand, h]));
  const acts = actionsOf(spot);
  const cell = h => {
    if (!h) return "  -";
    if (action) return String(Math.round(h[action] ?? 0)).padStart(3);
    const [top, v] = acts.map(a => [a, h[a] ?? 0]).sort((x, y) => y[1] - x[1])[0];
    return ` ${LETTER[top] ?? top[0]}${v >= 99.5 ? " " : Math.min(9, Math.floor(v / 10))}`;
  };
  const lines = [` ${[...RANKS].map(r => r.padStart(3)).join("")}`];
  for (let r = 0; r < 13; r++) lines.push(`${RANKS[r]} ${[...Array(13)].map((_, c) => cell(rows.get(handAt(r, c)))).join("")}`);
  lines.push(action ? `cells: ${action} %` : `cells: dominant action (${acts.map(a => `${LETTER[a] ?? a[0]}=${a}`).join(" ")}); digit = its share in tens when mixed; row=first rank, suited above diagonal`);
  return lines.join("\n");
}

function check(ids) {
  const run = spawnSync("node", [join(root, "scripts/build-estimates.mjs")], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, ESTIMATES_DRY_RUN: "1" } });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const staging = out.match(/staging: (\S+)/)?.[1];
  const findings = parseFindings(out);
  if (run.status !== 0) writeFileSync(join(root, ".local/range-check-failure.log"), out);
  if (!staging) { console.log(out.split("\n").slice(-25).join("\n")); process.exit(1); }
  const before = published(), after = loadDir(staging);
  const beforeBy = new Map(before.map(s => [s.id, s]));
  const changed = after.map(s => [s, beforeBy.get(s.id)]).filter(([s, b]) => !b || diffSpot(b, s).changedHands);
  const focus = ids.length ? after.filter(s => ids.includes(s.id)) : changed.map(([s]) => s);
  const lines = [`build: ${run.status === 0 ? "pass" : "BLOCKED"} · changed spots ${changed.length}${ids.length ? ` · focus ${focus.length}` : ""}`];
  for (const s of focus.slice(0, 15)) {
    const b = beforeBy.get(s.id);
    if (!b) { lines.push(`+ ${s.id}: ${fmtMix(mix(s))}`); continue; }
    const d = diffSpot(b, s), mb = mix(b), ma = mix(s);
    lines.push(`${s.id}: ${d.changedHands} hands changed`);
    lines.push(`  mix ${Object.keys(ma).map(a => `${a} ${(mb[a] ?? 0).toFixed(1)}→${ma[a].toFixed(1)}`).join(" / ")}`);
    if (d.changedHands) {
      const hs = s.hands.filter(h => diffSpot({ hands: b.hands.filter(x => x.hand === h.hand) }, { hands: [h] }).changedHands).map(h => h.hand);
      lines.push(`  hands ${hs.slice(0, 20).join(" ")}${hs.length > 20 ? ` …+${hs.length - 20}` : ""}`);
    }
  }
  if (focus.length > 15) lines.push(`… ${focus.length - 15} more spots`);
  const relevant = findings.filter(f => !ids.length || ids.includes(f.spot) || isBlockingAuditFinding(f));
  const counts = summarizeFindings(findings);
  lines.push(`audit: ${counts.total} findings (${Object.entries(counts.bySeverity).map(([k, v]) => `${k} ${v}`).join(", ") || "none"})`);
  for (const f of relevant.slice(0, 15)) lines.push(`  [${f.severity}] ${f.check} · ${f.spot}: ${f.detail.slice(0, 160)}`);
  if (relevant.length > 15) lines.push(`  … ${relevant.length - 15} more`);
  const bench = compareToReferences(after, loadReferences(new URL(`file://${root}/`))).filter(r => r.ours !== null && (!ids.length || ids.includes(r.spot_id)));
  const off = bench.filter(r => Math.abs(r.diff) > 3);
  if (bench.length) lines.push(`benchmark ±3pt: ${off.length ? off.map(r => `${r.spot_id} ${r.action} ${r.diff > 0 ? "+" : ""}${r.diff.toFixed(1)}`).join(", ") : "all within"}`);
  if (run.status !== 0 && !findings.some(isBlockingAuditFinding)) lines.push(...out.split("\n").filter(Boolean).slice(-15));
  console.log(lines.join("\n"));
  if (process.env.RANGE_KEEP_STAGING === "1") console.log(`staging: ${staging}`);
  else rmSync(staging, { recursive: true, force: true });
  process.exitCode = run.status === 0 ? 0 : 1;
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "list") for (const s of published().filter(s => !args[0] || s.id.includes(args[0]))) console.log(`${s.id}: ${fmtMix(mix(s))}`);
else if (cmd === "view") { const s = find(published(), args[0]); console.log(`${s.id} · ${fmtMix(mix(s))}\n${grid(s, args[1])}`); }
else if (cmd === "check") check(args);
else fail("usage: range list [filter] | view <spot> [action] | check [spot ...]");
