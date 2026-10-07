// Stage 3 storage primitives. These only handle saved bytes; no range authoring.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

export const STAGE3_ARCHIVE_FORMAT = "ustar+gzip-stage3-content-v1";
export const STAGE3_DATASETS = ["stage3-responses", "stage3-call-equities", "stage3-audit-report", "stage3-coverage"];
export const STAGE3_REVIEW_FILE = "configs/multiway-preflop-stage3.review.json";
export const STAGE3_ARCHIVE_FILE = "artifacts/preflop/stage3-reviewed.tar.gz";
export const sha256Stage3 = value => createHash("sha256").update(value).digest("hex");
export const isStage3ArtifactPath = path => /^apps\/frontend\/src\/estimated\/(?:stage3-(?:responses|call-equities|audit-report|coverage)\.json|reasons\/s3_[A-Za-z0-9_]+\.json)$/.test(path);
export const stage3FileRecord = (root, path) => {
  const bytes = readFileSync(join(root, path));
  return { path, bytes: bytes.length, sha256: sha256Stage3(bytes) };
};
const field = bytes => bytes.toString("utf8").replace(/\0.*$/s, "");
const octal = bytes => {
  const value = field(bytes).trim();
  if (!/^[0-7]+$/.test(value)) throw new Error("Invalid Stage 3 USTAR numeric field");
  const number = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(number)) throw new Error("Unsafe Stage 3 USTAR numeric field");
  return number;
};
const existsIncludingLink = path => {
  try { lstatSync(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
};

export function assertStage3ArtifactRecords(records) {
  if (!Array.isArray(records)) throw new Error("Stage 3 archive file records are required");
  const expected = new Map();
  for (const item of records) {
    if (!item || !isStage3ArtifactPath(item.path) || expected.has(item.path) ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 2 || !/^[a-f0-9]{64}$/.test(item.sha256 ?? ""))
      throw new Error("Unsafe, duplicate or invalid Stage 3 archive file record");
    expected.set(item.path, item);
  }
  for (const name of STAGE3_DATASETS) {
    if (!expected.has(`apps/frontend/src/estimated/${name}.json`)) throw new Error("Incomplete Stage 3 archive file set");
  }
  return expected;
}

export function decodeStage3Archive(compressed, expectedFiles) {
  const expected = assertStage3ArtifactRecords(expectedFiles);
  const objects = new Map();
  for (const item of expected.values()) {
    const entry = `objects/${item.sha256}`;
    if (objects.has(entry) && objects.get(entry).bytes !== item.bytes) throw new Error("Inconsistent Stage 3 object record");
    if (!objects.has(entry)) objects.set(entry, { bytes: item.bytes, sha256: item.sha256, paths: [] });
    objects.get(entry).paths.push(item.path);
  }
  const expandedLimit = [...objects.values()].reduce((sum, item) => sum + Math.ceil(item.bytes / 512) * 512 + 512, 0) + 10240;
  if (!Number.isSafeInteger(expandedLimit)) throw new Error("Unsafe Stage 3 archive expansion limit");
  const tar = gunzipSync(compressed, { maxOutputLength: expandedLimit });
  const files = new Map(), seenObjects = new Set();
  let offset = 0, ended = false, previous = "";
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (tar.length - offset < 1024 || tar.length % 512 !== 0 || !tar.subarray(offset).every(byte => byte === 0))
        throw new Error("Unexpected/truncated Stage 3 archive trailer");
      ended = true; break;
    }
    const checksum = [...header].reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== octal(header.subarray(148, 156)) || field(header.subarray(257, 263)) !== "ustar" ||
        field(header.subarray(263, 265)) !== "00" || header[156] !== 48 ||
        field(header.subarray(157, 257)) || field(header.subarray(265, 297)) || field(header.subarray(297, 329)) ||
        octal(header.subarray(100, 108)) !== 0o644 || octal(header.subarray(108, 116)) !== 0 ||
        octal(header.subarray(116, 124)) !== 0 || octal(header.subarray(136, 148)) !== 0)
      throw new Error("Only deterministic regular Stage 3 USTAR files are supported");
    const name = field(header.subarray(0, 100)), prefix = field(header.subarray(345, 500));
    const path = prefix ? `${prefix}/${name}` : name;
    const item = objects.get(path), size = octal(header.subarray(124, 136));
    if (prefix || !/^objects\/[a-f0-9]{64}$/.test(path) || !item || seenObjects.has(path) || path <= previous || size !== item.bytes)
      throw new Error(`Unexpected/duplicate/unsafe Stage 3 archive object or hash differs: ${path}`);
    const end = offset + 512 + size;
    const body = tar.subarray(offset + 512, end);
    if (body.length !== size || sha256Stage3(body) !== item.sha256) throw new Error(`Stage 3 archive entry hash differs: ${path}`);
    const next = offset + 512 + Math.ceil(size / 512) * 512;
    if (next > tar.length || !tar.subarray(end, next).every(byte => byte === 0)) throw new Error("Invalid Stage 3 archive padding");
    for (const destination of item.paths) files.set(destination, body);
    seenObjects.add(path); previous = path; offset = next;
  }
  if (!ended || files.size !== expected.size || seenObjects.size !== objects.size) throw new Error("Truncated or incomplete Stage 3 archive");
  return new Map([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

export function installStage3ArchiveFiles(files, root) {
  root = resolve(root);
  if (existsIncludingLink(root) && lstatSync(root).isSymbolicLink()) throw new Error("Refuse symlink Stage 3 artifact root");
  // Preflight the entire set before creating any file. A developer's unreviewed
  // candidate must never be silently overwritten by archive restoration.
  for (const [path, body] of files) {
    if (!isStage3ArtifactPath(path)) throw new Error("Unsafe Stage 3 artifact destination");
    let current = join(root, path);
    while (current !== root) {
      if (existsIncludingLink(current) && lstatSync(current).isSymbolicLink()) throw new Error("Refuse symlink in Stage 3 artifact destination");
      current = dirname(current);
    }
    const destination = join(root, path);
    if (existsSync(destination) && !readFileSync(destination).equals(body)) throw new Error(`Existing Stage 3 review candidate differs: ${path}`);
  }
  for (const [path, body] of files) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    if (!existsSync(destination)) writeFileSync(destination, body, { flag: "wx" });
  }
  return { files: files.size, bytes: [...files.values()].reduce((sum, body) => sum + body.length, 0) };
}
