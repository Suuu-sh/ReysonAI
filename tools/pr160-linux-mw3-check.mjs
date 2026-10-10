// Diagnostic test only. No receipt issuance, generator, packager, SQL write or deployment.
// The reviewed repository is a separate, exact checkout; this harness does not alter its sources.
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
const [repoArg, outArg] = process.argv.slice(2);
assert.ok(repoArg && outArg, 'Usage: node --experimental-strip-types --expose-gc checker.mjs REPOSITORY OUTPUT');
const repo = fs.realpathSync(repoArg), outCandidate = path.resolve(outArg);
assert.ok(outCandidate !== repo && !outCandidate.startsWith(`${repo}${path.sep}`), 'Output must be outside the reviewed checkout');
fs.mkdirSync(outCandidate, { recursive: true });
const out = fs.realpathSync(outCandidate);
assert.ok(out !== repo && !out.startsWith(`${repo}${path.sep}`), 'Resolved output must be outside the reviewed checkout');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const put = (name, value) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(value, null, 2)}\n`);
const git = (...args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const record = relative => { const bytes = fs.readFileSync(path.join(repo, relative)); return { path: relative, bytes: bytes.length, sha256: hash(bytes) }; };
function assertSourceDelta(label, beforeRows, afterRows, expected) {
  const before = new Map(beforeRows.map(row => [row.path, row]));
  const after = new Map(afterRows.map(row => [row.path, row]));
  assert.equal(before.size, beforeRows.length, `${label}: duplicate historical source paths`);
  assert.equal(after.size, afterRows.length, `${label}: duplicate current source paths`);
  const added = [...after.keys()].filter(name => !before.has(name)).sort();
  const removed = [...before.keys()].filter(name => !after.has(name)).sort();
  const modified = [...before.keys()].filter(name => after.has(name) && JSON.stringify(before.get(name)) !== JSON.stringify(after.get(name))).sort();
  assert.equal(after.size, expected.source_count, `${label}: source count differs from the immutable source-context report`);
  assert.deepEqual(added, expected.added.map(row => row.path).sort(), `${label}: added paths differ from the immutable source-context report`);
  assert.deepEqual(removed, expected.removed.map(row => row.path).sort(), `${label}: removed paths differ from the immutable source-context report`);
  assert.deepEqual(modified, expected.modified.map(row => row.path).sort(), `${label}: modified paths differ from the immutable source-context report`);
  for (const row of expected.added) assert.deepEqual(after.get(row.path), row, `${label}: added source record differs`);
  for (const row of expected.modified) {
    assert.deepEqual(before.get(row.path), row.before, `${label}: baseline source record differs`);
    assert.deepEqual(after.get(row.path), row.after, `${label}: reviewed source record differs`);
  }
  for (const [name, row] of before) if (after.has(name) && !modified.includes(name))
    assert.deepEqual(after.get(name), row, `${label}: unexpected source difference at ${name}`);
  return { added, modified, removed };
}
const harnessRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportBytes = fs.readFileSync(path.join(harnessRoot, 'docs/qa/pr160-integrated-source-renewal-9374d90/pr160-integrated-source-review-9374d90.json'));
assert.equal(hash(reportBytes), REPORT_SHA256, 'The immutable reviewed-core report must match its approved hash');
const sourceReport = JSON.parse(reportBytes.toString('utf8'));
assert.equal(sourceReport.source_commit, REVIEWED_CORE_COMMIT);
assert.equal(sourceReport.source_tree, REVIEWED_CORE_TREE);
assert.equal(sourceReport.base_commit, REVIEWED_CORE_BASE);
assert.equal(sourceReport.decision, 'PASS_INDEPENDENT_SOURCE_CONTEXT_ONLY');
assert.equal(sourceReport.reviewer?.model, 'gpt-6-astra');
assert.equal(sourceReport.reviewer?.reasoning_effort, 'xhigh');
assert.equal(sourceReport.reviewer?.independent_from_implementation_author, true);
assert.equal(sourceReport.implementation_author?.model, null, 'Do not infer the implementation-author model');
const result = {
  status: 'IN_PROGRESS', source_commit: COMMIT, source_tree: TREE,
  runtime: { node: process.version, platform: process.platform, arch: process.arch, release: os.release(), zlib: process.versions.zlib },
  source_context_report_sha256: REPORT_SHA256,
  source_context_review: { report_commit: REVIEWED_CORE_COMMIT, report_tree: REVIEWED_CORE_TREE, report_base: REVIEWED_CORE_BASE,
    decision: sourceReport.decision, reviewer_task: sourceReport.reviewer.task, reviewer_model: sourceReport.reviewer.model,
    reasoning_effort: sourceReport.reviewer.reasoning_effort, independent_from_implementation_author: true,
    current_development_ui_base: BASE, numerical_source_paths_revalidated_against_report: true },
  implementation_author_model: null, diagnostic_issues_approval: false, installable_acceptance: false,
  receipt_issued: false, numerical_generation: false, new_numerical_review: false, subjects: [],
};
put('result.json', result);

try {
  assert.equal(process.platform, 'linux', 'This diagnostic requires Linux; no OS-byte correction is allowed');
  assert.equal(process.version, 'v22.20.0', 'The pinned CI Node version is mandatory');
  assert.equal(typeof global.gc, 'function', '--expose-gc is required');
  result.runtime.git = git('--version');
  assert.equal(git('rev-parse', 'HEAD'), COMMIT);
  assert.equal(git('rev-parse', 'HEAD^{tree}'), TREE);
  assert.equal(git('status', '--porcelain'), '');
  const load = name => import(pathToFileURL(path.join(repo, 'apps/frontend/scripts/postflop-ai', name)));
  const { collectMw3Snapshot, verifyMw3Snapshot, sourcePathsFor, currentMw3ArchiveIdentity } = await load('mw3-reviewed-snapshot.mjs');
  const { decodeMw3Archive, restoreMw3ArchiveBytes } = await load('mw3-reviewed-archive.mjs');
  const { clearMw3ContractCache } = await load('mw3-artifacts.mjs');
  const { discoverMw3SavedInventory, parseMw3ApprovedRegistry, assertMw3CommittedFile } = await load('mw3-reviewed-restore.mjs');
  const { prepareMw3SnapshotDeliveries, mw3DeliveryPins, assertMw3IndependentReceipt, buildMw3DeliverySql } = await load('mw3-reviewed-delivery.mjs');
  const inventory = discoverMw3SavedInventory(repo);
  assert.equal(inventory.length, 16);
  const registry = parseMw3ApprovedRegistry(fs.readFileSync(path.join(repo, 'apps/shared/mw3-approved.ts')));
  assert.equal(registry.length, 32);
  const preserved = [];
  for (const entry of inventory) {
    let snapshot, verified, deliveries, decoded;
    try {
      console.log(`BEGIN ${entry.slug}`);
      assert.ok(entry.sql, 'The saved SQL must be present');
      const oldBytes = fs.readFileSync(path.join(repo, entry.manifest));
      const old = JSON.parse(oldBytes);
      const receiptBytes = fs.readFileSync(path.join(repo, entry.receipt));
      const receipt = JSON.parse(receiptBytes);
      const archive = fs.readFileSync(path.join(repo, entry.archive));
      const sql = fs.readFileSync(path.join(repo, entry.sql));
      for (const [p, b, lfs] of [[entry.manifest, oldBytes, false], [entry.receipt, receiptBytes, false], [entry.archive, archive, true], [entry.sql, sql, false]]) {
        assertMw3CommittedFile(repo, p, b, { lfs });
        preserved.push(record(p));
      }
      // Existing source approval must remain stale for this unrenewed PR head.
      assert.throws(() => verifyMw3Snapshot(oldBytes, archive), /source\/input (dependency inventory differs|bytes changed)|source tree/i);
      // Materialize exact decoded archive bodies into ignored diagnostic paths only.
      // This is NOT an accepted restore: no source or receipt gate is bypassed or changed.
      const restorePaths = old.artifacts.map(row => row.path);
      assert.ok(restorePaths.every(path => path.startsWith('apps/frontend/.local/postflop-ai/mw3/')), 'Only the reviewed ignored MW3 artifact directory may be materialized');
      assert.equal(git('ls-files', '--', ...restorePaths), '', 'Refuse to write any tracked repository path');
      const ignored = execFileSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {
        cwd: repo, input: `${restorePaths.join('\0')}\0`, encoding: 'utf8', maxBuffer: 1024 * 1024,
      }).split('\0').filter(Boolean).sort();
      assert.deepEqual(ignored, [...restorePaths].sort(), 'Every restore destination must already be ignored');
      decoded = decodeMw3Archive(archive, old);
      const materialized = restoreMw3ArchiveBytes(repo, old, decoded);
      assert.equal(materialized.files, 7);
      for (const row of old.artifacts) assert.deepEqual(record(row.path), { path: row.path, bytes: row.bytes, sha256: row.sha256 });
      decoded = null;
      snapshot = collectMw3Snapshot(old.spot.id);
      assert.equal(snapshot.manifest.source_tree, TREE);
      const reviewedDelta = sourceReport.mw3.find(row => row.spot === old.spot.id);
      assert.ok(reviewedDelta, `No immutable source-context delta was preserved for ${old.spot.id}`);
      const sourceDelta = assertSourceDelta(`MW3 ${old.spot.id}`, old.sources, snapshot.manifest.sources, reviewedDelta);
      assert.equal(snapshot.manifest.sources.some(row => row.path.startsWith('.github/') || row.path.startsWith('tools/')), false,
        'The review/CI harness must stay outside the numerical source graph');
      // Exact comparison including gzip byte 9. No normalization, offset exception or repackaging.
      assert.ok(snapshot.compressed.equals(archive), `Canonical archive mismatch: ${entry.slug}; original=${hash(archive)} collected=${hash(snapshot.compressed)}`);
      for (const key of ['spot', 'inputs', 'artifacts', 'archive']) assert.deepEqual(snapshot.manifest[key], old[key]);
      assert.deepEqual(snapshot.evidence, receipt.evidence);
      assert.deepEqual(snapshot.evidence.limitations, receipt.accepted_limitations);
      assert.equal(snapshot.evidence.limitations.length, 7);
      assert.deepEqual(sourcePathsFor(currentMw3ArchiveIdentity(old.spot.id)), snapshot.manifest.sources.map(row => row.path));
      verified = verifyMw3Snapshot(snapshot.manifestBytes, archive);
      assert.deepEqual(verified.evidence, receipt.evidence);
      verified = null;
      deliveries = await prepareMw3SnapshotDeliveries(snapshot);
      const pins = mw3DeliveryPins(snapshot, deliveries);
      assert.equal(pins.length, 2, `Expected two reserved delivery pins for ${entry.slug}`);
      assert.deepEqual(pins, receipt.deliveries);
      for (const pin of pins) assert.deepEqual(pin, registry.find(row => row.spotId === pin.spotId && row.stage === pin.stage));
      const historical = { ...snapshot, manifest: old, manifestBytes: oldBytes };
      // Validate historical approval only against its historical manifest; never issue new approval.
      assertMw3IndependentReceipt(receipt, historical, deliveries);
      assert.equal(buildMw3DeliverySql(historical, receipt, deliveries), sql.toString());
      assert.throws(() => assertMw3IndependentReceipt(receipt, snapshot, deliveries), /Separate matching independent/);
      const manifestName = `diagnostic-${entry.slug}.manifest.json`;
      fs.writeFileSync(path.join(out, manifestName), snapshot.manifestBytes);
      result.subjects.push({
        spot: old.spot.id, canonical_archive_exact: true, archive: old.archive,
        sources: snapshot.manifest.sources, source_delta: sourceDelta, inputs: snapshot.manifest.inputs, artifacts: old.artifacts,
        evidence: snapshot.evidence, pins, historical_receipt: record(entry.receipt), historical_sql: record(entry.sql),
        current_manifest: { path: manifestName, bytes: snapshot.manifestBytes.length, sha256: hash(snapshot.manifestBytes) },
        historical_author_model: receipt.author_model, historical_author_task: receipt.author_task,
        historical_reviewer_model: receipt.reviewer_model, historical_reviewer_task: receipt.reviewer_task,
      });
      put('result.json', result);
      console.log(`PASS exact canonical archive and official current-source verification: ${old.spot.id}`);
    } finally { snapshot = null; verified = null; deliveries = null; decoded = null; clearMw3ContractCache(); global.gc(); }
  }
  for (const item of preserved) assert.deepEqual(record(item.path), item);
  assert.equal(git('rev-parse', 'HEAD^{tree}'), TREE);
  assert.equal(git('status', '--porcelain'), '');
  result.raw_files = result.subjects.reduce((sum, s) => sum + s.artifacts.length, 0);
  result.raw_bytes = result.subjects.flatMap(s => s.artifacts).reduce((sum, row) => sum + row.bytes, 0);
  result.joint_warnings = result.subjects.reduce((sum, s) => sum + s.evidence.jointWarningCount, 0);
  result.delivery_pins = result.subjects.reduce((sum, s) => sum + s.pins.length, 0);
  assert.equal(result.raw_files, 112); assert.equal(result.raw_bytes, 235515283); assert.equal(result.joint_warnings, 561);
  assert.equal(result.delivery_pins, 32);
  result.status = 'PASS_LINUX_EXACT_ARCHIVE_DIAGNOSTIC_ONLY';
  result.remaining_blocker = 'This diagnostic issues no approval or receipt. Ordinary source-identity gates remain stale until the separately authorized source-only renewal is complete and all official verifiers pass.';
  result.original_files_preserved = preserved;
  put('result.json', result);
  console.log(JSON.stringify({ status: result.status, source_commit: COMMIT, source_tree: TREE, source_context_report_sha256: REPORT_SHA256,
    subjects: 16, raw_files: 112, raw_bytes: 235515283, warnings: 561, pins: result.delivery_pins, receipt_issued: false, installable_acceptance: false }));
} catch (error) {
  result.status = 'FAIL'; result.error = String(error?.stack ?? error); put('result.json', result); throw error;
}
