// Restore exact reviewed bytes from a materialized Git LFS object. Never author.
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import { REPOSITORY, REVIEW_FILE, ARCHIVE_FILE, fileRecord, reviewedSourcePaths, sha256 } from "./lib/reviewed-preflop.mjs";

const stage2Path = path => /^apps\/frontend\/src\/estimated\/(?:continuation-(?:responses|call-equities|audit-report)\.json|reasons\/(?:sq_|sq2_|cc_|c4_)[A-Za-z0-9_]+\.json)$/.test(path);
const field = bytes => bytes.toString("utf8").replace(/\0.*$/s, "");
const octal = bytes => {
  const value = field(bytes).trim();
  if (!/^[0-7]+$/.test(value)) throw new Error("Invalid reviewed USTAR numeric field");
  return Number.parseInt(value, 8);
};
export function decodeReviewedArchive(compressed, expectedFiles) {
  const expected = new Map(expectedFiles.filter(item => stage2Path(item.path)).map(item => [item.path, item]));
  if (expected.size !== 1614) throw new Error("Reviewed Stage 2 archive file set is incomplete");
  const expandedLimit = [...expected.values()].reduce((sum, item) => sum + Math.ceil(item.bytes / 512) * 512 + 512, 0) + 10240;
  const tar = gunzipSync(compressed, { maxOutputLength: expandedLimit });
  const files = new Map();
  let offset = 0, ended = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (!tar.subarray(offset).every(byte => byte === 0)) throw new Error("Unexpected trailing archive content");
      ended = true; break;
    }
    const checksum = [...header].reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== octal(header.subarray(148, 156)) || field(header.subarray(257, 263)) !== "ustar" ||
        ![0, 48].includes(header[156])) throw new Error("Only regular reviewed USTAR files are supported");
    const name = field(header.subarray(0, 100)), prefix = field(header.subarray(345, 500));
    const path = prefix ? `${prefix}/${name}` : name;
    const expectedFile = expected.get(path), bytes = octal(header.subarray(124, 136));
    if (!expectedFile || files.has(path) || bytes !== expectedFile.bytes) throw new Error(`Unexpected/duplicate reviewed archive entry: ${path}`);
    const body = tar.subarray(offset + 512, offset + 512 + bytes);
    if (body.length !== bytes || sha256(body) !== expectedFile.sha256) throw new Error(`Reviewed archive entry hash differs: ${path}`);
    files.set(path, body);
    offset += 512 + Math.ceil(bytes / 512) * 512;
  }
  if (!ended || files.size !== expected.size) throw new Error("Truncated or incomplete reviewed archive");
  return files;
}

export function restoreReviewedPreflop(root = REPOSITORY) {
  root = resolve(root);
  const review = JSON.parse(readFileSync(join(root, REVIEW_FILE), "utf8"));
  if (review.schema_version !== 1 || review.review?.status !== "independently-reviewed") throw new Error("Independent review receipt is required before restoring data");
  const sourceRecords = reviewedSourcePaths(root).map(path => fileRecord(root, path));
  if (!isDeepStrictEqual(sourceRecords, review.sources)) throw new Error("Review source/configuration identity changed");
  const archive = { ...fileRecord(root, ARCHIVE_FILE), format: "ustar+gzip" };
  if (!isDeepStrictEqual(archive, review.archive)) throw new Error("Git LFS payload is missing or changed; fetch LFS objects for this exact revision");
  const files = decodeReviewedArchive(readFileSync(join(root, ARCHIVE_FILE)), review.artifacts);
  // Validate every path and existing file before writing anything. Never
  // overwrite a developer's unreviewed generation or traverse a symlink.
  for (const path of files.keys()) {
    let current = join(root, path);
    while (current !== root) {
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Refuse symlink in reviewed artifact destination");
      current = dirname(current);
    }
    if (existsSync(join(root, path)) && !readFileSync(join(root, path)).equals(files.get(path))) throw new Error(`Existing local review candidate differs: ${path}`);
  }
  for (const [path, body] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    if (!existsSync(join(root, path))) writeFileSync(join(root, path), body, { flag: "wx" });
  }
  return { files: files.size, bytes: [...files.values()].reduce((sum, body) => sum + body.length, 0), archive };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify({ status: "restored-reviewed-lfs-bytes", ...restoreReviewedPreflop() }));
