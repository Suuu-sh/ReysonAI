// Unattended regenerate → audit → publish loop with a short summary for review.
// Usage: npm run pipeline [-- --max-iterations N]
// Runs build-estimates until published data stops changing (fixed point) or the audit blocks.
// Full logs and per-spot diffs go to .local/pipeline/<timestamp>/; stdout stays ~30 lines.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isBlockingAuditFinding } from "../src/estimated/profile-audit-policy.ts";
import { diffDatasets, isUnchanged, parseFindings, summarizeFindings } from "./lib/estimate-diff.ts";

import { opponentProfileFiles } from "./lib/opponent-profile-build.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const stage3Only = process.argv.includes("--stage3-only");
const files = stage3Only ? ["stage3-responses"] : ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "multiway-responses", "squeeze-responses", "limp-responses", "limp-deep-responses", "cold-three-bet-responses", "multiway2-responses", "cold-four-bet-responses", "continuation-responses", ...opponentProfileFiles];
const arg = process.argv.indexOf("--max-iterations");
const maxIterations = arg > 0 ? Number(process.argv[arg + 1]) : 3;
if (!Number.isInteger(maxIterations) || maxIterations < 1) throw new Error("--max-iterations must be a positive integer");

// A dataset added in this run has no published file yet; treat it as empty.
const snapshot = () : any => Object.fromEntries(files.map((name: any) : any => {
  const path = join(root, "src/estimated", `${name}.json`);
  return [name, existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { spots: ([] as any[]) }];
}));
const diffAll = (a?: any, b?: any) : any => Object.fromEntries(files.map((name: any) : any => [name, diffDatasets(a[name], b[name])]));
const changed = (diffs: any) : any => Object.values<any>(diffs).some((d: any) : any => !isUnchanged(d));

const outDir = join(root, ".local/pipeline", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(outDir, { recursive: true });
const initial = snapshot();
let current = initial, status = "changed", findings: any[] = [], iterations = 0, log = "";

for (let i = 1; i <= maxIterations; i++) {
  iterations = i;
  const run = spawnSync("node", [join(root, "scripts/build-estimates.ts"), ...(stage3Only ? ["--stage3-only"] : ([] as any[]))], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  log += `\n===== iteration ${i} (exit ${run.status}) =====\n${output}`;
  findings = parseFindings(output);
  if (run.status !== 0) { status = "blocked"; break; }
  const next = snapshot();
  const step = changed(diffAll(current, next));
  current = next;
  if (!step) { status = "converged"; break; }
}

const diffs = diffAll(initial, current);
const spots = Object.entries<any>(diffs).flatMap(([file, d]: any) : any => d.spots.map((s: any) : any => ({ file, ...s }))).sort((a?: any, b?: any) : any => b.changedHands - a.changedHands);
const structural = Object.entries<any>(diffs).flatMap(([file, d]: any) : any => [...d.added.map((id: any) : any => `+ ${file}/${id}`), ...d.removed.map((id: any) : any => `- ${file}/${id}`)]);
const counts = summarizeFindings(findings);
const blocking = findings.filter(isBlockingAuditFinding);
const summary = { status, iterations, maxIterations, changedSpots: spots.length, spots, structural, findings: counts, blocking, outDir };

const fmt = (n: any) : any => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
const lines = [
  `status: ${status} (iterations ${iterations}/${maxIterations})`,
  `changed spots: ${spots.length}${structural.length ? `, structural: ${structural.length} additions/removals` : ""}`,
  ...spots.slice(0, 10).map((s: any) : any => `  ${s.id}: ${s.changedHands} hands, max ${s.max.hand} ${s.max.action} ${fmt(s.max.delta)}pt`),
  ...(spots.length > 10 ? [`  … ${spots.length - 10} more`] : ([] as any[])),
  `findings: ${counts.total} (${Object.entries<any>(counts.bySeverity).map(([k, v]: any) : any => `${k} ${v}`).join(", ") || "none"})`,
  ...Object.entries<any>(counts.byCheck).sort((a?: any, b?: any) : any => b[1] - a[1]).slice(0, 8).map(([k, v]: any) : any => `  ${k}: ${v}`),
  ...blocking.slice(0, 5).map((f: any) : any => `  ! ${f.check} · ${f.spot}: ${f.detail}`),
  `details: ${outDir}`,
];
writeFileSync(join(outDir, "build.log"), log);
writeFileSync(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(join(outDir, "summary.md"), `# Estimates pipeline\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n\n## All changed spots\n\n| file | spot | hands | max |\n|---|---|---:|---|\n${spots.map((s: any) : any => `| ${s.file} | ${s.id} | ${s.changedHands} | ${s.max.hand} ${s.max.action} ${fmt(s.max.delta)} |`).join("\n")}\n`);
console.log(lines.join("\n"));
if (status === "blocked") process.exitCode = 1;
