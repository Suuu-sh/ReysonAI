import assert from "node:assert/strict";
import { readFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, unlinkSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync, gunzipSync } from "node:zlib";
import test from "node:test";
import { decodeReviewedArchive, restoreReviewedPreflop } from "../scripts/restore-reviewed-preflop.ts";
import { REPOSITORY, REVIEW_FILE, ARCHIVE_FILE, sha256, reviewedSourcePaths, fileRecord } from "../scripts/lib/reviewed-preflop.ts";
const review = JSON.parse(readFileSync(`${REPOSITORY}/${REVIEW_FILE}`, "utf8"));
const archive = readFileSync(`${REPOSITORY}/${ARCHIVE_FILE}`);
test("LFS archive restores all1614 exact reviewed files without generating data", () => {
  assert.equal(archive.length, 1747857);
  assert.equal(sha256(archive), "b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a");
  const files = decodeReviewedArchive(archive, review.artifacts);
  assert.equal(files.size, 1614);
  assert.equal([...files.values()].reduce<number>((sum, body) => sum + body.length, 0), 43276102);
});
test("pointer-only, corrupt, incomplete and nonregular archives are rejected", () => {
  assert.throws(() => decodeReviewedArchive(Buffer.from("version https://git-lfs.github.com/spec/v1\n"), review.artifacts));
  assert.throws(() => decodeReviewedArchive(archive.subarray(0, archive.length - 8), review.artifacts));
  assert.throws(() => decodeReviewedArchive(archive, review.artifacts.filter(item => !item.path.endsWith("continuation-responses.json"))), /incomplete/);
  const tar = gunzipSync(archive);
  tar[156] = 50; // A symlink header must never be extracted.
  assert.throws(() => decodeReviewedArchive(gzipSync(tar), review.artifacts), /regular/);
});
test("synthetic current-source archive fixture retains exact bytes and refuses changed candidates, symlinks and missing LFS payload", () => {
  const root = mkdtempSync(join(tmpdir(), "reysonai-reviewed-lfs-"));
  const stage2 = path => /\/continuation-(?:responses|call-equities|audit-report)\.json$|\/reasons\/(?:sq_|sq2_|cc_|c4_)/.test(path);
  const copy = path => { mkdirSync(dirname(join(root, path)), { recursive: true }); copyFileSync(join(REPOSITORY, path), join(root, path)); };
  try {
    // This is a temporary filesystem/security fixture, NOT a strategy approval.
    // Archive/artifact target paths and bytes remain the immutable real snapshot.
    // Its source closure uses the current .ts files, never nonexistent old .mjs.
    const currentSources = reviewedSourcePaths(REPOSITORY);
    for (const path of currentSources) copy(path);
    for (const { path } of review.artifacts.filter(item => !stage2(item.path))) copy(path);
    copy(REVIEW_FILE); copy(ARCHIVE_FILE);
    // The refreshed independent receipt binds this exact current TS source
    // closure; preserving an older archive does not weaken source validation.
    assert.deepEqual(review.sources, currentSources.map(path => fileRecord(REPOSITORY, path)));
    assert.equal(restoreReviewedPreflop(root).files, 1614);
    const synthetic = { ...review, fixture: "SYNTHETIC TEST ONLY - NOT RELEASE APPROVAL",
      review: { ...review.review, reviewer: "SYNTHETIC ARCHIVE SECURITY FIXTURE", scope: "temporary archive filesystem/security tests only" },
      sources: currentSources.map(path => fileRecord(root, path)) };
    writeFileSync(join(root, REVIEW_FILE), JSON.stringify(synthetic));
    const source = currentSources.find(path => path.endsWith("fastfold-readiness-sources.ts"))!;
    const sourceBytes = readFileSync(join(root, source));
    writeFileSync(join(root, source), Buffer.concat([sourceBytes, Buffer.from("\n// changed fixture source\n")]));
    assert.throws(() => restoreReviewedPreflop(root), /Review source\/configuration identity changed/);
    writeFileSync(join(root, source), sourceBytes);
    assert.equal(restoreReviewedPreflop(root).files, 1614);
    for (const item of review.artifacts.filter(item => stage2(item.path))) assert.equal(sha256(readFileSync(join(root, item.path))), item.sha256);
    const candidate = review.artifacts.find(item => /\/reasons\/sq_/.test(item.path));
    const path = join(root, candidate.path), original = readFileSync(path);
    writeFileSync(path, "unreviewed local candidate");
    assert.throws(() => restoreReviewedPreflop(root), /Existing local review candidate differs/);
    assert.equal(readFileSync(path, "utf8"), "unreviewed local candidate");
    unlinkSync(path);
    symlinkSync(join(root, ARCHIVE_FILE), path);
    assert.throws(() => restoreReviewedPreflop(root), /symlink/);
    unlinkSync(path); writeFileSync(path, original);
    writeFileSync(join(root, ARCHIVE_FILE), "version https://git-lfs.github.com/spec/v1\n");
    assert.throws(() => restoreReviewedPreflop(root), /Git LFS payload is missing or changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
