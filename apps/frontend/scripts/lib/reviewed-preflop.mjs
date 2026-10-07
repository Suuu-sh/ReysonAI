// Read-only verification of a previously authored and independently reviewed snapshot.
// Nothing in this module generates ranges, equities, frequencies or reason facts.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { assertContinuationPublication } from "./continuation-publication.mjs";
import { continuationReasonFingerprint } from "./continuation-reasons.mjs";
import { preparePreflopSerialization, writePreflopSqlFile, assertPreflopSqlFile } from "./preflop-sql.mjs";
import { auditOpponentProfiles, OPPONENT_PROFILE_DATASETS } from "../../src/estimated/opponent-profiles.ts";
import { loadOpponentProfileBundles, profileSourceFindings } from "./opponent-profile-build.mjs";
import { isBlockingAuditFinding } from "../../src/estimated/profile-audit-policy.ts";
import { isStage3ArtifactPath } from "./stage3-artifacts.mjs";
import { verifyReviewedStage3 } from "./reviewed-stage3.mjs";

export const FRONTEND = fileURLToPath(new URL("../..", import.meta.url));
export const REPOSITORY = resolve(FRONTEND, "../..");
export const REVIEW_FILE = "configs/multiway-preflop-stage2.review.json";
export const ARCHIVE_FILE = "artifacts/preflop/stage2-reviewed.tar.gz";
export const sha256 = value => createHash("sha256").update(value).digest("hex");
const dataPrefix = "apps/frontend/src/estimated/";
const sourceRoots = [
  "apps/frontend/scripts/build-continuations.mjs",
  "apps/frontend/scripts/generate-continuation-responses.mjs",
  "apps/frontend/scripts/lib/continuation-reasons.mjs",
  "apps/frontend/src/estimated/continuation-reason-format.ts",
  "apps/frontend/scripts/publish-d1.mjs",
  "apps/frontend/scripts/lib/continuation-publication.mjs",
  "apps/frontend/scripts/lib/reviewed-preflop.mjs",
  "apps/frontend/scripts/lib/preflop-delivery.mjs",
  "apps/frontend/scripts/verify-reviewed-preflop.mjs",
  "apps/frontend/scripts/import-reviewed-preflop.mjs",
  "apps/frontend/scripts/verify-preflop-local-d1.mjs",
  "apps/frontend/scripts/restore-reviewed-preflop.mjs",
  "apps/frontend/scripts/build-estimates.mjs",
  "apps/frontend/scripts/validate-estimates.mjs",
  "apps/frontend/scripts/pipeline.mjs",
  "apps/frontend/scripts/audit-estimates.mjs",
  "apps/frontend/scripts/range.mjs",
  "apps/frontend/scripts/build-stage3.mjs",
  "apps/frontend/scripts/generate-stage3-responses.mjs",
  "apps/frontend/scripts/restore-reviewed-stage3.mjs",
  "apps/frontend/scripts/record-stage3-review-candidate.mjs",
];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const load = path => JSON.parse(readFileSync(path, "utf8"));
export const fileRecord = (root, path) => {
  const bytes = readFileSync(join(root, path));
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
};
function jsonFiles(root, path) {
  return readdirSync(join(root, path), { withFileTypes: true }).flatMap(entry => {
    const child = `${path}/${entry.name}`;
    return entry.isDirectory() ? jsonFiles(root, child) : entry.name.endsWith(".json") ? [child] : [];
  });
}

