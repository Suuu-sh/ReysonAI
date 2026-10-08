// Restore the exact materialized Stage 3 LFS object. This never authors ranges.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { STAGE3_ARCHIVE_FILE, STAGE3_ARCHIVE_FORMAT, STAGE3_REVIEW_FILE, decodeStage3Archive, installStage3ArchiveFiles, sha256Stage3, stage3FileRecord } from "./lib/stage3-artifacts.mjs";
import { STAGE3_REPOSITORY, assertStage3ReviewRecord, reviewedStage3SourcePaths } from "./lib/reviewed-stage3.mjs";
export function restoreReviewedStage3(root = STAGE3_REPOSITORY) {
  root = resolve(root);
  const record = JSON.parse(readFileSync(join(root, STAGE3_REVIEW_FILE), "utf8"));
  // Validate approval metadata without pretending missing disk artifacts exist.
  assertStage3ReviewRecord(record, record);
  if (!isDeepStrictEqual(reviewedStage3SourcePaths(root).map(path => stage3FileRecord(root, path)), record.sources)) throw new Error("Stage 3 review source/configuration identity changed");
  const archive = { ...stage3FileRecord(root, STAGE3_ARCHIVE_FILE), format: STAGE3_ARCHIVE_FORMAT };
  if (!isDeepStrictEqual(archive, record.archive)) throw new Error("Stage 3 Git LFS payload is missing or changed; fetch LFS objects for this exact revision");
  if (record.content_sha256 !== sha256Stage3(JSON.stringify({ artifacts: record.artifacts, sources: record.sources, archive }))) throw new Error("Stage 3 review receipt content identity changed");
  return { ...installStage3ArchiveFiles(decodeStage3Archive(readFileSync(join(root, STAGE3_ARCHIVE_FILE)), record.artifacts), root), archive };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify({ status: "restored-reviewed-stage3-lfs-bytes", ...restoreReviewedStage3() }));
