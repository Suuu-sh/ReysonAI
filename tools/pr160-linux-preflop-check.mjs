// Read-only Stage 2/3 saved-payload diagnostic for the reviewed PR160 source.
// It intentionally proves that the old receipts still reject the changed
// source identity; it never changes a receipt, publishes data, or issues a new
// acceptance. Decoded files are temporarily materialized only after strict
// path/ignore/existing-byte checks and only files created here are removed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const COMMIT = '7c979c8b5e60c5443455d8650ff3448733216bfc';
const TREE = 'cdc33e3de4fadca999dba8479ea1ca676e9ebee7';
const BASE = 'a9ee6d735f8174cc55dc135975fa220e94604758';
const REVIEWED_CORE_COMMIT = '9374d90f31fe8891ceb924c29eb436edefd76e4c';
const REVIEWED_CORE_TREE = '49dca15db8b1bdc4ba380a6c8994b6dc78d614a5';
const REVIEWED_CORE_BASE = '4114419a18ac70c1a9093f6bb39e529dee0cafe6';
const REPORT_SHA256 = '2f8a43cec4daba803f304ac07964f5fba1202d3894ef5e8293fa7c94c1dafe92';
const REPORT_REL = 'docs/qa/pr160-integrated-source-renewal-9374d90/pr160-integrated-source-review-9374d90.json';
const PACKET_HASHES = new Map([
  ['closure-review-summary.json', [8930, '005537c5798a9238551a248ef1a1a9857e98744635cb441edcfeef13e6d50e74']],
  ['backend-independent-tests.log', [1559, '9fd9f73965f4bdaa50797747b1f31172bef56ee7466d3c9e9b0487e3329df9b5']],
  ['independent-codec.test.mjs', [2268, 'd4a90de81ac154224ee5f94bbfa7f6e6eff7bfa00ec8656d00d06d2f4cb94848']],
  ['independent-codec.log', [439, '48391b9f28086c3c206b2319a07c19e7076f2917866247c171ac7807c5b1ae98']],
]);
const STAGE2_REVIEW = 'configs/multiway-preflop-stage2.review.json';
const STAGE2_ARCHIVE = 'artifacts/preflop/stage2-reviewed.tar.gz';
const STAGE3_REVIEW = 'configs/multiway-preflop-stage3.review.json';
const STAGE3_ARCHIVE = 'artifacts/preflop/stage3-reviewed.tar.gz';
const ESTIMATED_REL = 'apps/frontend/src/estimated';
const stage2ArtifactPath = relative => /^apps\/frontend\/src\/estimated\/(?:continuation-(?:responses|call-equities|audit-report)\.json|reasons\/(?:sq_|sq2_|cc_|c4_)[A-Za-z0-9_]+\.json)$/.test(relative);

