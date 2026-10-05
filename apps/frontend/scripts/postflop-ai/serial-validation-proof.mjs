// LOCAL-only verifier for serial-validation.py. Never generates or approves policies.
// The orchestration boundary deliberately reuses the hardened official proof gates.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { AUDIT_REPOSITORY, auditFileRecord, captureAuditIdentity, captureSourceGraph, identityHash } from './audit-identity.mjs';
import { artifactPaths, boards, config, loadInputs } from './inputs.mjs';
import { loadCandidate, loadLaterCandidate, sha } from './generate.mjs';
import { POSTFLOP_SPOTS } from './spots.ts';
import { isFreshSimulationReport } from './publish-d1.mjs';
import { SIMULATION_VERSION } from './simulation.mjs';
import { defenceVersionFor } from './defence.ts';
import { allBoardIdentity, writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
import { packageAllBoardCompanion } from './package-all-board-companion.mjs';
import { summaryPathFor } from './all-board-companion.mjs';
import { assertAuditEvidence, reviewedSourcePaths } from './reviewed-postflop.mjs';
import { ARTIFACT_PREFIX, fileRecord, readSafeFile, safeRelativePath, sha256 } from './reviewed-postflop-archive.mjs';

const ROOTS = ['cli.mjs', 'board-worker.mjs', 'audit-all-boards.mjs', 'package-all-board-companion.mjs', 'serial-validation-proof.mjs']
  .map(name => `apps/frontend/scripts/postflop-ai/${name}`);
const RUNNER = 'apps/frontend/scripts/postflop-ai/serial-validation.py';
const frontend = fileURLToPath(new URL('../../', import.meta.url));
const fail = message => { throw new Error(message); };
const localPath = absolute => relative(AUDIT_REPOSITORY, absolute).replaceAll('\\', '/');
const json = path => JSON.parse(readSafeFile(AUDIT_REPOSITORY, path));
const record = path => fileRecord(AUDIT_REPOSITORY, path);

function pair(id) {
  if (!/^[A-Za-z0-9_]{1,200}$/.test(id ?? '')) fail('Unsafe spot ID');
  const spot = POSTFLOP_SPOTS.find(item => item.id === id);
  if (!spot?.history || !spot.reachable || !['A', 'B'].includes(spot.stage)) fail('Only reachable new HU-after-multiway IDs are allowed; legacy excluded');
  // Check paths before existing loaders, which intentionally serve other consumers too.
  const paths = artifactPaths(spot);
  const artifacts = Object.fromEntries(['candidate', 'laterCandidate'].map(kind => [kind, record(localPath(paths[kind]))]));
  const inputs = loadInputs(id), flop = loadCandidate(inputs), later = loadLaterCandidate(inputs, flop);
  for (const candidate of [flop, later]) {
    if (!candidate || candidate.metadata?.model !== 'gpt-6-astra' || candidate.metadata.reasoning_effort !== 'xhigh' ||
        candidate.metadata.spot !== id || candidate.metadata.config_version !== config.version || candidate.metadata.kind !== 'ai_estimate_not_gto') {
      fail('Both existing policies must be fresh explicit gpt-6-astra/xhigh candidates for this spot');
    }
  }
  return { inputs, flop, later, value: { id, slug: spot.slug, stage: spot.stage, reach: spot.reach,
    defence_version: defenceVersionFor(inputs),
    source_fingerprint: inputs.fingerprint, flop_policy_hash: flop.metadata.policy_hash, later_policy_hash: later.metadata.policy_hash,
    artifacts, report_path: localPath(paths.report), all_board_identity_hash: sha(allBoardIdentity(inputs, flop, later, 'all')) } };
}

// Read-only dependency capture is independent of locally activated policy pairs.
// Fixtures and handoffs copy these exact bytes before invoking the unchanged gates.
export function snapshotDependencies() {
  const audit_identity = captureAuditIdentity();
  const inputPaths = new Set(audit_identity.inputs.map(item => item.path));
  const graph = captureSourceGraph({ roots: ROOTS });
  const sourceMap = new Map([...graph.filter(item => !inputPaths.has(item.path)), auditFileRecord(AUDIT_REPOSITORY, RUNNER)]
    .map(item => [item.path, item]));
  const sources = [...sourceMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  // Packaging-only roots/docs are copied and pinned separately. Updating an
  // independent-review document must not invalidate prior numerical policies.
  const handoff_files = reviewedSourcePaths().filter(path => !sourceMap.has(path))
    .map(path => auditFileRecord(AUDIT_REPOSITORY, path));
  return { sources, inputs: audit_identity.inputs, audit_identity, handoff_files };
}

export function snapshot(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 407 || new Set(ids).size !== ids.length) fail('Explicit unique bounded spot IDs required');
  if (config.samples_per_board_profile_seat !== 10000 || boards().length !== 12) fail('Full configured 10,000 samples / 12 representative boards required');
  const dependencies = snapshotDependencies();
  const spots = ids.map(id => pair(id).value);
  return { schema_version: 1, kind: 'local-serial-validation-pin', ...dependencies,
    config, simulation_version: SIMULATION_VERSION, defence_version: spots[0].defence_version,
    spots };
}

function current(request) {
  const expected = request.pin, id = request.id;
  if (expected?.schema_version !== 1 || expected.kind !== 'local-serial-validation-pin') fail('Saved full pin required');
  const next = snapshot([id]), pinned = expected.spots.find(item => item.id === id);
  if (!pinned || !isDeepStrictEqual(next.spots[0], pinned) ||
      ['sources', 'inputs', 'audit_identity', 'config', 'simulation_version', 'defence_version'].some(key => !isDeepStrictEqual(expected[key], next[key]))) {
    fail('Source/input/config/policy identity changed');
  }
  const loaded = pair(id), reportBytes = readSafeFile(AUDIT_REPOSITORY, pinned.report_path);
  const report = JSON.parse(reportBytes);
  if (!isFreshSimulationReport(loaded.inputs, loaded.flop, loaded.later, report)) fail('Report is stale/incomplete; never overwrite it');
  return { ...loaded, pinned, report, reportBytes };
}

function actualRun(request, marker) {
  const receipt = request.receipt;
  if (receipt?.schema_version !== 1 || receipt.exit_code !== 0 || receipt.error || !Array.isArray(receipt.command) ||
      !receipt.command.includes(marker) || !receipt.command.includes(request.id) ||
      !Number.isFinite(Date.parse(receipt.started_at)) || !Number.isFinite(Date.parse(receipt.completed_at)) ||
      Date.parse(receipt.completed_at) < Date.parse(receipt.started_at)) fail('Actual successful command receipt required');
  const logBytes = readSafeFile(AUDIT_REPOSITORY, receipt.log.path, 32 * 1024 * 1024);
  if (sha256(logBytes) !== receipt.log.sha256 || receipt.command_sha256 !== sha256(JSON.stringify(receipt.command))) fail('Actual command/log hash differs');
  return { receipt, logBytes, logText: logBytes.toString('utf8') };
}

function proofContext(loaded, proof, evidence = []) {
  const artifacts = ['candidate', 'laterCandidate'].map(kind => ({ ...loaded.pinned.artifacts[kind], kind, spot: loaded.pinned.id }));
  artifacts.push({ ...record(loaded.pinned.report_path), kind: 'report', spot: loaded.pinned.id });
  const files = new Map(artifacts.map(item => [item.path, readSafeFile(AUDIT_REPOSITORY, item.path)]));
  for (const path of evidence) files.set(path, readSafeFile(AUDIT_REPOSITORY, path));
  const spot = { id: loaded.pinned.id, evidence, identity: { current_source_fingerprint: loaded.inputs.fingerprint,
    flop_policy_hash: loaded.flop.metadata.policy_hash, later_policy_hash: loaded.later.metadata.policy_hash } };
  return { spot, files, manifest: { artifacts, sources: proof.pin.sources, inputs: proof.pin.inputs } };
}

export function verifyReport(request) {
  const loaded = current(request), actual = actualRun(request, 'scripts/postflop-ai/cli.mjs');
  if (!actual.receipt.command.includes('simulate') || !actual.logText.includes(
    `${loaded.report.results.length} board/profile/seat comparisons, 10000 paired deals each;`)) fail('Actual full simulation completion missing');
  return { report: record(loaded.pinned.report_path), comparisons: loaded.report.results.length, samples: 10000 };
}

export function verifyReplay(request) {
  const loaded = current(request), actual = actualRun(request, 'scripts/postflop-ai/cli.mjs');
  if (!actual.receipt.command.includes('audit') || actual.receipt.command.includes('simulate')) fail('Replay must be its own fresh official audit command');
  const matches = [...actual.logText.matchAll(/Execution evidence: (apps\/frontend\/\.local\/postflop-ai\/audit-evidence\/[A-Za-z0-9_-]+\.json)/g)];
  if (matches.length !== 1 || !matches[0][1].startsWith(`${ARTIFACT_PREFIX}audit-evidence/${request.id}-replay-`)) fail('One actual spot-specific replay proof required');
  const path = matches[0][1], proof = json(path), context = proofContext(loaded, request);
  assertAuditEvidence(proof, context.spot, 'representative', context.manifest, context.files, { root: AUDIT_REPOSITORY });
  if (Date.parse(proof.started_at) < Date.parse(actual.receipt.started_at) || Date.parse(proof.completed_at) > Date.parse(actual.receipt.completed_at) ||
      !actual.logText.includes(proof.log.text.trim())) fail('Replay proof does not belong to the recorded command');
  return { proof: record(path), report: record(loaded.pinned.report_path), comparisons: proof.comparisons, warnings: proof.warnings };
}

export function verifyAllBoards(request) {
  const loaded = current(request), actual = actualRun(request, 'scripts/postflop-ai/audit-all-boards.mjs');
  const command = actual.receipt.command;
  if (command.join(' ').includes('--street all --workers 1') === false) fail('Full all-street single-worker command required');
  const identity = allBoardIdentity(loaded.inputs, loaded.flop, loaded.later, 'all'), hash = sha(identity);
  const headers = [...actual.logText.matchAll(new RegExp(`${request.id}: resume (\\d+)/1755 checked boards; identity ([a-f0-9]{64})`, 'g'))];
  if (headers.length !== 1 || headers[0][2] !== hash) fail('Actual full-identity all-board command header missing');
  const resultPath = summaryPathFor(request.id, hash), resultBytes = readSafeFile(AUDIT_REPOSITORY, resultPath), result = JSON.parse(resultBytes);
  // Reuses all official row hashes, canonical ordering, exact live-range support,
  // fixed seeded coverage and aggregate verification. A summary alone is insufficient.
  const companion = packageAllBoardCompanion(request.id);
  const artifact_sha256 = Object.fromEntries(['candidate', 'laterCandidate'].map(kind => [kind, loaded.pinned.artifacts[kind].sha256]));
  artifact_sha256.report = sha256(loaded.reportBytes);
  const code = identity.code.map(item => ({ path: localPath(resolve(frontend, 'scripts/postflop-ai', item.path)), sha256: item.sha256 }));
  const proof = { schema_version: 1, status: 'pass', exit_code: 0, spot: request.id,
    scope: 'Actual LOCAL-only serial numerical audit; independent review and publication approval remain separate',
    command: command.join(' '), started_at: actual.receipt.started_at, completed_at: actual.receipt.completed_at,
    source_fingerprint: loaded.inputs.fingerprint, flop_policy_hash: loaded.flop.metadata.policy_hash,
    later_policy_hash: loaded.later.metadata.policy_hash, artifact_sha256, identity_hash: hash, code, code_identity: sha(code),
    log: { path: actual.receipt.log.path, text: actual.logText, sha256: sha256(actual.logBytes) },
    street: 'all', canonical_flops: 1755, evaluated_boards: result.evaluated_boards, proven_unreachable: result.unreachable,
    later_coverage: result.later_coverage, errors: result.errors, clean: result.clean,
    warnings: result.findings.filter(row => row.key.includes(' warn ')).reduce((total, row) => total + row.boards, 0),
    warning_kinds: result.findings.length, result: { path: resultPath, sha256: sha256(resultBytes) },
    checkpoint_companion: { path: companion.path, sha256: companion.sha256 } };
  const evidence = [resultPath, companion.path], context = proofContext(loaded, request, evidence);
  assertAuditEvidence(proof, context.spot, 'all-boards', context.manifest, context.files, { root: AUDIT_REPOSITORY });
  const path = request.proof_path;
  if (!safeRelativePath(path) || !new RegExp(`^${ARTIFACT_PREFIX.replaceAll('.', '\\.')}audit-evidence/${request.id}--${hash}-serial-[A-Za-z0-9_-]+-all-boards\\.json$`).test(path)) fail('Exact run-specific all-board proof path required');
  writeImmutableAllBoardOutput(resolve(AUDIT_REPOSITORY, path), Buffer.from(JSON.stringify(proof, null, 2) + '\n'));
  return { proof: record(path), summary: record(resultPath), companion: record(companion.path), boards: 1755,
    evaluated_boards: result.evaluated_boards, unreachable: result.unreachable, errors: result.errors, warnings: proof.warnings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, ...extra] = process.argv.slice(2);
  if (extra.length || !['snapshot', 'report', 'replay', 'all-boards'].includes(operation)) fail('Usage: serial-validation-proof.mjs snapshot|report|replay|all-boards < bounded JSON stdin');
  const body = readFileSync(0);
  if (body.length > 8 * 1024 * 1024) fail('Request exceeds bounded manifest size');
  const request = JSON.parse(body);
  const result = operation === 'snapshot' ? snapshot(request.ids) : ({ report: verifyReport, replay: verifyReplay, 'all-boards': verifyAllBoards })[operation](request);
  console.log(`SERIAL_RESULT ${JSON.stringify(result)}`);
}
