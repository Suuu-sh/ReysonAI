// Stage 2 only: copy immutable legacy prerequisites, generate/audit, then optionally
// install a LOCAL review candidate. Never regenerate or rewrite legacy data.
// CI consumes reviewed, committed artifacts and must never invoke this authoring command.
// Usage: node scripts/build-continuations.mjs [--install]
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { continuationSpots } from "../src/estimated/continuation-tree.ts";
import { validateContinuationDataset } from "../src/estimated/continuation-responses.ts";
import { auditContinuationEstimates } from "../src/estimated/continuation-audit.ts";
import { checkRangeBalance, checkCrossStrengthInversion, isBlockingAuditFinding } from "../src/estimated/audit.ts";
import { generateContinuationFacts, composeContinuationReasons } from "./lib/continuation-reasons.mjs";
const root = fileURLToPath(new URL("..", import.meta.url)), published = join(root, "src/estimated");
mkdirSync(join(root, ".local"), { recursive: true });
const staging = mkdtempSync(join(root, ".local/continuations-build-"));
const names = ["opening-ranges", "preflop-ranges", "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses"];
for (const name of names) copyFileSync(join(published, `${name}.json`), join(staging, `${name}.json`));
console.log(`Stage 2 staging: ${staging}`);
execFileSync(process.execPath, ["--max-old-space-size=512", "scripts/generate-continuation-responses.mjs"], {
  cwd: root, stdio: "inherit", env: { ...process.env, ESTIMATES_DIR: staging },
});
const load = name => JSON.parse(readFileSync(join(staging, `${name}.json`), "utf8"));
const datasets = Object.fromEntries(names.map(name => [name, load(name)]));
const data = load("continuation-responses"), equities = load("continuation-call-equities");
validateContinuationDataset(data, datasets);
const audit = auditContinuationEstimates(data, datasets, equities, { checkRangeBalance, checkCrossStrengthInversion });
if (audit.findings.some(isBlockingAuditFinding)) throw new Error("Continuation audit blocked installation");
const options = { data, datasets, equities, outDir: join(staging, "reason-facts"), factDir: join(staging, "reason-facts"), reasonDir: join(staging, "reasons") };
generateContinuationFacts(options); composeContinuationReasons(options);
if (process.argv.includes("--install")) {
  for (const name of ["continuation-responses", "continuation-call-equities", "continuation-audit-report"]) copyFileSync(join(staging, `${name}.json`), join(published, `${name}.json`));
  // Previous dense/partial generations must not leave obsolete impossible files.
  for (const node of continuationSpots) {
    const file = join(published, "reasons", `${node.id}.json`);
    if (existsSync(file)) rmSync(file);
  }
  cpSync(join(staging, "reasons"), join(published, "reasons"), { recursive: true });
  console.log("Installed local Stage 2 review candidate; independent review is required before commit/publication.");
}
console.log(`${data.spot_count} saved histories; ${data.omitted_unreachable_count} proved impossible histories omitted. Staging retained: ${staging}`);
