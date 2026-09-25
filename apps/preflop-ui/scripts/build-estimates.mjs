// Regenerates the authored estimate JSON in a staging dir and publishes it only if the audit passes.
// Usage: npm run build:estimates   (ESTIMATES_DRY_RUN=1: audit only, keep staging, publish nothing)
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
import { validateSqueezeDataset } from "../src/estimated/squeeze-responses.js";
import { validateColdThreeBetDataset } from "../src/estimated/cold-three-bet-responses.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const published = join(root, "src/estimated");
const files = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "multiway-responses", "squeeze-responses", "limp-responses", "cold-three-bet-responses"];
// Order matters: each generator reads the previous stages from the staging dir.
const generators = [
  ["python3", "generate-opening-ranges.py"],
  ["python3", "generate-response-ranges.py"],
  ["python3", "generate-three-bet-responses.py"],
  ["python3", "generate-four-bet-responses.py"],
  ["node", "generate-five-bet-responses.mjs"],
  ["python3", "generate-multiway-responses.py"],
  ["python3", "generate-squeeze-responses.py"],
  ["python3", "generate-limp-responses.py"],
  ["python3", "generate-cold-three-bet-responses.py"],
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
    execFileSync(runtime, [join(root, "scripts", script)], { cwd: root, stdio: "inherit", env: { ...process.env, ESTIMATES_DIR: staging, CALL_EQUITIES_CACHE: equityCache } });
  }
  const load = name => JSON.parse(readFileSync(join(staging, `${name}.json`), "utf8"));
  const opening = load("opening-ranges");
  const responses = load("preflop-ranges");
  const threeBets = load("three-bet-responses");
  const fourBets = load("four-bet-responses");
  const fiveBets = load("five-bet-responses");
  const multiway = load("multiway-responses");
  const squeezes = load("squeeze-responses");
  const limp = load("limp-responses");
  const coldThreeBets = load("cold-three-bet-responses");
  validateOpeningDataset(opening);
  validateDataset(responses);
  validateThreeBetDataset(threeBets, responses, opening);
  validateFourBetDataset(fourBets, responses, threeBets, opening);
  validateFiveBetDataset(fiveBets);
  validateMultiwayDataset(multiway);
  validateSqueezeDataset(squeezes, multiway, responses, opening);
  validateLimpResponses(limp, opening);
  validateColdThreeBetDataset(coldThreeBets, responses);
  const { findings } = auditEstimates({ opening, responses, threeBets, fourBets, fiveBets, multiway, squeezes, limp, coldThreeBets, callEquities: load("call-equities") });
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
      execFileSync("node", [join(root, "scripts", script)], { cwd: root, stdio: "inherit",
        env: { ...process.env, ESTIMATES_DIR: staging, REASON_FACTS_DIR: join(staging, "reason-facts") } });
    }
    cpSync(join(staging, "reason-facts"), join(root, ".local/reason-facts"), { recursive: true });
    cpSync(join(staging, "reasons"), join(published, "reasons"), { recursive: true });
    for (const name of [...files, "call-equities", "call-ev-report"]) copyFileSync(join(staging, `${name}.json`), join(published, `${name}.json`));
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