const [repoArg, outArg] = process.argv.slice(2);
assert.ok(repoArg && outArg, 'Usage: node --experimental-strip-types --expose-gc checker.mjs REVIEWED_REPOSITORY OUTPUT_OUTSIDE_REPOSITORY');
assert.equal(process.platform, 'linux', 'The saved-payload diagnostic must run on Linux');
assert.equal(process.version, 'v22.20.0', 'The pinned CI Node version is mandatory');
assert.equal(typeof global.gc, 'function', '--expose-gc is required');
const repo = fs.realpathSync(repoArg);
const outputCandidate = path.resolve(outArg);
assert.ok(outputCandidate !== repo && !outputCandidate.startsWith(`${repo}${path.sep}`), 'Diagnostic output must be outside the reviewed checkout');
fs.mkdirSync(outputCandidate, { recursive: true });
const out = fs.realpathSync(outputCandidate);
assert.ok(out !== repo && !out.startsWith(`${repo}${path.sep}`), 'Resolved diagnostic output must be outside the reviewed checkout');
assert.ok(!fs.existsSync(path.join(out, 'preflop-result.json')), 'Diagnostic output directory must be fresh');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const writeJson = (name, value) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const existsIncludingLink = candidate => { try { fs.lstatSync(candidate); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const record = relative => { const bytes = fs.readFileSync(path.join(repo, relative)); return { path: relative, bytes: bytes.length, sha256: hash(bytes) }; };
const estimatedRoot = path.join(repo, ESTIMATED_REL);
const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packetRoot = path.join(harnessRoot, 'docs/qa/pr160-integrated-source-renewal-9374d90');
const reportBytes = fs.readFileSync(path.join(harnessRoot, REPORT_REL));
assert.equal(hash(reportBytes), REPORT_SHA256, 'The immutable integrated-source report must match its approved SHA-256');
const report = JSON.parse(reportBytes.toString('utf8'));
assert.equal(report.source_commit, REVIEWED_CORE_COMMIT);
assert.equal(report.source_tree, REVIEWED_CORE_TREE);
assert.equal(report.base_commit, REVIEWED_CORE_BASE);
assert.equal(report.decision, 'PASS_INDEPENDENT_SOURCE_CONTEXT_ONLY');
assert.equal(report.reviewer?.model, 'gpt-6-astra');
assert.equal(report.reviewer?.reasoning_effort, 'xhigh');
assert.equal(report.reviewer?.independent_from_implementation_author, true);
assert.equal(report.implementation_author?.model, null, 'The implementation-author model stays unknown');
for (const [name, [bytes, sha256]] of PACKET_HASHES) {
  const actual = fs.readFileSync(path.join(packetRoot, name));
  assert.equal(actual.length, bytes, `Preserved packet byte length changed: ${name}`);
  assert.equal(hash(actual), sha256, `Preserved packet hash changed: ${name}`);
}
assert.equal(git('rev-parse', 'HEAD'), COMMIT);
assert.equal(git('rev-parse', 'HEAD^{tree}'), TREE);
assert.equal(git('status', '--porcelain'), '', 'The exact reviewed checkout must start clean');

const stage2Module = await import(pathToFileURL(path.join(repo, 'apps/frontend/scripts/lib/reviewed-preflop.mjs')));
const stage2RestoreModule = await import(pathToFileURL(path.join(repo, 'apps/frontend/scripts/restore-reviewed-preflop.mjs')));
const stage2ArtifactsModule = await import(pathToFileURL(path.join(repo, 'apps/frontend/scripts/lib/continuation-publication.mjs')));
const stage2ReasonsModule = await import(pathToFileURL(path.join(repo, 'apps/frontend/scripts/lib/continuation-reasons.mjs')));
const stage3Module = await import(pathToFileURL(path.join(repo, 'apps/frontend/scripts/lib/reviewed-stage3.mjs')));
const stage3RestoreModule = await import(pathToFileURL(path.join(repo, 'apps/frontend/scripts/restore-reviewed-stage3.mjs')));
const stage3ArtifactsModule = await import(pathToFileURL(path.join(repo, 'apps/frontend/scripts/lib/stage3-artifacts.mjs')));
const stage3PublicationModule = await import(pathToFileURL(path.join(repo, 'apps/frontend/scripts/lib/stage3-publication.mjs')));
const { auditOpponentProfiles, OPPONENT_PROFILE_DATASETS } = await import(pathToFileURL(path.join(repo, 'apps/frontend/src/estimated/opponent-profiles.ts')));
const { loadOpponentProfileBundles, profileSourceFindings } = await import(pathToFileURL(path.join(repo, 'apps/frontend/scripts/lib/opponent-profile-build.mjs')));
const { isBlockingAuditFinding } = await import(pathToFileURL(path.join(repo, 'apps/frontend/src/estimated/profile-audit-policy.ts')));

const stage2Receipt = JSON.parse(fs.readFileSync(path.join(repo, STAGE2_REVIEW), 'utf8'));
const stage3Receipt = JSON.parse(fs.readFileSync(path.join(repo, STAGE3_REVIEW), 'utf8'));
const expectedStage2 = report.source_closure_review.stage2;
const expectedStage3 = report.source_closure_review.stage3;
const createdFiles = [];
const createdDirectories = [];
const result = {
  status: 'IN_PROGRESS', source_commit: COMMIT, source_tree: TREE, base_commit: BASE,
  source_context_report_sha256: REPORT_SHA256,
  source_context_review: { report_commit: REVIEWED_CORE_COMMIT, report_tree: REVIEWED_CORE_TREE, report_base: REVIEWED_CORE_BASE,
    decision: report.decision, reviewer_task: report.reviewer.task, reviewer_model: report.reviewer.model,
    reasoning_effort: report.reviewer.reasoning_effort, independent_from_implementation_author: true,
    current_development_ui_base: BASE, numerical_source_paths_revalidated_against_report: true },
  implementation_author_model: null, diagnostic_issues_approval: false, installable_acceptance: false,
  receipt_issued: false, numerical_generation: false, new_numerical_review: false,
  runtime: { node: process.version, platform: process.platform, arch: process.arch, release: os.release(), zlib: process.versions.zlib },
};
let failure;

function assertSourceDelta(label, beforeRows, afterRows, expected) {
  const before = new Map(beforeRows.map(row => [row.path, row]));
  const after = new Map(afterRows.map(row => [row.path, row]));
  assert.equal(before.size, beforeRows.length, `${label}: duplicate saved source paths`);
  assert.equal(after.size, afterRows.length, `${label}: duplicate current source paths`);
  const added = [...after.keys()].filter(name => !before.has(name)).sort();
  const removed = [...before.keys()].filter(name => !after.has(name)).sort();
  const modified = [...before.keys()].filter(name => after.has(name) && JSON.stringify(before.get(name)) !== JSON.stringify(after.get(name))).sort();
  assert.equal(after.size, expected.source_count, `${label}: current source count differs from the approved report`);
  assert.deepEqual(added, expected.added.map(row => row.path).sort(), `${label}: added source paths differ from the approved report`);
  assert.deepEqual(removed, expected.removed.map(row => row.path).sort(), `${label}: removed source paths differ from the approved report`);
  assert.deepEqual(modified, expected.modified.map(row => row.path).sort(), `${label}: modified source paths differ from the approved report`);
  for (const row of expected.added) assert.deepEqual(after.get(row.path), row, `${label}: added source bytes/hash differ`);
  for (const row of expected.modified) {
    assert.deepEqual(before.get(row.path), row.before, `${label}: baseline source record differs`);
    assert.deepEqual(after.get(row.path), row.after, `${label}: current source record differs`);
  }
  for (const [name, row] of before) if (after.has(name) && !modified.includes(name))
    assert.deepEqual(after.get(name), row, `${label}: unexpected unchanged-source difference at ${name}`);
  return { added, modified, removed };
}

function assertNoSymlinkComponents(relative) {
  let current = repo;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (!existsIncludingLink(current)) break;
    assert.equal(fs.lstatSync(current).isSymbolicLink(), false, `Refuse symlink in archive destination: ${relative}`);
  }
}

function isGitIgnored(relative) {
  try {
    execFileSync('git', ['--no-replace-objects', 'check-ignore', '--no-index', '--quiet', '--', relative], { cwd: repo, stdio: 'ignore' });
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

function materializeMissing(label, files, predicate) {
  const rows = [...files].map(([relative, body]) => ({ relative, body, absolute: path.resolve(repo, relative) }));
  for (const row of rows) {
    assert.equal(predicate(row.relative), true, `${label}: archive path is outside the validated artifact set: ${row.relative}`);
    assert.ok(row.relative.startsWith(`${ESTIMATED_REL}/`), `${label}: archive destination is outside src/estimated`);
    assert.equal(path.posix.normalize(row.relative), row.relative, `${label}: non-canonical archive path`);
    assert.ok(row.absolute.startsWith(`${estimatedRoot}${path.sep}`), `${label}: resolved destination escaped the estimated-data subtree`);
    assertNoSymlinkComponents(row.relative);
    if (existsIncludingLink(row.absolute)) {
      const stat = fs.lstatSync(row.absolute);
      assert.equal(stat.isFile(), true, `${label}: existing destination is not a regular file`);
      assert.ok(fs.readFileSync(row.absolute).equals(row.body), `${label}: existing destination bytes differ; refusing overwrite: ${row.relative}`);
    } else {
      assert.equal(git('ls-files', '--', row.relative), '', `${label}: a missing destination is tracked: ${row.relative}`);
      assert.equal(isGitIgnored(row.relative), true, `${label}: a missing destination is not ignored: ${row.relative}`);
    }
  }
  const totalBytes = rows.reduce((sum, row) => sum + row.body.length, 0);
  for (const row of rows) {
    if (existsIncludingLink(row.absolute)) continue;
    const parents = [];
    let parent = path.dirname(row.absolute);
    while (parent !== repo && parent.startsWith(`${repo}${path.sep}`) && !existsIncludingLink(parent)) {
      parents.push(parent);
      parent = path.dirname(parent);
    }
    assertNoSymlinkComponents(path.relative(repo, parent).split(path.sep).join('/'));
    for (const directory of parents.reverse()) {
      fs.mkdirSync(directory);
      createdDirectories.push(directory);
      assert.equal(fs.lstatSync(directory).isSymbolicLink(), false, `${label}: created symlink destination directory`);
    }
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0);
    const fd = fs.openSync(row.absolute, flags, 0o600);
    createdFiles.push(row);
    try { fs.writeFileSync(fd, row.body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  for (const row of rows) assert.ok(fs.readFileSync(row.absolute).equals(row.body), `${label}: materialized bytes differ: ${row.relative}`);
  return { entries: rows.length, bytes: totalBytes };
}

function cleanupMaterialized() {
  for (const row of [...createdFiles].reverse()) {
    if (!existsIncludingLink(row.absolute)) continue;
    assert.equal(fs.lstatSync(row.absolute).isSymbolicLink(), false, `Refuse to clean changed symlink: ${row.relative}`);
    assert.ok(fs.readFileSync(row.absolute).equals(row.body), `Refuse to remove archive destination changed during diagnostic: ${row.relative}`);
    fs.unlinkSync(row.absolute);
  }
  for (const directory of [...createdDirectories].reverse()) {
    if (!existsIncludingLink(directory)) continue;
    assert.equal(fs.lstatSync(directory).isSymbolicLink(), false, 'Refuse to clean changed symlink directory');
    try { fs.rmdirSync(directory); } catch (error) { if (!['ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
  }
}

async function run() {
  assert.equal(stage2Receipt.artifacts.length, report.conservation_review.stage2_artifact_records);
  assert.equal(stage3Receipt.artifacts.length, report.conservation_review.stage3_artifact_records);
  assert.equal(hash(Buffer.from(JSON.stringify({ artifacts: stage2Receipt.artifacts, sources: stage2Receipt.sources, archive: stage2Receipt.archive }))), stage2Receipt.content_sha256,
    'Historical Stage 2 receipt identity must remain internally valid');
  assert.equal(hash(Buffer.from(JSON.stringify({ artifacts: stage3Receipt.artifacts, sources: stage3Receipt.sources, archive: stage3Receipt.archive }))), stage3Receipt.content_sha256,
    'Historical Stage 3 receipt identity must remain internally valid');

  assert.throws(() => stage2RestoreModule.restoreReviewedPreflop(repo), /Review source\/configuration identity changed/,
    'The unchanged official Stage 2 restore must still fail closed on stale source identity');
  assert.throws(() => stage3RestoreModule.restoreReviewedStage3(repo), /Stage 3 review source\/configuration identity changed/,
    'The unchanged official Stage 3 restore must still fail closed on stale source identity');

  const stage2ArchiveBytes = fs.readFileSync(path.join(repo, STAGE2_ARCHIVE));
  const stage2ArchiveIdentity = { ...stage2Module.fileRecord(repo, STAGE2_ARCHIVE), format: stage2Receipt.archive.format };
  assert.deepEqual(stage2ArchiveIdentity, stage2Receipt.archive, 'Stage 2 LFS archive length/hash differs from its unchanged receipt');
  const stage2Files = stage2RestoreModule.decodeReviewedArchive(stage2ArchiveBytes, stage2Receipt.artifacts);
  assert.equal(stage2Files.size, 1614, 'Stage 2 decoded archive file count changed');
  const stage2Materialized = materializeMissing('Stage 2', stage2Files, stage2ArtifactPath);
  for (const row of stage2Receipt.artifacts) if (stage2ArtifactPath(row.path))
    assert.deepEqual(stage2Module.fileRecord(repo, row.path), row, `Stage 2 decoded artifact record differs: ${row.path}`);

  const stage3ArchiveBytes = fs.readFileSync(path.join(repo, STAGE3_ARCHIVE));
  const stage3ArchiveIdentity = { ...stage3ArtifactsModule.stage3FileRecord(repo, STAGE3_ARCHIVE), format: stage3Receipt.archive.format };
  assert.deepEqual(stage3ArchiveIdentity, stage3Receipt.archive, 'Stage 3 LFS archive length/hash differs from its unchanged receipt');
  const stage3Files = stage3ArtifactsModule.decodeStage3Archive(stage3ArchiveBytes, stage3Receipt.artifacts);
  assert.equal(stage3Files.size, 1805, 'Stage 3 decoded archive file count changed');
  const stage3Materialized = materializeMissing('Stage 3', stage3Files, stage3ArtifactsModule.isStage3ArtifactPath);
  for (const row of stage3Receipt.artifacts)
    assert.deepEqual(stage3ArtifactsModule.stage3FileRecord(repo, row.path), row, `Stage 3 decoded artifact record differs: ${row.path}`);

  const stage2Actual = stage2Module.reviewedFiles(repo);
  assert.deepEqual(stage2Actual.artifacts, stage2Receipt.artifacts, 'Stage 2 saved artifact/archive records changed');
  assert.deepEqual(stage2Actual.archive, stage2Receipt.archive, 'Stage 2 saved archive record changed');
  const stage2Delta = assertSourceDelta('Stage 2', stage2Receipt.sources, stage2Actual.sources, expectedStage2);
  assert.throws(() => stage2Module.assertReviewRecord(stage2Receipt, stage2Actual), /Reviewed preflop source\/configuration identity changed/,
    'The unchanged official Stage 2 receipt assertion must reject the changed sources');

  const estimated = path.join(repo, ESTIMATED_REL);
  const stage2Publication = stage2ArtifactsModule.assertContinuationPublication(estimated);
  assert.equal(stage2Publication.status, 'complete');
  const stage2Data = JSON.parse(fs.readFileSync(path.join(estimated, 'continuation-responses.json'), 'utf8'));
  const stage2Equities = JSON.parse(fs.readFileSync(path.join(estimated, 'continuation-call-equities.json'), 'utf8'));
  const stage2DatasetNames = ['opening-ranges', 'preflop-ranges', 'multiway-responses', 'multiway2-responses', 'squeeze-responses', 'cold-three-bet-responses', 'cold-four-bet-responses'];
  const stage2Datasets = Object.fromEntries(stage2DatasetNames.map(name => [name, JSON.parse(fs.readFileSync(path.join(estimated, `${name}.json`), 'utf8'))]));
  const stage2Fingerprint = stage2ReasonsModule.continuationReasonFingerprint({ data: stage2Data, datasets: stage2Datasets, equities: stage2Equities });
  const stage2Counts = { catalog: stage2Data.catalog_spot_count, saved: stage2Data.spot_count,
    unreachable: stage2Data.omitted_unreachable_count, hands: stage2Data.entry_count };
  assert.equal(stage2Fingerprint, stage2Receipt.source_fingerprint, 'Stage 2 saved numerical fingerprint changed');
  assert.deepEqual(stage2Counts, stage2Receipt.counts, 'Stage 2 saved counts changed');
  const stage2Profiles = loadOpponentProfileBundles(estimated);
  const stage2Balanced = Object.fromEntries(OPPONENT_PROFILE_DATASETS.map(name => [name, JSON.parse(fs.readFileSync(path.join(estimated, `${name}.json`), 'utf8'))]));
  const stage2ProfileFindings = [...auditOpponentProfiles(stage2Profiles, stage2Balanced).findings, ...profileSourceFindings(stage2Profiles, estimated)];
  assert.equal(stage2ProfileFindings.some(isBlockingAuditFinding), false, 'Preserved development opponent profiles have blocking audit findings');

  const stage3Actual = stage3Module.reviewedStage3Files(repo);
  assert.deepEqual(stage3Actual.artifacts, stage3Receipt.artifacts, 'Stage 3 saved artifact/archive records changed');
  assert.deepEqual(stage3Actual.archive, stage3Receipt.archive, 'Stage 3 saved archive record changed');
  const stage3Delta = assertSourceDelta('Stage 3', stage3Receipt.sources, stage3Actual.sources, expectedStage3);
  assert.throws(() => stage3Module.assertStage3ReviewRecord(stage3Receipt, stage3Actual), /Reviewed Stage 3 source\/configuration identity changed/,
    'The unchanged official Stage 3 receipt assertion must reject the changed sources');
  const stage3Publication = stage3PublicationModule.assertStage3Publication(estimated);
  assert.equal(stage3Publication.status, 'complete');
  assert.equal(stage3Publication.fingerprint, stage3Receipt.source_fingerprint, 'Stage 3 saved numerical fingerprint changed');
  assert.deepEqual(stage3Publication.counts, stage3Receipt.counts, 'Stage 3 saved counts changed');

  result.status = 'PASS_SAVED_PREFLOP_SOURCE_DIAGNOSTIC_ONLY';
  result.stage2 = {
    stale_restore_rejected: true, stale_receipt_assertion_rejected: true,
    archive: stage2ArchiveIdentity, decoded_entries: stage2Materialized.entries, decoded_bytes: stage2Materialized.bytes,
    saved_artifact_records: stage2Receipt.artifacts.length, saved_artifact_records_equal: true,
    source_count: stage2Actual.sources.length, source_delta: stage2Delta, source_records: stage2Actual.sources,
    old_content_sha256: stage2Receipt.content_sha256, current_content_sha256: stage2Actual.content_sha256,
    publication: stage2Publication.status, counts: stage2Counts, source_fingerprint: stage2Fingerprint,
    profile_findings: stage2ProfileFindings.length,
  };
  result.stage3 = {
    stale_restore_rejected: true, stale_receipt_assertion_rejected: true,
    archive: stage3ArchiveIdentity, decoded_entries: stage3Materialized.entries, decoded_bytes: stage3Materialized.bytes,
    saved_artifact_records: stage3Receipt.artifacts.length, saved_artifact_records_equal: true,
    source_count: stage3Actual.sources.length, source_delta: stage3Delta, source_records: stage3Actual.sources,
    old_content_sha256: stage3Receipt.content_sha256, current_content_sha256: stage3Actual.content_sha256,
    publication: stage3Publication.status, counts: stage3Publication.counts, source_fingerprint: stage3Publication.fingerprint,
  };
}

try { await run(); } catch (error) { failure = error; }
try { cleanupMaterialized(); } catch (error) { failure ??= error; }
if (!failure) {
  try {
    assert.equal(git('rev-parse', 'HEAD^{tree}'), TREE, 'Reviewed source tree changed during the diagnostic');
    assert.equal(git('status', '--porcelain'), '', 'Diagnostic left a tracked/unignored modification in the reviewed checkout');
  } catch (error) { failure = error; }
}
if (failure) {
  result.status = 'FAIL';
  result.error = String(failure?.stack ?? failure);
  writeJson('preflop-result.json', result);
  throw failure;
}
result.diagnostic_created_files_removed = true;
result.receipt_issued = false;
result.installable_acceptance = false;
result.diagnostic_issues_approval = false;
result.remaining_blocker = 'This diagnostic proves saved-source/artifact conservation only. The old receipts intentionally remain stale and must be renewed by the separate approved source-only phase.';
writeJson('preflop-result.json', result);
console.log(JSON.stringify({ status: result.status, source_commit: COMMIT, source_tree: TREE, report_sha256: REPORT_SHA256,
  stage2_sources: result.stage2.source_count, stage2_archive_entries: result.stage2.decoded_entries,
  stage2_artifact_records: result.stage2.saved_artifact_records, stage3_sources: result.stage3.source_count,
  stage3_archive_entries: result.stage3.decoded_entries, stage3_artifact_records: result.stage3.saved_artifact_records,
  receipts_issued: false, raw_restore_files_retained: false }));
