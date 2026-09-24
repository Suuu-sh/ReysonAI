// Regenerates the authored estimate JSON in a staging dir and publishes it only if the audit passes.
// Usage: npm run build:estimates
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditEstimates, isBlockingAuditFinding } from "../src/estimated/audit.js";
import { validateDataset } from "../src/estimated/ranges.js";
import { validateOpeningDataset } from "../src/estimated/opening-ranges.js";
import { validateThreeBetDataset } from "../src/estimated/three-bet-responses.js";
import { validateFourBetDataset } from "../src/estimated/four-bet-responses.js";
import { validateFiveBetDataset } from "../src/estimated/five-bet-dataset.js";
import { validateMultiwayDataset } from "../src/estimated/multiway-responses.js";
import { validateLimpResponses } from "../src/estimated/limp-responses.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const published = join(root, "src/estimated");
const files = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "multiway-responses", "limp-responses"];
// Order matters: each generator reads the previous stages from the staging dir.
const generators = [
  ["python3", "generate-opening-ranges.py"],
  ["python3", "generate-response-ranges.py"],
  ["python3", "generate-three-bet-responses.py"],
  ["python3", "generate-four-bet-responses.py"],
  ["node", "generate-five-bet-responses.mjs"],
  ["python3", "generate-multiway-responses.py"],
  ["python3", "generate-limp-responses.py"],
];
// Keep even transient generated data in this worktree.
mkdirSync(join(root, ".local"), { recursive: true });
const staging = mkdtempSync(join(root, ".local/estimates-build-"));

try {
  for (const name of files) if (existsSync(join(published, `${name}.json`))) copyFileSync(join(published, `${name}.json`), join(staging, `${name}.json`));
  for (const [runtime, script] of generators) {
    execFileSync(runtime, [join(root, "scripts", script)], { cwd: root, stdio: "inherit", env: { ...process.env, ESTIMATES_DIR: staging } });
  }
  const load = name => JSON.parse(readFileSync(join(staging, `${name}.json`), "utf8"));
  const opening = load("opening-ranges");
  const responses = load("preflop-ranges");
  const threeBets = load("three-bet-responses");
  const fourBets = load("four-bet-responses");
  const fiveBets = load("five-bet-responses");
  const multiway = load("multiway-responses");
  const limp = load("limp-responses");
  validateOpeningDataset(opening);
  validateDataset(responses);
  validateThreeBetDataset(threeBets, responses, opening);
  validateFourBetDataset(fourBets, responses, threeBets, opening);
  validateFiveBetDataset(fiveBets);
  validateMultiwayDataset(multiway);
  validateLimpResponses(limp, opening);
  const { findings } = auditEstimates({ opening, responses, threeBets, fourBets, fiveBets, multiway, limp });
  for (const f of findings) console.error(`- [${f.severity}] ${f.check} · ${f.spot}: ${f.detail}`);
  const blocking = findings.filter(isBlockingAuditFinding);
  if (blocking.length) {
    console.error(`\n検証で${blocking.length}件の違反。src/estimated は変更していません。`);
    process.exitCode = 1;
  } else {
    for (const name of files) copyFileSync(join(staging, `${name}.json`), join(published, `${name}.json`));
    console.log(`検証を通過したため src/estimated に保存しました。（バランス警告 ${findings.length}件、公開を妨げません）`);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
