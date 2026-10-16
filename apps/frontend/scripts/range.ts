// Token-lean range authoring CLI: read spots and verify edits without opening the large JSON.
// Usage:
//   npm run range -- list [filter]            spot ids with combo-weighted action mix
//   npm run range -- view <spot> [action]      13×13 grid (dominant action, or one action's %) + mix
//   npm run range -- check [spot ...]          dry-run build: mix before→after, changed hands, audit, benchmark
// check never publishes; run `npm run pipeline` (or build:estimates) once it is clean.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { comboCount } from "./lib/equity.ts";
import { DATASET_NAMES as LEGACY_DATASET_NAMES, compareToReferences, loadReferences } from "./lib/benchmark.ts";
import { diffSpot, parseFindings, summarizeFindings } from "./lib/estimate-diff.ts";
import { isBlockingAuditFinding } from "../src/estimated/audit-policy.ts";
import { createContinuationModel, continuationMix } from "../src/estimated/continuation-model.ts";
import { createStage3Model, stage3Mix } from "../src/estimated/stage3-model.ts";
const DATASET_NAMES = [...LEGACY_DATASET_NAMES, "continuation-responses", "stage3-responses"];

const root = fileURLToPath(new URL("..", import.meta.url));
const RANKS = "AKQJT98765432";
const NON_ACTION = /_(bb|pct|combos)$/;
const LETTER: any = { open: "O", limp: "L", call: "C", check: "X", fold: ".", three_bet: "3", four_bet: "4", all_in: "A", squeeze: "S", raise: "R" };

