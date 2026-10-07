// Stage 3-only LOCAL authoring. All existing source data stays byte-identical.
// CI restores reviewed archives and must never invoke this command.
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateStage3Dataset } from "../src/estimated/stage3-responses.ts";
import { auditStage3Estimates } from "../src/estimated/stage3-audit.ts";
import { checkRangeBalance, checkCrossStrengthInversion, isBlockingAuditFinding } from "../src/estimated/audit.ts";
import { composeStage3Reasons, generateStage3Facts } from "./lib/stage3-reasons.mjs";
import { STAGE3_DATASETS } from "./lib/stage3-artifacts.mjs";
import { assertStage3Publication, STAGE3_PREREQUISITES } from "./lib/stage3-publication.mjs";

const frontend = fileURLToPath(new URL("..", import.meta.url));
export function buildStage3({ install = false, dryRun = false } = {}) {
  if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") throw new Error("Stage 3 authoring is local-only; CI must restore and verify independently reviewed bytes");
  const allowPartial = Boolean(process.env.STAGE3_FAMILIES || process.env.STAGE3_ROOTS);
  if (allowPartial && install && !dryRun) throw new Error("Partial-family/root Stage 3 authoring must stay in staging and cannot replace the full snapshot");
  const published = join(frontend, "src/estimated");
  mkdirSync(join(frontend, ".local"), { recursive: true });
  const staging = mkdtempSync(join(frontend, ".local/stage3-build-"));
  for (const name of STAGE3_PREREQUISITES) copyFileSync(join(published, `${name}.json`), join(staging, `${name}.json`));
  console.log(`Stage 3 staging: ${staging}`);
  execFileSync(process.execPath, ["--max-old-space-size=512", "scripts/generate-stage3-responses.mjs"], {
    cwd: frontend, stdio: "inherit", env: { ...process.env, ESTIMATES_DIR: staging },
  });
  const load = name => JSON.parse(readFileSync(join(staging, `${name}.json`), "utf8"));
  const datasets = Object.fromEntries(STAGE3_PREREQUISITES.map(name => [name, load(name)]));
  const data = load("stage3-responses"), equities = load("stage3-call-equities");
  validateStage3Dataset(data, datasets, { allowPartial });
  const audit = auditStage3Estimates(data, datasets, equities, { checkRangeBalance, checkCrossStrengthInversion, allowPartial });
  for (const finding of audit.findings) console.error(`- [${finding.severity}] ${finding.check} · ${finding.spot}: ${finding.detail}`);
  if (audit.findings.some(isBlockingAuditFinding)) throw new Error("Stage 3 audit blocked installation; all previously saved data remains unchanged");
  const options = { data, datasets, equities, outDir: join(staging, "reason-facts"), factDir: join(staging, "reason-facts"), reasonDir: join(staging, "reasons") };
  generateStage3Facts(options); composeStage3Reasons(options);
  if (readdirSync(options.reasonDir).some(name => !/^s3_[A-Za-z0-9_]+\.json$/.test(name))) throw new Error("Stage 3 authoring produced a reason outside its isolated namespace");
  if (!allowPartial) assertStage3Publication(staging);
  if (install && !dryRun) {
    // Predecessor files were copied solely as read-only inputs. Install only the
    // four Stage 3 artifacts and their isolated s3_ compact reason namespace.
    for (const name of STAGE3_DATASETS) copyFileSync(join(staging, `${name}.json`), join(published, `${name}.json`));
    const reasons = join(published, "reasons");
    mkdirSync(reasons, { recursive: true });
    for (const name of readdirSync(reasons).filter(name => /^s3_.*\.json$/.test(name))) rmSync(join(reasons, name));
    cpSync(join(staging, "reasons"), reasons, { recursive: true });
    console.log("Installed local Stage 3 review candidate; independent review is required before publication. Existing estimates/reasons unchanged.");
  }
  console.log(`${data.spot_count} saved Stage 3 histories; staging retained: ${staging}`);
  return { staging, data, audit, installed: install && !dryRun };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) buildStage3({ install: process.argv.includes("--install"), dryRun: process.env.ESTIMATES_DRY_RUN === "1" });