// Include the complete static local import graph, including the RNG, dedicated
// evaluator, JSON configuration and common validators. Do not reuse a cache or
// treat a generator version string alone as provenance.
export function reviewedSourcePaths(root = REPOSITORY) {
  const found = new Set(["apps/frontend/package.json", "apps/frontend/package-lock.json", "apps/backend/migrations/0003_preflop.sql",
    ".gitattributes", ".github/workflows/deploy-worker.yml", "apps/backend/wrangler.jsonc", "apps/backend/src/fastfold.ts",
    "apps/backend/scripts/verify-fastfold-readiness.mjs", "apps/backend/scripts/lib/fastfold-readiness-sources.mjs", "apps/backend/tests/fastfold-release.test.mjs",
    "apps/frontend/wrangler.jsonc", "apps/frontend/scripts/ci/preflop.wrangler.jsonc",
    "apps/frontend/scripts/package-reviewed-preflop.py", "apps/frontend/scripts/package-reviewed-stage3.py", "apps/frontend/scripts/generate-opponent-profiles.py"]);
  function visit(path) {
    if (found.has(path)) return;
    if (path.startsWith("../") || path.startsWith("/")) throw new Error("Review source escapes repository");
    found.add(path);
    // Bound type declarations are provenance records, never executable imports.
    if (path.endsWith(".mjs")) {
      const declaration = path.slice(0, -4) + ".d.mts";
      if (existsSync(join(root, declaration))) visit(declaration);
    }
    if (!/\.(?:mjs|mts|ts|tsx|js)$/.test(path)) return;
    const text = readFileSync(join(root, path), "utf8");
    const imports = /(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']/g;
    const dynamicImports = /\bimport\s*\(\s*["']([^"']+)["']/g;
    for (const match of [...text.matchAll(imports), ...text.matchAll(dynamicImports)]) {
      if (!match[1].startsWith(".")) continue;
      visit(relative(root, resolve(root, dirname(path), match[1])).replaceAll("\\", "/"));
    }
  }
  sourceRoots.forEach(visit);
  return [...found].sort(compare);
}

export function reviewedFiles(root = REPOSITORY) {
  // Stage 2 retains its exact 1,888-file snapshot. Stage 3 has an independent
  // archive/receipt; refreshing a Stage 2 receipt cannot bless new Stage 3 data.
  const artifacts = jsonFiles(root, dataPrefix.slice(0, -1)).filter(path => !isStage3ArtifactPath(path)).sort(compare).map(path => fileRecord(root, path));
  const sources = reviewedSourcePaths(root).map(path => fileRecord(root, path));
  const archive = { ...fileRecord(root, ARCHIVE_FILE), format: "ustar+gzip" };
  return { artifacts, sources, archive, content_sha256: sha256(JSON.stringify({ artifacts, sources, archive })) };
}

export function assertReviewRecord(record, actual) {
  if (record.schema_version !== 1 || record.review?.status !== "independently-reviewed" ||
      record.review?.generator !== "local-only" || !record.review?.reviewer || !record.review?.scope ||
      !/^[0-9a-f]{40}$/.test(record.review?.baseline_commit ?? "")) throw new Error("Missing independent preflop review record");
  if (!isDeepStrictEqual(record.artifacts, actual.artifacts)) throw new Error("Reviewed preflop artifact paths, bytes or SHA-256 changed; author and review locally");
  if (!isDeepStrictEqual(record.sources, actual.sources)) throw new Error("Reviewed preflop source/configuration identity changed; author and review locally");
  if (!isDeepStrictEqual(record.archive, actual.archive)) throw new Error("Reviewed Git LFS archive changed or its payload is unavailable");
  if (record.content_sha256 !== actual.content_sha256) throw new Error("Reviewed preflop content identity changed");
}

export function verifyReviewedPreflop(root = REPOSITORY) {
  const record = load(join(root, REVIEW_FILE));
  const files = reviewedFiles(root);
  assertReviewRecord(record, files);
  const dir = join(root, dataPrefix);
  const complete = assertContinuationPublication(dir);
  // Preserve and validate the independently reviewed profiles already on
  // development. A full snapshot must not drop a newly merged namespace.
  const profiles = loadOpponentProfileBundles(dir);
  const balanced = Object.fromEntries(OPPONENT_PROFILE_DATASETS.map(name => [name, load(join(dir, `${name}.json`))]));
  const profileFindings = [...auditOpponentProfiles(profiles, balanced).findings, ...profileSourceFindings(profiles, dir)];
  if (profileFindings.some(isBlockingAuditFinding)) throw new Error("Saved opponent profiles are incomplete, stale or invalid");
  const data = load(join(dir, "continuation-responses.json"));
  const equities = load(join(dir, "continuation-call-equities.json"));
  const dependencies = ["opening-ranges", "preflop-ranges", "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses"];
  const datasets = Object.fromEntries(dependencies.map(name => [name, load(join(dir, `${name}.json`))]));
  const fingerprint = continuationReasonFingerprint({ data, datasets, equities });
  const counts = { catalog: data.catalog_spot_count, saved: data.spot_count,
    unreachable: data.omitted_unreachable_count, hands: data.entry_count };
  if (record.source_fingerprint !== fingerprint || !isDeepStrictEqual(record.counts, counts)) throw new Error("Reviewed continuation fingerprint or counts changed");
  return { record, complete, counts };
}

export function preparePreflopDeliveryStream(root = REPOSITORY) {
  const { record, counts } = verifyReviewedPreflop(root);
  const stage3 = verifyReviewedStage3(root);
  // This is deliberately not `migrations apply`: other migrations contain
  // unrelated postflop/account changes. The preflop schema is idempotent.
  const schema = readFileSync(join(root, "apps/backend/migrations/0003_preflop.sql"), "utf8");
  const serialized = preparePreflopSerialization(join(root, dataPrefix), `${schema}\n`);
  const manifest = { schema_version: 1, reviewed_content_sha256: sha256(JSON.stringify({ stage2: record.content_sha256, stage3: stage3.record.content_sha256 })),
    reviewed_stage2_content_sha256: record.content_sha256, reviewed_stage3_content_sha256: stage3.record.content_sha256,
    review_manifest_sha256: sha256(readFileSync(join(root, REVIEW_FILE))), counts,
    stage3_review_manifest_sha256: sha256(readFileSync(join(root, "configs/multiway-preflop-stage3.review.json"))), stage3_counts: stage3.counts,
    sql: serialized.sql, datasets: serialized.datasets };
  return { sqlChunks: serialized.sqlChunks, manifest };
}

// Retain the materialized API for small callers, but never use it in delivery CLIs.
export function preparePreflopDelivery(root = REPOSITORY) {
  const expected = preparePreflopDeliveryStream(root);
  const sql = Array.from(expected.sqlChunks()).join("");
  if (sha256(sql) !== expected.manifest.sql.sha256 || Buffer.byteLength(sql) !== expected.manifest.sql.bytes)
    throw new Error("Delivery bundle differs from the reviewed checkout");
  return { sql, manifest: expected.manifest };
}

export function writePreflopDeliveryFile(path, expected) {
  writePreflopSqlFile(path, expected.sqlChunks(), expected.manifest.sql);
}

export function assertDeliveryBundleFile(path, manifest, expected) {
  if (!isDeepStrictEqual(manifest, expected.manifest)) throw new Error("Delivery bundle differs from the reviewed checkout");
  assertPreflopSqlFile(path, expected.sqlChunks(), expected.manifest.sql);
}

export function assertDeliveryBundle(sql, manifest, expected) {
  if (sha256(sql) !== manifest.sql?.sha256 || Buffer.byteLength(sql) !== manifest.sql?.bytes ||
      !isDeepStrictEqual(manifest, expected.manifest) || sql !== expected.sql) throw new Error("Delivery bundle differs from the reviewed checkout");
}

export function assertPublishedMetadata(results, expected) {
  const actual = results.map(row => ({ name: row.name, sha256: row.content_hash, bytes: row.bytes, parts: row.parts })).sort((a, b) => compare(a.name, b.name));
  if (!isDeepStrictEqual(actual, expected.datasets)) throw new Error("D1 preflop dataset names/hashes/bytes/parts differ from the reviewed snapshot");
}