const directoryData = new Map(), continuationModels = new Map(), stage3Models = new Map();
const loadDir = (dir: any) : any => {
  if (!directoryData.has(dir)) directoryData.set(dir, Object.fromEntries(DATASET_NAMES.flatMap((name: any) : any => {
    try { return [[name, JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"))]]; } catch (error: any) { if (error.code === "ENOENT") return ([] as any[]); throw error; }
  })));
  return Object.values<any>(directoryData.get(dir)).flatMap((data: any) : any => data.spots);
};
export function displayedMix(spot?: any, dir: any = join(root, "src/estimated")) : any {
  if (spot.dataset === "stage3-responses") {
    loadDir(dir);
    if (!stage3Models.has(dir)) stage3Models.set(dir, createStage3Model(directoryData.get(dir)));
    const context = stage3Models.get(dir).context(spot, spot), weighted: any = stage3Mix(spot, context);
    return Object.fromEntries(spot.legal_actions.map((action: any) : any => [action, weighted[action]]));
  }
  if (spot.dataset !== "continuation-responses") return mix(spot);
  loadDir(dir);
  if (!continuationModels.has(dir)) continuationModels.set(dir, createContinuationModel(directoryData.get(dir)));
  const context = continuationModels.get(dir).context(spot, spot), weighted: any = continuationMix(spot, context);
  return Object.fromEntries(spot.legal_actions.map((action: any) : any => [action, weighted[action]]));
}
const published = () : any => loadDir(join(root, "src/estimated"));
const actionsOf = (spot: any) : any => Object.keys(spot.hands[0]).filter((k: any) : any => k !== "hand" && typeof spot.hands[0][k] === "number" && !NON_ACTION.test(k));
const handAt = (r?: any, c?: any) : any => r === c ? RANKS[r] + RANKS[c] : r < c ? RANKS[r] + RANKS[c] + "s" : RANKS[c] + RANKS[r] + "o";
function fail(msg?: any) : any { console.error(msg); process.exit(2); }

// Unweighted by reach: the spot's own strategy over all 1326 combos it lists.
export function mix(spot?: any) : any {
  const acts = actionsOf(spot), totals = Object.fromEntries(acts.map((a: any) : any => [a, 0]));
  let w = 0;
  for (const h of spot.hands) { const c = comboCount(h.hand); w += c; for (const a of acts) totals[a] += c * (h[a] ?? 0); }
  return Object.fromEntries(acts.map((a: any) : any => [a, totals[a] / w]));
}
const fmtMix = (m: any) : any => Object.entries<any>(m).map(([a, v]: any) : any => `${a} ${v === null ? "unreachable" : v.toFixed(1)}`).join(" / ");

function grid(spot?: any, action?: any) : any {
  const rows = new Map(spot.hands.map((h: any) : any => [h.hand, h]));
  const acts = actionsOf(spot);
  const cell = (h: any) : any => {
    if (!h) return "  -";
    if (action) return String(Math.round(h[action] ?? 0)).padStart(3);
    const [top, v] = acts.map((a: any) : any => [a, h[a] ?? 0]).sort((x?: any, y?: any) : any => y[1] - x[1])[0];
    return ` ${LETTER[top] ?? top[0]}${v >= 99.5 ? " " : Math.min(9, Math.floor(v / 10))}`;
  };
  const lines = [` ${[...RANKS].map((r: any) : any => r.padStart(3)).join("")}`];
  for (let r = 0; r < 13; r++) lines.push(`${RANKS[r]} ${[...Array(13)].map((_?: any, c?: any) : any => cell(rows.get(handAt(r, c)))).join("")}`);
  lines.push(action ? `cells: ${action} %` : `cells: dominant action (${acts.map((a: any) : any => `${LETTER[a] ?? a[0]}=${a}`).join(" ")}); digit = its share in tens when mixed; row=first rank, suited above diagonal`);
  return lines.join("\n");
}

export function rangeCheckPlan(ids?: any) : any {
  const stage3Only = ids.length > 0 && ids.every((id: any) : any => id.startsWith("s3_"));
  if (!stage3Only && ids.some((id: any) : any => id.startsWith("s3_"))) throw new Error("Check Stage 3 s3_ IDs separately; a mixed check must not regenerate legacy ranges.");
  return { stage3Only, buildArgs: stage3Only ? ["--stage3-only"] : ([] as any[]), compareExternalReferences: !stage3Only };
}
function check(ids?: any) : any {
  const { stage3Only, buildArgs, compareExternalReferences } = rangeCheckPlan(ids);
  const run = spawnSync("node", [join(root, "scripts/build-estimates.ts"), ...buildArgs], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, env: { ...process.env, ESTIMATES_DRY_RUN: "1" } });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const staging = out.match(/staging: (\S+)/)?.[1];
  const findings = parseFindings(out);
  if (run.status !== 0) { mkdirSync(join(root, ".local"), { recursive: true }); writeFileSync(join(root, ".local/range-check-failure.log"), out); }
  if (!staging) { console.log(out.split("\n").slice(-25).join("\n")); process.exit(1); }
  const before = published(), after = loadDir(staging);
  const beforeBy = new Map(before.map((s: any) : any => [s.id, s]));
  const changed = after.map((s: any) : any => [s, beforeBy.get(s.id)]).filter(([s, b]: any) : any => !b || diffSpot(b, s).changedHands);
  const focus = ids.length ? after.filter((s: any) : any => ids.includes(s.id)) : changed.map(([s]: any) : any => s);
  const lines = [`build: ${run.status === 0 ? "pass" : "BLOCKED"} · changed spots ${changed.length}${ids.length ? ` · focus ${focus.length}` : ""}`];
  for (const s of focus.slice(0, 15)) {
    const b: any = beforeBy.get(s.id);
    if (!b) { lines.push(`+ ${s.id}: ${fmtMix(displayedMix(s, staging))}`); continue; }
    const d = diffSpot(b, s), mb = displayedMix(b), ma = displayedMix(s, staging);
    lines.push(`${s.id}: ${d.changedHands} hands changed`);
    lines.push(`  mix ${Object.keys(ma).map((a: any) : any => `${a} ${mb[a] === null ? "unreachable" : (mb[a] ?? 0).toFixed(1)}→${ma[a] === null ? "unreachable" : ma[a].toFixed(1)}`).join(" / ")}`);
    if (d.changedHands) {
      const hs = s.hands.filter((h: any) : any => diffSpot({ hands: b.hands.filter((x: any) : any => x.hand === h.hand) }, { hands: [h] }).changedHands).map((h: any) : any => h.hand);
      lines.push(`  hands ${hs.slice(0, 20).join(" ")}${hs.length > 20 ? ` …+${hs.length - 20}` : ""}`);
    }
  }
  if (focus.length > 15) lines.push(`… ${focus.length - 15} more spots`);
  const relevant = findings.filter((f: any) : any => !ids.length || ids.includes(f.spot) || isBlockingAuditFinding(f));
  const counts = summarizeFindings(findings);
  lines.push(`audit: ${counts.total} findings (${Object.entries<any>(counts.bySeverity).map(([k, v]: any) : any => `${k} ${v}`).join(", ") || "none"})`);
  for (const f of relevant.slice(0, 15)) lines.push(`  [${f.severity}] ${f.check} · ${f.spot}: ${f.detail.slice(0, 160)}`);
  if (relevant.length > 15) lines.push(`  … ${relevant.length - 15} more`);
  const bench = compareExternalReferences ? compareToReferences(after, loadReferences(new URL(`file://${root}/`))).filter((r: any) : any => r.ours !== null && (!ids.length || ids.includes(r.spot_id))) : ([] as any[]);
  if (stage3Only) {
    const coverage = JSON.parse(readFileSync(join(staging, "stage3-coverage.json"), "utf8"));
    for (const id of ids.filter((id: any) : any => !after.some((spot: any) : any => spot.id === id))) {
      const entry = coverage.entries.find((entry: any) : any => entry.id === id);
      lines.push(`${id}: data unavailable · ${entry?.status ?? "not catalogued"}${entry?.reason ? ` · ${entry.reason}` : ""}`);
    }
  }
  const off = bench.filter((r: any) : any => Math.abs(r.diff) > 3);
  if (bench.length) lines.push(`benchmark ±3pt: ${off.length ? off.map((r: any) : any => `${r.spot_id} ${r.action} ${r.diff > 0 ? "+" : ""}${r.diff.toFixed(1)}`).join(", ") : "all within"}`);
  if (run.status !== 0 && !findings.some(isBlockingAuditFinding)) lines.push(...out.split("\n").filter(Boolean).slice(-15));
  console.log(lines.join("\n"));
  if (process.env.RANGE_KEEP_STAGING === "1") console.log(`staging: ${staging}`);
  else rmSync(staging, { recursive: true, force: true });
  process.exitCode = run.status === 0 ? 0 : 1;
}

export function rangeMain(argv: any = process.argv.slice(2)) : any {
const [cmd, ...args] = argv;
if (cmd === "list") for (const s of published().filter((s: any) : any => !args[0] || s.id.includes(args[0]))) console.log(`${s.id}: ${fmtMix(displayedMix(s))}`);
else if (cmd === "view") {
  const s = published().find((spot: any) : any => spot.id === args[0]);
  const coveragePath = join(root, "src/estimated/stage3-coverage.json");
  if (!s && args[0]?.startsWith("s3_") && existsSync(coveragePath)) {
    const entry = JSON.parse(readFileSync(coveragePath, "utf8")).entries.find((entry: any) : any => entry.id === args[0]);
    if (!entry) fail(`unknown spot ${args[0]}`);
    console.log(`${entry.id} · data unavailable: ${entry.status === "saved" ? "missing saved strategy" : entry.status}${entry.reason ? ` · ${entry.reason}` : ""}`);
  } else { const spot = s ?? fail(`unknown spot ${args[0]}`); console.log(`${spot.id} · ${fmtMix(displayedMix(spot))}\n${grid(spot, args[1])}`); }
}
else if (cmd === "check") check(args);
else fail("usage: range list [filter] | view <spot> [action] | check [spot ...]");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) rangeMain();
