// Lossless migration of already audited dense artifacts; no strategy/equity regeneration.
// Writes to a separate directory and validates every omitted impossible history.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { compactContinuationDataset } from "../src/estimated/continuation-responses.ts";
import { auditContinuationEstimates } from "../src/estimated/continuation-audit.ts";
import { checkRangeBalance, checkCrossStrengthInversion, isBlockingAuditFinding } from "../src/estimated/audit.ts";
import { generateContinuationFacts, composeContinuationReasons } from "./lib/continuation-reasons.mjs";
const [input, output] = process.argv.slice(2).map(value => resolve(value));
if (!input || !output || input === output) throw new Error("Usage: node scripts/compact-continuations.mjs INPUT OUTPUT (separate directories)");
const load = name => JSON.parse(readFileSync(join(input, `${name}.json`), "utf8"));
const datasets = Object.fromEntries(["opening-ranges", "preflop-ranges", "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses"].map(name => [name, load(name)]));
const data = compactContinuationDataset(load("continuation-responses"), datasets);
const equities = load("continuation-call-equities");
const wanted = new Set(data.spots.map(spot => spot.id));
equities.spots = Object.fromEntries(Object.entries(equities.spots).filter(([id]) => wanted.has(id)));
const audit = auditContinuationEstimates(data, datasets, equities, { checkRangeBalance, checkCrossStrengthInversion });
if (audit.findings.some(isBlockingAuditFinding)) throw new Error(JSON.stringify(audit.findings.filter(isBlockingAuditFinding)));
mkdirSync(output, { recursive: true });
for (const [name, document] of Object.entries({ "continuation-responses": data, "continuation-call-equities": equities, "continuation-audit-report": audit })) {
  writeFileSync(join(output, `${name}.json`), JSON.stringify(document) + "\n");
}
const options = { data, datasets, equities, outDir: join(output, "reason-facts"), factDir: join(output, "reason-facts"), reasonDir: join(output, "reasons") };
generateContinuationFacts(options); composeContinuationReasons(options);
console.log(`${data.spot_count} saved histories; ${data.omitted_unreachable_count} proved impossible histories omitted; ${audit.findings.filter(isBlockingAuditFinding).length} blocking findings`);
