// Fail-closed validation of the complete saved Stage 3 snapshot. Never author.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { validateStage3Dataset } from "../../src/estimated/stage3-responses.ts";
import { validateStage3Coverage } from "../../src/estimated/stage3-coverage.ts";
import { auditStage3Estimates } from "../../src/estimated/stage3-audit.ts";
import { checkRangeBalance, checkCrossStrengthInversion, isBlockingAuditFinding } from "../../src/estimated/audit.ts";
import { stage3ExpectedCompactReasons, stage3ReasonFingerprint } from "./stage3-reasons.mjs";
import { expandStage3Reasons } from "../../src/estimated/stage3-reason-format.ts";
import { STAGE3_DATASETS } from "./stage3-artifacts.mjs";

export const STAGE3_PREREQUISITES = ["opening-ranges", "preflop-ranges", "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses", "continuation-responses"];
export function assertStage3ReasonPayload(saved, expected) {
  expandStage3Reasons(saved);
  // A fingerprint identifies the sources, not the truth of arbitrary saved
  // facts. Bind every row, pot/reach/EV fact and unreachable template to those
  // exact saved policies/equities using the read-only canonical projection.
  if (!isDeepStrictEqual(saved, expected)) throw new Error(`Stage 3 publication reason facts or templates differ from saved sources: ${expected.spot_id}`);
}
export function assertStage3Publication(directory, { allowLegacyOnly = false } = {}) {
  const present = STAGE3_DATASETS.filter(name => existsSync(join(directory, `${name}.json`)));
  const reasonDirectory = join(directory, "reasons");
  const reasonFiles = existsSync(reasonDirectory) ? readdirSync(reasonDirectory).filter(name => /^s3_.*\.json$/.test(name)) : [];
  if (!present.length && !reasonFiles.length) {
    if (allowLegacyOnly) return { status: "legacy-only" };
    throw new Error("Stage 3 artifacts are absent. Author and review the complete Stage 3 snapshot locally before full publication; omission requires explicit --allow-legacy-only.");
  }
  if (present.length !== STAGE3_DATASETS.length) throw new Error("Partial Stage 3 publication artifacts; the complete reviewed snapshot is required");
  const load = name => JSON.parse(readFileSync(join(directory, `${name}.json`), "utf8"));
  const datasets = Object.fromEntries(STAGE3_PREREQUISITES.map(name => [name, load(name)]));
  const data = load("stage3-responses"), equities = load("stage3-call-equities");
  validateStage3Dataset(data, datasets);
  validateStage3Coverage(load("stage3-coverage"), data, datasets);
  const audit = auditStage3Estimates(data, datasets, equities, { checkRangeBalance, checkCrossStrengthInversion });
  if (audit.findings.some(isBlockingAuditFinding) || !isDeepStrictEqual(audit, load("stage3-audit-report"))) throw new Error("Stage 3 publication audit is failing or stale");
  const expected = new Set(data.spots.map(spot => `${spot.id}.json`));
  if (reasonFiles.length !== expected.size || reasonFiles.some(name => !expected.has(name))) throw new Error("Stage 3 publication reasons are incomplete or obsolete");
  let fingerprint;
  for (const [id, expectedReason] of stage3ExpectedCompactReasons({ data, datasets, equities })) {
    fingerprint ??= expectedReason.source_fingerprint;
    assertStage3ReasonPayload(load(`reasons/${id}`), expectedReason);
  }
  fingerprint ??= stage3ReasonFingerprint({ data, datasets, equities });
  return { status: "complete", fingerprint, counts: { catalog: data.catalog_spot_count, saved: data.spot_count,
    unreachable: data.omitted_unreachable_count, rare: data.omitted_rare_count, hands: data.entry_count } };
}
