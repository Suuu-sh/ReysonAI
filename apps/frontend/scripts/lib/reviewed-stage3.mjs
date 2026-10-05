// Exact Stage 3 review receipt. No generation or automatic approval lives here.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { assertStage3Publication } from "./stage3-publication.mjs";
import { STAGE3_ARCHIVE_FILE, STAGE3_ARCHIVE_FORMAT, STAGE3_REVIEW_FILE, assertStage3ArtifactRecords, isStage3ArtifactPath, sha256Stage3, stage3FileRecord } from "./stage3-artifacts.mjs";

export const STAGE3_REPOSITORY = fileURLToPath(new URL("../../../..", import.meta.url));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sourceRoots = ["apps/frontend/scripts/build-stage3.mjs", "apps/frontend/scripts/generate-stage3-responses.mjs", "apps/frontend/scripts/lib/stage3-publication.mjs",
  "apps/frontend/scripts/lib/reviewed-stage3.mjs", "apps/frontend/scripts/restore-reviewed-stage3.mjs",
  "apps/frontend/scripts/record-stage3-review-candidate.mjs", "apps/frontend/scripts/lib/reviewed-preflop.mjs",
  "apps/frontend/scripts/build-estimates.mjs", "apps/frontend/scripts/pipeline.mjs",
  "apps/frontend/scripts/audit-estimates.mjs", "apps/frontend/scripts/range.mjs"];
export function reviewedStage3SourcePaths(root = STAGE3_REPOSITORY) {
  const found = new Set(["apps/frontend/package.json", "apps/frontend/package-lock.json", ".gitattributes", ".gitignore",
    ".github/workflows/deploy-worker.yml", "apps/frontend/scripts/package-reviewed-stage3.py",
    "configs/multiway-preflop-stage2.review.json", "configs/multiway-preflop-stage3.json",
    "apps/frontend/tests/fixtures/stage3-legacy-baseline.json"]);
  function visit(path) {
    if (found.has(path)) return;
    if (path.startsWith("../") || path.startsWith("/")) throw new Error("Stage 3 review source escapes repository");
    found.add(path);
    // Bind adjacent module declarations and their type-only dependencies too.
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
export function reviewedStage3Files(root = STAGE3_REPOSITORY) {
  const directory = "apps/frontend/src/estimated";
  const walk = path => readdirSync(join(root, path), { withFileTypes: true }).flatMap(entry => {
    const child = `${path}/${entry.name}`;
    return entry.isDirectory() ? walk(child) : isStage3ArtifactPath(child) ? [child] : [];
  });
  const artifacts = walk(directory).sort(compare).map(path => stage3FileRecord(root, path));
  assertStage3ArtifactRecords(artifacts);
  const sources = reviewedStage3SourcePaths(root).map(path => stage3FileRecord(root, path));
  const archive = { ...stage3FileRecord(root, STAGE3_ARCHIVE_FILE), format: STAGE3_ARCHIVE_FORMAT };
  return { artifacts, sources, archive, content_sha256: sha256Stage3(JSON.stringify({ artifacts, sources, archive })) };
}
export function assertStage3ReviewRecord(record, actual) {
  if (record.archive?.path !== STAGE3_ARCHIVE_FILE || record.archive?.format !== STAGE3_ARCHIVE_FORMAT) throw new Error("Unsupported Stage 3 archive format or path");
  if (record.schema_version !== 1 || record.review?.status !== "independently-reviewed" || record.review?.generator !== "local-only" ||
      !record.review?.reviewer || !record.review?.scope || !/^[a-f0-9]{40}$/.test(record.review?.baseline_commit ?? ""))
    throw new Error("Missing independent Stage 3 review record");
  if (!isDeepStrictEqual(record.artifacts, actual.artifacts)) throw new Error("Reviewed Stage 3 artifact paths, bytes or hashes changed");
  if (!isDeepStrictEqual(record.sources, actual.sources)) throw new Error("Reviewed Stage 3 source/configuration identity changed");
  if (!isDeepStrictEqual(record.archive, actual.archive)) throw new Error("Reviewed Stage 3 Git LFS payload is missing or changed");
  if (record.content_sha256 !== actual.content_sha256) throw new Error("Reviewed Stage 3 content identity changed");
}
export function verifyReviewedStage3(root = STAGE3_REPOSITORY) {
  const record = JSON.parse(readFileSync(join(root, STAGE3_REVIEW_FILE), "utf8"));
  assertStage3ReviewRecord(record, reviewedStage3Files(root));
  const complete = assertStage3Publication(join(root, "apps/frontend/src/estimated"));
  if (record.source_fingerprint !== complete.fingerprint || !isDeepStrictEqual(record.counts, complete.counts)) throw new Error("Reviewed Stage 3 fingerprint or counts changed");
  return { record, complete, counts: complete.counts };
}
