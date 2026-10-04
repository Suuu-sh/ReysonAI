// Regenerates the authored estimate JSON in a staging dir and publishes it only if the audit passes.
// Usage: npm run build:estimates   (ESTIMATES_DRY_RUN=1: audit only, keep staging, publish nothing)
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { continuationSpots } from "../src/estimated/continuation-tree.ts";
import { isBlockingAuditFinding } from "../src/estimated/audit-policy.ts";


const root = fileURLToPath(new URL("..", import.meta.url));
const published = join(root, "src/estimated");
const files = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "multiway-responses", "squeeze-responses", "limp-responses", "limp-deep-responses", "cold-three-bet-responses", "multiway2-responses", "cold-four-bet-responses", "continuation-responses"];
// Order matters: each generator reads the previous stages from the staging dir.
const generators = [
  ["python3", "generate-opening-ranges.py"],
  ["python3", "generate-response-ranges.py"],
  ["python3", "generate-three-bet-responses.py"],
  ["python3", "generate-four-bet-responses.py"],
  ["node", "generate-five-bet-responses.mjs"],
  ["python3", "generate-multiway-responses.py"],
  ["python3", "generate-squeeze-responses.py"],
  ["python3", "generate-multiway2-responses.py"],
  ["python3", "generate-limp-responses.py"],
  ["node", "generate-limp-deep-responses.mjs"],
  ["python3", "generate-cold-three-bet-responses.py"],
  ["python3", "generate-cold-four-bet-responses.py"],
  ["node", "generate-continuation-responses.mjs"],
];
// Keep even transient generated data in this worktree.
mkdirSync(join(root, ".local"), { recursive: true });
const equityCache = join(root, ".local/call-equities-cache.json");
const staging = mkdtempSync(join(root, ".local/estimates-build-"));
const dryRun = process.env.ESTIMATES_DRY_RUN === "1";

try {
  for (const name of [...files, "call-equities"]) if (existsSync(join(published, `${name}.json`))) copyFileSync(join(published, `${name}.json`), join(staging, `${name}.json`));
  // Optional speed cache. Every entry is checked against exact current ranges,
  // geometry, sample count and seed; an empty .local rebuild computes it afresh.
  if (existsSync(equityCache)) copyFileSync(equityCache, join(staging, "call-equities.json"));
  for (const [runtime, script] of generators) {
    const args = [...(runtime === "node" ? ["--max-old-space-size=192", "--max-semi-space-size=1"] : []), join(root, "scripts", script)];
    execFileSync(runtime, args, { cwd: root, stdio: "inherit", env: { ...process.env, ESTIMATES_DIR: staging, CALL_EQUITIES_CACHE: equityCache } });
  }
  const { findings } = JSON.parse(execFileSync("node", ["--max-old-space-size=384", "--max-semi-space-size=1", join(root, "scripts/validate-estimates.mjs"), staging], {
    cwd: root, encoding: "utf8", maxBuffer: 8 << 20, env: process.env,
  }));
  for (const f of findings) console.error(`- [${f.severity}] ${f.check} · ${f.spot}: ${f.detail}`);
  const blocking = findings.filter(isBlockingAuditFinding);
  if (blocking.length) {
    console.error(`\n検証で${blocking.length}件の違反。src/estimated は変更していません。`);
    process.exitCode = 1;
  } else if (dryRun) {
    console.log(`dry run: 検証通過（助言警告 ${findings.length}件）。公開していません。staging: ${staging}`);
  } else {
    // Compose against the audited staged strategy, never old .local facts.
    for (const script of ["reason-facts.mjs", "compose-reasons.mjs"]) {
      execFileSync("node", ["--max-old-space-size=384", "--max-semi-space-size=1", join(root, "scripts", script)], { cwd: root, stdio: "inherit",
        env: { ...process.env, ESTIMATES_DIR: staging, REASON_FACTS_DIR: join(staging, "reason-facts") } });
    }
    cpSync(join(staging, "reason-facts"), join(root, ".local/reason-facts"), { recursive: true });
    for (const node of continuationSpots) {
      const obsolete = join(published, "reasons", `${node.id}.json`);
      if (existsSync(obsolete)) rmSync(obsolete);
    }
    cpSync(join(staging, "reasons"), join(published, "reasons"), { recursive: true });
    for (const name of [...files, "call-equities", "call-ev-report", "continuation-call-equities", "continuation-audit-report"]) copyFileSync(join(staging, `${name}.json`), join(published, `${name}.json`));
    console.log(`検証を通過したため src/estimated に保存しました。（助言警告 ${findings.length}件、公開を妨げません）`);
  }
} catch (error) {
  process.exitCode = 1;
  throw error;
} finally {
  if (dryRun) console.log(`staging: ${staging}`);
  else if (!process.exitCode) rmSync(staging, { recursive: true, force: true });
  else console.error(`診断用ステージ: ${staging}`);
}
