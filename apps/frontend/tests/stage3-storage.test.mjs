import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import test from "node:test";
import { STAGE3_DATASETS, assertStage3ArtifactRecords, decodeStage3Archive, installStage3ArchiveFiles, sha256Stage3, stage3FileRecord } from "../scripts/lib/stage3-artifacts.mjs";

const packager = fileURLToPath(new URL("../scripts/package-reviewed-stage3.py", import.meta.url));
const prefix = "apps/frontend/src/estimated/";
function fixture(id = "s3_fixture") {
  const root = mkdtempSync(join(tmpdir(), "reysonai-stage3-storage-"));
  const files = STAGE3_DATASETS.map(name => `${prefix}${name}.json`).concat(`${prefix}reasons/${id}.json`);
  for (const path of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), path.endsWith("stage3-responses.json") ? JSON.stringify({ spots:[{id}] }) + '\n' : '{"fixture":true}\n');
  }
  const records = files.sort().map(path => stage3FileRecord(root, path));
  const pack = out => JSON.parse(execFileSync("python3", [packager, "--root", root, "--out", out], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  pack(".local/first.tar.gz");
  return { root, files, records, pack, archive: readFileSync(join(root, ".local/first.tar.gz")) };
}
function withFixture(callback, id) {
  const value = fixture(id);
  try { return callback(value); } finally { rmSync(value.root, { recursive: true, force: true }); }
}
function correctedHeader(tar) {
  tar.fill(32, 148, 156);
  const sum = [...tar.subarray(0, 512)].reduce((a, b) => a + b, 0);
  Buffer.from(sum.toString(8).padStart(6, "0") + "\0 ").copy(tar, 148);
  return gzipSync(tar);
}
test("Stage 3 packaging is deterministic, isolated, complete and explicitly not approval", () => withFixture(({ root, pack, archive, records }) => {
  const result = pack(".local/second.tar.gz");
  assert.equal(result.review_approved, false);
  assert.equal(result.files, 5);
  assert.equal(result.objects, 2);
  assert.equal(result.format, "ustar+gzip-stage3-content-v1");
  assert.ok(readFileSync(join(root, ".local/second.tar.gz")).equals(archive));
  assert.deepEqual([...decodeStage3Archive(archive, records).keys()], records.map(item => item.path));
  assert.throws(() => pack("artifacts/preflop/stage2-reviewed.tar.gz"), /isolated archive/);
  assert.throws(() => pack(`${prefix}stage3-responses.json`), /isolated archive/);
  writeFileSync(join(root, `${prefix}reasons/s3_obsolete.json`), "{}");
  assert.throws(() => pack(".local/third.tar.gz"), /obsolete Stage 3 reason/);
}));
test("Stage 3 archive rejects pointer-only, changed bytes, incomplete sets, links and unsafe paths", () => withFixture(({ archive, records }) => {
  assert.throws(() => decodeStage3Archive(Buffer.from("version https://git-lfs.github.com/spec/v1\n"), records));
  assert.throws(() => decodeStage3Archive(archive.subarray(0, archive.length - 8), records));
  assert.throws(() => decodeStage3Archive(archive, records.filter(item => !item.path.endsWith("stage3-responses.json"))), /Incomplete/);
  assert.throws(() => assertStage3ArtifactRecords([...records, records[0]]), /duplicate/);
  assert.throws(() => assertStage3ArtifactRecords([{ ...records[0], path: "../escape.json" }, ...records.slice(1)]), /Unsafe/);
  assert.throws(() => decodeStage3Archive(archive, records.map((item, index) => index ? item : { ...item, sha256: "a".repeat(64) })), /hash differs|incomplete/);
  for (const [offset, value] of [[156, 50], [136, 49]]) {
    const tar = gunzipSync(archive); tar[offset] = value;
    assert.throws(() => decodeStage3Archive(correctedHeader(tar), records), /deterministic regular/);
  }
  const tar = gunzipSync(archive); tar.fill(0, 0, 100); Buffer.from("../escape.json").copy(tar);
  assert.throws(() => decodeStage3Archive(correctedHeader(tar), records), /unsafe/);
  const dirty = gunzipSync(archive); dirty[dirty.length - 1] = 1;
  assert.throws(() => decodeStage3Archive(gzipSync(dirty), records), /trailer/);
}));
test("Stage 3 restore preflights every candidate and rejects changed files and directory symlinks", () => withFixture(({ root, archive, records }) => {
  const files = decodeStage3Archive(archive, records), destination = join(root, "restore");
  mkdirSync(join(destination, prefix), { recursive: true });
  const changed = `${prefix}stage3-responses.json`;
  writeFileSync(join(destination, changed), "unreviewed candidate");
  assert.throws(() => installStage3ArchiveFiles(files, destination), /candidate differs/);
  assert.deepEqual(readdirSync(join(destination, prefix)), ["stage3-responses.json"]);
  assert.equal(readFileSync(join(destination, changed), "utf8"), "unreviewed candidate");
  rmSync(destination, { recursive: true });
  mkdirSync(join(destination, prefix), { recursive: true });
  symlinkSync(join(root, "apps/frontend/src/estimated/reasons"), join(destination, prefix, "reasons"));
  assert.throws(() => installStage3ArchiveFiles(files, destination), /symlink/);
  assert.deepEqual(readdirSync(join(destination, prefix)), ["reasons"]);
  rmSync(join(destination, prefix, "reasons"));
  symlinkSync(join(root, "missing-target"), join(destination, prefix, "reasons"));
  assert.throws(() => installStage3ArchiveFiles(files, destination), /symlink/);
  assert.deepEqual(readdirSync(join(destination, prefix)), ["reasons"]);
  rmSync(destination, { recursive: true });
  assert.equal(installStage3ArchiveFiles(files, destination).files, 5);
  assert.equal(installStage3ArchiveFiles(files, destination).files, 5);
  for (const item of records) assert.equal(sha256Stage3(readFileSync(join(destination, item.path))), item.sha256);
}));


test("long Stage3 history basenames restore exactly through deduplicated content objects", () => withFixture(({ root, archive, records, pack }) => {
  const longest = records.find(item => item.path.includes("/reasons/"));
  assert.ok(longest.path.split("/").at(-1).length > 100);
  const files = decodeStage3Archive(archive, records);
  assert.deepEqual([...files.keys()], records.map(item => item.path));
  const destination = join(root, "long-name-restore");
  installStage3ArchiveFiles(files, destination);
  for (const item of records) assert.equal(sha256Stage3(readFileSync(join(destination, item.path))), item.sha256);
  const again = pack(".local/long-again.tar.gz");
  assert.equal(again.objects, 2);
  assert.deepEqual(readFileSync(join(root, ".local/long-again.tar.gz")), archive);
  const tar = gunzipSync(archive);
  assert.match(tar.subarray(0, 100).toString().replace(/\0.*$/s,""), /^objects\/[a-f0-9]{64}$/);
  assert.throws(() => decodeStage3Archive(gzipSync(Buffer.concat([tar.subarray(0,1024),tar])),records), /duplicate|too large|Cannot create/);
  assert.throws(() => decodeStage3Archive(gzipSync(tar.subarray(1024)),records), /incomplete|Truncated/);
}, "s3_two_caller_squeeze_extra_UTGo2p5_HJc2p5_COc2p5_BTNs14p5_to_SB__SBc14p5_BBf_UTGr30_HJc30_COa100_BTNc100_SBc100__to_UTG"));
