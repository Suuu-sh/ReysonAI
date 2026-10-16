// Guard the full-snapshot D1 publisher against deleting Stage 2 from a clean checkout.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { validateContinuationDataset } from "../../src/estimated/continuation-responses.ts";
import { auditContinuationEstimates } from "../../src/estimated/continuation-audit.ts";
import { checkRangeBalance, checkCrossStrengthInversion, isBlockingAuditFinding } from "../../src/estimated/audit.ts";
import { continuationReasonFingerprint } from "./continuation-reasons.ts";
import { expandContinuationReasons } from "../../src/estimated/continuation-reason-format.ts";
const names = ["continuation-responses", "continuation-call-equities", "continuation-audit-report"];
export function assertContinuationPublication(directory?: any, { allowLegacyOnly = false }: any = {}) : any {
  const present = names.filter((name: any) : any => existsSync(join(directory, `${name}.json`)));
  const reasonDir = join(directory, "reasons");
  const reasonFiles = existsSync(reasonDir) ? readdirSync(reasonDir).filter((name: any) : any => /^(sq_|sq2_|cc_|c4_).*\.json$/.test(name)) : ([] as any[]);
  if (!present.length && !reasonFiles.length) {
    if (allowLegacyOnly) return { status: "legacy-only" };
    throw new Error("Stage 2 artifacts are absent. Generate them with node scripts/build-continuations.ts --install before a full preflop snapshot. Use --allow-legacy-only only to explicitly remove/omit deployed Stage 2 data.");
  }
  if (present.length !== names.length) throw new Error("Partial Stage 2 publication artifacts; rebuild the complete generation");
  const load = (name: any) : any => JSON.parse(readFileSync(join(directory, `${name}.json`), "utf8"));
  const datasets = Object.fromEntries(["opening-ranges", "preflop-ranges", "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses"].map((name: any) : any => [name, load(name)]));
  const data = load(names[0]), equities = load(names[1]);
  validateContinuationDataset(data, (datasets as any));
  const actual = auditContinuationEstimates(data, (datasets as any), equities, { checkRangeBalance, checkCrossStrengthInversion });
  if (actual.findings.some(isBlockingAuditFinding) || !isDeepStrictEqual(actual, load(names[2]))) throw new Error("Stage 2 publication audit is failing or stale");
  const expected = new Set(data.spots.map((spot: any) : any => `${spot.id}.json`));
  if (reasonFiles.length !== expected.size || reasonFiles.some((name: any) : any => !expected.has(name))) throw new Error("Stage 2 publication reasons are incomplete or contain obsolete impossible histories");
  const fingerprint = continuationReasonFingerprint({ data, datasets, equities });
  for (const spot of data.spots) {
    const saved = load(`reasons/${spot.id}`);
    if (saved.spot_id !== spot.id || saved.type !== "continuation" || saved.schema_version !== "continuation-reasons-v1" || saved.source_fingerprint !== fingerprint) throw new Error(`Stale Stage 2 publication reason ${spot.id}`);
    expandContinuationReasons(saved); // Reject malformed compact rows before delivery.
  }
  return { status: "complete", spots: data.spot_count, catalog: data.catalog_spot_count };
}
