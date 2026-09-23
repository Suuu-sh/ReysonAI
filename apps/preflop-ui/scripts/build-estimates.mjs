// Regenerates the authored estimate JSON in a staging dir and publishes it only if the audit passes.
// Usage: npm run build:estimates
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditEstimates } from "../src/estimated/audit.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const published = join(root, "src/estimated");
const files = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses"];
// Order matters: each generator reads the previous stages from the staging dir.
const generators = [
  ["python3", "generate-opening-ranges.py"],
  ["python3", "generate-three-bet-responses.py"],
  ["python3", "generate-four-bet-responses.py"],
  ["node", "generate-five-bet-responses.mjs"],
];
const staging = mkdtempSync(join(tmpdir(), "solveaai-estimates-"));

try {
  for (const name of files) if (existsSync(join(published, `${name}.json`))) copyFileSync(join(published, `${name}.json`), join(staging, `${name}.json`));
  for (const [runtime, script] of generators) {
    execFileSync(runtime, [join(root, "scripts", script)], { cwd: root, stdio: "inherit", env: { ...process.env, ESTIMATES_DIR: staging } });
  }
  const load = name => JSON.parse(readFileSync(join(staging, `${name}.json`), "utf8"));
  const { findings } = auditEstimates({ opening: load("opening-ranges"), responses: load("preflop-ranges"), threeBets: load("three-bet-responses"), fourBets: load("four-bet-responses"), fiveBets: load("five-bet-responses") });
  if (findings.length) {
    for (const f of findings) console.error(`- [${f.severity}] ${f.check} · ${f.spot}: ${f.detail}`);
    console.error(`\n検証で${findings.length}件の違反。src/estimated は変更していません。`);
    process.exitCode = 1;
  } else {
    for (const name of files) copyFileSync(join(staging, `${name}.json`), join(published, `${name}.json`));
    console.log("検証を通過したため src/estimated に保存しました。");
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
